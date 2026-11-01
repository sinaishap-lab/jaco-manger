import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * §57 permissions.
 *
 * The role arrives in an X-Role header and is enforced here, in one place. This is
 * not authentication: there are no users, passwords or tokens, by decision, because
 * this is an internal tool. What matters is that the rule lives on the server, so a
 * USER cannot reach an admin route or read a profitability figure by calling the
 * API directly. Swapping in real sign-in later means changing this file alone.
 */
export type Role = "ADMIN" | "USER";

export function roleOf(request: FastifyRequest): Role {
  const header = request.headers["x-role"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === "ADMIN" ? "ADMIN" : "USER";
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** §57 — ADMIN changes prices, costs, suppliers, materials and price lists. */
export function requireAdmin(request: FastifyRequest, _reply: FastifyReply): void {
  if (roleOf(request) !== "ADMIN") {
    throw new ForbiddenError(
      "הפעולה הזו מחייבת הרשאת ADMIN. משתמש USER יכול לבצע חישובים, ליצור הצעות מחיר ולראות מחירי מכירה (§57).",
    );
  }
}

/**
 * §57 — a USER may price work but may not see what it costs us.
 *
 * Applied to engine results and to any payload carrying cost or margin. The field
 * list is explicit rather than a denylist on key names, so a new cost field is
 * hidden only once someone adds it here deliberately.
 */
const PROFITABILITY_FIELDS = [
  "materialCost",
  "printingCost",
  "cuttingCost",
  "laborCost",
  "additionalCost",
  "totalCost",
  "contribution",
  "contributionMargin",
  "shippingCost",
  "purchasePrice",
  "effectivePurchaseCost",
  "supplier",
  "breakdown",
  "derivedSettings",
] as const;

/**
 * §57 — engine warnings a USER may see.
 *
 * Removing the cost fields is not enough on its own: a warning's text carries
 * figures. "Contribution is negative (-43.65)" states the contribution in prose,
 * and the supplier-minimum warning states what the purchase is worth. So warnings
 * are allow-listed by code rather than filtered by wording, and anything that
 * reports on cost, margin, suppliers or freight is withheld.
 */
const USER_VISIBLE_WARNINGS = new Set([
  "MINIMUM_ORDER_APPLIED",
  "QUANTITY_OUTSIDE_TIERS",
  "OVERLAPPING_TIERS",
  "AREA_NOT_AVAILABLE",
]);

export function stripProfitability<T extends Record<string, unknown>>(
  payload: T,
  role: Role,
): Partial<T> {
  if (role === "ADMIN") return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if ((PROFITABILITY_FIELDS as readonly string[]).includes(key)) continue;

    if (key === "warnings" && Array.isArray(value)) {
      out[key] = value.filter(
        (w): w is { code: string } =>
          typeof w === "object" &&
          w !== null &&
          "code" in w &&
          USER_VISIBLE_WARNINGS.has(String((w as { code: unknown }).code)),
      );
      continue;
    }

    // A snapshot holds the whole calculation, costs included (§54).
    if (key === "snapshot") continue;

    out[key] = value;
  }
  return out as Partial<T>;
}
