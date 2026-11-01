import { d, divide, Decimal, HUNDRED, ZERO } from "./money.js";
import { computeSupplierCost } from "./supplier.js";
import type {
  BusinessSettings,
  EngineWarning,
  SupplierCostResult,
  SupplierInput,
  SupplierPriceInput,
} from "./types.js";

export interface SupplierComparisonRow extends SupplierCostResult {
  /** §46 — effective cost per unit for the quantity entered. */
  effectiveCostPerUnit: Decimal | null;
  isCheapest: boolean;
  meetsMinimum: boolean;
}

export interface SupplierComparison {
  quantity: Decimal;
  rows: SupplierComparisonRow[];
  warnings: EngineWarning[];
}

/**
 * §46, §63 — rank suppliers by effective cost for a concrete purchase quantity.
 *
 * Here the quantity entered IS the purchase quantity, so freight divides by it
 * directly and FULL_ORDER is the right allocation. That reproduces §62 exactly:
 * supplier A at 29 plus 100 freight over 50 sqm, and supplier B at 31 with no
 * freight, both come to 1550 and an effective 31/sqm — which is the point §63
 * makes about asking who is cheapest for *this* order rather than in the abstract.
 */
export function compareSuppliers(args: {
  suppliers: readonly SupplierInput[];
  priceRows: readonly SupplierPriceInput[];
  quantity: Decimal | string | number;
  settings: BusinessSettings;
  asOf?: Date;
  totalAreaSqm?: Decimal | null;
}): SupplierComparison {
  const quantity = d(args.quantity);
  const asOf = args.asOf ?? new Date();
  const warnings: EngineWarning[] = [];

  const computed = args.suppliers
    .filter((s) => s.active !== false)
    .map((supplier) =>
      computeSupplierCost({
        supplier,
        priceRows: args.priceRows,
        chargeQuantity: quantity,
        allocation: "FULL_ORDER",
        settings: args.settings,
        asOf,
        totalAreaSqm: args.totalAreaSqm ?? null,
      }),
    )
    .filter((c): c is SupplierCostResult => c !== null)
    .sort((a, b) => a.effectivePurchaseCost.comparedTo(b.effectivePurchaseCost));

  if (computed.length === 0) {
    warnings.push({
      code: "NO_VALID_SUPPLIER_PRICE",
      message: "אין ספק עם מחיר תקף לחומר הזה בתאריך המבוקש.",
      spec: ["§17", "§46"],
    });
    return { quantity, rows: [], warnings };
  }

  const cheapest = computed[0]!.effectivePurchaseCost;

  const rows: SupplierComparisonRow[] = computed.map((c) => ({
    ...c,
    effectiveCostPerUnit: divide(c.effectivePurchaseCost, quantity),
    // Ties share the highlight: §62's two suppliers are genuinely equal.
    isCheapest: c.effectivePurchaseCost.equals(cheapest),
    meetsMinimum: c.warnings.every((w) => w.code !== "SUPPLIER_MINIMUM_NOT_MET"),
  }));

  return { quantity, rows, warnings };
}

/**
 * §48, §49 — what a purchase-price change does to cost and contribution.
 *
 * §51 is the rule this serves: the system reports the impact and never rewrites a
 * price list on its own.
 */
export function priceChangeImpact(args: {
  previousUnitCost: Decimal | string | number;
  newUnitCost: Decimal | string | number;
  quantity: Decimal | string | number;
  priceExVat: Decimal | string | number;
  otherCosts: Decimal | string | number;
}): {
  previousUnitCost: Decimal;
  newUnitCost: Decimal;
  deltaPerUnit: Decimal;
  deltaPercent: Decimal | null;
  previousContribution: Decimal;
  newContribution: Decimal;
  contributionDelta: Decimal;
  previousMarginPercent: Decimal | null;
  newMarginPercent: Decimal | null;
} {
  const prev = d(args.previousUnitCost);
  const next = d(args.newUnitCost);
  const qty = d(args.quantity);
  const priceExVat = d(args.priceExVat);
  const other = d(args.otherCosts);

  const previousContribution = priceExVat.minus(prev.times(qty)).minus(other);
  const newContribution = priceExVat.minus(next.times(qty)).minus(other);

  const prevMargin = divide(previousContribution, priceExVat);
  const newMargin = divide(newContribution, priceExVat);

  return {
    previousUnitCost: prev,
    newUnitCost: next,
    deltaPerUnit: next.minus(prev),
    deltaPercent: prev.isZero() ? null : next.minus(prev).dividedBy(prev).times(HUNDRED),
    previousContribution,
    newContribution,
    contributionDelta: newContribution.minus(previousContribution),
    previousMarginPercent: prevMargin === null ? null : prevMargin.times(HUNDRED),
    newMarginPercent: newMargin === null ? null : newMargin.times(HUNDRED),
  };
}

export { ZERO };
