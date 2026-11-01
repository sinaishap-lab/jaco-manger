import { d, divide, max, sum, Decimal, HUNDRED, ZERO } from "./money.js";
import { deriveSettings, toExVat } from "./settings.js";
import { effectivePricePerSqm, resolveMeasure } from "./area.js";
import { selectQuantityTier } from "./tiers.js";
import { chooseSupplier } from "./supplier.js";
import { computeLabor } from "./labor.js";
import type {
  AdditionalCostInput,
  CostBreakdown,
  EngineWarning,
  QuoteInput,
  QuoteResult,
  SupplierCostResult,
} from "./types.js";

export const ENGINE_VERSION = "1.0.0";

/**
 * §58 — the single calculation engine.
 *
 * Nothing else in the system may reproduce these formulas: the API and the UI
 * both call this function. It is pure — every input, including business settings
 * and supplier prices, is passed in, so it is fully testable without a database.
 *
 * Order of operations follows §32-§43, with two corrections to the SPEC:
 *
 *  - §40 omits freight from total_cost even though §15 computes it and §58 lists
 *    `shippingCost` in the output. Freight is included here, otherwise the shop
 *    compares suppliers on freight and then reports a contribution that ignores it.
 *  - §8A makes labor a function of price while §50 derives price from cost, which
 *    is circular. calculateQuote takes the price as given, so it is unaffected;
 *    recommendPrice inverts the relation algebraically.
 */
