import { NextResponse } from "next/server";

export const maxDuration = 60;
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const inputSchema = z.object({
  postId: z.string().uuid(),
  brandId: z.string().uuid(),
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
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

    const { data: asset, error: assetError } = await supabase
      .from("image_assets")
      .insert({
        brand_id: input.brandId,
        created_by: user.id,
        asset_type: "base",
        source: "upload",
        file_url: input.url,
        width: input.width ?? null,
        height: input.height ?? null,
        metadata: { source: "manual_url" },
      })
      .select("*")
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Failed to register base image" }, { status: 500 });
    }

    await supabase
      .from("posts")
      .update({
        base_image_asset_id: asset.id,
        image_url: input.url,
      })
      .eq("id", input.postId);

    return NextResponse.json({ asset_id: asset.id, file_url: input.url });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
