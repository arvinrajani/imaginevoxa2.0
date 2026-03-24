import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveOAuthRedirectUri } from "@/lib/auth/oauth-origin";
import crypto from "crypto";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("target") === "organization" ? "organization" : "personal";

    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const clientId =
      target === "organization"
        ? process.env.LINKEDIN_ORG_CLIENT_ID
        : process.env.LINKEDIN_CLIENT_ID;
    const redirectUri =
      target === "organization"
        ? resolveOAuthRedirectUri(request, {
            configuredRedirectUri: process.env.LINKEDIN_ORG_REDIRECT_URI,
            configuredBaseUrl: process.env.APP_BASE_URL?.trim(),
            fallbackPath: "/api/linkedin/callback",
          })
        : resolveOAuthRedirectUri(request, {
            configuredRedirectUri: process.env.LINKEDIN_REDIRECT_URI,
            configuredBaseUrl: process.env.APP_BASE_URL?.trim(),
            fallbackPath: "/api/linkedin/callback",
          });
    const scopes =
      target === "organization"
        ? process.env.LINKEDIN_ORG_SCOPES ||
          "openid profile email w_member_social r_organization_social w_organization_social"
        : process.env.LINKEDIN_SCOPES ||
          "openid profile email w_member_social r_organization_social";

    if (!clientId) {
      const url = new URL("/app/linkedin", request.url);
      url.searchParams.set("error", "LinkedIn not configured");
      url.searchParams.set(
        "error_description",
        target === "organization"
          ? "Missing LINKEDIN_ORG_CLIENT_ID on this deployment."
          : "Missing LINKEDIN_CLIENT_ID on this deployment."
      );
      return NextResponse.redirect(url);
    }

    const state = crypto.randomUUID();
    const cookieStore = await cookies();
    const isProd = process.env.NODE_ENV === "production";
    cookieStore.delete("linkedin_oauth_state");
    cookieStore.delete("linkedin_oauth_target");
    cookieStore.delete("linkedin_oauth_user");
    cookieStore.delete("linkedin_oauth_redirect");
    cookieStore.set("linkedin_oauth_state", state, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      secure: isProd,
      sameSite: "lax",
    });
    cookieStore.set("linkedin_oauth_target", target, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      secure: isProd,
      sameSite: "lax",
    });
    cookieStore.set("linkedin_oauth_user", user.id, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      secure: isProd,
      sameSite: "lax",
    });
    cookieStore.set("linkedin_oauth_redirect", redirectUri, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      secure: isProd,
      sameSite: "lax",
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: scopes,
      prompt: "login",
    });

    return NextResponse.redirect(
      `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
    );
  } catch (error) {
    console.error("LinkedIn start endpoint error:", error);
    return NextResponse.redirect(new URL("/app/linkedin?error=internal_error", request.url));
  }
}
