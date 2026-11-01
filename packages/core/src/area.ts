import { d, divide, Decimal, ONE, ZERO } from "./money.js";
import type { EngineWarning, MeasureResult, PricingMethod, PricingUnit, ProductInput, SizeInput } from "./types.js";

/** Square centimetres in a square metre — a unit conversion, not a business value. */
const SQCM_PER_SQM = 10_000;
const CM_PER_M = 100;

/**
 * §22 — area of one unit in square metres.
 *
 *   area_sqm = width_cm x height_cm / 10000
 *
 * 15 x 21 / 10000 = 0.0315, exactly as §22 and §61 state.
 */
export function areaSqm(size: Pick<SizeInput, "widthCm" | "heightCm">): Decimal {
  return d(size.widthCm).times(d(size.heightCm)).dividedBy(SQCM_PER_SQM);
}

/**
 * Running length of one unit in metres.
 *
 * §22 defines area only, so the running dimension for LINEAR_METER products is a
 * modelling choice: we take `widthCm` as the running length and ignore height.
 * A size for a linear-metre product should therefore put the length in width.
 */
export function linearMeters(size: Pick<SizeInput, "widthCm">): Decimal {
  return d(size.widthCm).dividedBy(CM_PER_M);
}

/**
 * Resolve the billable measure for a product (§20, §33), and the area whenever
 * dimensions allow it — §43 needs area to report an effective price per sqm even
 * for products that are not priced by area.
 */
export function resolveMeasure(
  product: ProductInput,
  size: SizeInput | null | undefined,
  quantity: number,
): MeasureResult {
  const warnings: EngineWarning[] = [];
  const qty = d(quantity);

  // Area is derived from dimensions regardless of pricing method (§22, §43).
  const hasDimensions =
    size !== null &&
    size !== undefined &&
    d(size.widthCm).greaterThan(ZERO) &&
    d(size.heightCm).greaterThan(ZERO);

  const areaSqmPerUnit = hasDimensions ? areaSqm(size) : null;
  const totalAreaSqm = areaSqmPerUnit === null ? null : areaSqmPerUnit.times(qty);

  const method: PricingMethod = product.pricingMethod;
  let measurePerUnit: Decimal;
  let measureUnit: PricingUnit;

  switch (method) {
    case "SQM": {
      if (areaSqmPerUnit === null) {
        warnings.push({
          code: "AREA_NOT_AVAILABLE",
          message: 'מוצר מתומחר לפי מ"ר אך לא הוגדרו מידות. השטח חושב כאפס.',
          spec: ["§20", "§22"],
        });
        measurePerUnit = ZERO;
      } else {
        measurePerUnit = areaSqmPerUnit;
      }
      measureUnit = "SQM";
      break;
    }
    case "LINEAR_METER": {
      if (!hasDimensions) {
        warnings.push({
          code: "AREA_NOT_AVAILABLE",
          message: "מוצר מתומחר לפי מטר רץ אך לא הוגדר אורך. האורך חושב כאפס.",
          spec: ["§20"],
        });
        measurePerUnit = ZERO;
      } else {
        measurePerUnit = linearMeters(size);
      }
      measureUnit = "LINEAR_METER";
      break;
    }
    case "UNIT": {
      measurePerUnit = ONE;
      measureUnit = "UNIT";
      break;
    }
    case "KG": {
      const weight = product.weightKgPerUnit;
      if (weight === null || weight === undefined) {
        warnings.push({
          code: "AREA_NOT_AVAILABLE",
          message: "מוצר מתומחר לפי משקל אך לא הוגדר משקל ליחידה. המשקל חושב כאפס.",
          spec: ["§20"],
        });
        measurePerUnit = ZERO;
      } else {
        measurePerUnit = d(weight);
      }
      measureUnit = "KG";
      break;
    }
    case "HOUR": {
      measurePerUnit = d(product.laborHoursPerUnit, 0);
      measureUnit = "HOUR";
      break;
    }
    case "CUSTOM": {
      measurePerUnit = d(product.customMeasurePerUnit, 0);
      measureUnit = "UNIT";
      break;
    }
  }

  return {
    pricingMethod: method,
    measurePerUnit,
    measureUnit,
    totalMeasure: measurePerUnit.times(qty),
    areaSqmPerUnit,
    totalAreaSqm,
    warnings,
  };
}

/** §43 — effective price per square metre, or null when there is no area. */
export function effectivePricePerSqm(price: Decimal, totalAreaSqm: Decimal | null): Decimal | null {
  if (totalAreaSqm === null) return null;
  return divide(price, totalAreaSqm);
}
