-- Products synced from Shopify (source of truth = Shopify; this is a cache)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,               -- Shopify product GID
  title TEXT NOT NULL,
  handle TEXT,
  image_url TEXT,
  price NUMERIC,
  status TEXT,                       -- active/draft/archived from Shopify
  raw_shopify_data JSONB,            -- full payload for anything we didn't model
  synced_at TIMESTAMPTZ DEFAULT now()
);

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
('body_shape', 'Body Shape', 'Vücut Tipi', true, null,
  ARRAY['Triangle (Üçgen)','Hourglass (Kum Saati)','Circle / Apple (Daire)','Pear (Armut)','Rectangle (Dikdörtgen)']),
('occasion', 'Occasion', 'Venue birleştirildi', true, null,
  ARRAY['Wedding','Brunch','Work','Casual','Gym / Activity','Seaside / Beach','Party','Coachella / Festival','Date','Travel (Tatil)','Everyday']),
('vibe', 'Vibe', 'max 3 tags', true, 3,
  ARRAY['Romantic','Minimal','Bohemian','Edgy','Classic','Glam','Sporty','Whimsical','Sensual','Preppy']),
('skin_tone', 'Flatters Skin Tone', 'Ten Rengi', true, null,
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
