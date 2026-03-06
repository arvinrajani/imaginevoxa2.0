-- Critical Supabase fixes for workspace + chatbot flows
-- Run in Supabase SQL Editor (safe to run multiple times)

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- 1) Companies: remove duplicate owner rows and enforce unique owner company
-- ---------------------------------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brands
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

do $$
begin
  if to_regclass('public.companies') is null then
    return;
  end if;

  -- Repoint brand rows from duplicate company ids to the keeper id per owner.
  with ranked as (
    select
      id,
      owner_user_id,
      row_number() over (
        partition by owner_user_id
        order by coalesce(updated_at, created_at, now()) desc, id desc
      ) as rn
    from public.companies
  ),
  keepers as (
    select owner_user_id, id as keep_id
    from ranked
    where rn = 1
  ),
  duplicates as (
    select owner_user_id, id as duplicate_id
    from ranked
    where rn > 1
  )
  update public.brands b
  set company_id = k.keep_id
  from duplicates d
  join keepers k on k.owner_user_id = d.owner_user_id
  where b.company_id = d.duplicate_id;

  -- Delete duplicate companies after remapping references.
  delete from public.companies c
  using (
    select id
    from (
      select
        id,
        row_number() over (
          partition by owner_user_id
          order by coalesce(updated_at, created_at, now()) desc, id desc
        ) as rn
      from public.companies
    ) x
    where x.rn > 1
  ) d
  where c.id = d.id;
end $$;

do $$
begin
  if to_regclass('public.companies') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'unique_owner_company'
         and conrelid = 'public.companies'::regclass
     ) then
    alter table public.companies
      add constraint unique_owner_company unique (owner_user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Evidence assets table required by chatbot PDF uploads
-- ---------------------------------------------------------------------------

create table if not exists public.evidence_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  bucket text not null default 'general',
  tags text[] not null default '{}'::text[],
  file_path text,
  source_url text,
  note_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.evidence_assets
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.evidence_assets
  add column if not exists description text;
alter table public.evidence_assets
  add column if not exists bucket text not null default 'general';
alter table public.evidence_assets
  add column if not exists tags text[] not null default '{}'::text[];
alter table public.evidence_assets
  add column if not exists source_url text;
alter table public.evidence_assets
  add column if not exists note_text text;
alter table public.evidence_assets
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.evidence_assets
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'evidence_assets_payload_ck'
      and conrelid = 'public.evidence_assets'::regclass
  ) then
    alter table public.evidence_assets
      add constraint evidence_assets_payload_ck check (
        (type = 'pdf' and file_path is not null) or
        (type = 'image' and file_path is not null) or
        (type = 'url' and source_url is not null) or
        (type = 'note' and note_text is not null)
      );
  end if;
end $$;

create index if not exists idx_evidence_assets_brand_created
  on public.evidence_assets(brand_id, created_at desc);

create index if not exists idx_evidence_assets_owner_created
  on public.evidence_assets(owner_user_id, created_at desc);

alter table public.evidence_assets enable row level security;

drop policy if exists evidence_assets_owner_all on public.evidence_assets;
create policy evidence_assets_owner_all
  on public.evidence_assets
  for all
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Brand assets table required by brand logo management
-- ---------------------------------------------------------------------------

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  brand_kit_id uuid references public.brand_kits(id) on delete set null,
  kind text not null default 'logo',
  image_asset_id uuid references public.image_assets(id) on delete set null,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_assets_kind_check check (kind in ('logo', 'background', 'reference', 'base'))
);

alter table public.brand_assets
  add column if not exists brand_kit_id uuid references public.brand_kits(id) on delete set null;
alter table public.brand_assets
  add column if not exists image_asset_id uuid references public.image_assets(id) on delete set null;
alter table public.brand_assets
  add column if not exists is_primary boolean not null default false;
alter table public.brand_assets
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.brand_assets
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_brand_assets_brand_kind_created
  on public.brand_assets(brand_id, kind, created_at desc);

create unique index if not exists idx_brand_assets_primary_logo_per_brand
  on public.brand_assets(brand_id)
  where kind = 'logo' and is_primary = true;

alter table public.brand_assets enable row level security;

drop policy if exists brand_assets_owner_all on public.brand_assets;
create policy brand_assets_owner_all
  on public.brand_assets
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.brands b
      where b.id = brand_assets.brand_id
        and b.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.brands b
      where b.id = brand_assets.brand_id
        and b.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Chatbot schema compatibility
-- ---------------------------------------------------------------------------

alter table public.brands
  add column if not exists chatbot_enabled boolean not null default false;
alter table public.brands
  add column if not exists chatbot_slug text;
alter table public.brands
  add column if not exists chatbot_welcome_message text;

create unique index if not exists idx_brands_chatbot_slug_unique
  on public.brands (chatbot_slug)
  where chatbot_slug is not null and chatbot_slug <> '';

create table if not exists public.brand_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_file text not null,
  source_type text not null default 'pdf',
  chunk_text text not null,
  chunk_index integer not null default 0,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.brand_knowledge_chunks
  add column if not exists source_type text not null default 'pdf';

create index if not exists idx_brand_knowledge_chunks_brand_created
  on public.brand_knowledge_chunks (brand_id, created_at desc);

create index if not exists idx_brand_knowledge_chunks_brand_source
  on public.brand_knowledge_chunks (brand_id, source_type, created_at desc);

create table if not exists public.chatbot_sessions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  session_token text not null,
  visitor_metadata jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_chatbot_sessions_token
  on public.chatbot_sessions(session_token);

create index if not exists idx_chatbot_sessions_brand_created
  on public.chatbot_sessions(brand_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) Storage bucket required by PDF evidence uploads
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'brand-evidence',
  'brand-evidence',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]::text[]
where not exists (
  select 1 from storage.buckets where id = 'brand-evidence'
);
