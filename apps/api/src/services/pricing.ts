import {
  calculateQuote,
  compareSuppliers,
  recommendPrice,
  type AdditionalCostInput,
  type QuoteInput,
  type QuoteResult,
  type ShippingAllocation,
  type SizeInput,
  type SupplierInput,
  type SupplierPriceInput,
  type SupplierSelectionMode,
} from "@jaco/core";
import { prisma } from "../db.js";
import { loadSettings, NotFoundError } from "./settings.js";

export interface CalculateRequest {
  productId: string;
  productSizeId?: string | null;
  quantity: number;
  supplierMode?: SupplierSelectionMode;
  selectedSupplierId?: string | null;
  shippingAllocation?: ShippingAllocation;
  /** §8 — override the product's configured labor method for a what-if. */
  laborMethod?: "PERCENT" | "HOURLY" | "COMBINED";
  /** Ad-hoc costs on top of the product's stored ones (§37). */
  extraCosts?: AdditionalCostInput[];
  priceListVersionId?: string | null;
  asOf?: string;
}

/**
 * Assemble the engine's inputs from the database.
 *
 * This is the only place that reads pricing data out of Prisma. The engine itself
 * stays pure, so the same function serves the API, the tests and the UI (§58).
 */
export async function buildQuoteInput(req: CalculateRequest): Promise<QuoteInput> {
  const settings = await loadSettings();
  const asOf = req.asOf === undefined ? new Date() : new Date(req.asOf);

  const product = await prisma.product.findUnique({
    where: { id: req.productId },
    include: { additionalCosts: { where: { active: true } }, material: true },
  });
  if (product === null) {
    throw new NotFoundError(`מוצר ${req.productId} לא נמצא.`);
  }

  let size: SizeInput | null = null;
  if (req.productSizeId !== null && req.productSizeId !== undefined) {
    const row = await prisma.productSize.findUnique({ where: { id: req.productSizeId } });
    if (row === null) {
      throw new NotFoundError(`גודל ${req.productSizeId} לא נמצא.`);
    }
    size = { id: row.id, name: row.name, widthCm: row.widthCm, heightCm: row.heightCm, depthCm: row.depthCm };
  }

  // §55 — the active price list unless a specific version was asked for.
  const priceList =
    req.priceListVersionId === null || req.priceListVersionId === undefined
      ? await prisma.priceListVersion.findFirst({ where: { isActive: true } })
      : await prisma.priceListVersion.findUnique({ where: { id: req.priceListVersionId } });

  const tierRows =
    priceList === null
      ? []
      : await prisma.quantityTier.findMany({
          where: {
            priceListVersionId: priceList.id,
            productId: product.id,
            productSizeId: req.productSizeId ?? null,
            active: true,
          },
          orderBy: { minQuantity: "asc" },
        });

  // §12, §17 — every price row for this material; the engine picks the tier and date.
  let suppliers: SupplierInput[] = [];
  let supplierPrices: SupplierPriceInput[] = [];

  if (product.materialId !== null) {
    const priceRows = await prisma.supplierMaterialPrice.findMany({
      where: { materialId: product.materialId, active: true },
      include: { supplier: true },
    });

    const seen = new Map<string, SupplierInput>();
    for (const row of priceRows) {
      if (!seen.has(row.supplierId)) {
        seen.set(row.supplierId, {
          id: row.supplier.id,
          name: row.supplier.name,
          deliveryCost: row.supplier.deliveryCost,
          minimumOrderValue: row.supplier.minimumOrderValue,
          shippingType: row.supplier.shippingType,
          freeShippingThreshold: row.supplier.freeShippingThreshold,
          active: row.supplier.active,
        });
      }
    }
    suppliers = [...seen.values()];
    supplierPrices = priceRows.map(toEnginePrice);
  }

  return {
    settings,
    product: {
      id: product.id,
      name: product.name,
      pricingMethod: product.pricingMethod,
      laborMethod: req.laborMethod ?? product.laborMethod,
      targetMargin: product.targetMargin,
      minimumOrder: product.minimumOrder,
      setupFee: product.setupFee,
      handlingCostPerUnit: product.handlingCostPerUnit,
      printingCostPerSqm: product.printingCostPerSqm,
      cuttingCostPerUnit: product.cuttingCostPerUnit,
      cuttingHoursPerUnit: product.cuttingHoursPerUnit,
      laborHoursPerUnit: product.laborHoursPerUnit,
      laborFixedCost: product.laborFixedCost,
      weightKgPerUnit: product.material?.weightKgPerSqm ?? null,
    },
    size,
    quantity: req.quantity,
    quantityTiers: tierRows.map((t) => ({
      id: t.id,
      minQuantity: t.minQuantity,
      maxQuantity: t.maxQuantity,
      unitPriceInclVat: t.unitPriceInclVat,
    })),
    supplierMode: req.supplierMode ?? "AUTO",
    selectedSupplierId: req.selectedSupplierId ?? null,
    suppliers,
    supplierPrices,
    shippingAllocation: req.shippingAllocation ?? "AMORTIZED",
    additionalCosts: [
      ...product.additionalCosts.map((c) => ({
        id: c.id,
        name: c.name,
        scope: c.scope,
        amount: c.amount,
      })),
      ...(req.extraCosts ?? []),
    ],
    asOf,
  };
}

