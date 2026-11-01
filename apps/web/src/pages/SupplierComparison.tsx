import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getRole, type ComparisonDto, type MaterialDto } from "../lib/api.js";
import { AdminOnly, Badge, Card, Empty, ErrorBox, Field, Loading, PageHead, Warnings } from "../components/common.js";
import { UNIT_LABELS, money, num, tierLabel } from "../lib/format.js";

/**
 * §46, §63 — rank suppliers by what the order actually costs.
 *
 * The quantity entered is the purchase quantity, so freight divides by it directly.
 * That is why §62's two suppliers both come to 1550 and an effective 31 per sqm
 * despite quoting 29 and 31: a lower sticker price is not a cheaper order. The
 * cheapest row is highlighted, and ties share the highlight rather than one
 * arbitrarily winning.
 */
export function SupplierComparison() {
  const role = getRole();
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("50");

  const materials = useQuery({
    queryKey: ["materials"],
    queryFn: () => api.get<MaterialDto[]>("/materials"),
  });

  useEffect(() => {
    if (materialId === "" && materials.data !== undefined && materials.data.length > 0) {
      setMaterialId(materials.data[0]!.id);
    }
  }, [materials.data, materialId]);

  const qty = Number(quantity);
  const comparison = useQuery({
    queryKey: ["compare", materialId, quantity],
    queryFn: () => api.get<ComparisonDto>(`/suppliers/compare?materialId=${materialId}&quantity=${quantity}`),
    enabled: role === "ADMIN" && materialId !== "" && Number.isFinite(qty) && qty > 0,
  });

  if (role !== "ADMIN") {
    return (
      <>
        <PageHead title="השוואת ספקים" spec="§46 · §63" />
        <AdminOnly what="מסך השוואת הספקים" />
      </>
    );
  }

  const material = materials.data?.find((m) => m.id === materialId);
  const unit = material === undefined ? "" : (UNIT_LABELS[material.pricingUnit] ?? material.pricingUnit);

  return (
    <>
      <PageHead title="השוואת ספקים" spec="§46 · §63" />
      <ErrorBox error={materials.error ?? comparison.error} />

      <Card>
        <div className="grid cols-3">
          <Field label="חומר">
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              {materials.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`כמות רכש${unit === "" ? "" : ` (${unit})`}`} hint="הכמות שנרכשת בפועל מהספק">
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {comparison.isLoading && <Card><Loading /></Card>}

      {comparison.data !== undefined && (
        <>
          {comparison.data.rows.length === 0 ? (
            <Card><Empty>אין ספק עם מחיר תקף לחומר הזה.</Empty></Card>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ספק</th>
                    <th className="num">מחיר / {unit}</th>
                    <th>מדרגה</th>
                    <th className="num">הובלה</th>
                    <th className="num">תוספות</th>
                    <th className="num">עלות חומר</th>
                    <th className="num">עלות כוללת</th>
                    <th className="num">אפקטיבי / {unit}</th>
                    <th>הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.data.rows.map((row) => (
                    <tr key={row.supplierId} className={row.isCheapest ? "highlight" : undefined}>
                      <td>
                        {row.isCheapest && <span aria-label="הזול ביותר">✅ </span>}
                        {row.supplierName}
                      </td>
                      <td className="num">{money(row.unitPrice)}</td>
                      <td>
                        {tierLabel(
                          num(row.tierMinimumQuantity, 0),
                          row.tierMaximumQuantity === null ? null : num(row.tierMaximumQuantity, 0),
                        )}
                      </td>
                      <td className="num">{money(row.shippingCharged)}</td>
                      <td className="num">{money(row.additionalCostCharged)}</td>
                      <td className="num">{money(row.materialCost)}</td>
                      <td className="num">
                        <strong>{money(row.effectivePurchaseCost)}</strong>
                      </td>
                      <td className="num">{money(row.effectiveCostPerUnit)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {!row.meetsMinimum && <Badge kind="warn">מתחת למינימום הספק</Badge>}
                          {row.includesPrinting && <Badge kind="neutral">כולל הדפסה</Badge>}
                          {row.warnings.some((w) => w.code === "MIXED_CURRENCIES") && (
                            <Badge kind="bad">מטבע אחר</Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Warnings items={comparison.data.warnings} />

          {/* §63 — spell out the reasoning when the ranking is counter-intuitive. */}
          {comparison.data.rows.length > 1 &&
            (() => {
              const rows = comparison.data.rows;
              const cheapest = rows[0]!;
              const lowestSticker = rows.reduce((best, r) =>
                Number(r.unitPrice) < Number(best.unitPrice) ? r : best,
              );
              const tie = rows.filter((r) => r.isCheapest).length > 1;

              if (tie) {
                return (
                  <div className="notice">
                    שני ספקים או יותר מגיעים לאותה עלות אפקטיבית בכמות הזו. מחיר החומר שונה, אבל
                    ההובלה מאזנת את ההפרש — זה בדיוק המצב שמתואר ב-§62.
                  </div>
                );
              }
              if (lowestSticker.supplierId !== cheapest.supplierId) {
                return (
                  <div className="notice">
                    ל-{lowestSticker.supplierName} מחיר החומר הנמוך ביותר ({money(lowestSticker.unitPrice)}),
                    אבל {cheapest.supplierName} זול יותר בפועל בכמות הזו. זו השאלה שקובעת לפי §63:
                    לא מי מוכר בזול, אלא מי נותן את העלות האפקטיבית הנמוכה ביותר להזמנה הנוכחית.
                  </div>
                );
              }
              return null;
            })()}
        </>
      )}
    </>
  );
}
