'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  FileText,
  Search,
  MoreHorizontal,
  Eye,
  Trash2,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Heart,
  MessageCircle,
  Copy,
  Plus,
  Loader2,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';

type PostStatus = 'draft' | 'posted' | 'failed' | 'scheduled' | 'approved';

interface Post {
  id: string;
  post_content: string;
  image_url?: string;
  status: PostStatus;
  created_at: string;
  posted_at?: string;
  scheduled_for?: string;
  linkedin_post_urn?: string;
  error_message?: string;
  prompt: string;
}

const statusConfig: Record<PostStatus, { label: string; icon: React.ElementType; className: string }> = {
  draft: {
    label: 'Draft',
    icon: Clock,
    className: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50',
  },
  approved: {
    label: 'Ready',
    icon: CheckCircle,
    className: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50',
  },
  posted: {
    label: 'Published',
    icon: CheckCircle,
    className: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50',
  },
  scheduled: {
    label: 'Scheduled',
    icon: Clock,
    className: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50',
  },
};

function PostCard({ 
  post, 
  onDelete, 
  onCopy 
}: { 
  post: Post; 
  onDelete: (id: string) => void;
  onCopy: (content: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const status = statusConfig[post.status] || statusConfig.draft;
  const StatusIcon = status.icon;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(post.id);
    setIsDeleting(false);
    setShowDeleteConfirm(false);
    setShowMenu(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-violet-300 dark:hover:border-violet-700 transition-all overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Status & Date */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                {status.label}
              </span>
              <span className="text-xs text-gray-400">{formatDate(post.created_at)}</span>
            </div>
            
            {/* Content Preview */}
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 mb-3">
              {post.post_content}
            </p>

            {/* Error Message */}
            {post.status === 'failed' && post.error_message && (
              <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-600 dark:text-red-400 mb-3">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{post.error_message}</span>
              </div>
            )}
          </div>

          {/* Image Thumbnail */}
          {post.image_url && (
            <img
              src={post.image_url}
              alt=""
              className="w-20 h-20 rounded-lg object-cover shrink-0"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCopy(post.post_content)}
              className="text-gray-500 hover:text-violet-600"
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            {post.linkedin_post_urn && (
              <a
                href={`https://www.linkedin.com/feed/update/${post.linkedin_post_urn}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" size="sm" className="text-gray-500 hover:text-blue-600">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View on LinkedIn
                </Button>
              </a>
            )}
          </div>

          {/* Menu */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMenu(!showMenu)}
              className="text-gray-400"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>

            <AnimatePresence>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 bottom-full mb-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-20"
                  >
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Delete Confirmation */}
            <AnimatePresence>
              {showDeleteConfirm && (
                <>
                  <div
                    className="fixed inset-0 z-20 bg-black/50"
                    onClick={() => setShowDeleteConfirm(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 z-30"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Delete Post?
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      This action cannot be undone. The post will be permanently deleted.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Delete'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | PostStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchPosts = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPosts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleDelete = async (postId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (!error) {
      setPosts(posts.filter(p => p.id !== postId));
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredPosts = posts.filter(post => {
    const matchesFilter = filter === 'all' || post.status === filter;
    const matchesSearch = !searchQuery || 
      post.post_content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.prompt?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats: Record<string, number> = {
    all: posts.length,
    draft: posts.filter(p => p.status === 'draft').length,
    approved: posts.filter(p => p.status === 'approved').length,
    posted: posts.filter(p => p.status === 'posted').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    failed: posts.filter(p => p.status === 'failed').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Library"
        className="mb-8"
        title={
          <>
            <span className="text-voxa-gradient">My</span> Posts
          </>
        }
        subtitle="Manage and track your LinkedIn content"
        actions={
          <Link href="/app/generate">
            <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              New Post
            </Button>
          </Link>
        }
      />

      {/* Copied Toast */}
      <AnimatePresence>
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg"
          >
            <Check className="h-4 w-4" />
            Copied to clipboard!
          </motion.div>
        )}
      </AnimatePresence>

      {posts.length === 0 ? (
        /* Empty State */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-12 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700"
        >
          <div className="h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-violet-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No posts yet
          </h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            Create your first AI-powered LinkedIn post and start building your professional presence.
          </p>
          <Link href="/app/generate">
            <Button className="bg-gradient-to-r from-violet-600 to-blue-600">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Post
            </Button>
          </Link>
        </motion.div>
      ) : (
        <>
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
              {(['all', 'draft', 'approved', 'posted', 'scheduled', 'failed'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    filter === status
                      ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                  <span className="ml-1.5 text-xs opacity-70">
                    ({status === 'all' ? stats.all : stats[status as PostStatus] || 0})
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Posts List */}
          <div className="space-y-4">
            <AnimatePresence>
              {filteredPosts.length > 0 ? (
                filteredPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onDelete={handleDelete}
                    onCopy={handleCopy}
                  />
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <p className="text-gray-500">No posts match your filters</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
