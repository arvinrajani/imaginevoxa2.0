-- Quick database initialization for PRO Studio
-- Run this in your Supabase SQL Editor

-- 1. Create the brands table (if not exists)
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  industry TEXT,
  default_mood_board_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies for brands
DROP POLICY IF EXISTS "brands_select_member" ON brands;
CREATE POLICY "brands_select_member" ON brands
  FOR SELECT
  USING (
    auth.uid() = owner_user_id
  );

DROP POLICY IF EXISTS "brands_insert_owner" ON brands;
CREATE POLICY "brands_insert_owner" ON brands
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "brands_update_admin" ON brands;
CREATE POLICY "brands_update_admin" ON brands
  FOR UPDATE
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "brands_delete_owner" ON brands;
CREATE POLICY "brands_delete_owner" ON brands
  FOR DELETE
  USING (auth.uid() = owner_user_id);

-- 4. Create brand_kits table (for brand setup detection)
CREATE TABLE IF NOT EXISTS brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand_name TEXT,
  logo_assets JSONB DEFAULT '[]'::JSONB,
  primary_colors JSONB DEFAULT '[]'::JSONB,
  secondary_colors JSONB DEFAULT '[]'::JSONB,
  accent_colors JSONB DEFAULT '[]'::JSONB,
  font_personality TEXT,
  tone_guidelines JSONB DEFAULT '[]'::JSONB,
  allowed_image_styles JSONB DEFAULT '[]'::JSONB,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_kits_select" ON brand_kits;
CREATE POLICY "brand_kits_select" ON brand_kits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = brand_kits.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "brand_kits_insert" ON brand_kits;
CREATE POLICY "brand_kits_insert" ON brand_kits
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = brand_kits.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "brand_kits_update" ON brand_kits;
CREATE POLICY "brand_kits_update" ON brand_kits
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = brand_kits.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

-- 5. Create mood_boards table
CREATE TABLE IF NOT EXISTS mood_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  palette_colors JSONB DEFAULT '[]'::JSONB,
  typography_mood TEXT,
  image_density TEXT,
  composition_style TEXT,
  emotional_tone TEXT,
  derived_from_marketing_dna_id UUID,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mood_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mood_boards_all" ON mood_boards;
CREATE POLICY "mood_boards_all" ON mood_boards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = mood_boards.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

-- 6. Create image_assets table for image storage
CREATE TABLE IF NOT EXISTS image_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('base', 'composed', 'logo', 'reference')),
  source TEXT NOT NULL CHECK (source IN ('ai', 'upload', 'library')),
  url TEXT NOT NULL,
  prompt TEXT,
  original_prompt TEXT,
  width INTEGER,
  height INTEGER,
  dominant_colors JSONB DEFAULT '[]'::JSONB,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE image_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_assets_all" ON image_assets;
CREATE POLICY "image_assets_all" ON image_assets
  FOR ALL
  USING (
    brand_id IS NULL OR
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = image_assets.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

-- 7. Create marketing_dna table for LinkedIn analysis
CREATE TABLE IF NOT EXISTS marketing_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'linkedin',
  analysis_version TEXT,
  tone TEXT,
  primary_colors JSONB DEFAULT '[]'::JSONB,
  accent_colors JSONB DEFAULT '[]'::JSONB,
  image_style TEXT,
  post_types JSONB DEFAULT '[]'::JSONB,
  cta_style TEXT,
  visual_density TEXT,
  cadence JSONB DEFAULT '{}'::JSONB,
  consistency_score NUMERIC(5,2),
  evidence JSONB DEFAULT '{}'::JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE marketing_dna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_dna_all" ON marketing_dna;
CREATE POLICY "marketing_dna_all" ON marketing_dna
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = marketing_dna.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brands
      WHERE brands.id = marketing_dna.brand_id
      AND brands.owner_user_id = auth.uid()
    )
  );

-- SUCCESS! You can now use PRO Studio
SELECT 'Database initialized successfully!' AS status;
