import type { Decimal, Numeric } from "./money.js";

// ───────────────────────────── enums ─────────────────────────────

/** §11 */
export type PricingUnit = "SQM" | "LINEAR_METER" | "UNIT" | "KG" | "LITER" | "HOUR";
/** §20 */
export type PricingMethod = "SQM" | "LINEAR_METER" | "UNIT" | "KG" | "HOUR" | "CUSTOM";
/** §8 */
export type LaborMethod = "PERCENT" | "HOURLY" | "COMBINED";
/** §16 */
export type ShippingType = "FLAT" | "PER_QUANTITY" | "FREE_ABOVE" | "BY_WEIGHT" | "BY_AREA";
/** §14 */
export type SupplierSelectionMode = "MANUAL" | "AUTO";
/** §37 */
export type AdditionalCostScope = "FIXED_ORDER" | "VARIABLE_UNIT" | "VARIABLE_AREA";

/**
 * How inbound supplier freight is charged to this order.
 *
 * AMORTIZED  — freight is spread over the purchase lot, so a tiny customer order
 *              absorbs only its share. This is the method §62 itself uses:
 *              100 freight over 50 sqm is 2/sqm, turning 29 into 31.
 * FULL_ORDER — the order triggers a dedicated purchase, so it carries all the
 *              freight. Appropriate for large jobs.
 */
export type ShippingAllocation = "AMORTIZED" | "FULL_ORDER";

// ──────────────────────────── warnings ────────────────────────────

export type WarningCode =
  | "MINIMUM_ORDER_APPLIED"
  | "NEGATIVE_CONTRIBUTION"
  | "MARGIN_TARGET_UNREACHABLE"
  | "NO_VALID_SUPPLIER_PRICE"
  | "SUPPLIER_MINIMUM_NOT_MET"
  | "PURCHASE_LOT_MISSING"
  | "QUANTITY_OUTSIDE_TIERS"
  | "OVERLAPPING_TIERS"
  | "MIXED_CURRENCIES"
  | "WEIGHT_MISSING_FOR_SHIPPING"
  | "PRINTING_INCLUDED_IN_MATERIAL"
  | "AREA_NOT_AVAILABLE"
  | "FALLBACK_MATERIAL_COST_USED"
  | "NO_SUPPLIER_SELECTED";

export interface EngineWarning {
  code: WarningCode;
  /** Hebrew, user-facing. */
  message: string;
  /** SPEC sections this warning relates to, e.g. ["§25"]. */
  spec?: string[];
}

// ──────────────────────────── settings ────────────────────────────

/** §4, §5. Every value here is editable data — never a literal in engine code (§70). */
export interface BusinessSettings {
  currency: string;
  /** Percent, e.g. 18 — not a fraction. */
  vatRate: Numeric;
  averageSalesInclVat: Numeric;
  averageWages: Numeric;
  employeeHourlyWage: Numeric;
  employerMultiplier: Numeric;
  /** §6 — manual override of the derived ratio, as a fraction (0.59). */
  laborRatioOverride?: Numeric | null;
  minOrderInclVat: Numeric;
  /** §50 — fraction, e.g. 0.30. */
  targetContributionMargin: Numeric;
  targetSqmPriceInclVat: Numeric;
  /** §27 fallback only; the real cost comes from suppliers. */
  defaultMaterialCostPerSqm: Numeric;
  /** Lot size used to amortize freight when a price row sets none. */
  defaultPurchaseLotQuantity: Numeric;
  displayRounding?: number;
}

/** §6, §7 — values derived from settings rather than stored. */
export interface DerivedSettings {
  /** 1 + vatRate/100 */
  vatMultiplier: Decimal;
  averageSalesExVat: Decimal;
  /** Fraction. Override when set, otherwise wages / salesExVat. */
  laborRatio: Decimal;
  laborRatioSource: "OVERRIDE" | "DERIVED";
  /** §7 — hourlyWage x employerMultiplier */
  employeeCostPerHour: Decimal;
}

// ───────────────────────────── inputs ─────────────────────────────

/** §21 */
export interface SizeInput {
  id?: string;
  name?: string;
  widthCm: Numeric;
  heightCm: Numeric;
  depthCm?: Numeric | null;
}

/** §19 + the cost drivers that produce the small-format premium (§31). */
export interface ProductInput {
  id?: string;
  name: string;
  pricingMethod: PricingMethod;
  laborMethod: LaborMethod;
  /** §19 — overrides settings.targetContributionMargin when set. */
  targetMargin?: Numeric | null;
  /** §25 — overrides settings.minOrderInclVat when set. */
  minimumOrder?: Numeric | null;

  /** §31 — fixed per-order handling that makes small formats cost more per sqm. */
  setupFee?: Numeric;
  handlingCostPerUnit?: Numeric;
  /** §35 — ignored when the supplier price already includes printing. */
  printingCostPerSqm?: Numeric;
  /** §36 — per-unit cost, or hours; use one. */
  cuttingCostPerUnit?: Numeric;
  cuttingHoursPerUnit?: Numeric;
  /** §8B / §8C */
  laborHoursPerUnit?: Numeric;
  laborFixedCost?: Numeric;

  /** For PricingMethod KG — weight of one unit. */
  weightKgPerUnit?: Numeric | null;
  /** For PricingMethod CUSTOM — billable measure of one unit. */
  customMeasurePerUnit?: Numeric | null;
}

/** §23 — one row of the sell-side price list. */
export interface QuantityTierInput {
  id?: string;
  minQuantity: number;
  /** null = open-ended. The last tier is 301+ (C3). */
  maxQuantity: number | null;
  unitPriceInclVat: Numeric;
}

