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
