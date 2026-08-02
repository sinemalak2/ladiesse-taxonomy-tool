-- Products synced from Shopify (source of truth = Shopify; this is a cache)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,               -- Shopify product GID
  title TEXT NOT NULL,
  handle TEXT,
  image_url TEXT,
  price NUMERIC,
  status TEXT,                       -- active/draft/archived from Shopify
  raw_shopify_data JSONB,            -- full payload for anything we didn't model
  synced_at TIMESTAMPTZ DEFAULT now(),
  marked_for_removal BOOLEAN NOT NULL DEFAULT false
);

-- ADD COLUMN IF NOT EXISTS so this is safe to re-run against a database that
-- already has the products table from before this column existed.
ALTER TABLE products ADD COLUMN IF NOT EXISTS marked_for_removal BOOLEAN NOT NULL DEFAULT false;

-- Category config (so new taxonomy values can be added without a migration)
CREATE TABLE IF NOT EXISTS tag_categories (
  key TEXT PRIMARY KEY,               -- e.g. 'body_shape'
  label TEXT NOT NULL,
  sub_label TEXT,
  is_multi BOOLEAN DEFAULT true,
  max_tags INT,                       -- null = unlimited
  values TEXT[] NOT NULL DEFAULT '{}'
);

-- The actual tags per product per category
CREATE TABLE IF NOT EXISTS product_tags (
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  category_key TEXT REFERENCES tag_categories(key),
  values TEXT[] NOT NULL DEFAULT '{}',
  tagged_by TEXT,                     -- 'Ipek' | 'Sino'
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, category_key)
);

