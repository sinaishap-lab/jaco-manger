-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('SQM', 'LINEAR_METER', 'UNIT', 'KG', 'LITER', 'HOUR');

-- CreateEnum
CREATE TYPE "PricingMethod" AS ENUM ('SQM', 'LINEAR_METER', 'UNIT', 'KG', 'HOUR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LaborMethod" AS ENUM ('PERCENT', 'HOURLY', 'COMBINED');

-- CreateEnum
CREATE TYPE "ShippingType" AS ENUM ('FLAT', 'PER_QUANTITY', 'FREE_ABOVE', 'BY_WEIGHT', 'BY_AREA');

-- CreateEnum
CREATE TYPE "ShippingAllocation" AS ENUM ('AMORTIZED', 'FULL_ORDER');

-- CreateEnum
CREATE TYPE "AdditionalCostScope" AS ENUM ('FIXED_ORDER', 'VARIABLE_UNIT', 'VARIABLE_AREA');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "AttributeGroup" AS ENUM ('TECHNICAL', 'PRINT', 'FINISHING', 'FINANCIAL', 'MARKETING', 'LOGISTICS');

-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'BOOLEAN', 'ENUM', 'DATE');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PRODUCT', 'MATERIAL', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'DATASHEET', 'CERTIFICATE', 'CONTRACT', 'SUPPLIER_PRICE_LIST', 'MOCKUP', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('SALES', 'SUPPORT', 'ACCOUNTING', 'LOGISTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WEBSITE', 'POS', 'PRICE_LIST', 'MARKETPLACE', 'OTHER');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('NOT_PUBLISHED', 'PENDING', 'PUBLISHED', 'ERROR');

-- CreateEnum
CREATE TYPE "SyncChangeType" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'PRICE_CHANGED', 'MEDIA_CHANGED');

