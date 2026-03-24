import {
  resolveOAuthBaseUrl,
  resolveOAuthRedirectUri,
} from "@/lib/auth/oauth-origin";

const DEFAULT_META_SCOPES =
  "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management";

const SCOPE_ALIASES: Record<string, string> = {
  instagram_business_basic: "instagram_basic",
  instagram_business_content_publish: "instagram_content_publish",
  instagram_content_publishing: "instagram_content_publish",
  instagram_business_content_publishing: "instagram_content_publish",
};

export function resolveMetaOAuthConfig(
  request: Request,
  storedRedirect?: string | null
) {
  const appId =
    process.env.META_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() ||
    "";
  const appSecret = process.env.META_APP_SECRET?.trim() || "";
  const baseUrl = resolveOAuthBaseUrl(
    request,
    process.env.APP_BASE_URL?.trim()
  );
  const redirectUri = resolveOAuthRedirectUri(request, {
    storedRedirectUri: storedRedirect,
    configuredRedirectUri: process.env.META_REDIRECT_URI?.trim(),
    configuredBaseUrl: process.env.APP_BASE_URL?.trim(),
    fallbackPath: "",
  });
  const rawScopes = process.env.META_SCOPES?.trim() || DEFAULT_META_SCOPES;
  const scopes = Array.from(
    new Set(
      rawScopes
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean)
        .map((scope) => SCOPE_ALIASES[scope] || scope)
    )
  ).join(",");

  const startMissing: string[] = [];
  if (!appId) startMissing.push("META_APP_ID");

  const callbackMissing = [...startMissing];
  if (!appSecret) callbackMissing.push("META_APP_SECRET");

  return {
    appId: appId || null,
    appSecret: appSecret || null,
    baseUrl,
    redirectUri,
    scopes,
    startMissing,
    callbackMissing,
  };
}

export function buildMetaSetupRedirect(
  request: Request,
  options: {
    missing: string[];
    redirectUri: string;
  }
) {
  const url = new URL("/app/meta", request.url);
  url.searchParams.set("error", "meta_oauth_not_configured");
  if (options.missing.length > 0) {
    url.searchParams.set("missing", options.missing.join(","));
  }
  url.searchParams.set("callback_uri", options.redirectUri);
  return url;
}
