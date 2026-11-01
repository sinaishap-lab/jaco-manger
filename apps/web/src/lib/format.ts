/**
 * Formatting for display only (§59).
 *
 * Values arrive from the API as decimal strings. These helpers format the string
 * without ever producing a JS float from it for arithmetic — any rounding here is
 * presentational, and the engine's value remains the authority.
 */
const HE = "he-IL";

/** Money, with the currency symbol. Rounds for display only. */
export function money(value: string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(HE, {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/** A plain number, e.g. an area or a quantity. */
export function num(value: string | number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(HE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n);
}

/** A percentage already expressed in percent units (§42 returns 38.17, not 0.3817). */
export function pct(value: string | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat(HE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)}%`;
}

/** A fraction shown as a percentage, e.g. a labor ratio of 0.59. */
export function fractionAsPct(value: string | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return pct(String(n * 100), decimals);
}

export function date(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(HE, { dateStyle: "short" }).format(d);
}

export function dateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(HE, { dateStyle: "short", timeStyle: "short" }).format(d);
}

/** True when a decimal string is negative, without float arithmetic on it. */
export function isNegative(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return value.trimStart().startsWith("-");
}

/** §13, §24 — render a tier range the way the price list reads. */
export function tierLabel(min: number | string, max: number | string | null): string {
  const lo = String(min);
  return max === null || max === undefined ? `${lo}+` : `${lo}–${String(max)}`;
}

export const UNIT_LABELS: Record<string, string> = {
  SQM: 'מ"ר',
  LINEAR_METER: "מטר רץ",
  UNIT: "יחידה",
  KG: 'ק"ג',
  LITER: "ליטר",
  HOUR: "שעה",
};

export const SHIPPING_LABELS: Record<string, string> = {
  FLAT: "קבוע",
  PER_QUANTITY: "לפי כמות",
  FREE_ABOVE: "חינם מעל סכום",
  BY_WEIGHT: "לפי משקל",
  BY_AREA: "לפי שטח",
};

export const LABOR_LABELS: Record<string, string> = {
  PERCENT: "אחוז מהמכירה",
  HOURLY: "לפי שעות",
  COMBINED: "משולב",
};

export const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT: "טיוטה",
  ACTIVE: "פעיל",
  DISCONTINUED: "הופסק",
};

export const SCOPE_LABELS: Record<string, string> = {
  FIXED_ORDER: "קבוע להזמנה",
  VARIABLE_UNIT: "לפי יחידה",
  VARIABLE_AREA: 'לפי מ"ר',
};

export const CONTACT_ROLE_LABELS: Record<string, string> = {
  SALES: "מכירות",
  SUPPORT: "תמיכה",
  ACCOUNTING: 'הנהח"ש',
  LOGISTICS: "לוגיסטיקה",
  OTHER: "אחר",
};

export const ATTR_GROUP_LABELS: Record<string, string> = {
  TECHNICAL: "טכני",
  PRINT: "הדפסה",
  FINISHING: "גימור",
  FINANCIAL: "כספי",
  MARKETING: "שיווקי",
  LOGISTICS: "לוגיסטי",
};

export const MEDIA_KIND_LABELS: Record<string, string> = {
  IMAGE: "תמונה",
  DATASHEET: "דף נתונים",
  CERTIFICATE: "תעודה",
  CONTRACT: "חוזה",
  SUPPLIER_PRICE_LIST: "מחירון ספק",
  MOCKUP: "הדמיה",
  OTHER: "אחר",
};

export const DRIVEN_BY_LABELS: Record<string, string> = {
  MARGIN_TARGET: "יעד תרומה",
  MINIMUM_ORDER: "מינימום הזמנה",
  TARGET_SQM_PRICE: 'מחיר יעד למ"ר',
};
