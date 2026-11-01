import { d, divide, max, Decimal, ZERO } from "./money.js";
import { resolveShipping } from "./shipping.js";
import { selectSupplierPriceRow } from "./tiers.js";
import type {
  BusinessSettings,
  EngineWarning,
  ShippingAllocation,
  ShippingType,
  SupplierCostResult,
  SupplierInput,
  SupplierPriceInput,
} from "./types.js";

export interface SupplierCostRequest {
  supplier: SupplierInput;
  priceRows: readonly SupplierPriceInput[];
  /** Measure this order actually consumes, in the material's pricing unit. */
  chargeQuantity: Decimal;
  allocation: ShippingAllocation;
  settings: BusinessSettings;
  asOf: Date;
  /** Area of the order, for ShippingType BY_AREA. */
  totalAreaSqm?: Decimal | null;
  /** Expected currency; a mismatch is flagged rather than silently converted. */
  expectedCurrency?: string;
}

/**
 * §15, §62 — what one supplier really costs for this order.
 *
 * §63 states the question precisely: not "who sells cheapest?" but "who gives the
 * lowest effective cost for this order?". Two decisions make that computable:
 *
 * 1. Which tier applies. We buy at least a lot, and more if the order is larger,
 *    so the tier is chosen at `max(chargeQuantity, purchaseLotQuantity)`. Using the
 *    lot floor is the conservative choice: it never understates the unit price.
 *
 * 2. How freight is shared. AMORTIZED divides freight by that same purchase
 *    quantity, so a 0.0315 sqm order absorbs its share rather than the whole bill.
 *    This is §62's own arithmetic: 50 x 29 + 100 = 1550, i.e. 31/sqm, which is
 *    29 + 100/50. FULL_ORDER instead charges all of it, for a job that triggers a
 *    dedicated purchase.
 */
export function computeSupplierCost(req: SupplierCostRequest): SupplierCostResult | null {
  const warnings: EngineWarning[] = [];
  const { supplier, allocation, settings, asOf } = req;

  const rowsForSupplier = req.priceRows.filter((r) => r.supplierId === supplier.id);
  if (rowsForSupplier.length === 0) {
    return null;
  }

  // Lot size: the price row wins, then settings. Zero or missing is a data problem.
  const lotFromRows = rowsForSupplier
    .map((r) => r.purchaseLotQuantity)
    .find((v) => v !== null && v !== undefined);
  const settingsLot = d(settings.defaultPurchaseLotQuantity, 0);

  let purchaseLotQuantity: Decimal | null = null;
  if (lotFromRows !== null && lotFromRows !== undefined) {
    purchaseLotQuantity = d(lotFromRows);
  } else if (settingsLot.greaterThan(ZERO)) {
    purchaseLotQuantity = settingsLot;
  }

  if (purchaseLotQuantity === null || purchaseLotQuantity.lessThanOrEqualTo(ZERO)) {
    warnings.push({
      code: "PURCHASE_LOT_MISSING",
      message: "לא הוגדרה כמות רכש לפריסת הובלה. ההובלה הועמסה במלואה על ההזמנה.",
      spec: ["§15", "§16"],
    });
    purchaseLotQuantity = null;
  }

  // Decision 1: the quantity that drives tier selection and freight sharing.
  const purchaseQuantity =
    allocation === "AMORTIZED" && purchaseLotQuantity !== null
      ? max(req.chargeQuantity, purchaseLotQuantity)
      : req.chargeQuantity;

  const { row, warnings: rowWarnings } = selectSupplierPriceRow(
    rowsForSupplier,
    purchaseQuantity,
    asOf,
  );
  warnings.push(...rowWarnings);
  if (row === null) {
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      currency: req.expectedCurrency ?? settings.currency,
      unitPrice: ZERO,
      tierMinimumQuantity: ZERO,
      tierMaximumQuantity: null,
      purchaseQuantity,
      purchaseLotQuantity,
      shippingCostFull: ZERO,
      shippingCharged: ZERO,
      additionalCostCharged: ZERO,
      effectiveUnitCost: ZERO,
      materialCost: ZERO,
      effectivePurchaseCost: ZERO,
      includesPrinting: false,
      allocation,
      warnings,
    };
  }

  const unitPrice = d(row.unitPrice);
  const rowCurrency = row.currency ?? settings.currency;
  const expectedCurrency = req.expectedCurrency ?? settings.currency;
  if (rowCurrency !== expectedCurrency) {
    warnings.push({
      code: "MIXED_CURRENCIES",
      message: `מחיר הספק נקוב ב-${rowCurrency} והמערכת עובדת ב-${expectedCurrency}. אין המרת מטבע, ולכן אין להשוות ספקים אלה.`,
      spec: ["§12"],
    });
  }

  // §16 — freight for the purchase. A price row may override the supplier default.
  const shippingType: ShippingType =
    row.shippingType ?? supplier.shippingType ?? "FLAT";
  const baseFreight =
    row.deliveryCost !== null && row.deliveryCost !== undefined
      ? d(row.deliveryCost)
      : d(supplier.deliveryCost, 0);
  const freeThreshold =
    row.freeShippingThreshold !== null && row.freeShippingThreshold !== undefined
      ? d(row.freeShippingThreshold)
      : supplier.freeShippingThreshold !== null && supplier.freeShippingThreshold !== undefined
        ? d(supplier.freeShippingThreshold)
        : null;

  const purchaseMaterialValue = unitPrice.times(purchaseQuantity);

  const shipping = resolveShipping({
    shippingType,
    shippingCost: baseFreight,
    freeShippingThreshold: freeThreshold,
    quantity: purchaseQuantity,
    materialValue: purchaseMaterialValue,
    weightKgPerUnit:
      row.weightKgPerUnit === null || row.weightKgPerUnit === undefined
        ? null
        : d(row.weightKgPerUnit),
    totalAreaSqm: req.totalAreaSqm ?? null,
  });
  warnings.push(...shipping.warnings);

  const shippingCostFull = shipping.cost;
  const additionalPerOrder = d(row.additionalCostPerOrder, 0);

  // §9 — a supplier minimum the purchase does not reach is a real constraint.
  const supplierMinimum = d(supplier.minimumOrderValue, 0);
  if (supplierMinimum.greaterThan(ZERO) && purchaseMaterialValue.lessThan(supplierMinimum)) {
    warnings.push({
      code: "SUPPLIER_MINIMUM_NOT_MET",
      message: `שווי הרכש ${purchaseMaterialValue.toDecimalPlaces(2).toFixed()} נמוך ממינימום ההזמנה של הספק (${supplierMinimum.toDecimalPlaces(2).toFixed()}).`,
      spec: ["§9", "§47"],
    });
  }

  // Decision 2: how much of the freight and surcharge this order carries.
  let shippingCharged: Decimal;
  let additionalCostCharged: Decimal;
  let effectiveUnitCost: Decimal;
  let materialCost: Decimal;

  if (allocation === "AMORTIZED" && purchaseQuantity.greaterThan(ZERO)) {
    const shippingPerUnit = divide(shippingCostFull, purchaseQuantity) ?? ZERO;
    const additionalPerUnit = divide(additionalPerOrder, purchaseQuantity) ?? ZERO;
    effectiveUnitCost = unitPrice.plus(shippingPerUnit).plus(additionalPerUnit);
    materialCost = unitPrice.times(req.chargeQuantity);
    shippingCharged = shippingPerUnit.times(req.chargeQuantity);
    additionalCostCharged = additionalPerUnit.times(req.chargeQuantity);
  } else {
    // FULL_ORDER, or a degenerate zero-quantity purchase.
    effectiveUnitCost = purchaseQuantity.greaterThan(ZERO)
      ? unitPrice
          .plus(divide(shippingCostFull, purchaseQuantity) ?? ZERO)
          .plus(divide(additionalPerOrder, purchaseQuantity) ?? ZERO)
      : unitPrice;
    materialCost = unitPrice.times(req.chargeQuantity);
    shippingCharged = shippingCostFull;
    additionalCostCharged = additionalPerOrder;
  }

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    currency: rowCurrency,
    unitPrice,
    tierMinimumQuantity: d(row.minimumQuantity, 0),
    tierMaximumQuantity:
      row.maximumQuantity === null || row.maximumQuantity === undefined
        ? null
        : d(row.maximumQuantity),
    purchaseQuantity,
    purchaseLotQuantity,
    shippingCostFull,
    shippingCharged,
    additionalCostCharged,
    effectiveUnitCost,
    materialCost,
    // §15 — effective_purchase_cost = material + allocated shipping + supplier extras
    effectivePurchaseCost: materialCost.plus(shippingCharged).plus(additionalCostCharged),
    includesPrinting: row.includesPrinting === true,
    allocation,
    priceRowId: row.id,
    warnings,
  };
}

