/**
 * @jaco/core — the single calculation engine (§58).
 *
 * Pure: no database, no HTTP, no React. The API and the UI both import from here,
 * so a pricing formula exists in exactly one place in the system.
 *
 * Section references point at /SPEC.md.
 */
export * from "./money.js";
export * from "./types.js";
export * from "./settings.js";
export * from "./area.js";
export * from "./tiers.js";
export * from "./shipping.js";
export * from "./labor.js";
export * from "./supplier.js";
export * from "./calculateQuote.js";
export * from "./recommendPrice.js";
export * from "./compare.js";
