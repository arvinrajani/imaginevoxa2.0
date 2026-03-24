"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Unplug,
  RefreshCw,
  Globe,
  Instagram,
  Zap,
  Shield,
  ArrowRight,
} from "lucide-react";

type MetaPage = {
  id: string;
  name: string;
  picture_url: string | null;
  instagram_business_account_id: string | null;
  instagram_name: string | null;
  instagram_username: string | null;
  instagram_profile_picture_url: string | null;
  category: string;
};

type MetaConnection = {
  connected: boolean;
  token_expires_at: string | null;
  default_facebook_page_id: string | null;
  default_instagram_account_id: string | null;
  pages: MetaPage[];
};

export default function MetaPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState<"facebook" | "instagram" | null>(null);
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeOrigin, setRuntimeOrigin] = useState<string | null>(null);

  const fetchConnection = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/meta/connection", { cache: "no-store" });
      if (response.status === 401) {
        setError("Please sign in first.");
        setConnection(null);
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError((payload as { error?: string }).error || "Failed to load Meta connection.");
        setConnection(null);
        return;
      }
      const payload = (await response.json()) as MetaConnection | null;
      setConnection(payload);
    } catch {
      setError("Failed to load Meta connection.");
      setConnection(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConnection();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRuntimeOrigin(window.location.origin);
    }
  }, []);

  const connect = (intent: "facebook" | "instagram") => {
    window.location.href = `/api/meta/start?intent=${intent}`;
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/meta/disconnect", { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError((payload as { error?: string }).error || "Failed to disconnect Meta.");
      }
      await fetchConnection();
    } catch {
      setError("Failed to disconnect Meta.");
    } finally {
      setDisconnecting(false);
    }
  };

  const updateDefaults = async (payload: {
    defaultFacebookPageId?: string | null;
    defaultInstagramAccountId?: string | null;
  }) => {
    setSavingDefaults(
      payload.defaultInstagramAccountId !== undefined ? "instagram" : "facebook"
    );
    setError(null);
    try {
      const response = await fetch("/api/meta/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError((result as { error?: string } | null)?.error || "Failed to update Meta defaults.");
        return;
      }

      setConnection(result as MetaConnection);
    } catch {
      setError("Failed to update Meta defaults.");
    } finally {
      setSavingDefaults(null);
    }
  };

  const fbPages = connection?.pages || [];
  const igPages = fbPages.filter((p) => p.instagram_business_account_id);
  const hasConnection = connection && fbPages.length > 0;
  const hasInstagram = igPages.length > 0;

  const tokenExpiresAt = connection?.token_expires_at
    ? new Date(connection.token_expires_at)
    : null;
  const tokenDaysLeft = tokenExpiresAt
    ? Math.max(0, Math.ceil((tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const searchError = searchParams.get("error");
  const searchErrorDescription = searchParams.get("error_description");
  const isMetaSetupError =
    searchError === "meta_oauth_not_configured" ||
    searchError === "Meta OAuth not configured";
  const missingMetaKeys = (searchParams.get("missing") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const setupKeysToShow =
    missingMetaKeys.length > 0
      ? missingMetaKeys
      : ["META_APP_ID", "META_APP_SECRET"];
  const callbackUri =
    searchParams.get("callback_uri") ||
    (runtimeOrigin ? `${runtimeOrigin}/api/meta/callback` : null);
  let callbackHost: string | null = null;
  try {
    callbackHost = callbackUri ? new URL(callbackUri).hostname : null;
  } catch {
    callbackHost = null;
  }
  const isPreviewLikeHost = Boolean(callbackHost && callbackHost.endsWith(".vercel.app"));

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      {/* ─── Header ─── */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1877F2]/10 via-purple-50/10 to-[#E4405F]/10 border border-slate-200/80 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1877F2] via-purple-600 to-[#E4405F] flex items-center justify-center shadow-lg shadow-purple-50/20">
                <Zap className="w-7 h-7 text-white" />
              </div>
              {hasConnection && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-900">
                  Meta Integrations
                </h1>
                <span className="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-300/30 text-purple-700 text-[10px] font-bold uppercase tracking-wider">
                  Facebook + Instagram
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Connect your Meta accounts to auto-publish posts to Facebook Pages and Instagram Business accounts
              </p>
            </div>
          </div>

          {/* Token status */}
          {hasConnection && tokenDaysLeft !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${
                tokenDaysLeft > 30
                  ? "bg-emerald-50/30 border-emerald-200 text-emerald-700"
                  : tokenDaysLeft > 7
                    ? "bg-amber-50/30 border-amber-200 text-amber-700"
                    : "bg-red-50/30 border-red-200 text-red-700"
              }`}
            >
              <Shield className="w-3 h-3" />
              Token: {tokenDaysLeft}d left
            </div>
          )}
        </div>
      </div>

      {/* ─── Status Banners ─── */}
      {searchParams.get("status") === "connected" && (
        <div className="rounded-xl border border-emerald-200/50 bg-emerald-50/20 px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Meta connected successfully!
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Your accounts are now linked and ready for publishing.
            </p>
          </div>
        </div>
      )}

      {searchParams.get("error") === "no_instagram_linked" && (
        <div className="rounded-xl border border-amber-200/50 bg-amber-50/20 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              No linked Instagram Professional accounts found
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Meta requires your Instagram Business/Creator account to be explicitly linked to a
              Facebook Page in the Meta Business Suite before it can be connected to third-party apps.
              Please link them in Meta and try again.
            </p>
            <a
              href="https://business.facebook.com/settings/instagram-accounts"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline mt-2"
            >
              Open Meta Business Suite <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {isMetaSetupError && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/20 px-5 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                Meta OAuth is not configured on this deployment
              </p>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                This is a deployment configuration problem. Add the missing Meta environment
                variables in Vercel, then redeploy before trying to connect Facebook or Instagram
                again.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-red-200/60 bg-white/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-700">
                Missing Env Vars
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {setupKeysToShow.map((key) => (
                  <span
                    key={key}
                    className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-mono text-[11px] font-semibold text-red-800"
                  >
                    {key}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-red-700/90">
                Recommended for production too: <span className="font-mono">APP_BASE_URL</span>.
                Optional if you want a fixed callback: <span className="font-mono">META_REDIRECT_URI</span>.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200/70 bg-white/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Callback URL To Allow In Meta
              </p>
              <p className="mt-2 break-all rounded-md bg-slate-950 px-2.5 py-2 font-mono text-[11px] text-slate-100">
                {callbackUri || "Unable to determine callback URL"}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Add this exact URL to your Meta app&apos;s Valid OAuth Redirect URIs.
              </p>
            </div>
          </div>

          {isPreviewLikeHost && (
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/70 px-3 py-3">
              <p className="text-xs font-semibold text-amber-800">
                Vercel preview domain detected
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                OAuth is more reliable on a stable production or custom domain. Preview URLs can
                change and break Meta redirect URI validation even after env vars are added.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-slate-200/70 bg-white/80 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Fix Steps
            </p>
            <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-700">
              <p>1. Add the Meta env vars in your Vercel project settings.</p>
              <p>2. Add the callback URL above inside Meta for Developers.</p>
              <p>3. Redeploy, then reconnect Facebook or Instagram from this page.</p>
            </div>
          </div>
        </div>
      )}

      {searchError && searchError !== "no_instagram_linked" && !isMetaSetupError && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/20 px-5 py-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-700">
              {decodeURIComponent(searchError || "Meta connection failed")}
            </p>
            {searchErrorDescription && (
              <p className="mt-1 text-xs leading-relaxed text-red-600">
                {decodeURIComponent(searchErrorDescription)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Loading State ─── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1877F2] to-purple-600 flex items-center justify-center animate-pulse">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking Meta connection...
            </div>
          </div>
        </div>
      )}

      {/* ─── Connection Cards ─── */}
      {!loading && (
        <div className="grid gap-5 md:grid-cols-2">
          {/* ── Facebook Card ── */}
          <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden flex flex-col">
            {/* Card header */}
            <div className="px-5 py-4 border-b border-slate-100/80 bg-gradient-to-r from-[#1877F2]/5 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1877F2] flex items-center justify-center shadow-sm">
                    <Globe className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Facebook Pages
                    </h2>
                    <p className="text-xs text-gray-400">
                      Publish to your managed Pages
                    </p>
                  </div>
                </div>
                {hasConnection && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50/30 border border-emerald-200/50 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" />
                    Connected
                  </span>
                )}
              </div>
            </div>

            {/* Card body */}
            <div className="flex-1 p-5">
              {hasConnection ? (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                  {fbPages.map((page) => (
                    <div
                      key={`fb-${page.id}`}
                      className="rounded-xl border border-slate-200/50 bg-slate-50/40 p-4 transition-all hover:border-[#1877F2]/30"
                    >
                      <div className="flex items-center gap-3">
                        {page.picture_url ? (
                          <img
                            src={page.picture_url}
                            alt={page.name}
                            className="w-10 h-10 rounded-xl border border-slate-200 object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1877F2] to-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {page.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">
                            {page.name}
                          </p>
                          <p className="text-xs text-gray-400">{page.category}</p>
                        </div>
                        {connection?.default_facebook_page_id === page.id ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            Default
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            onClick={() => updateDefaults({ defaultFacebookPageId: page.id })}
                            disabled={savingDefaults !== null}
                          >
                            {savingDefaults === "facebook" ? "Saving..." : "Set default"}
                          </Button>
                        )}
                      </div>

                      {/* Linked Instagram preview */}
                      {page.instagram_business_account_id && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center gap-2.5">
                          {page.instagram_profile_picture_url ? (
                            <img
                              src={page.instagram_profile_picture_url}
                              alt={page.instagram_username || "Instagram"}
                              className="w-7 h-7 rounded-full border border-slate-200"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#E4405F] to-purple-600 flex items-center justify-center">
                              <Instagram className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                          <span className="text-xs font-medium text-slate-600">
                            {page.instagram_username
                              ? `@${page.instagram_username}`
                              : "Instagram linked"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Globe className="w-7 h-7 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-400 mb-1">
                    Not connected
                  </p>
                  <p className="text-xs text-gray-500 max-w-[200px]">
                    Connect to start publishing directly to your Facebook Pages
                  </p>
                </div>
              )}
            </div>

            {/* Card footer */}
            <div className="px-5 py-4 border-t border-slate-100/80 bg-slate-50/5/30">
              {hasConnection ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs"
                    onClick={() => connect("facebook")}
                    disabled={loading}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Refresh Pages
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs text-red-600 hover:text-red-700 hover:bg-red-50/20 border-red-200/50"
                    onClick={disconnect}
                    disabled={disconnecting || loading}
                  >
                    <Unplug className="w-3.5 h-3.5 mr-1.5" />
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full h-10 font-semibold bg-[#1877F2] hover:bg-[#1664d6] text-white"
                  onClick={() => connect("facebook")}
                  disabled={loading}
                >
                  Connect Facebook
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>

          {/* ── Instagram Card ── */}
          <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden flex flex-col">
            {/* Card header */}
            <div className="px-5 py-4 border-b border-slate-100/80 bg-gradient-to-r from-[#E4405F]/5 via-purple-50/5 to-transparent#E4405F]/10500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F58529] via-[#E4405F] to-[#833AB4] flex items-center justify-center shadow-sm">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Instagram
                    </h2>
                    <p className="text-xs text-gray-400">
                      Publish to Professional accounts
                    </p>
                  </div>
                </div>
                {hasInstagram && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50/30 border border-emerald-200/50 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" />
                    Connected
                  </span>
                )}
              </div>
            </div>

            {/* Card body */}
            <div className="flex-1 p-5">
              {hasInstagram ? (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                  {igPages.map((page) => (
                    <div
                      key={`ig-${page.instagram_business_account_id}`}
                      className="rounded-xl border border-slate-200/50 bg-slate-50/40 p-4 transition-all hover:border-[#E4405F]/30"
                    >
                      <div className="flex items-center gap-3">
                        {page.instagram_profile_picture_url ? (
                          <img
                            src={page.instagram_profile_picture_url}
                            alt={page.instagram_username || "Instagram"}
                            className="w-12 h-12 rounded-xl border-2 border-white shadow-sm object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F58529] via-[#E4405F] to-[#833AB4] flex items-center justify-center flex-shrink-0">
                            <Instagram className="w-6 h-6 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900">
                            {page.instagram_username
                              ? `@${page.instagram_username}`
                              : page.instagram_name || "Instagram Profile"}
                          </p>
                          <p className="text-xs text-gray-400">
                            via {page.name}
                          </p>
                        </div>
                        {connection?.default_instagram_account_id === page.instagram_business_account_id ? (
                          <span className="rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-pink-700">
                            Default
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px]"
                            onClick={() =>
                              updateDefaults({
                                defaultInstagramAccountId: page.instagram_business_account_id,
                              })
                            }
                            disabled={savingDefaults !== null}
                          >
                            {savingDefaults === "instagram" ? "Saving..." : "Set default"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Instagram className="w-7 h-7 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-400 mb-1">
                    Not connected
                  </p>
                  <p className="text-xs text-gray-500 max-w-[220px]">
                    Link your Instagram Business or Creator account via Meta
                  </p>
                </div>
              )}
            </div>

            {/* Card footer */}
            <div className="px-5 py-4 border-t border-slate-100/80 bg-slate-50/5/30">
              {hasInstagram ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-xs text-red-600 hover:text-red-700 hover:bg-red-50/20 border-red-200/50"
                  onClick={disconnect}
                  disabled={disconnecting || loading}
                >
                  <Unplug className="w-3.5 h-3.5 mr-1.5" />
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              ) : (
                <Button
                  className="w-full h-10 font-semibold bg-gradient-to-r from-[#F58529] via-[#E4405F] to-[#833AB4] hover:opacity-90 text-white"
                  onClick={() => connect("instagram")}
                  disabled={loading}
                >
                  Connect Instagram
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── How it works ─── */}
      {!loading && !hasConnection && (
        <div className="rounded-2xl border border-slate-200/60 bg-slate-50 p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">
            How it works
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                step: "1",
                title: "Connect Account",
                desc: "Authorize via Meta to link your Facebook Pages and Instagram accounts",
                gradient: "from-[#1877F2] to-blue-600",
              },
              {
                step: "2",
                title: "Create Content",
                desc: "Use Pro Studio to generate AI-powered posts and branded images",
                gradient: "from-purple-500 to-pink-500",
              },
              {
                step: "3",
                title: "Auto-Publish",
                desc: "Publish directly to Facebook and Instagram from the Preview & Publish step",
                gradient: "from-emerald-500 to-cyan-500",
              },
            ].map(({ step, title, desc, gradient }) => (
              <div
                key={step}
                className="flex gap-3 rounded-xl bg-white/50 border border-slate-200/50 p-4"
              >
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}
                >
                  {step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Error ─── */}
      {error && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/20 px-5 py-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
