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
