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
