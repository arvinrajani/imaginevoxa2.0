
-- ============================================================================
-- FILE: schema.sql
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  plan text not null default 'starter',
  created_at timestamptz default now()
);

-- ============================================
-- PRO PLAN CORE ENTITIES
-- ============================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'brand_role') then
    create type brand_role as enum ('owner', 'admin', 'editor', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'post_option_status') then
    create type post_option_status as enum ('proposed', 'accepted', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type approval_status as enum ('approved', 'rejected', 'needs_changes');
  end if;
  if not exists (select 1 from pg_type where typname = 'compliance_check_type') then
    create type compliance_check_type as enum (
      'automation_risk',
      'spam_pattern',
      'brand_consistency',
      'visual_consistency',
      'policy',
      'custom'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'compliance_status') then
    create type compliance_status as enum ('pass', 'warn', 'fail');
  end if;
  if not exists (select 1 from pg_type where typname = 'image_asset_type') then
    create type image_asset_type as enum ('base', 'composed', 'logo', 'reference');
  end if;
  if not exists (select 1 from pg_type where typname = 'image_asset_source') then
    create type image_asset_source as enum ('ai', 'upload', 'library');
  end if;
  if not exists (select 1 from pg_type where typname = 'image_generation_status') then
    create type image_generation_status as enum ('queued', 'generating', 'completed', 'failed', 'canceled');
  end if;
  if not exists (select 1 from pg_type where typname = 'image_provider') then
    create type image_provider as enum ('openai', 'stability', 'adobe', 'google', 'custom');
  end if;
  if not exists (select 1 from pg_type where typname = 'content_source_type') then
    create type content_source_type as enum ('url', 'product', 'document', 'manual');
  end if;
end $$;

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text null,
  website text null,
  industry text null,
  default_mood_board_id uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role brand_role not null default 'viewer',
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (brand_id, user_id)
);

create table if not exists marketing_identities (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  voice_traits jsonb default '[]'::jsonb,
  positioning text null,
  audience_personas jsonb default '[]'::jsonb,
  do_not_use jsonb default '[]'::jsonb,
  preferred_phrases jsonb default '[]'::jsonb,
  is_locked boolean not null default false,
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists brand_kits (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  brand_name text null,
  logo_assets jsonb default '[]'::jsonb,
  primary_colors jsonb default '[]'::jsonb,
  secondary_colors jsonb default '[]'::jsonb,
  accent_colors jsonb default '[]'::jsonb,
  font_personality text null,
  tone_guidelines jsonb default '[]'::jsonb,
  allowed_image_styles jsonb default '[]'::jsonb,
  is_locked boolean not null default false,
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists mood_boards (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  description text null,
  palette_colors jsonb default '[]'::jsonb,
  typography_mood text null,
  image_density text null,
  composition_style text null,
  emotional_tone text null,
  derived_from_marketing_dna_id uuid null,
  is_locked boolean not null default false,
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists marketing_dna (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  source text not null default 'linkedin',
  analysis_version text null,
  tone text null,
  primary_colors jsonb default '[]'::jsonb,
  accent_colors jsonb default '[]'::jsonb,
  image_style text null,
  post_types jsonb default '[]'::jsonb,
  cta_style text null,
  visual_density text null,
  cadence jsonb default '{}'::jsonb,
  consistency_score numeric(5,2) null,
  evidence jsonb default '{}'::jsonb,
  analyzed_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists content_sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  post_id uuid null,
  source_type content_source_type not null default 'url',
  source_url text not null,
  title text null,
  content text null,
  content_excerpt text null,
  content_hash text null,
  metadata jsonb default '{}'::jsonb,
  fetched_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists linkedin_mood_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  marketing_dna_id uuid references marketing_dna(id) on delete set null,
  profile jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists linkedin_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  connection_id uuid null,
  status text not null default 'completed',
  input_summary jsonb default '{}'::jsonb,
  output jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists image_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  category text null,
  description text null,
  layout_spec jsonb not null default '{}'::jsonb,
  allowed_text_zones jsonb default '[]'::jsonb,
  logo_rules jsonb default '{}'::jsonb,
  label_rules jsonb default '{}'::jsonb,
  typography_hierarchy jsonb default '{}'::jsonb,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists image_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  asset_type image_asset_type not null,
  source image_asset_source not null,
  file_url text not null,
  width integer null,
  height integer null,
  dominant_colors jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists image_compositions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  base_asset_id uuid references image_assets(id) on delete set null,
  image_profile_id uuid references image_profiles(id) on delete set null,
  mood_board_id uuid references mood_boards(id) on delete set null,
  layout_json jsonb not null default '{}'::jsonb,
  text_blocks jsonb default '[]'::jsonb,
  logo_overrides jsonb default '{}'::jsonb,
  output_asset_id uuid references image_assets(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists image_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  mood_board_id uuid references mood_boards(id) on delete set null,
  image_profile_id uuid references image_profiles(id) on delete set null,
  post_id uuid null,
  prompt text not null,
  negative_prompt text null,
  provider image_provider not null,
  model_name text not null,
  model_version text null,
  params jsonb default '{}'::jsonb,
  status image_generation_status not null default 'queued',
  error_message text null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists image_generation_outputs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references image_generation_jobs(id) on delete cascade,
  asset_id uuid references image_assets(id) on delete set null,
  variation_index integer not null default 0,
  seed text null,
  safety_score numeric(5,2) null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  description text null,
  status text not null default 'draft',
  starts_at timestamptz null,
  ends_at timestamptz null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists campaign_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  post_id uuid not null,
  created_at timestamptz default now(),
  unique (campaign_id, post_id)
);

create table if not exists post_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  option_index integer not null,
  title text null,
  post_content text not null,
  ai_model text null,
  generation_prompt text null,
  status post_option_status not null default 'proposed',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (post_id, option_index)
);

create table if not exists post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  version integer not null,
  title text null,
  post_content text not null,
  change_reason text null,
  source text not null default 'user',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (post_id, version)
);

create table if not exists post_approvals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  status approval_status not null,
  reviewer_id uuid references auth.users(id) on delete set null,
  notes text null,
  created_at timestamptz default now()
);

create table if not exists compliance_checks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  check_type compliance_check_type not null,
  status compliance_status not null,
  score numeric(5,2) null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  before_state jsonb default '{}'::jsonb,
  after_state jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  ip_address inet null,
  user_agent text null,
  created_at timestamptz default now()
);

