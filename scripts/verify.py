#!/usr/bin/env python3
"""End-to-end acceptance checks against the running API.

Each check names the SPEC section it verifies. Run with the API on :3000.
"""
import json
import sys
import urllib.request
from decimal import Decimal as D

BASE = "http://localhost:3000/api"
PASS, FAIL = [], []


def call(method, path, body=None, role="ADMIN"):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("X-Role", role)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"null")
        except Exception:
            return e.code, {"raw": raw.decode(errors="replace")[:200]}


def check(label, ok, detail=""):
    (PASS if ok else FAIL).append(label)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f"  — {detail}" if detail else ""))


# ─── setup: find seeded ids ───
_, products = call("GET", "/products")
product = products[0]
_, sizes = call("GET", f"/products/{product['id']}/sizes")
size = {s["name"]: s for s in sizes}
_, materials = call("GET", "/materials")
material = materials[0]

print("\n§6 — labor ratio is derived, not stored")
_, settings = call("GET", "/settings")
check("labor ratio derives to exactly 0.59 from 120,000 / 60,000",
      settings["derived"]["laborRatio"] == "0.59", settings["derived"]["laborRatio"])
check("source is DERIVED, not a stored constant",
      settings["derived"]["laborRatioSource"] == "DERIVED")
check("employee cost per hour is 45 x 1.4 = 63",
      settings["derived"]["employeeCostPerHour"] == "63")

print("\n§22, §32, §61 — the walkthrough figures")
_, q = call("POST", "/calculate",
            {"productId": product["id"], "productSizeId": size["15×21"]["id"], "quantity": 1})
check("15x21 area is 0.0315 sqm", q["areaPerUnit"] == "0.0315", q["areaPerUnit"])
check("59 incl. VAT is exactly 50 ex. VAT", q["totalPriceExVat"] == "50", q["totalPriceExVat"])
check("labor is 50 x 0.59 = 29.5", q["laborCost"] == "29.5", q["laborCost"])
check("effective price per sqm is 59 / 0.0315",
      D(q["effectivePricePerSqmInclVat"]).quantize(D("0.01")) == D("1873.02"),
      q["effectivePricePerSqmInclVat"][:12])

print("\n§25, §26 — order minimum")
_, m1 = call("POST", "/calculate",
             {"productId": product["id"], "productSizeId": size["10×15"]["id"], "quantity": 1})
check("one 10x15 at 39 is lifted to the 59 minimum",
      m1["totalPriceInclVat"] == "59" and m1["unitPriceInclVat"] == "39",
      f"unit {m1['unitPriceInclVat']} -> total {m1['totalPriceInclVat']}")
check("the minimum warning is reported",
      "MINIMUM_ORDER_APPLIED" in [w["code"] for w in m1["warnings"]])
_, m2 = call("POST", "/calculate",
             {"productId": product["id"], "productSizeId": size["10×15"]["id"], "quantity": 2})
check("two 10x15 come to 78, so the minimum does not apply",
      m2["totalPriceInclVat"] == "78", m2["totalPriceInclVat"])

print("\n§24 + C3 — tier boundaries")
for qty, expected in [(5, "59"), (6, "57"), (300, "47"), (301, "45")]:
    _, r = call("POST", "/calculate",
                {"productId": product["id"], "productSizeId": size["15×21"]["id"], "quantity": qty})
    check(f"quantity {qty} prices at {expected}", r["unitPriceInclVat"] == expected,
          r["unitPriceInclVat"])

print("\n§62, §63 — supplier comparison by effective cost")
_, cmp50 = call("GET", f"/suppliers/compare?materialId={material['id']}&quantity=50")
rows = {r["supplierName"]: r for r in cmp50["rows"]}
a, b = rows.get("ספק א׳"), rows.get("ספק ב׳")
check("supplier A: 50 x 29 + 100 freight = 1550",
      a and a["unitPrice"] == "29" and a["effectivePurchaseCost"] == "1550",
      f"{a['unitPrice']} -> {a['effectivePurchaseCost']}" if a else "missing")
