import type {
  BusinessSettings,
  ProductInput,
  QuantityTierInput,
  SizeInput,
  SupplierInput,
  SupplierPriceInput,
} from "../src/index.js";

/**
 * §5 default values. These live here and in prisma/seed.ts only — §70 forbids
 * them anywhere in engine logic.
 */
export const SETTINGS: BusinessSettings = {
  currency: "ILS",
  vatRate: 18,
  averageSalesInclVat: 120_000,
  averageWages: 60_000,
  employeeHourlyWage: 45,
  employerMultiplier: 1.4,
  laborRatioOverride: null,
  minOrderInclVat: 59,
  targetContributionMargin: 0.3,
  targetSqmPriceInclVat: 227,
  defaultMaterialCostPerSqm: 45,
  defaultPurchaseLotQuantity: 50,
  displayRounding: 0,
};

/** §28 sizes used by the tests. */
export const SIZE_15x21: SizeInput = { name: "15x21", widthCm: 15, heightCm: 21 };
export const SIZE_10x15: SizeInput = { name: "10x15", widthCm: 10, heightCm: 15 };
export const SIZE_100x100: SizeInput = { name: "100x100", widthCm: 100, heightCm: 100 };

/** §27 — Lucobond is only a demo product (§71); the engine treats it like any other. */
export const PRODUCT_SQM: ProductInput = {
  id: "prod-lucobond",
  name: "לוקובונד מודפס",
  pricingMethod: "SQM",
  laborMethod: "PERCENT",
};

export const PRODUCT_UNIT: ProductInput = {
  id: "prod-unit",
  name: "מוצר לפי יחידה",
  pricingMethod: "UNIT",
  laborMethod: "PERCENT",
};

export const PRODUCT_LINEAR: ProductInput = {
  id: "prod-linear",
  name: "מוצר לפי מטר רץ",
  pricingMethod: "LINEAR_METER",
  laborMethod: "PERCENT",
};

/** §24 + C3 — eight tiers, the last one 301+ rather than the SPEC's overlapping 300+. */
export const DEFAULT_TIER_BOUNDS: Array<[number, number | null]> = [
  [1, 5],
  [6, 10],
  [11, 25],
  [26, 50],
  [51, 100],
  [101, 200],
  [201, 300],
  [301, null],
];

/** Build a tier list from the eight §29 prices for one size. */
export function tiersFromPrices(prices: readonly number[]): QuantityTierInput[] {
  if (prices.length !== DEFAULT_TIER_BOUNDS.length) {
    throw new Error(`expected ${DEFAULT_TIER_BOUNDS.length} prices, got ${prices.length}`);
  }
  return DEFAULT_TIER_BOUNDS.map(([minQuantity, maxQuantity], i) => ({
    minQuantity,
    maxQuantity,
    unitPriceInclVat: prices[i]!,
  }));
}

/** §29 price list for 15x21, all incl. VAT. */
export const TIERS_15x21 = tiersFromPrices([59, 57, 55, 53, 51, 49, 47, 45]);
/** §29 price list for 10x15 — the §26 minimum-order example. */
export const TIERS_10x15 = tiersFromPrices([39, 38, 37, 36, 35, 34, 33, 32]);
/** §29 price list for 100x100 — the §30 target per-sqm price. */
export const TIERS_100x100 = tiersFromPrices([227, 224, 221, 218, 215, 212, 209, 205]);

// ───────────────── §62 supplier scenario ─────────────────

export const SUPPLIER_A: SupplierInput = {
  id: "sup-a",
  name: "ספק א׳",
  deliveryCost: 100,
  minimumOrderValue: 0,
  shippingType: "FLAT",
  active: true,
};

export const SUPPLIER_B: SupplierInput = {
  id: "sup-b",
  name: "ספק ב׳",
  deliveryCost: 0,
  minimumOrderValue: 0,
  shippingType: "FLAT",
  active: true,
};

/** §62 — supplier A: 1-9 at 35, 10-49 at 32, 50+ at 29, freight 100. */
export const PRICES_A: SupplierPriceInput[] = [
  {
    id: "a-1",
    supplierId: "sup-a",
    materialId: "mat-lucobond",
    unit: "SQM",
    unitPrice: 35,
    minimumQuantity: 1,
    maximumQuantity: 9,
    purchaseLotQuantity: 50,
    validFrom: new Date("2026-01-01"),
  },
  {
    id: "a-2",
    supplierId: "sup-a",
    materialId: "mat-lucobond",
    unit: "SQM",
    unitPrice: 32,
    minimumQuantity: 10,
    maximumQuantity: 49,
    purchaseLotQuantity: 50,
    validFrom: new Date("2026-01-01"),
  },
  {
    id: "a-3",
    supplierId: "sup-a",
    materialId: "mat-lucobond",
    unit: "SQM",
    unitPrice: 29,
    minimumQuantity: 50,
    maximumQuantity: null,
    purchaseLotQuantity: 50,
    validFrom: new Date("2026-01-01"),
  },
];

/** §62 — supplier B: 1-49 at 33, 50+ at 31, no freight. */
export const PRICES_B: SupplierPriceInput[] = [
  {
    id: "b-1",
    supplierId: "sup-b",
    materialId: "mat-lucobond",
    unit: "SQM",
    unitPrice: 33,
    minimumQuantity: 1,
    maximumQuantity: 49,
    purchaseLotQuantity: 50,
    validFrom: new Date("2026-01-01"),
  },
  {
    id: "b-2",
    supplierId: "sup-b",
    materialId: "mat-lucobond",
    unit: "SQM",
    unitPrice: 31,
    minimumQuantity: 50,
    maximumQuantity: null,
    purchaseLotQuantity: 50,
    validFrom: new Date("2026-01-01"),
  },
];

export const AS_OF = new Date("2026-06-15");
