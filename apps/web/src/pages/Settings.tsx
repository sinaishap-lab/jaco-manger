import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getRole, type SettingsDto } from "../lib/api.js";
import { Card, ErrorBox, Field, Line, Loading, PageHead } from "../components/common.js";
import { money, num, pct } from "../lib/format.js";

/**
 * §4, §5, §6, §70 — business settings.
 *
 * Every value the engine uses is here. None of 18, 59%, 45, 59, 63 or 227 exists as
 * a literal in engine logic — they are seed defaults, editable at any time (§64).
 * The labor ratio is shown derived from turnover and wages, exactly as §6 asks.
 */
export function Settings() {
  const role = getRole();
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/settings"),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (settings.data !== undefined && Object.keys(form).length === 0) {
      const s = settings.data;
      setForm({
        businessName: s.businessName,
        vatRate: s.vatRate,
        averageSalesInclVat: s.averageSalesInclVat,
        averageWages: s.averageWages,
        employeeHourlyWage: s.employeeHourlyWage,
        employerMultiplier: s.employerMultiplier,
        laborRatioOverride: s.laborRatioOverride ?? "",
        minOrderInclVat: s.minOrderInclVat,
        targetContributionMargin: s.targetContributionMargin,
        targetSqmPriceInclVat: s.targetSqmPriceInclVat,
        defaultMaterialCostPerSqm: s.defaultMaterialCostPerSqm,
        defaultPurchaseLotQuantity: s.defaultPurchaseLotQuantity,
        displayRounding: String(s.displayRounding),
      });
    }
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: () =>
      api.put("/settings", {
        businessName: form.businessName,
        vatRate: form.vatRate,
        averageSalesInclVat: form.averageSalesInclVat,
        averageWages: form.averageWages,
        employeeHourlyWage: form.employeeHourlyWage,
        employerMultiplier: form.employerMultiplier,
        laborRatioOverride: form.laborRatioOverride === "" ? null : form.laborRatioOverride,
        minOrderInclVat: form.minOrderInclVat,
        targetContributionMargin: form.targetContributionMargin,
        targetSqmPriceInclVat: form.targetSqmPriceInclVat,
        defaultMaterialCostPerSqm: form.defaultMaterialCostPerSqm,
        defaultPurchaseLotQuantity: form.defaultPurchaseLotQuantity,
        displayRounding: Number(form.displayRounding),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });

  if (settings.isLoading) return <Card><Loading /></Card>;
  const s = settings.data;
  if (s === undefined) return <ErrorBox error={settings.error} />;

  const input = (key: string, label: string, hint?: string, step = "any") => (
    <Field label={label} hint={hint}>
      <input
        type={step === "text" ? "text" : "number"}
        step={step === "text" ? undefined : step}
        value={form[key] ?? ""}
        disabled={role !== "ADMIN"}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </Field>
  );

  return (
    <>
      <PageHead title="הגדרות עסק" spec="§4 · §5 · §6 · §70" />
      <ErrorBox error={save.error} />

      {role !== "ADMIN" && (
        <div className="notice">שינוי הגדרות מחייב הרשאת ADMIN (§57). הערכים מוצגים לקריאה בלבד.</div>
      )}

      {/* §6 — the derived figures, shown rather than stored. */}
      <Card title="מחושב מההגדרות" spec="§6 · §7">
        <div className="readout">
          <Line
            label="יחס עלות עבודה היסטורי"
            value={<strong>{pct(String(Number(s.derived.laborRatio) * 100))}</strong>}
            variant="headline"
          />
          <Line
            label="מקור"
            value={s.derived.laborRatioSource === "DERIVED" ? "נגזר מהמחזור והשכר" : "הוזן ידנית"}
          />
          <Line label="מחזור לפני מע״מ" value={money(s.derived.averageSalesExVat)} />
          <Line label="מכפיל מע״מ" value={num(s.derived.vatMultiplier)} />
          <Line label="עלות עובד לשעה" value={money(s.derived.employeeCostPerHour)} variant="total" />
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          המחזור שהוזן כולל מע״מ, ולכן הוא מחולק במכפיל לפני חישוב היחס:
          שכר ÷ (מחזור ÷ מכפיל מע״מ). שינוי המחזור או השכר מחשב את היחס מחדש (§6, §64),
          ואינו משנה מחירים קיימים ללא אישור.
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="כללי">
          {input("businessName", "שם העסק", undefined, "text")}
          {input("vatRate", 'שיעור מע״מ (%)', "ברירת המחדל של §5 היא 18")}
          {input("displayRounding", "ספרות עיגול בתצוגה", "חישובי הביניים אינם מעוגלים (§59)", "1")}
        </Card>

        <Card title="נתוני עבודה" spec="§6 · §7">
          {input("averageSalesInclVat", "מחזור ממוצע (כולל מע״מ)")}
          {input("averageWages", "שכר ממוצע")}
          {input("employeeHourlyWage", "שכר עובד לשעה")}
          {input("employerMultiplier", "מקדם עלות מעביד")}
          {input(
            "laborRatioOverride",
            "דריסת יחס עבודה (שבר, למשל 0.59)",
            "ריק = חישוב אוטומטי מהמחזור והשכר",
          )}
        </Card>

        <Card title="כללי תמחור" spec="§25 · §30 · §50">
          {input("minOrderInclVat", "מינימום הזמנה (כולל מע״מ)")}
          {input("targetContributionMargin", "יעד תרומה (שבר, למשל 0.30)")}
          {input("targetSqmPriceInclVat", 'מחיר יעד למ״ר (כולל מע״מ)')}
        </Card>

        <Card title="ברירות מחדל לרכש" spec="§15 · §27">
          {input(
            "defaultMaterialCostPerSqm",
            'עלות חומר ברירת מחדל למ״ר',
            "משמשת רק כשאין ספק עם מחיר תקף. אינה מחיר רכש אמיתי (§27)",
          )}
          {input(
            "defaultPurchaseLotQuantity",
            "כמות רכש לפריסת הובלה",
            "ההובלה נפרסת על הכמות הזו כשמחיר הספק אינו מגדיר אחרת",
          )}
        </Card>
      </div>

      {role === "ADMIN" && (
        <Card>
          <button type="button" className="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "שומר…" : "שמור הגדרות"}
          </button>
          {save.isSuccess && (
            <span style={{ marginInlineStart: 10, color: "var(--good)", fontSize: 13 }}>
              נשמר. יחס העבודה חושב מחדש; מחירונים לא שונו (§51, §64).
            </span>
          )}
        </Card>
      )}
    </>
  );
}