create table if not exists linkedin_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text default 'linkedin',
  access_token text not null,
  refresh_token text null,
  expires_at timestamptz null,
  org_access_token text null,
  org_refresh_token text null,
  org_expires_at timestamptz null,
  member_urn text null,
  orgs jsonb default '[]'::jsonb,
  scopes jsonb default '[]'::jsonb,
  org_scopes jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  prompt text not null,
  title text null,
  post_content text not null,
  image_url text null,
  status text not null default 'draft',
  target_type text not null default 'person',
  target_urn text null,
  scheduled_for timestamptz null,
  posted_at timestamptz null,
  linkedin_post_urn text null,
  error_message text null,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'linkedin_analysis_runs_connection_id_fkey') then
    alter table linkedin_analysis_runs
      add constraint linkedin_analysis_runs_connection_id_fkey
      foreign key (connection_id) references linkedin_connections(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaign_posts_post_id_fkey') then
    alter table campaign_posts
      add constraint campaign_posts_post_id_fkey
      foreign key (post_id) references posts(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'post_options_post_id_fkey') then
    alter table post_options
      add constraint post_options_post_id_fkey
      foreign key (post_id) references posts(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'post_versions_post_id_fkey') then
    alter table post_versions
      add constraint post_versions_post_id_fkey
      foreign key (post_id) references posts(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'post_approvals_post_id_fkey') then
    alter table post_approvals
      add constraint post_approvals_post_id_fkey
      foreign key (post_id) references posts(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'compliance_checks_post_id_fkey') then
    alter table compliance_checks
      add constraint compliance_checks_post_id_fkey
      foreign key (post_id) references posts(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'image_generation_jobs_post_id_fkey') then
    alter table image_generation_jobs
      add constraint image_generation_jobs_post_id_fkey
      foreign key (post_id) references posts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_sources_post_id_fkey') then
    alter table content_sources
      add constraint content_sources_post_id_fkey
      foreign key (post_id) references posts(id) on delete set null;
  end if;
end $$;

alter table linkedin_connections
  add column if not exists last_analyzed_at timestamptz null;

alter table posts
  add column if not exists brand_id uuid references brands(id) on delete set null;
alter table posts
  add column if not exists brand_kit_id uuid references brand_kits(id) on delete set null;
alter table posts
  add column if not exists mood_board_id uuid references mood_boards(id) on delete set null;
alter table posts
  add column if not exists image_profile_id uuid references image_profiles(id) on delete set null;
alter table posts
  add column if not exists base_image_asset_id uuid references image_assets(id) on delete set null;
alter table posts
  add column if not exists composed_image_asset_id uuid references image_assets(id) on delete set null;
alter table posts
  add column if not exists image_composition_id uuid references image_compositions(id) on delete set null;
alter table posts
  add column if not exists image_generation_job_id uuid references image_generation_jobs(id) on delete set null;
alter table posts
  add column if not exists intent_locked_at timestamptz null;
alter table posts
  add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table posts
  add column if not exists approved_at timestamptz null;
alter table posts
  add column if not exists last_edited_at timestamptz null;
alter table posts
  add column if not exists content_version integer not null default 1;
alter table posts
  add column if not exists compliance_status text null;
alter table posts
  add column if not exists compliance_score numeric(5,2) null;
alter table posts
  add column if not exists visual_consistency_score numeric(5,2) null;
alter table posts
  add column if not exists brand_consistency_score numeric(5,2) null;
alter table posts
  add column if not exists auto_publish boolean not null default false;
alter table posts
  add column if not exists updated_at timestamptz default now();

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_brands_updated_at
  before update on brands
  for each row execute procedure public.set_updated_at();

create trigger update_marketing_identities_updated_at
  before update on marketing_identities
  for each row execute procedure public.set_updated_at();

create trigger update_brand_kits_updated_at
  before update on brand_kits
  for each row execute procedure public.set_updated_at();

create trigger update_mood_boards_updated_at
  before update on mood_boards
  for each row execute procedure public.set_updated_at();

create trigger update_image_profiles_updated_at
  before update on image_profiles
  for each row execute procedure public.set_updated_at();

create trigger update_image_compositions_updated_at
  before update on image_compositions
  for each row execute procedure public.set_updated_at();

create trigger update_image_generation_jobs_updated_at
  before update on image_generation_jobs
  for each row execute procedure public.set_updated_at();

create trigger update_campaigns_updated_at
  before update on campaigns
  for each row execute procedure public.set_updated_at();

create trigger update_posts_updated_at
  before update on posts
  for each row execute procedure public.set_updated_at();

create index if not exists idx_image_generation_jobs_brand_status
  on image_generation_jobs (brand_id, status, created_at desc);

create index if not exists idx_image_generation_outputs_job
  on image_generation_outputs (job_id, variation_index);

create index if not exists idx_content_sources_brand
  on content_sources (brand_id, created_at desc);

create index if not exists idx_content_sources_post
  on content_sources (post_id);

create index if not exists idx_content_sources_hash
  on content_sources (content_hash);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url, plan)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url', 'starter')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================================
-- FILE: schema_v2.sql
-- ============================================================================

-- PostCraft Database Schema
-- Complete schema for the SaaS LinkedIn posting application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & AUTH
-- ============================================

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- PLANS & CREDITS
-- ============================================

-- Plans definition
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_monthly INTEGER NOT NULL DEFAULT 0, -- in cents
    price_yearly INTEGER NOT NULL DEFAULT 0,  -- in cents
    credits_monthly INTEGER NOT NULL DEFAULT 0, -- -1 for unlimited
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default plans
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, credits_monthly, features) VALUES
    ('starter', 'Starter', 'Perfect for trying things out', 0, 0, 30, '["30 AI-generated posts/month", "Basic templates", "Manual copy & paste", "Community support"]'),
    ('pro', 'Pro', 'For serious content creators', 1900, 19000, 30, '["30 AI-generated posts/month", "Direct LinkedIn publishing", "Custom tone & style", "Analytics dashboard", "Image generation", "Priority support"]'),
    ('business', 'Business', 'For teams & agencies', 4900, 49000, -1, '["Unlimited posts", "Everything in Pro", "Multiple LinkedIn accounts", "Team collaboration", "Advanced analytics", "API access", "Dedicated support"]')
ON CONFLICT (id) DO NOTHING;

-- User subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'active', -- active, canceled, past_due, trialing
    stripe_subscription_id TEXT,
    stripe_customer_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Credits tracking
CREATE TABLE IF NOT EXISTS public.credit_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    credits_remaining INTEGER NOT NULL DEFAULT 0,
    credits_used_this_period INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    period_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits" ON public.credit_balances
    FOR SELECT USING (auth.uid() = user_id);

