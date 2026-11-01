import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { roleOf, stripProfitability } from "../roles.js";
import { serialize } from "../serialize.js";
import { calculate, compare, recommend } from "../services/pricing.js";
import { priceImpact } from "../services/prices.js";
import { getQuote, listQuotes, saveQuote } from "../services/quotes.js";
import { ForbiddenError } from "../roles.js";

const calculateSchema = z.object({
  productId: z.string().min(1),
  productSizeId: z.string().min(1).nullish(),
  quantity: z.coerce.number().int().positive(),
  supplierMode: z.enum(["MANUAL", "AUTO"]).optional(),
  selectedSupplierId: z.string().min(1).nullish(),
  shippingAllocation: z.enum(["AMORTIZED", "FULL_ORDER"]).optional(),
  laborMethod: z.enum(["PERCENT", "HOURLY", "COMBINED"]).optional(),
  priceListVersionId: z.string().min(1).nullish(),
  extraCosts: z
    .array(
      z.object({
        name: z.string().min(1),
        scope: z.enum(["FIXED_ORDER", "VARIABLE_UNIT", "VARIABLE_AREA"]),
        amount: z.union([z.string(), z.number()]),
      }),
    )
    .optional(),
  asOf: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function pricingRoutes(app: FastifyInstance): Promise<void> {
  /** §44 — calculate, store nothing. */
  app.post("/calculate", async (request, reply) => {
    const body = calculateSchema.parse(request.body);
    const result = await calculate(body);
    // §57 — a USER sees the sale price but not what it costs us.
    return reply.send(serialize(stripProfitability(result as never, roleOf(request))));
  });

  /** §50 — recommended sale price. */
  app.post("/calculate/recommend-price", async (request, reply) => {
    if (roleOf(request) !== "ADMIN") {
      throw new ForbiddenError(
        "חישוב מחיר מומלץ נגזר מהעלויות ומיעד התרומה, ולכן מחייב הרשאת ADMIN (§57).",
      );
    }
    const body = calculateSchema.parse(request.body);
    return reply.send(serialize(await recommend(body)));
  });

  /** §46 — supplier comparison. Costs are the whole point, so ADMIN only (§57). */
  app.get("/suppliers/compare", async (request, reply) => {
    if (roleOf(request) !== "ADMIN") {
      throw new ForbiddenError("השוואת ספקים חושפת עלויות רכש ומחייבת הרשאת ADMIN (§57).");
    }
    const query = z
      .object({
        materialId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        asOf: z.string().datetime().optional(),
      })
      .parse(request.query);
    return reply.send(serialize(await compare(query)));
  });

  /** §48, §49 — what a purchase price change did to the contribution. */
  app.get("/materials/:materialId/price-impact", async (request, reply) => {
    if (roleOf(request) !== "ADMIN") {
      throw new ForbiddenError("ניתוח השפעת עלות מחייב הרשאת ADMIN (§57).");
    }
    const { materialId } = z.object({ materialId: z.string().min(1) }).parse(request.params);
    const query = z
      .object({
        productId: z.string().min(1),
        productSizeId: z.string().min(1).nullish(),
        quantity: z.coerce.number().int().positive(),
        from: z.string(),
        to: z.string(),
      })
      .parse(request.query);
    return reply.send(serialize(await priceImpact({ materialId, ...query })));
  });

  /** §54 — save a quote with its full snapshot. */
  app.post("/quotes", async (request, reply) => {
    const body = calculateSchema.parse(request.body);
    const quote = await saveQuote(body);
    return reply.code(201).send(serialize(stripProfitability(quote as never, roleOf(request))));
  });

  /** §53 — calculation history. */
  app.get("/quotes", async (request, reply) => {
    const query = z
      .object({
        limit: z.coerce.number().int().positive().max(500).optional(),
        productId: z.string().min(1).optional(),
      })
      .parse(request.query);
    const rows = await listQuotes(query);
    const role = roleOf(request);
    return reply.send(serialize(rows.map((r) => stripProfitability(r as never, role))));
  });

  /**
   * A stored quote is served from its snapshot, not recalculated (§18, §54).
   * This is what keeps a quote stable after a supplier raises prices.
   */
  app.get("/quotes/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const quote = await getQuote(id);
    if (quote === null) return reply.code(404).send({ error: "הצעת המחיר לא נמצאה." });
    return reply.send(serialize(stripProfitability(quote as never, roleOf(request))));
  });
}
