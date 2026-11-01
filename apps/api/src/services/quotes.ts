import { Prisma } from "@prisma/client";
import { ENGINE_VERSION, type QuoteResult } from "@jaco/core";
import { prisma } from "../db.js";
import { serialize } from "../serialize.js";
import { buildQuoteInput, calculate, type CalculateRequest } from "./pricing.js";

/**
 * §18, §54 — save a quote as an immutable snapshot.
 *
 * The snapshot holds the entire input as well as the result: settings, the supplier
 * price rows that were in force, the tier that applied, the formulas' outputs and
 * the engine version. The quote is therefore readable without consulting any other
 * table, which is exactly what §18 demands — a later supplier price rise must not
 * change a quote already given to a customer.
 *
 * Nothing in the system updates a quote row after insert.
 */
export async function saveQuote(req: CalculateRequest & { notes?: string }) {
  const input = await buildQuoteInput(req);
  const result = await calculate(req);

  const [product, size, priceList] = await Promise.all([
    prisma.product.findUnique({ where: { id: req.productId }, select: { id: true, name: true, displayName: true } }),
    req.productSizeId === null || req.productSizeId === undefined
      ? Promise.resolve(null)
      : prisma.productSize.findUnique({ where: { id: req.productSizeId }, select: { id: true, name: true } }),
    prisma.priceListVersion.findFirst({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);

  const snapshot = {
    savedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    specVersion: "1.0",
    // Everything the calculation consumed, so it can be replayed exactly.
    input: serialize({
      settings: input.settings,
      product: input.product,
      size: input.size,
      quantity: input.quantity,
      quantityTiers: input.quantityTiers,
      supplierMode: input.supplierMode,
      selectedSupplierId: input.selectedSupplierId,
      suppliers: input.suppliers,
      supplierPrices: input.supplierPrices,
      shippingAllocation: input.shippingAllocation,
      additionalCosts: input.additionalCosts,
      asOf: input.asOf,
    }),
    // §18 — the purchase snapshot, called out explicitly.
    purchase: serialize({
      supplierId: result.supplier?.supplierId ?? null,
      supplierName: result.supplier?.supplierName ?? null,
      materialId: null,
      purchasePrice: result.purchasePrice,
      purchaseUnit: result.measure.measureUnit,
      purchaseDate: input.asOf,
      shippingCost: result.shippingCost,
      purchaseLotQuantity: result.supplier?.purchaseLotQuantity ?? null,
      effectiveUnitCost: result.supplier?.effectiveUnitCost ?? null,
    }),
    // §54 — the formulas as applied, recorded so the numbers can be explained later.
    formulas: {
      area: "area_sqm = width_cm * height_cm / 10000  (§22)",
      totalArea: "total_area = area_per_unit * quantity  (§33)",
      customerPrice: "total_incl_vat = MAX(quantity * unit_price_incl_vat, minimum_order)  (§25)",
      exVat: "price_ex_vat = price_incl_vat / (1 + vat_rate/100)  (§32)",
      material: "material_cost = charge_quantity * supplier_unit_price  (§34)",
      shipping:
        input.shippingAllocation === "AMORTIZED"
          ? "shipping_charged = charge_quantity * (freight / purchase_lot)  (§15, §16)"
          : "shipping_charged = freight in full  (§15, §16)",
      labor:
        input.product.laborMethod === "PERCENT"
          ? "labor_cost = price_ex_vat * labor_ratio  (§38)"
          : input.product.laborMethod === "HOURLY"
            ? "labor_cost = hours * employee_cost_per_hour  (§39)"
            : "labor_cost = fixed + hours * cost_per_hour + price_ex_vat * labor_ratio  (§8C)",
      totalCost:
        "total_cost = material + shipping + printing + cutting + labor + additional  (§40, with shipping added per §15)",
      contribution: "contribution = price_ex_vat - total_cost  (§41)",
      margin: "contribution_margin = contribution / price_ex_vat * 100  (§42)",
    },
    result: serialize(result),
    priceListVersion: priceList,
  } as unknown as Prisma.InputJsonValue;

  return prisma.quote.create({
    data: {
      productId: product?.id ?? null,
      productName: product?.displayName ?? product?.name ?? "—",
      productSizeId: size?.id ?? null,
      productSizeName: size?.name ?? null,
      quantity: result.quantity,

      supplierId: result.supplier?.supplierId ?? null,
      supplierName: result.supplier?.supplierName ?? null,
      purchasePrice: toDec(result.purchasePrice),
      purchaseUnit: result.measure.measureUnit,
      shippingCost: toDec(result.shippingCost) ?? new Prisma.Decimal(0),

      unitPriceInclVat: toDec(result.unitPriceInclVat)!,
      totalPriceInclVat: toDec(result.totalPriceInclVat)!,
      totalPriceExVat: toDec(result.totalPriceExVat)!,

      materialCost: toDec(result.materialCost)!,
      printingCost: toDec(result.printingCost)!,
      cuttingCost: toDec(result.cuttingCost)!,
      laborCost: toDec(result.laborCost)!,
      additionalCost: toDec(result.additionalCost)!,
      totalCost: toDec(result.totalCost)!,

      contribution: toDec(result.contribution)!,
      contributionMargin: toDec(result.contributionMargin)!,

      snapshot,
      engineVersion: ENGINE_VERSION,
      notes: req.notes,
    },
  });
}

function toDec(v: { toFixed(): string } | null | undefined): Prisma.Decimal | null {
  if (v === null || v === undefined) return null;
  return new Prisma.Decimal(v.toFixed());
}

/** §53 — the calculation history. */
export async function listQuotes(args: { limit?: number; productId?: string } = {}) {
  return prisma.quote.findMany({
    where: args.productId === undefined ? {} : { productId: args.productId },
    orderBy: { quotedAt: "desc" },
    take: args.limit ?? 50,
    // The snapshot is large and the list view does not need it, so the columns are
    // listed explicitly rather than pulling the whole row.
    select: {
      id: true, quotedAt: true,
      productId: true, productName: true, productSizeId: true, productSizeName: true,
      quantity: true,
      supplierId: true, supplierName: true, purchasePrice: true, purchaseUnit: true,
      shippingCost: true,
      unitPriceInclVat: true, totalPriceInclVat: true, totalPriceExVat: true,
      materialCost: true, printingCost: true, cuttingCost: true, laborCost: true,
      additionalCost: true, totalCost: true,
      contribution: true, contributionMargin: true,
      engineVersion: true, notes: true, createdAt: true,
    },
  });
}

export async function getQuote(id: string) {
  return prisma.quote.findUnique({ where: { id } });
}

export type { QuoteResult };
