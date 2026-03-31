import { NextResponse } from "next/server";
import { fetchWithTimeout } from '@/lib/fetch-timeout';

export const maxDuration = 60;
import { createServerSupabase } from "@/lib/supabase/server";

type LinkedInUserInfoResponse = {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pickDisplayName(profile: LinkedInUserInfoResponse): string | null {
  const direct = asTrimmedString(profile.name);
  if (direct) return direct;
  const given = asTrimmedString(profile.given_name);
  const family = asTrimmedString(profile.family_name);
  const composed = [given, family].filter(Boolean).join(" ").trim();
  return composed || null;
}

async function fetchLinkedInUserInfo(accessToken: string): Promise<{
  name: string | null;
  email: string | null;
  picture_url: string | null;
  vanity_name: string | null;
  member_urn: string | null;
  source: "live";
} | null> {
  try {
    const response = await fetchWithTimeout("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as LinkedInUserInfoResponse;
    const name = pickDisplayName(data);
    const email = asTrimmedString(data.email);
    const pictureUrl = asTrimmedString(data.picture);
    const vanityName = asTrimmedString(data.preferred_username);
    const sub = asTrimmedString(data.sub);
    const memberUrn = sub ? `urn:li:person:${sub}` : null;

    if (!name && !email && !pictureUrl && !memberUrn && !vanityName) {
      return null;
    }

    return {
      name,
      email,
      picture_url: pictureUrl,
      vanity_name: vanityName,
      member_urn: memberUrn,
      source: "live",
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: connectionRows, error } = await supabase
      .from("linkedin_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    const connection = connectionRows?.[0] ?? null;

    if (error) {
      console.error("LinkedIn connection query error:", error);
      return NextResponse.json(
        { error: "Failed to load LinkedIn connection." },
        { status: 500 }
      );
    }

    if (!connection) {
      return NextResponse.json(null);
    }

    const connectionRecord = connection as Record<string, unknown>;
    const accessToken =
      asTrimmedString(connectionRecord.access_token) ||
      asTrimmedString(connectionRecord.org_access_token) ||
      "";

    const liveProfile =
      accessToken.length > 0 ? await fetchLinkedInUserInfo(accessToken) : null;

    const fallbackMemberUrn =
      asTrimmedString(connectionRecord.member_urn) ||
      asTrimmedString(connectionRecord.linkedin_member_urn);

    const connectedProfile = liveProfile || {
      name:
        asTrimmedString(connectionRecord.linkedin_name) ||
        asTrimmedString(connectionRecord.profile_name) ||
        null,
      email:
        asTrimmedString(connectionRecord.linkedin_email) ||
        asTrimmedString(connectionRecord.profile_email) ||
        null,
      picture_url:
        asTrimmedString(connectionRecord.profile_picture_url) ||
        asTrimmedString(connectionRecord.linkedin_avatar_url) ||
        null,
      vanity_name:
        asTrimmedString(connectionRecord.profile_vanity_name) ||
        asTrimmedString(connectionRecord.linkedin_vanity_name) ||
        null,
      member_urn: fallbackMemberUrn,
      source: "fallback" as const,
    };

    const orgConnected = Boolean(
      (connection as { org_access_token?: string | null }).org_access_token
    );

    return NextResponse.json({
      ...connection,
      org_connected: orgConnected,
      connected_profile: connectedProfile,
    });
  } catch (error) {
    console.error("LinkedIn connection endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}