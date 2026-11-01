/**
 * Demo data. This file and @jaco/core's test fixtures are the ONLY places the §5
 * default values may appear — §70 forbids them in logic.
 *
 * Lucobond is a demo product only (§71): nothing here gives it special treatment.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const D = (v: string | number) => new Prisma.Decimal(v);

/** §24 + C3 — the last tier is 301+, not the SPEC's overlapping 300+. */
const TIER_BOUNDS: Array<[number, number | null]> = [
  [1, 5], [6, 10], [11, 25], [26, 50],
  [51, 100], [101, 200], [201, 300], [301, null],
];

/** §28 sizes and the §29 price list, incl. VAT, in tier order. */
const LUCOBOND: Array<{ name: string; w: number; h: number; prices: number[] }> = [
  { name: "10×15",   w: 10,  h: 15,  prices: [39, 38, 37, 36, 35, 34, 33, 32] },
  { name: "13×18",   w: 13,  h: 18,  prices: [45, 44, 43, 42, 41, 40, 39, 38] },
  { name: "15×21",   w: 15,  h: 21,  prices: [59, 57, 55, 53, 51, 49, 47, 45] },
  { name: "20×20",   w: 20,  h: 20,  prices: [59, 57, 55, 53, 51, 49, 47, 45] },
  { name: "20×30",   w: 20,  h: 30,  prices: [69, 67, 65, 63, 61, 59, 57, 55] },
  { name: "30×30",   w: 30,  h: 30,  prices: [79, 77, 75, 73, 71, 69, 67, 65] },
  { name: "30×40",   w: 30,  h: 40,  prices: [89, 87, 85, 83, 81, 79, 77, 75] },
  { name: "30×45",   w: 30,  h: 45,  prices: [99, 97, 95, 93, 91, 89, 87, 85] },
  { name: "35×50",   w: 35,  h: 50,  prices: [109, 107, 105, 103, 101, 99, 97, 95] },
  { name: "40×40",   w: 40,  h: 40,  prices: [109, 107, 105, 103, 101, 99, 97, 95] },
  { name: "40×60",   w: 40,  h: 60,  prices: [129, 127, 125, 123, 121, 119, 117, 115] },
  { name: "50×50",   w: 50,  h: 50,  prices: [139, 137, 135, 133, 131, 129, 127, 125] },
  { name: "50×70",   w: 50,  h: 70,  prices: [159, 157, 155, 153, 151, 149, 147, 145] },
  { name: "60×60",   w: 60,  h: 60,  prices: [169, 167, 165, 163, 161, 159, 157, 155] },
  { name: "60×90",   w: 60,  h: 90,  prices: [199, 197, 195, 193, 191, 189, 187, 185] },
  { name: "100×100", w: 100, h: 100, prices: [227, 224, 221, 218, 215, 212, 209, 205] },
];

