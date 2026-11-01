import { describe, expect, it } from "vitest";
import {
  calculateQuote,
  compareSuppliers,
  d,
  priceChangeImpact,
  recommendPrice,
  resolveShipping,
  type QuoteInput,
  type SupplierPriceInput,
} from "../src/index.js";
import {
  AS_OF,
  PRICES_A,
  PRICES_B,
  PRODUCT_SQM,
  SETTINGS,
  SIZE_100x100,
  SIZE_15x21,
  SUPPLIER_A,
  SUPPLIER_B,
  TIERS_100x100,
  TIERS_15x21,
} from "./fixtures.js";

const exact = (actual: { toFixed(): string } | null, expected: string) => {
  expect(actual).not.toBeNull();
  expect(d(actual!).toFixed()).toBe(expected);
};

const quote = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
  settings: SETTINGS,
  product: PRODUCT_SQM,
  size: SIZE_15x21,
  quantity: 1,
  quantityTiers: TIERS_15x21,
  asOf: AS_OF,
  suppliers: [SUPPLIER_A],
  supplierPrices: PRICES_A,
  supplierMode: "MANUAL",
  selectedSupplierId: "sup-a",
  ...overrides,
});

// ───────── C2 — how inbound freight reaches a customer quote ─────────

describe("C2 freight allocation (§15, §16, §62)", () => {
  it("AMORTIZED spreads freight over the purchase lot, so a tiny order absorbs pennies", () => {
    const r = calculateQuote(quote({ shippingAllocation: "AMORTIZED" }));
    // 100 freight over a 50 sqm lot is 2/sqm, so 29 becomes 31 — §62's own arithmetic.
    exact(r.supplier!.effectiveUnitCost, "31");
    exact(r.supplier!.purchaseQuantity, "50");
    // The order consumes 0.0315 sqm, so it carries 0.0315 x 2 of the freight.
    exact(r.shippingCost, "0.063");
    exact(r.materialCost, d("0.0315").times(29).toFixed());
  });

  it("FULL_ORDER loads the whole freight bill and destroys a small quote", () => {
    const amortized = calculateQuote(quote({ shippingAllocation: "AMORTIZED" }));
    const full = calculateQuote(quote({ shippingAllocation: "FULL_ORDER" }));

    exact(full.shippingCost, "100");
    // The same 59 sale now carries 100 of freight: contribution goes deeply negative.
    expect(amortized.contribution.greaterThan(0)).toBe(true);
    expect(full.contribution.lessThan(-50)).toBe(true);
    expect(full.warnings.map((w) => w.code)).toContain("NEGATIVE_CONTRIBUTION");
  });

  it("a missing lot size is reported rather than silently assumed", () => {
    const noLot: SupplierPriceInput[] = PRICES_A.map((p) => ({
      ...p,
      purchaseLotQuantity: null,
    }));
    const r = calculateQuote(
      quote({
        supplierPrices: noLot,
        settings: { ...SETTINGS, defaultPurchaseLotQuantity: 0 },
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain("PURCHASE_LOT_MISSING");
  });

  it("a large order buys at its own quantity, not the lot floor", () => {
    const r = calculateQuote(
      quote({
        size: SIZE_100x100,
        quantity: 200,
        quantityTiers: TIERS_100x100,
        shippingAllocation: "AMORTIZED",
      }),
    );
    // 200 sqm exceeds the 50 sqm lot, so the purchase quantity is 200.
    exact(r.supplier!.purchaseQuantity, "200");
    // Freight per sqm falls to 100/200 = 0.5, so the effective cost is 29.5.
    exact(r.supplier!.effectiveUnitCost, "29.5");
  });
});

// ───────── C1 — freight belongs in total_cost ─────────

describe("C1 freight in total cost (§15 vs §40)", () => {
  it("total_cost is the sum of all six components including freight", () => {
    const r = calculateQuote(quote({ quantity: 20, shippingAllocation: "FULL_ORDER" }));
    const sum = r.materialCost
      .plus(r.shippingCost)
      .plus(r.printingCost)
      .plus(r.cuttingCost)
      .plus(r.laborCost)
      .plus(r.additionalCost);
    exact(r.totalCost, sum.toFixed());
    expect(r.shippingCost.greaterThan(0)).toBe(true);
  });

  it("effectivePurchaseCost is material + freight + surcharge (§15)", () => {
    const withSurcharge: SupplierPriceInput[] = PRICES_A.map((p) => ({
      ...p,
      additionalCostPerOrder: 25,
    }));
    const r = calculateQuote(
      quote({ quantity: 20, supplierPrices: withSurcharge, shippingAllocation: "FULL_ORDER" }),
    );
    const s = r.supplier!;
    exact(s.effectivePurchaseCost, s.materialCost.plus(s.shippingCharged).plus(s.additionalCostCharged).toFixed());
    exact(s.additionalCostCharged, "25");
  });
});

// ───────── C4 — printing must not be counted twice ─────────

describe("C4 printing double count (§27 vs §35)", () => {
  it("printing is charged when the supplier price excludes it", () => {
    const r = calculateQuote(
      quote({ quantity: 10, product: { ...PRODUCT_SQM, printingCostPerSqm: 20 } }),
    );
    exact(r.printingCost, d("0.315").times(20).toFixed());
  });

  it("printing is zeroed, with a warning, when the supplier price already includes it", () => {
    const inclusive: SupplierPriceInput[] = PRICES_A.map((p) => ({
      ...p,
      includesPrinting: true,
    }));
    const r = calculateQuote(
      quote({
        quantity: 10,
        supplierPrices: inclusive,
        product: { ...PRODUCT_SQM, printingCostPerSqm: 20 },
      }),
    );
    exact(r.printingCost, "0");
    expect(r.warnings.map((w) => w.code)).toContain("PRINTING_INCLUDED_IN_MATERIAL");
  });
});

// ───────── C5 / C6 — the recommended price is a circular equation ─────────

describe("C5 recommended price (§50)", () => {
  it("hits the target margin exactly, despite labor depending on price", () => {
    const input = quote({ quantity: 10, shippingAllocation: "AMORTIZED" });
    const rec = recommendPrice(input);

    expect(rec.drivenBy).toBe("MARGIN_TARGET");
    const atRec = rec.quoteAtRecommendedPrice!;
    // 30% target, reached to the last decimal — the inversion is correct.
    expect(d(atRec.contributionMargin).toDecimalPlaces(6).toFixed(6)).toBe("30.000000");
  });

  it("respects a per-product margin target over the global one", () => {
    // Real setup and handling costs are what lift the margin-derived price clear of
    // both floors, so the target itself governs. This is C6 stated positively: the
    // recommendation is only meaningful once fixed costs are recorded.
    const withFixedCosts = { ...PRODUCT_SQM, setupFee: 200, handlingCostPerUnit: 3 };

    const at15 = recommendPrice(
      quote({ quantity: 100, product: { ...withFixedCosts, targetMargin: "0.15" } }),
    );
    expect(at15.drivenBy).toBe("MARGIN_TARGET");
    expect(d(at15.quoteAtRecommendedPrice!.contributionMargin).toDecimalPlaces(6).toFixed(6)).toBe(
      "15.000000",
    );

    const at30 = recommendPrice(
      quote({ quantity: 100, product: { ...withFixedCosts, targetMargin: "0.30" } }),
    );
    expect(at30.drivenBy).toBe("MARGIN_TARGET");
    expect(d(at30.quoteAtRecommendedPrice!.contributionMargin).toDecimalPlaces(6).toFixed(6)).toBe(
      "30.000000",
    );

    // A higher target must cost the customer more.
    expect(at30.recommendedPriceInclVat.greaterThan(at15.recommendedPriceInclVat)).toBe(true);
  });

  it("when a floor overrides the target, the achieved margin is never below it", () => {
    // Quantity 1 with no supplier: material is 1.4175, so the 15% target prices the
    // order at about 2 while §25 demands 59. The minimum governs and the margin
    // lands well above the target — a floor may only ever help.
    const rec = recommendPrice(
      quote({
        quantity: 1,
        suppliers: [],
        supplierPrices: [],
        product: { ...PRODUCT_SQM, targetMargin: "0.15" },
      }),
    );
    expect(rec.drivenBy).toBe("MINIMUM_ORDER");
    exact(rec.recommendedPriceInclVat, "59");
    expect(d(rec.quoteAtRecommendedPrice!.contributionMargin).greaterThan(15)).toBe(true);
  });

  it("refuses to invent a number when labor ratio + margin reach 100%", () => {
    // 0.59 labor + 0.41 margin leaves nothing: every extra shekel of revenue
    // brings at least a shekel of cost, so no price achieves the target.
    const rec = recommendPrice(
      quote({ quantity: 10, settings: { ...SETTINGS, targetContributionMargin: "0.41" } }),
    );
    expect(rec.warnings.map((w) => w.code)).toContain("MARGIN_TARGET_UNREACHABLE");
    // It falls back to a documented floor instead of returning Infinity or NaN.
    expect(rec.drivenBy).not.toBe("MARGIN_TARGET");
    expect(rec.recommendedPriceInclVat.isFinite()).toBe(true);
  });

  it("C6 — without setup costs a small format is recommended far below its list price", () => {
    const rec = recommendPrice(
      quote({ quantity: 1, suppliers: [], supplierPrices: [], shippingAllocation: "AMORTIZED" }),
    );
    // Material alone is 1.4175; 1.4175 / 0.11 is about 12.89 ex VAT, so the order
    // minimum has to carry the price. This is why §31 needs real fixed costs.
    expect(rec.drivenBy).toBe("MINIMUM_ORDER");
    exact(rec.recommendedPriceInclVat, "59");
  });

  it("C6 — with setup and handling recorded, the recommendation becomes sensible", () => {
    const rec = recommendPrice(
      quote({
        quantity: 1,
        suppliers: [],
        supplierPrices: [],
        product: { ...PRODUCT_SQM, setupFee: 25, handlingCostPerUnit: 3 },
      }),
    );
    expect(rec.drivenBy).toBe("MARGIN_TARGET");
    expect(rec.recommendedPriceInclVat.greaterThan(59)).toBe(true);
    expect(d(rec.quoteAtRecommendedPrice!.contributionMargin).toDecimalPlaces(6).toFixed(6)).toBe(
      "30.000000",
    );
  });

  it("the per-sqm target acts as a floor for large formats (§30, §50)", () => {
    const rec = recommendPrice(
      quote({
        size: SIZE_100x100,
        quantity: 1,
        quantityTiers: TIERS_100x100,
        suppliers: [],
        supplierPrices: [],
        settings: { ...SETTINGS, targetSqmPriceInclVat: 500 },
      }),
    );
    expect(rec.drivenBy).toBe("TARGET_SQM_PRICE");
    exact(rec.recommendedPriceInclVat, "500");
  });

  it("§51 — recommending a price does not change the price list", () => {
    const input = quote({ quantity: 10 });
    const before = calculateQuote(input).unitPriceInclVat;
    recommendPrice(input);
    exact(calculateQuote(input).unitPriceInclVat, before.toFixed());
  });

  it("hourly labor removes the circularity entirely", () => {
    const rec = recommendPrice(
      quote({
        quantity: 10,
        product: { ...PRODUCT_SQM, laborMethod: "HOURLY", laborHoursPerUnit: "0.1" },
      }),
    );
    exact(rec.priceDependentRatio, "0");
    expect(d(rec.quoteAtRecommendedPrice!.contributionMargin).toDecimalPlaces(6).toFixed(6)).toBe(
      "30.000000",
    );
  });
});

// ───────── §16 — all five freight models ─────────

describe("§16 freight models", () => {
  const base = {
    shippingCost: d(100),
    quantity: d(50),
    materialValue: d(1450),
    freeShippingThreshold: null,
    weightKgPerUnit: null,
    totalAreaSqm: d(50),
  };

  it("FLAT charges the figure as given", () => {
    exact(resolveShipping({ ...base, shippingType: "FLAT" }).cost, "100");
  });

  it("PER_QUANTITY multiplies by quantity", () => {
    exact(resolveShipping({ ...base, shippingType: "PER_QUANTITY", shippingCost: d(2) }).cost, "100");
  });

  it("FREE_ABOVE waives freight once the order value clears the threshold", () => {
    exact(
      resolveShipping({ ...base, shippingType: "FREE_ABOVE", freeShippingThreshold: d(1000) }).cost,
      "0",
    );
    exact(
      resolveShipping({ ...base, shippingType: "FREE_ABOVE", freeShippingThreshold: d(2000) }).cost,
      "100",
    );
  });

  it("BY_WEIGHT needs a weight, and says so when it is missing (C10)", () => {
    exact(
      resolveShipping({
        ...base,
        shippingType: "BY_WEIGHT",
        shippingCost: d(5),
        weightKgPerUnit: d("1.5"),
      }).cost,
      "375",
    );
    const missing = resolveShipping({ ...base, shippingType: "BY_WEIGHT" });
    expect(missing.warnings.map((w) => w.code)).toContain("WEIGHT_MISSING_FOR_SHIPPING");
    exact(missing.cost, "100");
  });

  it("BY_AREA multiplies by area", () => {
    exact(resolveShipping({ ...base, shippingType: "BY_AREA", shippingCost: d(3) }).cost, "150");
  });

  it("zero freight stays zero in every model", () => {
    for (const t of ["FLAT", "PER_QUANTITY", "FREE_ABOVE", "BY_WEIGHT", "BY_AREA"] as const) {
      exact(resolveShipping({ ...base, shippingType: t, shippingCost: d(0) }).cost, "0");
    }
  });
});

// ───────── §48, §49 — impact of a purchase price change ─────────

describe("§48, §49 price change impact", () => {
  it("reports the percentage rise and what it does to contribution", () => {
    const impact = priceChangeImpact({
      previousUnitCost: 29,
      newUnitCost: 35,
      quantity: 50,
      priceExVat: 2000,
      otherCosts: 100,
    });
    exact(impact.deltaPerUnit, "6");
    // 6 / 29 = 20.689...%
    expect(d(impact.deltaPercent!).toDecimalPlaces(2).toFixed()).toBe("20.69");
    exact(impact.previousContribution, "450");
    exact(impact.newContribution, "150");
    exact(impact.contributionDelta, "-300");
  });

  it("does not divide by zero when there was no previous cost", () => {
    const impact = priceChangeImpact({
      previousUnitCost: 0,
      newUnitCost: 10,
      quantity: 1,
      priceExVat: 100,
      otherCosts: 0,
    });
    expect(impact.deltaPercent).toBeNull();
  });
});

// ───────── C12 — currencies are not silently converted ─────────

describe("C12 currency safety (§12)", () => {
  it("flags a supplier quoting in another currency instead of comparing it", () => {
    const usd: SupplierPriceInput[] = PRICES_B.map((p) => ({ ...p, currency: "USD" }));
    const { rows } = compareSuppliers({
      suppliers: [SUPPLIER_A, SUPPLIER_B],
      priceRows: [...PRICES_A, ...usd],
      quantity: 50,
      settings: SETTINGS,
      asOf: AS_OF,
    });
    const b = rows.find((r) => r.supplierId === "sup-b")!;
    expect(b.warnings.map((w) => w.code)).toContain("MIXED_CURRENCIES");
  });
});

// ───────── guard rails ─────────

describe("guard rails", () => {
  it("a VAT rate that would make the divisor zero is rejected, not computed", () => {
    expect(() => calculateQuote(quote({ settings: { ...SETTINGS, vatRate: -100 } }))).toThrow(
      RangeError,
    );
  });

  it("zero area never yields Infinity for a per-sqm figure (§43)", () => {
    const r = calculateQuote(
      quote({ product: { ...PRODUCT_SQM, pricingMethod: "UNIT" }, size: null }),
    );
    expect(r.effectivePricePerSqmInclVat).toBeNull();
    expect(r.totalCost.isFinite()).toBe(true);
  });

  it("a supplier with no price row for the material is skipped, not guessed at", () => {
    const r = calculateQuote(
      quote({
        suppliers: [SUPPLIER_A, SUPPLIER_B],
        supplierPrices: PRICES_A,
        supplierMode: "MANUAL",
        selectedSupplierId: "sup-b",
      }),
    );
    expect(r.supplier).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain("NO_SUPPLIER_SELECTED");
  });

  it("every monetary output is finite", () => {
    const r = calculateQuote(quote({ quantity: 10 }));
    for (const v of [
      r.totalPriceInclVat, r.totalPriceExVat, r.materialCost, r.shippingCost,
      r.printingCost, r.cuttingCost, r.laborCost, r.additionalCost,
      r.totalCost, r.contribution, r.contributionMargin,
    ]) {
      expect(v.isFinite()).toBe(true);
      expect(v.isNaN()).toBe(false);
    }
  });
});
