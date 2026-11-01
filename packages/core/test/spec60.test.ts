import { describe, expect, it } from "vitest";
import {
  areaSqm,
  calculateQuote,
  compareSuppliers,
  d,
  deriveSettings,
  selectQuantityTier,
  toExVat,
  type QuoteInput,
} from "../src/index.js";
import {
  AS_OF,
  PRICES_A,
  PRICES_B,
  PRODUCT_LINEAR,
  PRODUCT_SQM,
  PRODUCT_UNIT,
  SETTINGS,
  SIZE_100x100,
  SIZE_10x15,
  SIZE_15x21,
  SUPPLIER_A,
  SUPPLIER_B,
  TIERS_100x100,
  TIERS_10x15,
  TIERS_15x21,
  tiersFromPrices,
} from "./fixtures.js";

/** Exact decimal-string comparison: catches float drift that toBeCloseTo would hide. */
const exact = (actual: { toFixed(): string } | null, expected: string) => {
  expect(actual).not.toBeNull();
  expect(d(actual!).toFixed()).toBe(expected);
};

const baseQuote = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
  settings: SETTINGS,
  product: PRODUCT_SQM,
  size: SIZE_15x21,
  quantity: 1,
  quantityTiers: TIERS_15x21,
  asOf: AS_OF,
  ...overrides,
});

// ───────────────── §60.1-2 — area ─────────────────

describe("§60.1-2 area (§22)", () => {
  it("1. 15x21 is 0.0315 sqm", () => {
    exact(areaSqm(SIZE_15x21), "0.0315");
  });

  it("2. 100x100 is exactly 1 sqm", () => {
    exact(areaSqm(SIZE_100x100), "1");
  });

  it("area scales with quantity (§33)", () => {
    const r = calculateQuote(baseQuote({ quantity: 10 }));
    exact(r.areaPerUnit, "0.0315");
    exact(r.totalArea, "0.315");
  });
});

// ───────────────── §60.3-4 — VAT ─────────────────

describe("§60.3-4 VAT (§32)", () => {
  it("3. the customer price is shown incl. VAT (§3)", () => {
    const r = calculateQuote(baseQuote({ quantity: 10 }));
    // 10 units at the 6-10 tier price of 57
    exact(r.unitPriceInclVat, "57");
    exact(r.totalPriceInclVat, "570");
  });

  it("4. 59 incl. VAT is exactly 50 ex. VAT — no float drift (§61)", () => {
    const { vatMultiplier } = deriveSettings(SETTINGS);
    exact(toExVat(59, vatMultiplier), "50");
  });

  it("4b. incl -> ex -> incl round-trips exactly", () => {
    const { vatMultiplier } = deriveSettings(SETTINGS);
    exact(toExVat(227, vatMultiplier).times(vatMultiplier), "227");
  });

  it("4c. a VAT change flows through every calculation (§33, §70)", () => {
    const at18 = calculateQuote(baseQuote({ quantity: 10 }));
    const at17 = calculateQuote(
      baseQuote({ quantity: 10, settings: { ...SETTINGS, vatRate: 17 } }),
    );
    exact(at18.totalPriceExVat, d(570).dividedBy(1.18).toFixed());
    exact(at17.totalPriceExVat, d(570).dividedBy(1.17).toFixed());
    // The customer price is unchanged; only the ex-VAT basis moves.
    exact(at17.totalPriceInclVat, "570");
  });
});

// ───────────────── §60.5 — order minimum ─────────────────

