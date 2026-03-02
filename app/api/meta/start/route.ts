import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import crypto from "crypto";

const SCOPE_ALIASES: Record<string, string> = {
  instagram_business_basic: "instagram_basic",
  instagram_business_content_publish: "instagram_content_publish",
  instagram_content_publishing: "instagram_content_publish",
  instagram_business_content_publishing: "instagram_content_publish",
};

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { searchParams } = new URL(request.url);
    const intent = searchParams.get("intent") || "facebook";

    const appId = process.env.META_APP_ID?.trim();
    const baseUrl = process.env.APP_BASE_URL?.trim() || new URL(request.url).origin;
    const redirectUri =
      process.env.META_REDIRECT_URI?.trim() || `${baseUrl}/api/meta/callback`;
    const rawScopes =
      process.env.META_SCOPES?.trim() ||
      "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management";
    const scopes = Array.from(
      new Set(
        rawScopes
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean)
          .map((scope) => SCOPE_ALIASES[scope] || scope)
      )
    ).join(",");

    if (!appId || !redirectUri) {
      return NextResponse.redirect(
        new URL("/app/meta?error=Meta+OAuth+not+configured", request.url)
      );
    }

    const state = crypto.randomUUID();
    const cookieStore = await cookies();
    const isProd = process.env.NODE_ENV === "production";

    cookieStore.delete("meta_oauth_state");
    cookieStore.delete("meta_oauth_user");
    cookieStore.delete("meta_oauth_redirect");

    cookieStore.set("meta_oauth_state", state, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      secure: isProd,
      sameSite: "lax",
    });
    cookieStore.set("meta_oauth_user", user.id, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      secure: isProd,
      sameSite: "lax",
    });
    cookieStore.set("meta_oauth_redirect", redirectUri, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      secure: isProd,
      sameSite: "lax",
    });
    cookieStore.set("meta_oauth_intent", intent, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      secure: isProd,
      sameSite: "lax",
    });

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: scopes,
      response_type: "code",
      auth_type: "rerequest",
      display: "popup",
    });

    return NextResponse.redirect(
      `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`
    );
  } catch (error) {
    console.error("Meta start endpoint error:", error);
    return NextResponse.redirect(
      new URL("/app/meta?error=Meta+connection+failed", request.url)
    );
  }
}
