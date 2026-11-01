import { d, Decimal, ZERO } from "./money.js";
import type { EngineWarning, QuantityTierInput, SelectedTier, SupplierPriceInput } from "./types.js";

export interface TierSelection {
  tier: SelectedTier | null;
  warnings: EngineWarning[];
}

/**
 * §13, §24 — pick the row whose range contains `quantity`.
 *
 * A null upper bound is open-ended. §24 lists the last tier as "300+" while also
 * listing "201-300", which makes 300 ambiguous; §60 tests 300 and 301 separately,
 * so the intended last tier is 301+ (C3). The database enforces non-overlap, but
 * data loaded from elsewhere might still overlap, so when several rows match we
 * take the most specific (highest minQuantity) and say so.
 */
export function selectQuantityTier(
  tiers: readonly QuantityTierInput[],
  quantity: number,
): TierSelection {
  const warnings: EngineWarning[] = [];

  if (tiers.length === 0) {
    return {
      tier: null,
      warnings: [
        {
          code: "QUANTITY_OUTSIDE_TIERS",
          message: "לא הוגדרו מדרגות כמות למוצר ולגודל האלה.",
          spec: ["§23", "§24"],
        },
      ],
    };
  }

  const matches = tiers.filter(
    (t) => quantity >= t.minQuantity && (t.maxQuantity === null || quantity <= t.maxQuantity),
  );

  if (matches.length === 0) {
    // Fall back to the nearest tier so the user still sees a number, and flag it.
    const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const fallback = quantity < first.minQuantity ? first : last;
    warnings.push({
      code: "QUANTITY_OUTSIDE_TIERS",
      message: `הכמות ${quantity} אינה נופלת באף מדרגה. נעשה שימוש במדרגה ${fallback.minQuantity}${
        fallback.maxQuantity === null ? "+" : `–${fallback.maxQuantity}`
      }.`,
      spec: ["§24"],
    });
    return { tier: toSelected(fallback), warnings };
  }

  if (matches.length > 1) {
    warnings.push({
      code: "OVERLAPPING_TIERS",
      message: `הכמות ${quantity} נופלת ביותר ממדרגה אחת. נבחרה המדרגה הספציפית ביותר.`,
      spec: ["§24"],
    });
  }

  const chosen = matches.reduce((best, t) => (t.minQuantity > best.minQuantity ? t : best));
  return { tier: toSelected(chosen), warnings };
}

function toSelected(tier: QuantityTierInput): SelectedTier {
  return {
    minQuantity: tier.minQuantity,
    maxQuantity: tier.maxQuantity,
    unitPriceInclVat: d(tier.unitPriceInclVat),
  };
}

/** §17 — was this price row in force at `asOf`? */
export function isPriceInForce(row: SupplierPriceInput, asOf: Date): boolean {
  if (row.active === false) return false;
  const from = row.validFrom === undefined ? null : new Date(row.validFrom);
  if (from !== null && from.getTime() > asOf.getTime()) return false;
  if (row.validUntil !== null && row.validUntil !== undefined) {
    const until = new Date(row.validUntil);
    if (until.getTime() <= asOf.getTime()) return false;
  }
  return true;
}

/**
 * §13 — choose the supplier price row that applies to `quantity`.
 *
 * Only rows in force at `asOf` are considered (§17), so historic prices never
 * leak into a current calculation.
 */
export function selectSupplierPriceRow(
  rows: readonly SupplierPriceInput[],
  quantity: Decimal,
  asOf: Date,
): { row: SupplierPriceInput | null; warnings: EngineWarning[] } {
  const warnings: EngineWarning[] = [];
  const inForce = rows.filter((r) => isPriceInForce(r, asOf));

  if (inForce.length === 0) {
    return {
      row: null,
      warnings: [
        {
          code: "NO_VALID_SUPPLIER_PRICE",
          message: "אין מחיר ספק תקף לתאריך המבוקש.",
          spec: ["§17"],
        },
      ],
    };
  }

  const matches = inForce.filter((r) => {
    const lower = d(r.minimumQuantity, 0);
    if (quantity.lessThan(lower)) return false;
    if (r.maximumQuantity === null || r.maximumQuantity === undefined) return true;
    return quantity.lessThanOrEqualTo(d(r.maximumQuantity));
  });

  if (matches.length === 0) {
    // Quantity below every tier floor: use the lowest tier and flag it.
    const lowest = inForce.reduce((best, r) =>
      d(r.minimumQuantity, 0).lessThan(d(best.minimumQuantity, 0)) ? r : best,
    );
    warnings.push({
      code: "QUANTITY_OUTSIDE_TIERS",
      message: `הכמות ${quantity.toFixed()} אינה נופלת באף מדרגת מחיר של הספק. נעשה שימוש במדרגה הנמוכה ביותר.`,
      spec: ["§13"],
    });
    return { row: lowest, warnings };
  }

  // Most specific tier wins: the highest floor that still contains the quantity.
  const chosen = matches.reduce((best, r) =>
    d(r.minimumQuantity, 0).greaterThan(d(best.minimumQuantity, 0)) ? r : best,
  );

  if (matches.length > 1) {
    warnings.push({
      code: "OVERLAPPING_TIERS",
      message: "מדרגות המחיר של הספק חופפות. נבחרה המדרגה הספציפית ביותר.",
      spec: ["§13"],
    });
  }

  return { row: chosen, warnings };
}

/** True when `quantity` sits inside the row's tier bounds. */
export function quantityWithinRow(row: SupplierPriceInput, quantity: Decimal): boolean {
  const lower = d(row.minimumQuantity, 0);
  if (quantity.lessThan(lower)) return false;
  if (row.maximumQuantity === null || row.maximumQuantity === undefined) return true;
  return quantity.lessThanOrEqualTo(d(row.maximumQuantity));
}

export { ZERO };
