import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type JobResult = {
  post_id: string;
  status: "posted" | "failed" | "skipped";
  message?: string;
};

const MAX_BATCH = 10;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    const header = request.headers.get("x-cron-secret")?.trim();

    if (!secret || !header || header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: posts, error } = await admin
      .from("posts")
      .select("*")
      .eq("status", "scheduled")
      .not("scheduled_for", "is", null)
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(MAX_BATCH);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const baseUrl = process.env.APP_BASE_URL?.trim() || new URL(request.url).origin;
    const results: JobResult[] = [];

    for (const post of posts || []) {
      const { data: checks } = await admin
        .from("compliance_checks")
        .select("status")
        .eq("post_id", post.id);

      if (!checks || checks.length === 0) {
        await admin
          .from("posts")
          .update({
            status: "failed",
            error_message: "Scheduled post missing compliance checks.",
          })
          .eq("id", post.id);
        results.push({
          post_id: post.id,
          status: "failed",
          message: "Missing compliance checks.",
        });
        continue;
      }

      const hasFail = checks.some((check) => check.status === "fail");
      if (hasFail) {
        await admin
          .from("posts")
          .update({
            status: "failed",
            error_message: "Scheduled post failed compliance checks.",
          })
          .eq("id", post.id);
        results.push({
          post_id: post.id,
          status: "failed",
          message: "Compliance failed.",
        });
        continue;
      }

      const { data: locked } = await admin
        .from("posts")
        .update({ status: "publishing" })
        .eq("id", post.id)
        .eq("status", "scheduled")
        .select("id")
        .single();

      if (!locked) {
        results.push({ post_id: post.id, status: "skipped", message: "Already processed." });
        continue;
      }

      const publishResponse = await fetch(`${baseUrl}/api/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ postId: post.id, autoPost: true }),
      });

      if (!publishResponse.ok) {
        const errorText = await publishResponse.text();
        await admin
          .from("posts")
          .update({ status: "failed", error_message: errorText || "Publish failed." })
          .eq("id", post.id);
        results.push({ post_id: post.id, status: "failed", message: errorText });
        continue;
      }

      results.push({ post_id: post.id, status: "posted" });
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
