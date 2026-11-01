import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getRole, type MaterialDto, type PriceRowDto, type SupplierDto } from "../lib/api.js";
import { AdminOnly, Badge, Card, Empty, ErrorBox, Field, Loading, PageHead } from "../components/common.js";
import { SHIPPING_LABELS, UNIT_LABELS, date, money, num, tierLabel } from "../lib/format.js";

/**
 * §12, §13, §17, §48 — purchase prices.
 *
 * A price is never edited. Saving a new one closes the row in force and inserts a
 * new one, so the shop can still answer "what did this cost in June". The form
 * below therefore says "add a price", not "edit".
 */
export function SupplierPrices() {
  const role = getRole();
  const queryClient = useQueryClient();
  const [materialId, setMaterialId] = useState("");

  const materials = useQuery({
    queryKey: ["materials"],
    queryFn: () => api.get<MaterialDto[]>("/materials"),
    enabled: role === "ADMIN",
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get<SupplierDto[]>("/suppliers"),
    enabled: role === "ADMIN",
  });

  useEffect(() => {
    if (materialId === "" && materials.data !== undefined && materials.data.length > 0) {
      setMaterialId(materials.data[0]!.id);
    }
  }, [materials.data, materialId]);

  const prices = useQuery({
    queryKey: ["prices", materialId],
    queryFn: () => api.get<PriceRowDto[]>(`/materials/${materialId}/prices`),
    enabled: role === "ADMIN" && materialId !== "",
  });

  const [form, setForm] = useState({
    supplierId: "",
    unitPrice: "",
    minimumQuantity: "1",
    maximumQuantity: "",
    purchaseLotQuantity: "",
    deliveryCost: "",
    includesPrinting: false,
    notes: "",
  });

  const material = materials.data?.find((m) => m.id === materialId);

  const addPrice = useMutation({
    mutationFn: () =>
      api.post(`/materials/${materialId}/prices`, {
        supplierId: form.supplierId,
        unit: material?.pricingUnit ?? "SQM",
        unitPrice: form.unitPrice,
        minimumQuantity: form.minimumQuantity === "" ? "0" : form.minimumQuantity,
        maximumQuantity: form.maximumQuantity === "" ? null : form.maximumQuantity,
        purchaseLotQuantity: form.purchaseLotQuantity === "" ? null : form.purchaseLotQuantity,
        deliveryCost: form.deliveryCost === "" ? null : form.deliveryCost,
        includesPrinting: form.includesPrinting,
        notes: form.notes === "" ? undefined : form.notes,
      }),
    onSuccess: () => {
      setForm((f) => ({ ...f, unitPrice: "", notes: "" }));
      void queryClient.invalidateQueries({ queryKey: ["prices"] });
      void queryClient.invalidateQueries({ queryKey: ["compare"] });
      void queryClient.invalidateQueries({ queryKey: ["calculate"] });
    },
  });

  if (role !== "ADMIN") {
    return (
      <>
        <PageHead title="מחירי ספקים" spec="§12 · §17" />
        <AdminOnly what="מסך מחירי הספקים" />
      </>
    );
  }

  const inForce = (prices.data ?? []).filter((p) => p.validUntil === null && p.active);
  const history = (prices.data ?? []).filter((p) => p.validUntil !== null || !p.active);
  const unit = material === undefined ? "" : (UNIT_LABELS[material.pricingUnit] ?? material.pricingUnit);

  return (
    <>
      <PageHead title="מחירי ספקים" spec="§12 · §13 · §17" />
      <div className="notice">
        מחיר קיים לעולם אינו נדרס. הוספת מחיר חדש סוגרת את המחיר שבתוקף ויוצרת רשומה חדשה,
        כדי שהמערכת תדע איזה מחיר היה תקף בכל תאריך (§17). הצעות מחיר שנשמרו אינן משתנות (§18).
      </div>
      <ErrorBox error={materials.error ?? prices.error ?? addPrice.error} />

      <Card>
        <Field label="חומר">
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} style={{ maxWidth: 360 }}>
            {materials.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({UNIT_LABELS[m.pricingUnit] ?? m.pricingUnit})
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {prices.isLoading && <Card><Loading /></Card>}

      <Card title="מחירים בתוקף" spec="§13">
        {inForce.length === 0 ? (
          <Empty>אין מחיר בתוקף לחומר הזה.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ספק</th>
                <th>מדרגה</th>
                <th className="num">מחיר / {unit}</th>
                <th className="num">הובלה</th>
                <th className="num">כמות רכש</th>
                <th>כולל הדפסה</th>
                <th>בתוקף מ-</th>
              </tr>
            </thead>
            <tbody>
              {inForce.map((p) => (
                <tr key={p.id}>
                  <td>{p.supplier.name}</td>
                  <td>
                    {tierLabel(
                      num(p.minimumQuantity, 0),
                      p.maximumQuantity === null ? null : num(p.maximumQuantity, 0),
                    )}
                  </td>
                  <td className="num">{money(p.unitPrice)}</td>
                  <td className="num">
                    {p.deliveryCost === null ? (
                      <span style={{ color: "var(--text-faint)" }}>כספק</span>
                    ) : (
                      money(p.deliveryCost)
                    )}
                    {p.shippingType !== null && (
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                        {SHIPPING_LABELS[p.shippingType] ?? p.shippingType}
                      </div>
                    )}
                  </td>
                  <td className="num">{p.purchaseLotQuantity === null ? "כהגדרות" : num(p.purchaseLotQuantity)}</td>
                  <td>{p.includesPrinting ? <Badge kind="warn">כן</Badge> : "לא"}</td>
                  <td>{date(p.validFrom)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="הוספת מחיר" spec="§17 · §48">
        <div className="grid cols-3">
          <Field label="ספק">
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">— בחר —</option>
              {suppliers.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label={`מחיר ל-${unit}`}>
            <input
              type="number" step="any" min="0"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
            />
          </Field>
          <Field label="כמות מינימלית למדרגה">
            <input
              type="number" step="any" min="0"
              value={form.minimumQuantity}
              onChange={(e) => setForm({ ...form, minimumQuantity: e.target.value })}
            />
          </Field>
          <Field label="כמות מקסימלית" hint="ריק = פתוח">
            <input
              type="number" step="any" min="0"
              value={form.maximumQuantity}
              onChange={(e) => setForm({ ...form, maximumQuantity: e.target.value })}
            />
          </Field>
          <Field label="כמות רכש לפריסת הובלה" hint="ריק = כהגדרות העסק">
            <input
              type="number" step="any" min="0"
              value={form.purchaseLotQuantity}
              onChange={(e) => setForm({ ...form, purchaseLotQuantity: e.target.value })}
            />
          </Field>
          <Field label="עלות הובלה" hint="ריק = כהגדרת הספק">
            <input
              type="number" step="any" min="0"
              value={form.deliveryCost}
              onChange={(e) => setForm({ ...form, deliveryCost: e.target.value })}
            />
          </Field>
        </div>

        <label className="check" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={form.includesPrinting}
            onChange={(e) => setForm({ ...form, includesPrinting: e.target.checked })}
          />
          <span>
            המחיר כולל הדפסה
            <div className="hint">אם מסומן, עלות ההדפסה לא תתווסף בנפרד, כדי לא לספור פעמיים (§35).</div>
          </span>
        </label>

        <Field label="הערות">
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>

        <button
          type="button"
          className="primary"
          disabled={form.supplierId === "" || form.unitPrice === "" || addPrice.isPending}
          onClick={() => addPrice.mutate()}
        >
          {addPrice.isPending ? "שומר…" : "הוסף מחיר"}
        </button>
        {addPrice.isSuccess && (
          <span style={{ marginInlineStart: 10, color: "var(--good)", fontSize: 13 }}>
            נוסף. המחיר הקודם נסגר ונשמר בהיסטוריה.
          </span>
        )}
      </Card>

      <Card title="היסטוריית מחירים" spec="§17">
        {history.length === 0 ? (
          <Empty>אין היסטוריה.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ספק</th>
                <th>מדרגה</th>
                <th className="num">מחיר</th>
                <th>מ-</th>
                <th>עד</th>
                <th>הערות</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id} style={{ color: "var(--text-muted)" }}>
                  <td>{p.supplier.name}</td>
                  <td>
                    {tierLabel(
                      num(p.minimumQuantity, 0),
                      p.maximumQuantity === null ? null : num(p.maximumQuantity, 0),
                    )}
                  </td>
                  <td className="num">{money(p.unitPrice)}</td>
                  <td>{date(p.validFrom)}</td>
                  <td>{date(p.validUntil)}</td>
                  <td>{p.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
