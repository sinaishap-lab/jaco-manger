import { Prisma } from "@prisma/client";
import { calculateQuote, d, priceChangeImpact, type Decimal } from "@jaco/core";
import { prisma } from "../db.js";
import { NotFoundError } from "./settings.js";
import { recordSyncEvent } from "./sync.js";
import { buildQuoteInput } from "./pricing.js";

export interface NewPriceInput {
  supplierId: string;
  unit: "SQM" | "LINEAR_METER" | "UNIT" | "KG" | "LITER" | "HOUR";
  unitPrice: string;
  currency?: string;
  minimumQuantity?: string;
  maximumQuantity?: string | null;
  deliveryCost?: string | null;
  shippingType?: "FLAT" | "PER_QUANTITY" | "FREE_ABOVE" | "BY_WEIGHT" | "BY_AREA" | null;
  freeShippingThreshold?: string | null;
  purchaseLotQuantity?: string | null;
  weightKgPerUnit?: string | null;
  additionalCostPerOrder?: string;
  includesPrinting?: boolean;
  validFrom?: string;
  notes?: string;
}

/**
 * §17, §48 — record a new purchase price.
 *
 * A price is never updated in place. The row in force is closed by setting
 * validUntil, and a new row is inserted, both in one transaction. That is what
 * lets the system answer "which price applied on this date", and it is why a
 * quote saved last month keeps its numbers when a supplier raises prices today.
 *
 * The partial unique index smp_one_open_row_per_tier makes the invariant the
 * database's business too: two open rows for the same supplier, material and tier
 * floor cannot both exist.
 */
export async function addSupplierPrice(
  materialId: string,
  input: NewPriceInput,
): Promise<{ created: Prisma.SupplierMaterialPriceGetPayload<object>; closed: string[] }> {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (material === null) throw new NotFoundError(`חומר ${materialId} לא נמצא.`);

  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (supplier === null) throw new NotFoundError(`ספק ${input.supplierId} לא נמצא.`);

  const validFrom = input.validFrom === undefined ? new Date() : new Date(input.validFrom);
  const minimumQuantity = new Prisma.Decimal(input.minimumQuantity ?? "0");

  return prisma.$transaction(async (tx) => {
    // Close the open row(s) for this supplier/material/tier floor.
    const openRows = await tx.supplierMaterialPrice.findMany({
      where: {
        materialId,
        supplierId: input.supplierId,
        minimumQuantity,
        validUntil: null,
        active: true,
      },
    });

    for (const row of openRows) {
      await tx.supplierMaterialPrice.update({
        where: { id: row.id },
        // Only the validity window and the active flag change. unitPrice is never
        // touched, so the historic figure stays readable (§17).
        data: { validUntil: validFrom, active: false },
      });
    }

    const created = await tx.supplierMaterialPrice.create({
      data: {
        supplierId: input.supplierId,
        materialId,
        unit: input.unit,
        unitPrice: new Prisma.Decimal(input.unitPrice),
        currency: input.currency ?? "ILS",
        minimumQuantity,
        maximumQuantity:
          input.maximumQuantity === null || input.maximumQuantity === undefined
            ? null
            : new Prisma.Decimal(input.maximumQuantity),
        deliveryCost:
          input.deliveryCost === null || input.deliveryCost === undefined
            ? null
            : new Prisma.Decimal(input.deliveryCost),
        shippingType: input.shippingType ?? null,
        freeShippingThreshold:
          input.freeShippingThreshold === null || input.freeShippingThreshold === undefined
            ? null
            : new Prisma.Decimal(input.freeShippingThreshold),
        purchaseLotQuantity:
          input.purchaseLotQuantity === null || input.purchaseLotQuantity === undefined
            ? null
            : new Prisma.Decimal(input.purchaseLotQuantity),
        weightKgPerUnit:
          input.weightKgPerUnit === null || input.weightKgPerUnit === undefined
            ? null
            : new Prisma.Decimal(input.weightKgPerUnit),
        additionalCostPerOrder: new Prisma.Decimal(input.additionalCostPerOrder ?? "0"),
        includesPrinting: input.includesPrinting ?? false,
        validFrom,
        validUntil: null,
        active: true,
        notes: input.notes,
      },
    });

    // Link the closed row forward so the history is navigable.
    for (const row of openRows) {
      await tx.supplierMaterialPrice.update({
        where: { id: row.id },
        data: { supersededById: created.id },
      });
    }

    // §81 — a purchase price change may affect what channels should show.
    await recordSyncEvent(tx, {
      entityType: "MATERIAL",
      entityId: materialId,
      changeType: "PRICE_CHANGED",
      payload: {
        supplierId: input.supplierId,
        previousPrices: openRows.map((r) => ({ id: r.id, unitPrice: r.unitPrice.toFixed() })),
        newPriceId: created.id,
        newUnitPrice: created.unitPrice.toFixed(),
      },
    });

    return { created, closed: openRows.map((r) => r.id) };
  });
}

/** §17 — the price in force for a supplier/material/quantity at a given date. */
export async function priceHistory(materialId: string) {
  return prisma.supplierMaterialPrice.findMany({
    where: { materialId },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: [{ supplierId: "asc" }, { minimumQuantity: "asc" }, { validFrom: "desc" }],
  });
}

/**
 * §48, §49 — what a price change did to cost and contribution.
 *
 * Reported for a concrete product, size and quantity, because §49's question
 * ("material X rose by Y%, what happened to the contribution?") has no answer in
 * the abstract — the effect depends on how much material the order consumes.
 *
 * §51 — this is a report. It changes no price list.
 */
export async function priceImpact(args: {
  materialId: string;
  productId: string;
  productSizeId?: string | null;
  quantity: number;
  from: string;
  to: string;
}): Promise<{
  before: ReturnType<typeof calculateQuote>;
  after: ReturnType<typeof calculateQuote>;
  materialCostDelta: Decimal;
  contributionDelta: Decimal;
  unitCostChangePercent: Decimal | null;
  priceListUnchanged: boolean;
}> {
  const base = {
    productId: args.productId,
    productSizeId: args.productSizeId ?? null,
    quantity: args.quantity,
  };

  // The same calculation at two dates. §17's validity windows do the rest.
  const before = calculateQuote(await buildQuoteInput({ ...base, asOf: args.from }));
  const after = calculateQuote(await buildQuoteInput({ ...base, asOf: args.to }));

  const beforeUnit = before.supplier?.unitPrice ?? d(0);
  const afterUnit = after.supplier?.unitPrice ?? d(0);

  const impact = priceChangeImpact({
    previousUnitCost: beforeUnit,
    newUnitCost: afterUnit,
    quantity: before.measure.totalMeasure,
    priceExVat: before.totalPriceExVat,
    otherCosts: before.totalCost.minus(before.materialCost),
  });

  return {
    before,
    after,
    materialCostDelta: after.materialCost.minus(before.materialCost),
    contributionDelta: after.contribution.minus(before.contribution),
    unitCostChangePercent: impact.deltaPercent,
    // §51 — the sell-side price did not move because a cost did.
    priceListUnchanged: before.unitPriceInclVat.equals(after.unitPriceInclVat),
  };
}