describe("§60.5 order minimum (§25, §26)", () => {
  it("5. one 15x21 at 59 is already at the minimum", () => {
    const r = calculateQuote(baseQuote({ quantity: 1 }));
    exact(r.totalPriceInclVat, "59");
    expect(r.minimumOrderApplied).toBe(false);
  });

  it("5a. §26 — one 10x15 at 39 is lifted to the 59 minimum", () => {
    const r = calculateQuote(
      baseQuote({ size: SIZE_10x15, quantity: 1, quantityTiers: TIERS_10x15 }),
    );
    exact(r.unitPriceInclVat, "39");
    exact(r.totalPriceInclVat, "59");
    expect(r.minimumOrderApplied).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain("MINIMUM_ORDER_APPLIED");
  });

  it("5b. §26 — two 10x15 at 78 are above the minimum, so it does not apply", () => {
    const r = calculateQuote(
      baseQuote({ size: SIZE_10x15, quantity: 2, quantityTiers: TIERS_10x15 }),
    );
    exact(r.totalPriceInclVat, "78");
    expect(r.minimumOrderApplied).toBe(false);
  });

  it("5c. the minimum comes from settings, not from code (§70)", () => {
    const r = calculateQuote(
      baseQuote({
        size: SIZE_10x15,
        quantity: 1,
        quantityTiers: TIERS_10x15,
        settings: { ...SETTINGS, minOrderInclVat: 80 },
      }),
    );
    exact(r.totalPriceInclVat, "80");
  });

  it("5d. a product-level minimum overrides the global one (§19)", () => {
    const r = calculateQuote(
      baseQuote({
        size: SIZE_10x15,
        quantity: 1,
        quantityTiers: TIERS_10x15,
        product: { ...PRODUCT_SQM, minimumOrder: 100 },
      }),
    );
    exact(r.totalPriceInclVat, "100");
  });
});

// ───────────────── §60.6-20 — tier boundaries ─────────────────

describe("§60.6-20 quantity tiers (§24)", () => {
  it("6. the tier is chosen by quantity", () => {
    const { tier } = selectQuantityTier(TIERS_15x21, 7);
    expect(tier).not.toBeNull();
    expect(tier!.minQuantity).toBe(6);
    exact(tier!.unitPriceInclVat, "57");
  });

  // §60.7-20 — the fifteen boundary quantities, with §29's 15x21 prices.
  const boundaries: Array<[number, string, number, number | null]> = [
    [5, "59", 1, 5],
    [6, "57", 6, 10],
    [10, "57", 6, 10],
    [11, "55", 11, 25],
    [25, "55", 11, 25],
    [26, "53", 26, 50],
    [50, "53", 26, 50],
    [51, "51", 51, 100],
    [100, "51", 51, 100],
    [101, "49", 101, 200],
    [200, "49", 101, 200],
    [201, "47", 201, 300],
    [300, "47", 201, 300],
    [301, "45", 301, null],
    [1000, "45", 301, null],
  ];

  for (const [qty, price, tierMin, tierMax] of boundaries) {
    it(`quantity ${qty} falls in tier ${tierMin}${tierMax === null ? "+" : `-${tierMax}`} at ${price}`, () => {
      const { tier, warnings } = selectQuantityTier(TIERS_15x21, qty);
      expect(tier).not.toBeNull();
      expect(tier!.minQuantity).toBe(tierMin);
      expect(tier!.maxQuantity).toBe(tierMax);
      exact(tier!.unitPriceInclVat, price);
      expect(warnings).toHaveLength(0);
    });
  }

  it("C3 — 300 belongs to exactly one tier, so the last tier starts at 301", () => {
    // The SPEC lists "201-300" and "300+", which makes 300 ambiguous.
    const matches = TIERS_15x21.filter(
      (t) => 300 >= t.minQuantity && (t.maxQuantity === null || 300 <= t.maxQuantity),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.maxQuantity).toBe(300);
  });

  it("C3 — an overlapping tier list is reported rather than silently resolved", () => {
    const overlapping = [
      { minQuantity: 201, maxQuantity: 300, unitPriceInclVat: 47 },
      { minQuantity: 300, maxQuantity: null, unitPriceInclVat: 45 },
    ];
    const { tier, warnings } = selectQuantityTier(overlapping, 300);
    expect(warnings.map((w) => w.code)).toContain("OVERLAPPING_TIERS");
    exact(tier!.unitPriceInclVat, "45");
  });

  it("a quantity below every tier is reported", () => {
    const { warnings } = selectQuantityTier(
      [{ minQuantity: 10, maxQuantity: 20, unitPriceInclVat: 50 }],
      1,
    );
    expect(warnings.map((w) => w.code)).toContain("QUANTITY_OUTSIDE_TIERS");
  });

  it("an empty tier list is reported", () => {
    const { tier, warnings } = selectQuantityTier([], 1);
    expect(tier).toBeNull();
    expect(warnings.map((w) => w.code)).toContain("QUANTITY_OUTSIDE_TIERS");
  });
});

// ───────────────── §60.21-25 — costs, contribution, per-sqm ─────────────────

