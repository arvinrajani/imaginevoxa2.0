import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  brandKitId: z.string().uuid(),
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

    const { data: kit, error } = await supabase
      .from("brand_kits")
      .update({
        is_locked: true,
        locked_by: user.id,
        locked_at: new Date().toISOString(),
      })
      .eq("id", input.brandKitId)
      .select("*")
      .single();

    if (error || !kit) {
      return NextResponse.json({ error: "Failed to lock brand kit" }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      brand_id: kit.brand_id,
      actor_id: user.id,
      action: "brand_kit_locked",
      entity_type: "brand_kit",
      entity_id: kit.id,
    });

    return NextResponse.json({ brand_kit: kit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