-- CreateTable
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "businessName" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "vatRate" DECIMAL(9,6) NOT NULL,
    "averageSalesInclVat" DECIMAL(18,6) NOT NULL,
    "averageWages" DECIMAL(18,6) NOT NULL,
    "employeeHourlyWage" DECIMAL(18,6) NOT NULL,
    "employerMultiplier" DECIMAL(9,6) NOT NULL,
    "laborRatioOverride" DECIMAL(9,6),
    "minOrderInclVat" DECIMAL(18,6) NOT NULL,
    "targetContributionMargin" DECIMAL(9,6) NOT NULL,
    "targetSqmPriceInclVat" DECIMAL(18,6) NOT NULL,
    "defaultMaterialCostPerSqm" DECIMAL(18,6) NOT NULL,
    "defaultPurchaseLotQuantity" DECIMAL(18,6) NOT NULL,
    "displayRounding" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "taxId" TEXT,
    "paymentTerms" TEXT,
    "deliveryCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "minimumOrderValue" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "shippingType" "ShippingType" NOT NULL DEFAULT 'FLAT',
    "freeShippingThreshold" DECIMAL(18,6),
    "addressBilling" TEXT,
    "addressWarehouse" TEXT,
    "qualityRating" INTEGER,
    "leadTimeDays" INTEGER,
    "creditLimit" DECIMAL(18,6),
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "certifications" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_contacts" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "ContactRole" NOT NULL DEFAULT 'SALES',
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "materialType" TEXT,
    "pricingUnit" "PricingUnit" NOT NULL,
    "defaultSupplierId" TEXT,
    "sku" TEXT,
    "thicknessMm" DECIMAL(9,3),
    "finish" TEXT,
    "color" TEXT,
    "sheetWidthCm" DECIMAL(9,3),
    "sheetHeightCm" DECIMAL(9,3),
    "weightKgPerSqm" DECIMAL(18,6),
    "isPrintable" BOOLEAN NOT NULL DEFAULT true,
    "isOutdoorRated" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_materials" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "supplierProductName" TEXT,
    "packSize" DECIMAL(18,6),
    "packUnit" TEXT,
    "leadTimeDays" INTEGER,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_material_prices" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "unit" "PricingUnit" NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "minimumQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "maximumQuantity" DECIMAL(18,6),
    "deliveryCost" DECIMAL(18,6),
    "shippingType" "ShippingType",
    "freeShippingThreshold" DECIMAL(18,6),
    "purchaseLotQuantity" DECIMAL(18,6),
    "weightKgPerUnit" DECIMAL(18,6),
    "additionalCostPerOrder" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "includesPrinting" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "supersededById" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_material_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "materialId" TEXT,
    "pricingMethod" "PricingMethod" NOT NULL,
    "laborMethod" "LaborMethod" NOT NULL DEFAULT 'PERCENT',
    "basePrice" DECIMAL(18,6),
    "targetMargin" DECIMAL(9,6),
    "minimumOrder" DECIMAL(18,6),
    "setupFee" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "handlingCostPerUnit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "printingCostPerSqm" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "cuttingCostPerUnit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "cuttingHoursPerUnit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "laborHoursPerUnit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "laborFixedCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "sku" TEXT,
    "displayName" TEXT,
    "categoryId" TEXT,
    "lifecycleStatus" "LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "launchedAt" TIMESTAMP(3),
    "discontinuedAt" TIMESTAMP(3),
    "minWidthCm" DECIMAL(9,3),
    "maxWidthCm" DECIMAL(9,3),
    "minHeightCm" DECIMAL(9,3),
    "maxHeightCm" DECIMAL(9,3),
    "isOutdoor" BOOLEAN NOT NULL DEFAULT false,
    "warrantyMonths" INTEGER,
    "leadTimeDays" INTEGER,
    "fileRequirements" TEXT,
    "careInstructions" TEXT,
    "productionNotes" TEXT,
    "accountingCode" TEXT,
    "costCenter" TEXT,
    "vatCategory" TEXT,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "sellingPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "useCases" TEXT,
    "seoSlug" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sizes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widthCm" DECIMAL(9,3) NOT NULL,
    "heightCm" DECIMAL(9,3) NOT NULL,
    "depthCm" DECIMAL(9,3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_versions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quantity_tiers" (
    "id" TEXT NOT NULL,
    "priceListVersionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSizeId" TEXT,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER,
    "unitPriceInclVat" DECIMAL(18,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quantity_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_cost_items" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "scope" "AdditionalCostScope" NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productSizeId" TEXT,
    "productSizeName" TEXT,
    "quantity" INTEGER NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "purchasePrice" DECIMAL(18,6),
    "purchaseUnit" TEXT,
    "shippingCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitPriceInclVat" DECIMAL(18,6) NOT NULL,
    "totalPriceInclVat" DECIMAL(18,6) NOT NULL,
    "totalPriceExVat" DECIMAL(18,6) NOT NULL,
    "materialCost" DECIMAL(18,6) NOT NULL,
    "printingCost" DECIMAL(18,6) NOT NULL,
    "cuttingCost" DECIMAL(18,6) NOT NULL,
    "laborCost" DECIMAL(18,6) NOT NULL,
    "additionalCost" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,6) NOT NULL,
    "contribution" DECIMAL(18,6) NOT NULL,
    "contributionMargin" DECIMAL(9,6) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "attributeGroup" "AttributeGroup" NOT NULL,
    "dataType" "AttributeDataType" NOT NULL,
    "unit" TEXT,
    "enumOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appliesTo" "EntityType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isCustomerVisible" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_values" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,6),
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
    "filePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "altText" TEXT,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isCustomerVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tags" (
    "productId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("productId","tagId")
);

-- CreateTable
CREATE TABLE "sales_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" "ChannelType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_channel_publications" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
    "externalId" TEXT,
    "priceOverrideInclVat" DECIMAL(18,6),
    "publishedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_channel_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_events" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "changeType" "SyncChangeType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_active_idx" ON "suppliers"("active");

-- CreateIndex
CREATE INDEX "supplier_contacts_supplierId_idx" ON "supplier_contacts"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "materials_sku_key" ON "materials"("sku");

-- CreateIndex
CREATE INDEX "materials_active_idx" ON "materials"("active");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_materials_supplierId_materialId_key" ON "supplier_materials"("supplierId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_material_prices_supersededById_key" ON "supplier_material_prices"("supersededById");

-- CreateIndex
CREATE INDEX "supplier_material_prices_materialId_supplierId_validFrom_va_idx" ON "supplier_material_prices"("materialId", "supplierId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "supplier_material_prices_materialId_active_idx" ON "supplier_material_prices"("materialId", "active");

-- CreateIndex
CREATE INDEX "product_categories_parentId_idx" ON "product_categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_seoSlug_key" ON "products"("seoSlug");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_lifecycleStatus_idx" ON "products"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "products_active_idx" ON "products"("active");

-- CreateIndex
CREATE INDEX "product_sizes_productId_active_idx" ON "product_sizes"("productId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "product_sizes_productId_name_key" ON "product_sizes"("productId", "name");

-- CreateIndex
CREATE INDEX "quantity_tiers_priceListVersionId_productId_productSizeId_m_idx" ON "quantity_tiers"("priceListVersionId", "productId", "productSizeId", "minQuantity");

-- CreateIndex
CREATE INDEX "additional_cost_items_productId_active_idx" ON "additional_cost_items"("productId", "active");

-- CreateIndex
CREATE INDEX "quotes_quotedAt_idx" ON "quotes"("quotedAt");

-- CreateIndex
CREATE INDEX "quotes_productId_idx" ON "quotes"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_definitions_key_key" ON "attribute_definitions"("key");

-- CreateIndex
CREATE INDEX "attribute_definitions_appliesTo_attributeGroup_idx" ON "attribute_definitions"("appliesTo", "attributeGroup");

-- CreateIndex
CREATE INDEX "attribute_values_entityType_entityId_idx" ON "attribute_values"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "attribute_values_definitionId_valueNumber_idx" ON "attribute_values"("definitionId", "valueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_values_definitionId_entityType_entityId_key" ON "attribute_values"("definitionId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "media_assets_entityType_entityId_kind_idx" ON "media_assets"("entityType", "entityId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "product_channel_publications_channelId_status_idx" ON "product_channel_publications"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_channel_publications_productId_channelId_key" ON "product_channel_publications"("productId", "channelId");

-- CreateIndex
CREATE INDEX "sync_events_processedAt_createdAt_idx" ON "sync_events"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "sync_events_entityType_entityId_idx" ON "sync_events"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_materials" ADD CONSTRAINT "supplier_materials_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_materials" ADD CONSTRAINT "supplier_materials_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_material_prices" ADD CONSTRAINT "supplier_material_prices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_material_prices" ADD CONSTRAINT "supplier_material_prices_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_material_prices" ADD CONSTRAINT "supplier_material_prices_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "supplier_material_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_tiers" ADD CONSTRAINT "quantity_tiers_priceListVersionId_fkey" FOREIGN KEY ("priceListVersionId") REFERENCES "price_list_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_tiers" ADD CONSTRAINT "quantity_tiers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_cost_items" ADD CONSTRAINT "additional_cost_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "attribute_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channel_publications" ADD CONSTRAINT "product_channel_publications_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channel_publications" ADD CONSTRAINT "product_channel_publications_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