describe("§60.21-25 costs and contribution (§34-§43, §61)", () => {
  /** §61 walkthrough: no supplier, so the §27 fallback of 45/sqm applies. */
  const spec61 = () => calculateQuote(baseQuote({ quantity: 1 }));

  it("21. material cost: 0.0315 x 45 = 1.4175", () => {
    exact(spec61().materialCost, "1.4175");
  });

  it("22. labor cost: 50 x 0.59 = 29.5", () => {
    exact(spec61().laborCost, "29.5");
  });

  it("23. contribution: 50 - 1.4175 - 29.5 = 19.0825", () => {
    const r = spec61();
    exact(r.totalPriceExVat, "50");
    exact(r.totalCost, "30.9175");
    exact(r.contribution, "19.0825");
  });

  it("24. contribution margin is contribution / price_ex_vat x 100 (§42)", () => {
    exact(spec61().contributionMargin, d("19.0825").dividedBy(50).times(100).toFixed());
  });

  it("25. effective price per sqm, incl. and ex. VAT (§43)", () => {
    const r = spec61();
    // 59 / 0.0315 — the small-format premium §31 describes, 8.3x the 227 target.
    exact(r.effectivePricePerSqmInclVat, d(59).dividedBy("0.0315").toFixed());
    exact(r.effectivePricePerSqmExVat, d(50).dividedBy("0.0315").toFixed());
  });

  it("25a. 100x100 at 227 gives exactly the §30 target per sqm", () => {
    const r = calculateQuote(
      baseQuote({ size: SIZE_100x100, quantity: 1, quantityTiers: TIERS_100x100 }),
    );
    exact(r.totalArea, "1");
    exact(r.effectivePricePerSqmInclVat, "227");
    // §30 states 227 / 1.18 = 192.37
    expect(d(r.effectivePricePerSqmExVat!).toDecimalPlaces(2).toFixed()).toBe("192.37");
  });

  it("25b. the small format costs far more per sqm than the large one (§31)", () => {
    const small = calculateQuote(baseQuote({ quantity: 1 }));
    const large = calculateQuote(
      baseQuote({ size: SIZE_100x100, quantity: 1, quantityTiers: TIERS_100x100 }),
    );
    expect(
      d(small.effectivePricePerSqmInclVat!).greaterThan(
        d(large.effectivePricePerSqmInclVat!).times(8),
      ),
    ).toBe(true);
  });

  it("§6 — the labor ratio is derived from turnover and wages, not hard-coded (§70)", () => {
    const derived = deriveSettings(SETTINGS);
    exact(derived.averageSalesExVat, d(120_000).dividedBy(1.18).toFixed());
    exact(derived.laborRatio, "0.59");
    expect(derived.laborRatioSource).toBe("DERIVED");
  });

  it("§6, §64 — changing turnover recomputes the ratio", () => {
    const derived = deriveSettings({ ...SETTINGS, averageWages: 30_000 });
    exact(derived.laborRatio, "0.295");
  });

  it("§6 — a manual override wins over the derived value", () => {
    const derived = deriveSettings({ ...SETTINGS, laborRatioOverride: 0.45 });
    exact(derived.laborRatio, "0.45");
    expect(derived.laborRatioSource).toBe("OVERRIDE");
  });

  it("§7, §39 — employee cost per hour is 45 x 1.4 = 63", () => {
    exact(deriveSettings(SETTINGS).employeeCostPerHour, "63");
  });

  it("§8B — hourly labor uses hours x 63, independent of price", () => {
    const r = calculateQuote(
      baseQuote({
        quantity: 2,
        product: { ...PRODUCT_SQM, laborMethod: "HOURLY", laborHoursPerUnit: "0.5" },
      }),
    );
    exact(r.laborCost, "63");
  });

  it("§8C — combined labor is fixed + hours + a share of price", () => {
    const r = calculateQuote(
      baseQuote({
        quantity: 1,
        product: {
          ...PRODUCT_SQM,
          laborMethod: "COMBINED",
          laborFixedCost: 10,
          laborHoursPerUnit: "0.25",
        },
      }),
    );
    // 10 + 0.25 x 63 + 50 x 0.59 = 10 + 15.75 + 29.5
    exact(r.laborCost, "55.25");
  });

  it("§36 — cutting by unit and cutting by hours both land in cuttingCost", () => {
    const byUnit = calculateQuote(
      baseQuote({ quantity: 4, product: { ...PRODUCT_SQM, cuttingCostPerUnit: "1.5" } }),
    );
    exact(byUnit.cuttingCost, "6");

    const byHours = calculateQuote(
      baseQuote({ quantity: 4, product: { ...PRODUCT_SQM, cuttingHoursPerUnit: "0.25" } }),
    );
    exact(byHours.cuttingCost, "63");
  });

  it("§37 — the three additional-cost scopes apply to order, unit and area", () => {
    const r = calculateQuote(
      baseQuote({
        quantity: 10,
        additionalCosts: [
          { name: "הכנת קובץ", scope: "FIXED_ORDER", amount: 50 },
          { name: "אריזה", scope: "VARIABLE_UNIT", amount: 2 },
          { name: "למינציה", scope: "VARIABLE_AREA", amount: 10 },
        ],
      }),
    );
    // 50 + 10x2 + 0.315x10 = 50 + 20 + 3.15
    exact(r.additionalCost, "73.15");
  });

  it("§31, C7 — setup and handling are what make small formats expensive", () => {
    const r = calculateQuote(
      baseQuote({
        quantity: 2,
        product: { ...PRODUCT_SQM, setupFee: 25, handlingCostPerUnit: "1.5" },
      }),
    );
    exact(r.breakdown.setupCost, "25");
    exact(r.breakdown.handlingCost, "3");
    exact(r.additionalCost, "28");
  });
});

