-- Integrity rules the ORM cannot express. Each one guards a requirement in /SPEC.md.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- §4: business_settings is a single row.
ALTER TABLE "business_settings"
  ADD CONSTRAINT "business_settings_singleton" CHECK (id = 'singleton');

-- §5/§32: a zero or negative VAT divisor would break price_ex_vat.
ALTER TABLE "business_settings"
  ADD CONSTRAINT "business_settings_vat_rate_sane" CHECK ("vatRate" > -100),
  ADD CONSTRAINT "business_settings_positive_inputs" CHECK (
    "averageSalesInclVat" > 0 AND
    "averageWages" >= 0 AND
    "employeeHourlyWage" >= 0 AND
    "employerMultiplier" > 0 AND
    "minOrderInclVat" >= 0 AND
    "defaultPurchaseLotQuantity" > 0
  ),
  ADD CONSTRAINT "business_settings_rounding_range" CHECK ("displayRounding" BETWEEN 0 AND 6);

-- §80: quality_rating is 1..5.
ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_quality_rating_range"
  CHECK ("qualityRating" IS NULL OR "qualityRating" BETWEEN 1 AND 5);

-- §13: a supplier price tier must be a valid, non-negative range.
ALTER TABLE "supplier_material_prices"
  ADD CONSTRAINT "smp_unit_price_non_negative" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "smp_quantity_range_valid" CHECK (
    "minimumQuantity" >= 0 AND
    ("maximumQuantity" IS NULL OR "maximumQuantity" >= "minimumQuantity")
  ),
  ADD CONSTRAINT "smp_lot_positive" CHECK (
    "purchaseLotQuantity" IS NULL OR "purchaseLotQuantity" > 0
  ),
  -- §17: a validity window must not end before it starts.
  ADD CONSTRAINT "smp_validity_window_valid" CHECK (
    "validUntil" IS NULL OR "validUntil" > "validFrom"
  );

-- §17: at most one price row in force per supplier/material/tier at a time.
-- "In force" means validUntil IS NULL. History rows are closed and unconstrained.
CREATE UNIQUE INDEX "smp_one_open_row_per_tier"
  ON "supplier_material_prices" ("supplierId", "materialId", "minimumQuantity")
  WHERE "validUntil" IS NULL AND "active" = true;

-- §22: a size must have positive dimensions, or area is meaningless.
ALTER TABLE "product_sizes"
  ADD CONSTRAINT "product_sizes_positive_dimensions" CHECK (
    "widthCm" > 0 AND "heightCm" > 0 AND ("depthCm" IS NULL OR "depthCm" >= 0)
  );

-- §79: declared size envelope must not be inverted.
ALTER TABLE "products"
  ADD CONSTRAINT "products_size_envelope_valid" CHECK (
    ("minWidthCm"  IS NULL OR "maxWidthCm"  IS NULL OR "maxWidthCm"  >= "minWidthCm") AND
    ("minHeightCm" IS NULL OR "maxHeightCm" IS NULL OR "maxHeightCm" >= "minHeightCm")
  ),
  ADD CONSTRAINT "products_target_margin_range" CHECK (
    "targetMargin" IS NULL OR ("targetMargin" >= 0 AND "targetMargin" < 1)
  );

-- §55 + C8: exactly one price list version may be active.
CREATE UNIQUE INDEX "price_list_versions_single_active"
  ON "price_list_versions" ((true)) WHERE "isActive" = true;

-- §24 + C3: quantity tiers must be a valid range starting at 1 or above.
ALTER TABLE "quantity_tiers"
  ADD CONSTRAINT "quantity_tiers_range_valid" CHECK (
    "minQuantity" >= 1 AND
    ("maxQuantity" IS NULL OR "maxQuantity" >= "minQuantity")
  ),
  ADD CONSTRAINT "quantity_tiers_price_non_negative" CHECK ("unitPriceInclVat" >= 0);

-- §24 + C3: tiers for one product/size within one price list may NOT overlap.
-- This is what makes the SPEC's "201-300" + "300+" collision impossible:
-- 300 can belong to exactly one tier, so the last tier must start at 301.
-- COALESCE maps the null size to a sentinel so sizeless tiers are compared together.
ALTER TABLE "quantity_tiers"
  ADD CONSTRAINT "quantity_tiers_no_overlap" EXCLUDE USING gist (
    "priceListVersionId" WITH =,
    "productId" WITH =,
    COALESCE("productSizeId", '00000000-0000-0000-0000-000000000000') WITH =,
    int4range("minQuantity", COALESCE("maxQuantity" + 1, 2147483647)) WITH &&
  ) WHERE ("active" = true);

-- §37: costs are non-negative amounts.
ALTER TABLE "additional_cost_items"
  ADD CONSTRAINT "additional_cost_items_non_negative" CHECK ("amount" >= 0);

-- §77: an attribute value must actually carry a value.
ALTER TABLE "attribute_values"
  ADD CONSTRAINT "attribute_values_has_value" CHECK (
    "valueText" IS NOT NULL OR
    "valueNumber" IS NOT NULL OR
    "valueBoolean" IS NOT NULL OR
    "valueDate" IS NOT NULL
  );

-- §78: at most one primary asset of a kind per entity.
CREATE UNIQUE INDEX "media_assets_single_primary"
  ON "media_assets" ("entityType", "entityId", "kind") WHERE "isPrimary" = true;

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_size_non_negative" CHECK ("sizeBytes" >= 0);

-- §76: a category may not be its own parent.
ALTER TABLE "product_categories"
  ADD CONSTRAINT "product_categories_no_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> id);
