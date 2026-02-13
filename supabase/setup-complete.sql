-- ============================================================================
-- COMPLETE PRO STUDIO DATABASE SETUP
-- ============================================================================
-- Run this ONCE in your Supabase SQL Editor (https://supabase.com/dashboard)
-- This is idempotent — safe to run multiple times.
-- It creates all tables, columns, enums, RLS policies, indexes, and storage
-- buckets needed by the PRO Studio API routes.
-- ============================================================================

-- =====================
-- 1. EXTENSIONS
-- =====================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================
-- 2. CUSTOM ENUM TYPES
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'brand_role') THEN
    CREATE TYPE brand_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_option_status') THEN
    CREATE TYPE post_option_status AS ENUM ('proposed', 'accepted', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM ('approved', 'rejected', 'needs_changes');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_check_type') THEN
    CREATE TYPE compliance_check_type AS ENUM (
      'automation_risk', 'spam_pattern', 'brand_consistency',
      'visual_consistency', 'policy', 'custom'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_status') THEN
    CREATE TYPE compliance_status AS ENUM ('pass', 'warn', 'fail');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'image_asset_type') THEN
    CREATE TYPE image_asset_type AS ENUM ('base', 'composed', 'logo', 'reference');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'image_asset_source') THEN
    CREATE TYPE image_asset_source AS ENUM ('ai', 'upload', 'library');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'image_generation_status') THEN
    CREATE TYPE image_generation_status AS ENUM ('queued', 'generating', 'completed', 'failed', 'canceled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'image_provider') THEN
    CREATE TYPE image_provider AS ENUM ('openai', 'stability', 'adobe', 'google', 'custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_source_type') THEN
    CREATE TYPE content_source_type AS ENUM ('url', 'product', 'document', 'manual');
  END IF;
END $$;

-- =====================
-- 3. CORE TABLES
-- =====================

-- profiles (auto-created on auth.user signup)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'starter',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure profiles has all expected columns (table may already exist from auth)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'starter';

-- brands
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

-- brand_members
CREATE TABLE IF NOT EXISTS brand_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role brand_role NOT NULL DEFAULT 'viewer',
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (brand_id, user_id)
);

-- marketing_identities
CREATE TABLE IF NOT EXISTS marketing_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  voice_traits JSONB DEFAULT '[]'::JSONB,
  positioning TEXT,
  audience_personas JSONB DEFAULT '[]'::JSONB,
  do_not_use JSONB DEFAULT '[]'::JSONB,
  preferred_phrases JSONB DEFAULT '[]'::JSONB,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- brand_kits
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

-- mood_boards
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

-- marketing_dna
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

-- content_sources
CREATE TABLE IF NOT EXISTS content_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  post_id UUID,
  source_type content_source_type NOT NULL DEFAULT 'url',
  source_url TEXT NOT NULL,
  title TEXT,
  content TEXT,
  content_excerpt TEXT,
  content_hash TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- linkedin_mood_profiles
CREATE TABLE IF NOT EXISTS linkedin_mood_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  marketing_dna_id UUID REFERENCES marketing_dna(id) ON DELETE SET NULL,
  profile JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- linkedin_analysis_runs
CREATE TABLE IF NOT EXISTS linkedin_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  connection_id UUID,
  status TEXT NOT NULL DEFAULT 'completed',
  input_summary JSONB DEFAULT '{}'::JSONB,
  output JSONB DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- image_profiles
CREATE TABLE IF NOT EXISTS image_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  layout_spec JSONB NOT NULL DEFAULT '{}'::JSONB,
  allowed_text_zones JSONB DEFAULT '[]'::JSONB,
  logo_rules JSONB DEFAULT '{}'::JSONB,
  label_rules JSONB DEFAULT '{}'::JSONB,
  typography_hierarchy JSONB DEFAULT '{}'::JSONB,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- image_assets (using enum types from schema.sql, NOT text CHECK from init-database.sql)
CREATE TABLE IF NOT EXISTS image_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  asset_type image_asset_type NOT NULL,
  source image_asset_source NOT NULL,
  file_url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  dominant_colors JSONB DEFAULT '[]'::JSONB,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- image_compositions