// ───────────────── §60.26-30 — suppliers ─────────────────

describe("§60.26-30 suppliers (§13, §14, §15, §62)", () => {
  const withSuppliers = (overrides: Partial<QuoteInput> = {}) =>
    calculateQuote(
      baseQuote({
        suppliers: [SUPPLIER_A, SUPPLIER_B],
        supplierPrices: [...PRICES_A, ...PRICES_B],
        ...overrides,
      }),
    );

  it("26. AUTO picks the lowest effective cost (§14, §47)", () => {
    const r = withSuppliers({ quantity: 1, supplierMode: "AUTO" });
    expect(r.supplier).not.toBeNull();
    // Over a 50 sqm lot: A is 29 + 100/50 = 31, B is 31 + 0 = 31 — a genuine tie,
    // so the engine must at least not pick something more expensive.
    exact(r.supplier!.effectiveUnitCost, "31");
  });

  it("27. MANUAL honours the user's choice even when it costs more (§47)", () => {
    const expensive = { ...SUPPLIER_A, deliveryCost: 400 };
    const r = calculateQuote(
      baseQuote({
        quantity: 1,
        suppliers: [expensive, SUPPLIER_B],
        supplierPrices: [...PRICES_A, ...PRICES_B],
        supplierMode: "MANUAL",
        selectedSupplierId: "sup-a",
      }),
    );
    expect(r.supplier!.supplierId).toBe("sup-a");
    // 29 + 400/50 = 37, dearer than B's 31: the manual choice was not overridden.
    exact(r.supplier!.effectiveUnitCost, "37");
  });

  it("28. freight reaches total_cost — the SPEC omits it in §40 (C1)", () => {
    const withFreight = calculateQuote(
      baseQuote({
        quantity: 1,
        suppliers: [SUPPLIER_A],
        supplierPrices: PRICES_A,
        supplierMode: "MANUAL",
        selectedSupplierId: "sup-a",
      }),
    );
    expect(withFreight.shippingCost.greaterThan(0)).toBe(true);
    exact(
      withFreight.totalCost,
      withFreight.materialCost
        .plus(withFreight.shippingCost)
        .plus(withFreight.printingCost)
        .plus(withFreight.cuttingCost)
        .plus(withFreight.laborCost)
        .plus(withFreight.additionalCost)
        .toFixed(),
    );
  });

  it("29. supplier price tiers are selected by purchase quantity (§13)", () => {
    const compare = (qty: number) =>
      compareSuppliers({
        suppliers: [SUPPLIER_A],
        priceRows: PRICES_A,
        quantity: qty,
        settings: SETTINGS,
        asOf: AS_OF,
      }).rows[0]!;

    exact(compare(5).unitPrice, "35");
    exact(compare(9).unitPrice, "35");
    exact(compare(10).unitPrice, "32");
    exact(compare(49).unitPrice, "32");
    exact(compare(50).unitPrice, "29");
    exact(compare(500).unitPrice, "29");
  });

  it("30. a supplier minimum the purchase does not reach is flagged (§9, §47)", () => {
    const r = compareSuppliers({
      suppliers: [{ ...SUPPLIER_A, minimumOrderValue: 5_000 }],
      priceRows: PRICES_A,
      quantity: 50,
      settings: SETTINGS,
      asOf: AS_OF,
    });
    expect(r.rows[0]!.meetsMinimum).toBe(false);
    expect(r.rows[0]!.warnings.map((w) => w.code)).toContain("SUPPLIER_MINIMUM_NOT_MET");
  });

  it("§62 — at 50 sqm both suppliers come to 1550 and 31/sqm", () => {
    const { rows } = compareSuppliers({
      suppliers: [SUPPLIER_A, SUPPLIER_B],
      priceRows: [...PRICES_A, ...PRICES_B],
      quantity: 50,
      settings: SETTINGS,
      asOf: AS_OF,
    });

    const a = rows.find((r) => r.supplierId === "sup-a")!;
    const b = rows.find((r) => r.supplierId === "sup-b")!;

    // Supplier A: 50 x 29 = 1450, plus 100 freight.
    exact(a.unitPrice, "29");
    exact(a.materialCost, "1450");
    exact(a.shippingCharged, "100");
    exact(a.effectivePurchaseCost, "1550");
    exact(a.effectiveCostPerUnit, "31");

    // Supplier B: 50 x 31 = 1550, no freight.
    exact(b.unitPrice, "31");
    exact(b.effectivePurchaseCost, "1550");
    exact(b.effectiveCostPerUnit, "31");

    // §62's point: equal effective cost despite different sticker prices.
    expect(a.effectivePurchaseCost.equals(b.effectivePurchaseCost)).toBe(true);
    expect(a.isCheapest).toBe(true);
    expect(b.isCheapest).toBe(true);
  });

  it("§63 — the cheapest sticker price is not the cheapest order", () => {
    // At 10 sqm: A is 10x32+100 = 420; B is 10x33+0 = 330. A's lower unit price loses.
    const { rows } = compareSuppliers({
      suppliers: [SUPPLIER_A, SUPPLIER_B],
      priceRows: [...PRICES_A, ...PRICES_B],
      quantity: 10,
      settings: SETTINGS,
      asOf: AS_OF,
    });
    expect(rows[0]!.supplierId).toBe("sup-b");
    exact(rows[0]!.effectivePurchaseCost, "330");
    const a = rows.find((r) => r.supplierId === "sup-a")!;
    exact(a.unitPrice, "32");
    exact(a.effectivePurchaseCost, "420");
    expect(d(a.unitPrice).lessThan(rows[0]!.unitPrice)).toBe(true);
  });
});

