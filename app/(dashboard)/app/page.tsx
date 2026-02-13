'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Sparkles,
  TrendingUp,
  FileText,
  Linkedin,
  Clock,
  ArrowRight,
  Zap,
  CheckCircle,
  ChevronRight,
  CreditCard,
  Plus,
  AlertCircle,
  Trash2,
  Loader2,
  Target,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';

// Plan limits
const PLAN_LIMITS = {
  starter: { credits: 25, name: 'Starter' },
  pro: { credits: 30, name: 'Pro' },
  business: { credits: 60, name: 'Pro+' }
};

type Post = {
  id: string;
  prompt: string;
  title: string | null;
  post_content: string;
  status: string;
  created_at: string;
  posted_at: string | null;
};

type DashboardData = {
  userName: string;
  plan: 'starter' | 'pro' | 'business';
  postsThisMonth: number;
  totalPosts: number;
  linkedinConnected: boolean;
  recentPosts: Post[];
  creditsUsed: number;
  creditsTotal: number;
  statusCounts: {
    drafts: number;
    scheduled: number;
    posted: number;
    failed: number;
  };
};

const quickActions = [
  {
    title: 'Generate Post',
    description: 'Create AI-powered content',
    icon: Sparkles,
    href: '/app/generate',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    title: 'View Posts',
    description: 'Manage your content',
    icon: FileText,
    href: '/app/posts',
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    title: 'LinkedIn Status',
    description: 'Check connection',
    icon: Linkedin,
    href: '/app/linkedin',
    gradient: 'from-sky-500 to-blue-600',
  },
  {
    title: 'Metrics',
    description: 'Track engagement insights',
    icon: TrendingUp,
    href: '/app/metrics',
    gradient: 'from-emerald-500 to-teal-600',
  },
];

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  color = 'violet',
  loading = false
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: React.ElementType;
  color?: 'violet' | 'blue' | 'green' | 'amber';
  loading?: boolean;
}) {
  const colorClasses = {
    violet: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400',
    amber: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="bg-[#0b1234] rounded-2xl p-6 border border-white/10 shadow-sm hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`h-12 w-12 rounded-xl ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {loading ? (
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        </div>
      ) : (
        <>
          <p className="text-3xl font-bold text-white mb-1">{value}</p>
          <p className="text-sm text-slate-400">{title}</p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          )}
        </>
      )}
    </motion.div>
  );
}

