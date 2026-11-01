# SPEC.md

# מערכת תמחור, רכש ורווחיות לעסק הדפסה וייצור

Version: 1.0
Language: Hebrew
Direction: RTL

---

# 1. מטרת המערכת

יש לבנות אפליקציית Web פנימית לניהול:

- חומרי גלם
- ספקים
- מחירי רכישה
- מחירי מכירה
- מוצרים
- גדלים
- מדרגות כמויות
- עלויות עבודה
- עלויות נוספות
- מחירונים
- הצעות מחיר
- רווחיות
- השוואת ספקים

המערכת צריכה להיות כללית ולא מוגבלת ללוקובונד.

בעתיד ניתן יהיה להשתמש בה עבור:

- לוקובונד
- PVC
- קאפה
- אלומיניום
- מדבקות
- שמשוניות
- נייר
- מוצרים מודפסים
- מוצרים לפי מ"ר
- מוצרים לפי מטר רץ
- מוצרים לפי יחידה
- מוצרים לפי משקל
- מוצרים לפי זמן עבודה

---

# 2. עקרון מרכזי

יש להפריד בין:

1. חומר גלם
2. ספק
3. מחיר רכישה מהספק
4. מוצר
5. מחיר מכירה
6. עלות עבודה
7. עלויות נוספות
8. תרומה

לדוגמה:

חומר:

"לוקובונד 3 מ"מ לבן"

יכול להירכש מ:

ספק א' - 32 ₪ למ"ר
ספק ב' - 35 ₪ למ"ר
ספק ג' - 29 ₪ למ"ר

המחיר של החומר אינו נשמר כערך יחיד.

מחירי הרכש נשמרים לפי ספק.

---

# 3. עקרונות תמחור

כל מחיר ללקוח מוצג:

כולל מע"מ.

כל חישובי העלות והרווחיות מתבצעים:

לפני מע"מ.

אין לחשב רווח על מחיר כולל מע"מ.

אין לקרוא לתוצאה "רווח נקי" אלא אם כל הוצאות העסק הוזנו.

המונח לשימוש:

"תרומה לאחר עלויות"

---

# 4. הגדרות עסק

צור מסך:

"הגדרות עסק"

שדות:

- שם העסק
- מטבע
- שיעור מע"מ
- מחזור ממוצע
- שכר ממוצע
- עלות עובד לשעה
- מקדם עלות מעביד
- יחס עלות עבודה
- מינימום הזמנה
- יעד תרומה
- מחיר יעד למ"ר

---

# 5. ערכי ברירת מחדל

VAT_RATE = 18

AVERAGE_SALES_INCL_VAT = 120000

AVERAGE_WAGES = 60000

EMPLOYEE_HOURLY_WAGE = 45

EMPLOYER_MULTIPLIER = 1.4

MIN_ORDER_INCL_VAT = 59

TARGET_SQM_PRICE_INCL_VAT = 227

DEFAULT_MATERIAL_COST_PER_SQM = 45

---

# 6. חישוב יחס עבודה

המחזור שהוזן הוא כולל מע"מ.

לכן:

average_sales_ex_vat =
average_sales_incl_vat / 1.18

יחס עבודה:

labor_ratio =
average_wages / average_sales_ex_vat

עם נתוני ברירת המחדל:

120000 / 1.18 =
101694.92

60000 / 101694.92 ≈ 59%

לכן:

LABOR_RATIO ≈ 59%

יש להציג:

"יחס עלות עבודה היסטורי: 59%"

הערך ניתן לשינוי ידני.

---

# 7. עלות עובד

עלות עובד לשעה:

employee_cost_per_hour =
employee_hourly_wage * employer_multiplier

ברירת מחדל:

45 × 1.4 = 63 ₪

---

# 8. שיטות חישוב עבודה

יש לתמוך בשלוש שיטות.

## A - אחוז מהמכירה

labor_cost =
price_ex_vat × labor_ratio

ברירת מחדל.

## B - לפי שעות

labor_cost =
hours × employee_cost_per_hour

## C - משולב

אפשר:

עלות מינימום קבועה
+
שעות עבודה
+
אחוז מהמכירה

השיטה ניתנת להגדרה לכל מוצר.

---

# 9. טבלת Suppliers

יש ליצור:

Suppliers

שדות:

id
name
contact_name
phone
email
website
tax_id
payment_terms
delivery_cost
minimum_order_value
active
notes
created_at
updated_at

