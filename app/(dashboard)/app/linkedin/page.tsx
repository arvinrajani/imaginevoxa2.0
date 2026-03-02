'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Linkedin,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  Clock,
  Link2,
  Unlink,
  ExternalLink,
  Activity,
  Zap,
  Info,
  Building2,
  User,
  ChevronDown,
  Loader2,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';

interface Organization {
  id: string;
  name: string;
  urn: string;
  logo?: string;
}

interface LinkedInConnection {
  orgToken?: {
    connected: boolean;
    expiresAt: string | null;
    scopes: string[];
  };
  connected: boolean;
  profile?: {
    id: string;
    name: string;
    headline: string;
    pictureUrl: string;
    vanityName: string;
    memberUrn: string;
    email?: string;
    source?: string;
  };
  token?: {
    expiresAt: string;
    scopes: string[];
  };
  stats?: {
    postsPublished: number;
    lastPostedAt: string | null;
    failedAttempts: number;
  };
  organizations: Organization[];
}

type LinkedInConnectedProfile = {
  name?: string | null;
  email?: string | null;
  picture_url?: string | null;
  vanity_name?: string | null;
  member_urn?: string | null;
  source?: string | null;
};

type LinkedInConnectionRow = {
  orgs?: Organization[] | null;
  access_token?: string | null;
  org_access_token?: string | null;
  org_expires_at?: string | null;
  org_scopes?: string[] | null;
  member_urn?: string | null;
  linkedin_member_urn?: string | null;
  expires_at?: string | null;
  scopes?: string[] | null;
  connected_profile?: LinkedInConnectedProfile | null;
};

