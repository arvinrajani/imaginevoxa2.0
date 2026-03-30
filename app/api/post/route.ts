import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PostRequest = {
  postId: string;
  targetType: "person" | "org";
  targetUrn?: string;
};

type Org = {
  urn?: string;
  id?: string;
  name?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as PostRequest;
  if (!body.postId) {
    return NextResponse.json({ error: "Missing post id." }, { status: 400 });
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("*")
    .eq("id", body.postId)
    .eq("user_id", user.id)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (!["draft", "approved"].includes(post.status)) {
    return NextResponse.json(
      { error: "Post is not ready to publish." },
      { status: 400 }
    );
  }

  // --- Image post credit check (30 per billing period) ---
  const IMAGE_POST_LIMIT = 30;
  if (post.image_url) {
    const admin = createAdminClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: imagePostCount } = await admin
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfMonth)
      .not("image_url", "is", null)
      .in("status", ["approved", "posted", "scheduled"]);

    if ((imagePostCount ?? 0) >= IMAGE_POST_LIMIT) {
      return NextResponse.json(
        {
          error: "Image post credits exhausted. You have used all 30 image post credits for this billing period. Please upgrade your plan or wait for credits to renew.",
          code: "IMAGE_CREDITS_EXHAUSTED",
        },
        { status: 403 }
      );
    }
  }

  const { data: connectionRows, error: connectionError } = await supabase
    .from("linkedin_connections")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  const connection = connectionRows?.[0] ?? null;

  if (connectionError || !connection) {
    return NextResponse.json({ error: "LinkedIn not connected." }, { status: 400 });
  }

  if (body.targetType !== "person" && body.targetType !== "org") {
    return NextResponse.json({ error: "Invalid target type." }, { status: 400 });
  }

  const personalToken =
    typeof connection.access_token === "string" ? connection.access_token : "";
  const orgToken =
    typeof connection.org_access_token === "string" ? connection.org_access_token : "";
  const accessToken =
    body.targetType === "org" ? (orgToken || personalToken) : personalToken;

  if (!accessToken) {
    return NextResponse.json({ error: "LinkedIn token missing. Please reconnect." }, { status: 400 });
  }

  const tokenExpiryRaw =
    body.targetType === "org"
      ? (connection.org_expires_at || connection.expires_at)
      : connection.expires_at;

  if (tokenExpiryRaw) {
    const expiresAt = new Date(tokenExpiryRaw);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "LinkedIn token expired. Please reconnect." }, { status: 400 });
    }
  }

  if (body.targetType === "org") {
    const orgUrns = Array.isArray(connection.orgs)
      ? (connection.orgs as Org[])
          .map((org) => {
            if (typeof org?.urn === "string" && org.urn.trim()) return org.urn.trim();
            if (typeof org?.id === "string" && org.id.trim()) return `urn:li:organization:${org.id.trim()}`;
            return "";
          })
          .filter(Boolean)
      : [];

    if (!body.targetUrn || !orgUrns.includes(body.targetUrn)) {
      return NextResponse.json(
        { error: "Organization not authorized." },
        { status: 403 }
      );
    }
  }

  const memberUrn =
    typeof connection.member_urn === "string" && connection.member_urn.trim()
      ? connection.member_urn.trim()
      : typeof connection.linkedin_member_urn === "string" && connection.linkedin_member_urn.trim()
      ? connection.linkedin_member_urn.trim()
      : "";

  const authorUrn = body.targetType === "org" ? body.targetUrn : memberUrn;
  if (!authorUrn) {
    return NextResponse.json({ error: "Missing target URN." }, { status: 400 });
  }

  const text = post.post_content;

  const linkedInResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text,
          },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  if (!linkedInResponse.ok) {
    const message = await linkedInResponse.text();
    await supabase
      .from("posts")
      .update({ status: "failed", error_message: message })
      .eq("id", post.id);
    return NextResponse.json(
      { error: message || "LinkedIn post failed." },
      { status: 502 }
    );
  }

  const linkedInPayload = (await linkedInResponse.json()) as { id?: string };

  const { data: updated, error: updateError } = await supabase
    .from("posts")
    .update({
      status: "posted",
      posted_at: new Date().toISOString(),
      linkedin_post_urn: linkedInPayload.id ?? null,
      target_type: body.targetType,
      target_urn: body.targetUrn ?? null,
      error_message: null,
    })
    .eq("id", post.id)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Failed to update post." }, { status: 500 });
  }

  return NextResponse.json(updated);
  } catch (error) {
    console.error("Post endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
