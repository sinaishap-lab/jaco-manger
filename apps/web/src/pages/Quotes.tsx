import { useQuery } from "@tanstack/react-query";
import { api, getRole, type QuoteRowDto } from "../lib/api.js";
import { Badge, Card, Empty, ErrorBox, Loading, PageHead } from "../components/common.js";
import { dateTime, isNegative, money, pct } from "../lib/format.js";

/**
 * §53, §54 — saved quotes and the calculation history.
 *
 * Each row is served from its stored snapshot, not recalculated, so a quote given
 * to a customer keeps its figures after a supplier raises prices (§18).
 */
export function Quotes() {
  const role = getRole();
  const quotes = useQuery({
    queryKey: ["quotes"],
    queryFn: () => api.get<QuoteRowDto[]>("/quotes?limit=200"),
  });

  return (
    <>
      <PageHead title="הצעות מחיר והיסטוריית חישובים" spec="§53 · §54">
        {quotes.data !== undefined && <Badge kind="neutral">{quotes.data.length} רשומות</Badge>}
      </PageHead>

      <div className="notice">
        כל הצעה נשמרת עם Snapshot מלא: הקלט, מחירי הספק שהיו בתוקף, הנוסחאות והתוצאה.
        שינוי עתידי במסד הנתונים אינו משנה הצעה שנשמרה (§18, §54).
      </div>

      <ErrorBox error={quotes.error} />
      {quotes.isLoading && <Card><Loading /></Card>}

      {quotes.data !== undefined &&
        (quotes.data.length === 0 ? (
          <Card><Empty>לא נשמרו הצעות מחיר.</Empty></Card>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>מוצר</th>
                  <th>גודל</th>
                  <th className="num">כמות</th>
                  {role === "ADMIN" && <th>ספק</th>}
                  <th className="num">מחיר יחידה</th>
                  <th className="num">סה"כ כולל מע"מ</th>
                  <th className="num">לפני מע"מ</th>
                  {role === "ADMIN" && (
                    <>
                      <th className="num">עלות</th>
                      <th className="num">תרומה</th>
                      <th className="num">אחוז</th>
                    </>
                  )}
                  <th>מנוע</th>
                </tr>
              </thead>
              <tbody>
                {quotes.data.map((q) => (
                  <tr key={q.id}>
                    <td>{dateTime(q.quotedAt)}</td>
                    <td>{q.productName}</td>
                    <td>{q.productSizeName ?? "—"}</td>
                    <td className="num">{q.quantity}</td>
                    {role === "ADMIN" && <td>{q.supplierName ?? "—"}</td>}
                    <td className="num">{money(q.unitPriceInclVat)}</td>
                    <td className="num">{money(q.totalPriceInclVat)}</td>
                    <td className="num">{money(q.totalPriceExVat)}</td>
                    {role === "ADMIN" && (
                      <>
                        <td className="num">{money(q.totalCost)}</td>
                        <td className={`num ${isNegative(q.contribution) ? "neg" : "pos"}`}>
                          {money(q.contribution)}
                        </td>
                        <td className={`num ${isNegative(q.contributionMargin) ? "neg" : "pos"}`}>
                          {pct(q.contributionMargin)}
                        </td>
                      </>
                    )}
                    <td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{q.engineVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