---

# 10. טבלת Materials

יש ליצור:

Materials

שדות:

id
name
material_type
pricing_unit
default_supplier_id
active
notes
created_at
updated_at

חשוב:

אין לשמור מחיר רכישה קבוע בתוך Materials.

---

# 11. יחידות תמחור חומר

ערכים:

SQM
LINEAR_METER
UNIT
KG
LITER
HOUR

---

# 12. טבלת SupplierMaterialPrices

יש ליצור:

SupplierMaterialPrices

שדות:

id
supplier_id
material_id
unit
unit_price
currency
minimum_quantity
maximum_quantity
delivery_cost
valid_from
valid_until
is_default
active
notes
created_at
updated_at

---

# 13. מדרגות מחיר ספק

ספק יכול לתת מחירים שונים לפי כמות.

לדוגמה:

לוקובונד:

1–9 מ"ר:
35 ₪

10–49 מ"ר:
32 ₪

50+ מ"ר:
29 ₪

המערכת חייבת לבחור את המחיר בהתאם לכמות הנדרשת.

---

# 14. בחירת ספק

אפשרויות:

MANUAL

AUTO

## MANUAL

המשתמש בוחר ספק.

## AUTO

המערכת בודקת את כל הספקים הזמינים.

המערכת בוחרת את הספק בעל:

העלות האפקטיבית הנמוכה ביותר.

---

# 15. עלות אפקטיבית של ספק

אין לבחור ספק רק לפי מחיר חומר.

יש לחשב:

effective_purchase_cost =
material_cost
+
allocated_shipping
+
supplier_additional_costs

לדוגמה:

ספק א':

29 ₪ למ"ר
+
100 ₪ משלוח

ספק ב':

32 ₪ למ"ר
+
0 ₪ משלוח

יש לחשב את העלות בפועל בהתאם לכמות.

---

# 16. עלות משלוח

יש לתמוך ב:

- משלוח קבוע
- משלוח לפי כמות
- משלוח חינם מעל סכום מסוים
- משלוח לפי משקל
- משלוח לפי שטח

שדות אפשריים:

shipping_type
shipping_cost
free_shipping_threshold

---

# 17. היסטוריית מחירי ספק

אין למחוק מחיר קודם.

כל שינוי במחיר יוצר רשומה חדשה.

לדוגמה:

01/01/2026:
30 ₪

01/06/2026:
32 ₪

01/08/2026:
35 ₪

המערכת צריכה לדעת איזה מחיר היה תקף בתאריך מסוים.

---

# 18. Snapshot של עלות רכישה

כאשר נשמרת הצעת מחיר או הזמנה, יש לשמור Snapshot:

supplier_id
supplier_name
material_id
material_name
purchase_price
purchase_unit
purchase_date
shipping_cost

גם אם המחיר אצל הספק משתנה בעתיד, הצעת המחיר ההיסטורית לא תשתנה.

---

# 19. טבלת Products

שדות:

id
name
material_id
pricing_method
labor_method
base_price
target_margin
minimum_order
active
notes
created_at
updated_at

---

# 20. שיטות תמחור מוצר

יש לתמוך ב:

SQM

LINEAR_METER

UNIT

KG

HOUR

CUSTOM

---

# 21. טבלת ProductSizes

שדות:

id
product_id
name
width_cm
height_cm
depth_cm
area_sqm
active
created_at
updated_at

---

# 22. חישוב שטח

עבור מוצר לפי שטח:

area_sqm =
width_cm × height_cm / 10000

לדוגמה:

15 × 21 =
0.0315 מ"ר

---

# 23. טבלת QuantityTiers

שדות:

id
product_id
min_quantity
max_quantity
unit_price_incl_vat
active
created_at
updated_at

---

# 24. מדרגות כמות ברירת מחדל

1–5
6–10
11–25
26–50
51–100
101–200
201–300
300+

---

# 25. מינימום הזמנה

ברירת מחדל:

59 ₪ כולל מע"מ.

נוסחה:

calculated_order_price =
quantity × unit_price_incl_vat

final_order_price =
MAX(calculated_order_price, minimum_order_incl_vat)

---

# 26. דוגמה למינימום

10×15:

מחיר יחידה:
39 ₪

כמות:
1

מחיר מחושב:
39 ₪

מינימום:
59 ₪

