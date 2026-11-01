import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type ProductListItem } from "../lib/api.js";
import { Badge, Card, Empty, ErrorBox, Field, Loading, PageHead } from "../components/common.js";
import { LIFECYCLE_LABELS, UNIT_LABELS } from "../lib/format.js";

interface CategoryNode {
  id: string;
  name: string;
  children: CategoryNode[];
  _count: { products: number };
}

/** §76, §79 — the product catalog. */
export function Products() {
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<CategoryNode[]>("/categories"),
  });

  const products = useQuery({
    queryKey: ["products", categoryId, status],
    queryFn: () => {
      const qs = new URLSearchParams({ all: "true" });
      if (categoryId !== "") qs.set("categoryId", categoryId);
      if (status !== "") qs.set("lifecycleStatus", status);
      return api.get<ProductListItem[]>(`/products?${qs.toString()}`);
    },
  });

  const flat: CategoryNode[] = [];
  const walk = (nodes: CategoryNode[], depth = 0) => {
    for (const n of nodes) {
      flat.push({ ...n, name: `${"— ".repeat(depth)}${n.name}` });
      walk(n.children, depth + 1);
    }
  };
  walk(categories.data ?? []);

  const term = search.trim().toLowerCase();
  const rows = (products.data ?? []).filter((p) =>
    term === ""
      ? true
      : [p.name, p.displayName, p.sku].some((v) => v !== null && v !== undefined && v.toLowerCase().includes(term)),
  );

  return (
    <>
      <PageHead title="קטלוג מוצרים" spec="§76 · §79" />
      <ErrorBox error={products.error ?? categories.error} />

      <Card>
        <div className="grid cols-3">
          <Field label="חיפוש">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='שם או מק"ט' />
          </Field>
          <Field label="קטגוריה">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">כל הקטגוריות</option>
              {flat.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c._count.products})
                </option>
              ))}
            </select>
          </Field>
          <Field label="מצב">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">הכול</option>
              <option value="ACTIVE">{LIFECYCLE_LABELS.ACTIVE}</option>
              <option value="DRAFT">{LIFECYCLE_LABELS.DRAFT}</option>
              <option value="DISCONTINUED">{LIFECYCLE_LABELS.DISCONTINUED}</option>
            </select>
          </Field>
        </div>
      </Card>

      {products.isLoading && <Card><Loading /></Card>}

      {products.data !== undefined &&
        (rows.length === 0 ? (
          <Card><Empty>לא נמצאו מוצרים.</Empty></Card>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>תמונה</th>
                  <th>מוצר</th>
                  <th>מק"ט</th>
                  <th>קטגוריה</th>
                  <th>חומר</th>
                  <th>תמחור</th>
                  <th className="num">גדלים</th>
                  <th className="num">מדרגות</th>
                  <th>תגיות</th>
                  <th>מצב</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.primaryImage === null ? (
                        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>—</span>
                      ) : (
                        <img
                          src={`/uploads/${p.primaryImage.filePath}`}
                          alt={p.primaryImage.altText ?? ""}
                          style={{ width: 44, height: 33, objectFit: "cover", borderRadius: 4 }}
                        />
                      )}
                    </td>
                    <td>
                      <Link to={`/products/${p.id}`}>{p.displayName ?? p.name}</Link>
                      {p.displayName !== null && p.displayName !== p.name && (
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{p.name}</div>
                      )}
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p.sku ?? "—"}</td>
                    <td>{p.category?.name ?? "—"}</td>
                    <td>{p.material?.name ?? "—"}</td>
                    <td>{UNIT_LABELS[p.pricingMethod] ?? p.pricingMethod}</td>
                    <td className="num">{p._count.sizes}</td>
                    <td className="num">{p._count.quantityTiers}</td>
                    <td>
                      <div className="chips">
                        {p.tags.map(({ tag }) => (
                          <span
                            key={tag.id}
                            className="chip"
                            style={tag.color === null ? undefined : { borderColor: tag.color, color: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Badge
                        kind={
                          p.lifecycleStatus === "ACTIVE"
                            ? "good"
                            : p.lifecycleStatus === "DRAFT"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {LIFECYCLE_LABELS[p.lifecycleStatus] ?? p.lifecycleStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
