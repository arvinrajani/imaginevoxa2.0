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
