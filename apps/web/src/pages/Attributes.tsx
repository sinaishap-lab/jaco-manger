import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Badge, Card, Empty, ErrorBox, Loading, PageHead } from "../components/common.js";
import { ATTR_GROUP_LABELS } from "../lib/format.js";

interface DefinitionDto {
  id: string;
  key: string;
  label: string;
  attributeGroup: string;
  dataType: string;
  unit: string | null;
  enumOptions: string[];
  appliesTo: string;
  isRequired: boolean;
  isCustomerVisible: boolean;
  sortOrder: number;
  description: string | null;
}

const TARGET_LABELS: Record<string, string> = {
  PRODUCT: "מוצר",
  MATERIAL: "חומר",
  SUPPLIER: "ספק",
};

const TYPE_LABELS: Record<string, string> = {
  TEXT: "טקסט",
  LONG_TEXT: "טקסט ארוך",
  NUMBER: "מספר",
  BOOLEAN: "כן / לא",
  ENUM: "בחירה מרשימה",
  DATE: "תאריך",
};

/**
 * §77 — the attribute dictionary.
 *
 * This screen is what makes §72.25 and §73 true in practice: a new material type
 * with a different specification is added here as data, not as a column and a
 * migration. A number is stored in a numeric column, so specs stay filterable.
 */
export function Attributes() {
  const defs = useQuery({
    queryKey: ["attribute-definitions"],
    queryFn: () => api.get<DefinitionDto[]>("/attribute-definitions"),
  });

  const grouped = new Map<string, DefinitionDto[]>();
  for (const d of defs.data ?? []) {
    const list = grouped.get(d.appliesTo) ?? [];
    list.push(d);
    grouped.set(d.appliesTo, list);
  }

  return (
    <>
      <PageHead title="מילון תכונות" spec="§77" />
      <div className="notice">
        המפרט הטכני שונה בין סוגי חומרים — עובי ללוקובונד, גרם למ"ר לנייר, סוג דבק למדבקות.
        התכונות מוגדרות כאן כנתונים, ולכן הוספת סוג חומר חדש אינה דורשת שינוי קוד (§72.25, §73).
      </div>
      <ErrorBox error={defs.error} />
      {defs.isLoading && <Card><Loading /></Card>}

      {defs.data !== undefined &&
        (defs.data.length === 0 ? (
          <Card><Empty>לא הוגדרו תכונות.</Empty></Card>
        ) : (
          [...grouped.entries()].map(([target, items]) => (
            <Card key={target} title={`תכונות של ${TARGET_LABELS[target] ?? target}`}>
              <table>
                <thead>
                  <tr>
                    <th>תווית</th>
                    <th>מפתח</th>
                    <th>קבוצה</th>
                    <th>סוג</th>
                    <th>יחידה</th>
                    <th>אפשרויות</th>
                    <th>גלוי ללקוח</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.label}
                        {d.isRequired && <> <Badge kind="warn">חובה</Badge></>}
                      </td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{d.key}</td>
                      <td>{ATTR_GROUP_LABELS[d.attributeGroup] ?? d.attributeGroup}</td>
                      <td>{TYPE_LABELS[d.dataType] ?? d.dataType}</td>
                      <td>{d.unit ?? "—"}</td>
                      <td>
                        {d.enumOptions.length === 0 ? (
                          "—"
                        ) : (
                          <div className="chips">
                            {d.enumOptions.map((o) => <span key={o} className="chip">{o}</span>)}
                          </div>
                        )}
                      </td>
                      <td>
                        {d.isCustomerVisible ? (
                          <Badge kind="good">גלוי</Badge>
                        ) : (
                          <Badge kind="neutral">פנימי</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))
        ))}
    </>
  );
}