/** §9 + §80 */
export interface SupplierInput {
  id: string;
  name: string;
  /** §9 default freight; a price row may override it. */
  deliveryCost?: Numeric;
  minimumOrderValue?: Numeric;
  shippingType?: ShippingType;
  freeShippingThreshold?: Numeric | null;
  active?: boolean;
}

/** §12 — one supplier price row: a quantity tier (§13) within a validity window (§17). */
export interface SupplierPriceInput {
  id?: string;
  supplierId: string;
  materialId?: string;
  unit: PricingUnit;
  unitPrice: Numeric;
  currency?: string;

  /** §13 tier bounds, expressed in `unit`. */
  minimumQuantity?: Numeric;
  maximumQuantity?: Numeric | null;

  /** §16 — override the supplier defaults for this row. */
  deliveryCost?: Numeric | null;
  shippingType?: ShippingType | null;
  freeShippingThreshold?: Numeric | null;
  /** C2 — lot size freight is amortized over. Falls back to settings. */
  purchaseLotQuantity?: Numeric | null;
  /** Required by ShippingType BY_WEIGHT. */
  weightKgPerUnit?: Numeric | null;
  /** §15 supplier_additional_costs — per purchase order. */
  additionalCostPerOrder?: Numeric;
  /** §27/§35 — printing already inside unitPrice, so printingCost must be 0. */
  includesPrinting?: boolean;

  /** §17 */
  validFrom?: Date | string;
  validUntil?: Date | string | null;
  active?: boolean;
}

/** §37 */
export interface AdditionalCostInput {
  id?: string;
  name: string;
  scope: AdditionalCostScope;
  amount: Numeric;
}

/** §58 input. */
export interface QuoteInput {
  settings: BusinessSettings;
  product: ProductInput;
  size?: SizeInput | null;
  quantity: number;

  /** §23/§24 — the active price list rows for this product/size. */
  quantityTiers: QuantityTierInput[];
  /** Bypasses tier lookup; used by recommendPrice and by manual overrides. */
  unitPriceInclVatOverride?: Numeric | null;

  /** §14 */
  supplierMode?: SupplierSelectionMode;
  /** Required when supplierMode is MANUAL. */
  selectedSupplierId?: string | null;
  suppliers?: SupplierInput[];
  supplierPrices?: SupplierPriceInput[];

  /** C2 — defaults to AMORTIZED. */
  shippingAllocation?: ShippingAllocation;

  additionalCosts?: AdditionalCostInput[];

  /** §17 — which price was in force. Defaults to now. */
  asOf?: Date;
}

// ───────────────────────────── outputs ─────────────────────────────

export interface MeasureResult {
  pricingMethod: PricingMethod;
  /** Billable measure of one unit, in the method's own unit. */
  measurePerUnit: Decimal;
  measureUnit: PricingUnit;
  totalMeasure: Decimal;
  /** Derived from dimensions whenever they exist, regardless of pricing method (§22). */
  areaSqmPerUnit: Decimal | null;
  totalAreaSqm: Decimal | null;
  warnings: EngineWarning[];
}

export interface SelectedTier {
  minQuantity: number;
  maxQuantity: number | null;
  unitPriceInclVat: Decimal;
}

/** §15, §45 — what the chosen supplier actually costs for this order. */
export interface SupplierCostResult {
  supplierId: string;
  supplierName: string;
  currency: string;
  /** §13 — the tier price per unit, before freight. */
  unitPrice: Decimal;
  tierMinimumQuantity: Decimal;
  tierMaximumQuantity: Decimal | null;
  /** Quantity used for tier selection and freight amortization. */
  purchaseQuantity: Decimal;
  purchaseLotQuantity: Decimal | null;
  /** Freight for the whole purchase, before allocation. */
  shippingCostFull: Decimal;
  /** Freight actually charged to this order. */
  shippingCharged: Decimal;
  additionalCostCharged: Decimal;
  /** unitPrice + allocated freight + allocated surcharge, per unit. */
  effectiveUnitCost: Decimal;
  /** Cost of the material this order consumes. */
  materialCost: Decimal;
  /** §15 — materialCost + shippingCharged + additionalCostCharged. */
  effectivePurchaseCost: Decimal;
  includesPrinting: boolean;
  allocation: ShippingAllocation;
  priceRowId?: string;
  warnings: EngineWarning[];
}

export interface CostBreakdown {
  materialCost: Decimal;
  shippingCost: Decimal;
  printingCost: Decimal;
  cuttingCost: Decimal;
  laborCost: Decimal;
  additionalCost: Decimal;
  setupCost: Decimal;
  handlingCost: Decimal;
}

/** §58 output. The §58 key names are preserved exactly. */
export interface QuoteResult {
  quantity: number;
  areaPerUnit: Decimal | null;
  totalArea: Decimal | null;

  supplier: SupplierCostResult | null;
  purchasePrice: Decimal | null;
  shippingCost: Decimal;
  effectivePurchaseCost: Decimal | null;

  unitPriceInclVat: Decimal;
  totalPriceInclVat: Decimal;
  totalPriceExVat: Decimal;

  materialCost: Decimal;
  printingCost: Decimal;
  cuttingCost: Decimal;
  laborCost: Decimal;
  additionalCost: Decimal;
  totalCost: Decimal;

  contribution: Decimal;
  /** Percent, e.g. 38.17 (§42). */
  contributionMargin: Decimal;

  effectivePricePerSqmInclVat: Decimal | null;
  effectivePricePerSqmExVat: Decimal | null;

  warnings: EngineWarning[];

  // Context beyond §58, so the UI never recomputes anything itself.
  measure: MeasureResult;
  tier: SelectedTier | null;
  derivedSettings: DerivedSettings;
  breakdown: CostBreakdown;
  minimumOrderApplied: boolean;
  shippingAllocation: ShippingAllocation;
  engineVersion: string;
}
