import type { BusinessSettings } from "@jaco/core";
import { prisma, SETTINGS_ID } from "../db.js";

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * §4, §5 — load the one settings row and hand it to the engine.
 *
 * Every business value the engine uses comes from here, which is what makes §70
 * hold: the engine contains no 18, no 59%, no 45, no 227.
 */
export async function loadSettings(): Promise<BusinessSettings> {
  const row = await prisma.businessSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (row === null) {
    throw new NotFoundError("הגדרות העסק לא נמצאו. יש להריץ את ה-seed (§4, §5).");
  }
  return {
    currency: row.currency,
    vatRate: row.vatRate,
    averageSalesInclVat: row.averageSalesInclVat,
    averageWages: row.averageWages,
    employeeHourlyWage: row.employeeHourlyWage,
    employerMultiplier: row.employerMultiplier,
    laborRatioOverride: row.laborRatioOverride,
    minOrderInclVat: row.minOrderInclVat,
    targetContributionMargin: row.targetContributionMargin,
    targetSqmPriceInclVat: row.targetSqmPriceInclVat,
    defaultMaterialCostPerSqm: row.defaultMaterialCostPerSqm,
    defaultPurchaseLotQuantity: row.defaultPurchaseLotQuantity,
    displayRounding: row.displayRounding,
  };
}
