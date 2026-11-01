import path from "node:path";
import { mkdir } from "node:fs/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { ForbiddenError, roleOf } from "./roles.js";
import { NotFoundError } from "./services/settings.js";
import { catalogRoutes } from "./routes/catalog.js";
import { pimRoutes } from "./routes/pim.js";
import { pricingRoutes } from "./routes/pricing.js";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: true,
    // §57 — the role travels in this header.
    allowedHeaders: ["content-type", "x-role"],
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  await mkdir(UPLOAD_DIR, { recursive: true });
  await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: "/uploads/" });

  app.get("/api/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, role: "see X-Role header" };
  });

  /** Reports which role the current request is treated as (§57). */
  app.get("/api/whoami", async (request) => ({ role: roleOf(request) }));

  /**
   * Turn integrity violations into readable Hebrew rather than a 500.
   *
   * Prisma surfaces a constraint Postgres rejected as PrismaClientUnknownRequestError
   * with the SQLSTATE and the constraint name buried in the message, so the whole
   * error is flattened and searched. Every constraint below guards a SPEC rule, and
   * tripping one is a data problem the user can act on — not a server fault.
   */
  const CONSTRAINT_MESSAGES: Array<[string, string]> = [
    ["quantity_tiers_no_overlap",
     "מדרגות הכמות חופפות. הכמות שצוינה שייכת לשתי מדרגות. המדרגה האחרונה צריכה להתחיל ב-301 ולא ב-300 (§24)."],
    ["quantity_tiers_range_valid",
     "טווח מדרגה לא תקין: הכמות המינימלית חייבת להיות 1 ומעלה, והמקסימלית לא קטנה ממנה (§24)."],
    ["quantity_tiers_price_non_negative", "מחיר במדרגת כמות אינו יכול להיות שלילי (§23)."],
    ["price_list_versions_single_active", "יכולה להיות רק גרסת מחירון פעילה אחת (§55)."],
    ["smp_one_open_row_per_tier",
     "קיים כבר מחיר פעיל לאותו ספק, חומר ומדרגה. שינוי מחיר נעשה על ידי הוספת מחיר חדש שסוגר את הקודם (§17)."],
    ["smp_quantity_range_valid", "טווח מדרגת מחיר הספק אינו תקין (§13)."],
    ["smp_unit_price_non_negative", "מחיר רכש אינו יכול להיות שלילי (§12)."],
    ["smp_lot_positive", "כמות הרכש לפריסת הובלה חייבת להיות גדולה מאפס (§15)."],
    ["smp_validity_window_valid", "תאריך סיום התוקף חייב להיות אחרי תאריך ההתחלה (§17)."],
    ["product_sizes_positive_dimensions", "מידות הגודל חייבות להיות גדולות מאפס (§22)."],
    ["products_size_envelope_valid", "מידת המקסימום אינה יכולה להיות קטנה ממידת המינימום (§79)."],
    ["products_target_margin_range", "יעד התרומה חייב להיות בין 0 ל-100 אחוז (§19)."],
    ["suppliers_quality_rating_range", "דירוג איכות הספק חייב להיות בין 1 ל-5 (§80)."],
    ["business_settings_positive_inputs",
     "הגדרות העסק אינן תקינות: המחזור, השכר, המקדמים וכמות הרכש חייבים להיות חיוביים (§5)."],
    ["business_settings_vat_rate_sane", "שיעור מע\"מ לא תקין (§5, §32)."],
    ["business_settings_rounding_range", "מספר ספרות העיגול חייב להיות בין 0 ל-6 (§59)."],
    ["business_settings_singleton", "קיימת שורת הגדרות עסק אחת בלבד (§4)."],
    ["additional_cost_items_non_negative", "עלות נוספת אינה יכולה להיות שלילית (§37)."],
    ["attribute_values_has_value", "לא הוזן ערך לתכונה (§77)."],
    ["media_assets_single_primary", "קיים כבר קובץ ראשי מסוג זה לרשומה הזו (§78)."],
    ["media_assets_size_non_negative", "גודל קובץ לא תקין (§78)."],
    ["product_categories_no_self_parent", "קטגוריה אינה יכולה להיות ההורה של עצמה (§76)."],
  ];

  function constraintMessage(haystack: string): string | null {
    for (const [name, message] of CONSTRAINT_MESSAGES) {
      if (haystack.includes(name)) return message;
    }
    return null;
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "הנתונים שנשלחו אינם תקינים.",
        details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (error instanceof ForbiddenError) {
      return reply.code(403).send({ error: error.message });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: error.message });
    }

    // Flatten the error so a constraint name is found wherever Prisma put it.
    const haystack = [
      error.message,
      (error as { meta?: unknown }).meta === undefined ? "" : JSON.stringify((error as { meta?: unknown }).meta),
      String((error as { cause?: unknown }).cause ?? ""),
    ].join(" ");

    const friendly = constraintMessage(haystack);
    if (friendly !== null) {
      // 23P01 exclusion, 23505 unique, 23514 check — all "your data conflicts".
      const isConflict = haystack.includes("23P01") || haystack.includes("23505");
      return reply.code(isConflict ? 409 : 400).send({ error: friendly });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply.code(409).send({ error: "קיימת כבר רשומה עם הערך הזה.", meta: error.meta });
      }
      if (error.code === "P2003") {
        return reply.code(400).send({ error: "רשומה מקושרת לא נמצאה.", meta: error.meta });
      }
      if (error.code === "P2025") {
        return reply.code(404).send({ error: "הרשומה לא נמצאה.", meta: error.meta });
      }
    }

    // A check violation we have not named yet is still the client's data, not a fault.
    if (haystack.includes("23514")) {
      return reply.code(400).send({ error: "הנתונים אינם עומדים באילוץ תקינות של המערכת." });
    }

    request.log.error({ err: error }, "unhandled error");
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: status >= 500 ? "שגיאת שרת." : error.message });
  });

  await app.register(catalogRoutes, { prefix: "/api" });
  await app.register(pimRoutes, { prefix: "/api" });
  await app.register(pricingRoutes, { prefix: "/api" });

  return app;
}

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  buildServer()
    .then((app) => app.listen({ port, host: "0.0.0.0" }))
    .then((address) => {
      console.log(`API listening on ${address}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