function ConnectionStatus({ connection }: { connection: LinkedInConnection }) {
  if (!connection.connected) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <XCircle className="h-5 w-5" />
        <span className="font-medium">Not Connected</span>
      </div>
    );
  }

  const expiresAt = connection.token?.expiresAt ? new Date(connection.token.expiresAt) : null;
  const now = new Date();
  const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isExpiringSoon = daysUntilExpiry <= 14;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle className="h-5 w-5" />
        <span className="font-medium">Connected</span>
      </div>
      {isExpiringSoon && (
        <div className="flex items-center gap-2 text-amber-600 text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>Token expires in {daysUntilExpiry} days</span>
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200">
      <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

export default function LinkedInPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [connection, setConnection] = useState<LinkedInConnection>({ connected: false, organizations: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isConnectingOrg, setIsConnectingOrg] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState('');
  
  // Posting target selection
  const [defaultPostingTarget, setDefaultPostingTarget] = useState<'person' | 'organization'>('person');
  const [selectedOrgUrn, setSelectedOrgUrn] = useState<string>('');
  const [isSavingPreference, setIsSavingPreference] = useState(false);
  
  // Manual org addition
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [newOrgId, setNewOrgId] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [isAddingOrg, setIsAddingOrg] = useState(false);
  const [addOrgError, setAddOrgError] = useState('');
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);

  useEffect(() => {
    fetchConnectionData();
  }, []);

  const friendlyError = useMemo(() => {
    const errorParam = searchParams.get('error');
    if (!errorParam) return null;
    const errorDescription = searchParams.get('error_description');
    const normalized = errorParam.replace(/\+/g, ' ').trim();

    const ERROR_MAP: Record<string, string> = {
      'LinkedIn not configured': 'LinkedIn is not configured. Check your client ID, secret, and redirect URI.',
      'Invalid state': 'Your LinkedIn login session expired. Please try connecting again.',
      'Missing OAuth code': 'LinkedIn did not return an authorization code.',
      'Token exchange failed': 'LinkedIn rejected the authorization code. This can happen if the code expired.',
      'Could not get LinkedIn profile': 'LinkedIn did not return profile information for this account.',
      'Missing user session': 'Your login session expired. Please sign in again and reconnect.',
      internal_error: 'The LinkedIn connection request failed unexpectedly. Please try again.',
      unauthorized_scope_error: 'The LinkedIn app is missing permissions for one or more requested scopes.',
      redirect_uri_mismatch: 'The redirect URI does not match what is configured in the LinkedIn developer console.',
      access_denied: 'LinkedIn access was denied. Please approve the permissions prompt.',
      invalid_client: 'LinkedIn rejected the client credentials. Check your client ID and secret.',
    };

    const baseMessage = ERROR_MAP[normalized] || ERROR_MAP[errorParam] || 'LinkedIn connection failed. Please try again.';
    const details = errorDescription ? errorDescription.slice(0, 180) : null;

    return { message: baseMessage, details, code: normalized || errorParam };
  }, [searchParams]);

  const statusMessage = useMemo(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'connected') {
      return 'LinkedIn connected successfully.';
    }
    return null;
  }, [searchParams]);

  const fetchConnectionData = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const user = sessionData?.session?.user || null;
      if (sessionError || !user) {
        setIsLoading(false);
        return;
      }
      setSignedInEmail(user.email || '');

      // Get LinkedIn connection (includes enriched LinkedIn profile details)
      const connectionRes = await fetch('/api/linkedin/connection', { cache: 'no-store' });
      if (!connectionRes.ok) {
        setConnection({ connected: false, organizations: [] });
        setIsLoading(false);
        return;
      }
      const linkedinConn = (await connectionRes.json()) as LinkedInConnectionRow | null;

      if (!linkedinConn) {
        setConnection({ connected: false, organizations: [] });
        setIsLoading(false);
        return;
      }

      // Get user profile
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .limit(1);
      const profile = profileRows?.[0] ?? null;

      // Get post stats
      const { data: posts } = await supabase
        .from('posts')
        .select('id, status, posted_at')
        .eq('user_id', user.id);

      const postsPublished = posts?.filter(p => p.status === 'posted').length || 0;
      const failedAttempts = posts?.filter(p => p.status === 'failed').length || 0;
      const lastPost = posts?.filter(p => p.posted_at).sort((a, b) => 
        new Date(b.posted_at!).getTime() - new Date(a.posted_at!).getTime()
      )[0];

      // Parse organizations from the connection
      const orgs = linkedinConn?.orgs ?? [];
      const connectedProfile = linkedinConn?.connected_profile || null;
      const memberUrn =
        connectedProfile?.member_urn ||
        linkedinConn?.member_urn ||
        linkedinConn?.linkedin_member_urn ||
        '';
      const memberId = memberUrn.split(':').pop() || '';
      const linkedInDisplayName =
        connectedProfile?.name ||
        profile?.full_name ||
        user.email?.split('@')[0] ||
        'LinkedIn User';
      const linkedInHeadline = [
        connectedProfile?.email || null,
        memberUrn || null,
      ]
        .filter(Boolean)
        .join(' • ') || 'Connected via LinkedIn OAuth';
      const linkedInAvatar =
        connectedProfile?.picture_url ||
        profile?.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(linkedInDisplayName)}&background=0077B5&color=fff`;

      const orgToken = {
        connected: Boolean(linkedinConn?.org_access_token),
        expiresAt: linkedinConn?.org_expires_at || null,
        scopes: linkedinConn?.org_scopes ?? [],
      };

      setConnection({
        connected: Boolean(linkedinConn?.access_token),
        profile: {
          id: memberId,
          name: linkedInDisplayName,
          headline: linkedInHeadline,
          pictureUrl: linkedInAvatar,
          vanityName: connectedProfile?.vanity_name || '',
          memberUrn,
          email: connectedProfile?.email || undefined,
          source: connectedProfile?.source || undefined,
        },
        token: {
          expiresAt: linkedinConn?.expires_at || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          scopes: linkedinConn?.scopes ?? ['w_member_social', 'r_liteprofile'],
        },
        orgToken,
        stats: {
          postsPublished,
          lastPostedAt: lastPost?.posted_at || null,
          failedAttempts,
        },
        organizations: orgs,
      });

      // Set default org if available
      if (orgs.length > 0) {
        setSelectedOrgUrn(orgs[0].urn);
      }
    } catch (error) {
      console.error('Error fetching connection:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddOrganization = async () => {
    if (!newOrgId.trim() || !newOrgName.trim()) {
      setAddOrgError('Please enter both Organization ID and Name');
      return;
    }
    
    setIsAddingOrg(true);
    setAddOrgError('');
    
    try {
      const res = await fetch('/api/linkedin/add-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: newOrgId.trim(), orgName: newOrgName.trim() }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Refresh connection data
        await fetchConnectionData();
        setNewOrgId('');
        setNewOrgName('');
        setShowAddOrg(false);
      } else {
        setAddOrgError(data.error || 'Failed to add organization');
      }
    } catch (error) {
      setAddOrgError('Failed to add organization');
    } finally {
      setIsAddingOrg(false);
    }
  };

  const handleDeleteOrganization = async (orgId: string) => {
    setDeletingOrgId(orgId);
    try {
      const res = await fetch(`/api/linkedin/add-org?orgId=${encodeURIComponent(orgId)}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      
      if (data.success) {
        await fetchConnectionData();
      } else {
        setAddOrgError(data.error || 'Failed to delete organization');
      }
    } catch (error) {
      setAddOrgError('Failed to delete organization');
    } finally {
      setDeletingOrgId(null);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    window.location.href = '/api/linkedin/start';
  };

  const handleRestartConnection = async () => {
    setIsConnecting(true);
    try {
      await fetch('/api/linkedin/disconnect', { method: 'POST' });
    } catch (error) {
      // Ignore disconnect failures on restart
    }
    window.location.href = '/api/linkedin/start';
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await fetch('/api/linkedin/disconnect', { method: 'POST' });
      setConnection({ connected: false, organizations: [] });
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleRefreshToken = async () => {
    setIsConnecting(true);
    window.location.href = '/api/linkedin/start';
  };

  const handleConnectOrg = async () => {
    setIsConnectingOrg(true);
    window.location.href = '/api/linkedin/start?target=organization';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatLastPosted = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateString);
  };

  const daysUntilExpiry = connection.token?.expiresAt 
    ? Math.ceil((new Date(connection.token.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const orgTokenConnected = connection.orgToken?.connected;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <PageHeader
        eyebrow="Integrations"
        title={
          <>
            <span className="text-voxa-gradient">LinkedIn</span> Connection
          </>
        }
        subtitle="Connect your LinkedIn account to publish posts directly"
      />

      {statusMessage && (
        <div className="rounded-xl border border-emerald-50/30 bg-emerald-50/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      )}

      {friendlyError && (
        <div className="rounded-xl border border-rose-300/60 bg-rose-100 text-rose-800 px-4 py-3 text-sm space-y-2">
          <div className="font-medium">{friendlyError.message}</div>
          {friendlyError.details && (
            <div className="text-xs text-rose-700/80">Details: {friendlyError.details}</div>
          )}
          {friendlyError.code && (
            <div className="text-xs text-rose-700/70">Error code: {friendlyError.code}</div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleRestartConnection}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Restart connection
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchConnectionData}
              className="border-rose-300/40 text-rose-100 hover:bg-rose-500/10"
            >
              Refresh status
            </Button>
          </div>
        </div>
      )}

      {/* Main Connection Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0077B5] to-[#00A0DC] p-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl bg-white flex items-center justify-center">
              <Linkedin className="h-10 w-10 text-[#0077B5]" />
            </div>
            <div className="text-gray-900">
              <h2 className="text-xl font-bold">LinkedIn</h2>
              <p className="text-blue-100">Professional Network Integration</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {connection.connected && connection.profile ? (
            <div className="space-y-6">
              {/* Profile Info */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <img
                    src={connection.profile.pictureUrl}
                    alt={connection.profile.name}
                    className="h-16 w-16 rounded-full object-cover border-2 border-gray-200"
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {connection.profile.name}
                    </h3>
                    <p className="text-sm text-gray-500">{connection.profile.headline}</p>
                    {connection.profile.memberUrn ? (
                      <p className="text-xs text-gray-500 mt-1">
                        LinkedIn Member: <span className="font-mono">{connection.profile.memberUrn}</span>
                      </p>
                    ) : null}
                    {signedInEmail ? (
                      <p className="text-xs text-gray-500">
                        App account: {signedInEmail}
                      </p>
                    ) : null}
                    {connection.profile.vanityName ? (
                      <a
                        href={`https://linkedin.com/in/${connection.profile.vanityName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1"
                      >
                        View LinkedIn Profile <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ConnectionStatus connection={connection} />
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="text-red-600 hover:text-red-700 hover:bg-red-500 border-red-200"
                  >
                    {isDisconnecting ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4 mr-2" />
                    )}
                    Disconnect
                  </Button>
                </div>
              </div>

              {/* Token Health */}
              <div className="bg-gray-50/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-violet-600" />
                    <span className="font-medium text-gray-900">Token Health</span>
                  </div>
                  <span className={`text-sm font-medium ${
                    daysUntilExpiry > 30 
                      ? 'text-green-600' 
                      : daysUntilExpiry > 14 
                        ? 'text-amber-600' 
                        : 'text-red-600'
                  }`}>
                    {daysUntilExpiry > 0 ? `${daysUntilExpiry} days remaining` : 'Expired'}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (daysUntilExpiry / 60) * 100)}%` }}
                    className={`h-full rounded-full ${
                      daysUntilExpiry > 30 
                        ? 'bg-green-50' 
                        : daysUntilExpiry > 14 
                          ? 'bg-amber-50' 
                          : 'bg-red-50'
                    }`}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Expires on {formatDate(connection.token!.expiresAt)}
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  icon={Activity}
                  label="Posts Published"
                  value={connection.stats?.postsPublished || 0}
                  color="bg-gradient-to-br from-violet-500 to-purple-600"
                />
                <StatCard
                  icon={Clock}
                  label="Last Posted"
                  value={formatLastPosted(connection.stats?.lastPostedAt || null)}
                  color="bg-gradient-to-br from-blue-500 to-cyan-600"
                />
                <StatCard
                  icon={AlertTriangle}
                  label="Failed Attempts"
                  value={connection.stats?.failedAttempts || 0}
                  color="bg-gradient-to-br from-amber-500 to-orange-600"
                />
              </div>

              {/* Post As Section */}
              <div className="bg-gradient-to-r from-violet-50 to-blue-50/20 rounded-xl p-5 border border-violet-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-600" />
                  Default Posting Target
                </h4>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button
                    onClick={() => setDefaultPostingTarget('person')}
                    className={`p-4 rounded-xl text-left transition-all flex items-center gap-3 ${
                      defaultPostingTarget === 'person'
                        ? 'bg-violet-600 text-white shadow-lg shadow-cyan-50/20'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      defaultPostingTarget === 'person' 
                        ? 'bg-white/20' 
                        : 'bg-gradient-to-br from-violet-400 to-blue-500'
                    }`}>
                      <User className={`h-5 w-5 ${defaultPostingTarget === 'person' ? 'text-gray-900' : 'text-gray-900'}`} />
                    </div>
                    <div>
                      <p className="font-medium">Personal Profile</p>
                      <p className={`text-xs ${defaultPostingTarget === 'person' ? 'text-violet-600' : 'text-gray-500'}`}>
                        Post as yourself
                      </p>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => connection.organizations.length > 0 ? setDefaultPostingTarget('organization') : null}
                    className={`p-4 rounded-xl text-left transition-all flex items-center gap-3 ${
                      defaultPostingTarget === 'organization'
                        ? 'bg-violet-600 text-white shadow-lg shadow-cyan-50/20'
                        : (!orgTokenConnected || connection.organizations.length === 0)
                        ? 'bg-gray-100/50 text-gray-400 cursor-not-allowed border border-gray-200'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      defaultPostingTarget === 'organization' 
                        ? 'bg-white/20' 
                        : connection.organizations.length === 0
                        ? 'bg-gray-300'
                        : 'bg-gradient-to-br from-blue-500 to-cyan-500'
                    }`}>
                      <Building2 className={`h-5 w-5 ${defaultPostingTarget === 'organization' ? 'text-gray-900' : 'text-gray-900'}`} />
                    </div>
                    <div>
                      <p className="font-medium">Organization</p>
                      <p className={`text-xs ${
                        defaultPostingTarget === 'organization' 
                          ? 'text-violet-600' 
                          : 'text-gray-500'
                      }`}>
                        {connection.organizations.length === 0 ? 'No pages found' : `${connection.organizations.length} page(s) available`}
                      </p>
                    </div>
                  </button>
                </div>

                {/* Organization Dropdown */}
                {defaultPostingTarget === 'organization' && orgTokenConnected && connection.organizations.length > 0 && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      Select Company Page
                    </label>
                    <div className="relative">
                      <select
                        value={selectedOrgUrn}
                        onChange={(e) => setSelectedOrgUrn(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-violet-50 focus:border-transparent transition-all text-sm appearance-none cursor-pointer"
                      >
                        {connection.organizations.map((org) => (
                          <option key={org.urn} value={org.urn}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {!orgTokenConnected && (
                  <div className="bg-amber-50/20 rounded-lg p-3 mt-2">
                    <p className="text-xs text-amber-700 mb-2">
                      Connect the organization LinkedIn app to enable company posting.
                    </p>
                    <button
                      onClick={handleConnectOrg}
                      className="text-xs text-violet-600 hover:underline font-medium"
                    >
                      Connect organization app
                    </button>
                  </div>
                )}

                {orgTokenConnected && connection.organizations.length === 0 && !showAddOrg && (
                  <div className="bg-amber-50/20 rounded-lg p-3 mt-2">
                    <p className="text-xs text-amber-700 mb-2">
                      💡 <strong>No company pages found.</strong> LinkedIn&apos;s API requires special permissions to auto-detect pages.
                    </p>
                    <button
                      onClick={() => setShowAddOrg(true)}
                      className="text-xs text-violet-600 hover:underline font-medium"
                    >
                      + Add organization manually
                    </button>
                  </div>
                )}

                {/* Manual Add Organization Form */}
                {showAddOrg && (
                  <div className="bg-white rounded-lg p-4 mt-2 border border-gray-200">
                    <h5 className="text-sm font-medium text-gray-900 mb-3">
                      Add Organization Page
                    </h5>
                    <p className="text-xs text-gray-500 mb-3">
                      Find your page ID from your LinkedIn company page URL: linkedin.com/company/<strong>your-page-id</strong>
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Organization ID or Page URL</label>
                        <input
                          type="text"
                          value={newOrgId}
                          onChange={(e) => {
                            // Extract ID from URL if pasted
                            let val = e.target.value;
                            if (val.includes('linkedin.com/company/')) {
                              val = val.split('linkedin.com/company/')[1]?.split('/')[0]?.split('?')[0] || val;
                            }
                            setNewOrgId(val);
                          }}
                          placeholder="e.g., linkedin-automations-101 or 123456789"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-violet-50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Organization Name</label>
                        <input
                          type="text"
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          placeholder="e.g., LinkedIn Automations 101"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-violet-50"
                        />
                      </div>
                      {addOrgError && (
                        <p className="text-xs text-red-500">{addOrgError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={handleAddOrganization}
                          disabled={isAddingOrg}
                          size="sm"
                          className="bg-violet-600 hover:bg-violet-700 text-white"
                        >
                          {isAddingOrg ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          Add Organization
                        </Button>
                        <Button
                          onClick={() => {
                            setShowAddOrg(false);
                            setNewOrgId('');
                            setNewOrgName('');
                            setAddOrgError('');
                          }}
                          variant="outline"
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show existing organizations with option to add more */}
                {connection.organizations.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h5 className="text-xs font-medium text-gray-600">
                      Your Organizations
                    </h5>
                    {connection.organizations.map((org) => (
                      <div 
                        key={org.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-violet-500" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{org.name}</p>
                            <p className="text-xs text-gray-500">ID: {org.id}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteOrganization(org.id)}
                          disabled={deletingOrgId === org.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50/20 rounded-lg transition-colors"
                          title="Remove organization"
                        >
                          {deletingOrgId === org.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setShowAddOrg(!showAddOrg)}
                      className="text-xs text-violet-600 hover:underline"
                    >
                      + Add another organization
                    </button>
                  </div>
                )}
              </div>

              {/* Permissions */}
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Granted Permissions
                </h4>
                <div className="flex flex-wrap gap-2">
                  {connection.token?.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full"
                    >
                      {scope}
                    </span>
                  ))}
                </div>

                {orgTokenConnected && connection.orgToken?.scopes?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {connection.orgToken.scopes.map((scope) => (
                      <span
                        key={`org-${scope}`}
                        className="text-xs bg-blue-50/30 text-blue-600 px-3 py-1 rounded-full"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                ) : null}
                
                {/* Warning if no organization scopes */}
                {!connection.token?.scopes.includes('w_organization_social') && (
                  <div className="mt-3 bg-amber-50/20 rounded-lg p-3">
                    <p className="text-xs text-amber-700">
                      ⚠️ <strong>Organization posting limited.</strong> Your LinkedIn app doesn&apos;t have 
                      organization posting permissions yet. You can still add organizations manually and 
                      the app will try to post, but LinkedIn may reject posts to organization pages.
                      <br /><br />
                      <strong>To enable full organization posting:</strong> Apply for LinkedIn&apos;s 
                      Marketing Developer Platform to get <code className="bg-amber-100 px-1 rounded">w_organization_social</code> scope.
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={handleRefreshToken}
                  disabled={isConnecting}
                  className="flex-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:from-violet-700 hover:to-blue-700 text-white"
                >
                  {isConnecting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh Token
                </Button>
                <Button
                  variant="outline"
                  onClick={handleConnectOrg}
                  disabled={isConnectingOrg}
                  className="flex-1"
                >
                  {isConnectingOrg ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-2" />
                  )}
                  {orgTokenConnected ? "Reconnect Org App" : "Connect Org App"}
                </Button>
              </div>
            </div>
          ) : (
            /* Not Connected State */
            <div className="text-center py-8">
              <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Linkedin className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Connect Your LinkedIn
              </h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Link your LinkedIn account to publish posts directly from Imaginevoxa. 
                We only request permissions needed for posting.
              </p>
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                className="bg-[#0077B5] hover:bg-[#006097] text-white px-8"
              >
                {isConnecting ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Linkedin className="h-4 w-4 mr-2" />
                )}
                Connect LinkedIn
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Info Cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-blue-50/20 rounded-xl p-6 border border-blue-200"
        >
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-blue-100/50 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">
                Secure Connection
              </h3>
              <p className="text-sm text-blue-700">
                We use official LinkedIn OAuth 2.0. Your password is never stored or accessed by Imaginevoxa.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-violet-50/20 rounded-xl p-6 border border-violet-200"
        >
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-violet-100/50 flex items-center justify-center shrink-0">
              <Info className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-violet-900 mb-1">
                Why Connect?
              </h3>
              <p className="text-sm text-violet-700">
                Connecting allows one-click publishing directly to LinkedIn without copying and pasting.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
