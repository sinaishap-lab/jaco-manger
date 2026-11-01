import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api, getRole,
  type ProductListItem, type QuoteResultDto, type RecommendDto, type SizeDto, type SupplierDto,
} from "../lib/api.js";
import { Badge, Card, ErrorBox, Field, Line, Loading, PageHead, Warnings } from "../components/common.js";
import { DRIVEN_BY_LABELS, LABOR_LABELS, UNIT_LABELS, isNegative, money, num, pct, tierLabel } from "../lib/format.js";

/**
 * §44, §45 — the pricing calculator.
 *
 * Every number shown comes from the engine via /api/calculate. The screen does no
 * arithmetic of its own, which is what §58 requires: a formula exists once, in
 * @jaco/core, and the UI only renders what it returns.
 */
export function Calculator() {
  const role = getRole();

  const [productId, setProductId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [supplierMode, setSupplierMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [supplierId, setSupplierId] = useState("");
  const [laborMethod, setLaborMethod] = useState<"PERCENT" | "HOURLY" | "COMBINED" | "">("");
  const [dedicatedPurchase, setDedicatedPurchase] = useState(false);
  const [showRecommendation, setShowRecommendation] = useState(false);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<ProductListItem[]>("/products"),
  });

  const sizes = useQuery({
    queryKey: ["sizes", productId],
    queryFn: () => api.get<SizeDto[]>(`/products/${productId}/sizes`),
    enabled: productId !== "",
  });

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get<SupplierDto[]>("/suppliers"),
  });

  // Pick the first product and size once loaded, so the screen is never empty.
  useEffect(() => {
    if (productId === "" && products.data !== undefined && products.data.length > 0) {
      setProductId(products.data[0]!.id);
    }
  }, [products.data, productId]);

  useEffect(() => {
    if (sizes.data !== undefined && sizes.data.length > 0) {
      const stillThere = sizes.data.some((s) => s.id === sizeId);
      if (!stillThere) setSizeId(sizes.data[0]!.id);
    }
  }, [sizes.data, sizeId]);

  const body = useMemo(
    () => ({
      productId,
      productSizeId: sizeId === "" ? null : sizeId,
      quantity,
      supplierMode,
      selectedSupplierId: supplierMode === "MANUAL" && supplierId !== "" ? supplierId : null,
      shippingAllocation: dedicatedPurchase ? "FULL_ORDER" : "AMORTIZED",
      ...(laborMethod === "" ? {} : { laborMethod }),
    }),
    [productId, sizeId, quantity, supplierMode, supplierId, dedicatedPurchase, laborMethod],
  );

  const quote = useQuery({
    queryKey: ["calculate", body],
    queryFn: () => api.post<QuoteResultDto>("/calculate", body),
    enabled: productId !== "" && quantity > 0,
  });

  // §50 — only an ADMIN may ask for a recommended price.
  const recommendation = useQuery({
    queryKey: ["recommend", body],
    queryFn: () => api.post<RecommendDto>("/calculate/recommend-price", body),
    enabled: showRecommendation && role === "ADMIN" && productId !== "" && quantity > 0,
  });

  const product = products.data?.find((p) => p.id === productId);
  const r = quote.data;

  return (
    <>
      <PageHead title="מחשבון תמחור" spec="§44 · §45">
        {r !== undefined && (
          <Badge kind="neutral">מנוע {r.engineVersion}</Badge>
        )}
      </PageHead>

      <ErrorBox error={products.error ?? quote.error} />

      <div className="grid calc">
        {/* ─────────── inputs ─────────── */}
        <div>
          <Card title="קלט">
            <Field label="מוצר">
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName ?? p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="גודל"
              hint={
                sizes.data !== undefined && sizeId !== ""
                  ? (() => {
                      const s = sizes.data.find((x) => x.id === sizeId);
                      return s === undefined
                        ? undefined
                        : `${num(s.widthCm, 1)} × ${num(s.heightCm, 1)} ס"מ = ${num(s.areaSqm)} מ"ר`;
                    })()
                  : undefined
              }
            >
              <select value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
                {(sizes.data ?? []).length === 0 && <option value="">— ללא גודל —</option>}
                {sizes.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="כמות"
              hint={
                r?.tier == null
                  ? undefined
                  : `מדרגה ${tierLabel(r.tier.minQuantity, r.tier.maxQuantity)} · ${money(r.tier.unitPriceInclVat)} ליחידה`
              }
            >
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>

            <Field label="ספק">
              <div className="radio-row" style={{ marginBottom: 6 }}>
                <label>
                  <input
                    type="radio"
                    checked={supplierMode === "AUTO"}
                    onChange={() => setSupplierMode("AUTO")}
                  />
                  אוטומטי
                </label>
                <label>
                  <input
                    type="radio"
                    checked={supplierMode === "MANUAL"}
                    onChange={() => setSupplierMode("MANUAL")}
                  />
                  בחירה ידנית
                </label>
              </div>
              {supplierMode === "MANUAL" && (
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">— בחר ספק —</option>
                  {suppliers.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field
              label="שיטת עבודה"
              hint={
                product === undefined
                  ? undefined
                  : `ברירת המחדל של המוצר: ${LABOR_LABELS[product.pricingMethod] ?? ""}`
              }
            >
              <select value={laborMethod} onChange={(e) => setLaborMethod(e.target.value as typeof laborMethod)}>
                <option value="">כהגדרת המוצר</option>
                <option value="PERCENT">{LABOR_LABELS.PERCENT}</option>
                <option value="HOURLY">{LABOR_LABELS.HOURLY}</option>
                <option value="COMBINED">{LABOR_LABELS.COMBINED}</option>
              </select>
            </Field>

            {/* C2 — the freight allocation decision, made explicit for the user. */}
            <label className="check" style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={dedicatedPurchase}
                onChange={(e) => setDedicatedPurchase(e.target.checked)}
              />
              <span>
                ההזמנה מחייבת רכש ייחודי
                <div className="hint">
                  כברירת מחדל ההובלה נפרסת על כמות הרכש הרגילה. סימון כאן מעמיס את ההובלה
                  במלואה על ההזמנה הזו.
                </div>
              </span>
            </label>
          </Card>

          {/* §45 — the recommended supplier panel */}
          {role === "ADMIN" && r?.supplier != null && (
            <Card title="ספק" spec="§45 · §15">
              <div className="readout">
                <Line
                  label={supplierMode === "AUTO" ? "ספק מומלץ" : "ספק נבחר"}
                  value={<strong>{r.supplier.supplierName}</strong>}
                />
                <Line
                  label={`מחיר רכש (מדרגה ${tierLabel(num(r.supplier.tierMinimumQuantity, 0), r.supplier.tierMaximumQuantity === null ? null : num(r.supplier.tierMaximumQuantity, 0))})`}
                  value={`${money(r.supplier.unitPrice)} / ${UNIT_LABELS[r.measure.measureUnit] ?? ""}`}
                />
                <Line label="הובלה למשלוח" value={money(r.supplier.shippingCostFull)} />
                {r.supplier.purchaseLotQuantity !== null && (
                  <Line
                    label="נפרסת על כמות רכש"
                    value={`${num(r.supplier.purchaseQuantity)} ${UNIT_LABELS[r.measure.measureUnit] ?? ""}`}
                    variant="sub"
                  />
                )}
                <Line
                  label="עלות אפקטיבית ליחידה"
                  value={<strong>{money(r.supplier.effectiveUnitCost)}</strong>}
                  variant="total"
                />
                <Line
                  label="עלות רכש להזמנה"
                  value={money(r.supplier.effectivePurchaseCost)}
                />
                {r.supplier.includesPrinting && (
                  <div style={{ marginTop: 8 }}>
                    <Badge kind="neutral">המחיר כולל הדפסה</Badge>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* ─────────── result ─────────── */}
        <div>
          {quote.isLoading && <Card><Loading /></Card>}

          {r !== undefined && (
            <>
              <Card title="מחיר ללקוח" spec="§3 · §25 · §32">
                <div className="readout">
                  <Line
                    label="סה״כ כולל מע״מ"
                    value={money(r.totalPriceInclVat)}
                    variant="headline"
                  />
                  <Line label="מחיר יחידה כולל מע״מ" value={money(r.unitPriceInclVat)} />
                  <Line label="לפני מע״מ" value={money(r.totalPriceExVat)} />
                  {r.minimumOrderApplied && (
                    <div style={{ marginTop: 8 }}>
                      <Badge kind="warn">הופעל מינימום הזמנה</Badge>
                    </div>
                  )}
                </div>
              </Card>

              <Card title="מידה" spec="§22 · §33 · §43">
                <div className="readout">
                  {r.areaPerUnit !== null && (
                    <>
                      <Line label='שטח ליחידה (מ"ר)' value={num(r.areaPerUnit)} />
                      <Line label='שטח כולל (מ"ר)' value={num(r.totalArea)} />
                    </>
                  )}
                  {/* For an area-priced product this would just repeat the area above. */}
                  {r.measure.measureUnit !== "SQM" && (
                    <Line
                      label={`מידה כוללת (${UNIT_LABELS[r.measure.measureUnit] ?? r.measure.measureUnit})`}
                      value={num(r.measure.totalMeasure)}
                    />
                  )}
                  {r.effectivePricePerSqmInclVat !== null && (
                    <>
                      <Line
                        label='מחיר אפקטיבי למ"ר כולל מע״מ'
                        value={money(r.effectivePricePerSqmInclVat)}
                        variant="total"
                      />
                      <Line
                        label='לפני מע״מ'
                        value={money(r.effectivePricePerSqmExVat)}
                        variant="sub"
                      />
                    </>
                  )}
                </div>
              </Card>

              {/* §57 — a USER never receives these fields at all. */}
              {r.totalCost !== undefined ? (
                <Card title="עלויות ותרומה" spec="§40 · §41 · §42">
                  <div className="readout">
                    <Line label="חומר" value={money(r.materialCost)} />
                    <Line label="הובלה (רכש)" value={money(r.shippingCost)} />
                    <Line label="הדפסה" value={money(r.printingCost)} />
                    <Line label="חיתוך" value={money(r.cuttingCost)} />
                    <Line
                      label={`עבודה${r.derivedSettings === undefined ? "" : ` · ${pct(String(Number(r.derivedSettings.laborRatio) * 100))}`}`}
                      value={money(r.laborCost)}
                    />
                    <Line label="עלויות נוספות" value={money(r.additionalCost)} />
                    {r.breakdown !== undefined && (
                      <>
                        <Line label="מתוכן: setup" value={money(r.breakdown.setupCost)} variant="sub" />
                        <Line label="מתוכן: טיפול" value={money(r.breakdown.handlingCost)} variant="sub" />
                      </>
                    )}
                    <Line label="סה״כ עלות" value={money(r.totalCost)} variant="total" />
                    <Line
                      label="תרומה לאחר עלויות"
                      value={money(r.contribution)}
                      variant="headline"
                      sign={isNegative(r.contribution) ? "neg" : "pos"}
                    />
                    <Line
                      label="אחוז תרומה"
                      value={pct(r.contributionMargin)}
                      sign={isNegative(r.contributionMargin) ? "neg" : "pos"}
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowRecommendation((v) => !v)}
                    >
                      {showRecommendation ? "הסתר מחיר מומלץ" : "חשב מחיר מכירה מומלץ (§50)"}
                    </button>
                  </div>

                  {showRecommendation && (
                    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <ErrorBox error={recommendation.error} />
                      {recommendation.isLoading && <Loading />}
                      {recommendation.data !== undefined && (
                        <div className="readout">
                          {/* §51 — current and recommended side by side; the user decides. */}
                          <Line label="מחיר נוכחי (יחידה)" value={money(r.unitPriceInclVat)} />
                          <Line
                            label="מחיר מומלץ (יחידה)"
                            value={<strong>{money(recommendation.data.recommendedUnitPriceInclVat)}</strong>}
                          />
                          <Line
                            label="נקבע לפי"
                            value={DRIVEN_BY_LABELS[recommendation.data.drivenBy] ?? recommendation.data.drivenBy}
                          />
                          <Line
                            label="יעד תרומה"
                            value={pct(String(Number(recommendation.data.targetMargin) * 100))}
                          />
                          <Line label="עלויות שאינן תלויות במחיר" value={money(recommendation.data.fixedCosts)} />
                          <Warnings items={recommendation.data.warnings} />
                          <div className="notice" style={{ marginTop: 10, marginBottom: 0 }}>
                            המערכת אינה מעדכנת את המחירון. זו המלצה בלבד (§51).
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ) : (
                <div className="notice">
                  נתוני עלות ורווחיות אינם מוצגים להרשאת USER. הסינון מתבצע בשרת (§57).
                </div>
              )}

              <Warnings items={r.warnings} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
