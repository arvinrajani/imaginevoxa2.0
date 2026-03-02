import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBlendedSvg, type BlendMode } from "@/lib/studio/blender";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  postId: z.string().uuid().optional(),
  baseImageUrl: z.string().url(),
  logoUrl: z.string().url(),
  blendMode: z
    .enum(["normal", "multiply", "screen", "overlay", "soft-light", "luminosity", "color-dodge"])
    .optional(),
  logoOpacity: z.number().min(0.1).max(1).optional(),
  logoPlacement: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"])
    .optional(),
  logoScale: z.number().min(0.2).max(3).optional(),
  logoPadding: z.number().min(0).max(80).optional(),
  canvasWidth: z.number().int().positive().optional(),
  canvasHeight: z.number().int().positive().optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
  overlayColor: z.string().optional(),
});

async function uploadSvg(options: { path: string; data: string }) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  if (!bucket) return null;

  const admin = createAdminClient();
  const upload = await admin.storage
    .from(bucket)
    .upload(options.path, Buffer.from(options.data), {
      contentType: "image/svg+xml",
      upsert: true,
    });

  if (upload.error) {
    throw new Error(`Storage upload failed: ${upload.error.message}`);
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(options.path);
  return data.publicUrl || null;
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

    const svg = buildBlendedSvg({
      baseImageUrl: input.baseImageUrl,
      canvasWidth: input.canvasWidth,
      canvasHeight: input.canvasHeight,
      overlayColor: input.overlayColor,
      overlayOpacity: input.overlayOpacity,
      logo: {
        logoUrl: input.logoUrl,
        blendMode: input.blendMode as BlendMode | undefined,
        opacity: input.logoOpacity,
        placement: input.logoPlacement,
        scale: input.logoScale,
        padding: input.logoPadding,
      },
    });

    const timestamp = Date.now();
    const filePath = `brands/${input.brandId}/blends/blend-${timestamp}.svg`;
    const publicUrl = await uploadSvg({ path: filePath, data: svg });
    const fileUrl = publicUrl ?? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    const { data: asset, error: assetError } = await supabase
      .from("image_assets")
      .insert({
        brand_id: input.brandId,
        created_by: user.id,
        asset_type: "composed",
        source: "library",
        file_url: fileUrl,
        width: input.canvasWidth ?? 1200,
        height: input.canvasHeight ?? 628,
        metadata: {
          blend_mode: input.blendMode ?? "normal",
          logo_url: input.logoUrl,
          base_image_url: input.baseImageUrl,
          storage_path: publicUrl ? filePath : null,
        },
      })
      .select("id, file_url")
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Failed to save blended asset" }, { status: 500 });
    }

    if (input.postId) {
      await supabase
        .from("posts")
        .update({ base_image_asset_id: asset.id, image_url: fileUrl })
        .eq("id", input.postId);
    }

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "image_blended",
      entity_type: "image_asset",
      entity_id: asset.id,
      metadata: { blend_mode: input.blendMode ?? "normal", logo_url: input.logoUrl },
    });

    return NextResponse.json({
      asset_id: asset.id,
      file_url: fileUrl,
      blend_mode: input.blendMode ?? "normal",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
