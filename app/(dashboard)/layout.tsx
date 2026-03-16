'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertTriangle,
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
  MessageSquare,
  LayoutTemplate,
  Building2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AnimatedLogo } from '@/components/brand/animated-logo';
import type { BillingSnapshot } from '@/lib/billing/client';
import { useBillingSnapshot } from '@/lib/billing/use-billing-snapshot';
import { createClient } from '@/lib/supabase/client';
import { GlobalBrandSelector } from '@/components/dashboard/global-brand-selector';

const baseNavigation = [
  { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
  { name: 'Brands', href: '/app/brands', icon: Building2 },
  { name: 'Generate', href: '/app/generate', icon: Sparkles },
  { name: 'Studio', href: '/app/studio', icon: LayoutTemplate },
  { name: 'Strategy', href: '/app/strategy', icon: Target },
  { name: 'My Posts', href: '/app/posts', icon: FileText },
  { name: 'LinkedIn', href: '/app/linkedin', icon: Linkedin },
  { name: 'Meta', href: '/app/meta', icon: Zap },
  { name: 'AI Chatbot', href: '/app/settings/chatbot', icon: MessageSquare },
  { name: 'Activity', href: '/app/activity', icon: Activity },
  { name: 'Settings', href: '/app/settings', icon: Settings },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const {
    data: billing,
    error: billingError,
    refetch: refetchBilling,
  } = useBillingSnapshot();
  const previousBillingRef = useRef<BillingSnapshot | null>(null);

  const navigation = useMemo(() => baseNavigation, []);

  const pageMeta = useMemo(() => {
    const metaMap: Array<{ match: string; title: string; subtitle: string }> = [
      { match: '/app/generate', title: 'Generate', subtitle: 'Craft a new post with Voxa AI.' },
      { match: '/app/studio', title: 'Pro Studio', subtitle: 'Human-in-the-loop brand and content control.' },
      { match: '/app/strategy', title: 'Strategy Lab', subtitle: 'Optimize content and build your campaign calendar.' },
      { match: '/app/posts', title: 'My Posts', subtitle: 'Review drafts, scheduled, and published posts.' },
      { match: '/app/linkedin', title: 'LinkedIn', subtitle: 'Manage your LinkedIn connections.' },
      { match: '/app/activity', title: 'Activity', subtitle: 'Track everything happening in your workspace.' },
      { match: '/app/settings', title: 'Settings', subtitle: 'Profile, billing, and preferences.' },
      { match: '/app', title: 'Dashboard', subtitle: 'Your daily command center.' },
    ];

    return (
      metaMap.find((meta) => pathname.startsWith(meta.match)) ||
      { title: 'Workspace', subtitle: 'Welcome back to Voxa.' }
    );
  }, [pathname]);

  const userPlan = billing?.plan ?? 'starter';
  const creditsRemaining = billing?.creditsRemaining ?? 0;
  const creditsTotal = billing?.creditsTotal ?? 0;
  const creditsUsed = billing?.creditsUsed ?? 0;
  const creditsUnlimited = billing?.creditsUnlimited ?? false;
  const creditPercentage =
    !creditsUnlimited && creditsTotal > 0 ? (creditsUsed / creditsTotal) * 100 : 0;
  const primaryAlert = billing?.alerts[0] ?? null;
  const isUnauthorized =
    billingError instanceof Error && billingError.message.toLowerCase().includes('unauthorized');

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const loginPath = `/login?next=${encodeURIComponent(pathname || '/app')}`;

    const redirectToLogin = () => {
      if (typeof window !== 'undefined') {
        window.location.replace(loginPath);
        return;
      }
      router.replace(loginPath);
    };

    const authTimeout = window.setTimeout(() => {
      if (!active) return;
      setAuthLoading(false);
      redirectToLogin();
    }, 4000);

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
        window.clearTimeout(authTimeout);
        if (!active) return;
        setAuthLoading(false);

        if (!authUser) {
          redirectToLogin();
          return;
        }
        if (isUnauthorized) {
          redirectToLogin();
        }
      } catch {
        window.clearTimeout(authTimeout);
        if (!active) return;
        setAuthLoading(false);
        redirectToLogin();
      }
    };

    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        redirectToLogin();
        return;
      }
      void refetchBilling();
    });

    return () => {
      active = false;
      window.clearTimeout(authTimeout);
      authListener.subscription.unsubscribe();
    };
  }, [isUnauthorized, pathname, refetchBilling, router]);

  useEffect(() => {
    if (!billing) return;

    const previous = previousBillingRef.current;
    if (previous) {
      if (previous.plan !== billing.plan) {
        toast.success('Plan updated', {
          description: `You are now on the ${billing.planName} plan.`,
        });
      }

      if (
        !billing.creditsUnlimited &&
        !previous.creditsUnlimited &&
        billing.creditsRemaining > previous.creditsRemaining
      ) {
        const creditDelta = billing.creditsRemaining - previous.creditsRemaining;
        toast.success('Credits refreshed', {
          description: `${creditDelta} credit${creditDelta === 1 ? '' : 's'} added. ${billing.creditsRemaining} available now.`,
        });
      }

      if (
        !billing.creditsUnlimited &&
        previous.creditsRemaining > 3 &&
        billing.creditsRemaining <= 3
      ) {
        toast.warning('Credits running low', {
          description: `Only ${billing.creditsRemaining} credit${billing.creditsRemaining === 1 ? '' : 's'} remain this billing period.`,
        });
      }

      const previousStatus = String(previous.subscriptionStatus || '').toLowerCase();
      const currentStatus = String(billing.subscriptionStatus || '').toLowerCase();

      if (
        currentStatus &&
        currentStatus !== previousStatus &&
        ['active', 'trialing'].includes(currentStatus) &&
        previousStatus &&
        !['active', 'trialing'].includes(previousStatus)
      ) {
        toast.success('Billing updated', {
          description: 'Your subscription is active again.',
        });
      }

      if (
        currentStatus &&
        currentStatus !== previousStatus &&
        !['active', 'trialing'].includes(currentStatus)
      ) {
        toast.error('Payment needs attention', {
          description: `Subscription status: ${currentStatus.replace(/_/g, ' ')}.`,
        });
      }
    }

    previousBillingRef.current = billing;
  }, [billing]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleTopNav = (href: string) => {
    if (pathname === href) {
      router.refresh();
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    router.push(href);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-gray-900/20 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white/95 border-r border-gray-200/60 backdrop-blur-xl transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-6 h-16 border-b border-gray-200/60">
            <Link href="/app">
              <AnimatedLogo size="lg" />
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Credits Card */}
          <div className="px-4 py-4">
            <div className={`rounded-xl p-4 text-white ${userPlan === 'business'
              ? 'bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600'
              : userPlan === 'pro'
                ? 'bg-voxa-gradient'
                : 'bg-gradient-to-br from-gray-100 to-gray-200 !text-gray-900'
              }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium opacity-90">
                  {billing?.planName || 'Starter'} Plan
                </span>
                <CreditCard className="h-4 w-4 opacity-80" />
              </div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-bold">
                  {creditsUnlimited ? '∞' : Math.max(0, creditsRemaining)}
                </span>
                <span className="opacity-70">
                  {creditsUnlimited ? 'available' : `/ ${creditsTotal}`}
                </span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-3">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: creditsUnlimited ? '100%' : `${Math.max(0, Math.min(100, 100 - creditPercentage))}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-white rounded-full"
                />
              </div>
              {!creditsUnlimited && creditsRemaining <= 3 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50/20 border border-red-400/30 px-2.5 py-2 text-xs text-red-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
                  <span>
                    Only <strong>{creditsRemaining}</strong> credit{creditsRemaining === 1 ? '' : 's'} left this billing period.
                  </span>
                </div>
              )}
              {primaryAlert ? (
                <div className={`mb-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${primaryAlert.tone === 'error'
                    ? 'border-red-400/30 bg-red-50/20 text-red-100'
                    : primaryAlert.tone === 'warning'
                      ? 'border-amber-300/40 bg-amber-50/20 text-amber-50'
                      : primaryAlert.tone === 'success'
                        ? 'border-emerald-300/40 bg-emerald-50/20 text-emerald-50'
                        : 'border-white/20 bg-white/10 text-white'
                  }`}>
                  <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{primaryAlert.title}</span>
                </div>
              ) : null}
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

          {/* Global Brand Selector */}
          <GlobalBrandSelector />

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
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? 'text-cyan-600' : ''}`} />
                  {item.name}
                  {isActive && (
                    <ChevronRight className="h-4 w-4 ml-auto text-cyan-600/70" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="p-4 border-t border-gray-200/60">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold ${userPlan === 'business'
                ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                : userPlan === 'pro'
                  ? 'bg-gradient-to-br from-violet-400 to-blue-500'
                  : 'bg-gradient-to-br from-gray-500 to-gray-600'
                }`}>
                {billing?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {billing?.name || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {billing?.email || 'No email'}
                </p>
                <p className={`text-[11px] truncate ${userPlan === 'business'
                  ? 'text-amber-600'
                  : userPlan === 'pro'
                    ? 'text-cyan-600'
                    : 'text-gray-500'
                  }`}>
                  {billing?.planName || 'Starter'} Plan
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900"
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
          <div className="relative h-16 overflow-hidden bg-white/80 backdrop-blur-xl border-b border-gray-200/60">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(360px_120px_at_12%_0%,rgba(6,182,212,0.06),transparent_70%),radial-gradient(320px_120px_at_88%_0%,rgba(139,92,246,0.05),transparent_70%)]" />
            <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
            <div className="relative flex items-center justify-between h-full px-4 sm:px-6">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100"
              >
                <Menu className="h-5 w-5 text-gray-700" />
              </button>

              <div className="flex flex-col justify-center flex-1 px-2 sm:px-4">
                <h1 className="text-sm sm:text-base font-display font-semibold text-gray-900 tracking-tight">
                  <span className="text-voxa-gradient">{pageMeta.title}</span>
                </h1>
                <p className="hidden sm:block text-xs text-gray-500">
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
                <button
                  type="button"
                  onClick={() => handleTopNav('/app/activity')}
                  aria-label="Open activity notifications"
                  title="Open activity notifications"
                  className="relative p-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900"
                >
                  <Bell className="h-5 w-5" />
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
                </button>
                <button
                  type="button"
                  onClick={() => handleTopNav('/app/settings')}
                  aria-label="Open help and settings"
                  title="Open help and settings"
                  className="p-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-900"
                >
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
