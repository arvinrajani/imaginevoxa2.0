'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  ExternalLink,
  FileText,
  Send,
  Linkedin,
  Loader2,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';

type ActivityType = 'post_published' | 'post_failed' | 'post_created' | 'post_draft' | 'linkedin_connected';
type ActivityStatus = 'success' | 'error' | 'warning' | 'info';

interface ActivityLog {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const activityConfig: Record<ActivityType, { icon: React.ElementType; color: string }> = {
  post_published: { icon: Send, color: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400' },
  post_failed: { icon: XCircle, color: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400' },
  post_created: { icon: Sparkles, color: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400' },
  post_draft: { icon: FileText, color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' },
  linkedin_connected: { icon: Linkedin, color: 'bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400' },
};

function ActivityRow({ activity }: { activity: ActivityLog }) {
  const config = activityConfig[activity.type];
  const Icon = config.icon;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const linkedinUrl = activity.metadata?.linkedinUrl as string | undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors"
    >
      <div className={`h-10 w-10 rounded-xl ${config.color} flex items-center justify-center shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-gray-900 dark:text-white">
            {activity.title}
          </h4>
          {activity.status === 'error' && (
            <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
              Error
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 line-clamp-1">
          {activity.description}
        </p>
        {linkedinUrl && (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1"
          >
            View on LinkedIn <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <span className="text-xs text-gray-400 shrink-0">
        {formatTime(activity.createdAt)}
      </span>
    </motion.div>
  );
}

function StatsCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <div className={`h-8 w-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');

  const fetchActivity = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch posts and convert to activity
    const { data: posts } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Fetch linkedin connections
    const { data: connections } = await supabase
      .from('linkedin_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const activityLogs: ActivityLog[] = [];

    // Convert posts to activity
    posts?.forEach((post) => {
      const contentPreview = post.post_content?.substring(0, 60) + (post.post_content?.length > 60 ? '...' : '') || 'No content';
      
      if (post.status === 'posted') {
        activityLogs.push({
          id: `post-pub-${post.id}`,
          type: 'post_published',
          status: 'success',
          title: 'Post Published to LinkedIn',
          description: contentPreview,
          metadata: { postId: post.id, linkedinUrl: post.linkedin_post_id },
          createdAt: post.posted_at || post.created_at,
        });
      } else if (post.status === 'failed') {
        activityLogs.push({
          id: `post-fail-${post.id}`,
          type: 'post_failed',
          status: 'error',
          title: 'Post Failed to Publish',
          description: post.error_message || 'Publishing failed',
          metadata: { postId: post.id },
          createdAt: post.updated_at || post.created_at,
        });
      }

      // Also add creation activity
      activityLogs.push({
        id: `post-create-${post.id}`,
        type: 'post_created',
        status: 'info',
        title: 'Post Generated with AI',
        description: contentPreview,
        metadata: { postId: post.id },
        createdAt: post.created_at,
      });
    });

    // Convert linkedin connections to activity
    connections?.forEach((conn) => {
      activityLogs.push({
        id: `linkedin-${conn.id}`,
        type: 'linkedin_connected',
        status: 'success',
        title: 'LinkedIn Account Connected',
        description: `Connected as ${conn.linkedin_name || 'LinkedIn User'}`,
        createdAt: conn.created_at,
      });
    });

    // Sort by date
    activityLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setActivities(activityLogs);
    setLoading(false);
  };

  useEffect(() => {
    fetchActivity();
  }, []);

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch = 
      activity.title.toLowerCase().includes(search.toLowerCase()) ||
      activity.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || activity.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Calculate stats
  const stats = {
    totalActions: activities.length,
    successful: activities.filter(a => a.status === 'success').length,
    failed: activities.filter(a => a.status === 'error').length,
    thisWeek: activities.filter(a => {
      const date = new Date(a.createdAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return date >= weekAgo;
    }).length,
  };

  // Group activities by date
  const groupedActivities = filteredActivities.reduce((groups, activity) => {
    const date = new Date(activity.createdAt).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {} as Record<string, ActivityLog[]>);

  const formatGroupDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (dateString === today) return 'Today';
    if (dateString === yesterday) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title={
          <>
            <span className="text-voxa-gradient">Activity</span> Log
          </>
        }
        subtitle="Track all actions and events in your account"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatsCard
          icon={Activity}
          label="Total Actions"
          value={stats.totalActions}
          color="bg-gradient-to-br from-violet-500 to-purple-600"
        />
        <StatsCard
          icon={CheckCircle}
          label="Successful"
          value={stats.successful}
          color="bg-gradient-to-br from-green-500 to-emerald-600"
        />
        <StatsCard
          icon={XCircle}
          label="Failed"
          value={stats.failed}
          color="bg-gradient-to-br from-red-500 to-rose-600"
        />
        <StatsCard
          icon={Clock}
          label="This Week"
          value={stats.thisWeek}
          color="bg-gradient-to-br from-blue-500 to-cyan-600"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity..."
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ActivityType | 'all')}
          className="h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        >
          <option value="all">All Types</option>
          <option value="post_published">Published</option>
          <option value="post_failed">Failed</option>
          <option value="post_created">Generated</option>
          <option value="linkedin_connected">LinkedIn</option>
        </select>
        <Button variant="outline" className="h-11" onClick={fetchActivity}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Activity List */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {Object.entries(groupedActivities).length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {Object.entries(groupedActivities).map(([date, dateActivities], groupIndex) => (
              <div key={date}>
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {formatGroupDate(date)}
                  </span>
                </div>
                <div>
                  {dateActivities.map((activity, i) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (groupIndex * dateActivities.length + i) * 0.03 }}
                    >
                      <ActivityRow activity={activity} />
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No activity yet</p>
            <p className="text-sm text-gray-400">
              {search ? 'Try a different search term' : 'Generate your first post to see activity here'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
