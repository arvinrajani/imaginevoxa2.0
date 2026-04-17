-- =============================================================
-- FULL SETUP: Database columns + tables + storage buckets + RLS
-- =============================================================

-- 1. Companies table additions
alter table public.companies
  add column if not exists logo_url text,
  add column if not exists website text,
  add column if not exists email text,
  add column if not exists industry text default 'general';

-- 2. Brands table additions
alter table public.brands
  add column if not exists logo_url text,
  add column if not exists industry_icons text[] default '{}';

-- 3. Background library table
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

-- 4. Storage buckets
insert into storage.buckets (id, name, public)
values
  ('company-logos', 'company-logos', true),
  ('brand-logos', 'brand-logos', true),
  ('banner-assets', 'banner-assets', true)
on conflict (id) do nothing;

-- 5. Storage RLS policies

-- company-logos
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'auth_upload_company_logos' and tablename = 'objects' and schemaname = 'storage') then
    create policy "auth_upload_company_logos" on storage.objects for insert to authenticated with check (bucket_id = 'company-logos');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'auth_update_company_logos' and tablename = 'objects' and schemaname = 'storage') then
    create policy "auth_update_company_logos" on storage.objects for update to authenticated using (bucket_id = 'company-logos');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'public_read_company_logos' and tablename = 'objects' and schemaname = 'storage') then
    create policy "public_read_company_logos" on storage.objects for select using (bucket_id = 'company-logos');
  end if;
end $$;

-- brand-logos
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'auth_upload_brand_logos' and tablename = 'objects' and schemaname = 'storage') then
    create policy "auth_upload_brand_logos" on storage.objects for insert to authenticated with check (bucket_id = 'brand-logos');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'auth_update_brand_logos' and tablename = 'objects' and schemaname = 'storage') then
    create policy "auth_update_brand_logos" on storage.objects for update to authenticated using (bucket_id = 'brand-logos');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'public_read_brand_logos' and tablename = 'objects' and schemaname = 'storage') then
    create policy "public_read_brand_logos" on storage.objects for select using (bucket_id = 'brand-logos');
  end if;
end $$;

-- banner-assets
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'auth_upload_banner_assets' and tablename = 'objects' and schemaname = 'storage') then
    create policy "auth_upload_banner_assets" on storage.objects for insert to authenticated with check (bucket_id = 'banner-assets');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'auth_update_banner_assets' and tablename = 'objects' and schemaname = 'storage') then
    create policy "auth_update_banner_assets" on storage.objects for update to authenticated using (bucket_id = 'banner-assets');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'public_read_banner_assets' and tablename = 'objects' and schemaname = 'storage') then
    create policy "public_read_banner_assets" on storage.objects for select using (bucket_id = 'banner-assets');
  end if;
end $$;
