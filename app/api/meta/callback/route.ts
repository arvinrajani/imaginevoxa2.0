import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildMetaSetupRedirect,
  resolveMetaOAuthConfig,
} from "@/lib/social/meta-oauth-config";

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type MetaPageResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    access_token?: string;
    category?: string;
    picture?: {
      data?: {
        url?: string;
      };
    };
    instagram_business_account?: {
      id?: string;
      name?: string;
      username?: string;
      profile_picture_url?: string;
    };
  }>;
  paging?: {
    cursors?: {
      before: string;
      after: string;
    };
    next?: string;
    previous?: string;
  };
};

const OAUTH_COOKIE_NAMES = [
  "meta_oauth_state",
  "meta_oauth_user",
  "meta_oauth_redirect",
  "meta_oauth_intent",
] as const;

function encodeError(message: string) {
  return encodeURIComponent(message.slice(0, 280));
}

function parseScopes(value: string | null | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean)
    )
  );
}

async function fetchMetaJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: "GET" });
  const text = await response.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  const maybeError = (json as { error?: { message?: string } }).error;
  if (!response.ok || maybeError) {
    const message = maybeError?.message || `Meta Graph API request failed (${response.status})`;
    throw new Error(message);
  }

  return json as T;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cookieStore = await cookies();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const grantedScopesParam = searchParams.get("granted_scopes");

  const clearOauthCookies = () => {
    for (const name of OAUTH_COOKIE_NAMES) {
      cookieStore.delete(name);
    }
  };

  if (error) {
    clearOauthCookies();
    const extra = errorDescription ? `&error_description=${encodeError(errorDescription)}` : "";
    return NextResponse.redirect(
      new URL(`/app/meta?error=${encodeError(error)}${extra}`, request.url)
    );
  }

  if (!code || !state) {
    clearOauthCookies();
    return NextResponse.redirect(
      new URL("/app/meta?error=Missing+Meta+OAuth+code", request.url)
    );
  }

  const storedState = cookieStore.get("meta_oauth_state")?.value;
  const storedUserId = cookieStore.get("meta_oauth_user")?.value;
  const storedRedirect = cookieStore.get("meta_oauth_redirect")?.value;
  const storedIntent = cookieStore.get("meta_oauth_intent")?.value || "facebook";

  if (!storedState || storedState !== state) {
    clearOauthCookies();
    return NextResponse.redirect(
      new URL("/app/meta?error=Invalid+Meta+OAuth+state", request.url)
    );
  }

  const config = resolveMetaOAuthConfig(request, storedRedirect);

  if (!config.appId || !config.appSecret) {
    clearOauthCookies();
    return NextResponse.redirect(
      buildMetaSetupRedirect(request, {
        missing: config.callbackMissing,
        redirectUri: config.redirectUri,
      })
    );
  }

  const requestedScopes = parseScopes(
    config.scopes
  );
  const grantedScopes = parseScopes(grantedScopesParam);
  const scopes = grantedScopes.length > 0 ? grantedScopes : requestedScopes;

  try {
    const shortTokenUrl = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
    shortTokenUrl.searchParams.set("client_id", config.appId);
    shortTokenUrl.searchParams.set("client_secret", config.appSecret);
    shortTokenUrl.searchParams.set("redirect_uri", config.redirectUri);
    shortTokenUrl.searchParams.set("code", code);

    const shortToken = await fetchMetaJson<MetaTokenResponse>(shortTokenUrl.toString());

    let userAccessToken = shortToken.access_token;
    let expiresIn = shortToken.expires_in || null;

    try {
      const longTokenUrl = new URL("https://graph.facebook.com/v22.0/oauth/access_token");
      longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
      longTokenUrl.searchParams.set("client_id", config.appId);
      longTokenUrl.searchParams.set("client_secret", config.appSecret);
      longTokenUrl.searchParams.set("fb_exchange_token", shortToken.access_token);
      const longToken = await fetchMetaJson<MetaTokenResponse>(longTokenUrl.toString());
      if (longToken.access_token) {
        userAccessToken = longToken.access_token;
        expiresIn = longToken.expires_in || expiresIn;
      }
    } catch {
      // Continue with short-lived token if exchange fails.
    }

    const getAllFacebookPages = async (accessToken: string) => {
      let allPages: NonNullable<NonNullable<MetaPageResponse["data"]>[0]>[] = [];
      let url: string | null =
        "https://graph.facebook.com/v22.0/me/accounts" +
        "?fields=id,name,category,picture{url},access_token,instagram_business_account{id,name,username,profile_picture_url}" +
        `&limit=100&access_token=${accessToken}`;

      while (url) {
        const responseData: MetaPageResponse = await fetchMetaJson<MetaPageResponse>(url);
        if (responseData.data) {
          allPages = [...allPages, ...responseData.data];
        }
        url = responseData.paging?.next ?? null;
      }
      return allPages;
    };

    const fetchedPages = await getAllFacebookPages(userAccessToken);

    const pages = fetchedPages
      .map((row) => {
        const id = row.id?.trim();
        const name = row.name?.trim();
        const pageAccessToken = row.access_token?.trim();
        if (!id || !name || !pageAccessToken) return null;
        return {
          id,
          name,
          category: row.category?.trim() || "Local Business",
          access_token: pageAccessToken,
          picture_url: row.picture?.data?.url?.trim() || null,
          instagram_business_account_id: row.instagram_business_account?.id?.trim() || null,
          instagram_name: row.instagram_business_account?.name?.trim() || null,
          instagram_username: row.instagram_business_account?.username?.trim() || null,
          instagram_profile_picture_url: row.instagram_business_account?.profile_picture_url || null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const defaultFacebookPageId = pages[0]?.id || null;
    const defaultInstagramAccountId =
      pages.find((page) => page.instagram_business_account_id)?.instagram_business_account_id || null;

    if (storedIntent === "instagram" && !defaultInstagramAccountId) {
      clearOauthCookies();
      return NextResponse.redirect(
        new URL("/app/meta?error=no_instagram_linked", request.url)
      );
    }

    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const sessionSupabase = await createServerSupabase();
    const {
      data: { user },
    } = await sessionSupabase.auth.getUser();

    if (user?.id && storedUserId && user.id !== storedUserId) {
      clearOauthCookies();
      return NextResponse.redirect(
        new URL("/app/meta?error=Meta+connect+account+mismatch", request.url)
      );
    }

    const userId = user?.id || storedUserId || null;

    if (!userId) {
      clearOauthCookies();
      return NextResponse.redirect(
        new URL("/app/meta?error=Missing+user+session+for+Meta+connect", request.url)
      );
    }

    const db = user ? sessionSupabase : createAdminClient();

    const { error: upsertError } = await db.from("meta_connections").upsert(
      {
        user_id: userId,
        access_token: userAccessToken,
        token_expires_at: expiresAt,
        scopes,
        pages,
        default_facebook_page_id: defaultFacebookPageId,
        default_instagram_account_id: defaultInstagramAccountId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      clearOauthCookies();
      return NextResponse.redirect(
        new URL(
          `/app/meta?error=Meta+save+failed&error_description=${encodeError(upsertError.message)}`,
          request.url
        )
      );
    }

    clearOauthCookies();

    return NextResponse.redirect(
      new URL("/app/meta?status=connected", request.url)
    );
  } catch (callbackError) {
    clearOauthCookies();
    const message =
      callbackError instanceof Error ? callbackError.message : "Meta OAuth callback failed";
    return NextResponse.redirect(
      new URL(`/app/meta?error=Meta+OAuth+failed&error_description=${encodeError(message)}`, request.url)
    );
  }
}
