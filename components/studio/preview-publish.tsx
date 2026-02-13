'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Send,
  Eye,
  ThumbsUp,
  Share2,
  MessageCircle,
  Repeat2,
  CheckCircle2,
  AlertTriangle,
  Linkedin,
  Globe,
  Building2,
  User,
  Loader2,
  Copy,
  Download,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfirmedPost {
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  imageUrl?: string;
  imagePrompt?: string;
  variantLabel?: string;
}

interface PreviewPublishProps {
  confirmedPost: ConfirmedPost | null;
  confirmedImageUrl: string | null;
  brandName?: string;
  brandColors?: string[];
  logoUrl?: string;
  brandId: string;
  onGoToStep: (step: number) => void;
}

interface LinkedInOrganization {
  id?: string;
  urn?: string;
  name?: string;
}

interface LinkedInConnectionState {
  loading: boolean;
  connected: boolean;
  expired: boolean;
  memberUrn: string;
  organizations: LinkedInOrganization[];
}

interface SignedInProfile {
  name: string;
  email: string;
  avatarUrl?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewPublish({
  confirmedPost,
  confirmedImageUrl,
  brandName = 'Your Brand',
  brandColors = ['#0A66C2'],
  logoUrl,
  brandId,
  onGoToStep,
}: PreviewPublishProps) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishTarget, setPublishTarget] = useState<'person' | 'org'>('person');
  const [selectedOrgUrn, setSelectedOrgUrn] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [account, setAccount] = useState<SignedInProfile | null>(null);
  const [linkedin, setLinkedin] = useState<LinkedInConnectionState>({
    loading: true,
    connected: false,
    expired: false,
    memberUrn: '',
    organizations: [],
  });

  useEffect(() => {
    let cancelled = false;

    const loadIdentity = async () => {
      try {
        const supabase = createClient();
        const [{ data: authData }, connectionRes] = await Promise.all([
          supabase.auth.getUser(),
          fetch('/api/linkedin/connection', { cache: 'no-store' }),
        ]);

        if (cancelled) return;

        const authUser = authData.user;
        if (authUser) {
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', authUser.id)
            .limit(1);
          if (cancelled) return;
          const profile = profileRows?.[0] as { full_name?: string | null; avatar_url?: string | null } | undefined;
          const userName =
            (typeof profile?.full_name === 'string' && profile.full_name.trim()) ||
            (typeof authUser.user_metadata?.full_name === 'string' && authUser.user_metadata.full_name.trim()) ||
            (authUser.email ? authUser.email.split('@')[0] : 'User');

          setAccount({
            name: userName || 'User',
            email: authUser.email || '',
            avatarUrl:
              (typeof profile?.avatar_url === 'string' && profile.avatar_url.trim()) ||
              (typeof authUser.user_metadata?.avatar_url === 'string' && authUser.user_metadata.avatar_url.trim()) ||
              undefined,
          });
        }

        if (!connectionRes.ok) {
          setLinkedin({
            loading: false,
            connected: false,
            expired: false,
            memberUrn: '',
            organizations: [],
          });
          return;
        }

        const connection = await connectionRes.json();
        if (!connection) {
          setLinkedin({
            loading: false,
            connected: false,
            expired: false,
            memberUrn: '',
            organizations: [],
          });
          return;
        }

        const expiresAt = typeof connection.expires_at === 'string' ? new Date(connection.expires_at) : null;
        const isExpired = Boolean(expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now());
        const orgs = Array.isArray(connection.orgs) ? (connection.orgs as LinkedInOrganization[]) : [];

        const normalizedOrgs = orgs
          .map((org) => {
            const urn =
              (typeof org?.urn === 'string' && org.urn.trim()) ||
              (typeof org?.id === 'string' && org.id.trim() ? `urn:li:organization:${org.id.trim()}` : '');
            const id = typeof org?.id === 'string' ? org.id : urn.split(':').pop() || '';
            const name =
              (typeof org?.name === 'string' && org.name.trim()) ||
              (id ? `Organization ${id}` : 'Organization');
            return urn ? { id, urn, name } : null;
          })
          .filter((org): org is { id: string; urn: string; name: string } => Boolean(org?.urn));

        setLinkedin({
          loading: false,
          connected: Boolean(connection.access_token) && !isExpired,
          expired: isExpired,
          memberUrn:
            (typeof connection.member_urn === 'string' && connection.member_urn.trim()) ||
            (typeof connection.linkedin_member_urn === 'string' && connection.linkedin_member_urn.trim()) ||
            '',
          organizations: normalizedOrgs,
        });

        if (normalizedOrgs.length > 0) {
          setSelectedOrgUrn((prev) => prev || normalizedOrgs[0].urn || '');
        }
      } catch {
        if (cancelled) return;
        setLinkedin({
          loading: false,
          connected: false,
          expired: false,
          memberUrn: '',
          organizations: [],
        });
      }
    };

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, []);

  // Build the full post text
  const fullPostText = useMemo(() => {
    if (!confirmedPost) return '';
    const parts: string[] = [];
    if (confirmedPost.headline) parts.push(confirmedPost.headline);
    if (confirmedPost.body) parts.push(confirmedPost.body);
    if (confirmedPost.cta) parts.push(confirmedPost.cta);
    if (confirmedPost.hashtags?.length) {
      parts.push(confirmedPost.hashtags.map((t) => `#${t}`).join(' '));
    }
    return parts.join('\n\n');
  }, [confirmedPost]);

  const imageToShow = confirmedImageUrl || confirmedPost?.imageUrl;
  const selectedOrganization =
    linkedin.organizations.find((org) => org.urn === selectedOrgUrn) ||
    linkedin.organizations[0] ||
    null;
  const canPostAsOrganization = linkedin.organizations.length > 0;
  const displayAuthorName =
    publishTarget === 'person'
      ? account?.name || brandName
      : selectedOrganization?.name || brandName;
  const displayAvatarUrl = publishTarget === 'person' ? account?.avatarUrl || logoUrl : logoUrl;

  useEffect(() => {
    if (publishTarget === 'org' && !canPostAsOrganization) {
      setPublishTarget('person');
    }
  }, [publishTarget, canPostAsOrganization]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(fullPostText);
    toast.success('Post copied to clipboard');
  };

  const saveDraft = async () => {
    if (!confirmedPost || savingDraft) return;
    setSavingDraft(true);
    try {
      const response = await fetch('/api/pro/post/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          prompt: confirmedPost.headline,
          headline: confirmedPost.headline,
          body: confirmedPost.body,
          cta: confirmedPost.cta,
          hashtags: confirmedPost.hashtags,
          imageUrl: imageToShow,
          imagePrompt: confirmedPost.imagePrompt,
        }),
      });
      if (!response.ok) throw new Error('Failed to save');
      const data = await response.json();
      toast.success('Saved as draft', { description: `Post ID: ${data.postId}` });
    } catch {
      toast.error('Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  const publishToLinkedIn = async () => {
    if (!confirmedPost) return;
    if (!linkedin.connected) {
      toast.error('LinkedIn not connected', {
        description: linkedin.expired
          ? 'Your LinkedIn token expired. Reconnect in the LinkedIn page.'
          : 'Please connect your LinkedIn account first.',
      });
      return;
    }
    if (publishTarget === 'org' && !selectedOrganization?.urn) {
      toast.error('Choose an organization page first');
      return;
    }

    setPublishing(true);
    try {
      // First save as draft to get a post ID
      const saveRes = await fetch('/api/pro/post/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          prompt: confirmedPost.headline,
          headline: confirmedPost.headline,
          body: confirmedPost.body,
          cta: confirmedPost.cta,
          hashtags: confirmedPost.hashtags,
          imageUrl: imageToShow,
          imagePrompt: confirmedPost.imagePrompt,
        }),
      });

      if (!saveRes.ok) throw new Error('Failed to save post before publishing');
      const saveData = await saveRes.json();
      const postId = saveData.postId;

      if (!postId) throw new Error('No post ID returned');

      // Now publish via LinkedIn API
      const publishRes = await fetch('/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          targetType: publishTarget,
          targetUrn: publishTarget === 'org' ? selectedOrganization?.urn : undefined,
        }),
      });

      if (!publishRes.ok) {
        const errData = await publishRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to publish to LinkedIn');
      }

      setPublished(true);
      toast.success('🎉 Published to LinkedIn!', {
        description: 'Your post is now live on LinkedIn.',
      });
    } catch (err: any) {
      const message = err?.message || 'Publishing failed';
      if (message.includes('not connected') || message.includes('Unauthorized')) {
        toast.error('LinkedIn not connected', {
          description: 'Please connect your LinkedIn account first.',
        });
      } else if (message.includes('Organization not authorized')) {
        toast.error('Organization is not authorized', {
          description: 'Select a valid LinkedIn page in Publish Settings.',
        });
      } else {
        toast.error('Publish failed', { description: message });
      }
    } finally {
      setPublishing(false);
    }
  };

  // ─── Empty state ───
  if (!confirmedPost) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Card className="p-10 text-center max-w-md border border-slate-200 shadow-sm bg-white">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-5">
            <Eye className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Nothing to Preview Yet</h3>
          <p className="text-sm text-slate-500 mb-6">
            Complete the previous steps to see your post preview here.
          </p>
          <div className="space-y-2">
            <Button onClick={() => onGoToStep(0)} className="w-full h-10 bg-gradient-to-r from-cyan-500 to-blue-500 text-sm font-semibold">
              <Sparkles className="w-4 h-4 mr-2" />
              Generate a Post
            </Button>
            <Button variant="outline" onClick={() => onGoToStep(1)} className="w-full h-10 text-sm">
              Create an Image
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Published success state ───
  if (published) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Card className="p-10 text-center max-w-md bg-emerald-50/60 border-emerald-200/80 shadow-sm">
          <div className="w-18 h-18 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 mx-auto flex items-center justify-center mb-5 w-[72px] h-[72px]">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-emerald-800 mb-2">Published! 🎉</h3>
          <p className="text-sm text-emerald-600 mb-6">
            Your post is now live on LinkedIn and reaching your audience.
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setPublished(false);
                onGoToStep(0);
              }}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Create Another Post
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open('https://www.linkedin.com/feed/', '_blank')}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View on LinkedIn
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
      {/* ─── LinkedIn Preview Card ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <Eye className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">LinkedIn Preview</h2>
            <p className="text-xs text-slate-400">How your post will look in the feed</p>
          </div>
        </div>

        {/* LinkedIn Post Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-md max-w-[560px] mx-auto overflow-hidden">
          {/* Profile Header */}
          <div className="p-4 flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0"
              style={{
                background: displayAvatarUrl
                  ? undefined
                  : `linear-gradient(135deg, ${brandColors[0] || '#0A66C2'}, ${brandColors[1] || '#0F172A'})`,
              }}
            >
              {displayAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayAvatarUrl} alt="Profile" className="w-full h-full rounded-full object-cover" />
              ) : (
                (displayAuthorName || 'U').slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900">{displayAuthorName}</div>
              <div className="text-xs text-slate-500 flex items-center gap-1">
                {publishTarget === 'person' && account?.email ? (
                  <span className="truncate max-w-[180px]">{account.email}</span>
                ) : null}
                <span>Just now •</span>
                <Globe className="w-3 h-3" />
              </div>
            </div>
          </div>

          {/* Post Text */}
          <div className="px-4 pb-3">
            <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-900">
              {confirmedPost.headline && (
                <span className="font-bold block mb-2">{confirmedPost.headline}</span>
              )}
              {confirmedPost.body}
              {confirmedPost.cta && (
                <span className="block mt-3 font-medium text-slate-700">{confirmedPost.cta}</span>
              )}
            </div>
            {confirmedPost.hashtags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {confirmedPost.hashtags.map((tag) => (
                  <span key={tag} className="text-blue-600 text-sm font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Image */}
          {imageToShow && (
            <div className="w-full border-t border-slate-100 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageToShow}
                alt="Post visual"
                className="w-full object-contain"
                style={{ maxHeight: '420px' }}
              />
            </div>
          )}

          {/* Engagement Bar */}
          <div className="px-4 py-2 border-t border-slate-200">
            <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
              <span className="flex -space-x-1">
                <span className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px] text-white">👍</span>
                <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[8px] text-white">❤️</span>
              </span>
              <span className="ml-1">12 • 3 comments</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <button className="flex items-center gap-1.5 text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg text-sm font-medium">
                <ThumbsUp className="w-4 h-4" /> Like
              </button>
              <button className="flex items-center gap-1.5 text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg text-sm font-medium">
                <MessageCircle className="w-4 h-4" /> Comment
              </button>
              <button className="flex items-center gap-1.5 text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg text-sm font-medium">
                <Repeat2 className="w-4 h-4" /> Repost
              </button>
              <button className="flex items-center gap-1.5 text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg text-sm font-medium">
                <Send className="w-4 h-4" /> Send
              </button>
            </div>
          </div>
        </div>

        {/* Quick checklist */}
        <Card className="p-4 max-w-[560px] mx-auto bg-slate-50/60 border-slate-200">
          <h4 className="text-xs font-semibold mb-2.5 text-slate-600 uppercase tracking-wide">Pre-Publish Checklist</h4>
          <div className="space-y-2">
            {[
              { label: 'Post content is ready', done: Boolean(confirmedPost?.body) },
              { label: 'Image is attached', done: Boolean(imageToShow) },
              { label: 'Hashtags are included', done: (confirmedPost?.hashtags?.length || 0) > 0 },
              { label: 'Call-to-action is clear', done: Boolean(confirmedPost?.cta) },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                {item.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
                <span className={`text-sm ${item.done ? 'text-slate-700' : 'text-amber-600'}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ─── Publish Sidebar ─── */}
      <div className="space-y-4">
        {/* Publish Target */}
        <Card className="p-4 border border-slate-200">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-slate-700">
            <Linkedin className="w-4 h-4 text-blue-600" />
            Publish Settings
          </h3>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Signed in</p>
              <p className="text-xs font-semibold text-slate-800 truncate">{account?.name || 'User'}</p>
              <p className="text-[11px] text-slate-500 truncate">{account?.email || 'No email found'}</p>
            </div>

            <div
              className={`rounded-lg border px-3 py-2 ${
                linkedin.connected
                  ? 'border-emerald-200 bg-emerald-50'
                  : linkedin.expired
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-rose-200 bg-rose-50'
              }`}
            >
              <p
                className={`text-xs font-semibold ${
                  linkedin.connected
                    ? 'text-emerald-700'
                    : linkedin.expired
                    ? 'text-amber-700'
                    : 'text-rose-700'
                }`}
              >
                {linkedin.loading
                  ? 'Checking LinkedIn connection...'
                  : linkedin.connected
                  ? 'LinkedIn connected'
                  : linkedin.expired
                  ? 'LinkedIn token expired'
                  : 'LinkedIn not connected'}
              </p>
              {!linkedin.connected && !linkedin.loading && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[11px]"
                  onClick={() => (window.location.href = '/app/linkedin')}
                >
                  Connect LinkedIn
                </Button>
              )}
            </div>

            <label className="text-xs font-medium text-slate-500">Publish as:</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setPublishTarget('person')}
                disabled={!linkedin.connected}
                className={`p-2.5 rounded-lg border text-center transition-all ${
                  publishTarget === 'person'
                    ? 'border-blue-400 bg-blue-50/80 text-blue-700 ring-1 ring-blue-200'
                    : 'border-slate-200 text-slate-600 hover:border-blue-300'
                }`}
              >
                <User className="w-4 h-4 mx-auto mb-0.5" />
                <span className="text-xs font-medium">Personal</span>
              </button>
              <button
                onClick={() => setPublishTarget('org')}
                disabled={!linkedin.connected || !canPostAsOrganization}
                className={`p-2.5 rounded-lg border text-center transition-all ${
                  publishTarget === 'org'
                    ? 'border-blue-400 bg-blue-50/80 text-blue-700 ring-1 ring-blue-200'
                    : 'border-slate-200 text-slate-600 hover:border-blue-300'
                }`}
              >
                <Building2 className="w-4 h-4 mx-auto mb-0.5" />
                <span className="text-xs font-medium">Organization</span>
              </button>
            </div>
            {publishTarget === 'org' && (
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500">Organization page</label>
                <select
                  value={selectedOrgUrn}
                  onChange={(e) => setSelectedOrgUrn(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700"
                  disabled={!canPostAsOrganization}
                >
                  {canPostAsOrganization ? (
                    linkedin.organizations.map((org) => (
                      <option key={org.urn || org.id} value={org.urn}>
                        {org.name || org.id || 'Organization'}
                      </option>
                    ))
                  ) : (
                    <option value="">No organizations found</option>
                  )}
                </select>
              </div>
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="p-4 space-y-2 border border-slate-200">
          <h3 className="font-semibold text-sm mb-1 text-slate-700">Quick Actions</h3>
          <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs" onClick={copyToClipboard}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Copy Post Text
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs" onClick={saveDraft} disabled={savingDraft}>
            <Download className="w-3.5 h-3.5 mr-2" />
            {savingDraft ? 'Saving...' : 'Save as Draft'}
          </Button>
          {!imageToShow && (
            <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs text-amber-600 border-amber-200" onClick={() => onGoToStep(1)}>
              <AlertTriangle className="w-3.5 h-3.5 mr-2" />
              Add Image (Step 2)
            </Button>
          )}
        </Card>

        {/* Post stats */}
        <Card className="p-4 border border-slate-200">
          <h3 className="font-semibold text-sm mb-2.5 text-slate-700">Post Stats</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-2.5 bg-slate-50 rounded-lg">
              <div className="text-xl font-bold text-slate-800">
                {fullPostText.length}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Characters</div>
            </div>
            <div className="text-center p-2.5 bg-slate-50 rounded-lg">
              <div className="text-xl font-bold text-slate-800">
                {fullPostText.split(/\s+/).filter(Boolean).length}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Words</div>
            </div>
            <div className="text-center p-2.5 bg-slate-50 rounded-lg">
              <div className="text-xl font-bold text-slate-800">
                {confirmedPost.hashtags?.length || 0}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Hashtags</div>
            </div>
            <div className="text-center p-2.5 bg-slate-50 rounded-lg">
              <div className="text-xl font-bold text-slate-800">
                {imageToShow ? '✓' : '—'}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Image</div>
            </div>
          </div>
        </Card>

        {/* ─── PUBLISH BUTTON ─── */}
        <Button
          onClick={publishToLinkedIn}
          disabled={
            publishing ||
            !confirmedPost ||
            !linkedin.connected ||
            (publishTarget === 'org' && !selectedOrganization?.urn)
          }
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-700 hover:via-blue-600 hover:to-cyan-600 shadow-lg hover:shadow-xl hover:shadow-blue-500/25 transition-all rounded-xl"
        >
          {publishing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Publishing to LinkedIn…
            </>
          ) : (
            <>
              <Send className="w-5 h-5 mr-2" />
              Publish to LinkedIn
            </>
          )}
        </Button>

        <p className="text-[11px] text-center text-slate-400">
          {linkedin.connected
            ? `Connected for publishing${publishTarget === 'org' ? ` as ${selectedOrganization?.name || 'organization'}` : ' as personal profile'}`
            : 'Connect LinkedIn first to publish'}
        </p>
      </div>
    </div>
  );
}