-- Credit transactions (ledger)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- positive for additions, negative for usage
    balance_after INTEGER NOT NULL,
    transaction_type TEXT NOT NULL, -- 'subscription_grant', 'post_generation', 'refund', 'purchase', 'adjustment'
    description TEXT,
    reference_id UUID, -- Reference to post_id or other entity
    idempotency_key TEXT, -- Prevent duplicate transactions
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.credit_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_idempotency 
ON public.credit_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================
-- LINKEDIN CONNECTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.linkedin_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    linkedin_member_id TEXT NOT NULL,
    linkedin_member_urn TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
    profile_name TEXT,
    profile_headline TEXT,
    profile_picture_url TEXT,
    profile_vanity_name TEXT,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, linkedin_member_id)
);

-- Enable RLS
ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own LinkedIn connections" ON public.linkedin_connections
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- POSTS
-- ============================================

CREATE TYPE post_status AS ENUM ('draft', 'pending', 'publishing', 'published', 'failed', 'scheduled');

CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Content
    content TEXT NOT NULL,
    image_url TEXT,
    hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Generation metadata
    topic TEXT,
    tone TEXT,
    template TEXT,
    generation_prompt TEXT,
    
    -- Status tracking
    status post_status DEFAULT 'draft',
    scheduled_for TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    
    -- LinkedIn data
    linkedin_connection_id UUID REFERENCES public.linkedin_connections(id) ON DELETE SET NULL,
    linkedin_post_urn TEXT,
    linkedin_share_url TEXT,
    
    -- Engagement (from LinkedIn API)
    engagement_views INTEGER DEFAULT 0,
    engagement_likes INTEGER DEFAULT 0,
    engagement_comments INTEGER DEFAULT 0,
    engagement_shares INTEGER DEFAULT 0,
    engagement_updated_at TIMESTAMPTZ,
    
    -- Error tracking
    error_message TEXT,
    error_code TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    
    -- Idempotency
    idempotency_key TEXT UNIQUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own posts" ON public.posts
    FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_status ON public.posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON public.posts(status, scheduled_for) WHERE status = 'scheduled';

-- ============================================
-- ACTIVITY LOGS
-- ============================================

CREATE TYPE activity_type AS ENUM (
    'post_created',
    'post_published', 
    'post_failed',
    'post_scheduled',
    'credit_used',
    'credit_granted',
    'login',
    'linkedin_connected',
    'linkedin_disconnected',
    'subscription_created',
    'subscription_canceled',
    'subscription_updated'
);

CREATE TYPE activity_status AS ENUM ('success', 'error', 'warning', 'info');

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type activity_type NOT NULL,
    status activity_status NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    reference_id UUID, -- Reference to related entity
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity" ON public.activity_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Index for querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id, created_at DESC);

-- ============================================
-- PUBLISH QUEUE
-- ============================================

CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'canceled');

CREATE TABLE IF NOT EXISTS public.publish_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    linkedin_connection_id UUID NOT NULL REFERENCES public.linkedin_connections(id) ON DELETE CASCADE,
    status queue_status DEFAULT 'pending',
    priority INTEGER DEFAULT 0, -- Higher = more priority
    scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.publish_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own queue items" ON public.publish_queue
    FOR SELECT USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_publish_queue_pending ON public.publish_queue(status, scheduled_for, priority DESC) 
    WHERE status = 'pending';

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_credit_balances_updated_at BEFORE UPDATE ON public.credit_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_linkedin_connections_updated_at BEFORE UPDATE ON public.linkedin_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_publish_queue_updated_at BEFORE UPDATE ON public.publish_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    
    -- Create default credit balance (starter pack)
    INSERT INTO public.credit_balances (user_id, credits_remaining, period_end)
    VALUES (NEW.id, 3, NOW() + INTERVAL '100 years');
    
    -- Create starter subscription
    INSERT INTO public.subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, 'starter', 'active');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to use credits
CREATE OR REPLACE FUNCTION use_credit(
    p_user_id UUID,
    p_amount INTEGER DEFAULT 1,
    p_description TEXT DEFAULT 'Post generation',
    p_reference_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, remaining INTEGER, error_message TEXT) AS $$
DECLARE
    v_balance INTEGER;
    v_plan_credits INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
            SELECT credits_remaining INTO v_balance FROM public.credit_balances WHERE user_id = p_user_id;
            RETURN QUERY SELECT true, v_balance, NULL::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Get current balance
    SELECT credits_remaining INTO v_balance 
    FROM public.credit_balances 
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Check if user has unlimited credits
    SELECT p.credits_monthly INTO v_plan_credits
    FROM public.subscriptions s
    JOIN public.plans p ON s.plan_id = p.id
    WHERE s.user_id = p_user_id AND s.status = 'active';
    
    -- Unlimited credits
    IF v_plan_credits = -1 THEN
        v_new_balance := v_balance;
    ELSIF v_balance < p_amount THEN
        RETURN QUERY SELECT false, v_balance, 'Insufficient credits'::TEXT;
        RETURN;
    ELSE
        v_new_balance := v_balance - p_amount;
    END IF;
    
    -- Update balance
    UPDATE public.credit_balances
    SET credits_remaining = v_new_balance,
        credits_used_this_period = credits_used_this_period + p_amount
    WHERE user_id = p_user_id;
    
    -- Record transaction
    INSERT INTO public.credit_transactions (
        user_id, amount, balance_after, transaction_type, description, reference_id, idempotency_key
    ) VALUES (
        p_user_id, -p_amount, v_new_balance, 'post_generation', p_description, p_reference_id, p_idempotency_key
    );
    
    RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to grant credits (for subscription renewal)
CREATE OR REPLACE FUNCTION grant_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_description TEXT DEFAULT 'Subscription credits',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN true;
        END IF;
    END IF;

    -- Get current balance
    SELECT credits_remaining INTO v_balance 
    FROM public.credit_balances 
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Update balance
    UPDATE public.credit_balances
    SET credits_remaining = v_balance + p_amount,
        credits_used_this_period = 0,
        period_start = NOW(),
        period_end = NOW() + INTERVAL '1 month'
    WHERE user_id = p_user_id;
    
    -- Record transaction
    INSERT INTO public.credit_transactions (
        user_id, amount, balance_after, transaction_type, description, idempotency_key
    ) VALUES (
        p_user_id, p_amount, v_balance + p_amount, 'subscription_grant', p_description, p_idempotency_key
    );
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- FILE: setup-complete.sql
-- ============================================================================

