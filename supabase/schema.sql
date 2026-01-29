create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  plan text not null default 'starter',
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
