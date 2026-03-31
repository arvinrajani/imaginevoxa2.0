import { NextResponse } from "next/server";

export const maxDuration = 60;
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * DEBUG ENDPOINT - Only for development
 * Returns diagnostic info about LinkedIn connection and posting setup
 */
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get LinkedIn connection
    const { data: connection, error: connError } = await supabase
      .from("linkedin_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connError) {
      return NextResponse.json({ error: "Failed to fetch connection", details: connError }, { status: 500 });
    }

    if (!connection) {
      return NextResponse.json({
        status: "no_connection",
        message: "No LinkedIn connection found",
      });
    }

    // Check token expiration
    const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null;
    const now = new Date();
    const isExpired = expiresAt && expiresAt <= now;

    // Get latest post
    const { data: latestPost } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      status: "ok",
      user_id: user.id,
      connection: {
        has_access_token: !!connection.access_token,
        member_urn: connection.member_urn,
        expires_at: connection.expires_at,
        token_expired: isExpired,
        orgs: connection.orgs,
      },
      latest_post: latestPost ? {
        id: latestPost.id,
        status: latestPost.status,
        target_urn: latestPost.target_urn,
        error_message: latestPost.error_message,
      } : null,
      diagnostics: {
        member_urn_valid: connection.member_urn?.startsWith("urn:li:person:") || connection.member_urn?.startsWith("urn:li:organization:"),
        has_organizations: Array.isArray(connection.orgs) && connection.orgs.length > 0,
        can_post: !!connection.access_token && !isExpired,
      },
    });
  } catch (error) {
    console.error("Debug endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}