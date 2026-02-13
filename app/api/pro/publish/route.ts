import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  postId: z.string().uuid(),
  publishToLinkedIn: z.boolean().optional(),
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 3) {
  let attempt = 0;
  let lastResponse: Response | null = null;
  while (attempt < retries) {
    const response = await fetch(url, init);
    lastResponse = response;
    if (response.ok) return response;
    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt === retries - 1) break;
    const backoffMs = 500 * Math.pow(2, attempt);
    await sleep(backoffMs);
    attempt += 1;
  }
  if (!lastResponse) throw new Error("Publish request failed before receiving response.");
  return lastResponse;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", input.postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const { data: checks } = await supabase
      .from("compliance_checks")
      .select("*")
      .eq("post_id", post.id);

    if (!checks || checks.length === 0) {
      return NextResponse.json({ error: "Run compliance checks before publishing." }, { status: 400 });
    }

    const hasFail = checks.some((check) => check.status === "fail");
    if (hasFail) {
      return NextResponse.json({ error: "Compliance checks failed. Resolve before publishing." }, { status: 400 });
    }

    await supabase.from("post_approvals").insert({
      post_id: post.id,
      status: "approved",
      reviewer_id: user.id,
      notes: "Manual approval from Pro Studio.",
    });

    await supabase
      .from("posts")
      .update({
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        status: input.publishToLinkedIn ? "approved" : "approved",
      })
      .eq("id", post.id);

    await supabase.from("audit_logs").insert({
      brand_id: post.brand_id,
      actor_id: user.id,
      action: "post_approved",
      entity_type: "post",
      entity_id: post.id,
      metadata: { publish_to_linkedin: input.publishToLinkedIn ?? false },
    });

    if (input.publishToLinkedIn) {
      const publishUrl = new URL("/api/approve", request.url);
      const publishResponse = await fetchWithRetry(publishUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, autoPost: true }),
      }, 3);

      if (!publishResponse.ok) {
        const errorText = await publishResponse.text();
        return NextResponse.json({ error: `LinkedIn publish failed: ${errorText}` }, { status: 502 });
      }

      const payload = await publishResponse.json();
      return NextResponse.json({ status: "published", result: payload });
    }

    return NextResponse.json({ status: "approved" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
