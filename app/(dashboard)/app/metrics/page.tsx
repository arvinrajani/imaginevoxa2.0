'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Download,
  Eye,
  Heart,
  Lightbulb,
  Sparkles,
  MessageCircle,
  Target,
  RefreshCw,
  Share2,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/context/workspace-context';

type RangeOption = '30d' | '90d' | '365d';

type Post = {
  id: string;
  brand_id?: string | null;
  title: string | null;
  post_content: string;
  status: string;
  created_at: string;
  posted_at?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  engagement_views?: number | null;
  engagement_likes?: number | null;
  engagement_comments?: number | null;
  engagement_shares?: number | null;
  linkedin_post_urn?: string | null;
};

type Profile = {
  name: string;
  avatar: string;
  headline: string;
};

type LinkedInStatus = {
  connected: boolean;
};

const RANGE_LABELS: Record<RangeOption, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 12 months',
};

const RANGE_DAYS: Record<RangeOption, number> = {
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

const getFirstLine = (content: string) => {
  const line = content.split(/\r?\n/).find(Boolean) || '';
  return line.length > 140 ? `${line.slice(0, 140)}...` : line;
};

const getWordCount = (content: string) =>
  content.split(/\s+/).filter(Boolean).length;

const getHashtags = (content: string) =>
  Array.from(content.matchAll(/#[\w-]+/g)).map((match) => match[0].toLowerCase());

const hasHook = (content: string) => {
  const firstLine = getFirstLine(content).toLowerCase();
  return (
    firstLine.startsWith('how ') ||
    firstLine.startsWith('why ') ||
    firstLine.startsWith('what ') ||
    firstLine.includes('?') ||
    firstLine.includes('unpopular opinion') ||
    /^\d+/.test(firstLine) ||
    /[🔥✨🚀💡✅]/.test(firstLine)
  );
};

const hasCTA = (content: string) => {
  const lower = content.toLowerCase();
  return (
    lower.includes('what do you think') ||
    lower.includes('comment') ||
    lower.includes('share') ||
    lower.includes('follow') ||
    lower.includes('your thoughts') ||
    lower.includes('agree') ||
    lower.includes('disagree') ||
    lower.trim().endsWith('?')
  );
};

const getPostDate = (post: Post) => new Date(post.posted_at || post.created_at);

const buildLinePath = (values: number[], width: number, height: number, padding: number) => {
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = padding + step * index;
    const normalized = (value - min) / range;
    const y = padding + (height - padding * 2) * (1 - normalized);
    return { x, y };
  });

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const area = `${line} L ${padding + step * (values.length - 1)} ${height - padding} L ${padding} ${height - padding} Z`;

  return { line, area, points };
};

function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  delta?: number | null;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  const isPositive = typeof delta === 'number' && delta >= 0;

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        highlight
          ? 'bg-voxa-gradient text-white border-transparent shadow-voxa'
          : 'bg-white border-gray-200/60'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className={`h-10 w-10 rounded-xl flex items-center justify-center ${
            highlight ? 'bg-white/15' : 'bg-cyan-100/80'
          }`}
        >
          <Icon className={`h-5 w-5 ${highlight ? 'text-gray-900' : 'text-cyan-600'}`} />
        </div>
        {typeof delta === 'number' && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              highlight
                ? 'bg-white/15 text-white'
                : isPositive
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <p className={`text-sm ${highlight ? 'text-gray-800' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-gray-900' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  delta,
  icon: Icon,
  status,
}: {
  label: string;
  value: string;
  delta?: number | null;
  icon: React.ElementType;
  status?: string;
}) {
  const isPositive = typeof delta === 'number' && delta >= 0;

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200/60 bg-white p-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center">
          <Icon className="h-4 w-4 text-cyan-600" />
        </div>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-900">{value}</span>
        {typeof delta === 'number' ? (
          <span
            className={`text-xs font-semibold ${
              isPositive ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {isPositive ? '+' : '-'}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : status ? (
          <span className="text-xs text-gray-400">{status}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const { selectedBrand } = useWorkspace();
  const [range, setRange] = useState<RangeOption>('90d');
  const [profile, setProfile] = useState<Profile>({
    name: 'Creator',
    avatar: 'https://ui-avatars.com/api/?name=Creator&background=0A1742&color=fff',
    headline: 'LinkedIn analytics',
  });
  const [connection, setConnection] = useState<LinkedInStatus>({ connected: false });
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const loadUser = useCallback(async () => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.user) {
        return null;
      }
      return sessionData.session.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('aborted')) {
        return null;
      }
      return null;
    }
  }, [supabase]);

  const fetchMetrics = useCallback(async (withSync = true, silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }
    setError(null);
    setWarning(null);

    const user = await loadUser();
    if (!user) {
      setError('Please sign in to view metrics.');
      setIsRefreshing(false);
      return;
    }

    setUserId(user.id);

    const [{ data: profileRows }, { data: linkedinRows }] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).limit(1),
      supabase.from('linkedin_connections').select('*').eq('user_id', user.id).limit(1),
    ]);

    const profileRow = profileRows?.[0];
    const connectionRow = linkedinRows?.[0];

    if (withSync && connectionRow?.access_token) {
      try {
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload?.error || 'LinkedIn sync failed';
          throw new Error(message);
        }

        if (payload?.syncedAt) {
          setLastSyncedAt(payload.syncedAt);
        } else {
          setLastSyncedAt(new Date().toISOString());
        }

        if (payload?.errors?.length) {
          setError(payload.errors[0]);
        }
        if (payload?.warnings?.length) {
          const firstWarning = String(payload.warnings[0] || '');
          if (firstWarning.toLowerCase().includes('no analytics data returned')) {
            setWarning('LinkedIn has not returned analytics for some posts yet. Try again in a few minutes.');
          } else {
            setWarning(firstWarning);
          }
        }
      } catch (syncError) {
        console.error('Sync failed:', syncError);
        setError(syncError instanceof Error ? syncError.message : 'LinkedIn sync failed. Please try again.');
      }
    }

    let postsQuery = supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id);
    if (selectedBrand?.id) {
      postsQuery = postsQuery.eq('brand_id', selectedBrand.id);
    }

    const { data: postRows, error: postsError } = await postsQuery;

    if (postsError) {
      setError('Unable to load posts for analytics.');
    }

    setProfile({
      name: profileRow?.full_name || user.email?.split('@')[0] || 'Creator',
      avatar:
        profileRow?.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(profileRow?.full_name || 'User')}&background=0A1742&color=fff`,
      headline: connectionRow ? 'LinkedIn connected' : 'Connect LinkedIn to unlock analytics',
    });

    setConnection({ connected: Boolean(connectionRow) });
    setPosts((postRows as Post[]) || []);
    setIsRefreshing(false);
  }, [loadUser, selectedBrand?.id, supabase]);

  const refreshPosts = useCallback(async (id: string) => {
    let postsQuery = supabase
      .from('posts')
      .select('*')
      .eq('user_id', id);
    if (selectedBrand?.id) {
      postsQuery = postsQuery.eq('brand_id', selectedBrand.id);
    }
    const { data: postRows } = await postsQuery;
    setPosts((postRows as Post[]) || []);
  }, [selectedBrand?.id, supabase]);

  useEffect(() => {
    setIsLoading(true);
    fetchMetrics().finally(() => setIsLoading(false));
  }, [fetchMetrics]);

  useEffect(() => {
    if (!connection.connected || !userId) return;

    const fastInterval = setInterval(() => {
      fetchMetrics(false, true);
    }, 60 * 1000);

    const syncInterval = setInterval(() => {
      fetchMetrics(true, true);
    }, 5 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchMetrics(false, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(fastInterval);
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [connection.connected, userId, fetchMetrics]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('metrics-posts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts', filter: `user_id=eq.${userId}` },
        () => {
          refreshPosts(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshPosts, supabase]);

  const {
    totals,
    series,
    seriesLabel,
    topPosts,
    deltas,
    hasEngagement,
    insights,
  } = useMemo(() => {
    const now = new Date();
    const rangeDays = RANGE_DAYS[range];
    const rangeStart = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const prevRangeStart = new Date(rangeStart.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const prevRangeEnd = rangeStart;

    const inRange = (post: Post, start: Date, end: Date) => {
      const created = getPostDate(post);
      return created >= start && created < end;
    };

    const current = posts.filter((post) => inRange(post, rangeStart, now));
    const previous = posts.filter((post) => inRange(post, prevRangeStart, prevRangeEnd));

    const published = current.filter((post) => post.status === 'posted' || post.posted_at);
    const publishedPrev = previous.filter((post) => post.status === 'posted' || post.posted_at);
    const analysisPosts = published.length > 0 ? published : current;

    const sumMetric = (list: Post[], key: keyof Post) =>
      list.reduce((total, post) => total + Number(post[key] || 0), 0);

    const totalViews = sumMetric(published, 'engagement_views');
    const totalLikes = sumMetric(published, 'engagement_likes');
    const totalComments = sumMetric(published, 'engagement_comments');
    const totalShares = sumMetric(published, 'engagement_shares');
    const prevViews = sumMetric(publishedPrev, 'engagement_views');
    const prevLikes = sumMetric(publishedPrev, 'engagement_likes');
    const prevComments = sumMetric(publishedPrev, 'engagement_comments');
    const prevShares = sumMetric(publishedPrev, 'engagement_shares');
    const hasEngagementData = totalViews + totalLikes + totalComments + totalShares > 0;

    const weeks = Math.max(1, rangeDays / 7);
    const avgImpressions = published.length ? Math.round(totalViews / published.length) : 0;
    const avgLikes = published.length ? Math.round(totalLikes / published.length) : 0;
    const postsPerWeek = published.length ? Number((published.length / weeks).toFixed(1)) : 0;
    const engagementRate = totalViews
      ? Number((((totalLikes + totalComments + totalShares) / totalViews) * 100).toFixed(1))
      : 0;
    const prevEngagementRate = prevViews
      ? Number((((prevLikes + prevComments + prevShares) / prevViews) * 100).toFixed(1))
      : 0;
    const calcDelta = (currentValue: number, previousValue: number) =>
      previousValue > 0 ? Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1)) : null;

    const buildSeries = () => {
      if (range === '30d') {
        const days = Array.from({ length: rangeDays }).map((_, index) => {
          const start = new Date(rangeStart.getTime() + index * 24 * 60 * 60 * 1000);
          const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
          const dayPosts = published.filter((post) => {
            const created = getPostDate(post);
            return created >= start && created < end;
          });
          const value = hasEngagementData
            ? dayPosts.reduce((total, post) => total + Number(post.engagement_views || 0), 0)
            : dayPosts.length;
          return {
            label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value,
          };
        });

        return {
          labels: days.map((day) => day.label),
          values: days.map((day) => day.value),
          label: hasEngagementData ? 'Impressions per day' : 'Posts per day',
        };
      }

      if (range === '90d') {
        const weeks = Math.ceil(rangeDays / 7);
        const weekBuckets = Array.from({ length: weeks }).map((_, index) => {
          const start = new Date(rangeStart.getTime() + index * 7 * 24 * 60 * 60 * 1000);
          const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          const weekPosts = published.filter((post) => {
            const created = getPostDate(post);
            return created >= start && created < end;
          });
          const value = hasEngagementData
            ? weekPosts.reduce((total, post) => total + Number(post.engagement_views || 0), 0)
            : weekPosts.length;
          return {
            label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value,
          };
        });

        return {
          labels: weekBuckets.map((bucket) => bucket.label),
          values: weekBuckets.map((bucket) => bucket.value),
          label: hasEngagementData ? 'Impressions per week' : 'Posts per week',
        };
      }

      const months = Array.from({ length: 12 }).map((_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
        return {
          label: date.toLocaleString('en-US', { month: 'short' }),
          year: date.getFullYear(),
          month: date.getMonth(),
        };
      });

      const monthlyTotals = months.map((month) => {
        const monthPosts = published.filter((post) => {
          const created = getPostDate(post);
          return created.getFullYear() === month.year && created.getMonth() === month.month;
        });

        if (hasEngagementData) {
          return monthPosts.reduce((total, post) => total + Number(post.engagement_views || 0), 0);
        }

        return monthPosts.length;
      });

      return {
        labels: months.map((month) => month.label),
        values: monthlyTotals.map((value) => Number(value || 0)),
        label: hasEngagementData ? 'Impressions per month' : 'Posts per month',
      };
    };

    const seriesData = buildSeries();

    const sortedPosts = [...published].sort((a, b) => {
      const aScore =
        Number(a.engagement_likes || 0) +
        Number(a.engagement_comments || 0) +
        Number(a.engagement_shares || 0);
      const bScore =
        Number(b.engagement_likes || 0) +
        Number(b.engagement_comments || 0) +
        Number(b.engagement_shares || 0);

      if (aScore === bScore) {
        return getPostDate(b).getTime() - getPostDate(a).getTime();
      }
      return bScore - aScore;
    });

    const totalWords = analysisPosts.reduce((sum, post) => sum + getWordCount(post.post_content || ''), 0);
    const avgWords = analysisPosts.length ? Math.round(totalWords / analysisPosts.length) : 0;
    const totalHashtags = analysisPosts.reduce((sum, post) => sum + getHashtags(post.post_content || '').length, 0);
    const avgHashtags = analysisPosts.length ? Number((totalHashtags / analysisPosts.length).toFixed(1)) : 0;
    const hookRate = analysisPosts.length
      ? Math.round((analysisPosts.filter((post) => hasHook(post.post_content || '')).length / analysisPosts.length) * 100)
      : 0;
    const ctaRate = analysisPosts.length
      ? Math.round((analysisPosts.filter((post) => hasCTA(post.post_content || '')).length / analysisPosts.length) * 100)
      : 0;
    const mediaRate = analysisPosts.length
      ? Math.round(
          (analysisPosts.filter((post) => Boolean(post.image_url || post.video_url)).length / analysisPosts.length) * 100
        )
      : 0;

    const sortedDates = analysisPosts
      .map((post) => getPostDate(post))
      .sort((a, b) => a.getTime() - b.getTime());
    const gaps = sortedDates.slice(1).map((date, index) => {
      const prev = sortedDates[index];
      return (date.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    });
    const avgGap = gaps.length ? Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)) : 0;
    const cadenceScore = avgGap ? Math.max(0, Math.min(100, Math.round(100 - avgGap * 10))) : 0;
    const momentumScore = Math.round(
      (cadenceScore * 0.35 + hookRate * 0.25 + ctaRate * 0.2 + mediaRate * 0.2)
    );

    const dayCounts = analysisPosts.reduce<Record<string, number>>((acc, post) => {
      const day = getPostDate(post).toLocaleDateString('en-US', { weekday: 'short' });
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});
    const bestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    const hourCounts = analysisPosts.reduce<Record<number, number>>((acc, post) => {
      const hour = getPostDate(post).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});
    const bestHour = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: Number(hour), count }))
      .sort((a, b) => b.count - a.count)[0];
    const bestTime = bestHour
      ? new Date(0, 0, 0, bestHour.hour).toLocaleTimeString('en-US', { hour: 'numeric' })
      : '—';

    const hashtagCounts = analysisPosts
      .flatMap((post) => getHashtags(post.post_content || ''))
      .reduce<Record<string, number>>((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {});
    const topHashtags = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    return {
      totals: {
        posts: published.length,
        avgImpressions,
        avgLikes,
        postsPerWeek,
        views: totalViews,
        likes: totalLikes,
        comments: totalComments,
        shares: totalShares,
        engagementRate,
      },
      series: {
        labels: seriesData.labels,
        values: seriesData.values,
      },
      seriesLabel: seriesData.label,
      topPosts: sortedPosts.slice(0, 5),
      deltas: {
        views: calcDelta(totalViews, prevViews),
        likes: calcDelta(totalLikes, prevLikes),
        comments: calcDelta(totalComments, prevComments),
        engagementRate: calcDelta(engagementRate, prevEngagementRate),
      },
      hasEngagement: hasEngagementData,
      insights: {
        avgWords,
        avgHashtags,
        hookRate,
        ctaRate,
        mediaRate,
        cadenceScore,
        momentumScore,
        avgGap,
        bestDay,
        bestTime,
        topHashtags,
        usingDrafts: published.length === 0 && analysisPosts.length > 0,
      },
    };
  }, [posts, range]);

  const chart = useMemo(() => buildLinePath(series.values, 640, 220, 24), [series.values]);
  const linkedInPostCount = useMemo(
    () => posts.filter((post) => Boolean(post.linkedin_post_urn)).length,
    [posts]
  );

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-voxa-gradient p-[2px]">
              <div className="h-full w-full rounded-full bg-white p-1">
                <img src={profile.avatar} alt="Profile avatar" className="h-full w-full rounded-full object-cover" />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Metrics dashboard</p>
              <h1 className="text-2xl font-bold text-gray-900">LinkedIn metrics</h1>
              <p className="text-sm text-gray-500">{profile.name} - {profile.headline}</p>
              <p className="text-xs text-cyan-600 mt-1">
                Scope: {selectedBrand?.name || 'All brands'}
              </p>
              {lastSyncedAt && (
                <p className="text-xs text-gray-400 mt-1">
                  Last synced {new Date(lastSyncedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200/60 bg-gray-50 px-4 py-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4 text-cyan-600" />
              {RANGE_LABELS[range]}
            </div>
            <div className="inline-flex rounded-full border border-gray-200/60 bg-gray-50 p-1">
              {(['30d', '90d', '365d'] as RangeOption[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setRange(option)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition ${
                    range === option
                      ? 'bg-voxa-gradient text-white'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {option === '365d' ? '1Y' : option.toUpperCase()}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200/60 text-gray-700 hover:bg-gray-100"
              disabled={!connection.connected || !hasEngagement}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button size="sm" className="bg-voxa-gradient text-white hover:opacity-90" onClick={() => fetchMetrics(true)}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300/60 bg-rose-100 text-rose-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {warning && !error && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 text-amber-900/10 px-4 py-3 text-sm">
            {warning}
          </div>
        )}

        {connection.connected && linkedInPostCount === 0 && !isLoading && (
          <div className="rounded-xl border border-gray-200/60 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            No LinkedIn posts are available to sync yet. Publish at least one post through Voxa to see analytics here.
          </div>
        )}

        {!connection.connected && !isLoading && (
          <div className="rounded-2xl border border-gray-200/60 bg-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-cyan-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Connect LinkedIn to unlock engagement analytics
                </h2>
                <p className="text-sm text-gray-500">
                  Link your account to see impressions, likes, comments, and followers.
                </p>
              </div>
            </div>
            <Link href="/app/linkedin">
              <Button className="bg-voxa-gradient text-white hover:opacity-90">
                Connect LinkedIn
              </Button>
            </Link>
          </div>
        )}

        {connection.connected && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total posts" value={formatNumber(totals.posts)} icon={BarChart3} highlight />
              <MetricCard label="Average impressions" value={formatNumber(totals.avgImpressions)} icon={Eye} />
              <MetricCard label="Average likes" value={formatNumber(totals.avgLikes)} icon={Heart} />
              <MetricCard label="Posts per week" value={formatNumber(totals.postsPerWeek)} icon={TrendingUp} />
            </div>

            <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
              <div className="rounded-2xl border border-gray-200/60 bg-white p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Progression</h3>
                    <p className="text-sm text-gray-500">{seriesLabel}</p>
                    <p className="text-xs text-gray-400">
                      Source: {hasEngagement ? 'LinkedIn analytics sync' : 'Voxa post activity'}
                    </p>
                  </div>
                  {!hasEngagement && (
                    <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-cyan-600">
                      Post counts shown
                    </span>
                  )}
                </div>
                <div className="relative">
                  <svg viewBox="0 0 640 220" className="w-full h-56">
                    <defs>
                      <linearGradient id="voxaLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#19D5FF" />
                        <stop offset="55%" stopColor="#2474FF" />
                        <stop offset="100%" stopColor="#7A2BFF" />
                      </linearGradient>
                      <linearGradient id="voxaArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(25, 213, 255, 0.3)" />
                        <stop offset="100%" stopColor="rgba(122, 43, 255, 0.05)" />
                      </linearGradient>
                    </defs>
                    <path d={chart.area} fill="url(#voxaArea)" />
                    <path d={chart.line} fill="none" stroke="url(#voxaLine)" strokeWidth="3" />
                    {chart.points.map((point, index) => (
                      <circle key={index} cx={point.x} cy={point.y} r="4" fill="#19D5FF" />
                    ))}
                  </svg>
                  <div className="mt-2 grid grid-cols-6 text-xs text-gray-400">
                    {series.labels.map((label, index) =>
                      index % 2 === 0 ? <span key={label}>{label}</span> : <span key={label} />
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200/60 bg-white p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Cumulative totals
                </h3>
                <div className="space-y-3">
                  <SummaryRow
                    label="Followers gained"
                    value={connection.connected ? 'Not available' : 'Connect to view'}
                    status={connection.connected ? 'Requires permissions' : 'Connect LinkedIn'}
                    icon={Users}
                  />
                  <SummaryRow
                    label="Impressions"
                    value={formatCompact(totals.views)}
                    delta={hasEngagement ? deltas.views : null}
                    status={!hasEngagement ? 'Awaiting analytics' : undefined}
                    icon={Eye}
                  />
                  <SummaryRow
                    label="Likes"
                    value={formatCompact(totals.likes)}
                    delta={hasEngagement ? deltas.likes : null}
                    status={!hasEngagement ? 'Awaiting analytics' : undefined}
                    icon={Heart}
                  />
                  <SummaryRow
                    label="Comments"
                    value={formatCompact(totals.comments)}
                    delta={hasEngagement ? deltas.comments : null}
                    status={!hasEngagement ? 'Awaiting analytics' : undefined}
                    icon={MessageCircle}
                  />
                  <SummaryRow
                    label="Engagement rate"
                    value={`${totals.engagementRate.toFixed(1)}%`}
                    delta={hasEngagement ? deltas.engagementRate : null}
                    status={!hasEngagement ? 'Awaiting analytics' : undefined}
                    icon={Share2}
                  />
                </div>
                {!hasEngagement && (
                  <p className="text-xs text-gray-400 mt-4">
                    Engagement metrics appear after your LinkedIn posts sync with analytics.
                  </p>
                )}
                {connection.connected && (
                  <p className="text-xs text-gray-400 mt-2">
                    Follower analytics require additional LinkedIn API permissions.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200/60 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Best posts</h3>
                  <p className="text-sm text-gray-500">Top performing content in this range.</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/app/posts">View all</Link>
                </Button>
              </div>

              {topPosts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200/60 p-6 text-center text-sm text-gray-500">
                  No published posts yet. Generate your first post to see analytics here.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {topPosts.map((post) => (
                    <motion.div
                      key={post.id}
                      whileHover={{ y: -4 }}
                      className="rounded-xl border border-gray-200/60 p-4 bg-white/70"
                    >
                      <p className="text-sm font-semibold text-gray-900 mb-2">
                        {post.title || getFirstLine(post.post_content)}
                      </p>
                      <p className="text-xs text-gray-400 mb-4">
                        {getPostDate(post).toLocaleDateString()}
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3 w-3 text-cyan-600" />
                          {formatCompact(Number(post.engagement_views || 0))}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3 w-3 text-cyan-600" />
                          {formatCompact(Number(post.engagement_likes || 0))}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3 text-cyan-600" />
                          {formatCompact(Number(post.engagement_comments || 0))}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
              <div className="rounded-2xl border border-gray-200/60 bg-white p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Voxa content intelligence</h3>
                    <p className="text-sm text-gray-500">
                      Signal-level insights based on your posting behavior.
                    </p>
                  </div>
                  {insights.usingDrafts && (
                    <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-cyan-600">
                      Using drafts
                    </span>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Momentum score</p>
                        <p className="text-2xl font-bold text-gray-900 mt-2">{insights.momentumScore}</p>
                        <p className="text-xs text-gray-400 mt-1">Cadence + hooks + CTAs + media</p>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-cyan-100/80 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-cyan-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Avg words</p>
                        <p className="text-2xl font-bold text-gray-900 mt-2">{insights.avgWords}</p>
                        <p className="text-xs text-gray-400 mt-1">Sweet spot: 120–220</p>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-cyan-100/80 flex items-center justify-center">
                        <Timer className="h-5 w-5 text-cyan-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Hook rate</p>
                        <p className="text-2xl font-bold text-gray-900 mt-2">{insights.hookRate}%</p>
                        <p className="text-xs text-gray-400 mt-1">Strong first-line openers</p>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-cyan-100/80 flex items-center justify-center">
                        <Lightbulb className="h-5 w-5 text-cyan-600" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">CTA rate</p>
                        <p className="text-2xl font-bold text-gray-900 mt-2">{insights.ctaRate}%</p>
                        <p className="text-xs text-gray-400 mt-1">Posts with a clear ask</p>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-cyan-100/80 flex items-center justify-center">
                        <Target className="h-5 w-5 text-cyan-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid md:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Avg hashtag density</p>
                    <p className="text-xl font-semibold text-gray-900 mt-2">{insights.avgHashtags}</p>
                    <p className="text-xs text-gray-400 mt-1">Ideal range: 3–5 tags</p>
                  </div>
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Best posting day</p>
                    <p className="text-xl font-semibold text-gray-900 mt-2">{insights.bestDay}</p>
                    <p className="text-xs text-gray-400 mt-1">Most frequent publish day</p>
                  </div>
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Best posting time</p>
                    <p className="text-xl font-semibold text-gray-900 mt-2">{insights.bestTime}</p>
                    <p className="text-xs text-gray-400 mt-1">Based on your history</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200/60 bg-white p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Next best actions</h3>
                <div className="space-y-3 text-sm text-gray-600">
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-3">
                    {insights.avgGap > 4
                      ? 'Post twice per week to keep momentum.'
                      : 'Your cadence is strong. Maintain consistency.'}
                  </div>
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-3">
                    {insights.ctaRate < 40
                      ? 'Add a question or clear CTA in every post.'
                      : 'CTA usage is strong. Try rotating 2-3 CTA styles.'}
                  </div>
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-3">
                    {insights.hookRate < 50
                      ? 'Start with a hook: question, stat, or bold insight.'
                      : 'Hooks are working. Keep the first line under 12 words.'}
                  </div>
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-3">
                    {insights.mediaRate < 30
                      ? 'Add images or short videos to boost reach.'
                      : 'Media usage is healthy. Keep 1 in 3 posts visual.'}
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-gray-200/60 bg-gray-50 p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Top hashtags</h4>
                  {insights.topHashtags.length === 0 ? (
                    <p className="text-xs text-gray-500">Add hashtags to help LinkedIn categorize your posts.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {insights.topHashtags.map((tag) => (
                        <span
                          key={tag.tag}
                          className="text-xs px-3 py-1 rounded-full bg-gray-100 text-cyan-600"
                        >
                          {tag.tag} · {tag.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