function PostCard({ post }: { post: Post }) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[#0b1234] rounded-xl p-4 border border-white/10 hover:border-cyan-400/50 transition-colors"
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {post.status === 'posted' ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded-full">
                <CheckCircle className="h-3 w-3" />
                Published
              </span>
            ) : post.status === 'scheduled' ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded-full">
                <Clock className="h-3 w-3" />
                Scheduled
              </span>
            ) : post.status === 'failed' ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-2 py-1 rounded-full">
                <AlertCircle className="h-3 w-3" />
                Failed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-1 rounded-full">
                <Clock className="h-3 w-3" />
                Draft
              </span>
            )}
            <span className="text-xs text-slate-500">{formatDate(post.created_at)}</span>
          </div>
          <p className="text-sm text-slate-200 line-clamp-2">
            {post.post_content.length > 150 ? `${post.post_content.substring(0, 150)}...` : post.post_content}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link href="/app/posts">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[#0b1234] rounded-xl p-8 border border-white/10 text-center"
    >
      <div className="h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center mx-auto mb-4">
        <FileText className="h-8 w-8 text-violet-600 dark:text-violet-400" />
      </div>
      <h3 className="font-semibold text-white mb-2">No posts yet</h3>
      <p className="text-sm text-slate-400 mb-4">
        Create your first AI-powered LinkedIn post
      </p>
      <Button asChild className="bg-gradient-to-r from-violet-600 to-blue-600">
        <Link href="/app/generate">
          <Plus className="h-4 w-4 mr-2" />
          Create Post
        </Link>
      </Button>
    </motion.div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [daysUntilReset, setDaysUntilReset] = useState<number | null>(null);
  const [data, setData] = useState<DashboardData>({
    userName: '',
    plan: 'pro',
    postsThisMonth: 0,
    totalPosts: 0,
    linkedinConnected: false,
    recentPosts: [],
    creditsUsed: 0,
    creditsTotal: PLAN_LIMITS.pro.credits,
    statusCounts: { drafts: 0, scheduled: 0, posted: 0, failed: 0 }
  });

  const fetchDashboardData = async () => {
    const supabase = createClient();
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user profile
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .limit(1);
      const profile = profileRows?.[0] ?? null;

      // Get LinkedIn connection status
      const { data: linkedinRows } = await supabase
        .from('linkedin_connections')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      const linkedinConnection = linkedinRows?.[0] ?? null;

      // Get all posts by this user
      const { data: allPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // Calculate posts this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const postsThisMonth = allPosts?.filter(
        post => new Date(post.created_at) >= startOfMonth
      ).length || 0;

      // Get recent posts (last 5)
      const recentPosts = allPosts?.slice(0, 5) || [];
      const statusCounts = (allPosts || []).reduce(
        (acc, post) => {
          if (post.status === 'posted') acc.posted += 1;
          else if (post.status === 'scheduled') acc.scheduled += 1;
          else if (post.status === 'failed') acc.failed += 1;
          else acc.drafts += 1;
          return acc;
        },
        { drafts: 0, scheduled: 0, posted: 0, failed: 0 }
      );

      const plan: 'starter' | 'pro' | 'business' = 'pro';
      const creditsTotal = PLAN_LIMITS[plan].credits;
      const creditsUsed = postsThisMonth;

      setData({
        userName: profile?.full_name || user.email?.split('@')[0] || 'User',
        plan,
        postsThisMonth,
        totalPosts: allPosts?.length || 0,
        linkedinConnected: !!linkedinConnection,
        recentPosts,
        creditsUsed,
        creditsTotal,
        statusCounts
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllPosts = async () => {
    if (!confirm('Are you sure you want to delete ALL posts? This cannot be undone.')) return;
    
    setIsDeleting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('posts').delete().eq('user_id', user.id);
    
    setIsDeleting(false);
    fetchDashboardData();
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const days = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    setDaysUntilReset(days);
  }, []);

  const creditsRemaining = Math.max(0, data.creditsTotal - data.creditsUsed);
  const creditPercentage = data.creditsTotal > 0 ? (data.creditsUsed / data.creditsTotal) * 100 : 0;

  const focusActions = [
    {
      when: !data.linkedinConnected,
      title: 'Connect LinkedIn',
      description: 'Unlock direct publishing and real-time analytics.',
      cta: 'Connect now',
      href: '/app/linkedin',
    },
    {
      when: data.totalPosts === 0,
      title: 'Generate your first post',
      description: 'Start with a simple prompt and let Voxa do the heavy lifting.',
      cta: 'Create post',
      href: '/app/generate',
    },
    {
      when: creditsRemaining <= 3,
      title: 'Low credits remaining',
      description: 'Upgrade to avoid interruptions in your weekly cadence.',
      cta: 'Upgrade plan',
      href: '/pricing',
    },
    {
      when: data.statusCounts.scheduled < 2 && data.totalPosts > 0,
      title: 'Schedule your next post',
      description: 'Queue content to keep momentum on autopilot.',
      cta: 'Plan ahead',
      href: '/app/posts',
    },
  ];

  const focusAction = focusActions.find((action) => action.when);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        className="mb-8"
        title={
          loading ? (
            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-8 w-48 inline-block" />
          ) : (
            <>
              Welcome back, <span className="text-voxa-gradient">{data.userName}</span>! 👋
            </>
          )
        }
        subtitle="Here's what's happening with your content today."
        actions={
          <>
            {data.totalPosts > 0 && (
              <Button
                variant="outline"
                onClick={handleDeleteAllPosts}
                disabled={isDeleting}
                className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Posts
                  </>
                )}
              </Button>
            )}
            <Button asChild className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-lg shadow-violet-500/25">
              <Link href="/app/generate">
                <Plus className="h-4 w-4 mr-2" />
                New Post
              </Link>
            </Button>
          </>
        }
      />

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Credits Remaining"
          value={loading ? '...' : creditsRemaining}
          subtitle={loading ? '' : `${data.creditsUsed} used this month`}
          icon={CreditCard}
          color="violet"
          loading={loading}
        />
        <StatCard
          title="Posts This Month"
          value={loading ? '...' : data.postsThisMonth}
          icon={FileText}
          color="blue"
          loading={loading}
        />
        <StatCard
          title="Total Posts"
          value={loading ? '...' : data.totalPosts}
          icon={TrendingUp}
          color="green"
          loading={loading}
        />
        <StatCard
          title="LinkedIn Status"
          value={loading ? '...' : data.linkedinConnected ? 'Connected' : 'Not Connected'}
          icon={Linkedin}
          color="amber"
          loading={loading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Posts - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Recent Posts
            </h2>
            {data.recentPosts.length > 0 && (
              <Link href="/app/posts" className="text-sm text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#0b1234] rounded-xl p-4 border border-white/10 animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-3" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : data.recentPosts.length > 0 ? (
            <div className="space-y-3">
              {data.recentPosts.map((post, i) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <PostCard post={post} />
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {focusAction && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-[#0b1234] rounded-2xl p-6 border border-white/10"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-cyan-100/80 flex items-center justify-center">
                  <Target className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Voxa Focus</p>
                  <p className="text-sm font-semibold text-white">{focusAction.title}</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-4">{focusAction.description}</p>
              <Button asChild className="w-full bg-voxa-gradient text-white hover:opacity-90">
                <Link href={focusAction.href}>
                  {focusAction.cta}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-[#0b1234] rounded-2xl p-6 border border-white/10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-cyan-200" />
                <p className="font-semibold text-white">Content Pipeline</p>
              </div>
              <span className="text-xs text-slate-500">{data.totalPosts} total</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-slate-400">Drafts</p>
                <p className="text-lg font-semibold text-white">{data.statusCounts.drafts}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-slate-400">Scheduled</p>
                <p className="text-lg font-semibold text-white">{data.statusCounts.scheduled}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-slate-400">Published</p>
                <p className="text-lg font-semibold text-white">{data.statusCounts.posted}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-slate-400">Needs review</p>
                <p className="text-lg font-semibold text-white">{data.statusCounts.failed}</p>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              Quick Actions
            </h2>
            <div className="space-y-3">
              {quickActions.map((action, i) => (
                <motion.div
                  key={action.title}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Link href={action.href}>
                    <div className="group bg-[#0b1234] rounded-xl p-4 border border-white/10 hover:border-cyan-400/50 transition-all hover:shadow-md">
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${action.gradient} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                          <action.icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-white">
                            {action.title}
                          </p>
                          <p className="text-xs text-slate-400">
                            {action.description}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-cyan-300 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Credit Usage */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-voxa-gradient rounded-2xl p-6 text-white shadow-voxa"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Credit Usage</h3>
              <Zap className="h-5 w-5 text-slate-200" />
            </div>
            <div className="mb-4">
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-10 bg-white/20 rounded w-20 mb-2" />
                  <div className="h-3 bg-white/20 rounded-full mb-2" />
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-4xl font-bold">{creditsRemaining}</span>
                    <span className="text-slate-200">/ {data.creditsTotal}</span>
                  </div>
                  <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${100 - creditPercentage}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full bg-white rounded-full"
                    />
                  </div>
                  <p className="text-sm text-slate-200 mt-2">
                    Resets in {daysUntilReset ?? '--'} days • {PLAN_LIMITS[data.plan].name} Plan
                  </p>
                </>
              )}
            </div>
            {data.plan !== 'business' && (
              <Button asChild className="w-full bg-white/20 hover:bg-white/30 text-white border-0">
                <Link href="/pricing">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Upgrade Plan
                </Link>
              </Button>
            )}
          </motion.div>

          {/* LinkedIn Status Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-[#0b1234] rounded-2xl p-6 border border-white/10"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-xl bg-[#0077B5] flex items-center justify-center">
                <Linkedin className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white">LinkedIn</p>
                {loading ? (
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${data.linkedinConnected ? 'bg-green-500' : 'bg-slate-500'}`} />
                    <span className={`text-sm ${data.linkedinConnected ? 'text-green-400' : 'text-slate-400'}`}>
                      {data.linkedinConnected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              {data.linkedinConnected 
                ? 'Your account is connected and ready to publish posts directly.'
                : 'Connect your LinkedIn account to publish posts directly.'
              }
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/app/linkedin">
                {data.linkedinConnected ? 'Manage Connection' : 'Connect LinkedIn'}
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

