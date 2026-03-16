import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ScheduleRequest = {
  postId: string;
  scheduledFor: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ScheduleRequest;
    if (!body.postId || !body.scheduledFor) {
      return NextResponse.json({ error: "Missing scheduling details." }, { status: 400 });
    }

    const scheduledDate = new Date(body.scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid schedule date." }, { status: 400 });
    }

    if (scheduledDate <= new Date()) {
      return NextResponse.json({ error: "Schedule time must be in the future." }, { status: 400 });
    }

    const scheduledIso = scheduledDate.toISOString();
    const { data: updated, error } = await supabase
      .from("posts")
      .update({
        status: "scheduled",
        scheduled_for: scheduledIso,
        error_message: null,
      })
      .eq("id", body.postId)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: "Failed to schedule." }, { status: 500 });
    }

    // Best-effort queue registration for reliable retries in cron.
    // Scheduling itself should still succeed even if queue table or service role is not configured.
    const queue = {
      enabled: false,
      enqueued: false,
      warning: null as string | null,
    };

    try {
      const admin = createAdminClient();
      queue.enabled = true;

      const { data: connection } = await admin
        .from("linkedin_connections")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!connection?.id) {
        queue.warning = "LinkedIn connection not found. Post is scheduled but not queued yet.";
      } else {
        const idempotencyKey = `schedule:${updated.id}:${scheduledIso}`;
        const { error: queueError } = await admin
          .from("publish_queue")
          .upsert(
            {
              post_id: updated.id,
              user_id: user.id,
              linkedin_connection_id: connection.id,
              status: "pending",
              priority: 0,
              scheduled_for: scheduledIso,
              attempts: 0,
              max_attempts: 3,
              next_retry_at: null,
              last_error: null,
              idempotency_key: idempotencyKey,
            },
            { onConflict: "idempotency_key" }
          );

        if (queueError) {
          queue.warning = "Scheduled, but queue registration failed. Cron fallback will still pick this post.";
        } else {
          queue.enqueued = true;
        }
      }
    } catch {
      queue.warning = "Scheduled, but queueing is unavailable in this environment.";
    }

    return NextResponse.json({ ...updated, queue });
  } catch (error) {
    console.error("Schedule endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
