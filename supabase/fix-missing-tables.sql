-- =============================================================================
-- FIX: Missing tables and columns causing 400/404/500 errors
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to run multiple times (all statements are idempotent).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. companies table (required before brands.company_id FK)
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

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. brand_kits.is_active – missing column causing 400 on queries with is_active=eq.true
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.brand_kits ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Back-fill: mark the most recent kit per brand as active, all others inactive
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brand_kits' AND column_name = 'is_active'
  ) THEN
    UPDATE public.brand_kits bk
    SET is_active = false
    WHERE id NOT IN (
      SELECT DISTINCT ON (brand_id) id
      FROM public.brand_kits
      ORDER BY brand_id, created_at DESC
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_brand_kits_brand_active ON public.brand_kits(brand_id, is_active, updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. products table – missing table causing 404
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID        NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products(brand_id, created_at ASC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. brand_assets table – missing table causing 404
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_assets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID        NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  brand_kit_id   UUID        REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  kind           TEXT        NOT NULL DEFAULT 'logo',
  is_primary     BOOLEAN     NOT NULL DEFAULT false,
  image_asset_id UUID        REFERENCES public.image_assets(id) ON DELETE SET NULL,
  file_url       TEXT        NULL,
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_assets_kind_check CHECK (kind IN ('logo', 'background', 'reference', 'base'))
);

CREATE INDEX IF NOT EXISTS idx_brand_assets_brand_kind ON public.brand_assets(brand_id, kind, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_assets_primary_logo_per_brand
  ON public.brand_assets(brand_id)
  WHERE kind = 'logo' AND is_primary = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. posts – add missing columns (causes 500 in /api/pro/post-options)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS brand_id         UUID        REFERENCES public.brands(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS brand_kit_id     UUID        REFERENCES public.brand_kits(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS mood_board_id    UUID        REFERENCES public.mood_boards(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_profile_id UUID        REFERENCES public.image_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS product_id       UUID        REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS last_edited_at   TIMESTAMPTZ NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_posts_brand_id ON public.posts(brand_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id  ON public.posts(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS on new tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies    ENABLE ROW LEVEL SECURITY;

-- companies: owner only
DROP POLICY IF EXISTS companies_owner_all ON public.companies;
CREATE POLICY companies_owner_all ON public.companies
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- products: owner can CRUD; members can read
DROP POLICY IF EXISTS products_owner_all ON public.products;
CREATE POLICY products_owner_all ON public.products
  FOR ALL TO authenticated
  USING (
    brand_id IN (SELECT id FROM public.brands WHERE owner_user_id = auth.uid())
  )
  WITH CHECK (
    brand_id IN (SELECT id FROM public.brands WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS products_member_read ON public.products;
CREATE POLICY products_member_read ON public.products
  FOR SELECT TO authenticated
  USING (
    brand_id IN (SELECT brand_id FROM public.brand_members WHERE user_id = auth.uid())
  );

-- brand_assets: owner can CRUD; members can read
DROP POLICY IF EXISTS brand_assets_owner_all ON public.brand_assets;
CREATE POLICY brand_assets_owner_all ON public.brand_assets
  FOR ALL TO authenticated
  USING (
    brand_id IN (SELECT id FROM public.brands WHERE owner_user_id = auth.uid())
  )
  WITH CHECK (
    brand_id IN (SELECT id FROM public.brands WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS brand_assets_member_read ON public.brand_assets;
CREATE POLICY brand_assets_member_read ON public.brand_assets
  FOR SELECT TO authenticated
  USING (
    brand_id IN (SELECT brand_id FROM public.brand_members WHERE user_id = auth.uid())
  );
