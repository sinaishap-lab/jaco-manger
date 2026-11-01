import { d, Decimal, ZERO } from "./money.js";
import type { EngineWarning, ShippingType } from "./types.js";

export interface ShippingContext {
  shippingType: ShippingType;
  /** The base freight charge the type is applied to. */
  shippingCost: Decimal;
  /** §16 — free above this order value. */
  freeShippingThreshold?: Decimal | null;
  /** Quantity being purchased, in the material's pricing unit. */
  quantity: Decimal;
  /** Value of the material being purchased, used by FREE_ABOVE. */
  materialValue: Decimal;
  /** Weight of one purchased unit, required by BY_WEIGHT. */
  weightKgPerUnit?: Decimal | null;
  /** Total area being purchased, required by BY_AREA. */
  totalAreaSqm?: Decimal | null;
}

export interface ShippingResult {
  cost: Decimal;
  warnings: EngineWarning[];
}

/**
 * §16 — freight for a purchase, by model.
 *
 * This is inbound freight: supplier to the shop. Outbound delivery to the end
 * customer is out of scope and is entered as a FIXED_ORDER additional cost (§37).
 */
export function resolveShipping(ctx: ShippingContext): ShippingResult {
  const warnings: EngineWarning[] = [];
  const base = ctx.shippingCost;

  if (base.lessThanOrEqualTo(ZERO)) {
    return { cost: ZERO, warnings };
  }

  switch (ctx.shippingType) {
    case "FLAT":
      return { cost: base, warnings };

    case "PER_QUANTITY":
      return { cost: base.times(ctx.quantity), warnings };

    case "FREE_ABOVE": {
      const threshold = ctx.freeShippingThreshold;
      if (threshold === null || threshold === undefined) {
        // No threshold means nothing is free, so this degrades to a flat charge.
        return { cost: base, warnings };
      }
      return {
        cost: ctx.materialValue.greaterThanOrEqualTo(threshold) ? ZERO : base,
        warnings,
      };
    }

    case "BY_WEIGHT": {
      const perUnit = ctx.weightKgPerUnit;
      if (perUnit === null || perUnit === undefined) {
        warnings.push({
          code: "WEIGHT_MISSING_FOR_SHIPPING",
          message: 'משלוח לפי משקל נבחר אך לא הוגדר משקל ליחידה. חושב כמשלוח קבוע.',
          spec: ["§16"],
        });
        return { cost: base, warnings };
      }
      return { cost: base.times(perUnit.times(ctx.quantity)), warnings };
    }

    case "BY_AREA": {
      const area = ctx.totalAreaSqm;
      if (area === null || area === undefined) {
        warnings.push({
          code: "AREA_NOT_AVAILABLE",
          message: "משלוח לפי שטח נבחר אך לא ניתן לחשב שטח. חושב כמשלוח קבוע.",
          spec: ["§16"],
        });
        return { cost: base, warnings };
      }
      return { cost: base.times(area), warnings };
    }
  }
}

export { d, Decimal };
