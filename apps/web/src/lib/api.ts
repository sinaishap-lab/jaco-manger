/**
 * API client. Carries the §57 role header on every request.
 *
 * Monetary values arrive as strings and stay strings here. Parsing them into JS
 * numbers in the UI would reintroduce exactly the float error §59 forbids, so
 * formatting is done on the string by `lib/format.ts`.
 */
export type Role = "ADMIN" | "USER";

const ROLE_KEY = "jaco.role";

export function getRole(): Role {
  try {
    return localStorage.getItem(ROLE_KEY) === "ADMIN" ? "ADMIN" : "USER";
  } catch {
    return "USER";
  }
}

export function setRole(role: Role): void {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    /* private mode — the server still enforces the rule, so this is cosmetic */
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "X-Role": getRole(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null as T;

  const text = await res.text();
  const payload: unknown = text === "" ? null : JSON.parse(text);

  if (!res.ok) {
    const p = payload as { error?: string; details?: Array<{ path: string; message: string }> } | null;
    throw new ApiError(res.status, p?.error ?? `שגיאה ${res.status}`, p?.details);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

// ───────────────────── response shapes ─────────────────────
// Decimals are strings (§59).

export interface Warning {
  code: string;
  message: string;
  spec?: string[];
}

export interface QuoteResultDto {
  quantity: number;
  areaPerUnit: string | null;
  totalArea: string | null;
  supplier?: {
    supplierId: string;
    supplierName: string;
    unitPrice: string;
    effectiveUnitCost: string;
    purchaseQuantity: string;
    purchaseLotQuantity: string | null;
    shippingCostFull: string;
    shippingCharged: string;
    additionalCostCharged: string;
    effectivePurchaseCost: string;
    includesPrinting: boolean;
    allocation: string;
    tierMinimumQuantity: string;
    tierMaximumQuantity: string | null;
  } | null;
  purchasePrice?: string | null;
  shippingCost?: string;
  effectivePurchaseCost?: string | null;
  unitPriceInclVat: string;
  totalPriceInclVat: string;
  totalPriceExVat: string;
  materialCost?: string;
  printingCost?: string;
  cuttingCost?: string;
  laborCost?: string;
  additionalCost?: string;
  totalCost?: string;
  contribution?: string;
  contributionMargin?: string;
  effectivePricePerSqmInclVat: string | null;
  effectivePricePerSqmExVat: string | null;
  warnings: Warning[];
  measure: {
    pricingMethod: string;
    measurePerUnit: string;
    measureUnit: string;
    totalMeasure: string;
    areaSqmPerUnit: string | null;
    totalAreaSqm: string | null;
  };
  tier: { minQuantity: number; maxQuantity: number | null; unitPriceInclVat: string } | null;
  derivedSettings?: {
    vatMultiplier: string;
    averageSalesExVat: string;
    laborRatio: string;
    laborRatioSource: string;
    employeeCostPerHour: string;
  };
  breakdown?: Record<string, string>;
  minimumOrderApplied: boolean;
  shippingAllocation: string;
  engineVersion: string;
}

export interface RecommendDto {
  recommendedPriceInclVat: string;
  recommendedUnitPriceInclVat: string;
  recommendedPriceExVat: string;
  drivenBy: "MARGIN_TARGET" | "MINIMUM_ORDER" | "TARGET_SQM_PRICE";
  targetMargin: string;
  fixedCosts: string;
  priceDependentRatio: string;
  quoteAtRecommendedPrice: QuoteResultDto | null;
  warnings: Warning[];
}

export interface ComparisonDto {
  material: { id: string; name: string; pricingUnit: string };
  quantity: string;
  rows: Array<{
    supplierId: string;
    supplierName: string;
    unitPrice: string;
    tierMinimumQuantity: string;
    tierMaximumQuantity: string | null;
    shippingCostFull: string;
    shippingCharged: string;
    additionalCostCharged: string;
    materialCost: string;
    effectivePurchaseCost: string;
    effectiveCostPerUnit: string | null;
    isCheapest: boolean;
    meetsMinimum: boolean;
    includesPrinting: boolean;
    warnings: Warning[];
  }>;
  warnings: Warning[];
}

export interface ProductListItem {
  id: string;
  name: string;
  displayName: string | null;
  sku: string | null;
  pricingMethod: string;
  lifecycleStatus: string;
  category: { id: string; name: string } | null;
  material: { id: string; name: string; pricingUnit: string } | null;
  tags: Array<{ tag: { id: string; name: string; color: string | null } }>;
  primaryImage: { filePath: string; altText: string | null } | null;
  _count: { sizes: number; quantityTiers: number };
}

export interface SizeDto {
  id: string;
  name: string;
  widthCm: string;
  heightCm: string;
  depthCm: string | null;
  areaSqm: string;
  sortOrder: number;
}

export interface AttributeValueDto {
  definitionId: string;
  key: string;
  label: string;
  group: string;
  dataType: string;
  unit: string | null;
  isCustomerVisible: boolean;
  value: string | number | boolean | null;
}

export interface MediaDto {
  id: string;
  kind: string;
  filePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  title: string | null;
  isPrimary: boolean;
  isCustomerVisible: boolean;
}

export interface ProductDetailDto extends ProductListItem {
  materialId: string | null;
  laborMethod: string;
  targetMargin?: string | null;
  minimumOrder: string | null;
  setupFee?: string;
  handlingCostPerUnit?: string;
  printingCostPerSqm?: string;
  cuttingCostPerUnit?: string;
  cuttingHoursPerUnit?: string;
  laborHoursPerUnit?: string;
  laborFixedCost?: string;
  launchedAt: string | null;
  discontinuedAt: string | null;
  minWidthCm: string | null;
  maxWidthCm: string | null;
  minHeightCm: string | null;
  maxHeightCm: string | null;
  isOutdoor: boolean;
  warrantyMonths: number | null;
  leadTimeDays: number | null;
  fileRequirements: string | null;
  careInstructions: string | null;
  productionNotes: string | null;
  accountingCode: string | null;
  costCenter: string | null;
  vatCategory: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  sellingPoints: string[];
  useCases: string | null;
  seoSlug: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  notes: string | null;
  sizes: SizeDto[];
  additionalCosts?: Array<{ id: string; name: string; scope: string; amount: string; active: boolean }>;
  attributes: AttributeValueDto[];
  media: MediaDto[];
  publications: Array<{
    id: string;
    status: string;
    externalId: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
    channel: { id: string; name: string; channelType: string; isActive: boolean };
  }>;
}

export interface SupplierDto {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  paymentTerms: string | null;
  deliveryCost: string;
  minimumOrderValue: string;
  shippingType: string;
  freeShippingThreshold: string | null;
  addressBilling: string | null;
  addressWarehouse: string | null;
  qualityRating: number | null;
  leadTimeDays: number | null;
  creditLimit: string | null;
  isPreferred: boolean;
  certifications: string | null;
  active: boolean;
  notes: string | null;
  contacts: Array<{
    id: string; name: string; role: string;
    phone: string | null; email: string | null; notes: string | null; isPrimary: boolean;
  }>;
  catalogEntries?: Array<{
    id: string; supplierSku: string | null; supplierProductName: string | null;
    packSize: string | null; packUnit: string | null; leadTimeDays: number | null;
    material: { id: string; name: string; pricingUnit: string };
  }>;
  _count?: { materialPrices: number; catalogEntries: number };
}

export interface MaterialDto {
  id: string;
  name: string;
  materialType: string | null;
  pricingUnit: string;
  sku: string | null;
  thicknessMm: string | null;
  finish: string | null;
  color: string | null;
  sheetWidthCm: string | null;
  sheetHeightCm: string | null;
  weightKgPerSqm: string | null;
  isPrintable: boolean;
  isOutdoorRated: boolean;
  active: boolean;
  notes: string | null;
  defaultSupplier: { id: string; name: string } | null;
  _count?: { prices: number; products: number };
  attributes?: AttributeValueDto[];
  media?: MediaDto[];
  catalogEntries?: Array<{
    supplierSku: string | null; supplierProductName: string | null;
    supplier: { id: string; name: string };
  }>;
}

export interface PriceRowDto {
  id: string;
  supplierId: string;
  unit: string;
  unitPrice: string;
  currency: string;
  minimumQuantity: string;
  maximumQuantity: string | null;
  deliveryCost: string | null;
  shippingType: string | null;
  purchaseLotQuantity: string | null;
  additionalCostPerOrder: string;
  includesPrinting: boolean;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  notes: string | null;
  supplier: { id: string; name: string };
}

export interface SettingsDto {
  businessName: string;
  currency: string;
  vatRate: string;
  averageSalesInclVat: string;
  averageWages: string;
  employeeHourlyWage: string;
  employerMultiplier: string;
  laborRatioOverride: string | null;
  minOrderInclVat: string;
  targetContributionMargin: string;
  targetSqmPriceInclVat: string;
  defaultMaterialCostPerSqm: string;
  defaultPurchaseLotQuantity: string;
  displayRounding: number;
  derived: {
    vatMultiplier: string;
    averageSalesExVat: string;
    laborRatio: string;
    laborRatioSource: string;
    employeeCostPerHour: string;
  };
}

export interface PriceListDto {
  id: string;
  name: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  _count: { tiers: number };
}

export interface TierDto {
  id: string;
  productId: string;
  productSizeId: string | null;
  minQuantity: number;
  maxQuantity: number | null;
  unitPriceInclVat: string;
  active: boolean;
}

export interface QuoteRowDto {
  id: string;
  quotedAt: string;
  productName: string;
  productSizeName: string | null;
  quantity: number;
  supplierName: string | null;
  unitPriceInclVat: string;
  totalPriceInclVat: string;
  totalPriceExVat: string;
  totalCost?: string;
  contribution?: string;
  contributionMargin?: string;
  engineVersion: string;
  notes: string | null;
}
