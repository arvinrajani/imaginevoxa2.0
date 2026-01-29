alter table profiles enable row level security;
alter table linkedin_connections enable row level security;
alter table posts enable row level security;

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
