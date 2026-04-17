-- Banner generation system: company + brand columns + background library
-- Run in Supabase SQL editor

-- Companies table additions
alter table public.companies
  add column if not exists logo_url text,
  add column if not exists website text,
  add column if not exists email text,
  add column if not exists industry text default 'general';

-- Brands table additions
alter table public.brands
  add column if not exists logo_url text,
  add column if not exists industry_icons text[] default '{}';

-- Background library
create table if not exists public.banner_backgrounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null,
  storage_url text not null,
  preview_url text not null,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_banner_backgrounds_industry
  on public.banner_backgrounds (industry, is_active);

-- RLS policies
alter table public.banner_backgrounds enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'backgrounds_public_read'
      and tablename = 'banner_backgrounds'
  ) then
    create policy "backgrounds_public_read" on public.banner_backgrounds
      for select using (is_active = true);
  end if;
end $$;
