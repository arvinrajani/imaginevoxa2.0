-- Robustness upgrades for brand asset persistence
-- Run this once in Supabase SQL Editor.

BEGIN;

-- ============================================================
-- 1) Strict brand kit activation model
-- ============================================================

ALTER TABLE public.brand_kits
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY brand_id
      ORDER BY (CASE WHEN is_locked THEN 1 ELSE 0 END) ASC, updated_at DESC, created_at DESC
    ) AS rn
  FROM public.brand_kits
)
UPDATE public.brand_kits bk
SET is_active = (ranked.rn = 1)
FROM ranked
WHERE ranked.id = bk.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_kits_one_active_per_brand
  ON public.brand_kits(brand_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_brand_kits_brand_active
  ON public.brand_kits(brand_id, is_active, updated_at DESC);

-- ============================================================
-- 2) Normalized brand assets table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  brand_kit_id UUID NULL REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  image_asset_id UUID NOT NULL REFERENCES public.image_assets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (image_asset_id),
  CONSTRAINT brand_assets_kind_check CHECK (kind IN ('logo', 'background', 'reference', 'base'))
);

CREATE INDEX IF NOT EXISTS idx_brand_assets_brand_kind_created
  ON public.brand_assets(brand_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brand_assets_brand_kit_kind_created
  ON public.brand_assets(brand_kit_id, kind, is_primary DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_assets_one_primary_logo_per_kit
  ON public.brand_assets(brand_kit_id)
  WHERE kind = 'logo' AND is_primary = TRUE AND brand_kit_id IS NOT NULL;

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_assets_all" ON public.brand_assets;
CREATE POLICY "brand_assets_all" ON public.brand_assets
  FOR ALL
  USING (public.is_brand_owner(brand_id))
  WITH CHECK (public.is_brand_owner(brand_id));

DROP TRIGGER IF EXISTS update_brand_assets_updated_at ON public.brand_assets;
CREATE TRIGGER update_brand_assets_updated_at
  BEFORE UPDATE ON public.brand_assets
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ============================================================
-- 3) Legacy JSON synchronization helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_brand_kit_logo_assets_from_links(p_brand_kit_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'url', ia.file_url,
            'asset_id', ba.image_asset_id,
            'name', COALESCE(ba.metadata->>'name', ia.metadata->>'original_name'),
            'path', COALESCE(ba.metadata->>'storage_path', ia.metadata->>'storage_path'),
            'bucket', COALESCE(ba.metadata->>'storage_bucket', ia.metadata->>'storage_bucket'),
            'created_at', ba.created_at
          )
        )
        ORDER BY ba.is_primary DESC, ba.created_at DESC
      ),
      '[]'::JSONB
    )
  INTO v_payload
  FROM public.brand_assets ba
  JOIN public.image_assets ia ON ia.id = ba.image_asset_id
  WHERE ba.brand_kit_id = p_brand_kit_id
    AND ba.kind = 'logo';

  UPDATE public.brand_kits
  SET logo_assets = COALESCE(v_payload, '[]'::JSONB),
      updated_at = NOW()
  WHERE id = p_brand_kit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_brand_logo_asset_atomic(
  p_brand_id UUID,
  p_brand_kit_id UUID,
  p_created_by UUID,
  p_file_url TEXT,
  p_source image_asset_source DEFAULT 'upload',
  p_original_name TEXT DEFAULT NULL,
  p_storage_bucket TEXT DEFAULT NULL,
  p_storage_path TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE(asset_id UUID, brand_kit_id UUID, is_primary BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_name TEXT;
  v_kit_id UUID;
  v_locked BOOLEAN;
  v_asset_id UUID;
  v_is_primary BOOLEAN;
  v_metadata JSONB;
BEGIN
  SELECT b.name
  INTO v_brand_name
  FROM public.brands b
  WHERE b.id = p_brand_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand not found for id %', p_brand_id;
  END IF;

  IF p_brand_kit_id IS NOT NULL THEN
    SELECT bk.id, bk.is_locked
    INTO v_kit_id, v_locked
    FROM public.brand_kits bk
    WHERE bk.id = p_brand_kit_id
      AND bk.brand_id = p_brand_id
    FOR UPDATE;
  ELSE
    SELECT bk.id, bk.is_locked
    INTO v_kit_id, v_locked
    FROM public.brand_kits bk
    WHERE bk.brand_id = p_brand_id
      AND bk.is_active = TRUE
    ORDER BY bk.updated_at DESC, bk.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_kit_id IS NULL THEN
      INSERT INTO public.brand_kits (
        brand_id,
        name,
        brand_name,
        logo_assets,
        primary_colors,
        secondary_colors,
        accent_colors,
        tone_guidelines,
        allowed_image_styles,
        is_locked,
        is_active
      )
      VALUES (
        p_brand_id,
        COALESCE(v_brand_name, 'Brand') || ' Kit',
        v_brand_name,
        '[]'::JSONB,
        '[]'::JSONB,
        '[]'::JSONB,
        '[]'::JSONB,
        '[]'::JSONB,
        '[]'::JSONB,
        FALSE,
        TRUE
      )
      RETURNING id, is_locked INTO v_kit_id, v_locked;
    END IF;
  END IF;

  IF v_kit_id IS NULL THEN
    RAISE EXCEPTION 'No writable brand kit resolved for brand %', p_brand_id;
  END IF;

  IF COALESCE(v_locked, FALSE) THEN
    RAISE EXCEPTION 'Brand kit % is locked', v_kit_id;
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::JSONB) ||
    jsonb_strip_nulls(
      jsonb_build_object(
        'upload_type', 'logo',
        'storage_bucket', p_storage_bucket,
        'storage_path', p_storage_path,
        'original_name', p_original_name,
        'brand_kit_id', v_kit_id
      )
    );

  INSERT INTO public.image_assets (
    brand_id,
    created_by,
    asset_type,
    source,
    file_url,
    metadata
  )
  VALUES (
    p_brand_id,
    p_created_by,
    'logo',
    p_source,
    p_file_url,
    v_metadata
  )
  RETURNING id INTO v_asset_id;

  v_is_primary := NOT EXISTS (
    SELECT 1
    FROM public.brand_assets ba
    WHERE ba.brand_kit_id = v_kit_id
      AND ba.kind = 'logo'
      AND ba.is_primary = TRUE
  );

  INSERT INTO public.brand_assets (
    brand_id,
    brand_kit_id,
    image_asset_id,
    kind,
    is_primary,
    metadata,
    created_by
  )
  VALUES (
    p_brand_id,
    v_kit_id,
    v_asset_id,
    'logo',
    v_is_primary,
    jsonb_strip_nulls(
      jsonb_build_object(
        'name', p_original_name,
        'storage_bucket', p_storage_bucket,
        'storage_path', p_storage_path
      )
    ),
    p_created_by
  );

  PERFORM public.sync_brand_kit_logo_assets_from_links(v_kit_id);

  asset_id := v_asset_id;
  brand_kit_id := v_kit_id;
  is_primary := v_is_primary;
  RETURN NEXT;
END;
$$;

-- ============================================================
-- 4) Backfill brand_assets from existing image_assets rows
-- ============================================================