CREATE TABLE IF NOT EXISTS image_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  base_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL,
  image_profile_id UUID REFERENCES image_profiles(id) ON DELETE SET NULL,
  mood_board_id UUID REFERENCES mood_boards(id) ON DELETE SET NULL,
  layout_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  text_blocks JSONB DEFAULT '[]'::JSONB,
  logo_overrides JSONB DEFAULT '{}'::JSONB,
  output_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- image_generation_jobs
CREATE TABLE IF NOT EXISTS image_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  mood_board_id UUID REFERENCES mood_boards(id) ON DELETE SET NULL,
  image_profile_id UUID REFERENCES image_profiles(id) ON DELETE SET NULL,
  post_id UUID,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  provider image_provider NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT,
  params JSONB DEFAULT '{}'::JSONB,
  status image_generation_status NOT NULL DEFAULT 'queued',
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- image_generation_outputs
CREATE TABLE IF NOT EXISTS image_generation_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES image_generation_jobs(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL,
  variation_index INTEGER NOT NULL DEFAULT 0,
  seed TEXT,
  safety_score NUMERIC(5,2),
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- campaign_posts
CREATE TABLE IF NOT EXISTS campaign_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  post_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, post_id)
);

-- posts
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  title TEXT,
  post_content TEXT NOT NULL,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  target_type TEXT NOT NULL DEFAULT 'person',
  target_urn TEXT,
  scheduled_for TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  linkedin_post_urn TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- post_options
CREATE TABLE IF NOT EXISTS post_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  option_index INTEGER NOT NULL,
  title TEXT,
  post_content TEXT NOT NULL,
  ai_model TEXT,
  generation_prompt TEXT,
  status post_option_status NOT NULL DEFAULT 'proposed',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, option_index)
);

-- post_versions
CREATE TABLE IF NOT EXISTS post_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  version INTEGER NOT NULL,
  title TEXT,
  post_content TEXT NOT NULL,
  change_reason TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, version)
);

-- post_approvals
CREATE TABLE IF NOT EXISTS post_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  status approval_status NOT NULL,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- compliance_checks
CREATE TABLE IF NOT EXISTS compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  check_type compliance_check_type NOT NULL,
  status compliance_status NOT NULL,
  score NUMERIC(5,2),
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_state JSONB DEFAULT '{}'::JSONB,
  after_state JSONB DEFAULT '{}'::JSONB,
  metadata JSONB DEFAULT '{}'::JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- linkedin_connections
CREATE TABLE IF NOT EXISTS linkedin_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT DEFAULT 'linkedin',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  org_access_token TEXT,
  org_refresh_token TEXT,
  org_expires_at TIMESTAMPTZ,
  member_urn TEXT,
  orgs JSONB DEFAULT '[]'::JSONB,
  scopes JSONB DEFAULT '[]'::JSONB,
  org_scopes JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- 4. MIGRATION: Fix image_assets column names if created by old init-database.sql
-- =====================
-- If you previously ran init-database.sql, it created image_assets with columns:
--   type (TEXT CHECK), source (TEXT CHECK), url (TEXT)
-- But the API routes expect:
--   asset_type (image_asset_type enum), source (image_asset_source enum), file_url (TEXT)
-- This section renames/migrates them safely.

DO $$
BEGIN
  -- Rename 'type' → 'asset_type' (if old column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'image_assets' AND column_name = 'type' AND table_schema = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'image_assets' AND column_name = 'asset_type' AND table_schema = 'public'
  ) THEN
    -- Drop CHECK constraint first
    ALTER TABLE image_assets DROP CONSTRAINT IF EXISTS image_assets_type_check;
    ALTER TABLE image_assets RENAME COLUMN "type" TO asset_type;
    -- Change from TEXT to enum (cast via TEXT)
    ALTER TABLE image_assets ALTER COLUMN asset_type TYPE image_asset_type USING asset_type::image_asset_type;
  END IF;

  -- Rename 'url' → 'file_url' (if old column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'image_assets' AND column_name = 'url' AND table_schema = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'image_assets' AND column_name = 'file_url' AND table_schema = 'public'
  ) THEN
    ALTER TABLE image_assets RENAME COLUMN url TO file_url;
  END IF;

  -- Fix 'source' column from TEXT CHECK to enum type (if it's TEXT)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'image_assets' AND column_name = 'source'
    AND data_type = 'text' AND table_schema = 'public'
  ) THEN
    ALTER TABLE image_assets DROP CONSTRAINT IF EXISTS image_assets_source_check;
    ALTER TABLE image_assets ALTER COLUMN source TYPE image_asset_source USING source::image_asset_source;
  END IF;
