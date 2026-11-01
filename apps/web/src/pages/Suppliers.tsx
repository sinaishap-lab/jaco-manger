import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getRole, type SupplierDto } from "../lib/api.js";
import { AdminOnly, Badge, Card, Empty, ErrorBox, Loading, PageHead } from "../components/common.js";
import { SHIPPING_LABELS, money } from "../lib/format.js";

/** §9, §80 — the supplier list. */
export function Suppliers() {
  const role = getRole();
  const suppliers = useQuery({
    queryKey: ["suppliers", "all"],
    queryFn: () => api.get<SupplierDto[]>("/suppliers?all=true"),
    enabled: role === "ADMIN",
  });

  if (role !== "ADMIN") {
    return (
      <>
        <PageHead title="ספקים" spec="§9 · §80" />
        <AdminOnly what="ניהול ספקים" />
      </>
    );
  }

  return (
    <>
      <PageHead title="ספקים" spec="§9 · §80" />
      <ErrorBox error={suppliers.error} />
      {suppliers.isLoading && <Card><Loading /></Card>}

      {suppliers.data !== undefined &&
        (suppliers.data.length === 0 ? (
          <Card><Empty>לא הוגדרו ספקים.</Empty></Card>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ספק</th>
                  <th>איש קשר</th>
                  <th>תנאי תשלום</th>
                  <th className="num">הובלה</th>
                  <th>שיטת הובלה</th>
                  <th className="num">מינימום</th>
                  <th className="num">אספקה</th>
                  <th>דירוג</th>
                  <th className="num">מחירים</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.data.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/suppliers/${s.id}`}>{s.name}</Link>
                      {s.isPreferred && <> <Badge kind="good">מועדף</Badge></>}
                      {!s.active && <> <Badge kind="neutral">לא פעיל</Badge></>}
                    </td>
                    <td>
                      {s.contacts.find((c) => c.isPrimary)?.name ?? s.contactName ?? "—"}
                      {s.contacts.length > 1 && (
                        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
                          {" "}+{s.contacts.length - 1}
                        </span>
                      )}
                    </td>
                    <td>{s.paymentTerms ?? "—"}</td>
                    <td className="num">{money(s.deliveryCost)}</td>
                    <td>
                      {SHIPPING_LABELS[s.shippingType] ?? s.shippingType}
                      {s.freeShippingThreshold !== null && (
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          חינם מעל {money(s.freeShippingThreshold, 0)}
                        </div>
                      )}
                    </td>
                    <td className="num">{money(s.minimumOrderValue)}</td>
                    <td className="num">{s.leadTimeDays === null ? "—" : `${s.leadTimeDays} ימים`}</td>
                    <td>{s.qualityRating === null ? "—" : "★".repeat(s.qualityRating)}</td>
                    <td className="num">{s._count?.materialPrices ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