function toEnginePrice(row: {
  id: string;
  supplierId: string;
  materialId: string;
  unit: SupplierPriceInput["unit"];
  unitPrice: unknown;
  currency: string;
  minimumQuantity: unknown;
  maximumQuantity: unknown;
  deliveryCost: unknown;
  shippingType: SupplierPriceInput["shippingType"];
  freeShippingThreshold: unknown;
  purchaseLotQuantity: unknown;
  weightKgPerUnit: unknown;
  additionalCostPerOrder: unknown;
  includesPrinting: boolean;
  validFrom: Date;
  validUntil: Date | null;
  active: boolean;
}): SupplierPriceInput {
  return {
    id: row.id,
    supplierId: row.supplierId,
    materialId: row.materialId,
    unit: row.unit,
    unitPrice: row.unitPrice as never,
    currency: row.currency,
    minimumQuantity: row.minimumQuantity as never,
    maximumQuantity: row.maximumQuantity as never,
    deliveryCost: row.deliveryCost as never,
    shippingType: row.shippingType,
    freeShippingThreshold: row.freeShippingThreshold as never,
    purchaseLotQuantity: row.purchaseLotQuantity as never,
    weightKgPerUnit: row.weightKgPerUnit as never,
    additionalCostPerOrder: row.additionalCostPerOrder as never,
    includesPrinting: row.includesPrinting,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    active: row.active,
  };
}

/** §44 — calculate without storing anything. */
export async function calculate(req: CalculateRequest): Promise<QuoteResult> {
  return calculateQuote(await buildQuoteInput(req));
}

/** §50 */
export async function recommend(req: CalculateRequest) {
  return recommendPrice(await buildQuoteInput(req));
}

/** §46 — compare every supplier of a material at a concrete purchase quantity. */
export async function compare(args: { materialId: string; quantity: number; asOf?: string }) {
  const settings = await loadSettings();
  const asOf = args.asOf === undefined ? new Date() : new Date(args.asOf);

  const material = await prisma.material.findUnique({ where: { id: args.materialId } });
  if (material === null) {
    throw new NotFoundError(`חומר ${args.materialId} לא נמצא.`);
  }

  const priceRows = await prisma.supplierMaterialPrice.findMany({
    where: { materialId: args.materialId, active: true },
    include: { supplier: true },
  });

  const seen = new Map<string, SupplierInput>();
  for (const row of priceRows) {
    if (!seen.has(row.supplierId)) {
      seen.set(row.supplierId, {
        id: row.supplier.id,
        name: row.supplier.name,
        deliveryCost: row.supplier.deliveryCost,
        minimumOrderValue: row.supplier.minimumOrderValue,
        shippingType: row.supplier.shippingType,
        freeShippingThreshold: row.supplier.freeShippingThreshold,
        active: row.supplier.active,
      });
    }
  }

  const result = compareSuppliers({
    suppliers: [...seen.values()],
    priceRows: priceRows.map(toEnginePrice),
    quantity: args.quantity,
    settings,
    asOf,
  });

  return { material: { id: material.id, name: material.name, pricingUnit: material.pricingUnit }, ...result };
}
