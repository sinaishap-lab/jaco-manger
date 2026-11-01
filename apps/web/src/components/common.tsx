import type { ReactNode } from "react";
import type { Warning } from "../lib/api.js";
import { ApiError } from "../lib/api.js";

export function PageHead({ title, spec, children }: { title: string; spec?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h2>{title}</h2>
      {spec !== undefined && <span className="spec">{spec}</span>}
      <div style={{ marginInlineStart: "auto", display: "flex", gap: 8, alignItems: "center" }}>{children}</div>
    </div>
  );
}

export function Card({ title, spec, children }: { title?: string; spec?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title !== undefined && (
        <h3>
          {title}
          {spec !== undefined && <span className="spec">{spec}</span>}
        </h3>
      )}
      {children}
    </section>
  );
}

/** Lays a label over a value, right-aligning the number as a tabular figure. */
export function Line({
  label, value, variant, sign,
}: {
  label: ReactNode;
  value: ReactNode;
  variant?: "total" | "headline" | "sub";
  sign?: "pos" | "neg";
}) {
  return (
    <div className={`line${variant === undefined ? "" : ` ${variant}`}`}>
      <span>{label}</span>
      <span className={sign === undefined ? undefined : sign}>{value}</span>
    </div>
  );
}

/** §58 — the engine's warnings, surfaced rather than swallowed. */
export function Warnings({ items }: { items: Warning[] }) {
  if (items.length === 0) return null;
  const severe = new Set(["NEGATIVE_CONTRIBUTION", "MARGIN_TARGET_UNREACHABLE", "NO_VALID_SUPPLIER_PRICE"]);
  return (
    <div className="warnings">
      {items.map((w, i) => (
        <div key={`${w.code}-${i}`} className={`w${severe.has(w.code) ? " bad" : ""}`}>
          <span aria-hidden>{severe.has(w.code) ? "⚠" : "ℹ"}</span>
          <span>
            {w.message}{" "}
            {w.spec !== undefined && w.spec.length > 0 && <code>{w.spec.join(" ")}</code>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "שגיאה לא מזוהה.";
  const details = error instanceof ApiError ? error.details : undefined;
  return (
    <div className="error-box">
      <div>{message}</div>
      {details !== undefined && details.length > 0 && (
        <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
          {details.map((d, i) => (
            <li key={i}>
              <code>{d.path}</code>: {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Loading() {
  return <div className="empty">טוען…</div>;
}

export function Badge({ kind, children }: { kind: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function Field({
  label, hint, children,
}: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint !== undefined && <div className="hint">{hint}</div>}
    </div>
  );
}

/** §57 — shown where a USER is denied, so the refusal is explained not hidden. */
export function AdminOnly({ what }: { what: string }) {
  return (
    <div className="notice">
      {what} חושף נתוני עלות ורווחיות, ולכן זמין להרשאת ADMIN בלבד (§57). ניתן להחליף תפקיד בתחתית
      התפריט — האכיפה עצמה מתבצעת בשרת.
    </div>
  );
}
