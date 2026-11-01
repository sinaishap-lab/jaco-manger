import { d, Decimal, ZERO } from "./money.js";
import type { DerivedSettings, LaborMethod, ProductInput } from "./types.js";

export interface LaborResult {
  cost: Decimal;
  method: LaborMethod;
  /** Share of cost that scales with the sale price — needed to invert the sum (§50). */
  priceDependentRatio: Decimal;
  /** Share of cost that does not depend on the sale price. */
  fixedComponent: Decimal;
  hours: Decimal;
}

/**
 * §8, §38, §39 — labor cost by method.
 *
 * The decomposition into `priceDependentRatio` and `fixedComponent` is what lets
 * recommendPrice invert the circular definition in §50: when labor is a percentage
 * of the sale price, the price cannot be derived by simply adding costs up (C5).
 */
export function computeLabor(
  product: ProductInput,
  derived: DerivedSettings,
  quantity: Decimal,
  priceExVat: Decimal,
): LaborResult {
  const method = product.laborMethod;
  const hours = d(product.laborHoursPerUnit, 0).times(quantity);
  const hourlyCost = hours.times(derived.employeeCostPerHour);
  const fixed = d(product.laborFixedCost, 0);

  switch (method) {
    case "PERCENT": {
      // §8A / §38 — the default.
      return {
        cost: priceExVat.times(derived.laborRatio),
        method,
        priceDependentRatio: derived.laborRatio,
        fixedComponent: ZERO,
        hours: ZERO,
      };
    }
    case "HOURLY": {
      // §8B / §39
      return {
        cost: hourlyCost,
        method,
        priceDependentRatio: ZERO,
        fixedComponent: hourlyCost,
        hours,
      };
    }
    case "COMBINED": {
      // §8C — a fixed floor, plus hours, plus a share of the sale price.
      const priceComponent = priceExVat.times(derived.laborRatio);
      return {
        cost: fixed.plus(hourlyCost).plus(priceComponent),
        method,
        priceDependentRatio: derived.laborRatio,
        fixedComponent: fixed.plus(hourlyCost),
        hours,
      };
    }
  }
}
