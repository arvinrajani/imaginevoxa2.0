import { NextResponse } from "next/server";

export const maxDuration = 60;
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  moodBoardId: z.string().uuid(),
});

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

    const { data: mood, error } = await supabase
      .from("mood_boards")
      .update({
        is_locked: true,
        locked_by: user.id,
        locked_at: new Date().toISOString(),
      })
      .eq("id", input.moodBoardId)
      .select("*")
      .single();

    if (error || !mood) {
      return NextResponse.json({ error: "Failed to lock mood board" }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      brand_id: mood.brand_id,
      actor_id: user.id,
      action: "mood_board_locked",
      entity_type: "mood_board",
      entity_id: mood.id,
    });

    return NextResponse.json({ mood_board: mood });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}