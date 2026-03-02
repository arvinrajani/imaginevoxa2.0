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
  Search,
  Facebook,
  Instagram,
  Heart,
  Bookmark,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PostChannel = 'linkedin' | 'facebook' | 'instagram';

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
  selectedChannels?: PostChannel[];
  primaryChannel?: PostChannel;
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

interface MetaPage {
  id: string;
  name: string;
  instagram_business_account_id?: string | null;
  instagram_username?: string | null;
}

interface MetaConnectionState {
  loading: boolean;
  connected: boolean;
  expired: boolean;
  pages: MetaPage[];
  defaultFacebookPageId: string | null;
  defaultInstagramAccountId: string | null;
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
  selectedChannels = ['linkedin'],
  primaryChannel = 'linkedin',
}: PreviewPublishProps) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishTarget, setPublishTarget] = useState<'person' | 'org'>('person');
  const [selectedOrgUrn, setSelectedOrgUrn] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [account, setAccount] = useState<SignedInProfile | null>(null);
  const [publishingFb, setPublishingFb] = useState(false);
  const [publishingIg, setPublishingIg] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<PostChannel>(primaryChannel);
  const [meta, setMeta] = useState<MetaConnectionState>({
    loading: true,
    connected: false,
    expired: false,
    pages: [],
    defaultFacebookPageId: null,
    defaultInstagramAccountId: null,
  });
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

    const loadMetaConnection = async () => {
      try {
        const res = await fetch('/api/meta/connection', { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          setMeta({ loading: false, connected: false, expired: false, pages: [], defaultFacebookPageId: null, defaultInstagramAccountId: null });
          return;
        }
        const data = await res.json();
        if (!data) {
          setMeta({ loading: false, connected: false, expired: false, pages: [], defaultFacebookPageId: null, defaultInstagramAccountId: null });
          return;
        }
        const tokenExpired = data.token_expires_at ? new Date(data.token_expires_at).getTime() <= Date.now() : false;
        setMeta({
          loading: false,
          connected: Boolean(data.connected) && !tokenExpired,
          expired: tokenExpired,
          pages: Array.isArray(data.pages) ? data.pages : [],
          defaultFacebookPageId: data.default_facebook_page_id || null,
          defaultInstagramAccountId: data.default_instagram_account_id || null,
        });
      } catch {
        if (cancelled) return;
        setMeta({ loading: false, connected: false, expired: false, pages: [], defaultFacebookPageId: null, defaultInstagramAccountId: null });
      }
    };

    void loadIdentity();
    if (selectedChannels.includes('facebook') || selectedChannels.includes('instagram')) {
      void loadMetaConnection();
    }

    return () => {
      cancelled = true;
    };
  }, [selectedChannels]);

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

  // ─── Publish to Facebook ───
  const publishToFacebook = async () => {
    if (!confirmedPost || !meta.connected) return;
    setPublishingFb(true);
    try {
      const res = await fetch('/api/meta/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'facebook',
          message: fullPostText,
          imageUrl: imageToShow || null,
          facebookPageId: meta.defaultFacebookPageId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Facebook publishing failed');
      toast.success('Published to Facebook!', {
        description: `Posted to ${data.pageName || 'your page'}`,
      });
    } catch (err: any) {
      toast.error('Facebook publish failed', { description: err?.message || 'Unknown error' });
    } finally {
      setPublishingFb(false);
    }
  };

  // ─── Publish to Instagram ───
  const publishToInstagram = async () => {
    if (!confirmedPost || !meta.connected) return;
    if (!imageToShow) {
      toast.error('Instagram requires an image', { description: 'Please add an image to your post before publishing to Instagram.' });
      return;
    }
    setPublishingIg(true);
    try {
      const res = await fetch('/api/meta/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'instagram',
          message: fullPostText,
          imageUrl: imageToShow,
          instagramAccountId: meta.defaultInstagramAccountId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Instagram publishing failed');
      toast.success('Published to Instagram!', {
        description: data.igUsername ? `@${data.igUsername}` : 'Your post is now live!',
      });
    } catch (err: any) {
      toast.error('Instagram publish failed', { description: err?.message || 'Unknown error' });
    } finally {
      setPublishingIg(false);
    }
  };

  // ─── Empty state ───
  if (!confirmedPost) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Card className="p-10 text-center max-w-md border border-slate-200 shadow-sm bg-white">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-5">
            <Eye className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Nothing to Preview Yet</h3>
          <p className="text-sm text-gray-400 mb-6">
            Complete the previous steps to see your post preview here.
          </p>
          <div className="space-y-2">
            <Button onClick={() => onGoToStep(0)} className="w-full h-10 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 text-sm font-semibold">
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

  // LinkedIn truncates feed posts at ~210 chars then shows "...see more"
  const LINKEDIN_TRUNCATE = 210;
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const postBodyText = [confirmedPost.headline, confirmedPost.body].filter(Boolean).join('\n\n');
  const isTruncatable = postBodyText.length > LINKEDIN_TRUNCATE;
  const charCount = fullPostText.length;
  const wordCount = fullPostText.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const charStatus: 'good' | 'warn' | 'danger' =
    charCount > 3000 ? 'danger' : charCount > 2500 ? 'warn' : 'good';

  // Estimated reach calculation  
  const reachScore = (() => {
    let score = 0;
    if (confirmedPost.body) score += 30;
    if (confirmedPost.headline) score += 15;
    if (confirmedPost.cta) score += 10;
    if (imageToShow) score += 25;
    if ((confirmedPost.hashtags?.length || 0) >= 3) score += 10;
    if ((confirmedPost.hashtags?.length || 0) >= 5) score += 5;
    if (charCount > 150 && charCount < 2000) score += 5;
    return Math.min(100, score);
  })();

  const checklist = [
    { label: 'Post content is ready', done: Boolean(confirmedPost?.body) },
    { label: 'Headline is strong', done: Boolean(confirmedPost?.headline) },
    { label: 'Image is attached', done: Boolean(imageToShow) },
    { label: 'Hashtags are included', done: (confirmedPost?.hashtags?.length || 0) > 0 },
    { label: 'Call-to-action is clear', done: Boolean(confirmedPost?.cta) },
    { label: 'Under 3,000 characters', done: charCount <= 3000 },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
      {/* ─── Preview Card ─── */}
      <div className="space-y-4 min-w-0 overflow-hidden">
        {/* Header with platform selector and view toggles */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md ${
              previewPlatform === 'linkedin'
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-50/20'
                : previewPlatform === 'facebook'
                ? 'bg-gradient-to-br from-blue-600 to-blue-700 shadow-blue-600/20'
                : 'bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 shadow-purple-50/20'
            }`}>
              {previewPlatform === 'linkedin' ? (
                <Linkedin className="w-4.5 h-4.5 text-white" />
              ) : previewPlatform === 'facebook' ? (
                <Facebook className="w-4.5 h-4.5 text-white" />
              ) : (
                <Instagram className="w-4.5 h-4.5 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {previewPlatform === 'linkedin' ? 'LinkedIn' : previewPlatform === 'facebook' ? 'Facebook' : 'Instagram'} Preview
              </h2>
              <p className="text-xs text-gray-500">Pixel-accurate feed preview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Platform selector */}
            {selectedChannels.length > 1 && (
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                {selectedChannels.includes('linkedin') && (
                  <button
                    onClick={() => setPreviewPlatform('linkedin')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                      previewPlatform === 'linkedin'
                        ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                        : 'text-gray-400 hover:text-slate-700'
                    }`}
                  >
                    <Linkedin className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">LinkedIn</span>
                  </button>
                )}
                {selectedChannels.includes('facebook') && (
                  <button
                    onClick={() => setPreviewPlatform('facebook')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                      previewPlatform === 'facebook'
                        ? 'bg-white text-blue-600 shadow-sm border border-blue-200'
                        : 'text-gray-400 hover:text-slate-700'
                    }`}
                  >
                    <Facebook className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Facebook</span>
                  </button>
                )}
                {selectedChannels.includes('instagram') && (
                  <button
                    onClick={() => setPreviewPlatform('instagram')}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                      previewPlatform === 'instagram'
                        ? 'bg-white text-pink-600 shadow-sm border border-pink-200'
                        : 'text-gray-400 hover:text-slate-700'
                    }`}
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Instagram</span>
                  </button>
                )}
              </div>
            )}
            {/* Desktop / Mobile toggle */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
              <button
                onClick={() => setPreviewMode('desktop')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  previewMode === 'desktop'
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                    : 'text-gray-400 hover:text-slate-700'
                }`}
              >
                Desktop
              </button>
              <button
                onClick={() => setPreviewMode('mobile')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  previewMode === 'mobile'
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                    : 'text-gray-400 hover:text-slate-700'
                }`}
              >
                Mobile
              </button>
            </div>
          </div>
        </div>

        {/* ─── LinkedIn Feed Simulation ─── */}
        {previewPlatform === 'linkedin' && (
        <div className={`${previewMode === 'mobile' ? 'max-w-[400px]' : 'max-w-[560px]'} mx-auto transition-all duration-300 overflow-hidden`}>
          {/* LinkedIn nav simulation mini bar */}
          <div className="bg-white rounded-t-xl border border-b-0 border-slate-200 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Linkedin className="w-[22px] h-[22px] text-[#0A66C2]" />
              <div className="h-7 w-36 rounded-md bg-slate-100 flex items-center px-2">
                <Search className="w-3 h-3 text-gray-500" />
                <span className="text-[11px] text-gray-500 ml-1.5">Search</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {['Home', 'Network', 'Jobs'].map((item) => (
                <span key={item} className="text-[10px] text-gray-500 font-medium">{item}</span>
              ))}
            </div>
          </div>

          {/* LinkedIn Post Card — realistic */}
          <div className="bg-white border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden rounded-b-xl">
            {/* Profile Header */}
            <div className="p-4 flex items-start gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0 ring-2 ring-white shadow-md"
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
                  <span className="text-sm">{(displayAuthorName || 'U').slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-slate-900 text-[14px] leading-tight">{displayAuthorName}</span>
                  <span className="text-gray-500 text-[14px]">• 1st</span>
                </div>
                <div className="text-[12px] text-gray-400 leading-tight mt-0.5 truncate">
                  {publishTarget === 'person' && account?.email
                    ? account.email
                    : brandName}
                </div>
                <div className="text-[12px] text-gray-500 flex items-center gap-1 mt-0.5">
                  <span>Just now</span>
                  <span>•</span>
                  <Globe className="w-3 h-3" />
                </div>
              </div>
              <button className="text-gray-500 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                </svg>
              </button>
            </div>

            {/* Post Text with "See more" truncation */}
            <div className="px-4 pb-3 min-w-0 overflow-hidden">
              <div className="text-[14px] leading-[1.42] whitespace-pre-wrap text-slate-900 break-words min-w-0">
                {(() => {
                  if (!isTruncatable || previewExpanded) {
                    return (
                      <>
                        {confirmedPost.headline && (
                          <span className="font-semibold block mb-1.5">{confirmedPost.headline}</span>
                        )}
                        {confirmedPost.body}
                      </>
                    );
                  }
                  // Truncated view
                  const truncated = postBodyText.slice(0, LINKEDIN_TRUNCATE);
                  const lastSpace = truncated.lastIndexOf(' ');
                  const displayText = truncated.slice(0, lastSpace > 100 ? lastSpace : LINKEDIN_TRUNCATE);
                  return (
                    <>
                      <span>{displayText}...</span>
                      <button
                        onClick={() => setPreviewExpanded(true)}
                        className="text-gray-400 hover:text-blue-600 font-medium ml-0.5 text-[14px]"
                      >
                        see more
                      </button>
                    </>
                  );
                })()}
              </div>
              {confirmedPost.cta && (previewExpanded || !isTruncatable) && (
                <div
                  className="mt-3 text-[14px] font-medium text-slate-700 min-w-0"
                  style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                >
                  {confirmedPost.cta}
                </div>
              )}
              {(previewExpanded || !isTruncatable) && confirmedPost.hashtags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {confirmedPost.hashtags.map((tag) => (
                    <span key={tag} className="text-[#0A66C2] text-[14px] font-medium hover:underline cursor-pointer">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              {previewExpanded && isTruncatable && (
                <button
                  onClick={() => setPreviewExpanded(false)}
                  className="text-gray-500 hover:text-slate-600 text-xs mt-1 font-medium"
                >
                  show less
                </button>
              )}
            </div>

            {/* Image */}
            {imageToShow && (
              <div className="w-full border-t border-slate-100 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageToShow}
                  alt="Post visual"
                  className="w-full object-contain"
                  style={{ maxHeight: previewMode === 'mobile' ? '300px' : '420px' }}
                />
              </div>
            )}

            {/* Engagement reactions */}
            <div className="px-4 pt-2 pb-1">
              <div className="flex items-center justify-between text-[12px] text-gray-400">
                <div className="flex items-center gap-0.5">
                  <span className="flex -space-x-0.5">
                    <span className="w-[18px] h-[18px] rounded-full bg-[#0A66C2] flex items-center justify-center text-[10px] text-white border border-white">👍</span>
                    <span className="w-[18px] h-[18px] rounded-full bg-[#DF704D] flex items-center justify-center text-[10px] text-white border border-white">❤️</span>
                    <span className="w-[18px] h-[18px] rounded-full bg-[#6DAE4F] flex items-center justify-center text-[10px] text-white border border-white">👏</span>
                  </span>
                  <span className="ml-1.5 hover:text-[#0A66C2] hover:underline cursor-pointer">42</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hover:text-[#0A66C2] hover:underline cursor-pointer">8 comments</span>
                  <span>•</span>
                  <span className="hover:text-[#0A66C2] hover:underline cursor-pointer">3 reposts</span>
                </div>
              </div>
            </div>

            {/* Action buttons bar */}
            <div className="px-2 py-0.5 border-t border-slate-200 mx-2">
              <div className="flex justify-between">
                {[
                  { icon: ThumbsUp, label: 'Like' },
                  { icon: MessageCircle, label: 'Comment' },
                  { icon: Repeat2, label: 'Repost' },
                  { icon: Send, label: 'Send' },
                ].map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    className="flex items-center gap-1.5 text-slate-600 hover:bg-slate-100 px-4 py-3 rounded-lg text-[13px] font-semibold transition-colors"
                  >
                    <Icon className="w-[18px] h-[18px]" /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* ─── Facebook Feed Simulation ─── */}
        {previewPlatform === 'facebook' && (
        <div className={`${previewMode === 'mobile' ? 'max-w-[400px]' : 'max-w-[560px]'} mx-auto transition-all duration-300 overflow-hidden`}>
          {/* Facebook nav bar */}
          <div className="bg-white rounded-t-xl border border-b-0 border-slate-200 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Facebook className="w-[22px] h-[22px] text-[#1877F2]" />
              <div className="h-7 w-36 rounded-full bg-slate-100 flex items-center px-3">
                <Search className="w-3 h-3 text-gray-500" />
                <span className="text-[11px] text-gray-500 ml-1.5">Search Facebook</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {['🏠', '📺', '🏪'].map((item, i) => (
                <span key={i} className="text-[14px]">{item}</span>
              ))}
            </div>
          </div>

          {/* Facebook Post Card */}
          <div className="bg-white border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden rounded-b-xl">
            {/* Profile Header */}
            <div className="p-3 flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0 ring-2 ring-white shadow-md"
                style={{
                  background: displayAvatarUrl
                    ? undefined
                    : `linear-gradient(135deg, ${brandColors[0] || '#1877F2'}, ${brandColors[1] || '#0F172A'})`,
                }}
              >
                {displayAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={displayAvatarUrl} alt="Profile" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-xs">{(displayAuthorName || 'U').slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-slate-900 text-[15px] leading-tight">{displayAuthorName}</span>
                <div className="text-[12px] text-gray-400 flex items-center gap-1">
                  <span>Just now</span>
                  <span>·</span>
                  <Globe className="w-3 h-3" />
                </div>
              </div>
              <button className="text-gray-500 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                </svg>
              </button>
            </div>

            {/* Post Text */}
            <div className="px-3 pb-3 min-w-0 overflow-hidden">
              <div className="text-[15px] leading-[1.4] whitespace-pre-wrap text-slate-900 break-words">
                {confirmedPost.headline && (
                  <span className="font-semibold block mb-1.5">{confirmedPost.headline}</span>
                )}
                {confirmedPost.body}
              </div>
              {confirmedPost.cta && (
                <div className="mt-2 text-[14px] font-medium text-slate-700">{confirmedPost.cta}</div>
              )}
              {confirmedPost.hashtags?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {confirmedPost.hashtags.map((tag) => (
                    <span key={tag} className="text-[#1877F2] text-[14px] font-medium hover:underline cursor-pointer">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Image */}
            {imageToShow && (
              <div className="w-full border-t border-slate-100 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageToShow}
                  alt="Post visual"
                  className="w-full object-contain"
                  style={{ maxHeight: previewMode === 'mobile' ? '300px' : '420px' }}
                />
              </div>
            )}

            {/* Engagement reactions */}
            <div className="px-3 pt-2 pb-1">
              <div className="flex items-center justify-between text-[13px] text-gray-400">
                <div className="flex items-center gap-0.5">
                  <span className="flex -space-x-0.5">
                    <span className="w-[18px] h-[18px] rounded-full bg-[#1877F2] flex items-center justify-center text-[10px] text-white border border-white">👍</span>
                    <span className="w-[18px] h-[18px] rounded-full bg-[#F0284A] flex items-center justify-center text-[10px] text-white border border-white">❤️</span>
                    <span className="w-[18px] h-[18px] rounded-full bg-[#F7B928] flex items-center justify-center text-[10px] text-white border border-white">😂</span>
                  </span>
                  <span className="ml-1.5 hover:text-[#1877F2] hover:underline cursor-pointer">58</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hover:underline cursor-pointer">12 comments</span>
                  <span className="hover:underline cursor-pointer">5 shares</span>
                </div>
              </div>
            </div>

            {/* Action buttons bar */}
            <div className="px-2 py-0.5 border-t border-slate-200 mx-2">
              <div className="flex justify-between">
                {[
                  { icon: ThumbsUp, label: 'Like' },
                  { icon: MessageCircle, label: 'Comment' },
                  { icon: Share2, label: 'Share' },
                ].map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    className="flex items-center gap-1.5 text-slate-600 hover:bg-slate-100 px-5 py-3 rounded-lg text-[13px] font-semibold transition-colors"
                  >
                    <Icon className="w-[18px] h-[18px]" /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* ─── Instagram Feed Simulation ─── */}
        {previewPlatform === 'instagram' && (
        <div className={`${previewMode === 'mobile' ? 'max-w-[400px]' : 'max-w-[420px]'} mx-auto transition-all duration-300 overflow-hidden`}>
          {/* Instagram nav bar */}
          <div className="bg-white rounded-t-xl border border-b-0 border-slate-200 px-4 py-2 flex items-center justify-between">
            <span className="text-lg font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 bg-clip-text text-transparent" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
              Instagram
            </span>
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-slate-700" />
              <Send className="w-5 h-5 text-slate-700" />
            </div>
          </div>

          {/* Instagram Post Card */}
          <div className="bg-white border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden rounded-b-xl">
            {/* Profile Header */}
            <div className="p-3 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0"
                style={{
                  background: displayAvatarUrl
                    ? undefined
                    : 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                  padding: displayAvatarUrl ? 0 : '1px',
                }}
              >
                {displayAvatarUrl ? (
                  <div className="rounded-full p-[2px]" style={{ background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={displayAvatarUrl} alt="Profile" className="w-7 h-7 rounded-full object-cover border-2 border-white" />
                  </div>
                ) : (
                  <span className="text-[10px]">{(displayAuthorName || 'U').slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <span className="font-semibold text-slate-900 text-[13px]">{displayAuthorName.toLowerCase().replace(/\s+/g, '')}</span>
              <button className="ml-auto text-gray-500 hover:text-slate-600 p-1">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                </svg>
              </button>
            </div>

            {/* Image (Instagram is image-first) */}
            {imageToShow ? (
              <div className="w-full bg-black aspect-square flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageToShow}
                  alt="Post visual"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <Instagram className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">No image attached</p>
                  <p className="text-xs mt-1">Instagram posts require an image</p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Heart className="w-6 h-6 text-slate-800 hover:text-red-500 cursor-pointer transition-colors" />
                <MessageCircle className="w-6 h-6 text-slate-800 hover:text-slate-600 cursor-pointer" />
                <Send className="w-6 h-6 text-slate-800 hover:text-slate-600 cursor-pointer" />
              </div>
              <Bookmark className="w-6 h-6 text-slate-800 hover:text-slate-600 cursor-pointer" />
            </div>

            {/* Likes */}
            <div className="px-3 pb-1">
              <span className="text-[13px] font-semibold text-slate-900">128 likes</span>
            </div>

            {/* Caption */}
            <div className="px-3 pb-3">
              <div className="text-[13px] leading-[1.4] text-slate-900">
                <span className="font-semibold mr-1">{displayAuthorName.toLowerCase().replace(/\s+/g, '')}</span>
                {confirmedPost.headline && <span className="font-medium">{confirmedPost.headline} </span>}
                {confirmedPost.body}
              </div>
              {confirmedPost.cta && (
                <div className="mt-1 text-[13px] text-slate-700">{confirmedPost.cta}</div>
              )}
              {confirmedPost.hashtags?.length > 0 && (
                <div className="mt-1 text-[13px] text-[#00376B]">
                  {confirmedPost.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')}
                </div>
              )}
              <div className="mt-1 text-[11px] text-gray-500 uppercase">Just now</div>
            </div>
          </div>
        </div>
        )}

        {/* Character limit & reading time bar */}
        <div className={`${previewMode === 'mobile' ? 'max-w-[400px]' : 'max-w-[560px]'} mx-auto`}>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-gray-400">
                  {charCount.toLocaleString()} / 3,000 characters
                </span>
                <span className={`text-[11px] font-bold ${
                  charStatus === 'danger' ? 'text-red-500' : charStatus === 'warn' ? 'text-amber-500' : 'text-emerald-500'
                }`}>
                  {charStatus === 'danger' ? 'Over limit!' : charStatus === 'warn' ? 'Near limit' : 'Good'}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    charStatus === 'danger'
                      ? 'bg-red-50'
                      : charStatus === 'warn'
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, (charCount / 3000) * 100)}%` }}
                />
              </div>
            </div>
            <div className="text-center px-3 border-l border-slate-200">
              <div className="text-sm font-bold text-slate-700">{readingTime}m</div>
              <div className="text-[9px] text-gray-500 font-medium">read</div>
            </div>
          </div>
        </div>

        {/* Pre-Publish Checklist — improved */}
        <div className={`${previewMode === 'mobile' ? 'max-w-[400px]' : 'max-w-[560px]'} mx-auto`}>
          <Card className="p-5 bg-gradient-to-br from-white to-slate-500 border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-gray-500" />
                Pre-Publish Checklist
              </h4>
              <Badge className={`text-[10px] ${
                checklistDone === checklist.length
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {checklistDone}/{checklist.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {checklist.map((item) => (
                <div key={item.label} className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${
                  item.done ? 'bg-emerald-50/60' : 'bg-amber-50/40'
                }`}>
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${item.done ? 'text-slate-700' : 'text-amber-700 font-medium'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* ─── Publish Sidebar ─── */}
      <div className="space-y-4">
        {/* Estimated Reach Score */}
        <Card className="p-5 border border-slate-200 bg-gradient-to-br from-blue-50/50 to-cyan-50/30">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                <circle
                  cx="32" cy="32" r="26"
                  fill="none"
                  stroke="url(#reachGrad)"
                  strokeWidth="5"
                  strokeDasharray={`${reachScore * 1.634} 163.4`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
                <defs>
                  <linearGradient id="reachGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0EA5E9" />
                    <stop offset="100%" stopColor="#6366F1" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-black text-slate-800 leading-none">{reachScore}</span>
                <span className="text-[8px] text-gray-400 font-bold">REACH</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-slate-800">Estimated Reach</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {reachScore >= 80 ? 'High potential — optimized for engagement' :
                 reachScore >= 50 ? 'Good — add an image or CTA for more reach' :
                 'Add content, image, and hashtags to boost reach'}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                {[
                  { label: 'Content', done: Boolean(confirmedPost.body) },
                  { label: 'Image', done: Boolean(imageToShow) },
                  { label: 'CTA', done: Boolean(confirmedPost.cta) },
                  { label: 'Tags', done: (confirmedPost.hashtags?.length || 0) > 0 },
                ].map((f) => (
                  <span key={f.label} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    f.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-gray-500'
                  }`}>
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Publish Settings */}
        <Card className="p-5 border border-slate-200">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-slate-700">
            <Globe className="w-4 h-4 text-cyan-500" />
            Publish Settings
          </h3>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {account?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{account?.name || 'User'}</p>
                  <p className="text-[11px] text-gray-400 truncate">{account?.email || 'No email found'}</p>
                </div>
              </div>
            </div>

            {/* Platform connection statuses */}
            <div className="space-y-2">
              {/* LinkedIn connection */}
              {selectedChannels.includes('linkedin') && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 ${
                    linkedin.connected
                      ? 'border-emerald-200 bg-emerald-50/80'
                      : linkedin.expired
                      ? 'border-amber-200 bg-amber-50/80'
                      : 'border-rose-200 bg-rose-50/80'
                  }`}
                >
                  <Linkedin className="w-4 h-4 text-[#0A66C2] flex-shrink-0" />
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    linkedin.connected ? 'bg-emerald-500 animate-pulse' :
                    linkedin.expired ? 'bg-amber-50' : 'bg-rose-500'
                  }`} />
                  <div className="flex-1 min-w-0">
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
                        ? 'Checking LinkedIn...'
                        : linkedin.connected
                        ? 'LinkedIn connected'
                        : linkedin.expired
                        ? 'LinkedIn token expired'
                        : 'LinkedIn not connected'}
                    </p>
                  </div>
                  {!linkedin.connected && !linkedin.loading && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] flex-shrink-0"
                      onClick={() => (window.location.href = '/app/linkedin')}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              )}

              {/* Facebook connection status */}
              {selectedChannels.includes('facebook') && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 ${
                    meta.connected
                      ? 'border-emerald-200 bg-emerald-50/80'
                      : meta.expired
                      ? 'border-amber-200 bg-amber-50/80'
                      : 'border-rose-200 bg-rose-50/80'
                  }`}
                >
                  <Facebook className="w-4 h-4 text-[#1877F2] flex-shrink-0" />
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    meta.connected ? 'bg-emerald-500 animate-pulse' :
                    meta.expired ? 'bg-amber-50' : 'bg-rose-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold ${
                        meta.connected
                          ? 'text-emerald-700'
                          : meta.expired
                          ? 'text-amber-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {meta.loading
                        ? 'Checking Facebook...'
                        : meta.connected
                        ? `Facebook connected${meta.pages.length > 0 ? ` (${meta.pages[0].name})` : ''}`
                        : meta.expired
                        ? 'Facebook token expired'
                        : 'Facebook not connected'}
                    </p>
                  </div>
                  {!meta.connected && !meta.loading && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] flex-shrink-0"
                      onClick={() => (window.location.href = '/api/meta/start?intent=facebook')}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              )}

              {/* Instagram connection status */}
              {selectedChannels.includes('instagram') && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 ${
                    meta.connected && meta.defaultInstagramAccountId
                      ? 'border-emerald-200 bg-emerald-50/80'
                      : meta.expired
                      ? 'border-amber-200 bg-amber-50/80'
                      : meta.connected && !meta.defaultInstagramAccountId
                      ? 'border-amber-200 bg-amber-50/80'
                      : 'border-rose-200 bg-rose-50/80'
                  }`}
                >
                  <Instagram className="w-4 h-4 text-[#E4405F] flex-shrink-0" />
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    meta.connected && meta.defaultInstagramAccountId ? 'bg-emerald-500 animate-pulse' :
                    meta.expired ? 'bg-amber-50' :
                    meta.connected ? 'bg-amber-50' : 'bg-rose-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold ${
                        meta.connected && meta.defaultInstagramAccountId
                          ? 'text-emerald-700'
                          : meta.expired
                          ? 'text-amber-700'
                          : meta.connected && !meta.defaultInstagramAccountId
                          ? 'text-amber-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {meta.loading
                        ? 'Checking Instagram...'
                        : meta.connected && meta.defaultInstagramAccountId
                        ? (() => {
                            const igPage = meta.pages.find(p => p.instagram_business_account_id === meta.defaultInstagramAccountId);
                            return igPage?.instagram_username ? `Instagram connected (@${igPage.instagram_username})` : 'Instagram connected';
                          })()
                        : meta.connected && !meta.defaultInstagramAccountId
                        ? 'No Instagram Business account linked'
                        : meta.expired
                        ? 'Meta token expired'
                        : 'Instagram not connected'}
                    </p>
                  </div>
                  {!meta.connected && !meta.loading && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] flex-shrink-0"
                      onClick={() => (window.location.href = '/api/meta/start?intent=instagram')}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* LinkedIn-specific publish options */}
            {selectedChannels.includes('linkedin') && linkedin.connected && (
              <>
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 mb-1.5 block">Publish as:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPublishTarget('person')}
                      disabled={!linkedin.connected}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        publishTarget === 'person'
                          ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100 shadow-sm'
                          : 'border-slate-200 text-gray-400 hover:border-blue-300 hover:bg-blue-50/50'
                      }`}
                    >
                      <User className="w-5 h-5 mx-auto mb-1" />
                      <span className="text-xs font-semibold block">Personal</span>
                      <span className="text-[10px] text-gray-500">Your profile</span>
                    </button>
                    <button
                      onClick={() => setPublishTarget('org')}
                      disabled={!linkedin.connected || !canPostAsOrganization}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        publishTarget === 'org'
                          ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100 shadow-sm'
                          : 'border-slate-200 text-gray-400 hover:border-blue-300 hover:bg-blue-50/50'
                      } ${!canPostAsOrganization ? 'opacity-50' : ''}`}
                    >
                      <Building2 className="w-5 h-5 mx-auto mb-1" />
                      <span className="text-xs font-semibold block">Company</span>
                      <span className="text-[10px] text-gray-500">Page post</span>
                    </button>
                  </div>
                </div>
                {publishTarget === 'org' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-gray-400">Company page</label>
                    <select
                      value={selectedOrgUrn}
                      onChange={(e) => setSelectedOrgUrn(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
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
              </>
            )}
          </div>
        </Card>

        {/* Quick Actions — improved */}
        <Card className="p-4 space-y-2 border border-slate-200">
          <h3 className="font-bold text-sm mb-1 text-slate-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
            Quick Actions
          </h3>
          <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors" onClick={copyToClipboard}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Copy Post Text
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors" onClick={saveDraft} disabled={savingDraft}>
            <Download className="w-3.5 h-3.5 mr-2" />
            {savingDraft ? 'Saving...' : 'Save as Draft'}
          </Button>
          {!imageToShow && (
            <Button variant="outline" size="sm" className="w-full justify-start h-9 text-xs text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => onGoToStep(1)}>
              <AlertTriangle className="w-3.5 h-3.5 mr-2" />
              Add Image (Step 2)
            </Button>
          )}
        </Card>

        {/* Post Stats — visual upgrade */}
        <Card className="p-4 border border-slate-200">
          <h3 className="font-bold text-sm mb-3 text-slate-700">Post Analytics</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-3 bg-gradient-to-br from-blue-500 to-blue-100/50 rounded-xl border border-blue-100">
              <div className="text-xl font-black text-blue-700">
                {charCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide">Characters</div>
            </div>
            <div className="text-center p-3 bg-gradient-to-br from-purple-500 to-purple-100/50 rounded-xl border border-purple-100">
              <div className="text-xl font-black text-purple-700">
                {wordCount}
              </div>
              <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-wide">Words</div>
            </div>
            <div className="text-center p-3 bg-gradient-to-br from-cyan-500 to-cyan-100/50 rounded-xl border border-cyan-100">
              <div className="text-xl font-black text-cyan-700">
                {confirmedPost.hashtags?.length || 0}
              </div>
              <div className="text-[10px] text-cyan-600 font-semibold uppercase tracking-wide">Hashtags</div>
            </div>
            <div className="text-center p-3 bg-gradient-to-br from-emerald-500 to-emerald-100/50 rounded-xl border border-emerald-100">
              <div className="text-xl font-black text-emerald-700">
                {imageToShow ? '✓' : '—'}
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wide">Image</div>
            </div>
          </div>
          {isTruncatable && (
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-3 flex items-start gap-1.5 border border-amber-100">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Post is {postBodyText.length} chars — LinkedIn will truncate after ~210 chars with &quot;see more&quot;</span>
            </p>
          )}
        </Card>

{/* ─── PUBLISH BUTTONS ─── */}
        <div className="space-y-2">
          {/* LinkedIn Publish */}
          {selectedChannels.includes('linkedin') && (
            <Button
              onClick={publishToLinkedIn}
              disabled={
                publishing ||
                !confirmedPost ||
                !linkedin.connected ||
                (publishTarget === 'org' && !selectedOrganization?.urn)
              }
              className="w-full h-12 text-sm font-bold bg-gradient-to-r from-[#0A66C2] via-blue-500 to-cyan-500 hover:from-[#094F9E] hover:via-blue-600 hover:to-cyan-600 shadow-lg hover:shadow-xl hover:shadow-blue-50/25 transition-all rounded-xl border border-blue-600/20"
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Linkedin className="w-4 h-4 mr-2" />
                  Publish to LinkedIn
                </>
              )}
            </Button>
          )}

          {/* Facebook Publish */}
          {selectedChannels.includes('facebook') && (
            <Button
              onClick={publishToFacebook}
              disabled={
                publishingFb ||
                !confirmedPost ||
                !meta.connected
              }
              className="w-full h-12 text-sm font-bold bg-gradient-to-r from-[#1877F2] to-[#42A5F5] hover:from-[#1565C0] hover:to-[#2196F3] shadow-lg hover:shadow-xl hover:shadow-blue-50/25 transition-all rounded-xl border border-blue-600/20"
            >
              {publishingFb ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Facebook className="w-4 h-4 mr-2" />
                  Publish to Facebook
                </>
              )}
            </Button>
          )}

          {/* Instagram Publish */}
          {selectedChannels.includes('instagram') && (
            <Button
              onClick={publishToInstagram}
              disabled={
                publishingIg ||
                !confirmedPost ||
                !meta.connected ||
                !meta.defaultInstagramAccountId ||
                !imageToShow
              }
              className="w-full h-12 text-sm font-bold bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCB045] hover:from-[#6A1B9A] hover:via-[#D50000] hover:to-[#F9A825] shadow-lg hover:shadow-xl hover:shadow-purple-50/25 transition-all rounded-xl border border-purple-600/20"
            >
              {publishingIg ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Instagram className="w-4 h-4 mr-2" />
                  Publish to Instagram
                </>
              )}
            </Button>
          )}
        </div>

        <p className="text-[11px] text-center text-gray-500">
          {linkedin.connected && selectedChannels.includes('linkedin')
            ? `LinkedIn: Publishing${publishTarget === 'org' ? ` as ${selectedOrganization?.name || 'organization'}` : ' to your personal profile'}`
            : selectedChannels.includes('linkedin')
            ? 'Connect LinkedIn first to publish'
            : 'Preview your post across platforms'}
        </p>
      </div>
    </div>
  );
}