async function main() {
  console.log("→ clearing existing demo data");
  // Order matters: children before parents.
  await prisma.$transaction([
    prisma.quantityTier.deleteMany(),
    prisma.priceListVersion.deleteMany(),
    prisma.productSize.deleteMany(),
    prisma.additionalCostItem.deleteMany(),
    prisma.productTag.deleteMany(),
    prisma.productChannelPublication.deleteMany(),
    prisma.attributeValue.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.product.deleteMany(),
    prisma.supplierMaterialPrice.deleteMany(),
    prisma.supplierMaterial.deleteMany(),
    prisma.supplierContact.deleteMany(),
    prisma.material.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.productCategory.deleteMany(),
    prisma.attributeDefinition.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.salesChannel.deleteMany(),
    prisma.syncEvent.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.businessSettings.deleteMany(),
  ]);

  // ── §4, §5 business settings ────────────────────────────────────────────
  console.log("→ business settings (§5)");
  await prisma.businessSettings.create({
    data: {
      id: "singleton",
      businessName: "בית דפוס",
      currency: "ILS",
      vatRate: D(18),                       // §5 VAT_RATE
      averageSalesInclVat: D(120000),       // §5 AVERAGE_SALES_INCL_VAT
      averageWages: D(60000),               // §5 AVERAGE_WAGES
      employeeHourlyWage: D(45),            // §5 EMPLOYEE_HOURLY_WAGE
      employerMultiplier: D("1.4"),         // §5 EMPLOYER_MULTIPLIER
      laborRatioOverride: null,             // §6 derives 0.59 from the above
      minOrderInclVat: D(59),               // §5 MIN_ORDER_INCL_VAT
      targetContributionMargin: D("0.30"),
      targetSqmPriceInclVat: D(227),        // §5 TARGET_SQM_PRICE_INCL_VAT
      defaultMaterialCostPerSqm: D(45),     // §5 / §27 fallback only
      defaultPurchaseLotQuantity: D(50),    // C2 freight amortization basis
      displayRounding: 0,
    },
  });

  // ── §76 categories ──────────────────────────────────────────────────────
  console.log("→ categories (§76)");
  const signage = await prisma.productCategory.create({
    data: { name: "שילוט", sortOrder: 1, description: "שילוט פנים וחוץ" },
  });
  const indoor = await prisma.productCategory.create({
    data: { name: "שילוט פנים", parentId: signage.id, sortOrder: 1 },
  });
  await prisma.productCategory.create({
    data: { name: "שילוט חוץ", parentId: signage.id, sortOrder: 2 },
  });

  // ── §77 attribute dictionary ────────────────────────────────────────────
  console.log("→ attribute dictionary (§77)");
  const attrs = await Promise.all(
    [
      { key: "thickness_mm", label: 'עובי (מ"מ)', attributeGroup: "TECHNICAL", dataType: "NUMBER", unit: 'מ"מ', appliesTo: "MATERIAL", isCustomerVisible: true, sortOrder: 1 },
      { key: "surface_finish", label: "גימור פני השטח", attributeGroup: "TECHNICAL", dataType: "ENUM", enumOptions: ["מט", "מבריק", "מוברש"], appliesTo: "MATERIAL", isCustomerVisible: true, sortOrder: 2 },
      { key: "core_material", label: "חומר הליבה", attributeGroup: "TECHNICAL", dataType: "TEXT", appliesTo: "MATERIAL", isCustomerVisible: false, sortOrder: 3 },
      { key: "paper_weight_gsm", label: 'משקל נייר (גרם/מ"ר)', attributeGroup: "TECHNICAL", dataType: "NUMBER", unit: 'גר\'/מ"ר', appliesTo: "MATERIAL", isCustomerVisible: true, sortOrder: 4 },
      { key: "adhesive_type", label: "סוג דבק", attributeGroup: "TECHNICAL", dataType: "ENUM", enumOptions: ["קבוע", "מתפרק", "חוזר"], appliesTo: "MATERIAL", isCustomerVisible: true, sortOrder: 5 },
      { key: "print_resolution_dpi", label: "רזולוציית הדפסה (DPI)", attributeGroup: "PRINT", dataType: "NUMBER", unit: "DPI", appliesTo: "PRODUCT", isCustomerVisible: true, sortOrder: 10 },
      { key: "color_mode", label: "מרחב צבע", attributeGroup: "PRINT", dataType: "ENUM", enumOptions: ["CMYK", "CMYK + לבן", "פנטון"], appliesTo: "PRODUCT", isCustomerVisible: true, sortOrder: 11 },
      { key: "lamination", label: "למינציה", attributeGroup: "FINISHING", dataType: "ENUM", enumOptions: ["ללא", "מט", "מבריק"], appliesTo: "PRODUCT", isCustomerVisible: true, sortOrder: 20 },
      { key: "rounded_corners", label: "פינות מעוגלות", attributeGroup: "FINISHING", dataType: "BOOLEAN", appliesTo: "PRODUCT", isCustomerVisible: true, sortOrder: 21 },
      { key: "hanging_holes", label: "חורי תליה", attributeGroup: "FINISHING", dataType: "BOOLEAN", appliesTo: "PRODUCT", isCustomerVisible: true, sortOrder: 22 },
      { key: "uv_resistance_years", label: "עמידות UV (שנים)", attributeGroup: "TECHNICAL", dataType: "NUMBER", unit: "שנים", appliesTo: "PRODUCT", isCustomerVisible: true, sortOrder: 23 },
      { key: "iso_certified", label: "תקן ISO", attributeGroup: "LOGISTICS", dataType: "BOOLEAN", appliesTo: "SUPPLIER", isCustomerVisible: false, sortOrder: 30 },
    ].map((a) =>
      prisma.attributeDefinition.create({
        data: a as unknown as Prisma.AttributeDefinitionCreateInput,
      }),
    ),
  );
  const attrByKey = new Map(attrs.map((a) => [a.key, a]));

  // ── §9, §80 suppliers ───────────────────────────────────────────────────
  console.log("→ suppliers with contacts (§9, §80)");

  // §62 supplier A: tiers 35 / 32 / 29, freight 100.
  const supA = await prisma.supplier.create({
    data: {
      name: "ספק א׳",
      contactName: "דנה לוי",
      phone: "03-5550101",
      email: "sales@supplier-a.example",
      paymentTerms: "שוטף + 30",
      deliveryCost: D(100),
      minimumOrderValue: D(300),
      shippingType: "FLAT",
      addressWarehouse: "אזור התעשייה, חולון",
      qualityRating: 4,
      leadTimeDays: 5,
      isPreferred: true,
      certifications: "ISO 9001",
      notes: 'מחיר נמוך, אך הובלה של 100 ש"ח לכל משלוח.',
      contacts: {
        create: [
          { name: "דנה לוי", role: "SALES", phone: "03-5550101", email: "sales@supplier-a.example", isPrimary: true },
          { name: "משרד הנהח\"ש", role: "ACCOUNTING", email: "ap@supplier-a.example" },
        ],
      },
    },
  });

  // §62 supplier B: tiers 33 / 31, no freight.
  const supB = await prisma.supplier.create({
    data: {
      name: "ספק ב׳",
      contactName: "יוסי כהן",
      phone: "04-5550202",
      email: "info@supplier-b.example",
      paymentTerms: "שוטף + 60",
      deliveryCost: D(0),
      minimumOrderValue: D(0),
      shippingType: "FLAT",
      qualityRating: 5,
      leadTimeDays: 3,
      notes: "מחיר חומר גבוה יותר אך ללא עלות הובלה.",
      contacts: {
        create: [{ name: "יוסי כהן", role: "SALES", phone: "04-5550202", isPrimary: true }],
      },
    },
  });

  // §15's example third supplier, with free shipping above a threshold (§16).
  const supC = await prisma.supplier.create({
    data: {
      name: "ספק ג׳",
      contactName: "רונית שמש",
      phone: "08-5550303",
      deliveryCost: D(150),
      freeShippingThreshold: D(2000),
      shippingType: "FREE_ABOVE",
      minimumOrderValue: D(500),
      qualityRating: 3,
      leadTimeDays: 10,
      notes: "הובלה חינם מעל 2,000 ש\"ח.",
      contacts: {
        create: [{ name: "רונית שמש", role: "SALES", phone: "08-5550303", isPrimary: true }],
      },
    },
  });

  // ── §10 material ────────────────────────────────────────────────────────
  console.log("→ material (§10) — no purchase price stored");
  const lucobond = await prisma.material.create({
    data: {
      name: 'לוקובונד 3 מ"מ לבן',
      materialType: "לוח קומפוזיט",
      pricingUnit: "SQM",
      sku: "MAT-LUCO-3-WHITE",
      thicknessMm: D(3),
      finish: "מט",
      color: "לבן",
      sheetWidthCm: D(122),
      sheetHeightCm: D(244),
      weightKgPerSqm: D("4.5"),
      isPrintable: true,
      isOutdoorRated: true,
      defaultSupplierId: supA.id,
      notes: "חומר הדמו של §27. אין לוגיקה מיוחדת עבורו (§71).",
    },
  });

  // §77 material attribute values
  await prisma.attributeValue.createMany({
    data: [
      { definitionId: attrByKey.get("thickness_mm")!.id, entityType: "MATERIAL", entityId: lucobond.id, valueNumber: D(3) },
      { definitionId: attrByKey.get("surface_finish")!.id, entityType: "MATERIAL", entityId: lucobond.id, valueText: "מט" },
      { definitionId: attrByKey.get("core_material")!.id, entityType: "MATERIAL", entityId: lucobond.id, valueText: "פוליאתילן בין שני פחי אלומיניום" },
    ],
  });

  // ── §80 supplier catalog entries ────────────────────────────────────────
  console.log("→ supplier catalog (§80)");
  await prisma.supplierMaterial.createMany({
    data: [
      { supplierId: supA.id, materialId: lucobond.id, supplierSku: "A-LB3-WHT", supplierProductName: 'Lucobond 3mm White 122x244', packSize: D("2.9768"), packUnit: "לוח", leadTimeDays: 5, isPreferred: true },
      { supplierId: supB.id, materialId: lucobond.id, supplierSku: "BOND-3W", supplierProductName: 'קומפוזיט 3 מ"מ לבן', packSize: D("2.9768"), packUnit: "לוח", leadTimeDays: 3 },
      { supplierId: supC.id, materialId: lucobond.id, supplierSku: "C-99-LB3", packSize: D("2.9768"), packUnit: "לוח", leadTimeDays: 10 },
    ],
  });

  // ── §12, §13, §17 supplier prices ───────────────────────────────────────
  console.log("→ supplier prices: tiers (§13) and history (§17)");
  const LOT = D(50);
  const tierRow = (
    supplierId: string,
    unitPrice: number,
    minQ: number,
    maxQ: number | null,
    extra: Partial<Prisma.SupplierMaterialPriceUncheckedCreateInput> = {},
  ): Prisma.SupplierMaterialPriceUncheckedCreateInput => ({
    supplierId,
    materialId: lucobond.id,
    unit: "SQM",
    unitPrice: D(unitPrice),
    currency: "ILS",
    minimumQuantity: D(minQ),
    maximumQuantity: maxQ === null ? null : D(maxQ),
    purchaseLotQuantity: LOT,
    weightKgPerUnit: D("4.5"),
    includesPrinting: false,
    validFrom: new Date("2026-01-01"),
    validUntil: null,
    active: true,
    ...extra,
  });

  await prisma.supplierMaterialPrice.createMany({
    data: [
      // §62 supplier A — 1-9 at 35, 10-49 at 32, 50+ at 29
      tierRow(supA.id, 35, 1, 9),
      tierRow(supA.id, 32, 10, 49),
      tierRow(supA.id, 29, 50, null, { isDefault: true }),
      // §62 supplier B — 1-49 at 33, 50+ at 31
      tierRow(supB.id, 33, 1, 49),
      tierRow(supB.id, 31, 50, null),
      // Supplier C — flat 30, but freight only free above 2000 (§16)
      tierRow(supC.id, 30, 1, null, { notes: "מחיר אחיד, הובלה חינם מעל 2,000." }),
    ],
  });

  // §17 price history for supplier A: 30 → 32 → 35, as the SPEC's example shows.
  // Closed rows, so they never affect a current calculation.
  await prisma.supplierMaterialPrice.createMany({
    data: [
      tierRow(supA.id, 30, 0, 0, {
        minimumQuantity: D(1), maximumQuantity: D(9),
        validFrom: new Date("2025-01-01"), validUntil: new Date("2025-06-01"),
        active: false, notes: "היסטוריה (§17)",
      }),
      tierRow(supA.id, 32, 0, 0, {
        minimumQuantity: D(1), maximumQuantity: D(9),
        validFrom: new Date("2025-06-01"), validUntil: new Date("2026-01-01"),
        active: false, notes: "היסטוריה (§17)",
      }),
    ],
  });

  // ── §19, §79 product ────────────────────────────────────────────────────
  console.log("→ product with full PIM data (§19, §79)");
  const product = await prisma.product.create({
    data: {
      name: "לוקובונד מודפס",
      materialId: lucobond.id,
      pricingMethod: "SQM",
      laborMethod: "PERCENT",
      targetMargin: null,
      minimumOrder: null,

      // §31 / C7 — the real reason small formats cost more per sqm
      setupFee: D(25),
      handlingCostPerUnit: D("1.5"),
      printingCostPerSqm: D(12),
      cuttingCostPerUnit: D("0.8"),

      // §79 identity
      sku: "PRD-LUCO-PRINT",
      displayName: "שלט לוקובונד מודפס",
      categoryId: indoor.id,
      lifecycleStatus: "ACTIVE",
      launchedAt: new Date("2026-01-01"),

      // §79 technical
      minWidthCm: D(10), maxWidthCm: D(122),
      minHeightCm: D(10), maxHeightCm: D(244),
      isOutdoor: true,
      warrantyMonths: 24,
      leadTimeDays: 4,
      fileRequirements: "PDF או AI, CMYK, 150 DPI בגודל 1:1, בליד 3 מ\"מ.",
      careInstructions: "ניקוי במטלית לחה. אין להשתמש בחומרים אברזיביים.",
      productionNotes: "חיתוך ב-CNC. לגדלים מעל 100 ס\"מ נדרשת הדפסה בשני מעברים.",

      // §79 financial
      accountingCode: "4100",
      costCenter: "הדפסה דיגיטלית",
      vatCategory: "מלא",

      // §79 marketing
      shortDescription: "שלט קומפוזיט קשיח, עמיד לחוץ, עם הדפסה דיגיטלית באיכות גבוהה.",
      longDescription:
        "שלט לוקובונד בעובי 3 מ\"מ, מורכב משכבת פוליאתילן בין שני פחי אלומיניום. " +
        "השילוב נותן לוח קשיח וקל במיוחד, עמיד בתנאי חוץ ואינו מתעקם לאורך זמן. " +
        "ההדפסה דיגיטלית ישירה בטכנולוגיית UV, עמידה לשמש ולגשם.",
      sellingPoints: [
        "עמידות חוץ של עד 7 שנים",
        "קל משקל — 4.5 ק\"ג למ\"ר",
        "אינו מתעקם ואינו מחליד",
        "חיתוך לכל צורה ב-CNC",
        "אפשרות לפינות מעוגלות וחורי תליה",
      ],
      useCases: "שילוט חוץ, שילוט חזית, שלטי הכוונה, שילוט אתרי בנייה, תמרורי מידע.",
      seoSlug: "lucobond-printed-sign",
      seoTitle: "שלט לוקובונד מודפס | עמיד לחוץ",
      seoDescription: "שלטי לוקובונד מודפסים בהדפסת UV, עמידים בתנאי חוץ, בכל גודל.",
      notes: "מוצר דמו (§27, §71).",
    },
  });

  // §77 product attribute values
  await prisma.attributeValue.createMany({
    data: [
      { definitionId: attrByKey.get("print_resolution_dpi")!.id, entityType: "PRODUCT", entityId: product.id, valueNumber: D(720) },
      { definitionId: attrByKey.get("color_mode")!.id, entityType: "PRODUCT", entityId: product.id, valueText: "CMYK" },
      { definitionId: attrByKey.get("lamination")!.id, entityType: "PRODUCT", entityId: product.id, valueText: "ללא" },
      { definitionId: attrByKey.get("rounded_corners")!.id, entityType: "PRODUCT", entityId: product.id, valueBoolean: true },
      { definitionId: attrByKey.get("hanging_holes")!.id, entityType: "PRODUCT", entityId: product.id, valueBoolean: true },
      { definitionId: attrByKey.get("uv_resistance_years")!.id, entityType: "PRODUCT", entityId: product.id, valueNumber: D(7) },
    ],
  });

  // §79 tags
  const tags = await Promise.all(
    [
      { name: "עמיד לחוץ", color: "#2E7D32" },
      { name: "שילוט", color: "#1565C0" },
      { name: "מוצר מוביל", color: "#EF6C00" },
    ].map((t) => prisma.tag.create({ data: t })),
  );
  await prisma.productTag.createMany({
    data: tags.map((t) => ({ productId: product.id, tagId: t.id })),
  });

  // §37 additional costs
  await prisma.additionalCostItem.createMany({
    data: [
      { productId: product.id, name: "הכנת קובץ", scope: "FIXED_ORDER", amount: D(35) },
      { productId: product.id, name: "אריזה", scope: "VARIABLE_UNIT", amount: D("1.2") },
      { productId: product.id, name: "למינציה מט", scope: "VARIABLE_AREA", amount: D(8), active: false },
    ],
  });

  // ── §21, §28 sizes ──────────────────────────────────────────────────────
  console.log(`→ ${LUCOBOND.length} sizes (§28)`);
  const sizes = [];
  for (const [i, s] of LUCOBOND.entries()) {
    sizes.push(
      await prisma.productSize.create({
        data: {
          productId: product.id,
          name: s.name,
          widthCm: D(s.w),
          heightCm: D(s.h),
          sortOrder: i,
        },
      }),
    );
  }

  // ── §29, §55 price list ─────────────────────────────────────────────────
  console.log("→ price list version (§55) + tiers (§23, §29)");
  const priceList = await prisma.priceListVersion.create({
    data: {
      name: "מחירון נובמבר 2026",
      isActive: true,
      notes: "המחירון של §29. כל המחירים כוללים מע\"מ.",
    },
  });

  const tierRows: Prisma.QuantityTierUncheckedCreateInput[] = [];
  for (const [i, s] of LUCOBOND.entries()) {
    const size = sizes[i]!;
    if (s.prices.length !== TIER_BOUNDS.length) {
      throw new Error(`${s.name}: expected ${TIER_BOUNDS.length} prices, got ${s.prices.length}`);
    }
    for (const [j, [minQuantity, maxQuantity]] of TIER_BOUNDS.entries()) {
      tierRows.push({
        priceListVersionId: priceList.id,
        productId: product.id,
        productSizeId: size.id,
        minQuantity,
        maxQuantity,
        unitPriceInclVat: D(s.prices[j]!),
      });
    }
  }
  await prisma.quantityTier.createMany({ data: tierRows });

  // ── §81 channels (model and outbox only; no live connection) ────────────
  console.log("→ sales channels (§81) — inactive until a target is defined");
  await prisma.salesChannel.createMany({
    data: [
      { name: "אתר האינטרנט", channelType: "WEBSITE", isActive: false, config: {} },
      { name: "קופה", channelType: "POS", isActive: false, config: {} },
      { name: "מחירון ללקוח", channelType: "PRICE_LIST", isActive: false, config: {} },
    ],
  });

  console.log(`
✔ seed complete
  settings          1 (§5 defaults; nothing hard-coded in logic — §70)
  categories        3 (§76)
  attributes       ${attrs.length} definitions (§77)
  suppliers         3 with contacts and catalog entries (§9, §80)
  materials         1, with no stored purchase price (§10)
  supplier prices   6 in force + 2 historic (§13, §17)
  products          1 with full technical/financial/marketing data (§19, §79)
  sizes            ${sizes.length} (§28)
  price tiers      ${tierRows.length} = ${LUCOBOND.length} sizes × ${TIER_BOUNDS.length} tiers (§29)
  channels          3, inactive (§81)
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