check("supplier B: 50 x 31 + 0 freight = 1550",
      b and b["unitPrice"] == "31" and b["effectivePurchaseCost"] == "1550",
      f"{b['unitPrice']} -> {b['effectivePurchaseCost']}" if b else "missing")
check("both come to an effective 31 per sqm, so neither is cheaper",
      a and b and D(a["effectiveCostPerUnit"]) == D("31") == D(b["effectiveCostPerUnit"])
      and a["isCheapest"] and b["isCheapest"])
_, cmp10 = call("GET", f"/suppliers/compare?materialId={material['id']}&quantity=10")
r10 = cmp10["rows"]
check("§63 — at 10 sqm the lower sticker price is NOT the cheaper order",
      r10[0]["supplierName"] != "ספק א׳"
      and D([r for r in r10 if r['supplierName'] == 'ספק א׳'][0]["unitPrice"]) < D(r10[0]["unitPrice"]),
      f"cheapest={r10[0]['supplierName']} at {r10[0]['effectivePurchaseCost']}")

print("\nC2 — freight allocation")
args = {"productId": product["id"], "productSizeId": size["15×21"]["id"], "quantity": 1,
        "supplierMode": "MANUAL", "selectedSupplierId": None}
_, sups = call("GET", "/suppliers")
sup_a = [s for s in sups if s["name"] == "ספק א׳"][0]
_, amort = call("POST", "/calculate", {**args, "selectedSupplierId": sup_a["id"],
                                       "shippingAllocation": "AMORTIZED"})
_, full = call("POST", "/calculate", {**args, "selectedSupplierId": sup_a["id"],
                                      "shippingAllocation": "FULL_ORDER"})
check("AMORTIZED: 100 freight over a 50 sqm lot gives an effective 31 per sqm",
      amort["supplier"]["effectiveUnitCost"] == "31", amort["supplier"]["effectiveUnitCost"])
check("AMORTIZED: the 0.0315 sqm order carries 0.063 of freight",
      amort["shippingCost"] == "0.063", amort["shippingCost"])
check("FULL_ORDER: the whole 100 is charged",
      full["shippingCost"] == "100", full["shippingCost"])
check("FULL_ORDER turns the contribution negative, AMORTIZED does not",
      D(full["contribution"]) < D(amort["contribution"]),
      f"{full['contribution']} vs {amort['contribution']}")

print("\n§18, §54 — a saved quote is immutable")
_, saved = call("POST", "/quotes",
                {"productId": product["id"], "productSizeId": size["15×21"]["id"],
                 "quantity": 10, "notes": "acceptance check"})
before = {k: saved[k] for k in ("materialCost", "totalCost", "contribution", "unitPriceInclVat")}
# Raise the purchase price of every supplier tier (§17 append-only).
_, hist = call("GET", f"/materials/{material['id']}/prices")
open_rows = [h for h in hist if h["validUntil"] is None and h["active"]]
for row in open_rows:
    call("POST", f"/materials/{material['id']}/prices", {
        "supplierId": row["supplierId"], "unit": row["unit"],
        "unitPrice": str(D(row["unitPrice"]) * 2),
        "minimumQuantity": row["minimumQuantity"],
        "maximumQuantity": row["maximumQuantity"],
        "purchaseLotQuantity": row["purchaseLotQuantity"],
    })
_, reread = call("GET", f"/quotes/{saved['id']}")
after = {k: reread[k] for k in before}
check("the stored quote's figures did not move after the price doubled",
      before == after, f"{before['contribution']} -> {after['contribution']}")
_, fresh = call("POST", "/calculate",
                {"productId": product["id"], "productSizeId": size["15×21"]["id"], "quantity": 10})
check("a fresh calculation DOES reflect the new price",
      D(fresh["materialCost"]) > D(before["materialCost"]),
      f"{before['materialCost']} -> {fresh['materialCost']}")

