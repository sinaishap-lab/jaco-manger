import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getRole, type SupplierDto } from "../lib/api.js";
import { AdminOnly, Badge, Card, Empty, ErrorBox, Loading, PageHead } from "../components/common.js";
import { CONTACT_ROLE_LABELS, SHIPPING_LABELS, UNIT_LABELS, money, num } from "../lib/format.js";

/** §80 — the extended supplier card: contacts, catalog, terms and logistics. */
export function SupplierCard() {
  const { id = "" } = useParams();
  const role = getRole();

  const supplier = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => api.get<SupplierDto>(`/suppliers/${id}`),
    enabled: role === "ADMIN" && id !== "",
  });

  if (role !== "ADMIN") {
    return (
      <>
        <PageHead title="כרטיס ספק" spec="§80" />
        <AdminOnly what="כרטיס הספק" />
      </>
    );
  }

  if (supplier.isLoading) return <Card><Loading /></Card>;
  if (supplier.error !== null) return <ErrorBox error={supplier.error} />;
  const s = supplier.data;
  if (s === undefined) return <Empty>הספק לא נמצא.</Empty>;

  return (
    <>
      <PageHead title={s.name} spec="§80">
        {s.isPreferred && <Badge kind="good">מועדף</Badge>}
        {s.qualityRating !== null && <Badge kind="neutral">{"★".repeat(s.qualityRating)}</Badge>}
        <Link to="/suppliers" className="ghost" style={{ padding: "6px 12px", textDecoration: "none" }}>
          חזרה לספקים
        </Link>
      </PageHead>

      <div className="grid cols-2">
        <Card title="פרטים" spec="§9">
          <dl className="specs">
            <dt>טלפון</dt><dd>{s.phone ?? "—"}</dd>
            <dt>דוא"ל</dt><dd>{s.email ?? "—"}</dd>
            <dt>אתר</dt>
            <dd>
              {s.website === null ? "—" : (
                <a href={s.website} target="_blank" rel="noreferrer">{s.website}</a>
              )}
            </dd>
            <dt>עוסק / ח.פ.</dt><dd>{s.taxId ?? "—"}</dd>
            <dt>תנאי תשלום</dt><dd>{s.paymentTerms ?? "—"}</dd>
            <dt>מסגרת אשראי</dt><dd>{s.creditLimit === null ? "—" : money(s.creditLimit)}</dd>
            <dt>תקנים</dt><dd>{s.certifications ?? "—"}</dd>
          </dl>
        </Card>

        <Card title="לוגיסטיקה והובלה" spec="§16 · §80">
          <dl className="specs">
            <dt>שיטת הובלה</dt><dd>{SHIPPING_LABELS[s.shippingType] ?? s.shippingType}</dd>
            <dt>עלות הובלה</dt><dd>{money(s.deliveryCost)}</dd>
            <dt>הובלה חינם מעל</dt>
            <dd>{s.freeShippingThreshold === null ? "—" : money(s.freeShippingThreshold)}</dd>
            <dt>מינימום הזמנה</dt><dd>{money(s.minimumOrderValue)}</dd>
            <dt>זמן אספקה</dt><dd>{s.leadTimeDays === null ? "—" : `${s.leadTimeDays} ימי עסקים`}</dd>
            <dt>כתובת מחסן</dt><dd>{s.addressWarehouse ?? "—"}</dd>
            <dt>כתובת לחיוב</dt><dd>{s.addressBilling ?? "—"}</dd>
          </dl>
        </Card>

        <Card title="אנשי קשר" spec="§80">
          {s.contacts.length === 0 ? (
            <Empty>לא הוגדרו אנשי קשר.</Empty>
          ) : (
            <table>
              <thead>
                <tr><th>שם</th><th>תפקיד</th><th>טלפון</th><th>דוא"ל</th></tr>
              </thead>
              <tbody>
                {s.contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name} {c.isPrimary && <Badge kind="good">ראשי</Badge>}</td>
                    <td>{CONTACT_ROLE_LABELS[c.role] ?? c.role}</td>
                    <td>{c.phone ?? "—"}</td>
                    <td>{c.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="קטלוג הספק" spec="§80">
          {s.catalogEntries === undefined || s.catalogEntries.length === 0 ? (
            <Empty>אין רשומות קטלוג.</Empty>
          ) : (
            <>
              <table>
                <thead>
                  <tr><th>חומר</th><th>מק"ט ספק</th><th>שם אצל הספק</th><th className="num">אריזה</th></tr>
                </thead>
                <tbody>
                  {s.catalogEntries.map((c) => (
                    <tr key={c.id}>
                      <td>{c.material.name}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{c.supplierSku ?? "—"}</td>
                      <td>{c.supplierProductName ?? "—"}</td>
                      <td className="num">
                        {c.packSize === null ? "—" : `${num(c.packSize)} ${c.packUnit ?? UNIT_LABELS[c.material.pricingUnit] ?? ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="hint" style={{ marginTop: 8 }}>
                הקטלוג נפרד ממחירי הרכש, כדי שהמק"ט לא ישוכפל בכל שינוי מחיר (§17, §80).
              </div>
            </>
          )}
        </Card>
      </div>

      {s.notes !== null && (
        <Card title="הערות"><div style={{ fontSize: 13 }}>{s.notes}</div></Card>
      )}
    </>
  );
}