END $$;

-- =====================
-- 5. ALTER TABLE — add columns to posts (safe, uses IF NOT EXISTS)
-- =====================
ALTER TABLE linkedin_connections ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS brand_kit_id UUID REFERENCES brand_kits(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS mood_board_id UUID REFERENCES mood_boards(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_profile_id UUID REFERENCES image_profiles(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS base_image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS composed_image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_composition_id UUID REFERENCES image_compositions(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_generation_job_id UUID REFERENCES image_generation_jobs(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS intent_locked_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS compliance_status TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS compliance_score NUMERIC(5,2);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visual_consistency_score NUMERIC(5,2);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS brand_consistency_score NUMERIC(5,2);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS auto_publish BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================
-- 6. FOREIGN KEY CONSTRAINTS (safe, checks existence)
-- =====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'linkedin_analysis_runs_connection_id_fkey') THEN
    ALTER TABLE linkedin_analysis_runs
      ADD CONSTRAINT linkedin_analysis_runs_connection_id_fkey
      FOREIGN KEY (connection_id) REFERENCES linkedin_connections(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_posts_post_id_fkey') THEN
    ALTER TABLE campaign_posts
      ADD CONSTRAINT campaign_posts_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_options_post_id_fkey') THEN
    ALTER TABLE post_options
      ADD CONSTRAINT post_options_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_versions_post_id_fkey') THEN
    ALTER TABLE post_versions
      ADD CONSTRAINT post_versions_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_approvals_post_id_fkey') THEN
    ALTER TABLE post_approvals
      ADD CONSTRAINT post_approvals_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_checks_post_id_fkey') THEN
    ALTER TABLE compliance_checks
      ADD CONSTRAINT compliance_checks_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_generation_jobs_post_id_fkey') THEN
    ALTER TABLE image_generation_jobs
      ADD CONSTRAINT image_generation_jobs_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_sources_post_id_fkey') THEN
    ALTER TABLE content_sources
      ADD CONSTRAINT content_sources_post_id_fkey
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_mood_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_generation_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_connections ENABLE ROW LEVEL SECURITY;

-- Helper: check brand ownership (bypasses RLS on brands to prevent recursion)
CREATE OR REPLACE FUNCTION is_brand_owner(brand_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM brands WHERE id = brand_uuid AND owner_user_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE
   SET search_path = public;

-- profiles
DROP POLICY IF EXISTS "profiles_own" ON profiles;
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (id = auth.uid());

-- brands
DROP POLICY IF EXISTS "brands_select" ON brands;
CREATE POLICY "brands_select" ON brands FOR SELECT USING (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "brands_insert" ON brands;
CREATE POLICY "brands_insert" ON brands FOR INSERT WITH CHECK (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "brands_update" ON brands;
CREATE POLICY "brands_update" ON brands FOR UPDATE USING (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "brands_delete" ON brands;
CREATE POLICY "brands_delete" ON brands FOR DELETE USING (owner_user_id = auth.uid());

-- brand_members
DROP POLICY IF EXISTS "brand_members_all" ON brand_members;
CREATE POLICY "brand_members_all" ON brand_members FOR ALL USING (is_brand_owner(brand_id));

-- marketing_identities
DROP POLICY IF EXISTS "marketing_identities_all" ON marketing_identities;
CREATE POLICY "marketing_identities_all" ON marketing_identities FOR ALL USING (is_brand_owner(brand_id));

-- brand_kits
DROP POLICY IF EXISTS "brand_kits_all" ON brand_kits;
CREATE POLICY "brand_kits_all" ON brand_kits FOR ALL USING (is_brand_owner(brand_id));

-- mood_boards
DROP POLICY IF EXISTS "mood_boards_all" ON mood_boards;
CREATE POLICY "mood_boards_all" ON mood_boards FOR ALL USING (is_brand_owner(brand_id));

-- marketing_dna
DROP POLICY IF EXISTS "marketing_dna_all" ON marketing_dna;
CREATE POLICY "marketing_dna_all" ON marketing_dna FOR ALL USING (is_brand_owner(brand_id));

-- content_sources
DROP POLICY IF EXISTS "content_sources_all" ON content_sources;
CREATE POLICY "content_sources_all" ON content_sources FOR ALL USING (is_brand_owner(brand_id));

-- linkedin_mood_profiles
DROP POLICY IF EXISTS "linkedin_mood_profiles_all" ON linkedin_mood_profiles;
CREATE POLICY "linkedin_mood_profiles_all" ON linkedin_mood_profiles FOR ALL USING (is_brand_owner(brand_id));

-- linkedin_analysis_runs
DROP POLICY IF EXISTS "linkedin_analysis_runs_all" ON linkedin_analysis_runs;
CREATE POLICY "linkedin_analysis_runs_all" ON linkedin_analysis_runs FOR ALL USING (is_brand_owner(brand_id));

-- image_profiles
DROP POLICY IF EXISTS "image_profiles_all" ON image_profiles;
CREATE POLICY "image_profiles_all" ON image_profiles FOR ALL USING (is_brand_owner(brand_id));

-- image_assets
DROP POLICY IF EXISTS "image_assets_all" ON image_assets;
CREATE POLICY "image_assets_all" ON image_assets FOR ALL USING (
  brand_id IS NULL OR is_brand_owner(brand_id)
);

-- image_compositions
DROP POLICY IF EXISTS "image_compositions_all" ON image_compositions;
CREATE POLICY "image_compositions_all" ON image_compositions FOR ALL USING (
  brand_id IS NULL OR is_brand_owner(brand_id)
);

-- image_generation_jobs
DROP POLICY IF EXISTS "image_generation_jobs_all" ON image_generation_jobs;
CREATE POLICY "image_generation_jobs_all" ON image_generation_jobs FOR ALL USING (
  brand_id IS NULL OR is_brand_owner(brand_id)
);

-- image_generation_outputs (via job ownership)
DROP POLICY IF EXISTS "image_generation_outputs_all" ON image_generation_outputs;
CREATE POLICY "image_generation_outputs_all" ON image_generation_outputs FOR ALL USING (
  EXISTS (
    SELECT 1 FROM image_generation_jobs j
    WHERE j.id = image_generation_outputs.job_id
    AND (j.brand_id IS NULL OR is_brand_owner(j.brand_id))
  )
);

-- campaigns
DROP POLICY IF EXISTS "campaigns_all" ON campaigns;
CREATE POLICY "campaigns_all" ON campaigns FOR ALL USING (is_brand_owner(brand_id));

-- campaign_posts
DROP POLICY IF EXISTS "campaign_posts_all" ON campaign_posts;
CREATE POLICY "campaign_posts_all" ON campaign_posts FOR ALL USING (
  EXISTS (
    SELECT 1 FROM campaigns c WHERE c.id = campaign_posts.campaign_id AND is_brand_owner(c.brand_id)
  )
);

-- posts
DROP POLICY IF EXISTS "posts_own" ON posts;
CREATE POLICY "posts_own" ON posts FOR ALL USING (user_id = auth.uid());

-- post_options (via post ownership)
DROP POLICY IF EXISTS "post_options_all" ON post_options;
CREATE POLICY "post_options_all" ON post_options FOR ALL USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id = post_options.post_id AND p.user_id = auth.uid())
);

-- post_versions
DROP POLICY IF EXISTS "post_versions_all" ON post_versions;
CREATE POLICY "post_versions_all" ON post_versions FOR ALL USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id = post_versions.post_id AND p.user_id = auth.uid())
);

-- post_approvals
DROP POLICY IF EXISTS "post_approvals_all" ON post_approvals;
CREATE POLICY "post_approvals_all" ON post_approvals FOR ALL USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id = post_approvals.post_id AND p.user_id = auth.uid())
);

-- compliance_checks
DROP POLICY IF EXISTS "compliance_checks_all" ON compliance_checks;
CREATE POLICY "compliance_checks_all" ON compliance_checks FOR ALL USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id = compliance_checks.post_id AND p.user_id = auth.uid())
);

-- audit_logs (read-only for brand owners, service role inserts)
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (
  brand_id IS NULL OR is_brand_owner(brand_id)
);
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (true);

-- linkedin_connections
DROP POLICY IF EXISTS "linkedin_connections_own" ON linkedin_connections;
CREATE POLICY "linkedin_connections_own" ON linkedin_connections FOR ALL USING (user_id = auth.uid());

-- =====================
-- 8. INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS idx_brands_owner ON brands(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_brand_kits_brand ON brand_kits(brand_id);
CREATE INDEX IF NOT EXISTS idx_mood_boards_brand ON mood_boards(brand_id);
CREATE INDEX IF NOT EXISTS idx_marketing_identities_brand ON marketing_identities(brand_id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_brand ON posts(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_options_post ON post_options(post_id, option_index);
CREATE INDEX IF NOT EXISTS idx_image_assets_brand ON image_assets(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_brand_status ON image_generation_jobs(brand_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_generation_outputs_job ON image_generation_outputs(job_id, variation_index);
CREATE INDEX IF NOT EXISTS idx_content_sources_brand ON content_sources(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_sources_post ON content_sources(post_id);
CREATE INDEX IF NOT EXISTS idx_content_sources_hash ON content_sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_audit_logs_brand ON audit_logs(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_linkedin_connections_user ON linkedin_connections(user_id);

-- =====================
-- 9. TRIGGERS (updated_at auto-set)
-- =====================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'brands', 'marketing_identities', 'brand_kits', 'mood_boards',
    'image_profiles', 'image_compositions', 'image_generation_jobs',
    'campaigns', 'posts'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- =====================
-- 10. AUTH TRIGGER (auto-create profile on signup)
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, plan)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url', 'starter')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =====================
-- 11. STORAGE BUCKETS
-- =====================
-- Create storage buckets for images (run in Supabase Dashboard > Storage if this fails)
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('post-images', 'post-images', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS: allow authenticated users to upload/read
DROP POLICY IF EXISTS "storage_brand_assets_select" ON storage.objects;
CREATE POLICY "storage_brand_assets_select" ON storage.objects
  FOR SELECT USING (bucket_id IN ('brand-assets', 'post-images', 'images'));

DROP POLICY IF EXISTS "storage_brand_assets_insert" ON storage.objects;
CREATE POLICY "storage_brand_assets_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id IN ('brand-assets', 'post-images', 'images'));

DROP POLICY IF EXISTS "storage_brand_assets_update" ON storage.objects;
CREATE POLICY "storage_brand_assets_update" ON storage.objects
  FOR UPDATE USING (bucket_id IN ('brand-assets', 'post-images', 'images'));

-- =====================
-- DONE
-- =====================

-- 12. SEED DEV USER (for development without real auth)
-- This ensures the DEV_USER_ID exists so foreign keys don't fail.
-- Replace the UUID below with your DEV_USER_ID from .env.local
DO $$
DECLARE
  dev_uid UUID := 'fe7a9362-63c6-4341-ab17-47dac462cfa0';
BEGIN
  -- Check if user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = dev_uid) THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (
      dev_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'dev@prostudio.local',
      crypt('dev-password-123', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}'::JSONB,
      '{"full_name":"PRO Studio Dev"}'::JSONB
    );
    RAISE NOTICE 'Dev user created: %', dev_uid;
  ELSE
    RAISE NOTICE 'Dev user already exists: %', dev_uid;
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (id, full_name, plan)
  VALUES (dev_uid, 'PRO Studio Dev', 'pro')
  ON CONFLICT (id) DO UPDATE SET plan = 'pro';

  -- Ensure dev brand exists
  INSERT INTO public.brands (id, owner_user_id, name, description, industry)
  VALUES (
    gen_random_uuid(), dev_uid,
    'My Brand', 'Default development brand', 'Technology'
  )
  ON CONFLICT DO NOTHING;

  -- Only insert if user has NO brands yet
  IF NOT EXISTS (SELECT 1 FROM public.brands WHERE owner_user_id = dev_uid) THEN
    INSERT INTO public.brands (owner_user_id, name, description, industry)
    VALUES (dev_uid, 'My Brand', 'Default development brand', 'Technology');
  END IF;
END $$;

SELECT 'PRO Studio database setup complete!' AS status;
