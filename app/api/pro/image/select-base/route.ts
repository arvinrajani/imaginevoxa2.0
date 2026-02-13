import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  postId: z.string().uuid(),
  assetId: z.string().uuid(),
  fileUrl: z.string(),
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

    const { error } = await supabase
      .from("posts")
      .update({
        base_image_asset_id: input.assetId,
        image_url: input.fileUrl,
      })
      .eq("id", input.postId);

    if (error) {
      return NextResponse.json({ error: "Failed to update base image" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
