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
