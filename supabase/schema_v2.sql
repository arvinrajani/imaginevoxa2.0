-- PostCraft Database Schema
-- Complete schema for the SaaS LinkedIn posting application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & AUTH
-- ============================================

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- PLANS & CREDITS
-- ============================================

-- Plans definition
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_monthly INTEGER NOT NULL DEFAULT 0, -- in cents
    price_yearly INTEGER NOT NULL DEFAULT 0,  -- in cents
    credits_monthly INTEGER NOT NULL DEFAULT 0, -- -1 for unlimited
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default plans
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, credits_monthly, features) VALUES
    ('starter', 'Starter', 'Perfect for trying things out', 0, 0, 3, '["3 AI-generated posts", "Basic templates", "Manual copy & paste", "Community support"]'),
    ('pro', 'Pro', 'For serious content creators', 1900, 19000, 50, '["50 AI-generated posts/month", "Direct LinkedIn publishing", "Custom tone & style", "Analytics dashboard", "Image generation", "Priority support"]'),
    ('business', 'Business', 'For teams & agencies', 4900, 49000, -1, '["Unlimited posts", "Everything in Pro", "Multiple LinkedIn accounts", "Team collaboration", "Advanced analytics", "API access", "Dedicated support"]')
ON CONFLICT (id) DO NOTHING;

-- User subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'active', -- active, canceled, past_due, trialing
    stripe_subscription_id TEXT,
    stripe_customer_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Credits tracking
CREATE TABLE IF NOT EXISTS public.credit_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    credits_remaining INTEGER NOT NULL DEFAULT 0,
    credits_used_this_period INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    period_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits" ON public.credit_balances
    FOR SELECT USING (auth.uid() = user_id);

-- Credit transactions (ledger)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- positive for additions, negative for usage
    balance_after INTEGER NOT NULL,
    transaction_type TEXT NOT NULL, -- 'subscription_grant', 'post_generation', 'refund', 'purchase', 'adjustment'
    description TEXT,
    reference_id UUID, -- Reference to post_id or other entity
    idempotency_key TEXT, -- Prevent duplicate transactions
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.credit_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- Index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_idempotency 
ON public.credit_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================
-- LINKEDIN CONNECTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.linkedin_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    linkedin_member_id TEXT NOT NULL,
    linkedin_member_urn TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
    profile_name TEXT,
    profile_headline TEXT,
    profile_picture_url TEXT,
    profile_vanity_name TEXT,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, linkedin_member_id)
);

-- Enable RLS
ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own LinkedIn connections" ON public.linkedin_connections
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- POSTS
-- ============================================

CREATE TYPE post_status AS ENUM ('draft', 'pending', 'publishing', 'published', 'failed', 'scheduled');

CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Content
    content TEXT NOT NULL,
    image_url TEXT,
    hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Generation metadata
    topic TEXT,
    tone TEXT,
    template TEXT,
    generation_prompt TEXT,
    
    -- Status tracking
    status post_status DEFAULT 'draft',
    scheduled_for TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    
    -- LinkedIn data
    linkedin_connection_id UUID REFERENCES public.linkedin_connections(id) ON DELETE SET NULL,
    linkedin_post_urn TEXT,
    linkedin_share_url TEXT,
    
    -- Engagement (from LinkedIn API)
    engagement_views INTEGER DEFAULT 0,
    engagement_likes INTEGER DEFAULT 0,
    engagement_comments INTEGER DEFAULT 0,
    engagement_shares INTEGER DEFAULT 0,
    engagement_updated_at TIMESTAMPTZ,
    
    -- Error tracking
    error_message TEXT,
    error_code TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    
    -- Idempotency
    idempotency_key TEXT UNIQUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own posts" ON public.posts
    FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_status ON public.posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON public.posts(status, scheduled_for) WHERE status = 'scheduled';

-- ============================================
-- ACTIVITY LOGS
-- ============================================

CREATE TYPE activity_type AS ENUM (
    'post_created',
    'post_published', 
    'post_failed',
    'post_scheduled',
    'credit_used',
    'credit_granted',
    'login',
    'linkedin_connected',
    'linkedin_disconnected',
    'subscription_created',
    'subscription_canceled',
    'subscription_updated'
);

