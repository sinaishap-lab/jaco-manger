import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getRole, setRole, type Role } from "./lib/api.js";
import { Calculator } from "./pages/Calculator.js";
import { SupplierComparison } from "./pages/SupplierComparison.js";
import { Products } from "./pages/Products.js";
import { ProductCard } from "./pages/ProductCard.js";
import { Suppliers } from "./pages/Suppliers.js";
import { SupplierCard } from "./pages/SupplierCard.js";
import { Materials } from "./pages/Materials.js";
import { SupplierPrices } from "./pages/SupplierPrices.js";
import { PriceLists } from "./pages/PriceLists.js";
import { Quotes } from "./pages/Quotes.js";
import { Attributes } from "./pages/Attributes.js";
import { Settings } from "./pages/Settings.js";

/** §57 — switching role re-fetches everything, since responses differ by role. */
function RoleSwitch() {
  const [role, setLocal] = useState<Role>(getRole());
  const queryClient = useQueryClient();

  const change = (next: Role) => {
    setRole(next);
    setLocal(next);
    void queryClient.invalidateQueries();
  };

  return (
    <div className="role-switch">
      <label>תפקיד</label>
      <div className="seg">
        <button type="button" aria-pressed={role === "ADMIN"} onClick={() => change("ADMIN")}>
          ADMIN
        </button>
        <button type="button" aria-pressed={role === "USER"} onClick={() => change("USER")}>
          USER
        </button>
      </div>
      <div className="note">
        {role === "ADMIN"
          ? "רואה עלויות, ספקים ורווחיות; יכול לשנות מחירים."
          : "רואה מחירי מכירה בלבד. עלויות ורווחיות מסוננות בשרת."}
      </div>
    </div>
  );
}

const NAV: Array<{ group: string; items: Array<[string, string]> }> = [
  {
    group: "תמחור",
    items: [
      ["/calculator", "מחשבון תמחור"],
      ["/compare", "השוואת ספקים"],
      ["/price-lists", "מחירונים"],
      ["/quotes", "הצעות מחיר והיסטוריה"],
    ],
  },
  {
    group: "מידע מוצר",
    items: [
      ["/products", "קטלוג מוצרים"],
      ["/materials", "חומרים"],
      ["/attributes", "מילון תכונות"],
    ],
  },
  {
    group: "רכש",
    items: [
      ["/suppliers", "ספקים"],
      ["/supplier-prices", "מחירי ספקים"],
    ],
  },
  { group: "מערכת", items: [["/settings", "הגדרות עסק"]] },
];

export function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <h1>תמחור, רכש ורווחיות</h1>
        <div className="tagline">מערכת פנימית · מקור אמת למידע מוצר</div>

        {NAV.map((g) => (
          <div className="nav-group" key={g.group}>
            <span>{g.group}</span>
            {g.items.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
                {label}
              </NavLink>
            ))}
          </div>
        ))}

        <RoleSwitch />
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/calculator" replace />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/compare" element={<SupplierComparison />} />
          <Route path="/price-lists" element={<PriceLists />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductCard />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/attributes" element={<Attributes />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/suppliers/:id" element={<SupplierCard />} />
          <Route path="/supplier-prices" element={<SupplierPrices />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<div className="empty">הדף לא נמצא.</div>} />
        </Routes>
      </main>
    </div>
  );
}
