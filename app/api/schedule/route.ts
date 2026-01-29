import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

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

  const { data: updated, error } = await supabase
    .from("posts")
    .update({
      status: "scheduled",
      scheduled_for: new Date(body.scheduledFor).toISOString(),
    })
    .eq("id", body.postId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Failed to schedule." }, { status: 500 });
  }

  return NextResponse.json(updated);
  } catch (error) {
    console.error("Schedule endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
