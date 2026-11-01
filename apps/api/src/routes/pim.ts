import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
// Brings in the request.file() type augmentation for §78 uploads.
import "@fastify/multipart";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin, roleOf } from "../roles.js";
import { serialize } from "../serialize.js";
import { recordSyncEventStandalone } from "../services/sync.js";
import { loadAttributes } from "./catalog.js";

const optDec = z
  .union([z.string(), z.number(), z.null()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v)));
const dec = z.union([z.string(), z.number()]).transform((v) => new Prisma.Decimal(v));

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
]);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function pimRoutes(app: FastifyInstance): Promise<void> {
  // ───────────────────── §76 categories ─────────────────────

  app.get("/categories", async (_request, reply) => {
    const rows = await prisma.productCategory.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    // Return the tree, not a flat list, so the UI does not have to rebuild it.
    const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as unknown[] }]));
    const roots: unknown[] = [];
    for (const row of byId.values()) {
      if (row.parentId !== null && byId.has(row.parentId)) {
        (byId.get(row.parentId)!.children as unknown[]).push(row);
      } else {
        roots.push(row);
      }
    }
    return reply.send(serialize(roots));
  });

  app.post("/categories", async (request, reply) => {
    requireAdmin(request, reply);
    const body = z
      .object({
        name: z.string().min(1),
        parentId: z.string().min(1).nullish(),
        description: z.string().nullish(),
        sortOrder: z.coerce.number().int().optional(),
      })
      .parse(request.body);
    return reply.code(201).send(serialize(await prisma.productCategory.create({ data: body })));
  });

  // ───────────────────── §77 attribute dictionary ─────────────────────

  /**
   * §77 — the dictionary itself is editable data. Adding a spec for a new material
   * type happens here, not in a migration, which is what makes §72.25 and §73 true.
   */
  app.get("/attribute-definitions", async (request, reply) => {
    const query = z
      .object({ appliesTo: z.enum(["PRODUCT", "MATERIAL", "SUPPLIER"]).optional() })
      .parse(request.query);
    const rows = await prisma.attributeDefinition.findMany({
      where: { active: true, ...(query.appliesTo === undefined ? {} : { appliesTo: query.appliesTo }) },
      orderBy: [{ attributeGroup: "asc" }, { sortOrder: "asc" }],
    });
    return reply.send(serialize(rows));
  });

  app.post("/attribute-definitions", async (request, reply) => {
    requireAdmin(request, reply);
    const body = z
      .object({
        key: z.string().min(1).regex(/^[a-z0-9_]+$/, "המפתח חייב להיות באנגלית קטנה, ספרות וקו תחתון"),
        label: z.string().min(1),
        attributeGroup: z.enum(["TECHNICAL", "PRINT", "FINISHING", "FINANCIAL", "MARKETING", "LOGISTICS"]),
        dataType: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "BOOLEAN", "ENUM", "DATE"]),
        unit: z.string().nullish(),
        enumOptions: z.array(z.string()).optional(),
        appliesTo: z.enum(["PRODUCT", "MATERIAL", "SUPPLIER"]),
        isRequired: z.boolean().optional(),
        isCustomerVisible: z.boolean().optional(),
        sortOrder: z.coerce.number().int().optional(),
        description: z.string().nullish(),
      })
      .parse(request.body);
    return reply.code(201).send(serialize(await prisma.attributeDefinition.create({ data: body })));
  });

  /** §77 — set a value, writing it into the column that matches its declared type. */
  app.put("/attribute-values", async (request, reply) => {
    requireAdmin(request, reply);
    const body = z
      .object({
        definitionId: z.string().min(1),
        entityType: z.enum(["PRODUCT", "MATERIAL", "SUPPLIER"]),
        entityId: z.string().min(1),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      })
      .parse(request.body);

    const definition = await prisma.attributeDefinition.findUnique({ where: { id: body.definitionId } });
    if (definition === null) return reply.code(404).send({ error: "התכונה לא נמצאה." });
    if (definition.appliesTo !== body.entityType) {
      return reply
        .code(400)
        .send({ error: `התכונה "${definition.label}" חלה על ${definition.appliesTo} ולא על ${body.entityType}.` });
    }

    if (body.value === null) {
      await prisma.attributeValue.deleteMany({
        where: { definitionId: body.definitionId, entityType: body.entityType, entityId: body.entityId },
      });
      return reply.code(204).send();
    }

    // A number stays a number in the database (§77), so it remains filterable.
    const data: Prisma.AttributeValueUncheckedCreateInput = {
      definitionId: body.definitionId,
      entityType: body.entityType,
      entityId: body.entityId,
      valueText: null, valueNumber: null, valueBoolean: null, valueDate: null,
    };

    switch (definition.dataType) {
      case "NUMBER": {
        const n = Number(body.value);
        if (!Number.isFinite(n)) {
          return reply.code(400).send({ error: `התכונה "${definition.label}" מחייבת מספר.` });
        }
        data.valueNumber = new Prisma.Decimal(String(body.value));
        break;
      }
      case "BOOLEAN":
        data.valueBoolean = body.value === true || body.value === "true";
        break;
      case "DATE":
        data.valueDate = new Date(String(body.value));
        break;
      case "ENUM": {
        const v = String(body.value);
        if (definition.enumOptions.length > 0 && !definition.enumOptions.includes(v)) {
          return reply.code(400).send({
            error: `"${v}" אינו מהאפשרויות של "${definition.label}": ${definition.enumOptions.join(", ")}.`,
          });
        }
        data.valueText = v;
        break;
      }
      default:
        data.valueText = String(body.value);
    }

    const saved = await prisma.attributeValue.upsert({
      where: {
        definitionId_entityType_entityId: {
          definitionId: body.definitionId, entityType: body.entityType, entityId: body.entityId,
        },
      },
      create: data,
      update: {
        valueText: data.valueText ?? null,
        valueNumber: data.valueNumber ?? null,
        valueBoolean: data.valueBoolean ?? null,
        valueDate: data.valueDate ?? null,
      },
    });

    await recordSyncEventStandalone({
      entityType: body.entityType, entityId: body.entityId, changeType: "UPDATED",
      payload: { attribute: definition.key },
    });
    return reply.send(serialize(saved));
  });

  // ───────────────────── §19, §79 products ─────────────────────

  app.get("/products", async (request, reply) => {
    const query = z
      .object({
        categoryId: z.string().min(1).optional(),
        lifecycleStatus: z.enum(["DRAFT", "ACTIVE", "DISCONTINUED"]).optional(),
        tag: z.string().min(1).optional(),
        all: z.string().optional(),
      })
      .parse(request.query);

    const rows = await prisma.product.findMany({
      where: {
        ...(query.all === "true" ? {} : { active: true }),
        ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
        ...(query.lifecycleStatus === undefined ? {} : { lifecycleStatus: query.lifecycleStatus }),
        ...(query.tag === undefined ? {} : { tags: { some: { tag: { name: query.tag } } } }),
      },
      include: {
        category: { select: { id: true, name: true } },
        material: { select: { id: true, name: true, pricingUnit: true } },
        tags: { include: { tag: true } },
        _count: { select: { sizes: true, quantityTiers: true } },
      },
      orderBy: { name: "asc" },
    });

    // Attach each product's primary image so a catalog grid needs one request.
    const images = await prisma.mediaAsset.findMany({
      where: { entityType: "PRODUCT", entityId: { in: rows.map((r) => r.id) }, kind: "IMAGE", isPrimary: true },
    });
    const imageByProduct = new Map(images.map((i) => [i.entityId, i]));

    return reply.send(
      serialize(rows.map((r) => ({ ...r, primaryImage: imageByProduct.get(r.id) ?? null }))),
    );
  });

  /**
   * §79 — the full product card: technical, financial and marketing in one place.
   *
   * The financial tab's live figures (current purchase cost, contribution per tier,
   * recommended price) are deliberately NOT stored here. They are served by the
   * engine through /calculate, so there is one source for every number (§58).
   */
  app.get("/products/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const row = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        material: { include: { catalogEntries: { include: { supplier: { select: { id: true, name: true } } } } } },
        sizes: { orderBy: { sortOrder: "asc" } },
        additionalCosts: true,
        tags: { include: { tag: true } },
        publications: { include: { channel: true } },
      },
    });
    if (row === null) return reply.code(404).send({ error: "המוצר לא נמצא." });

    const [attributes, media] = await Promise.all([
      loadAttributes("PRODUCT", id),
      prisma.mediaAsset.findMany({ where: { entityType: "PRODUCT", entityId: id }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] }),
    ]);

    const payload = { ...row, attributes, media };
    // §57 — a USER may not see what the product costs us.
    if (roleOf(request) !== "ADMIN") {
      const { additionalCosts: _ac, material: _m, ...rest } = payload;
      return reply.send(
        serialize({
          ...rest,
          setupFee: undefined, handlingCostPerUnit: undefined, printingCostPerSqm: undefined,
          cuttingCostPerUnit: undefined, cuttingHoursPerUnit: undefined,
          laborHoursPerUnit: undefined, laborFixedCost: undefined, targetMargin: undefined,
          attributes: attributes.filter((a) => a.group !== "FINANCIAL"),
        }),
      );
    }
    return reply.send(serialize(payload));
  });

  const productBody = z.object({
    name: z.string().min(1),
    materialId: z.string().min(1).nullish(),
    pricingMethod: z.enum(["SQM", "LINEAR_METER", "UNIT", "KG", "HOUR", "CUSTOM"]),
    laborMethod: z.enum(["PERCENT", "HOURLY", "COMBINED"]).optional(),
    basePrice: optDec,
    targetMargin: optDec,
    minimumOrder: optDec,
    setupFee: dec.optional(),
    handlingCostPerUnit: dec.optional(),
    printingCostPerSqm: dec.optional(),
    cuttingCostPerUnit: dec.optional(),
    cuttingHoursPerUnit: dec.optional(),
    laborHoursPerUnit: dec.optional(),
    laborFixedCost: dec.optional(),
    sku: z.string().nullish(),
    displayName: z.string().nullish(),
    categoryId: z.string().min(1).nullish(),
    lifecycleStatus: z.enum(["DRAFT", "ACTIVE", "DISCONTINUED"]).optional(),
    minWidthCm: optDec, maxWidthCm: optDec, minHeightCm: optDec, maxHeightCm: optDec,
    isOutdoor: z.boolean().optional(),
    warrantyMonths: z.coerce.number().int().min(0).nullish(),
    leadTimeDays: z.coerce.number().int().min(0).nullish(),
    fileRequirements: z.string().nullish(),
    careInstructions: z.string().nullish(),
    productionNotes: z.string().nullish(),
    accountingCode: z.string().nullish(),
    costCenter: z.string().nullish(),
    vatCategory: z.string().nullish(),
    shortDescription: z.string().nullish(),
    longDescription: z.string().nullish(),
    sellingPoints: z.array(z.string()).optional(),
    useCases: z.string().nullish(),
    seoSlug: z.string().nullish(),
    seoTitle: z.string().nullish(),
    seoDescription: z.string().nullish(),
    active: z.boolean().optional(),
    notes: z.string().nullish(),
  });

  app.post("/products", async (request, reply) => {
    requireAdmin(request, reply);
    const created = await prisma.product.create({ data: productBody.parse(request.body) });
    await recordSyncEventStandalone({
      entityType: "PRODUCT", entityId: created.id, changeType: "CREATED", payload: { name: created.name },
    });
    return reply.code(201).send(serialize(created));
  });

  app.put("/products/:id", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const updated = await prisma.product.update({
      where: { id },
      data: productBody.partial().parse(request.body),
    });
    // §81 — the system is the source of truth, so any edit queues a channel push.
    await recordSyncEventStandalone({
      entityType: "PRODUCT", entityId: id, changeType: "UPDATED", payload: { name: updated.name },
    });
    return reply.send(serialize(updated));
  });

  // ───────────────────── §21, §28 sizes ─────────────────────

  app.get("/products/:id/sizes", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const rows = await prisma.productSize.findMany({
      where: { productId: id, active: true },
      orderBy: { sortOrder: "asc" },
    });
    // §22 — area is derived, never stored, so it cannot drift from the dimensions.
    const { areaSqm } = await import("@jaco/core");
    return reply.send(
      serialize(rows.map((r) => ({ ...r, areaSqm: areaSqm({ widthCm: r.widthCm, heightCm: r.heightCm }) }))),
    );
  });

  app.post("/products/:id/sizes", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1),
        widthCm: dec,
        heightCm: dec,
        depthCm: optDec,
        sortOrder: z.coerce.number().int().optional(),
      })
      .parse(request.body);
    const created = await prisma.productSize.create({ data: { productId: id, ...body } });
    return reply.code(201).send(serialize(created));
  });

  app.delete("/products/:productId/sizes/:sizeId", async (request, reply) => {
    requireAdmin(request, reply);
    const { sizeId } = z
      .object({ productId: z.string().min(1), sizeId: z.string().min(1) })
      .parse(request.params);
    await prisma.productSize.update({ where: { id: sizeId }, data: { active: false } });
    return reply.code(204).send();
  });

  // ───────────────────── §79 tags ─────────────────────

  app.get("/tags", async (_request, reply) => {
    return reply.send(serialize(await prisma.tag.findMany({ orderBy: { name: "asc" } })));
  });

  app.post("/tags", async (request, reply) => {
    requireAdmin(request, reply);
    const body = z.object({ name: z.string().min(1), color: z.string().nullish() }).parse(request.body);
    return reply.code(201).send(serialize(await prisma.tag.create({ data: body })));
  });

  app.put("/products/:id/tags", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ tagIds: z.array(z.string().min(1)) }).parse(request.body);
    await prisma.$transaction([
      prisma.productTag.deleteMany({ where: { productId: id } }),
      prisma.productTag.createMany({ data: body.tagIds.map((tagId) => ({ productId: id, tagId })) }),
    ]);
    return reply.send({ ok: true });
  });

  // ───────────────────── §78 media upload ─────────────────────

  /**
   * §78 — files are stored on the server's local disk.
   *
   * The mime type is checked against an allowlist and the stored name is a fresh
   * UUID, so a client cannot choose the path it is written to or have an arbitrary
   * file type served back. The original filename is kept as data only.
   */
  app.post("/media", async (request, reply) => {
    requireAdmin(request, reply);
    const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
    if (file === undefined) return reply.code(400).send({ error: "לא נשלח קובץ." });

    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const entityType = fields.entityType?.value;
    const entityId = fields.entityId?.value;
    const kind = fields.kind?.value ?? "IMAGE";

    const parsed = z
      .object({
        entityType: z.enum(["PRODUCT", "MATERIAL", "SUPPLIER"]),
        entityId: z.string().min(1),
        kind: z.enum(["IMAGE", "DATASHEET", "CERTIFICATE", "CONTRACT", "SUPPLIER_PRICE_LIST", "MOCKUP", "OTHER"]),
      })
      .safeParse({ entityType, entityId, kind });
    if (!parsed.success) {
      return reply.code(400).send({ error: "חסרים שדות entityType / entityId / kind תקינים." });
    }

    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply
        .code(415)
        .send({ error: `סוג הקובץ ${file.mimetype} אינו נתמך. נתמכים: תמונות ו-PDF.` });
    }

    const ext = path.extname(file.filename).toLowerCase().slice(0, 10);
    const storedName = `${randomUUID()}${ext}`;
    const dir = path.join(UPLOAD_DIR, parsed.data.entityType.toLowerCase());
    await mkdir(dir, { recursive: true });
    const absolute = path.join(dir, storedName);

    await pipeline(file.file, createWriteStream(absolute));
    if (file.file.truncated) {
      return reply.code(413).send({ error: "הקובץ גדול מהמותר (20MB)." });
    }

    const relative = path.join(parsed.data.entityType.toLowerCase(), storedName);
    const existingPrimary = await prisma.mediaAsset.findFirst({
      where: { entityType: parsed.data.entityType, entityId: parsed.data.entityId, kind: parsed.data.kind, isPrimary: true },
    });

    const created = await prisma.mediaAsset.create({
      data: {
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        kind: parsed.data.kind,
        filePath: relative,
        originalFilename: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.file.bytesRead,
        altText: fields.altText?.value ?? null,
        title: fields.title?.value ?? null,
        // The first asset of a kind becomes the primary one.
        isPrimary: existingPrimary === null,
      },
    });

    await recordSyncEventStandalone({
      entityType: parsed.data.entityType, entityId: parsed.data.entityId,
      changeType: "MEDIA_CHANGED", payload: { mediaId: created.id, kind: created.kind },
    });
    return reply.code(201).send(serialize(created));
  });

  app.delete("/media/:id", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const row = await prisma.mediaAsset.delete({ where: { id } });
    return reply.send(serialize(row));
  });

  // ───────────────────── §81 channels ─────────────────────

  app.get("/channels", async (_request, reply) => {
    const rows = await prisma.salesChannel.findMany({
      include: { _count: { select: { publications: true } } },
      orderBy: { name: "asc" },
    });
    return reply.send(serialize(rows));
  });

  /**
   * §81 — the outbox, exposed so the shop can see what is waiting.
   *
   * Nothing is delivered yet: no website or POS target has been defined, so there
   * is no adapter to run. The model and the queue exist, which is what §81 asks
   * for at this stage.
   */
  app.get("/sync/pending", async (request, reply) => {
    requireAdmin(request, reply);
    const query = z.object({ limit: z.coerce.number().int().positive().max(500).optional() }).parse(request.query);
    const [events, total] = await Promise.all([
      prisma.syncEvent.findMany({ where: { processedAt: null }, orderBy: { createdAt: "asc" }, take: query.limit ?? 50 }),
      prisma.syncEvent.count({ where: { processedAt: null } }),
    ]);
    return reply.send(serialize({ total, events }));
  });
}
