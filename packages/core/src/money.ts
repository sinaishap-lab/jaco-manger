import Decimal from "decimal.js";

/**
 * Monetary arithmetic for the whole system (§59).
 *
 * All money and ratio arithmetic goes through Decimal. Intermediate values are
 * never rounded — 28 significant digits keeps far more than the 4 decimal places
 * §59 requires. Rounding happens only at the display boundary, via `round`.
 *
 * Nothing in this package may use JavaScript `number` for a monetary value.
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP, toExpPos: 40, toExpNeg: -40 });

export { Decimal };

/** Anything we accept as a numeric input: Prisma Decimal, string, number or Decimal. */
export type Numeric = Decimal | string | number | { toString(): string };

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
export const HUNDRED = new Decimal(100);

/** Coerce an input to Decimal. Rejects values that are not finite numbers. */
export function d(value: Numeric | null | undefined, fallback: Numeric = ZERO): Decimal {
  if (value === null || value === undefined) return d(fallback);
  if (value instanceof Decimal) return value;
  const raw = typeof value === "string" || typeof value === "number" ? value : value.toString();
  const parsed = new Decimal(raw);
  if (!parsed.isFinite()) {
    throw new TypeError(`Not a finite numeric value: ${String(raw)}`);
  }
  return parsed;
}

/** Sum a list, treating null/undefined as zero. */
export function sum(values: Array<Numeric | null | undefined>): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), ZERO);
}

/** The larger of two values (§25 uses this for the order minimum). */
export function max(a: Numeric, b: Numeric): Decimal {
  const x = d(a);
  const y = d(b);
  return x.greaterThan(y) ? x : y;
}

export function min(a: Numeric, b: Numeric): Decimal {
  const x = d(a);
  const y = d(b);
  return x.lessThan(y) ? x : y;
}

/**
 * Divide, returning null instead of throwing when the divisor is zero.
 * Callers decide whether a zero divisor is a warning or an error — the engine
 * never emits Infinity or NaN into a result.
 */
export function divide(numerator: Numeric, divisor: Numeric): Decimal | null {
  const den = d(divisor);
  if (den.isZero()) return null;
  return d(numerator).dividedBy(den);
}

/** Round for display only (§59). */
export function round(value: Numeric, decimalPlaces = 2): Decimal {
  return d(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/** Serialize a Decimal for JSON transport without losing precision. */
export function toJson(value: Decimal): string {
  return value.toFixed();
}

export function isPositive(value: Numeric | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return d(value).greaterThan(ZERO);
}