מחיר ללקוח:
59 ₪

כמות 2:

2 × 39 =
78 ₪

מחיר ללקוח:
78 ₪

---

# 27. לוקובונד - מוצר ברירת מחדל

צור:

"לוקובונד מודפס"

חומר:

"לוקובונד"

עלות חומר + הדפסה היסטורית:

45 ₪ למ"ר

העלות הזו משמשת כברירת מחדל בלבד.

מחיר הרכש האמיתי צריך להגיע ממערכת הספקים.

---

# 28. גדלי לוקובונד

10×15
13×18
15×21
20×20
20×30
30×30
30×40
30×45
35×50
40×40
40×60
50×50
50×70
60×60
60×90
100×100

---

# 29. מחירון לוקובונד

כל המחירים כוללים מע"מ.

סדר מדרגות:

1–5
6–10
11–25
26–50
51–100
101–200
201–300
300+

---

## 10×15

39
38
37
36
35
34
33
32

## 13×18

45
44
43
42
41
40
39
38

## 15×21

59
57
55
53
51
49
47
45

## 20×20

59
57
55
53
51
49
47
45

## 20×30

69
67
65
63
61
59
57
55

## 30×30

79
77
75
73
71
69
67
65

## 30×40

89
87
85
83
81
79
77
75

## 30×45

99
97
95
93
91
89
87
85

## 35×50

109
107
105
103
101
99
97
95

## 40×40

109
107
105
103
101
99
97
95

## 40×60

129
127
125
123
121
119
117
115

## 50×50

139
137
135
133
131
129
127
125

## 50×70

159
157
155
153
151
149
147
145

## 60×60

169
167
165
163
161
159
157
155

## 60×90

199
197
195
193
191
189
187
185

## 100×100

227
224
221
218
215
212
209
205

---

# 30. מחיר יעד למ"ר

ברירת מחדל:

227 ₪ כולל מע"מ.

100×100:

1 מ"ר

מחיר בסיס:

227 ₪ כולל מע"מ

מחיר לפני מע"מ:

227 / 1.18 =
192.37 ₪

---

# 31. פרמיה לגדלים קטנים

אין לחשב את כל הגדלים רק לפי:

שטח × מחיר למ"ר.

לגדלים קטנים יש עלויות טיפול:

- הכנת קובץ
- setup
- חיתוך
- מיון
- אריזה
- שירות
- זמן עבודה

לכן יש לתמוך:

SMALL_FORMAT_PREMIUM

המחיר האפקטיבי למ"ר יכול להיות גבוה יותר בגדלים קטנים.

---

# 32. חישוב מחיר לפני מע"מ

price_ex_vat =
price_incl_vat / (1 + vat_rate / 100)

בברירת המחדל:

price_ex_vat =
price_incl_vat / 1.18

---

# 33. חישוב שטח כולל

total_area_sqm =
area_per_unit × quantity

---

# 34. חישוב עלות חומר

material_cost =
total_area_sqm × effective_material_cost

כאשר:

effective_material_cost

מגיע ממחיר הספק שנבחר.

---

# 35. חישוב הדפסה

אם ההדפסה היא עלות נפרדת:

printing_cost =
total_area_sqm × printing_cost_per_sqm

אם עלות ההדפסה כבר כלולה במחיר החומר:

printing_cost =
0

אין לספור עלות פעמיים.

---

# 36. חיתוך

אפשרויות:

עלות לפי יחידה:

cutting_cost =
quantity × cutting_cost_per_unit

או:

cutting_cost =
cutting_hours × employee_cost_per_hour

---

# 37. עלויות נוספות

יש לתמוך ב:

- אריזה
- משלוח
- הכנת קובץ
- למינציה
- חיתוך מיוחד
- התקנה
- עבודה חיצונית
- כל עלות אחרת

הפרדה:

FIXED_ORDER_COST

VARIABLE_UNIT_COST

VARIABLE_AREA_COST

---

# 38. חישוב עבודה לפי אחוז

labor_cost =
price_ex_vat × labor_ratio

ברירת מחדל:

59%

---

# 39. חישוב עבודה לפי שעות

labor_cost =
estimated_hours × employee_cost_per_hour

ברירת מחדל:

employee_cost_per_hour =
45 × 1.4 =
63 ₪

---

# 40. חישוב עלות כוללת

total_cost =
material_cost
+
printing_cost
+
cutting_cost
+
labor_cost
+
additional_costs

