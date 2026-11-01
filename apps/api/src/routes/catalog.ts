import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, SETTINGS_ID } from "../db.js";
import { requireAdmin, roleOf } from "../roles.js";
import { serialize } from "../serialize.js";
import { addSupplierPrice, priceHistory } from "../services/prices.js";
import { recordSyncEventStandalone } from "../services/sync.js";

const dec = z.union([z.string(), z.number()]).transform((v) => new Prisma.Decimal(v));
const optDec = z
  .union([z.string(), z.number(), z.null()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v)));

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  // ───────────────────── §4 settings ─────────────────────

  app.get("/settings", async (_request, reply) => {
    const row = await prisma.businessSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (row === null) return reply.code(404).send({ error: "הגדרות העסק לא נמצאו." });

    // §6 — show the derived labor ratio alongside the raw inputs, as the SPEC asks
    // ("יחס עלות עבודה היסטורי: 59%"), computed rather than stored.
    const { deriveSettings } = await import("@jaco/core");
    const derived = deriveSettings({
      currency: row.currency,
      vatRate: row.vatRate,
      averageSalesInclVat: row.averageSalesInclVat,
      averageWages: row.averageWages,
      employeeHourlyWage: row.employeeHourlyWage,
      employerMultiplier: row.employerMultiplier,
      laborRatioOverride: row.laborRatioOverride,
      minOrderInclVat: row.minOrderInclVat,
      targetContributionMargin: row.targetContributionMargin,
      targetSqmPriceInclVat: row.targetSqmPriceInclVat,
      defaultMaterialCostPerSqm: row.defaultMaterialCostPerSqm,
      defaultPurchaseLotQuantity: row.defaultPurchaseLotQuantity,
      displayRounding: row.displayRounding,
    });

    return reply.send(serialize({ ...row, derived }));
  });

  app.put("/settings", async (request, reply) => {
    requireAdmin(request, reply);
    const body = z
      .object({
        businessName: z.string().optional(),
        currency: z.string().optional(),
        vatRate: dec.optional(),
        averageSalesInclVat: dec.optional(),
        averageWages: dec.optional(),
        employeeHourlyWage: dec.optional(),
        employerMultiplier: dec.optional(),
        laborRatioOverride: optDec,
        minOrderInclVat: dec.optional(),
        targetContributionMargin: dec.optional(),
        targetSqmPriceInclVat: dec.optional(),
        defaultMaterialCostPerSqm: dec.optional(),
        defaultPurchaseLotQuantity: dec.optional(),
        displayRounding: z.coerce.number().int().min(0).max(6).optional(),
      })
      .parse(request.body);

    const updated = await prisma.businessSettings.update({
      where: { id: SETTINGS_ID },
      data: body,
    });
    // §64 — changing turnover or wages recomputes the ratio but must not silently
    // rewrite existing sell prices; nothing here touches a price list (§51).
    return reply.send(serialize(updated));
  });

  // ───────────────────── §9, §80 suppliers ─────────────────────

  app.get("/suppliers", async (request, reply) => {
    const includeInactive = (request.query as { all?: string }).all === "true";
    const rows = await prisma.supplier.findMany({
      where: includeInactive ? {} : { active: true },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        _count: { select: { materialPrices: true, catalogEntries: true } },
      },
      orderBy: [{ isPreferred: "desc" }, { name: "asc" }],
    });
    return reply.send(serialize(rows));
  });

  app.get("/suppliers/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const row = await prisma.supplier.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        catalogEntries: { include: { material: { select: { id: true, name: true, pricingUnit: true } } } },
      },
    });
    if (row === null) return reply.code(404).send({ error: "הספק לא נמצא." });

    const [attributes, media] = await Promise.all([
      loadAttributes("SUPPLIER", id),
      prisma.mediaAsset.findMany({ where: { entityType: "SUPPLIER", entityId: id }, orderBy: { sortOrder: "asc" } }),
    ]);
    return reply.send(serialize({ ...row, attributes, media }));
  });

  const supplierBody = z.object({
    name: z.string().min(1),
    contactName: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
    website: z.string().nullish(),
    taxId: z.string().nullish(),
    paymentTerms: z.string().nullish(),
    deliveryCost: dec.optional(),
    minimumOrderValue: dec.optional(),
    shippingType: z.enum(["FLAT", "PER_QUANTITY", "FREE_ABOVE", "BY_WEIGHT", "BY_AREA"]).optional(),
    freeShippingThreshold: optDec,
    addressBilling: z.string().nullish(),
    addressWarehouse: z.string().nullish(),
    qualityRating: z.coerce.number().int().min(1).max(5).nullish(),
    leadTimeDays: z.coerce.number().int().min(0).nullish(),
    creditLimit: optDec,
    isPreferred: z.boolean().optional(),
    certifications: z.string().nullish(),
    active: z.boolean().optional(),
    notes: z.string().nullish(),
  });

  app.post("/suppliers", async (request, reply) => {
    requireAdmin(request, reply);
    const created = await prisma.supplier.create({ data: supplierBody.parse(request.body) });
    await recordSyncEventStandalone({
      entityType: "SUPPLIER", entityId: created.id, changeType: "CREATED", payload: { name: created.name },
    });
    return reply.code(201).send(serialize(created));
  });

  app.put("/suppliers/:id", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const updated = await prisma.supplier.update({
      where: { id },
      data: supplierBody.partial().parse(request.body),
    });
    await recordSyncEventStandalone({
      entityType: "SUPPLIER", entityId: id, changeType: "UPDATED", payload: { name: updated.name },
    });
    return reply.send(serialize(updated));
  });

  // §80 supplier contacts
  app.post("/suppliers/:id/contacts", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1),
        role: z.enum(["SALES", "SUPPORT", "ACCOUNTING", "LOGISTICS", "OTHER"]).optional(),
        phone: z.string().nullish(),
        email: z.string().nullish(),
        notes: z.string().nullish(),
        isPrimary: z.boolean().optional(),
      })
      .parse(request.body);
    const created = await prisma.supplierContact.create({ data: { supplierId: id, ...body } });
    return reply.code(201).send(serialize(created));
  });

  app.delete("/suppliers/:supplierId/contacts/:contactId", async (request, reply) => {
    requireAdmin(request, reply);
    const { contactId } = z
      .object({ supplierId: z.string().min(1), contactId: z.string().min(1) })
      .parse(request.params);
    await prisma.supplierContact.delete({ where: { id: contactId } });
    return reply.code(204).send();
  });

  // §80 supplier catalog entry
  app.post("/suppliers/:id/catalog", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        materialId: z.string().min(1),
        supplierSku: z.string().nullish(),
        supplierProductName: z.string().nullish(),
        packSize: optDec,
        packUnit: z.string().nullish(),
        leadTimeDays: z.coerce.number().int().min(0).nullish(),
        isPreferred: z.boolean().optional(),
        notes: z.string().nullish(),
      })
      .parse(request.body);
    const created = await prisma.supplierMaterial.upsert({
      where: { supplierId_materialId: { supplierId: id, materialId: body.materialId } },
      create: { supplierId: id, ...body },
      update: body,
    });
    return reply.send(serialize(created));
  });

  // ───────────────────── §10 materials ─────────────────────

  app.get("/materials", async (request, reply) => {
    const includeInactive = (request.query as { all?: string }).all === "true";
    const rows = await prisma.material.findMany({
      where: includeInactive ? {} : { active: true },
      include: {
        defaultSupplier: { select: { id: true, name: true } },
        _count: { select: { prices: true, products: true } },
      },
      orderBy: { name: "asc" },
    });
    return reply.send(serialize(rows));
  });

  app.get("/materials/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const row = await prisma.material.findUnique({
      where: { id },
      include: {
        defaultSupplier: { select: { id: true, name: true } },
        catalogEntries: { include: { supplier: { select: { id: true, name: true } } } },
      },
    });
    if (row === null) return reply.code(404).send({ error: "החומר לא נמצא." });
    const [attributes, media] = await Promise.all([
      loadAttributes("MATERIAL", id),
      prisma.mediaAsset.findMany({ where: { entityType: "MATERIAL", entityId: id }, orderBy: { sortOrder: "asc" } }),
    ]);
    return reply.send(serialize({ ...row, attributes, media }));
  });

  const materialBody = z.object({
    name: z.string().min(1),
    materialType: z.string().nullish(),
    pricingUnit: z.enum(["SQM", "LINEAR_METER", "UNIT", "KG", "LITER", "HOUR"]),
    defaultSupplierId: z.string().min(1).nullish(),
    sku: z.string().nullish(),
    thicknessMm: optDec,
    finish: z.string().nullish(),
    color: z.string().nullish(),
    sheetWidthCm: optDec,
    sheetHeightCm: optDec,
    weightKgPerSqm: optDec,
    isPrintable: z.boolean().optional(),
    isOutdoorRated: z.boolean().optional(),
    active: z.boolean().optional(),
    notes: z.string().nullish(),
  });

  app.post("/materials", async (request, reply) => {
    requireAdmin(request, reply);
    const created = await prisma.material.create({ data: materialBody.parse(request.body) });
    await recordSyncEventStandalone({
      entityType: "MATERIAL", entityId: created.id, changeType: "CREATED", payload: { name: created.name },
    });
    return reply.code(201).send(serialize(created));
  });

  app.put("/materials/:id", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const updated = await prisma.material.update({
      where: { id },
      data: materialBody.partial().parse(request.body),
    });
    await recordSyncEventStandalone({
      entityType: "MATERIAL", entityId: id, changeType: "UPDATED", payload: { name: updated.name },
    });
    return reply.send(serialize(updated));
  });

  // ───────────────────── §12, §13, §17 supplier prices ─────────────────────

  /** §17 — every price row with its validity window, so history is visible. */
  app.get("/materials/:id/prices", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    return reply.send(serialize(await priceHistory(id)));
  });

  /**
   * §17, §48 — add a price. Never an update: the open row is closed and a new one
   * inserted, so the previous figure stays readable by date.
   */
  app.post("/materials/:id/prices", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        supplierId: z.string().min(1),
        unit: z.enum(["SQM", "LINEAR_METER", "UNIT", "KG", "LITER", "HOUR"]),
        unitPrice: z.union([z.string(), z.number()]).transform(String),
        currency: z.string().optional(),
        minimumQuantity: z.union([z.string(), z.number()]).transform(String).optional(),
        maximumQuantity: z.union([z.string(), z.number(), z.null()]).nullish().transform((v) => (v === null || v === undefined ? null : String(v))),
        deliveryCost: z.union([z.string(), z.number(), z.null()]).nullish().transform((v) => (v === null || v === undefined ? null : String(v))),
        shippingType: z.enum(["FLAT", "PER_QUANTITY", "FREE_ABOVE", "BY_WEIGHT", "BY_AREA"]).nullish(),
        freeShippingThreshold: z.union([z.string(), z.number(), z.null()]).nullish().transform((v) => (v === null || v === undefined ? null : String(v))),
        purchaseLotQuantity: z.union([z.string(), z.number(), z.null()]).nullish().transform((v) => (v === null || v === undefined ? null : String(v))),
        weightKgPerUnit: z.union([z.string(), z.number(), z.null()]).nullish().transform((v) => (v === null || v === undefined ? null : String(v))),
        additionalCostPerOrder: z.union([z.string(), z.number()]).transform(String).optional(),
        includesPrinting: z.boolean().optional(),
        validFrom: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(request.body);

    const result = await addSupplierPrice(id, body);
    return reply.code(201).send(serialize(result));
  });

  // ───────────────────── §55 price lists ─────────────────────

  app.get("/price-lists", async (_request, reply) => {
    const rows = await prisma.priceListVersion.findMany({
      include: { _count: { select: { tiers: true } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    return reply.send(serialize(rows));
  });

  app.post("/price-lists", async (request, reply) => {
    requireAdmin(request, reply);
    const body = z
      .object({ name: z.string().min(1), notes: z.string().nullish(), copyFromId: z.string().min(1).optional() })
      .parse(request.body);

    const created = await prisma.$transaction(async (tx) => {
      const version = await tx.priceListVersion.create({
        data: { name: body.name, notes: body.notes, isActive: false },
      });
      // A new version usually starts as a copy of an existing one.
      if (body.copyFromId !== undefined) {
        const source = await tx.quantityTier.findMany({ where: { priceListVersionId: body.copyFromId } });
        if (source.length > 0) {
          await tx.quantityTier.createMany({
            data: source.map((t) => ({
              priceListVersionId: version.id,
              productId: t.productId,
              productSizeId: t.productSizeId,
              minQuantity: t.minQuantity,
              maxQuantity: t.maxQuantity,
              unitPriceInclVat: t.unitPriceInclVat,
              active: t.active,
            })),
          });
        }
      }
      return version;
    });
    return reply.code(201).send(serialize(created));
  });

  /** §55 — exactly one version is active; the DB index enforces it. */
  app.post("/price-lists/:id/activate", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await prisma.$transaction([
      prisma.priceListVersion.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      prisma.priceListVersion.update({ where: { id }, data: { isActive: true } }),
    ]);
    return reply.send({ ok: true });
  });

  /** §23, §29 — the tier grid of a price list. */
  app.get("/price-lists/:id/tiers", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = z.object({ productId: z.string().min(1).optional() }).parse(request.query);
    const rows = await prisma.quantityTier.findMany({
      where: { priceListVersionId: id, ...(query.productId === undefined ? {} : { productId: query.productId }) },
      orderBy: [{ productId: "asc" }, { productSizeId: "asc" }, { minQuantity: "asc" }],
    });
    return reply.send(serialize(rows));
  });

  /**
   * §23 — upsert a tier price. The gist exclusion constraint rejects an overlap,
   * which is how the §24 "201-300" plus "300+" collision is made impossible.
   */
  app.put("/price-lists/:id/tiers", async (request, reply) => {
    requireAdmin(request, reply);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        productId: z.string().min(1),
        productSizeId: z.string().min(1).nullish(),
        minQuantity: z.coerce.number().int().min(1),
        maxQuantity: z.coerce.number().int().min(1).nullable(),
        unitPriceInclVat: dec,
      })
      .parse(request.body);

    const existing = await prisma.quantityTier.findFirst({
      where: {
        priceListVersionId: id,
        productId: body.productId,
        productSizeId: body.productSizeId ?? null,
        minQuantity: body.minQuantity,
      },
    });

    const row =
      existing === null
        ? await prisma.quantityTier.create({ data: { priceListVersionId: id, ...body, productSizeId: body.productSizeId ?? null } })
        : await prisma.quantityTier.update({
            where: { id: existing.id },
            data: { maxQuantity: body.maxQuantity, unitPriceInclVat: body.unitPriceInclVat },
          });

    await recordSyncEventStandalone({
      entityType: "PRODUCT", entityId: body.productId, changeType: "PRICE_CHANGED",
      payload: { priceListVersionId: id, tierId: row.id, unitPriceInclVat: row.unitPriceInclVat.toFixed() },
    });
    return reply.send(serialize(row));
  });
}

/** §77 — attribute values joined to their definitions, grouped for display. */
export async function loadAttributes(
  entityType: "PRODUCT" | "MATERIAL" | "SUPPLIER",
  entityId: string,
) {
  const values = await prisma.attributeValue.findMany({
    where: { entityType, entityId },
    include: { definition: true },
  });
  return values
    .sort((a, b) => a.definition.sortOrder - b.definition.sortOrder)
    .map((v) => ({
      definitionId: v.definitionId,
      key: v.definition.key,
      label: v.definition.label,
      group: v.definition.attributeGroup,
      dataType: v.definition.dataType,
      unit: v.definition.unit,
      isCustomerVisible: v.definition.isCustomerVisible,
      value: v.valueText ?? v.valueNumber ?? v.valueBoolean ?? v.valueDate ?? null,
    }));
}
