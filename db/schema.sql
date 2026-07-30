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

  -- Legal entity
  legal_company_name        TEXT,                          -- Marka Şirket Ünvanı — collected at Stage 2
  legal_address             TEXT,                          -- Marka Şirket Adresi — collected at Stage 2
  tax_id                    TEXT,                          -- Vergi Kimlik No (VKN) — collected at Stage 2
  tax_office                TEXT,                          -- Vergi Dairesi
  trade_registry_no         TEXT,                          -- Ticaret Sicil No (optional)

  -- Operations
  warehouse_address         TEXT,                          -- Marka Depo Adresi — collected at Stage 4
  avg_processing_days       SMALLINT DEFAULT 2,
  shipping_carrier          TEXT,

  -- Commercial terms
  commission_percentage     NUMERIC(5,2) NOT NULL DEFAULT 40.00,
  payout_frequency          TEXT NOT NULL DEFAULT 'monthly'
                             CHECK (payout_frequency IN ('weekly','biweekly','monthly')),
  contract_signed_date      DATE,
  contract_url              TEXT,

  -- Integration
  shopify_oauth_status      TEXT NOT NULL DEFAULT 'not_connected'
                             CHECK (shopify_oauth_status IN ('not_connected','connected','revoked')),
  shopify_shop_domain       TEXT,
  shopify_access_token_ref  TEXT,                          -- reference/id into secrets store, never raw token

  -- Status & lifecycle
  onboarding_status         TEXT NOT NULL DEFAULT 'pending'
                             CHECK (onboarding_status IN
                                ('pending','under_review','terms_set',
                                 'integration_pending','active','paused',
                                 'suspended','offboarded')),
  live_at                   TIMESTAMPTZ,                   -- when catalogue went live
  notes                     TEXT,                          -- internal notes

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  iban                 TEXT NOT NULL,
  bank_name            TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_bank_accounts_brand_id ON brand_bank_accounts(brand_id);