---

# 41. חישוב תרומה

contribution =
price_ex_vat - total_cost

---

# 42. אחוז תרומה

contribution_margin =
contribution / price_ex_vat × 100

---

# 43. מחיר אפקטיבי למ"ר

effective_price_per_sqm_incl_vat =
price_incl_vat / total_area_sqm

effective_price_per_sqm_ex_vat =
price_ex_vat / total_area_sqm

---

# 44. מחשבון תמחור

צור מסך:

"מחשבון תמחור"

שדות:

מוצר
גודל
כמות
ספק
שיטת עבודה
עלויות נוספות

ספק:

[אוטומטי]

או:

[בחירה ידנית]

---

# 45. תצוגת ספק במחשבון

כאשר ספק = אוטומטי:

המערכת תציג:

ספק מומלץ
מחיר רכישה
משלוח
עלות אפקטיבית

לדוגמה:

ספק ג'

מחיר:
29 ₪ למ"ר

משלוח:
100 ₪

עלות אפקטיבית להזמנה:
XXX ₪

---

# 46. השוואת ספקים

צור מסך:

"השוואת ספקים"

בחירת חומר:

[לוקובונד]

כמות:

[50 מ"ר]

תציג:

| ספק | מחיר/מ"ר | מינימום | משלוח | עלות כוללת | עלות אפקטיבית |
|---|---:|---:|---:|---:|---:|

הספק הזול ביותר יודגש בירוק.

---

# 47. המלצת ספק

המערכת יכולה להציג:

"ספק מומלץ"

הבחירה תתבסס על:

1. מחיר חומר
2. כמות
3. מינימום הזמנה
4. משלוח
5. מחיר אפקטיבי
6. זמינות אם קיימת

אין להחליף ספק ידני אוטומטית.

---

# 48. שינוי מחיר ספק

כאשר מחיר ספק משתנה:

אין לשנות מחירוני מכירה קיימים.

יש ליצור מחיר רכישה חדש.

המערכת תציג:

עלות קודמת
עלות חדשה
שינוי באחוזים
השפעה על התרומה

---

# 49. התראה על התייקרות

אם חומר התייקר:

המערכת תציג:

"חומר X התייקר ב־Y%"

וכן:

תרומה קודמת:
XXX

תרומה חדשה:
XXX

---

# 50. חישוב מחיר מכירה מומלץ

כאשר העלות משתנה, ניתן לבחור:

"חשב מחיר מכירה מומלץ"

המערכת תקבל:

עלות כוללת
יעד תרומה
מינימום הזמנה
מחיר יעד למ"ר

ותחשב:

recommended_price_incl_vat

---

# 51. אין לשנות מחירים אוטומטית

שינוי עלויות לא משנה מחירון.

המערכת רק מציגה:

"מחיר נוכחי"
"מחיר מומלץ"

והמשתמש מחליט.

---

# 52. Dashboard

הצג:

## עסק

מחזור ממוצע
שכר
יחס עבודה
עלות חומר ממוצעת
תרומה ממוצעת

## רכש

מספר ספקים
הספק הזול ביותר
חומרים שהתייקרו
עלות רכישה ממוצעת

## מכירות

מחזור
כמות הזמנות
כמות יחידות
מוצר מוביל
גודל מוביל

## רווחיות

מוצר רווחי ביותר
מוצר חלש ביותר
תרומה ממוצעת
אחוז תרומה ממוצע

---

# 53. היסטוריית חישובים

כל חישוב ניתן לשמירה.

שדות:

id
date
product_id
size_id
quantity
supplier_id
purchase_price
unit_price
total_price_incl_vat
total_price_ex_vat
material_cost
printing_cost
cutting_cost
labor_cost
additional_cost
total_cost
contribution
contribution_margin

---

# 54. Snapshot

כאשר נשמרת הצעת מחיר:

יש לשמור Snapshot מלא.

כולל:

- חומר
- ספק
- מחיר ספק
- עלות משלוח
- מחיר מכירה
- מע"מ
- עלויות
- נוסחאות
- תוצאה

שינוי עתידי במסד הנתונים לא משנה את הצעת המחיר ההיסטורית.

---

# 55. Price List Versions

צור:

PriceListVersions

שדות:

id
name
created_at
active
notes

לדוגמה:

מחירון אוגוסט 2026

מחירון ינואר 2027

מחירון מבצע

---

# 56. ייצוא

יש לתמוך ב:

CSV
Excel
PDF

PDF ללקוח:

אין להציג:

- עלויות
- ספקים
- חומרי גלם
- שכר
- תרומה
- רווחיות

PDF פנימי:

ניתן להציג את כל הנתונים.

---

# 57. הרשאות

ADMIN

יכול:

- לשנות מחירים
- לשנות עלויות
- לנהל ספקים
- לנהל חומרים
- לראות רווחיות
- ליצור מחירונים

USER

יכול:

- לבצע חישובים
- ליצור הצעות מחיר
- לראות מחירי מכירה

---

# 58. Calculation Engine

יש ליצור מנוע חישובים מרכזי.

פונקציה:

calculateQuote(input)

קלט:

product
size
quantity
supplier
pricingTier
settings
additionalCosts

פלט:

{
  quantity,
  areaPerUnit,
  totalArea,

  supplier,
  purchasePrice,
  shippingCost,
  effectivePurchaseCost,

  unitPriceInclVat,
  totalPriceInclVat,
  totalPriceExVat,

  materialCost,
  printingCost,
  cuttingCost,
  laborCost,
  additionalCost,
  totalCost,

  contribution,
  contributionMargin,

  effectivePricePerSqmInclVat,
  effectivePricePerSqmExVat,

  warnings
}

כל המערכת חייבת להשתמש באותו Calculation Engine.

אין לשכפל נוסחאות בתוך רכיבי UI.

---

# 59. דיוק כספי

יש להשתמש ב:

Decimal / NUMERIC

ולא ב-floating point עבור חישובים כספיים.

יש לשמור לפחות 4 ספרות אחרי הנקודה בחישובי ביניים.

בתצוגה ניתן לעגל:

מחירים ללקוח:
2 ספרות או מספר שלם בהתאם להגדרה.

---

# 60. Unit Tests

חובה לבדוק:

1. שטח 15×21
2. שטח 100×100
3. מחיר כולל מע"מ
4. מחיר לפני מע"מ
5. מינימום 59 ₪
6. מדרגת כמות
7. כמות 5
8. כמות 6
9. כמות 10
10. כמות 11
11. כמות 25
12. כמות 26
13. כמות 50
14. כמות 51
15. כמות 100
16. כמות 101
17. כמות 200
18. כמות 201
19. כמות 300
20. כמות 301
21. עלות חומר
22. עלות עבודה
23. תרומה
24. אחוז תרומה
25. מחיר אפקטיבי למ"ר
26. ספק זול
27. ספק יקר
28. משלוח
29. מדרגות מחיר ספק
30. ספק עם מינימום הזמנה
31. שינוי מחיר ספק
32. Snapshot הצעת מחיר
33. שינוי מע"מ
34. שינוי עלות חומר
35. מוצר לפי יחידה
36. מוצר לפי מ"ר
37. מוצר לפי מטר רץ

---

# 61. דוגמת בדיקה - 15×21

שטח:

15 × 21 / 10000 =
0.0315 מ"ר

עלות חומר אם המחיר הוא 45 ₪:

0.0315 × 45 =
1.4175 ₪

מחיר מכירה:

59 ₪ כולל מע"מ

מחיר לפני מע"מ:

59 / 1.18 =
50 ₪

עלות עבודה:

50 × 0.59 =
29.50 ₪

תרומה לפני עלויות נוספות:

50
-
1.4175
-
29.50

=
19.0825 ₪

---

# 62. דוגמת ספקים

חומר:

לוקובונד 3 מ"מ

ספק א':

1–9 מ"ר:
35 ₪

10–49:
32 ₪

50+:
29 ₪

משלוח:
100 ₪

ספק ב':

1–49:
33 ₪

50+:
31 ₪

משלוח:
0 ₪

אם נדרשים 50 מ"ר:

ספק א':

50 × 29 = 1450

+ 100 משלוח

=
1550 ₪

עלות אפקטיבית:

31 ₪ למ"ר

ספק ב':

50 × 31 =
1550 ₪

+ 0

=
1550 ₪

גם במקרה של מחיר חומר שונה, שני הספקים שווים בעלות האפקטיבית.

---

# 63. כלל חשוב לגבי ספקים

המערכת לא צריכה לשאול רק:

"מי מוכר הכי בזול?"

אלא:

"מי נותן את העלות האפקטיבית הנמוכה ביותר להזמנה הנוכחית?"

---

# 64. שינוי נתוני העסק

הנתונים:

120,000 ₪ מחזור

60,000 ₪ שכר

הם נתוני ממוצע.

אין להתייחס אליהם כקבועים.

המשתמש יכול לעדכן אותם.

לאחר עדכון:

LABOR_RATIO

מחושב מחדש.

מחירי מכירה קיימים לא משתנים ללא אישור.

---

# 65. ניהול עלויות נוספות בעתיד

יש לתכנן את המערכת כך שניתן יהיה להוסיף:

- חשמל
- שכירות
- פחת
- תחזוקת מכונות
- ביטוח
- תוכנות
- שיווק
- הנהלת חשבונות
- אריזה
- אחסנה

ניתן יהיה לחשב:

OperatingContribution

ולאחר מכן:

NetOperatingProfit

רק כאשר כל העלויות הוזנו.

---

# 66. תכנון עתידי - מלאי

בעתיד ניתן להוסיף:

Inventory

כולל:

- חומר
- כמות במלאי
- יחידה
- ספק
- עלות
- מיקום
- תאריך רכישה
- אצווה

אין צורך לממש בשלב הראשון.

---

# 67. תכנון עתידי - הזמנות

בעתיד:

Orders

OrderItems

Customers

Quotes

Invoices

אין צורך לממש בשלב הראשון אלא אם נדרש.

---

# 68. מסכי המערכת

יש ליצור:

1. Dashboard
2. מחשבון תמחור
3. מוצרים
4. גדלים
5. חומרים
6. ספקים
7. מחירי ספקים
8. השוואת ספקים
9. מחירונים
10. הצעות מחיר
11. היסטוריית חישובים
12. הגדרות

---

# 69. סדר פיתוח

לפני כתיבת קוד:

יש להציג:

1. Architecture
2. Database Schema
3. Entity Relationship Diagram
4. Business Logic
5. Calculation Engine
6. API
7. Wireframes
8. Unit Tests

אין להתחיל מימוש מלא לפני אישור המבנה.

---

# 70. דרישה חשובה

אין Hard Coding של:

18%
59%
45
59
63
227

כל הערכים האלה חייבים להגיע מ-Settings / Database.

הם רק ערכי ברירת מחדל.

---

# 71. דרישה חשובה נוספת

אין ליצור לוגיקה שונה עבור לוקובונד.

לוקובונד הוא רק מוצר Demo.

כל מנוע התמחור צריך לעבוד באותה צורה עבור כל חומר ומוצר.

---

# 72. תוצאה סופית

המערכת צריכה לאפשר לי:

1. להוסיף ספק.
2. להוסיף חומר.
3. לקבוע מחיר רכישה לכל ספק.
4. לקבוע מחיר שונה לפי כמות.
5. להגדיר משלוח.
6. להוסיף מוצר.
7. להגדיר גדלים.
8. להגדיר מחיר מכירה.
9. להגדיר מדרגות כמות.
10. להגדיר מינימום הזמנה.
11. לבחור ספק ידנית.
12. לקבל ספק מומלץ אוטומטית.
13. לחשב עלות חומר אמיתית.
14. לחשב עלות עבודה.
15. לחשב עלויות נוספות.
16. לחשב תרומה.
17. לחשב אחוז תרומה.
18. לחשב מחיר אפקטיבי למ"ר.
19. להשוות ספקים.
20. לראות כיצד שינוי עלות משפיע על הרווחיות.
21. ליצור מחירון חדש.
22. לשמור היסטוריית מחירים.
23. לשמור Snapshot של הצעות מחיר.
24. לייצא מחירון.
25. להוסיף בעתיד מוצרים וחומרים חדשים ללא שינוי בקוד.

---

# 73. כלל עליון

המערכת היא מערכת תמחור דינמית.

אין להניח:

- שכל חומר מתומחר לפי מ"ר.
- שכל ספק מוכר באותו מחיר.
- שמחיר חומר קבוע.
- שהעבודה היא תמיד 59%.
- שהמחיר למ"ר זהה לכל הגדלים.
- שכל כמות מקבלת אותה עלות חומר.
- שהמשלוח תמיד אפס.
- שהמחירון משתנה אוטומטית כאשר עלויות משתנות.

כל הנתונים העסקיים חייבים להיות ניתנים לעריכה.

המטרה היא שהמערכת תחשב את המחיר והרווחיות לפי הנתונים האמיתיים של העסק בזמן החישוב.

---

# 74. לפני התחלת הפיתוח

Claude Code חייב:

1. לקרוא את כל SPEC.md.
2. לזהות דרישות חסרות או סתירות.
3. להציג Database Schema.
4. להציג Architecture.
5. להציג Calculation Flow.
6. להציג Entity Relationships.
7. להציג Wireframes.
8. להציג רשימת API.
9. להציג Unit Tests.

אין להתחיל בפיתוח לפני הצגת התכנון.

לאחר אישור התכנון:

- לבנות Database
- לבנות Calculation Engine
- לבנות Backend
- לבנות Frontend
- להכניס נתוני Demo
- להריץ Tests
- לתקן שגיאות
- להציג את המערכת עובדת

---

# 75. שכבת PIM - מטרה

בנוסף למנוע התמחור, המערכת היא **מערכת ניהול מידע מוצר** (PIM).

לכל מוצר, חומר וספק יש לשמור את כל המידע:

- טכני
- כספי
- שיווקי
- לוגיסטי
- מדיה

עקרון מרכזי:

המערכת היא **מקור האמת היחיד** למידע על מוצר.

אין להחזיק את המידע הזה בקבצי Excel, באתר או בקופה בנפרד.

---

# 76. קטגוריות מוצרים

יש ליצור:

ProductCategories

שדות:

id
name
parent_id
description
sort_order
active
created_at
updated_at

הקטגוריות היררכיות.

לדוגמה:

שילוט
  שילוט פנים
    לוקובונד
  שילוט חוץ

---

# 77. מילון תכונות

המפרט הטכני שונה בין סוגי חומרים.

לוקובונד: עובי במ"מ
נייר: גרם למ"ר
מדבקות: סוג דבק
שמשוניות: צפיפות

אין ליצור עמודה חדשה בכל פעם שמתווסף סוג חומר.

יש ליצור מילון תכונות.

## AttributeDefinitions

id
key
label
attribute_group
data_type
unit
enum_options
applies_to
is_required
is_customer_visible
sort_order
active
created_at
updated_at

attribute_group:

TECHNICAL
PRINT
FINISHING
FINANCIAL
MARKETING
LOGISTICS

data_type:

TEXT
LONG_TEXT
NUMBER
BOOLEAN
ENUM
DATE

applies_to:

PRODUCT
MATERIAL
SUPPLIER

## AttributeValues

id
definition_id
entity_type
entity_id
value_text
value_number
value_boolean
value_date
created_at
updated_at

חשוב:

הערכים נשמרים בעמודות מוקלדות לפי סוג.

אין לשמור מספר כטקסט.

מפרט מספרי חייב להישאר ניתן לסינון ולמיון.

---

# 78. מדיה וקבצים

יש ליצור:

MediaAssets

שדות:

id
entity_type
entity_id
kind
file_path
original_filename
mime_type
size_bytes
width_px
height_px
alt_text
title
is_primary
is_customer_visible
sort_order
created_at
updated_at

kind:

IMAGE
DATASHEET
CERTIFICATE
CONTRACT
SUPPLIER_PRICE_LIST
MOCKUP
OTHER

הקבצים נשמרים בדיסק המקומי של השרת.

לכל מוצר ניתן להגדיר תמונה ראשית וגלריה.

---

# 79. מידע מורחב למוצר

בנוסף לשדות של §19, לכל מוצר:

## זהות

sku
display_name
category_id
lifecycle_status
launched_at
discontinued_at

lifecycle_status:

DRAFT
ACTIVE
DISCONTINUED

הערה:

name הוא השם הפנימי.

display_name הוא השם השיווקי ללקוח.

הם יכולים להיות שונים.

## טכני

min_width_cm
max_width_cm
min_height_cm
max_height_cm
is_outdoor
warranty_months
lead_time_days
file_requirements
care_instructions
production_notes

## כספי

accounting_code
cost_center
vat_category

הערה:

הנתונים הכספיים החיים - עלות רכש נוכחית, תרומה לכל מדרגה, מחיר מומלץ -
אינם נשמרים כשדות.

הם מחושבים על ידי מנוע החישוב של §58 ומוצגים בכרטיס המוצר.

## שיווקי

short_description
long_description
selling_points
use_cases
seo_slug
seo_title
seo_description

## תגיות

Tags

id
name
color

ProductTags

product_id
tag_id

---

# 80. מידע מורחב לספק

בנוסף לשדות של §9:

## כרטיס ספק

address_billing
address_warehouse
quality_rating
lead_time_days
credit_limit
is_preferred
certifications

quality_rating:

1 עד 5

## SupplierContacts

id
supplier_id
name
role
phone
email
notes
is_primary

role:

SALES
SUPPORT
ACCOUNTING
LOGISTICS
OTHER

לספק יכולים להיות כמה אנשי קשר.

## SupplierMaterials

id
supplier_id
material_id
supplier_sku
supplier_product_name
pack_size
pack_unit
lead_time_days
is_preferred
notes
active

חשוב:

זו טבלה נפרדת מ-SupplierMaterialPrices.

המק"ט של הספק אינו אמור להשתכפל בכל שינוי מחיר.

טבלת המחירים היא append-only לפי §17.

---

# 81. ערוצי מכירה וסנכרון

המידע השיווקי צריך להגיע גם לנקודות מכירה:

- אתר אינטרנט
- קופה
- מחירון
- זירות מכירה

הדרישה:

כל המידע יהיה נכון בכל המקומות תמיד.

## SalesChannels

id
name
channel_type
is_active
config
created_at
updated_at

channel_type:

WEBSITE
POS
PRICE_LIST
MARKETPLACE
OTHER

## ProductChannelPublications

id
product_id
channel_id
status
external_id
price_override_incl_vat
published_at
last_synced_at
last_error
payload_hash

status:

NOT_PUBLISHED
PENDING
PUBLISHED
ERROR

## SyncEvents

כל שינוי במידע מוצר יוצר רשומת שינוי.

id
entity_type
entity_id
change_type
payload
created_at
processed_at
error

מבנה זה הוא Outbox.

הסנכרון אינו מתבצע בתוך הבקשה ששינתה את הנתון.

כך ניתן לדעת מה נשלח, מה נכשל ומה ממתין.

## כללים

1. המערכת היא מקור האמת. הערוץ הוא יעד בלבד.
2. אין לקרוא מידע מוצר מהערוץ ולדרוס את המערכת.
3. רק שדות המסומנים is_customer_visible נשלחים לערוץ.
4. עלויות, ספקים, שכר ותרומה לעולם אינם נשלחים לערוץ.
5. חיבור ערוץ אמיתי מתבצע דרך Adapter אחד לכל ערוץ.

בשלב הראשון יש לבנות את המודל, את ה-Outbox ואת ממשק ה-Adapter.

אין לממש חיבור לאתר או לקופה ספציפיים לפני שיוגדרו.

---

# 82. ייצוא קטלוג מוצרים ללקוח

יש לאפשר ייצוא קטלוג מוצרים ללקוח מתוך המערכת.

פורמטים:

PDF
CSV
Excel

הקטלוג יכיל:

- שם שיווקי
- תיאור
- תמונה
- מפרט טכני גלוי ללקוח
- מחירון לפי מדרגות כמות, כולל מע"מ

הקטלוג לא יכיל:

- עלויות
- ספקים
- מק"ט ספק
- חומרי גלם
- שכר
- תרומה
- רווחיות

הסינון מתבצע בשרת ולא בממשק, בהתאם ל-§56.

הקטלוג ניתן לסינון לפי:

- קטגוריה
- תגית
- lifecycle_status
- גרסת מחירון

---

# 83. היקף שלב ראשון

## כלול

- מודל נתונים מאוחד: תמחור + PIM + ערוצים
- מנוע החישוב של §58 ובדיקות §60
- כרטיס מוצר מלא: טכני, כספי, שיווקי, מדיה, ספקים
- קטגוריות, מילון תכונות, תגיות
- כרטיס ספק מורחב, אנשי קשר, קטלוג ספק
- העלאת תמונות וקבצים לדיסק מקומי
- מחשבון תמחור והשוואת ספקים
- הצעות מחיר עם Snapshot
- Outbox וממשק Adapter לערוצים

## לא כלול בשלב הראשון

- חיבור בפועל לאתר או לקופה
- Dashboard של §52
- ייצוא קטלוג ו-PDF של §56 ו-§82
- מלאי של §66
- הזמנות וחשבוניות של §67
