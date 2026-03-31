import { NextResponse } from "next/server";
import { fetchWithTimeout } from '@/lib/fetch-timeout';

export const maxDuration = 120;

import { createAdminClient } from "@/lib/supabase/admin";

type JobResult = {
  source: "queue" | "legacy";
  post_id: string;
  status: "posted" | "failed" | "skipped" | "retried";
  attempts?: number;
  next_retry_at?: string | null;
  message?: string;
};

const MAX_BATCH = 10;

export const dynamic = "force-dynamic";

function computeNextRetry(attempt: number) {
  const baseMs = 5 * 60 * 1000; // 5 minutes
  const maxMs = 2 * 60 * 60 * 1000; // 2 hours
  const delayMs = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  return new Date(Date.now() + delayMs).toISOString();
}

async function publishViaApprove(baseUrl: string, secret: string, postId: string) {
  const publishResponse = await fetchWithTimeout(`${baseUrl}/api/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": secret,
    },
    body: JSON.stringify({ postId, autoPost: true }),
  });

  const payload = await publishResponse.json().catch(() => null);

  if (
    publishResponse.ok &&
    payload &&
    typeof payload === "object" &&
    (payload as { status?: string }).status === "posted"
  ) {
    return { ok: true as const, message: null };
  }

  return {
    ok: false as const,
    message:
      (
        (payload &&
          typeof payload === "object" &&
          (((payload as { message?: string }).message || (payload as { error?: string }).error) ?? null)) ||
        "Publish failed."
      ).slice(0, 1000),
  };
}

async function processQueue(admin: ReturnType<typeof createAdminClient>, nowIso: string, baseUrl: string, secret: string) {
  const { data: queuedJobs, error: queueError } = await admin
    .from("publish_queue")
    .select("id, post_id, status, attempts, max_attempts, scheduled_for, next_retry_at")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH * 2);

  if (queueError) {
    return {
      ok: false as const,
      reason: queueError.message || "Queue table unavailable",
      results: [] as JobResult[],
    };
  }

  const readyJobs = (queuedJobs || [])
    .filter((job) => !job.next_retry_at || new Date(job.next_retry_at).toISOString() <= nowIso)
    .slice(0, MAX_BATCH);

  const results: JobResult[] = [];

  for (const job of readyJobs) {
    const { data: lockedJob } = await admin
      .from("publish_queue")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!lockedJob) {
      results.push({
        source: "queue",
        post_id: job.post_id,
        status: "skipped",
        message: "Already processing elsewhere.",
      });
      continue;
    }

    const { data: post } = await admin
      .from("posts")
      .select("id, status")
      .eq("id", job.post_id)
      .maybeSingle();

    if (!post) {
      await admin
        .from("publish_queue")
        .update({
          status: "failed",
          last_error: "Post not found.",
          completed_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq("id", job.id);

      results.push({
        source: "queue",
        post_id: job.post_id,
        status: "failed",
        attempts: (job.attempts || 0) + 1,
        message: "Post not found.",
      });
      continue;
    }

    const { data: checks } = await admin
      .from("compliance_checks")
      .select("status")
      .eq("post_id", job.post_id);

    if (!checks || checks.length === 0) {
      await admin
        .from("posts")
        .update({ status: "failed", error_message: "Scheduled post missing compliance checks." })
        .eq("id", job.post_id);

      await admin
        .from("publish_queue")
        .update({
          status: "failed",
          attempts: (job.attempts || 0) + 1,
          last_error: "Missing compliance checks.",
          completed_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq("id", job.id);

      results.push({
        source: "queue",
        post_id: job.post_id,
        status: "failed",
        attempts: (job.attempts || 0) + 1,
        message: "Missing compliance checks.",
      });
      continue;
    }

    if (checks.some((check) => check.status === "fail")) {
      await admin
        .from("posts")
        .update({ status: "failed", error_message: "Scheduled post failed compliance checks." })
        .eq("id", job.post_id);

      await admin
        .from("publish_queue")
        .update({
          status: "failed",
          attempts: (job.attempts || 0) + 1,
          last_error: "Compliance failed.",
          completed_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq("id", job.id);

      results.push({
        source: "queue",
        post_id: job.post_id,
        status: "failed",
        attempts: (job.attempts || 0) + 1,
        message: "Compliance failed.",
      });
      continue;
    }

    await admin
      .from("posts")
      .update({ status: "publishing" })
      .eq("id", job.post_id)
      .neq("status", "posted");

    const publish = await publishViaApprove(baseUrl, secret, job.post_id);
    if (publish.ok) {
      await admin
        .from("publish_queue")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          last_error: null,
          next_retry_at: null,
        })
        .eq("id", job.id);

      results.push({
        source: "queue",
        post_id: job.post_id,
        status: "posted",
      });
      continue;
    }

    const attempts = (job.attempts || 0) + 1;
    const maxAttempts = Math.max(1, job.max_attempts || 3);

    if (attempts >= maxAttempts) {
      await admin
        .from("posts")
        .update({ status: "failed", error_message: publish.message || "Publish failed." })
        .eq("id", job.post_id);

      await admin
        .from("publish_queue")
        .update({
          status: "failed",
          attempts,
          last_error: publish.message,
          completed_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq("id", job.id);

      results.push({
        source: "queue",
        post_id: job.post_id,
        status: "failed",
        attempts,
        message: publish.message || "Publish failed after max retries.",
      });
      continue;
    }

    const nextRetryAt = computeNextRetry(attempts);
    await admin
      .from("posts")
      .update({
        status: "scheduled",
        error_message: `Retry ${attempts}/${maxAttempts}: ${publish.message || "Publish failed."}`,
      })
      .eq("id", job.post_id);

    await admin
      .from("publish_queue")
      .update({
        status: "pending",
        attempts,
        last_error: publish.message,
        next_retry_at: nextRetryAt,
      })
      .eq("id", job.id);

    results.push({
      source: "queue",
      post_id: job.post_id,
      status: "retried",
      attempts,
      next_retry_at: nextRetryAt,
      message: publish.message || "Retry scheduled.",
    });
  }

  return {
    ok: true as const,
    reason: null,
    results,
  };
}

async function processLegacy(admin: ReturnType<typeof createAdminClient>, nowIso: string, baseUrl: string, secret: string) {
  const { data: posts, error } = await admin
    .from("posts")
    .select("*")
    .eq("status", "scheduled")
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    throw new Error(error.message);
  }

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
        source: "legacy",
        post_id: post.id,
        status: "failed",
        message: "Missing compliance checks.",
      });
      continue;
    }

    if (checks.some((check) => check.status === "fail")) {
      await admin
        .from("posts")
        .update({
          status: "failed",
          error_message: "Scheduled post failed compliance checks.",
        })
        .eq("id", post.id);

      results.push({
        source: "legacy",
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
      .maybeSingle();

    if (!locked) {
      results.push({
        source: "legacy",
        post_id: post.id,
        status: "skipped",
        message: "Already processed.",
      });
      continue;
    }

    const publish = await publishViaApprove(baseUrl, secret, post.id);
    if (!publish.ok) {
      await admin
        .from("posts")
        .update({ status: "failed", error_message: publish.message || "Publish failed." })
        .eq("id", post.id);

      results.push({
        source: "legacy",
        post_id: post.id,
        status: "failed",
        message: publish.message || "Publish failed.",
      });
      continue;
    }

    results.push({
      source: "legacy",
      post_id: post.id,
      status: "posted",
    });
  }

  return results;
}

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    const header = request.headers.get("x-cron-secret")?.trim();

    if (!secret || !header || secret.length !== header.length ||
        !require('crypto').timingSafeEqual(Buffer.from(header), Buffer.from(secret))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const baseUrl = process.env.APP_BASE_URL?.trim() || new URL(request.url).origin;

    const queueRun = await processQueue(admin, nowIso, baseUrl, secret);
    if (queueRun.ok) {
      return NextResponse.json({
        mode: "queue",
        processed: queueRun.results.length,
        results: queueRun.results,
      });
    }

    const legacyResults = await processLegacy(admin, nowIso, baseUrl, secret);
    return NextResponse.json({
      mode: "legacy-fallback",
      reason: queueRun.reason,
      processed: legacyResults.length,
      results: legacyResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
