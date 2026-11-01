import { Decimal as PrismaDecimal } from "@prisma/client/runtime/library";
import { Decimal } from "@jaco/core";

/**
 * Decimals cross the wire as strings (§59).
 *
 * JSON.stringify would turn a Decimal into a JS number and lose precision, and
 * 0.0315 x 45 is exactly the kind of value that must not drift. Every response goes
 * through here, so a monetary value is a string everywhere in the API.
 */
export function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;

  if (value instanceof Decimal || value instanceof PrismaDecimal) {
    return value.toFixed();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);

  if (typeof value === "object") {
    // Leave class instances we do not know alone rather than mangling them.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      if (typeof (value as { toFixed?: unknown }).toFixed === "function") {
        return (value as { toFixed(): string }).toFixed();
      }
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out;
  }

  return value;
}
