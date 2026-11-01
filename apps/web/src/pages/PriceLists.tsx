import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api, getRole,
  type PriceListDto, type ProductListItem, type QuoteResultDto, type SizeDto, type TierDto,
} from "../lib/api.js";
import { Badge, Card, Empty, ErrorBox, Field, Loading, PageHead } from "../components/common.js";
import { isNegative, money, num, pct, tierLabel } from "../lib/format.js";

/** §24 + C3 — the eight tiers; the last starts at 301, not 300. */
const TIER_BOUNDS: Array<[number, number | null]> = [
  [1, 5], [6, 10], [11, 25], [26, 50],
  [51, 100], [101, 200], [201, 300], [301, null],
];

/**
 * §29, §51 — the price list grid.
 *
 * An ADMIN also gets the contribution of each cell, computed by the engine, so the
 * grid shows not just what we charge but what we keep. §51 is the rule the screen
 * obeys: nothing here is rewritten automatically when a cost changes.
 */
export function PriceLists() {
  const role = getRole();
  const [versionId, setVersionId] = useState("");
  const [productId, setProductId] = useState("");
  const [showMargins, setShowMargins] = useState(false);

  const lists = useQuery({
    queryKey: ["price-lists"],
    queryFn: () => api.get<PriceListDto[]>("/price-lists"),
  });
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<ProductListItem[]>("/products"),
  });

  useEffect(() => {
    if (versionId === "" && lists.data !== undefined && lists.data.length > 0) {
      setVersionId((lists.data.find((l) => l.isActive) ?? lists.data[0]!).id);
    }
  }, [lists.data, versionId]);

  useEffect(() => {
    if (productId === "" && products.data !== undefined && products.data.length > 0) {
      setProductId(products.data[0]!.id);
    }
  }, [products.data, productId]);

  const sizes = useQuery({
    queryKey: ["sizes", productId],
    queryFn: () => api.get<SizeDto[]>(`/products/${productId}/sizes`),
    enabled: productId !== "",
  });

  const tiers = useQuery({
    queryKey: ["tiers", versionId, productId],
    queryFn: () => api.get<TierDto[]>(`/price-lists/${versionId}/tiers?productId=${productId}`),
    enabled: versionId !== "" && productId !== "",
  });

  // One engine call per size at the first tier, to show the margin alongside the price.
  const margins = useQuery({
    queryKey: ["grid-margins", productId, (sizes.data ?? []).map((s) => s.id).join(",")],
    queryFn: async () => {
      const list = sizes.data ?? [];
      const results = await Promise.all(
        list.map((s) =>
          api.post<QuoteResultDto>("/calculate", { productId, productSizeId: s.id, quantity: 1 }),
        ),
      );
      return new Map(list.map((s, i) => [s.id, results[i]!]));
    },
    enabled: showMargins && role === "ADMIN" && productId !== "" && (sizes.data ?? []).length > 0,
  });

  const priceAt = (sizeId: string, min: number): TierDto | undefined =>
    tiers.data?.find((t) => t.productSizeId === sizeId && t.minQuantity === min);

  const version = lists.data?.find((l) => l.id === versionId);

  return (
    <>
      <PageHead title="מחירונים" spec="§29 · §51 · §55">
        {version !== undefined && version.isActive && <Badge kind="good">פעיל</Badge>}
      </PageHead>

      <ErrorBox error={lists.error ?? tiers.error} />

      <Card>
        <div className="grid cols-3">
          <Field label="גרסת מחירון">
            <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              {lists.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.isActive ? " · פעיל" : ""} ({l._count.tiers})
                </option>
              ))}
            </select>
          </Field>
          <Field label="מוצר">
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName ?? p.name}</option>
              ))}
            </select>
          </Field>
          {role === "ADMIN" && (
            <Field label="תצוגה">
              <label className="check" style={{ marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={showMargins}
                  onChange={(e) => setShowMargins(e.target.checked)}
                />
                <span>הצג תרומה לכל גודל</span>
              </label>
            </Field>
          )}
        </div>
      </Card>

      {(tiers.isLoading || sizes.isLoading) && <Card><Loading /></Card>}

      {sizes.data !== undefined && tiers.data !== undefined && (
        sizes.data.length === 0 ? (
          <Card><Empty>למוצר לא הוגדרו גדלים.</Empty></Card>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>גודל</th>
                    <th className="num">מ"ר</th>
                    {TIER_BOUNDS.map(([lo, hi]) => (
                      <th key={lo} className="num">{tierLabel(lo, hi)}</th>
                    ))}
                    {showMargins && role === "ADMIN" && (
                      <>
                        <th className="num">עלות (יח׳)</th>
                        <th className="num">תרומה (יח׳)</th>
                        <th className="num">אחוז</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sizes.data.map((s) => {
                    const m = margins.data?.get(s.id);
                    return (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td className="num">{num(s.areaSqm)}</td>
                        {TIER_BOUNDS.map(([lo]) => {
                          const t = priceAt(s.id, lo);
                          return (
                            <td key={lo} className="num">
                              {t === undefined ? (
                                <span style={{ color: "var(--text-faint)" }}>—</span>
                              ) : (
                                money(t.unitPriceInclVat, 0)
                              )}
                            </td>
                          );
                        })}
                        {showMargins && role === "ADMIN" && (
                          <>
                            <td className="num">{m === undefined ? "…" : money(m.totalCost)}</td>
                            <td className={`num ${m !== undefined && isNegative(m.contribution) ? "neg" : "pos"}`}>
                              {m === undefined ? "…" : money(m.contribution)}
                            </td>
                            <td className={`num ${m !== undefined && isNegative(m.contributionMargin) ? "neg" : "pos"}`}>
                              {m === undefined ? "…" : pct(m.contributionMargin)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="notice" style={{ marginTop: 14 }}>
              המערכת אינה מעדכנת את המחירון כשעלות משתנה. היא מציגה את המחיר הנוכחי ואת המחיר
              המומלץ, וההחלטה שלך (§51). מחיר מומלץ מחושב במחשבון התמחור.
            </div>
            {showMargins && margins.isLoading && (
              <div className="hint">מחשב תרומה לכל גודל…</div>
            )}
          </>
        )
      )}
    </>
  );
}