INSERT INTO public.brand_assets (
  brand_id,
  brand_kit_id,
  image_asset_id,
  kind,
  is_primary,
  metadata,
  created_by
)
SELECT
  ia.brand_id,
  (
    SELECT bk.id
    FROM public.brand_kits bk
    WHERE bk.brand_id = ia.brand_id
      AND bk.is_active = TRUE
    ORDER BY bk.updated_at DESC, bk.created_at DESC
    LIMIT 1
  ) AS brand_kit_id,
  ia.id AS image_asset_id,
  CASE
    WHEN ia.asset_type = 'logo' THEN 'logo'
    WHEN (ia.metadata->>'upload_type') = 'banner' OR (ia.metadata->>'requested_type') = 'background' THEN 'background'
    WHEN ia.asset_type = 'base' THEN 'base'
    ELSE 'reference'
  END AS kind,
  FALSE AS is_primary,
  jsonb_strip_nulls(
    jsonb_build_object(
      'storage_bucket', ia.metadata->>'storage_bucket',
      'storage_path', ia.metadata->>'storage_path',
      'name', COALESCE(ia.metadata->>'original_name', 'Asset')
    )
  ) AS metadata,
  ia.created_by
FROM public.image_assets ia
WHERE ia.brand_id IS NOT NULL
ON CONFLICT (image_asset_id) DO NOTHING;

-- Mark first logo per kit as primary when missing.
WITH first_logo AS (
  SELECT
    ba.id,
    ROW_NUMBER() OVER (
      PARTITION BY ba.brand_kit_id
      ORDER BY ba.created_at ASC
    ) AS rn
  FROM public.brand_assets ba
  WHERE ba.kind = 'logo'
    AND ba.brand_kit_id IS NOT NULL
)
UPDATE public.brand_assets ba
SET is_primary = (fl.rn = 1)
FROM first_logo fl
WHERE fl.id = ba.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.brand_assets existing
    WHERE existing.brand_kit_id = ba.brand_kit_id
      AND existing.kind = 'logo'
      AND existing.is_primary = TRUE
  );

-- Sync all kits once after backfill.
DO $$
DECLARE
  k RECORD;
BEGIN
  FOR k IN
    SELECT id FROM public.brand_kits
  LOOP
    PERFORM public.sync_brand_kit_logo_assets_from_links(k.id);
  END LOOP;
END $$;

-- ============================================================
-- 5) Brand memory profile for reusable post/image context
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_memory_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE UNIQUE,
  post_memory JSONB NOT NULL DEFAULT '{}'::JSONB,
  image_memory JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_memory_profiles_brand
  ON public.brand_memory_profiles(brand_id);

ALTER TABLE public.brand_memory_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_memory_profiles_all" ON public.brand_memory_profiles;
CREATE POLICY "brand_memory_profiles_all" ON public.brand_memory_profiles
  FOR ALL
  USING (public.is_brand_owner(brand_id))
  WITH CHECK (public.is_brand_owner(brand_id));

DROP TRIGGER IF EXISTS update_brand_memory_profiles_updated_at ON public.brand_memory_profiles;
CREATE TRIGGER update_brand_memory_profiles_updated_at
  BEFORE UPDATE ON public.brand_memory_profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

COMMIT;