// ───────────────── §60.31-34 — change behaviour ─────────────────

describe("§60.31-34 changes (§17, §48, §54, §64)", () => {
  it("31. a price change is a new row; the old price stays readable by date (§17)", () => {
    const history = [
      {
        id: "h1",
        supplierId: "sup-a",
        unit: "SQM" as const,
        unitPrice: 30,
        minimumQuantity: 1,
        purchaseLotQuantity: 50,
        validFrom: new Date("2026-01-01"),
        validUntil: new Date("2026-06-01"),
      },
      {
        id: "h2",
        supplierId: "sup-a",
        unit: "SQM" as const,
        unitPrice: 32,
        minimumQuantity: 1,
        purchaseLotQuantity: 50,
        validFrom: new Date("2026-06-01"),
        validUntil: new Date("2026-08-01"),
      },
      {
        id: "h3",
        supplierId: "sup-a",
        unit: "SQM" as const,
        unitPrice: 35,
        minimumQuantity: 1,
        purchaseLotQuantity: 50,
        validFrom: new Date("2026-08-01"),
        validUntil: null,
      },
    ];

    const priceOn = (date: string) =>
      compareSuppliers({
        suppliers: [{ ...SUPPLIER_A, deliveryCost: 0 }],
        priceRows: history,
        quantity: 10,
        settings: SETTINGS,
        asOf: new Date(date),
      }).rows[0]!.unitPrice;

    // The §17 example, read back at three dates.
    exact(priceOn("2026-03-01"), "30");
    exact(priceOn("2026-07-01"), "32");
    exact(priceOn("2026-09-01"), "35");
  });

  it("32. a quote is reproducible from its inputs, so a snapshot cannot drift (§18, §54)", () => {
    const input = baseQuote({
      quantity: 10,
      suppliers: [SUPPLIER_A],
      supplierPrices: PRICES_A,
      supplierMode: "MANUAL",
      selectedSupplierId: "sup-a",
    });
    const first = calculateQuote(input);

    // The supplier later raises the price. The original inputs still give the
    // original numbers — which is what makes a stored snapshot immutable.
    const raised = PRICES_A.map((p) => ({ ...p, unitPrice: d(p.unitPrice).times(2) }));
    const afterRaise = calculateQuote({ ...input, supplierPrices: raised });

    const replay = calculateQuote(input);
    exact(replay.contribution, first.contribution.toFixed());
    exact(replay.materialCost, first.materialCost.toFixed());
    expect(afterRaise.materialCost.greaterThan(first.materialCost)).toBe(true);
  });

  it("33. a VAT change moves cost and contribution, not the customer price", () => {
    const at18 = calculateQuote(baseQuote({ quantity: 1 }));
    const at25 = calculateQuote(baseQuote({ quantity: 1, settings: { ...SETTINGS, vatRate: 25 } }));
    exact(at18.totalPriceInclVat, "59");
    exact(at25.totalPriceInclVat, "59");
    expect(at25.totalPriceExVat.lessThan(at18.totalPriceExVat)).toBe(true);
    expect(at25.contribution.lessThan(at18.contribution)).toBe(true);
  });

  it("34. a material cost change moves the contribution (§48, §49)", () => {
    const cheap = calculateQuote(
      baseQuote({ quantity: 10, settings: { ...SETTINGS, defaultMaterialCostPerSqm: 45 } }),
    );
    const dear = calculateQuote(
      baseQuote({ quantity: 10, settings: { ...SETTINGS, defaultMaterialCostPerSqm: 90 } }),
    );
    exact(cheap.materialCost, d("0.315").times(45).toFixed());
    exact(dear.materialCost, d("0.315").times(90).toFixed());
    exact(
      cheap.contribution.minus(dear.contribution),
      d("0.315").times(45).toFixed(),
    );
    // §51 — the price list itself did not move.
    exact(dear.unitPriceInclVat, cheap.unitPriceInclVat.toFixed());
  });
});