-- Freeform stylist notes, one per product
CREATE TABLE IF NOT EXISTS product_notes (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO tag_categories (key, label, sub_label, is_multi, max_tags, values) VALUES
('body_shape', 'Body Shape', 'Body Type', true, null,
  ARRAY['Triangle','Hourglass','Circle / Apple','Pear','Rectangle']),
('occasion', 'Occasion', 'Venue merged in', true, null,
  ARRAY['Wedding','Brunch','Work','Casual','Gym / Activity','Seaside / Beach','Party','Coachella / Festival','Date','Travel','Everyday']),
('vibe', 'Vibe', 'max 3 tags', true, 3,
  ARRAY['Romantic','Minimal','Bohemian','Edgy','Classic','Glam','Sporty','Whimsical','Sensual','Preppy']),
('skin_tone', 'Flatters Skin Tone', 'Skin Tone', true, null,
  ARRAY['Fair / Light','Medium / Olive','Tan','Deep / Dark'])
ON CONFLICT (key) DO NOTHING;

-- Stage 2: raw normalized events from GA4's BigQuery export, our source of
-- truth for behavior (separate from GA4's own storage).
-- product_id is intentionally NOT a foreign key to products(id): GA4 retains
-- historical events for products that later get archived and pruned from
-- products (see scripts/prune-archived-products.js), so an FK here would
-- reject real, valid historical events the moment their product is
-- discontinued. lib/affinity.js already treats an unresolvable product_id
-- as "no tags" (contributes nothing) rather than erroring.
CREATE TABLE IF NOT EXISTS user_events (
  id BIGSERIAL PRIMARY KEY,
  user_key TEXT NOT NULL,          -- user_id if logged in, else user_pseudo_id
  is_identified BOOLEAN DEFAULT false,
  product_id TEXT,
  event_type TEXT NOT NULL,        -- 'view' | 'add_to_cart' | 'purchase' | 'search'
  search_query TEXT,               -- populated only for 'search' events
  occurred_at TIMESTAMPTZ NOT NULL,
  inserted_at TIMESTAMPTZ DEFAULT now()
);

-- Dedupe guard for re-running ingestion. Uses COALESCE rather than a plain
-- UNIQUE(...) table constraint because Postgres treats NULLs as distinct in
-- unique constraints — search events have a NULL product_id, so a bare
-- constraint would silently let re-ingested search rows duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS user_events_dedupe_idx ON user_events (
  user_key, COALESCE(product_id, ''), event_type, occurred_at, COALESCE(search_query, '')
);

-- Aggregated, query-time-ready affinity scores (see lib/affinity.js).
-- Repopulated wholesale by scripts/aggregate-affinity.js on each nightly run
-- rather than upserted-in-place, so attribute values that age out of the
-- rolling window don't linger as stale rows.
CREATE TABLE IF NOT EXISTS user_attribute_affinity (
  user_key TEXT NOT NULL,
  category_key TEXT NOT NULL REFERENCES tag_categories(key),
  attribute_value TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,   -- normalized 0-1 within (user_key, category_key)
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_key, category_key, attribute_value)
);

-- Brand onboarding: replaces the "Marka İletişim Bilgisi" Google Form as the
-- source of truth for brand data (see utils/VendorSheet.js in
-- ladiesse-market-place-orders for the sheet it's replacing). That repo
-- cross-reads brands by id for order attribution — expose a read-only
-- brands_public view (excluding tax_id/bank fields) for it rather than
-- granting it direct table access.
CREATE TABLE IF NOT EXISTS brands (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity / display
  brand_name                TEXT NOT NULL,
  slug                      TEXT UNIQUE NOT NULL,          -- for storefront URLs
  category                  TEXT,                          -- e.g. 'ready-to-wear', 'accessories'
  website_url               TEXT,
  instagram_handle          TEXT,
  country                   TEXT NOT NULL DEFAULT 'TR'
                             CHECK (country IN ('TR','US')), -- drives which tax ID / bank fields apply

  -- Legal entity
  legal_company_name        TEXT,                          -- Marka Şirket Ünvanı — collected at Stage 2
  legal_address             TEXT,                          -- Marka Şirket Adresi — collected at Stage 2
  tax_id                    TEXT,                          -- VKN/TCKN (TR) or EIN (US) — collected at Stage 2
  tax_office                TEXT,                          -- Vergi Dairesi — TR only
  trade_registry_no         TEXT,                          -- Ticaret Sicil No (optional) — TR only

  -- Operations
  warehouse_address         TEXT,                          -- Marka Depo Adresi — collected at Stage 4
  avg_processing_days       SMALLINT DEFAULT 2,
  shipping_carrier          TEXT,

  -- Commercial terms
  commission_percentage     NUMERIC(5,2) NOT NULL DEFAULT 40.00
                             CHECK (commission_percentage = 40.00), -- fixed platform-wide, not brand-negotiable
  payout_frequency          TEXT NOT NULL DEFAULT 'monthly'
                             CHECK (payout_frequency IN ('weekly','biweekly','monthly')),
  contract_signed_date      DATE,                          -- DEPRECATED: superseded by brand_contracts.signed_at
  contract_url              TEXT,                          -- DEPRECATED: superseded by brand_contracts.pdf_url

  -- Integration
  -- DEPRECATED: the three columns below are superseded by brand_platform_connections
  -- (per-brand OAuth, added for the onboarding wizard). Left in place, unused by new code.
  shopify_oauth_status      TEXT NOT NULL DEFAULT 'not_connected'
                             CHECK (shopify_oauth_status IN ('not_connected','connected','revoked')),
  shopify_shop_domain       TEXT,
  shopify_access_token_ref  TEXT,                          -- reference/id into secrets store, never raw token

  -- Status & lifecycle
  onboarding_status         TEXT NOT NULL DEFAULT 'pending'
                             CHECK (onboarding_status IN
                                ('pending','under_review','terms_set','contract_generated',
                                 'contract_signed','platform_connected','syncing_products',
                                 'active','paused','suspended','offboarded')),
  onboarding_token          TEXT UNIQUE,                   -- brand-facing wizard magic-link token
  current_step              SMALLINT NOT NULL DEFAULT 1,   -- wizard progress, 1-10
  live_at                   TIMESTAMPTZ,                   -- when catalogue went live
  notes                     TEXT,                          -- internal notes

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ADD COLUMN IF NOT EXISTS so this is safe to re-run against a database that
-- already had `brands` from before the onboarding wizard existed.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS onboarding_token TEXT UNIQUE;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS current_step SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'TR';

ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_country_check;
ALTER TABLE brands ADD CONSTRAINT brands_country_check CHECK (country IN ('TR','US'));

-- Commission is fixed platform-wide at 40%, not something brands negotiate
-- individually — enforced here (not just in the API) so it can't drift via
-- any future write path. Both existing rows are already 40.00.
ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_commission_percentage_check;
ALTER TABLE brands ADD CONSTRAINT brands_commission_percentage_check
  CHECK (commission_percentage = 40.00);

-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS` — drop-then-add is the
-- idempotent pattern, needed because this file re-runs in full on every
-- `npm run migrate`. 'integration_pending' is dropped from the allowed set
-- (superseded by the wizard's more granular statuses); confirm no row still
-- has it before deploying this against prod.
ALTER TABLE brands DROP CONSTRAINT IF EXISTS brands_onboarding_status_check;
ALTER TABLE brands ADD CONSTRAINT brands_onboarding_status_check
  CHECK (onboarding_status IN (
    'pending','under_review','terms_set','contract_generated',
    'contract_signed','platform_connected','syncing_products',
    'active','paused','suspended','offboarded'
  ));

-- One or more reps per brand (billing contact separate from primary, etc).
CREATE TABLE IF NOT EXISTS brand_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  full_name       TEXT NOT NULL,              -- Marka Temsilci Adı Soyadı
  phone_number    TEXT NOT NULL,              -- Marka Temsilci Telefon Numarası (incl. country code)
  email           TEXT,
  role            TEXT NOT NULL DEFAULT 'primary'
                  CHECK (role IN ('primary','billing','operations','other')),
  is_primary      BOOLEAN NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_contacts_brand_id ON brand_contacts(brand_id);

-- Payout info, isolated from brands into its own table so it's not sitting
-- in the same wide row as public-facing brand data (security/auditability).
-- Collected at Stage 2; empty until then.
CREATE TABLE IF NOT EXISTS brand_bank_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  account_holder_name  TEXT NOT NULL,
  iban                 TEXT,                                -- TR brands
  routing_number       TEXT,                                -- US brands (ABA routing number)
  account_number       TEXT,                                -- US brands
  bank_name            TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT brand_bank_accounts_has_payout_method
    CHECK (iban IS NOT NULL OR (routing_number IS NOT NULL AND account_number IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_brand_bank_accounts_brand_id ON brand_bank_accounts(brand_id);

-- ADD COLUMN IF NOT EXISTS + relax NOT NULL so this is safe to re-run
-- against a database that already had this table with iban as required
-- (from before US brands were supported).
ALTER TABLE brand_bank_accounts ALTER COLUMN iban DROP NOT NULL;
ALTER TABLE brand_bank_accounts ADD COLUMN IF NOT EXISTS routing_number TEXT;
ALTER TABLE brand_bank_accounts ADD COLUMN IF NOT EXISTS account_number TEXT;

ALTER TABLE brand_bank_accounts DROP CONSTRAINT IF EXISTS brand_bank_accounts_has_payout_method;
ALTER TABLE brand_bank_accounts ADD CONSTRAINT brand_bank_accounts_has_payout_method
  CHECK (iban IS NOT NULL OR (routing_number IS NOT NULL AND account_number IS NOT NULL));

-- Onboarding wizard: one row per generated contract. Signed rows are never
-- UPDATEd (only pdf_url is added after the fact) — renegotiation means
-- voiding this row and inserting a fresh one, so there's a full audit trail
-- of exactly what language a brand agreed to at any point in time.
CREATE TABLE IF NOT EXISTS brand_contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  contract_html     TEXT NOT NULL,               -- snapshot at generation time, never re-rendered from live data
  pdf_url           TEXT,                        -- populated once PDF generation is wired up

  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','signed','voided')),

  signed_at         TIMESTAMPTZ,
  signed_by_name    TEXT,                        -- typed full legal name at signing
  signed_ip         TEXT,
  signed_user_agent TEXT,

  voided_at         TIMESTAMPTZ,
  voided_reason     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_contracts_brand_id ON brand_contracts(brand_id);

-- Onboarding wizard: per-brand e-commerce platform connections. Shopify only
-- for now (see the platform CHECK), architected to extend to other
-- platforms later without a schema change beyond widening that CHECK.
CREATE TABLE IF NOT EXISTS brand_platform_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  platform         TEXT NOT NULL DEFAULT 'shopify'
                   CHECK (platform IN ('shopify')),

  shop_domain      TEXT NOT NULL,
  access_token_ref TEXT NOT NULL,                -- AES-256-GCM ciphertext, never a raw token
  scope            TEXT,                         -- comma-separated scopes Shopify granted
  currency         TEXT,                         -- this store's currencyCode, queried at connect time — drives price conversion on import

  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','revoked')),
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,

  UNIQUE (brand_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_brand_platform_connections_brand_id ON brand_platform_connections(brand_id);

ALTER TABLE brand_platform_connections ADD COLUMN IF NOT EXISTS currency TEXT;

-- Onboarding wizard: brand product catalogue synced from their own Shopify
-- store. Deliberately separate from the top-level `products` table (Ladiesse's
-- own store cache, TEXT PK on Shopify GID) — these are structurally
-- different (per-brand, UUID PK) and would collide on the name `products`.
CREATE TABLE IF NOT EXISTS brand_products (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id               UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform_connection_id UUID REFERENCES brand_platform_connections(id) ON DELETE SET NULL,

  shopify_product_gid    TEXT NOT NULL,
  title                  TEXT NOT NULL,
  body_html              TEXT,
  handle                 TEXT,
  product_type           TEXT,
  vendor                 TEXT,
  status                 TEXT,
  options                JSONB,                  -- [{name:'Size', values:['S','M']}] — option definitions, needed to rebuild variants on import
  image_urls             JSONB,                  -- all product images, ordered — needed to rebuild the product-level `files` list on import
  tags                   JSONB,                  -- ['tag1','tag2'] — carried through verbatim to the imported la-diesse product
  category_gid           TEXT,                   -- Shopify's Standard Product Taxonomy node ID — canonical/shared across all shops, so reusable as-is on import
  category_name          TEXT,                   -- human-readable, for display only
  metafields             JSONB,                   -- [{namespace,key,value,type}] — the brand's own custom fields, carried through on import
  raw_shopify_data       JSONB,
  synced_at              TIMESTAMPTZ DEFAULT now(),

  -- Push-to-la-diesse.myshopify.com import tracking — lets re-imports update
  -- the existing product instead of creating a duplicate every sync.
  imported_shopify_product_gid TEXT,
  imported_at                  TIMESTAMPTZ,

  UNIQUE (brand_id, shopify_product_gid)
);

CREATE INDEX IF NOT EXISTS idx_brand_products_brand_id ON brand_products(brand_id);

ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS image_urls JSONB;
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS category_gid TEXT;
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS category_name TEXT;
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS metafields JSONB;
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS imported_shopify_product_gid TEXT;
ALTER TABLE brand_products ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS brand_product_variants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_product_id    UUID NOT NULL REFERENCES brand_products(id) ON DELETE CASCADE,

  shopify_variant_gid TEXT NOT NULL,
  title               TEXT,
  sku                 TEXT,
  price               NUMERIC,
  compare_at_price    NUMERIC,
  inventory_quantity  INT DEFAULT 0,
  inventory_item_gid  TEXT,                      -- for matching inventory_levels/update webhooks
  image_url           TEXT,
  option_values       JSONB,                     -- [{name:'Size', value:'M'}, {name:'Color', value:'Black'}]
  weight_value        NUMERIC,                   -- for real shipping-rate calculation on import
  weight_unit         TEXT,                      -- e.g. 'GRAMS', 'KILOGRAMS', 'POUNDS', 'OUNCES'

  imported_shopify_variant_gid TEXT,

  UNIQUE (brand_product_id, shopify_variant_gid)
);

CREATE INDEX IF NOT EXISTS idx_brand_product_variants_brand_product_id ON brand_product_variants(brand_product_id);

ALTER TABLE brand_product_variants ADD COLUMN IF NOT EXISTS option_values JSONB;
ALTER TABLE brand_product_variants ADD COLUMN IF NOT EXISTS weight_value NUMERIC;
ALTER TABLE brand_product_variants ADD COLUMN IF NOT EXISTS weight_unit TEXT;
ALTER TABLE brand_product_variants ADD COLUMN IF NOT EXISTS imported_shopify_variant_gid TEXT;

-- Onboarding wizard: audit log for each product sync attempt (initial sync
-- at Step 9, plus any later manual/cron re-syncs).
CREATE TABLE IF NOT EXISTS product_sync_jobs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id               UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform_connection_id UUID REFERENCES brand_platform_connections(id) ON DELETE SET NULL,

  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','running','completed','failed')),
  triggered_by           TEXT NOT NULL DEFAULT 'wizard'
                         CHECK (triggered_by IN ('wizard','webhook','manual','cron')),

  products_created       INT DEFAULT 0,
  products_updated       INT DEFAULT 0,
  products_unchanged     INT DEFAULT 0,
  error_message          TEXT,

  started_at             TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_sync_jobs_brand_id ON product_sync_jobs(brand_id);

-- Audit log for pushing a brand's synced catalogue INTO la-diesse.myshopify.com
-- as draft products (vendor = brand name). Distinct from product_sync_jobs
-- (which tracks pulling FROM the brand's own store into our DB) since the
-- two steps have entirely different failure domains — a brand's token being
-- revoked breaks the pull, while an la-diesse-side or FX-lookup problem
-- breaks only the push.
CREATE TABLE IF NOT EXISTS product_import_jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','completed','failed')),
  triggered_by       TEXT NOT NULL DEFAULT 'wizard'
                     CHECK (triggered_by IN ('wizard','manual','cron')),

  products_created   INT DEFAULT 0,
  products_updated   INT DEFAULT 0,

  -- Recorded once per job (the rate is fetched once, not per product) so
  -- it's auditable after the fact which rate a given import actually used.
  fx_from_currency   TEXT,
  fx_to_currency     TEXT,
  fx_rate            NUMERIC,
  fx_fetched_at      TIMESTAMPTZ,

  error_message      TEXT,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Superseded — lib/brandProductImport.js was briefly wired to push into
-- la-diesse.myshopify.com via a self-installed App B (per-brand OAuth app)
-- token stored here, requiring a one-time staff OAuth consent click. That
-- turned out to be unnecessary complexity: la-diesse is a store WE own, so
-- pushing into it now uses App A's existing client-credentials grant
-- (lib/shopify.js) instead — no OAuth consent, no Partners distribution
-- method needed. Kept, not dropped, in case any row was ever written; no
-- code path reads from it anymore.
CREATE TABLE IF NOT EXISTS ladiesse_shopify_connection (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain      TEXT NOT NULL,
  access_token_ref TEXT NOT NULL,                -- AES-256-GCM ciphertext, never a raw token
  scope            TEXT,

  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','revoked')),
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_product_import_jobs_brand_id ON product_import_jobs(brand_id);