-- ============================================================================
-- COMPLETE PRO STUDIO DATABASE SETUP
-- ============================================================================
-- Run this ONCE in your Supabase SQL Editor (https://supabase.com/dashboard)
-- This is idempotent â€” safe to run multiple times.
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
  -- Rename 'type' â†’ 'asset_type' (if old column exists)
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

  -- Rename 'url' â†’ 'file_url' (if old column exists)
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
-- 5. ALTER TABLE â€” add columns to posts (safe, uses IF NOT EXISTS)
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


-- ============================================================================
-- FILE: rls.sql
-- ============================================================================

alter table profiles enable row level security;
alter table linkedin_connections enable row level security;
alter table posts enable row level security;
alter table brands enable row level security;
alter table brand_members enable row level security;
alter table marketing_identities enable row level security;
alter table brand_kits enable row level security;
alter table mood_boards enable row level security;
alter table marketing_dna enable row level security;
alter table linkedin_mood_profiles enable row level security;
alter table linkedin_analysis_runs enable row level security;
alter table image_profiles enable row level security;
alter table image_assets enable row level security;
alter table image_compositions enable row level security;
alter table image_generation_jobs enable row level security;
alter table image_generation_outputs enable row level security;
alter table content_sources enable row level security;
alter table campaigns enable row level security;
alter table campaign_posts enable row level security;
alter table post_options enable row level security;
alter table post_versions enable row level security;
alter table post_approvals enable row level security;
alter table compliance_checks enable row level security;
alter table audit_logs enable row level security;

create policy "profiles_select_own" on profiles
  for select
  using (auth.uid() = id);

create policy "profiles_update_own" on profiles
  for update
  using (auth.uid() = id);

create policy "linkedin_select_own" on linkedin_connections
  for select
  using (auth.uid() = user_id);

create policy "linkedin_insert_own" on linkedin_connections
  for insert
  with check (auth.uid() = user_id);

create policy "linkedin_update_own" on linkedin_connections
  for update
  using (auth.uid() = user_id);

create policy "linkedin_delete_own" on linkedin_connections
  for delete
  using (auth.uid() = user_id);

create policy "posts_select_own" on posts
  for select
  using (auth.uid() = user_id);

create policy "posts_insert_own" on posts
  for insert
  with check (auth.uid() = user_id);

create policy "posts_update_own" on posts
  for update
  using (auth.uid() = user_id);

create policy "posts_delete_own" on posts
  for delete
  using (auth.uid() = user_id);

-- ============================================
-- BRANDS & MEMBERSHIP
-- ============================================

create policy "brands_select_member" on brands
  for select
  using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from brand_members bm
      where bm.brand_id = brands.id
        and bm.user_id = auth.uid()
    )
  );

create policy "brands_insert_owner" on brands
  for insert
  with check (auth.uid() = owner_user_id);

create policy "brands_update_admin" on brands
  for update
  using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from brand_members bm
      where bm.brand_id = brands.id
        and bm.user_id = auth.uid()
        and bm.role in ('owner', 'admin')
    )
  );

create policy "brands_delete_owner" on brands
  for delete
  using (auth.uid() = owner_user_id);

create policy "brand_members_select" on brand_members
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from brands b
      where b.id = brand_members.brand_id
        and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from brand_members bm
      where bm.brand_id = brand_members.brand_id
        and bm.user_id = auth.uid()
        and bm.role in ('owner', 'admin')
    )
  );

create policy "brand_members_insert_admin" on brand_members
  for insert
  with check (
    exists (
      select 1 from brands b
      where b.id = brand_members.brand_id
        and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from brand_members bm
      where bm.brand_id = brand_members.brand_id
        and bm.user_id = auth.uid()
        and bm.role in ('owner', 'admin')
    )
  );

create policy "brand_members_update_admin" on brand_members
  for update
  using (
    exists (
      select 1 from brands b
      where b.id = brand_members.brand_id
        and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from brand_members bm
      where bm.brand_id = brand_members.brand_id
        and bm.user_id = auth.uid()
        and bm.role in ('owner', 'admin')
    )
  );

create policy "brand_members_delete_admin" on brand_members
  for delete
  using (
    exists (
      select 1 from brands b
      where b.id = brand_members.brand_id
        and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from brand_members bm
      where bm.brand_id = brand_members.brand_id
        and bm.user_id = auth.uid()
        and bm.role in ('owner', 'admin')
    )
  );

-- ============================================
-- BRAND CONFIGURATION
-- ============================================

create policy "marketing_identities_select" on marketing_identities
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = marketing_identities.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "marketing_identities_write_admin" on marketing_identities
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = marketing_identities.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = marketing_identities.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin')
          )
        )
    )
  );

create policy "brand_kits_select" on brand_kits
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = brand_kits.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "brand_kits_write_admin" on brand_kits
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = brand_kits.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = brand_kits.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin')
          )
        )
    )
  );

create policy "mood_boards_select" on mood_boards
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = mood_boards.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "mood_boards_write_editor" on mood_boards
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = mood_boards.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = mood_boards.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

-- ============================================
-- MARKETING DNA & ANALYSIS
-- ============================================

create policy "marketing_dna_select" on marketing_dna
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = marketing_dna.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "marketing_dna_write_editor" on marketing_dna
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = marketing_dna.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = marketing_dna.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "linkedin_mood_profiles_select" on linkedin_mood_profiles
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = linkedin_mood_profiles.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "linkedin_mood_profiles_write_editor" on linkedin_mood_profiles
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = linkedin_mood_profiles.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = linkedin_mood_profiles.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "linkedin_analysis_runs_select" on linkedin_analysis_runs
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = linkedin_analysis_runs.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "linkedin_analysis_runs_write_editor" on linkedin_analysis_runs
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = linkedin_analysis_runs.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = linkedin_analysis_runs.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

-- ============================================
-- IMAGE WORKFLOWS
-- ============================================