CREATE TYPE activity_status AS ENUM ('success', 'error', 'warning', 'info');

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type activity_type NOT NULL,
    status activity_status NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    reference_id UUID, -- Reference to related entity
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity" ON public.activity_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Index for querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id, created_at DESC);

-- ============================================
-- PUBLISH QUEUE
-- ============================================

CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'canceled');

CREATE TABLE IF NOT EXISTS public.publish_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    linkedin_connection_id UUID NOT NULL REFERENCES public.linkedin_connections(id) ON DELETE CASCADE,
    status queue_status DEFAULT 'pending',
    priority INTEGER DEFAULT 0, -- Higher = more priority
    scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.publish_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own queue items" ON public.publish_queue
    FOR SELECT USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_publish_queue_pending ON public.publish_queue(status, scheduled_for, priority DESC) 
    WHERE status = 'pending';

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_credit_balances_updated_at BEFORE UPDATE ON public.credit_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_linkedin_connections_updated_at BEFORE UPDATE ON public.linkedin_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_publish_queue_updated_at BEFORE UPDATE ON public.publish_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    
    -- Create default credit balance (starter pack)
    INSERT INTO public.credit_balances (user_id, credits_remaining, period_end)
    VALUES (NEW.id, 3, NOW() + INTERVAL '100 years');
    
    -- Create starter subscription
    INSERT INTO public.subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, 'starter', 'active');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to use credits
CREATE OR REPLACE FUNCTION use_credit(
    p_user_id UUID,
    p_amount INTEGER DEFAULT 1,
    p_description TEXT DEFAULT 'Post generation',
    p_reference_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, remaining INTEGER, error_message TEXT) AS $$
DECLARE
    v_balance INTEGER;
    v_plan_credits INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
            SELECT credits_remaining INTO v_balance FROM public.credit_balances WHERE user_id = p_user_id;
            RETURN QUERY SELECT true, v_balance, NULL::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Get current balance
    SELECT credits_remaining INTO v_balance 
    FROM public.credit_balances 
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Check if user has unlimited credits
    SELECT p.credits_monthly INTO v_plan_credits
    FROM public.subscriptions s
    JOIN public.plans p ON s.plan_id = p.id
    WHERE s.user_id = p_user_id AND s.status = 'active';
    
    -- Unlimited credits
    IF v_plan_credits = -1 THEN
        v_new_balance := v_balance;
    ELSIF v_balance < p_amount THEN
        RETURN QUERY SELECT false, v_balance, 'Insufficient credits'::TEXT;
        RETURN;
    ELSE
        v_new_balance := v_balance - p_amount;
    END IF;
    
    -- Update balance
    UPDATE public.credit_balances
    SET credits_remaining = v_new_balance,
        credits_used_this_period = credits_used_this_period + p_amount
    WHERE user_id = p_user_id;
    
    -- Record transaction
    INSERT INTO public.credit_transactions (
        user_id, amount, balance_after, transaction_type, description, reference_id, idempotency_key
    ) VALUES (
        p_user_id, -p_amount, v_new_balance, 'post_generation', p_description, p_reference_id, p_idempotency_key
    );
    
    RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to grant credits (for subscription renewal)
CREATE OR REPLACE FUNCTION grant_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_description TEXT DEFAULT 'Subscription credits',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN true;
        END IF;
    END IF;

    -- Get current balance
    SELECT credits_remaining INTO v_balance 
    FROM public.credit_balances 
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Update balance
    UPDATE public.credit_balances
    SET credits_remaining = v_balance + p_amount,
        credits_used_this_period = 0,
        period_start = NOW(),
        period_end = NOW() + INTERVAL '1 month'
    WHERE user_id = p_user_id;
    
    -- Record transaction
    INSERT INTO public.credit_transactions (
        user_id, amount, balance_after, transaction_type, description, idempotency_key
    ) VALUES (
        p_user_id, p_amount, v_balance + p_amount, 'subscription_grant', p_description, p_idempotency_key
    );
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
