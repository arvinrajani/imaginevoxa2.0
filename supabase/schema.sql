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