create policy "image_profiles_select" on image_profiles
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = image_profiles.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "image_profiles_write_editor" on image_profiles
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = image_profiles.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = image_profiles.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "image_assets_select" on image_assets
  for select
  using (
    (created_by = auth.uid())
    or exists (
      select 1 from brands b
      where b.id = image_assets.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "image_assets_write_editor" on image_assets
  for all
  using (
    (created_by = auth.uid())
    or exists (
      select 1 from brands b
      where b.id = image_assets.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    (created_by = auth.uid())
    or exists (
      select 1 from brands b
      where b.id = image_assets.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "image_compositions_select" on image_compositions
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = image_compositions.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "image_compositions_write_editor" on image_compositions
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = image_compositions.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = image_compositions.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "image_generation_jobs_select" on image_generation_jobs
  for select
  using (
    (created_by = auth.uid())
    or exists (
      select 1 from brands b
      where b.id = image_generation_jobs.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "image_generation_jobs_write_editor" on image_generation_jobs
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = image_generation_jobs.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = image_generation_jobs.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "image_generation_outputs_select" on image_generation_outputs
  for select
  using (
    exists (
      select 1 from image_generation_jobs j
      where j.id = image_generation_outputs.job_id
        and (
          j.created_by = auth.uid()
          or exists (
            select 1 from brands b
            where b.id = j.brand_id
              and (
                b.owner_user_id = auth.uid()
                or exists (
                  select 1 from brand_members bm
                  where bm.brand_id = b.id
                    and bm.user_id = auth.uid()
                )
              )
          )
        )
    )
  );

create policy "image_generation_outputs_write_editor" on image_generation_outputs
  for all
  using (
    exists (
      select 1 from image_generation_jobs j
      join brands b on b.id = j.brand_id
      where j.id = image_generation_outputs.job_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from image_generation_jobs j
      join brands b on b.id = j.brand_id
      where j.id = image_generation_outputs.job_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "content_sources_select" on content_sources
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = content_sources.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "content_sources_write_editor" on content_sources
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = content_sources.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = content_sources.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

-- ============================================
-- CAMPAIGNS
-- ============================================

create policy "campaigns_select" on campaigns
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = campaigns.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "campaigns_write_editor" on campaigns
  for all
  using (
    exists (
      select 1 from brands b
      where b.id = campaigns.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from brands b
      where b.id = campaigns.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "campaign_posts_select" on campaign_posts
  for select
  using (
    exists (
      select 1 from campaigns c
      join brands b on b.id = c.brand_id
      where c.id = campaign_posts.campaign_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "campaign_posts_write_editor" on campaign_posts
  for all
  using (
    exists (
      select 1 from campaigns c
      join brands b on b.id = c.brand_id
      where c.id = campaign_posts.campaign_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from campaigns c
      join brands b on b.id = c.brand_id
      where c.id = campaign_posts.campaign_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

-- ============================================
-- POSTS: TEAM ACCESS
-- ============================================

create policy "posts_select_brand" on posts
  for select
  using (
    exists (
      select 1 from brand_members bm
      where bm.brand_id = posts.brand_id
        and bm.user_id = auth.uid()
    )
    or exists (
      select 1 from brands b
      where b.id = posts.brand_id
        and b.owner_user_id = auth.uid()
    )
  );

create policy "posts_update_brand" on posts
  for update
  using (
    exists (
      select 1 from brand_members bm
      where bm.brand_id = posts.brand_id
        and bm.user_id = auth.uid()
        and bm.role in ('owner', 'admin', 'editor')
    )
    or exists (
      select 1 from brands b
      where b.id = posts.brand_id
        and b.owner_user_id = auth.uid()
    )
  );

create policy "posts_delete_brand" on posts
  for delete
  using (
    exists (
      select 1 from brand_members bm
      where bm.brand_id = posts.brand_id
        and bm.user_id = auth.uid()
        and bm.role in ('owner', 'admin')
    )
    or exists (
      select 1 from brands b
      where b.id = posts.brand_id
        and b.owner_user_id = auth.uid()
    )
  );

-- ============================================
-- POST OPTIONS & VERSIONS
-- ============================================

create policy "post_options_select" on post_options
  for select
  using (
    exists (
      select 1 from posts p
      where p.id = post_options.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "post_options_write" on post_options
  for all
  using (
    exists (
      select 1 from posts p
      where p.id = post_options.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from posts p
      where p.id = post_options.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "post_versions_select" on post_versions
  for select
  using (
    exists (
      select 1 from posts p
      where p.id = post_versions.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "post_versions_write" on post_versions
  for all
  using (
    exists (
      select 1 from posts p
      where p.id = post_versions.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from posts p
      where p.id = post_versions.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

-- ============================================
-- APPROVALS & COMPLIANCE
-- ============================================

create policy "post_approvals_select" on post_approvals
  for select
  using (
    exists (
      select 1 from posts p
      where p.id = post_approvals.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "post_approvals_write" on post_approvals
  for all
  using (
    exists (
      select 1 from posts p
      where p.id = post_approvals.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from posts p
      where p.id = post_approvals.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

create policy "compliance_checks_select" on compliance_checks
  for select
  using (
    exists (
      select 1 from posts p
      where p.id = compliance_checks.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "compliance_checks_write" on compliance_checks
  for all
  using (
    exists (
      select 1 from posts p
      where p.id = compliance_checks.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from posts p
      where p.id = compliance_checks.post_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = p.brand_id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );

-- ============================================
-- AUDIT LOGS
-- ============================================

create policy "audit_logs_select" on audit_logs
  for select
  using (
    exists (
      select 1 from brands b
      where b.id = audit_logs.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
          )
        )
    )
  );

create policy "audit_logs_insert" on audit_logs
  for insert
  with check (
    exists (
      select 1 from brands b
      where b.id = audit_logs.brand_id
        and (
          b.owner_user_id = auth.uid()
          or exists (
            select 1 from brand_members bm
            where bm.brand_id = b.id
              and bm.user_id = auth.uid()
              and bm.role in ('owner', 'admin', 'editor')
          )
        )
    )
  );


-- ============================================================================
-- FILE: meta-social.sql
-- ============================================================================

-- Meta (Facebook + Instagram) integration schema
-- Run after supabase/schema.sql and supabase/rls.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::JSONB,
  pages JSONB NOT NULL DEFAULT '[]'::JSONB,
  default_facebook_page_id TEXT NULL,
  default_instagram_account_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_connections_own" ON public.meta_connections;
CREATE POLICY "meta_connections_own" ON public.meta_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS publish_channels JSONB NOT NULL DEFAULT '["linkedin"]'::JSONB;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS facebook_page_id TEXT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS facebook_post_id TEXT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS instagram_account_id TEXT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS instagram_media_id TEXT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS publish_results JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_meta_connections_user
  ON public.meta_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_posts_facebook_page
  ON public.posts(facebook_page_id)
  WHERE facebook_page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_instagram_account
  ON public.posts(instagram_account_id)
  WHERE instagram_account_id IS NOT NULL;

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_meta_connections_updated_at ON public.meta_connections';
    EXECUTE '
      CREATE TRIGGER update_meta_connections_updated_at
      BEFORE UPDATE ON public.meta_connections
      FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at()
    ';
  END IF;
END $$;

COMMIT;


-- ============================================================================
-- FILE: robustness-upgrades.sql
-- ============================================================================

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


-- ============================================================================
-- FILE: studio-production-upgrades.sql
-- ============================================================================

-- Pro Studio production upgrades: evidence locker + runs + approvals + publish foundation
-- This migration is additive and keeps legacy publish_queue flows untouched.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'evidence_type') then
    create type public.evidence_type as enum ('pdf', 'image', 'url', 'note');
  end if;

  if not exists (select 1 from pg_type where typname = 'run_status') then
    create type public.run_status as enum ('DRAFT', 'IN_REVIEW', 'APPROVED');
  end if;

  if not exists (select 1 from pg_type where typname = 'publish_status') then
    create type public.publish_status as enum ('queued', 'sent', 'failed');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Brand settings
-- ---------------------------------------------------------------------------

alter table public.brands
  add column if not exists approval_required boolean not null default false;

alter table public.brands
  add column if not exists default_channels text[] not null default '{linkedin}';

-- ---------------------------------------------------------------------------
-- Evidence locker
-- ---------------------------------------------------------------------------

create table if not exists public.evidence_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  type public.evidence_type not null,
  title text not null,
  description text null,
  bucket text not null default 'general',
  tags text[] not null default '{}'::text[],
  file_path text null,
  url text null,
  note_text text null,
  created_at timestamptz not null default now(),
  constraint evidence_assets_payload_ck check (
    (type in ('pdf', 'image') and file_path is not null)
    or (type = 'url' and url is not null)
    or (type = 'note' and note_text is not null)
  )
);

create index if not exists idx_evidence_assets_brand_created
  on public.evidence_assets(brand_id, created_at desc);

create index if not exists idx_evidence_assets_owner_created
  on public.evidence_assets(owner_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Studio runs
-- ---------------------------------------------------------------------------

create table if not exists public.studio_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status public.run_status not null default 'DRAFT',
  approval_required boolean not null default false,
  primary_channel text not null default 'linkedin',
  selected_channels text[] not null default '{}'::text[],
  confirmed_post jsonb null,
  channel_variants jsonb null,
  confirmed_images jsonb null,
  template_id text null,
  editor_state jsonb null,
  evidence_ids uuid[] not null default '{}'::uuid[],
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  approval_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_studio_runs_brand_updated
  on public.studio_runs(brand_id, updated_at desc);

create index if not exists idx_studio_runs_owner_updated
  on public.studio_runs(owner_user_id, updated_at desc);

create index if not exists idx_studio_runs_status
  on public.studio_runs(status, created_at desc);

-- ---------------------------------------------------------------------------
-- Studio publish queue foundation
-- NOTE: uses a dedicated table to avoid breaking legacy publish_queue jobs.
-- ---------------------------------------------------------------------------

create table if not exists public.studio_publish_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.studio_runs(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_at timestamptz null,
  status public.publish_status not null default 'queued',
  last_error text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_studio_publish_queue_owner_created
  on public.studio_publish_queue(owner_user_id, created_at desc);

create index if not exists idx_studio_publish_queue_status_scheduled
  on public.studio_publish_queue(status, scheduled_at);

-- ---------------------------------------------------------------------------
-- Updated_at trigger for studio_runs
-- ---------------------------------------------------------------------------

create or replace function public.studio_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_studio_runs_updated_at on public.studio_runs;
create trigger trg_studio_runs_updated_at
before update on public.studio_runs
for each row
execute function public.studio_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.evidence_assets enable row level security;
alter table public.studio_runs enable row level security;
alter table public.studio_publish_queue enable row level security;

drop policy if exists evidence_assets_owner_all on public.evidence_assets;
create policy evidence_assets_owner_all
  on public.evidence_assets
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists studio_runs_owner_all on public.studio_runs;
create policy studio_runs_owner_all
  on public.studio_runs
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists studio_publish_queue_owner_all on public.studio_publish_queue;
create policy studio_publish_queue_owner_all
  on public.studio_publish_queue
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage buckets and policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('brand-evidence', 'brand-evidence', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('studio-renders', 'studio-renders', false)
on conflict (id) do nothing;

-- brand-evidence policies

drop policy if exists brand_evidence_owner_select on storage.objects;
create policy brand_evidence_owner_select
  on storage.objects
  for select
  using (
    bucket_id = 'brand-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists brand_evidence_owner_insert on storage.objects;
create policy brand_evidence_owner_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'brand-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists brand_evidence_owner_update on storage.objects;
create policy brand_evidence_owner_update
  on storage.objects
  for update
  using (
    bucket_id = 'brand-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'brand-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists brand_evidence_owner_delete on storage.objects;
create policy brand_evidence_owner_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'brand-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- studio-renders policies

drop policy if exists studio_renders_owner_select on storage.objects;
create policy studio_renders_owner_select
  on storage.objects
  for select
  using (
    bucket_id = 'studio-renders'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists studio_renders_owner_insert on storage.objects;
create policy studio_renders_owner_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'studio-renders'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists studio_renders_owner_update on storage.objects;
create policy studio_renders_owner_update
  on storage.objects
  for update
  using (
    bucket_id = 'studio-renders'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'studio-renders'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists studio_renders_owner_delete on storage.objects;
create policy studio_renders_owner_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'studio-renders'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================================
-- FILE: security-hardening.sql
-- ============================================================================

-- Supabase security hardening script
-- Run after schema setup (schema.sql + rls.sql, or setup-complete.sql, or schema_v2.sql).
-- This script is idempotent.

BEGIN;

-- ============================================================
-- 1) Ensure RLS is enabled on all app tables
-- ============================================================
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles',
    'brands',
    'brand_members',
    'marketing_identities',
    'brand_kits',
    'mood_boards',
    'marketing_dna',
    'content_sources',
    'linkedin_mood_profiles',
    'linkedin_analysis_runs',
    'image_profiles',
    'image_assets',
    'image_compositions',
    'image_generation_jobs',
    'image_generation_outputs',
    'campaigns',
    'campaign_posts',
    'posts',
    'post_options',
    'post_versions',
    'post_approvals',
    'compliance_checks',
    'audit_logs',
    'linkedin_connections',
    'brand_assets',
    'brand_memory_profiles',
    'plans',
    'subscriptions',
    'credit_balances',
    'credit_transactions',
    'activity_logs',
    'publish_queue',
    'meta_connections'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 2) Explicit CRUD policy set for plans (public read, service-only writes)
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "plans_select_public" ON public.plans';
    EXECUTE 'DROP POLICY IF EXISTS "plans_insert_service_only" ON public.plans';
    EXECUTE 'DROP POLICY IF EXISTS "plans_update_service_only" ON public.plans';
    EXECUTE 'DROP POLICY IF EXISTS "plans_delete_service_only" ON public.plans';

    EXECUTE '
      CREATE POLICY "plans_select_public"
      ON public.plans
      FOR SELECT
      TO anon, authenticated
      USING (true)
    ';

    EXECUTE '
      CREATE POLICY "plans_insert_service_only"
      ON public.plans
      FOR INSERT
      TO public
      WITH CHECK ((auth.jwt() ->> ''role'') = ''service_role'')
    ';

    EXECUTE '
      CREATE POLICY "plans_update_service_only"
      ON public.plans
      FOR UPDATE
      TO public
      USING ((auth.jwt() ->> ''role'') = ''service_role'')
      WITH CHECK ((auth.jwt() ->> ''role'') = ''service_role'')
    ';

    EXECUTE '
      CREATE POLICY "plans_delete_service_only"
      ON public.plans
      FOR DELETE
      TO public
      USING ((auth.jwt() ->> ''role'') = ''service_role'')
    ';
  END IF;
END $$;

-- ============================================================
-- 3) Normalize upgraded table policies to explicit CRUD policies
-- ============================================================
DO $$
DECLARE
  owner_check TEXT;
BEGIN
  IF to_regclass('public.brand_assets') IS NOT NULL THEN
    IF to_regprocedure('public.is_brand_owner(uuid)') IS NOT NULL THEN
      owner_check := 'public.is_brand_owner(brand_id)';
    ELSE
      owner_check := 'auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_user_id = auth.uid())';
    END IF;

    EXECUTE 'DROP POLICY IF EXISTS "brand_assets_all" ON public.brand_assets';
    EXECUTE 'DROP POLICY IF EXISTS "brand_assets_select_owner" ON public.brand_assets';
    EXECUTE 'DROP POLICY IF EXISTS "brand_assets_insert_owner" ON public.brand_assets';
    EXECUTE 'DROP POLICY IF EXISTS "brand_assets_update_owner" ON public.brand_assets';
    EXECUTE 'DROP POLICY IF EXISTS "brand_assets_delete_owner" ON public.brand_assets';

    EXECUTE format(
      'CREATE POLICY "brand_assets_select_owner" ON public.brand_assets FOR SELECT TO authenticated USING (%s)',
      owner_check
    );
    EXECUTE format(
      'CREATE POLICY "brand_assets_insert_owner" ON public.brand_assets FOR INSERT TO authenticated WITH CHECK (%s)',
      owner_check
    );
    EXECUTE format(
      'CREATE POLICY "brand_assets_update_owner" ON public.brand_assets FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      owner_check,
      owner_check
    );
    EXECUTE format(
      'CREATE POLICY "brand_assets_delete_owner" ON public.brand_assets FOR DELETE TO authenticated USING (%s)',
      owner_check
    );
  END IF;
END $$;

DO $$
DECLARE
  owner_check TEXT;
BEGIN
  IF to_regclass('public.brand_memory_profiles') IS NOT NULL THEN
    IF to_regprocedure('public.is_brand_owner(uuid)') IS NOT NULL THEN
      owner_check := 'public.is_brand_owner(brand_id)';
    ELSE
      owner_check := 'auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_user_id = auth.uid())';
    END IF;

    EXECUTE 'DROP POLICY IF EXISTS "brand_memory_profiles_all" ON public.brand_memory_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "brand_memory_profiles_select_owner" ON public.brand_memory_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "brand_memory_profiles_insert_owner" ON public.brand_memory_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "brand_memory_profiles_update_owner" ON public.brand_memory_profiles';
    EXECUTE 'DROP POLICY IF EXISTS "brand_memory_profiles_delete_owner" ON public.brand_memory_profiles';

    EXECUTE format(
      'CREATE POLICY "brand_memory_profiles_select_owner" ON public.brand_memory_profiles FOR SELECT TO authenticated USING (%s)',
      owner_check
    );
    EXECUTE format(
      'CREATE POLICY "brand_memory_profiles_insert_owner" ON public.brand_memory_profiles FOR INSERT TO authenticated WITH CHECK (%s)',
      owner_check
    );
    EXECUTE format(
      'CREATE POLICY "brand_memory_profiles_update_owner" ON public.brand_memory_profiles FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      owner_check,
      owner_check
    );
    EXECUTE format(
      'CREATE POLICY "brand_memory_profiles_delete_owner" ON public.brand_memory_profiles FOR DELETE TO authenticated USING (%s)',
      owner_check
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.meta_connections') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "meta_connections_own" ON public.meta_connections';
    EXECUTE 'DROP POLICY IF EXISTS "meta_connections_select_own" ON public.meta_connections';
    EXECUTE 'DROP POLICY IF EXISTS "meta_connections_insert_own" ON public.meta_connections';
    EXECUTE 'DROP POLICY IF EXISTS "meta_connections_update_own" ON public.meta_connections';
    EXECUTE 'DROP POLICY IF EXISTS "meta_connections_delete_own" ON public.meta_connections';

    EXECUTE '
      CREATE POLICY "meta_connections_select_own"
      ON public.meta_connections
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id)
    ';

    EXECUTE '
      CREATE POLICY "meta_connections_insert_own"
      ON public.meta_connections
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id)
    ';

    EXECUTE '
      CREATE POLICY "meta_connections_update_own"
      ON public.meta_connections
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)
    ';

    EXECUTE '
      CREATE POLICY "meta_connections_delete_own"
      ON public.meta_connections
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id)
    ';
  END IF;
END $$;

-- ============================================================
-- 4) Indexes for common policy predicate columns
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.brands') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brands_owner ON public.brands(owner_user_id)';
  END IF;

  IF to_regclass('public.brand_members') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brand_members_user_brand_role ON public.brand_members(user_id, brand_id, role)';
  END IF;

  IF to_regclass('public.marketing_identities') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_marketing_identities_brand ON public.marketing_identities(brand_id)';
  END IF;

  IF to_regclass('public.brand_kits') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brand_kits_brand ON public.brand_kits(brand_id)';
  END IF;

  IF to_regclass('public.mood_boards') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_mood_boards_brand ON public.mood_boards(brand_id)';
  END IF;

  IF to_regclass('public.marketing_dna') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_marketing_dna_brand ON public.marketing_dna(brand_id)';
  END IF;

  IF to_regclass('public.linkedin_mood_profiles') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_linkedin_mood_profiles_brand ON public.linkedin_mood_profiles(brand_id)';
  END IF;

  IF to_regclass('public.linkedin_analysis_runs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_linkedin_analysis_runs_brand ON public.linkedin_analysis_runs(brand_id, created_at DESC)';
  END IF;

  IF to_regclass('public.image_profiles') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_image_profiles_brand ON public.image_profiles(brand_id)';
  END IF;

  IF to_regclass('public.image_assets') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_image_assets_brand ON public.image_assets(brand_id, created_at DESC)';
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'image_assets'
        AND column_name = 'created_by'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_image_assets_created_by ON public.image_assets(created_by)';
    END IF;
  END IF;

  IF to_regclass('public.image_compositions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_image_compositions_brand ON public.image_compositions(brand_id, created_at DESC)';
  END IF;

  IF to_regclass('public.image_generation_jobs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_brand_status ON public.image_generation_jobs(brand_id, status, created_at DESC)';
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'image_generation_jobs'
        AND column_name = 'created_by'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_created_by ON public.image_generation_jobs(created_by)';
    END IF;
  END IF;

  IF to_regclass('public.image_generation_outputs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_image_generation_outputs_job ON public.image_generation_outputs(job_id, variation_index)';
  END IF;

  IF to_regclass('public.content_sources') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_content_sources_brand ON public.content_sources(brand_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_content_sources_post ON public.content_sources(post_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_content_sources_hash ON public.content_sources(content_hash)';
  END IF;

  IF to_regclass('public.campaigns') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON public.campaigns(brand_id, created_at DESC)';
  END IF;

  IF to_regclass('public.campaign_posts') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_campaign_posts_post ON public.campaign_posts(post_id)';
  END IF;

  IF to_regclass('public.posts') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'posts'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_user ON public.posts(user_id, created_at DESC)';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'posts'
        AND column_name = 'brand_id'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_posts_brand ON public.posts(brand_id, created_at DESC)';
    END IF;
  END IF;

  IF to_regclass('public.post_options') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_options_post ON public.post_options(post_id, option_index)';
  END IF;

  IF to_regclass('public.post_versions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_versions_post ON public.post_versions(post_id, created_at DESC)';
  END IF;

  IF to_regclass('public.post_approvals') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_post_approvals_post ON public.post_approvals(post_id, created_at DESC)';
  END IF;

  IF to_regclass('public.compliance_checks') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_compliance_checks_post ON public.compliance_checks(post_id, created_at DESC)';
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_brand ON public.audit_logs(brand_id, created_at DESC)';
  END IF;

  IF to_regclass('public.linkedin_connections') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_linkedin_connections_user ON public.linkedin_connections(user_id)';
  END IF;

  IF to_regclass('public.meta_connections') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_meta_connections_user ON public.meta_connections(user_id)';
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id)';
  END IF;

  IF to_regclass('public.credit_transactions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created ON public.credit_transactions(user_id, created_at DESC)';
  END IF;

  IF to_regclass('public.activity_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id, created_at DESC)';
  END IF;

  IF to_regclass('public.publish_queue') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_publish_queue_user_status ON public.publish_queue(user_id, status, scheduled_for)';
  END IF;
END $$;

-- ============================================================
-- 5) Harden SECURITY DEFINER helper functions
--    - fix search_path
--    - revoke direct execute from anon/authenticated where safe
-- ============================================================
DO $$
DECLARE
  fn RECORD;
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS function_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname = ANY (ARRAY[
        'is_brand_owner',
        'handle_new_user',
        'sync_brand_kit_logo_assets_from_links',
        'create_brand_logo_asset_atomic',
        'use_credit',
        'grant_credits'
      ])
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.schema_name,
      fn.function_name,
      fn.function_args
    );

    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
      fn.schema_name,
      fn.function_name,
      fn.function_args
    );

    IF has_anon THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
        fn.schema_name,
        fn.function_name,
        fn.function_args
      );
    END IF;

    -- is_brand_owner is used by policies; authenticated access is required there.
    IF fn.function_name = 'is_brand_owner' THEN
      IF has_authenticated THEN
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
          fn.schema_name,
          fn.function_name,
          fn.function_args
        );
      END IF;
    ELSE
      IF has_authenticated THEN
        EXECUTE format(
          'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
          fn.schema_name,
          fn.function_name,
          fn.function_args
        );
      END IF;
    END IF;

    IF has_service_role THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
        fn.schema_name,
        fn.function_name,
        fn.function_args
      );
    END IF;
  END LOOP;
END $$;

COMMIT;


-- ============================================================================
-- FILE: security-hardening-tests.sql
-- ============================================================================

-- Verification script for security-hardening.sql
-- Run this after executing supabase/security-hardening.sql.

-- ============================================================
-- 1) Metadata checks: RLS enabled + policy coverage
-- ============================================================
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'profiles',
    'brands',
    'brand_members',
    'posts',
    'brand_assets',
    'brand_memory_profiles',
    'plans',
    'meta_connections'
  )
ORDER BY c.relname;

SELECT
  tablename,
  array_agg(DISTINCT cmd ORDER BY cmd) AS policy_commands
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('plans', 'brand_assets', 'brand_memory_profiles', 'meta_connections')
GROUP BY tablename
ORDER BY tablename;

-- ============================================================
-- 2) SECURITY DEFINER execute privilege checks
-- ============================================================
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND p.proname IN (
    'is_brand_owner',
    'handle_new_user',
    'sync_brand_kit_logo_assets_from_links',
    'create_brand_logo_asset_atomic',
    'use_credit',
    'grant_credits'
  )
ORDER BY p.proname, function_args;

-- ============================================================
-- 3) Runtime checks by role context
-- ============================================================
-- anon context
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT auth.uid() AS anon_uid_should_be_null;
SELECT COUNT(*) AS anon_posts_visible FROM public.posts;
DO $$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL THEN
    RAISE NOTICE 'anon plans visible: %', (SELECT COUNT(*) FROM public.plans);
  END IF;
END $$;
ROLLBACK;

-- authenticated context (replace UUID with a real user id for deeper checks)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
SELECT auth.uid() AS authenticated_uid;
SELECT COUNT(*) AS authenticated_posts_visible FROM public.posts;
DO $$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL THEN
    RAISE NOTICE 'authenticated plans visible: %', (SELECT COUNT(*) FROM public.plans);
  END IF;
END $$;
ROLLBACK;

-- service_role context (bypasses RLS)
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT COUNT(*) AS service_role_posts_visible FROM public.posts;
DO $$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL THEN
    RAISE NOTICE 'service_role plans visible: %', (SELECT COUNT(*) FROM public.plans);
  END IF;
END $$;
ROLLBACK;

