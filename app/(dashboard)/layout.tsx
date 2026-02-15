'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Linkedin,
  LayoutDashboard,
  FileText,
  Sparkles,
  Target,
  Settings,
  Activity,
  BarChart3,
  CreditCard,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Bell,
  HelpCircle,
  Zap,
  Loader2,
  Plus,
  LayoutTemplate
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedLogo } from '@/components/brand/animated-logo';
import { createClient } from '@/lib/supabase/client';

const baseNavigation = [
  { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
  { name: 'Generate', href: '/app/generate', icon: Sparkles },
  { name: 'Studio', href: '/app/studio', icon: LayoutTemplate },
  { name: 'Strategy', href: '/app/strategy', icon: Target },
  { name: 'My Posts', href: '/app/posts', icon: FileText },
  { name: 'LinkedIn', href: '/app/linkedin', icon: Linkedin },
  { name: 'Metrics', href: '/app/metrics', icon: BarChart3 },
  { name: 'Activity', href: '/app/activity', icon: Activity },
  { name: 'Settings', href: '/app/settings', icon: Settings },
];

const PLAN_LIMITS = {
  starter: { credits: 25, name: 'Starter' },
  pro: { credits: 30, name: 'Pro' },
  business: { credits: 60, name: 'Pro+' }
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [credits, setCredits] = useState({ used: 0, total: 25 });
  const [userPlan, setUserPlan] = useState<'starter' | 'pro' | 'business'>('starter');
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const navigation = useMemo(() => baseNavigation, []);

  const pageMeta = useMemo(() => {
    const metaMap: Array<{ match: string; title: string; subtitle: string }> = [
      { match: '/app/generate', title: 'Generate', subtitle: 'Craft a new post with Voxa AI.' },
      { match: '/app/studio', title: 'Pro Studio', subtitle: 'Human-in-the-loop brand and content control.' },
      { match: '/app/strategy', title: 'Strategy Lab', subtitle: 'Optimize content and build your campaign calendar.' },
      { match: '/app/posts', title: 'My Posts', subtitle: 'Review drafts, scheduled, and published posts.' },
      { match: '/app/linkedin', title: 'LinkedIn', subtitle: 'Manage your LinkedIn connections.' },
      { match: '/app/metrics', title: 'Metrics', subtitle: 'See your content performance at a glance.' },
      { match: '/app/activity', title: 'Activity', subtitle: 'Track everything happening in your workspace.' },
      { match: '/app/settings', title: 'Settings', subtitle: 'Profile, billing, and preferences.' },
      { match: '/app', title: 'Dashboard', subtitle: 'Your daily command center.' },
    ];

    return (
      metaMap.find((meta) => pathname.startsWith(meta.match)) ||
      { title: 'Workspace', subtitle: 'Welcome back to Voxa.' }
    );
  }, [pathname]);
  
  const creditPercentage = credits.total > 0 ? (credits.used / credits.total) * 100 : 0;

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const loginPath = `/login?next=${encodeURIComponent(pathname || '/app')}`;

    const redirectToLogin = () => {
      router.replace(loginPath);
    };

    const resolveSessionUser = async () => {
      const maxAttempts = 8;
      const retryDelayMs = 250;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          return sessionData.session.user;
        }

        const {
          data: { user: fetchedUser },
        } = await supabase.auth.getUser();

        if (fetchedUser) {
          return fetchedUser;
        }

        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }

      return null;
    };

    const checkAuth = async () => {
      try {
        const authUser = await resolveSessionUser();

        if (!authUser) {
          redirectToLogin();
          return;
        }

        // Profile data is best-effort and should not block authenticated access.
        let profile: { full_name?: string | null; plan?: string | null } | null = null;
        try {
          const { data: profileRows, error: profileError } = await supabase
            .from('profiles')
            .select('full_name, plan')
            .eq('id', authUser.id)
            .limit(1);
          if (!profileError) {
            profile = profileRows?.[0] ?? null;
          }
        } catch (error) {
          console.warn('Profile lookup failed, continuing with defaults.', error);
        }

        const rawPlan = String(profile?.plan ?? authUser.user_metadata?.plan ?? '').trim().toLowerCase();
        const normalizedPlan = rawPlan.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        const isBusinessPlan =
          normalizedPlan.includes('business') ||
          normalizedPlan.includes('pro+') ||
          normalizedPlan.includes('pro plus');
        const isStarterPlan =
          normalizedPlan.includes('starter') ||
          normalizedPlan.includes('free');
        const isProPlan =
          normalizedPlan.includes('pro') ||
          normalizedPlan.includes('professional');

        const plan: 'starter' | 'pro' | 'business' = isBusinessPlan
          ? 'business'
          : isStarterPlan
          ? 'starter'
          : isProPlan
          ? 'pro'
          : 'pro';
        if (!active) return;
        setUserPlan(plan);

        setUser({
          email: authUser.email || '',
          name: profile?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
        });

        // Post usage is also best-effort; keep app accessible if table/policies are not ready.
        let postsThisMonth = 0;
        try {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

          const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select('id')
            .eq('user_id', authUser.id)
            .gte('created_at', startOfMonth.toISOString());

          if (!postsError) {
            postsThisMonth = posts?.length || 0;
          }
        } catch (error) {
          console.warn('Posts lookup failed, continuing with defaults.', error);
        }

        if (!active) return;
        const planCredits = PLAN_LIMITS[plan].credits;
        setCredits({ used: postsThisMonth, total: planCredits });
        setIsLoading(false);
      } catch {
        if (!active) return;
        redirectToLogin();
      }
    };

    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        redirectToLogin();
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050821] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-300 mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050821]">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0b1234] border-r border-white/10 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-6 h-16 border-b border-white/10">
            <Link href="/app">
              <AnimatedLogo size="lg" />
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/5"
            >
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>

          {/* Credits Card */}
          <div className="px-4 py-4">
            <div className={`rounded-xl p-4 text-white ${
              userPlan === 'business' 
                ? 'bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600'
                : userPlan === 'pro'
                ? 'bg-voxa-gradient'
                : 'bg-[#1c244d]'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium opacity-90">
                  {PLAN_LIMITS[userPlan].name} Plan
                </span>
                <CreditCard className="h-4 w-4 opacity-80" />
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-bold">{Math.max(0, credits.total - credits.used)}</span>
                <span className="opacity-70">/ {credits.total}</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-3">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, 100 - creditPercentage))}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-white rounded-full"
                />
              </div>
              {userPlan !== 'business' && (
                <Link
                  href="/pricing"
                  className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <Zap className="h-4 w-4" />
                  {userPlan === 'starter' ? 'See Plans' : 'Upgrade Plan'}
                </Link>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/app' && pathname.startsWith(item.href));
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-200'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-cyan-200' : ''}`} />
                  {item.name}
                  {isActive && (
                    <ChevronRight className="h-4 w-4 ml-auto text-cyan-200/70" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold ${
                userPlan === 'business' 
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                : userPlan === 'pro'
                  ? 'bg-gradient-to-br from-violet-400 to-blue-500'
                : 'bg-gradient-to-br from-[#2a3563] to-[#1d254c]'
              }`}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {user?.email || 'No email'}
                </p>
                <p className={`text-[11px] truncate ${
                  userPlan === 'business' 
                    ? 'text-amber-300'
                  : userPlan === 'pro'
                    ? 'text-cyan-200'
                    : 'text-slate-400'
                }`}>
                  {PLAN_LIMITS[userPlan].name} Plan
                </p>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-72">
        {/* Top Bar */}
        <header className="sticky top-0 z-30">
          <div className="relative h-16 overflow-hidden bg-[#0b1234]/75 backdrop-blur-xl border-b border-white/10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(360px_120px_at_12%_0%,rgba(34,211,238,0.18),transparent_70%),radial-gradient(320px_120px_at_88%_0%,rgba(99,102,241,0.16),transparent_70%)]" />
            <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
            <div className="relative flex items-center justify-between h-full px-4 sm:px-6">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
              >
                <Menu className="h-5 w-5 text-slate-200" />
              </button>

              <div className="flex flex-col justify-center flex-1 px-2 sm:px-4">
                <h1 className="text-sm sm:text-base font-display font-semibold text-white tracking-tight">
                  <span className="text-voxa-gradient">{pageMeta.title}</span>
                </h1>
                <p className="hidden sm:block text-xs text-slate-300">
                  {pageMeta.subtitle}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  asChild
                  size="sm"
                  className="bg-voxa-gradient text-white hover:opacity-90 hidden sm:flex shadow-voxa"
                >
                  <Link href="/app/generate">
                    <Plus className="h-4 w-4" />
                    New Post
                  </Link>
                </Button>
                {/* Notification actions are non-navigational controls */}
                <button className="relative p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white">
                  <Bell className="h-5 w-5" />
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
                </button>
                <button className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white">
                  <HelpCircle className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