export function calculateQuote(input: QuoteInput): QuoteResult {
  const warnings: EngineWarning[] = [];
  const asOf = input.asOf ?? new Date();
  const allocation = input.shippingAllocation ?? "AMORTIZED";
  const quantity = input.quantity;
  const qty = d(quantity);

  // ── 1. settings (§5, §6, §7) ──────────────────────────────────────────────
  const derived = deriveSettings(input.settings);

  // ── 2. measure and area (§22, §33) ────────────────────────────────────────
  const measure = resolveMeasure(input.product, input.size, quantity);
  warnings.push(...measure.warnings);

  // ── 3. sell-side tier (§23, §24) ──────────────────────────────────────────
  let tier = null;
  let unitPriceInclVat: Decimal;

  if (input.unitPriceInclVatOverride !== null && input.unitPriceInclVatOverride !== undefined) {
    unitPriceInclVat = d(input.unitPriceInclVatOverride);
  } else {
    const selection = selectQuantityTier(input.quantityTiers, quantity);
    warnings.push(...selection.warnings);
    tier = selection.tier;
    unitPriceInclVat = tier === null ? ZERO : tier.unitPriceInclVat;
  }

  // ── 4. customer price (§25, §26, §32) ─────────────────────────────────────
  const calculatedOrderPrice = unitPriceInclVat.times(qty);
  const minimumOrderInclVat = d(
    input.product.minimumOrder ?? input.settings.minOrderInclVat,
    0,
  );
  const totalPriceInclVat = max(calculatedOrderPrice, minimumOrderInclVat);
  const minimumOrderApplied = totalPriceInclVat.greaterThan(calculatedOrderPrice);

  if (minimumOrderApplied) {
    warnings.push({
      code: "MINIMUM_ORDER_APPLIED",
      message: `המחיר המחושב ${calculatedOrderPrice.toDecimalPlaces(2).toFixed()} נמוך ממינימום ההזמנה, ולכן המחיר ללקוח הוא ${totalPriceInclVat.toDecimalPlaces(2).toFixed()}.`,
      spec: ["§25", "§26"],
    });
  }

  const totalPriceExVat = toExVat(totalPriceInclVat, derived.vatMultiplier);

  // ── 5-6. supplier and material cost (§14, §15, §34) ───────────────────────
  const suppliers = input.suppliers ?? [];
  const supplierPrices = input.supplierPrices ?? [];

  let supplier: SupplierCostResult | null = null;
  let materialCost: Decimal;
  let shippingCost: Decimal;

  if (suppliers.length > 0 && supplierPrices.length > 0) {
    const choice = chooseSupplier({
      suppliers,
      priceRows: supplierPrices,
      chargeQuantity: measure.totalMeasure,
      allocation,
      settings: input.settings,
      asOf,
      totalAreaSqm: measure.totalAreaSqm,
      mode: input.supplierMode ?? "AUTO",
      selectedSupplierId: input.selectedSupplierId ?? null,
    });
    warnings.push(...choice.warnings);
    supplier = choice.chosen;
    if (supplier !== null) warnings.push(...supplier.warnings);
  }

  if (supplier !== null) {
    materialCost = supplier.materialCost;
    shippingCost = supplier.shippingCharged.plus(supplier.additionalCostCharged);
  } else {
    // §27 — the historic per-sqm figure is a fallback, never the real purchase cost.
    const fallbackRate = d(input.settings.defaultMaterialCostPerSqm, 0);
    const basis = measure.totalAreaSqm ?? measure.totalMeasure;
    materialCost = fallbackRate.times(basis);
    shippingCost = ZERO;
    if (fallbackRate.greaterThan(ZERO)) {
      warnings.push({
        code: "FALLBACK_MATERIAL_COST_USED",
        message: `לא נבחר ספק. עלות החומר חושבה לפי ברירת המחדל ${fallbackRate.toFixed()} ליחידה, ואינה מחיר רכש אמיתי.`,
        spec: ["§27"],
      });
    }
  }

  // ── 7. printing (§35) ─────────────────────────────────────────────────────
  // Never counted twice: a supplier price that already includes printing forces zero.
  let printingCost: Decimal;
  if (supplier !== null && supplier.includesPrinting) {
    printingCost = ZERO;
    warnings.push({
      code: "PRINTING_INCLUDED_IN_MATERIAL",
      message: "מחיר הספק כולל הדפסה, ולכן עלות ההדפסה לא נוספה בנפרד.",
      spec: ["§27", "§35"],
    });
  } else {
    const rate = d(input.product.printingCostPerSqm, 0);
    printingCost = rate.times(measure.totalAreaSqm ?? ZERO);
  }

  // ── 8. cutting (§36) ──────────────────────────────────────────────────────
  const cuttingPerUnit = d(input.product.cuttingCostPerUnit, 0).times(qty);
  const cuttingHours = d(input.product.cuttingHoursPerUnit, 0).times(qty);
  const cuttingCost = cuttingPerUnit.plus(cuttingHours.times(derived.employeeCostPerHour));

  // ── 10. additional costs (§37) + setup and handling (§31) ─────────────────
  const additional = splitAdditionalCosts(
    input.additionalCosts ?? [],
    qty,
    measure.totalAreaSqm ?? ZERO,
  );
  const setupCost = d(input.product.setupFee, 0);
  const handlingCost = d(input.product.handlingCostPerUnit, 0).times(qty);
  const additionalCost = additional.plus(setupCost).plus(handlingCost);

  // ── 9. labor (§8, §38, §39) ───────────────────────────────────────────────
  const labor = computeLabor(input.product, derived, qty, totalPriceExVat);
  const laborCost = labor.cost;

  // ── 11. totals (§40, §41, §42, §43) ───────────────────────────────────────
  const totalCost = sum([
    materialCost,
    shippingCost,
    printingCost,
    cuttingCost,
    laborCost,
    additionalCost,
  ]);

  const contribution = totalPriceExVat.minus(totalCost);
  const marginFraction = divide(contribution, totalPriceExVat);
  const contributionMargin = marginFraction === null ? ZERO : marginFraction.times(HUNDRED);

  if (contribution.lessThan(ZERO)) {
    warnings.push({
      code: "NEGATIVE_CONTRIBUTION",
      message: `התרומה שלילית (${contribution.toDecimalPlaces(2).toFixed()}). המחיר אינו מכסה את העלויות.`,
      spec: ["§41"],
    });
  }

  const breakdown: CostBreakdown = {
    materialCost,
    shippingCost,
    printingCost,
    cuttingCost,
    laborCost,
    additionalCost,
    setupCost,
    handlingCost,
  };

  return {
    quantity,
    areaPerUnit: measure.areaSqmPerUnit,
    totalArea: measure.totalAreaSqm,

    supplier,
    purchasePrice: supplier === null ? null : supplier.unitPrice,
    shippingCost,
    effectivePurchaseCost: supplier === null ? null : supplier.effectivePurchaseCost,

    unitPriceInclVat,
    totalPriceInclVat,
    totalPriceExVat,

    materialCost,
    printingCost,
    cuttingCost,
    laborCost,
    additionalCost,
    totalCost,

    contribution,
    contributionMargin,

    effectivePricePerSqmInclVat: effectivePricePerSqm(totalPriceInclVat, measure.totalAreaSqm),
    effectivePricePerSqmExVat: effectivePricePerSqm(totalPriceExVat, measure.totalAreaSqm),

    warnings,

    measure,
    tier,
    derivedSettings: derived,
    breakdown,
    minimumOrderApplied,
    shippingAllocation: allocation,
    engineVersion: ENGINE_VERSION,
  };
}

/** §37 — fixed per order, per unit, or per square metre. */
export function splitAdditionalCosts(
  items: readonly AdditionalCostInput[],
  quantity: Decimal,
  totalAreaSqm: Decimal,
): Decimal {
  return items.reduce<Decimal>((acc, item) => {
    const amount = d(item.amount);
    switch (item.scope) {
      case "FIXED_ORDER":
        return acc.plus(amount);
      case "VARIABLE_UNIT":
        return acc.plus(amount.times(quantity));
      case "VARIABLE_AREA":
        return acc.plus(amount.times(totalAreaSqm));
      default:
        return acc;
    }
  }, ZERO);
}
