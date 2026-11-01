import { d, max, Decimal, ONE, ZERO } from "./money.js";
import { calculateQuote } from "./calculateQuote.js";
import type { EngineWarning, QuoteInput, QuoteResult } from "./types.js";

export interface RecommendPriceResult {
  /** §50 */
  recommendedPriceInclVat: Decimal;
  recommendedUnitPriceInclVat: Decimal;
  recommendedPriceExVat: Decimal;
  /** Which constraint set the price. */
  drivenBy: "MARGIN_TARGET" | "MINIMUM_ORDER" | "TARGET_SQM_PRICE";
  targetMargin: Decimal;
  /** Costs that do not scale with the sale price. */
  fixedCosts: Decimal;
  /** Share of the price consumed by price-dependent labor (§8A). */
  priceDependentRatio: Decimal;
  /** The quote recalculated at the recommended price, so the UI can show its effect. */
  quoteAtRecommendedPrice: QuoteResult | null;
  warnings: EngineWarning[];
}

/**
 * §50 — the sale price that reaches the target contribution margin.
 *
 * §8A defines labor as a share of the sale price while §50 asks to derive the
 * price from the cost. Added together that is circular, so it must be inverted.
 * With `f` the costs that do not depend on price, `r` the labor ratio and `m` the
 * target margin:
 *
 *   price_ex = f + r x price_ex + m x price_ex
 *   price_ex x (1 - r - m) = f
 *   price_ex = f / (1 - r - m)
 *
 * The denominator is the trap. With the §5 defaults r = 0.59, and a 30% target
 * leaves 0.11 — so the price is roughly nine times the fixed cost and extremely
 * sensitive to both inputs. At r + m >= 1 no price works at all: every extra
 * shekel of revenue brings at least a shekel of cost. That case returns a warning
 * instead of a meaningless number.
 *
 * §31 and §6 matter here too. For a small format the material cost is tiny
 * (15x21 at 45/sqm is 1.4175), so without setup and handling costs this formula
 * recommends about 15 incl. VAT against a 59 price list entry. The recommendation
 * is only as good as the fixed costs recorded on the product.
 *
 * §51 — this never writes to a price list. It reports a number; the user decides.
 */
export function recommendPrice(input: QuoteInput): RecommendPriceResult {
  const warnings: EngineWarning[] = [];

  // Isolate the costs that do not depend on the sale price by pricing the order at
  // zero. The order minimum must be neutralised at the same time: §25 would
  // otherwise lift the price to 59, and PERCENT labor on that 59 would be counted
  // as a fixed cost, inflating every recommendation.
  const atZero = calculateQuote({
    ...input,
    unitPriceInclVatOverride: 0,
    settings: { ...input.settings, minOrderInclVat: 0 },
    product: { ...input.product, minimumOrder: 0 },
  });
  warnings.push(
    ...atZero.warnings.filter(
      (w) => w.code !== "MINIMUM_ORDER_APPLIED" && w.code !== "NEGATIVE_CONTRIBUTION",
    ),
  );

  const derived = atZero.derivedSettings;
  const targetMargin = d(
    input.product.targetMargin ?? input.settings.targetContributionMargin,
    0,
  );

  // At price zero with no minimum, PERCENT labor contributes nothing, so totalCost
  // is exactly the price-independent part: material, freight, printing, cutting,
  // setup, handling, additional costs, and any fixed or hourly labor.
  const fixedCosts = atZero.totalCost;
  const priceDependentRatio =
    input.product.laborMethod === "HOURLY" ? ZERO : derived.laborRatio;

  const denominator = ONE.minus(priceDependentRatio).minus(targetMargin);

  const minimumOrderInclVat = d(
    input.product.minimumOrder ?? input.settings.minOrderInclVat,
    0,
  );
  const targetSqmPrice = d(input.settings.targetSqmPriceInclVat, 0);
  const areaFloorInclVat =
    atZero.totalArea === null ? ZERO : targetSqmPrice.times(atZero.totalArea);

  let priceExVatFromMargin: Decimal;

  if (denominator.lessThanOrEqualTo(ZERO)) {
    warnings.push({
      code: "MARGIN_TARGET_UNREACHABLE",
      message:
        `יחס העבודה (${derived.laborRatio.times(100).toDecimalPlaces(2).toFixed()}%) ויעד התרומה ` +
        `(${targetMargin.times(100).toDecimalPlaces(2).toFixed()}%) מסתכמים ב-100% או יותר, ולכן אין מחיר ` +
        `שמשיג את היעד. יש להקטין את יעד התרומה או את יחס העבודה.`,
      spec: ["§8", "§50"],
    });
    priceExVatFromMargin = ZERO;
  } else {
    priceExVatFromMargin = fixedCosts.dividedBy(denominator);
  }

  const priceInclVatFromMargin = priceExVatFromMargin.times(derived.vatMultiplier);

  // §50 takes the highest of the three floors it lists.
  let recommendedPriceInclVat = priceInclVatFromMargin;
  let drivenBy: RecommendPriceResult["drivenBy"] = "MARGIN_TARGET";

  if (minimumOrderInclVat.greaterThan(recommendedPriceInclVat)) {
    recommendedPriceInclVat = minimumOrderInclVat;
    drivenBy = "MINIMUM_ORDER";
  }
  if (areaFloorInclVat.greaterThan(recommendedPriceInclVat)) {
    recommendedPriceInclVat = areaFloorInclVat;
    drivenBy = "TARGET_SQM_PRICE";
  }

  const qty = d(input.quantity);
  const recommendedUnitPriceInclVat = qty.greaterThan(ZERO)
    ? recommendedPriceInclVat.dividedBy(qty)
    : recommendedPriceInclVat;

  // Recalculate at the recommendation so the caller sees the resulting contribution.
  const quoteAtRecommendedPrice = recommendedPriceInclVat.greaterThan(ZERO)
    ? calculateQuote({ ...input, unitPriceInclVatOverride: recommendedUnitPriceInclVat })
    : null;

  return {
    recommendedPriceInclVat,
    recommendedUnitPriceInclVat,
    recommendedPriceExVat: recommendedPriceInclVat.dividedBy(derived.vatMultiplier),
    drivenBy,
    targetMargin,
    fixedCosts,
    priceDependentRatio,
    quoteAtRecommendedPrice,
    warnings,
  };
}

export { max };