// ───────────────── §60.35-37 — pricing methods ─────────────────

describe("§60.35-37 pricing methods (§20, §71, §73)", () => {
  it("35. a per-unit product bills one unit of measure each (§20)", () => {
    const r = calculateQuote(
      baseQuote({
        product: PRODUCT_UNIT,
        size: null,
        quantity: 7,
        quantityTiers: tiersFromPrices([20, 19, 18, 17, 16, 15, 14, 13]),
        settings: { ...SETTINGS, minOrderInclVat: 0 },
      }),
    );
    exact(r.measure.measurePerUnit, "1");
    exact(r.measure.totalMeasure, "7");
    exact(r.totalPriceInclVat, "133");
    // No dimensions, so there is no area and no per-sqm figure (§43).
    expect(r.totalArea).toBeNull();
    expect(r.effectivePricePerSqmInclVat).toBeNull();
  });

  it("36. an area product bills square metres (§22, §34)", () => {
    const r = calculateQuote(baseQuote({ quantity: 10 }));
    expect(r.measure.measureUnit).toBe("SQM");
    exact(r.measure.totalMeasure, "0.315");
  });

  it("37. a linear-metre product bills running metres", () => {
    const r = calculateQuote(
      baseQuote({
        product: PRODUCT_LINEAR,
        // Width carries the running length: 250 cm is 2.5 m.
        size: { name: "250cm", widthCm: 250, heightCm: 100 },
        quantity: 4,
        quantityTiers: tiersFromPrices([80, 78, 76, 74, 72, 70, 68, 66]),
        settings: { ...SETTINGS, minOrderInclVat: 0 },
      }),
    );
    expect(r.measure.measureUnit).toBe("LINEAR_METER");
    exact(r.measure.measurePerUnit, "2.5");
    exact(r.measure.totalMeasure, "10");
    // Area is still reported because the dimensions allow it (§43).
    exact(r.totalArea, "10");
  });

  it("§71 — the engine has no Lucobond-specific behaviour", () => {
    const lucobond = calculateQuote(baseQuote({ quantity: 10 }));
    const generic = calculateQuote(
      baseQuote({ quantity: 10, product: { ...PRODUCT_SQM, id: "other", name: "PVC מודפס" } }),
    );
    exact(generic.contribution, lucobond.contribution.toFixed());
  });
});