print("\n§17 — price history is append-only")
_, hist2 = call("GET", f"/materials/{material['id']}/prices")
check("the old price rows still exist, closed rather than overwritten",
      len([h for h in hist2 if h["validUntil"] is not None]) >= len(open_rows),
      f"{len(hist2)} rows total")
check("exactly one row is in force per supplier and tier",
      all(sum(1 for h in hist2 if h["validUntil"] is None and h["active"]
              and h["supplierId"] == s and h["minimumQuantity"] == mq) <= 1
          for s in {h["supplierId"] for h in hist2}
          for mq in {h["minimumQuantity"] for h in hist2}))

print("\n§51 — a cost change does not move the price list")
check("the sell price is unchanged after the purchase price doubled",
      fresh["unitPriceInclVat"] == before["unitPriceInclVat"],
      f"{before['unitPriceInclVat']} -> {fresh['unitPriceInclVat']}")

print("\n§57 — role enforcement, on the server")
_, admin_view = call("POST", "/calculate",
                     {"productId": product["id"], "productSizeId": size["15×21"]["id"],
                      "quantity": 10}, role="ADMIN")
_, user_view = call("POST", "/calculate",
                    {"productId": product["id"], "productSizeId": size["15×21"]["id"],
                     "quantity": 10}, role="USER")
hidden = ("materialCost", "totalCost", "contribution", "contributionMargin", "supplier",
          "shippingCost", "purchasePrice", "effectivePurchaseCost")
check("a USER sees the sale price", user_view.get("totalPriceInclVat") == "570")
check("a USER sees no cost or margin field",
      all(k not in user_view for k in hidden))
check("an ADMIN sees them all", all(k in admin_view for k in hidden))
status, _ = call("GET", f"/suppliers/compare?materialId={material['id']}&quantity=50", role="USER")
check("a USER is refused supplier comparison", status == 403, f"HTTP {status}")
status, _ = call("POST", f"/materials/{material['id']}/prices",
                 {"supplierId": sup_a["id"], "unit": "SQM", "unitPrice": "1"}, role="USER")
check("a USER is refused a price change", status == 403, f"HTTP {status}")
status, _ = call("PUT", "/settings", {"vatRate": "17"}, role="USER")
check("a USER is refused a settings change", status == 403, f"HTTP {status}")

print("\n§24 + C3 — the database rejects the overlapping tier")
_, lists = call("GET", "/price-lists")
active = [p for p in lists if p["isActive"]][0]
status, body = call("PUT", f"/price-lists/{active['id']}/tiers", {
    "productId": product["id"], "productSizeId": size["15×21"]["id"],
    "minQuantity": 300, "maxQuantity": None, "unitPriceInclVat": "45"})
check("a 300+ tier overlapping 201-300 is rejected", status == 409,
      f"HTTP {status}: {str(body.get('error'))[:60]}")

print("\n§70 — no hard-coded business values")
_, before_vat = call("POST", "/calculate",
                     {"productId": product["id"], "productSizeId": size["15×21"]["id"],
                      "quantity": 10})
call("PUT", "/settings", {"vatRate": "17"})
_, after_vat = call("POST", "/calculate",
                    {"productId": product["id"], "productSizeId": size["15×21"]["id"],
                     "quantity": 10})
call("PUT", "/settings", {"vatRate": "18"})
check("changing VAT to 17% moves every ex-VAT figure",
      after_vat["totalPriceExVat"] != before_vat["totalPriceExVat"],
      f"{before_vat['totalPriceExVat'][:8]} -> {after_vat['totalPriceExVat'][:8]}")
check("the customer price stays put, as §3 requires",
      after_vat["totalPriceInclVat"] == before_vat["totalPriceInclVat"] == "570")

print("\n§81 — the outbox recorded the changes")
_, pending = call("GET", "/sync/pending")
check("price changes queued sync events", pending["total"] > 0, f"{pending['total']} pending")

print(f"\n{'=' * 60}\n  {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("  failed:")
    for f in FAIL:
        print(f"    - {f}")
print("=" * 60)
sys.exit(1 if FAIL else 0)
