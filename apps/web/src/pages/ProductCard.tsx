import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  api, getRole,
  type AttributeValueDto, type ProductDetailDto, type QuoteResultDto, type SizeDto,
} from "../lib/api.js";
import { Badge, Card, Empty, ErrorBox, Line, Loading, PageHead, Warnings } from "../components/common.js";
import {
  ATTR_GROUP_LABELS, LABOR_LABELS, LIFECYCLE_LABELS, MEDIA_KIND_LABELS, SCOPE_LABELS, UNIT_LABELS,
  date, isNegative, money, num, pct, tierLabel,
} from "../lib/format.js";

type Tab = "technical" | "financial" | "marketing" | "media" | "suppliers" | "channels";

const TABS: Array<[Tab, string]> = [
  ["technical", "טכני"],
  ["financial", "כספי"],
  ["marketing", "שיווקי"],
  ["media", "מדיה"],
  ["suppliers", "ספקים"],
  ["channels", "ערוצים"],
];

/**
 * §79 — the product card.
 *
 * One place to open a product: technical specification, financial data, marketing
 * copy, media and supplier links. The financial tab's live figures are not stored
 * fields; they are fetched from the engine per size and tier, so the card and the
 * calculator can never disagree (§58).
 */
export function ProductCard() {
  const { id = "" } = useParams();
  const role = getRole();
  const [tab, setTab] = useState<Tab>("technical");

  const product = useQuery({
    queryKey: ["product", id],
    queryFn: () => api.get<ProductDetailDto>(`/products/${id}`),
    enabled: id !== "",
  });

  const sizes = useQuery({
    queryKey: ["sizes", id],
    queryFn: () => api.get<SizeDto[]>(`/products/${id}/sizes`),
    enabled: id !== "",
  });

  if (product.isLoading) return <Card><Loading /></Card>;
  if (product.error !== null) return <ErrorBox error={product.error} />;
  const p = product.data;
  if (p === undefined) return <Empty>המוצר לא נמצא.</Empty>;

  const byGroup = (group: string): AttributeValueDto[] =>
    p.attributes.filter((a) => a.group === group);

  const renderValue = (a: AttributeValueDto) => {
    if (a.value === null) return "—";
    if (a.dataType === "BOOLEAN") return a.value === true ? "כן" : "לא";
    if (a.dataType === "NUMBER") return `${num(String(a.value))}${a.unit === null ? "" : ` ${a.unit}`}`;
    if (a.dataType === "DATE") return date(String(a.value));
    return String(a.value);
  };

  const AttrList = ({ groups }: { groups: string[] }) => {
    const items = groups.flatMap(byGroup);
    if (items.length === 0) return null;
    return (
      <dl className="specs">
        {items.map((a) => (
          <div key={a.key} style={{ display: "contents" }}>
            <dt>
              {a.label}
              {!a.isCustomerVisible && (
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}> (פנימי)</span>
              )}
            </dt>
            <dd>{renderValue(a)}</dd>
          </div>
        ))}
      </dl>
    );
  };

  return (
    <>
      <PageHead title={p.displayName ?? p.name} spec="§79">
        <Badge
          kind={p.lifecycleStatus === "ACTIVE" ? "good" : p.lifecycleStatus === "DRAFT" ? "warn" : "neutral"}
        >
          {LIFECYCLE_LABELS[p.lifecycleStatus] ?? p.lifecycleStatus}
        </Badge>
        {p.sku !== null && <Badge kind="neutral">{p.sku}</Badge>}
        <Link to="/products" className="ghost" style={{ padding: "6px 12px", textDecoration: "none" }}>
          חזרה לקטלוג
        </Link>
      </PageHead>

      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ───────────────── technical ───────────────── */}
      {tab === "technical" && (
        <div className="grid cols-2">
          <Card title="זהות" spec="§79">
            <dl className="specs">
              <dt>שם פנימי</dt><dd>{p.name}</dd>
              <dt>שם שיווקי</dt><dd>{p.displayName ?? "—"}</dd>
              <dt>מק"ט</dt><dd style={{ fontFamily: "var(--mono)" }}>{p.sku ?? "—"}</dd>
              <dt>קטגוריה</dt><dd>{p.category?.name ?? "—"}</dd>
              <dt>חומר</dt><dd>{p.material?.name ?? "—"}</dd>
              <dt>שיטת תמחור</dt><dd>{UNIT_LABELS[p.pricingMethod] ?? p.pricingMethod}</dd>
              <dt>הושק</dt><dd>{date(p.launchedAt)}</dd>
            </dl>
          </Card>

          <Card title="מפרט ומידות" spec="§77 · §79">
            <dl className="specs">
              <dt>רוחב</dt>
              <dd>
                {p.minWidthCm === null && p.maxWidthCm === null
                  ? "—"
                  : `${num(p.minWidthCm, 1)} – ${num(p.maxWidthCm, 1)} ס"מ`}
              </dd>
              <dt>גובה</dt>
              <dd>
                {p.minHeightCm === null && p.maxHeightCm === null
                  ? "—"
                  : `${num(p.minHeightCm, 1)} – ${num(p.maxHeightCm, 1)} ס"מ`}
              </dd>
              <dt>מתאים לחוץ</dt><dd>{p.isOutdoor ? "כן" : "לא"}</dd>
              <dt>אחריות</dt><dd>{p.warrantyMonths === null ? "—" : `${p.warrantyMonths} חודשים`}</dd>
              <dt>זמן אספקה</dt><dd>{p.leadTimeDays === null ? "—" : `${p.leadTimeDays} ימי עסקים`}</dd>
            </dl>
            <div style={{ marginTop: 12 }}>
              <AttrList groups={["TECHNICAL", "PRINT", "FINISHING", "LOGISTICS"]} />
            </div>
          </Card>

          <Card title="הפקה" spec="§79">
            <dl className="specs">
              <dt>דרישות קובץ</dt><dd>{p.fileRequirements ?? "—"}</dd>
              <dt>הערות הפקה</dt><dd>{p.productionNotes ?? "—"}</dd>
              <dt>הוראות טיפול</dt><dd>{p.careInstructions ?? "—"}</dd>
            </dl>
          </Card>

          <Card title="גדלים" spec="§21 · §28">
            {sizes.data === undefined || sizes.data.length === 0 ? (
              <Empty>לא הוגדרו גדלים.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>גודל</th>
                    <th className="num">רוחב</th>
                    <th className="num">גובה</th>
                    <th className="num">מ"ר</th>
                  </tr>
                </thead>
                <tbody>
                  {sizes.data.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="num">{num(s.widthCm, 1)}</td>
                      <td className="num">{num(s.heightCm, 1)}</td>
                      <td className="num">{num(s.areaSqm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="hint" style={{ marginTop: 8 }}>
              השטח מחושב מהמידות ואינו נשמר, כדי שלא יוכל לסטות מהן (§22).
            </div>
          </Card>
        </div>
      )}

      {/* ───────────────── financial ───────────────── */}
      {tab === "financial" && (
        role !== "ADMIN" ? (
          <div className="notice">
            הנתונים הכספיים זמינים להרשאת ADMIN בלבד (§57).
          </div>
        ) : (
          <>
            <div className="grid cols-2">
              <Card title="הנהלת חשבונות" spec="§79">
                <dl className="specs">
                  <dt>קוד הנהח"ש</dt><dd>{p.accountingCode ?? "—"}</dd>
                  <dt>מרכז עלות</dt><dd>{p.costCenter ?? "—"}</dd>
                  <dt>סיווג מע"מ</dt><dd>{p.vatCategory ?? "—"}</dd>
                  <dt>יעד תרומה</dt>
                  <dd>
                    {p.targetMargin === null || p.targetMargin === undefined
                      ? "כהגדרת העסק"
                      : pct(String(Number(p.targetMargin) * 100))}
                  </dd>
                  <dt>מינימום הזמנה</dt>
                  <dd>{p.minimumOrder === null ? "כהגדרת העסק" : money(p.minimumOrder)}</dd>
                </dl>
              </Card>

              <Card title="מנהלי עלות" spec="§31 · §35 · §36 · §8">
                <dl className="specs">
                  <dt>setup להזמנה</dt><dd>{money(p.setupFee)}</dd>
                  <dt>טיפול ליחידה</dt><dd>{money(p.handlingCostPerUnit)}</dd>
                  <dt>הדפסה למ"ר</dt><dd>{money(p.printingCostPerSqm)}</dd>
                  <dt>חיתוך ליחידה</dt><dd>{money(p.cuttingCostPerUnit)}</dd>
                  <dt>שעות חיתוך ליחידה</dt><dd>{num(p.cuttingHoursPerUnit)}</dd>
                  <dt>שיטת עבודה</dt><dd>{LABOR_LABELS[p.laborMethod] ?? p.laborMethod}</dd>
                  <dt>שעות עבודה ליחידה</dt><dd>{num(p.laborHoursPerUnit)}</dd>
                  <dt>עלות עבודה קבועה</dt><dd>{money(p.laborFixedCost)}</dd>
                </dl>
                <div className="hint" style={{ marginTop: 10 }}>
                  ה-setup והטיפול הם מה שמייצר את הפרמיה לגדלים קטנים — לא מקדם שרירותי (§31).
                </div>
              </Card>
            </div>

            {p.additionalCosts !== undefined && p.additionalCosts.length > 0 && (
              <Card title="עלויות נוספות" spec="§37">
                <table>
                  <thead>
                    <tr><th>עלות</th><th>היקף</th><th className="num">סכום</th><th>פעיל</th></tr>
                  </thead>
                  <tbody>
                    {p.additionalCosts.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{SCOPE_LABELS[c.scope] ?? c.scope}</td>
                        <td className="num">{money(c.amount)}</td>
                        <td>{c.active ? <Badge kind="good">פעיל</Badge> : <Badge kind="neutral">כבוי</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {/* Live figures from the engine, not stored fields (§58). */}
            <ProfitabilityByQuantity productId={p.id} sizes={sizes.data ?? []} />
          </>
        )
      )}

      {/* ───────────────── marketing ───────────────── */}
      {tab === "marketing" && (
        <div className="grid cols-2">
          <Card title="תיאורים" spec="§79">
            <dl className="specs">
              <dt>שם שיווקי</dt><dd>{p.displayName ?? "—"}</dd>
              <dt>תיאור קצר</dt><dd>{p.shortDescription ?? "—"}</dd>
            </dl>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>תיאור מלא</div>
              <div style={{ fontSize: 13 }}>{p.longDescription ?? "—"}</div>
            </div>
          </Card>

          <Card title="נקודות מכירה ושימושים" spec="§79">
            {p.sellingPoints.length === 0 ? (
              <Empty>לא הוגדרו נקודות מכירה.</Empty>
            ) : (
              <ul className="points">
                {p.sellingPoints.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>מקרי שימוש</div>
              <div style={{ fontSize: 13 }}>{p.useCases ?? "—"}</div>
            </div>
          </Card>

          <Card title="SEO" spec="§79 · §81">
            <dl className="specs">
              <dt>Slug</dt><dd style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p.seoSlug ?? "—"}</dd>
              <dt>כותרת</dt><dd>{p.seoTitle ?? "—"}</dd>
              <dt>תיאור</dt><dd>{p.seoDescription ?? "—"}</dd>
            </dl>
            <div className="hint" style={{ marginTop: 10 }}>
              השדות האלה מיועדים לסנכרון לאתר ולקופה. רק מידע המסומן גלוי ללקוח יישלח (§81).
            </div>
          </Card>

          <Card title="תגיות ותכונות שיווקיות" spec="§77 · §79">
            <div className="chips" style={{ marginBottom: 12 }}>
              {p.tags.length === 0 ? <span style={{ color: "var(--text-faint)" }}>אין תגיות</span> :
                p.tags.map(({ tag }) => (
                  <span key={tag.id} className="chip"
                    style={tag.color === null ? undefined : { borderColor: tag.color, color: tag.color }}>
                    {tag.name}
                  </span>
                ))}
            </div>
            <AttrList groups={["MARKETING"]} />
          </Card>
        </div>
      )}

      {/* ───────────────── media ───────────────── */}
      {tab === "media" && (
        <Card title="תמונות וקבצים" spec="§78">
          {p.media.length === 0 ? (
            <Empty>לא הועלו קבצים.</Empty>
          ) : (
            <>
              <div className="gallery">
                {p.media
                  .filter((m) => m.mimeType.startsWith("image/"))
                  .map((m) => (
                    <figure key={m.id}>
                      <img src={`/uploads/${m.filePath}`} alt={m.altText ?? m.originalFilename} />
                      <figcaption>
                        {m.isPrimary && <Badge kind="good">ראשית</Badge>} {m.title ?? m.originalFilename}
                      </figcaption>
                    </figure>
                  ))}
              </div>
              <table style={{ marginTop: 14 }}>
                <thead>
                  <tr><th>קובץ</th><th>סוג</th><th className="num">גודל</th><th>גלוי ללקוח</th></tr>
                </thead>
                <tbody>
                  {p.media.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <a href={`/uploads/${m.filePath}`} target="_blank" rel="noreferrer">
                          {m.originalFilename}
                        </a>
                      </td>
                      <td>{MEDIA_KIND_LABELS[m.kind] ?? m.kind}</td>
                      <td className="num">{Math.round(m.sizeBytes / 1024)} KB</td>
                      <td>{m.isCustomerVisible ? "כן" : "לא"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      )}

      {/* ───────────────── suppliers ───────────────── */}
      {tab === "suppliers" && (
        role !== "ADMIN" ? (
          <div className="notice">מידע ספקים זמין להרשאת ADMIN בלבד (§57).</div>
        ) : (
          <Card title="ספקים לחומר" spec="§80">
            {p.material === null ? (
              <Empty>למוצר לא מקושר חומר.</Empty>
            ) : (
              <>
                <dl className="specs" style={{ marginBottom: 14 }}>
                  <dt>חומר</dt>
                  <dd>
                    <Link to="/materials">{p.material.name}</Link> ·{" "}
                    {UNIT_LABELS[p.material.pricingUnit] ?? p.material.pricingUnit}
                  </dd>
                </dl>
                {(p.material as unknown as { catalogEntries?: Array<{
                  supplierSku: string | null; supplierProductName: string | null;
                  supplier: { id: string; name: string };
                }> }).catalogEntries === undefined ? (
                  <Empty>אין רשומות קטלוג ספק.</Empty>
                ) : (
                  <table>
                    <thead>
                      <tr><th>ספק</th><th>מק"ט ספק</th><th>שם אצל הספק</th></tr>
                    </thead>
                    <tbody>
                      {(p.material as unknown as { catalogEntries: Array<{
                        supplierSku: string | null; supplierProductName: string | null;
                        supplier: { id: string; name: string };
                      }> }).catalogEntries.map((c) => (
                        <tr key={c.supplier.id}>
                          <td><Link to={`/suppliers/${c.supplier.id}`}>{c.supplier.name}</Link></td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{c.supplierSku ?? "—"}</td>
                          <td>{c.supplierProductName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 12 }}>
                  <Link to="/compare" className="ghost" style={{ padding: "6px 12px", textDecoration: "none" }}>
                    השוואת ספקים לחומר הזה (§46)
                  </Link>
                </div>
              </>
            )}
          </Card>
        )
      )}

      {/* ───────────────── channels ───────────────── */}
      {tab === "channels" && (
        <Card title="ערוצי מכירה" spec="§81">
          <div className="notice">
            המערכת היא מקור האמת. הערוץ הוא יעד בלבד, ולא נקרא ממנו מידע שידרוס את המערכת.
            רק שדות המסומנים גלויים ללקוח נשלחים. בשלב הזה קיימים המודל והתור, אך לא חובר
            ערוץ אמיתי — טרם הוגדרו אתר או קופה.
          </div>
          {p.publications.length === 0 ? (
            <Empty>המוצר לא פורסם לאף ערוץ.</Empty>
          ) : (
            <table>
              <thead>
                <tr><th>ערוץ</th><th>סוג</th><th>מצב</th><th>מזהה חיצוני</th><th>סונכרן</th></tr>
              </thead>
              <tbody>
                {p.publications.map((pub) => (
                  <tr key={pub.id}>
                    <td>{pub.channel.name}</td>
                    <td>{pub.channel.channelType}</td>
                    <td><Badge kind={pub.status === "PUBLISHED" ? "good" : "neutral"}>{pub.status}</Badge></td>
                    <td>{pub.externalId ?? "—"}</td>
                    <td>{date(pub.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}

/**
 * §41, §42, §53 — contribution at each tier, straight from the engine.
 *
 * This is the question the shop actually needs answered: at which quantity does
 * this size start making money? The figures are fetched, never recomputed here.
 */
function ProfitabilityByQuantity({ productId, sizes }: { productId: string; sizes: SizeDto[] }) {
  const [sizeId, setSizeId] = useState(sizes[0]?.id ?? "");
  const quantities = [1, 5, 10, 25, 50, 100, 200, 301];

  const effectiveSizeId = sizeId === "" ? (sizes[0]?.id ?? "") : sizeId;

  const results = useQuery({
    queryKey: ["profitability", productId, effectiveSizeId],
    queryFn: async () => {
      const calls = quantities.map((quantity) =>
        api.post<QuoteResultDto>("/calculate", {
          productId,
          productSizeId: effectiveSizeId === "" ? null : effectiveSizeId,
          quantity,
        }),
      );
      return Promise.all(calls);
    },
    enabled: productId !== "",
  });

  return (
    <Card title="רווחיות לפי כמות" spec="§41 · §42 · §58">
      {sizes.length > 0 && (
        <div className="field" style={{ maxWidth: 220 }}>
          <label>גודל</label>
          <select value={effectiveSizeId} onChange={(e) => setSizeId(e.target.value)}>
            {sizes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <ErrorBox error={results.error} />
      {results.isLoading && <Loading />}

      {results.data !== undefined && (
        <>
          <table>
            <thead>
              <tr>
                <th className="num">כמות</th>
                <th>מדרגה</th>
                <th className="num">מחיר יחידה</th>
                <th className="num">סה"כ כולל מע"מ</th>
                <th className="num">סה"כ עלות</th>
                <th className="num">תרומה</th>
                <th className="num">אחוז</th>
              </tr>
            </thead>
            <tbody>
              {results.data.map((r, i) => (
                <tr key={quantities[i]}>
                  <td className="num">{quantities[i]}</td>
                  <td>{r.tier === null ? "—" : tierLabel(r.tier.minQuantity, r.tier.maxQuantity)}</td>
                  <td className="num">{money(r.unitPriceInclVat)}</td>
                  <td className="num">{money(r.totalPriceInclVat)}</td>
                  <td className="num">{money(r.totalCost)}</td>
                  <td className={`num ${isNegative(r.contribution) ? "neg" : "pos"}`}>
                    {money(r.contribution)}
                  </td>
                  <td className={`num ${isNegative(r.contributionMargin) ? "neg" : "pos"}`}>
                    {pct(r.contributionMargin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Point out the break-even, since that is the decision this table informs. */}
          {(() => {
            const firstPositive = results.data.findIndex((r) => !isNegative(r.contribution ?? "0"));
            if (firstPositive === -1) {
              return (
                <div className="notice" style={{ marginTop: 12, background: "var(--bad-soft)", borderColor: "#f3c6c2", color: "#8a1c13" }}>
                  הגודל הזה אינו רווחי באף אחת מהכמויות שנבדקו, לפי המחירון הנוכחי והעלויות שהוזנו.
                </div>
              );
            }
            if (firstPositive === 0) return null;
            return (
              <div className="notice" style={{ marginTop: 12 }}>
                ההזמנה מתחילה להיות רווחית סביב {quantities[firstPositive]} יחידות. מתחת לזה
                העלויות הקבועות — setup והכנת קובץ — גדולות מהמחיר שבמחירון.
              </div>
            );
          })()}

          <Warnings items={results.data[0]?.warnings ?? []} />
        </>
      )}
    </Card>
  );
}
