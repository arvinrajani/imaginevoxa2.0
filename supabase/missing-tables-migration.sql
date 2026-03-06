-- =============================================================================
-- MIGRATION: Add missing tables and columns
-- Run this in Supabase SQL Editor
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Create companies table (required before brands.company_id FK)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  logo_url      TEXT        NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_owner_company UNIQUE (owner_user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add company_id to brands (if missing)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE brands ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix brand_kits – add is_active column (currently missing; queries → 400)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create products table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT        NULL,
  sku         TEXT        NULL,
  price       NUMERIC     NULL,
  image_url   TEXT        NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_brand_id_idx ON products(brand_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Create brand_assets table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_assets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  kind           TEXT        NOT NULL DEFAULT 'logo',   -- 'logo' | 'banner' | 'icon' | etc.
  is_primary     BOOLEAN     NOT NULL DEFAULT false,
  image_asset_id UUID        REFERENCES image_assets(id) ON DELETE SET NULL,
  file_url       TEXT        NULL,
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_assets_brand_id_idx ON brand_assets(brand_id);
CREATE INDEX IF NOT EXISTS brand_assets_brand_kind_idx ON brand_assets(brand_id, kind);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add missing columns to posts (so /api/pro/post-options can insert)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS brand_id          UUID        REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS brand_kit_id      UUID        REFERENCES brand_kits(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS mood_board_id     UUID        REFERENCES mood_boards(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_profile_id  UUID        REFERENCES image_profiles(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS product_id        UUID        REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_edited_at    TIMESTAMPTZ NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS posts_brand_id_idx ON posts(brand_id);
CREATE INDEX IF NOT EXISTS posts_user_id_idx  ON posts(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Enable RLS on new tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

-- products: owner can CRUD; members can read
CREATE POLICY IF NOT EXISTS "products_owner_all" ON products
  FOR ALL USING (
    brand_id IN (
      SELECT id FROM brands WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "products_member_read" ON products
  FOR SELECT USING (
    brand_id IN (
      SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    )
  );

-- brand_assets: same pattern
CREATE POLICY IF NOT EXISTS "brand_assets_owner_all" ON brand_assets
  FOR ALL USING (
    brand_id IN (
      SELECT id FROM brands WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "brand_assets_member_read" ON brand_assets
  FOR SELECT USING (
    brand_id IN (
      SELECT brand_id FROM brand_members WHERE user_id = auth.uid()
    )
  );
