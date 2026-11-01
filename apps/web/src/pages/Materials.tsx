import { useQuery } from "@tanstack/react-query";
import { api, type MaterialDto } from "../lib/api.js";
import { Badge, Card, Empty, ErrorBox, Loading, PageHead } from "../components/common.js";
import { UNIT_LABELS, num } from "../lib/format.js";

/** §10 — materials. No purchase price is stored here; prices live per supplier (§2, §12). */
export function Materials() {
  const materials = useQuery({
    queryKey: ["materials", "all"],
    queryFn: () => api.get<MaterialDto[]>("/materials?all=true"),
  });

  return (
    <>
      <PageHead title="חומרים" spec="§10 · §11" />
      <div className="notice">
        מחיר רכש אינו נשמר על החומר. אותו חומר יכול להירכש מכמה ספקים במחירים שונים, ולכן
        המחירים נשמרים לפי ספק (§2, §10, §12).
      </div>
      <ErrorBox error={materials.error} />
      {materials.isLoading && <Card><Loading /></Card>}

      {materials.data !== undefined &&
        (materials.data.length === 0 ? (
          <Card><Empty>לא הוגדרו חומרים.</Empty></Card>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>חומר</th>
                  <th>מק"ט</th>
                  <th>סוג</th>
                  <th>יחידת תמחור</th>
                  <th className="num">עובי</th>
                  <th>גימור</th>
                  <th>צבע</th>
                  <th className="num">לוח</th>
                  <th className="num">משקל למ"ר</th>
                  <th>מאפיינים</th>
                  <th>ספק ברירת מחדל</th>
                  <th className="num">מחירים</th>
                </tr>
              </thead>
              <tbody>
                {materials.data.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name}
                      {!m.active && <> <Badge kind="neutral">לא פעיל</Badge></>}
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{m.sku ?? "—"}</td>
                    <td>{m.materialType ?? "—"}</td>
                    <td>{UNIT_LABELS[m.pricingUnit] ?? m.pricingUnit}</td>
                    <td className="num">{m.thicknessMm === null ? "—" : `${num(m.thicknessMm, 2)} מ"מ`}</td>
                    <td>{m.finish ?? "—"}</td>
                    <td>{m.color ?? "—"}</td>
                    <td className="num">
                      {m.sheetWidthCm === null || m.sheetHeightCm === null
                        ? "—"
                        : `${num(m.sheetWidthCm, 0)}×${num(m.sheetHeightCm, 0)}`}
                    </td>
                    <td className="num">{m.weightKgPerSqm === null ? "—" : num(m.weightKgPerSqm, 2)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {m.isPrintable && <Badge kind="neutral">מודפס</Badge>}
                        {m.isOutdoorRated && <Badge kind="good">חוץ</Badge>}
                      </div>
                    </td>
                    <td>{m.defaultSupplier?.name ?? "—"}</td>
                    <td className="num">{m._count?.prices ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
