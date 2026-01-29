import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type PostRequest = {
  postId: string;
  targetType: "person" | "org";
  targetUrn?: string;
};

type Org = {
  urn: string;
  // Add other properties if needed based on your schema
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

  const { data: connection, error: connectionError } = await supabase
    .from("linkedin_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connectionError || !connection?.access_token) {
    return NextResponse.json({ error: "LinkedIn not connected." }, { status: 400 });
  }

  if (body.targetType !== "person" && body.targetType !== "org") {
    return NextResponse.json({ error: "Invalid target type." }, { status: 400 });
  }

  if (body.targetType === "org") {
    const orgUrns = (connection.orgs ?? []).map((org: Org) => org.urn);
    if (!body.targetUrn || !orgUrns.includes(body.targetUrn)) {
      return NextResponse.json(
        { error: "Organization not authorized." },
        { status: 403 }
      );
    }
  }

  const authorUrn =
    body.targetType === "org" ? body.targetUrn : connection.member_urn;
  if (!authorUrn) {
    return NextResponse.json({ error: "Missing target URN." }, { status: 400 });
  }

  const text = post.post_content;

  const linkedInResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
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