export interface SupplierChoice {
  chosen: SupplierCostResult | null;
  /** Every candidate, ordered cheapest effective cost first (§46). */
  candidates: SupplierCostResult[];
  warnings: EngineWarning[];
}

/**
 * §14, §47 — AUTO picks the lowest effective cost; MANUAL honours the user's choice.
 *
 * §47 is explicit that a manual choice is never silently replaced, so MANUAL
 * returns the requested supplier even when a cheaper one exists. The full ranked
 * list is still returned so the UI can show what the alternatives would have cost.
 */
export function chooseSupplier(
  req: Omit<SupplierCostRequest, "supplier"> & {
    suppliers: readonly SupplierInput[];
    mode: "MANUAL" | "AUTO";
    selectedSupplierId?: string | null;
  },
): SupplierChoice {
  const warnings: EngineWarning[] = [];
  const active = req.suppliers.filter((s) => s.active !== false);

  const candidates = active
    .map((supplier) => computeSupplierCost({ ...req, supplier }))
    .filter((c): c is SupplierCostResult => c !== null)
    .sort((a, b) => a.effectivePurchaseCost.comparedTo(b.effectivePurchaseCost));

  if (candidates.length === 0) {
    warnings.push({
      code: "NO_VALID_SUPPLIER_PRICE",
      message: "אין ספק עם מחיר תקף לחומר הזה. נעשה שימוש בעלות ברירת המחדל מההגדרות.",
      spec: ["§15", "§27"],
    });
    return { chosen: null, candidates: [], warnings };
  }

  if (req.mode === "MANUAL") {
    const wanted = candidates.find((c) => c.supplierId === req.selectedSupplierId);
    if (wanted === undefined) {
      warnings.push({
        code: "NO_SUPPLIER_SELECTED",
        message: "הספק שנבחר ידנית אינו מציע מחיר תקף לחומר הזה.",
        spec: ["§14"],
      });
      return { chosen: null, candidates, warnings };
    }
    return { chosen: wanted, candidates, warnings };
  }

  return { chosen: candidates[0]!, candidates, warnings };
}
