import { d, divide, HUNDRED, ONE, Decimal } from "./money.js";
import type { BusinessSettings, DerivedSettings } from "./types.js";

/**
 * §6, §7 — derive the values the engine needs from editable business settings.
 *
 * The labor ratio is NOT a constant. §6 derives it from turnover and wages:
 * the entered turnover includes VAT, so it must be converted first.
 *
 *   average_sales_ex_vat = average_sales_incl_vat / (1 + vat_rate/100)
 *   labor_ratio          = average_wages / average_sales_ex_vat
 *
 * With the §5 defaults: 120000 / 1.18 = 101694.9152..., and
 * 60000 / 101694.9152... = 0.59 exactly, which is where §6's 59% comes from.
 *
 * §64 — these are averages the user may change at any time; the ratio is then
 * recomputed. A manual override (§6) wins when present.
 */
export function deriveSettings(settings: BusinessSettings): DerivedSettings {
  const vatRate = d(settings.vatRate);
  const vatMultiplier = ONE.plus(vatRate.dividedBy(HUNDRED));

  if (vatMultiplier.lessThanOrEqualTo(0)) {
    throw new RangeError(
      `vatRate of ${vatRate.toFixed()} gives a non-positive VAT multiplier; prices cannot be derived (§32).`,
    );
  }

  const salesInclVat = d(settings.averageSalesInclVat);
  const averageSalesExVat = salesInclVat.dividedBy(vatMultiplier);

  let laborRatio: Decimal;
  let laborRatioSource: DerivedSettings["laborRatioSource"];

  const override = settings.laborRatioOverride;
  if (override !== null && override !== undefined && override !== "") {
    laborRatio = d(override);
    laborRatioSource = "OVERRIDE";
  } else {
    // Algebraically this is §6's wages / (salesInclVat / vatMultiplier), but
    // multiplying before dividing avoids a non-terminating intermediate: 120000 / 1.18
    // repeats forever, and dividing by the truncated result leaves a residue in the
    // last significant digit, so 60000 / (120000/1.18) comes out as 0.590...0001
    // instead of 0.59. Reordering keeps the exact values §6 and §61 depend on.
    const derived = divide(d(settings.averageWages).times(vatMultiplier), salesInclVat);
    if (derived === null) {
      throw new RangeError(
        "averageSalesInclVat must be greater than zero to derive the labor ratio (§6).",
      );
    }
    laborRatio = derived;
    laborRatioSource = "DERIVED";
  }

  // §7 — employer cost of an hour of work.
  const employeeCostPerHour = d(settings.employeeHourlyWage).times(d(settings.employerMultiplier));

  return { vatMultiplier, averageSalesExVat, laborRatio, laborRatioSource, employeeCostPerHour };
}

/** §32 — remove VAT from a customer-facing price. */
export function toExVat(priceInclVat: Decimal | string | number, vatMultiplier: Decimal): Decimal {
  return d(priceInclVat).dividedBy(vatMultiplier);
}

/** §3 — customer-facing prices are shown including VAT. */
export function toInclVat(priceExVat: Decimal | string | number, vatMultiplier: Decimal): Decimal {
  return d(priceExVat).times(vatMultiplier);
}
