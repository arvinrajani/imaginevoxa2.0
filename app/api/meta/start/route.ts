import { NextResponse } from "next/server";

export const maxDuration = 60;
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  buildMetaSetupRedirect,
  resolveMetaOAuthConfig,
} from "@/lib/social/meta-oauth-config";
import crypto from "crypto";

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
    const config = resolveMetaOAuthConfig(request);

    if (!config.appId) {
      return NextResponse.redirect(
        buildMetaSetupRedirect(request, {
          missing: config.startMissing,
          redirectUri: config.redirectUri,
        })
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
    cookieStore.set("meta_oauth_redirect", config.redirectUri, {
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
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      state,
      scope: config.scopes,
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