-- Meta (Facebook + Instagram) integration schema
-- Run after supabase/schema.sql and supabase/rls.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::JSONB,
  pages JSONB NOT NULL DEFAULT '[]'::JSONB,
  default_facebook_page_id TEXT NULL,
  default_instagram_account_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_connections_own" ON public.meta_connections;
CREATE POLICY "meta_connections_own" ON public.meta_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS publish_channels JSONB NOT NULL DEFAULT '["linkedin"]'::JSONB;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS facebook_page_id TEXT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS facebook_post_id TEXT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS instagram_account_id TEXT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS instagram_media_id TEXT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS publish_results JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_meta_connections_user
  ON public.meta_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_posts_facebook_page
  ON public.posts(facebook_page_id)
  WHERE facebook_page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_instagram_account
  ON public.posts(instagram_account_id)
  WHERE instagram_account_id IS NOT NULL;

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_meta_connections_updated_at ON public.meta_connections';
    EXECUTE '
      CREATE TRIGGER update_meta_connections_updated_at
      BEFORE UPDATE ON public.meta_connections
      FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at()
    ';
  END IF;
END $$;

COMMIT;
