import { NextResponse } from "next/server";

export const maxDuration = 60;

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { composeSvg, getDefaultLayoutSpec } from "@/lib/studio/compositor";

const inputSchema = z.object({
  postId: z.string().uuid(),
  brandId: z.string().uuid(),
  brandKitId: z.string().uuid(),
  moodBoardId: z.string().uuid(),
  imageProfileId: z.string().uuid(),
  baseAssetId: z.string().uuid(),
  logoPlacement: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]).optional(),
  logoScale: z.number().min(0.4).max(2).optional(),
  logoPadding: z.number().min(0).max(40).optional(),
  bannerStyle: z.enum(["none", "top", "bottom", "full"]).optional(),
  bannerColor: z.string().optional(),
  bannerOpacity: z.number().min(0).max(1).optional(),
  overlayColor: z.string().optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
  baseTransform: z
    .object({
      scale: z.number().min(0.6).max(2).optional(),
      x: z.number().min(-0.5).max(0.5).optional(),
      y: z.number().min(-0.5).max(0.5).optional(),
    })
    .optional(),
  filters: z
    .object({
      brightness: z.number().min(0.5).max(1.6).optional(),
      contrast: z.number().min(0.5).max(1.6).optional(),
      saturation: z.number().min(0.5).max(1.6).optional(),
      blur: z.number().min(0).max(4).optional(),
    })
    .optional(),
  layoutOverride: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      logoZoneId: z.string().optional(),
      zones: z.array(
        z.object({
          id: z.string(),
          x: z.number(),
          y: z.number(),
          w: z.number(),
          h: z.number(),
          align: z.enum(["left", "center", "right"]).optional(),
          padding: z.number().optional(),
        })
      ),
    })
    .optional(),
  textStyles: z
    .record(
      z.string(),
      z.object({
        fontSize: z.number().min(12).max(120).optional(),
        fontWeight: z.number().min(100).max(900).optional(),
        letterSpacing: z.number().min(-2).max(4).optional(),
        color: z.string().optional(),
      })
    )
    .optional(),
  textBlocks: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["label", "title", "meta", "cta"]),
        text: z.string(),
        zoneId: z.string().optional(),
      })
    )
    .min(1),
});

type LogoPlacement = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

type LayoutZone = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  align?: "left" | "center" | "right";
  padding?: number;
};

type LayoutSpec = {
  width: number;
  height: number;
  backgroundColor?: string;
  zones: LayoutZone[];
  logoZoneId?: string;
};

const LOGO_POSITIONS: Record<LogoPlacement, { x: number; y: number; align: "left" | "center" | "right" }> = {
  "top-left": { x: 0.06, y: 0.06, align: "left" },
  "top-right": { x: 0.78, y: 0.06, align: "right" },
  "bottom-left": { x: 0.06, y: 0.78, align: "left" },
  "bottom-right": { x: 0.78, y: 0.78, align: "right" },
  center: { x: 0.42, y: 0.42, align: "center" },
};

const normalizeLayoutSpec = (layoutSpec: LayoutSpec | null) => {
  if (!layoutSpec || !Array.isArray(layoutSpec.zones)) {
    return getDefaultLayoutSpec();
  }
  return {
    ...layoutSpec,
    zones: layoutSpec.zones.map((zone) => ({ ...zone })),
  };
};

const applyLogoPlacement = (layoutSpec: LayoutSpec, placement: LogoPlacement) => {
  const target = LOGO_POSITIONS[placement];
  const logoZoneId = layoutSpec.logoZoneId || "logo";
  const index = layoutSpec.zones.findIndex((zone) => zone.id === logoZoneId || zone.id === "logo");
  const baseZone =
    index >= 0
      ? { ...layoutSpec.zones[index] }
      : { id: logoZoneId, x: 0.78, y: 0.06, w: 0.16, h: 0.16, align: "right", padding: 6 };
  const nextZone = { ...baseZone, id: logoZoneId, x: target.x, y: target.y, align: target.align };
  const zones = [...layoutSpec.zones];
  if (index >= 0) {
    zones[index] = nextZone;
  } else {
    zones.push(nextZone);
  }
  return { ...layoutSpec, zones, logoZoneId };
};

async function uploadSvg(options: { path: string; data: string }) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  if (!bucket) return null;

  const admin = createAdminClient();
  const upload = await admin.storage.from(bucket).upload(options.path, Buffer.from(options.data), {
    contentType: "image/svg+xml",
    upsert: true,
  });

  if (upload.error) {
    throw new Error(`Storage upload failed: ${upload.error.message}`);
  }

  const publicUrl = admin.storage.from(bucket).getPublicUrl(options.path);
  return publicUrl.data.publicUrl || null;
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

    const [baseAssetRes, imageProfileRes, brandKitRes] = await Promise.all([
      supabase.from("image_assets").select("*").eq("id", input.baseAssetId).single(),
      supabase.from("image_profiles").select("*").eq("id", input.imageProfileId).single(),
      supabase.from("brand_kits").select("*").eq("id", input.brandKitId).single(),
    ]);

    if (baseAssetRes.error || !baseAssetRes.data) {
      return NextResponse.json({ error: "Base image not found" }, { status: 404 });
    }
    if (imageProfileRes.error || !imageProfileRes.data) {
      return NextResponse.json({ error: "Image profile not found" }, { status: 404 });
    }
    if (brandKitRes.error || !brandKitRes.data) {
      return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
    }

    const layoutSpecRaw = input.layoutOverride
      ? (input.layoutOverride as LayoutSpec)
      : ((imageProfileRes.data.layout_spec as LayoutSpec | null) || null);
    const normalizedLayout = normalizeLayoutSpec(layoutSpecRaw);
    const layoutSpec = input.logoPlacement
      ? applyLogoPlacement(normalizedLayout, input.logoPlacement)
      : normalizedLayout;
    const brandKit = brandKitRes.data as Record<string, unknown>;
    const logos = (brandKit.logo_assets as Array<{ url?: string }> | null) || [];
    const logoUrl = logos[0]?.url || null;
    const palette = [
      ...(brandKit.primary_colors as string[] | undefined || []),
      ...(brandKit.secondary_colors as string[] | undefined || []),
      ...(brandKit.accent_colors as string[] | undefined || []),
    ];

    const svg = composeSvg({
      baseImageUrl: baseAssetRes.data.file_url,
      textBlocks: input.textBlocks,
      layoutSpec: layoutSpec || null,
      logoUrl,
      palette,
      fontFamily: brandKit.font_personality as string | undefined,
      logoScale: input.logoScale,
      logoPadding: input.logoPadding,
      banner: input.bannerStyle
        ? {
            style: input.bannerStyle,
            color: input.bannerColor,
            opacity: input.bannerOpacity,
          }
        : undefined,
      overlayColor: input.overlayColor,
      overlayOpacity: input.overlayOpacity,
      baseTransform: input.baseTransform,
      filters: input.filters,
      textStyles: input.textStyles,
    });

    const compositionPayload = {
      brand_id: input.brandId,
      base_asset_id: input.baseAssetId,
      image_profile_id: input.imageProfileId,
      mood_board_id: input.moodBoardId,
      layout_json: layoutSpec || {},
      text_blocks: input.textBlocks,
      logo_overrides: {
        logo_url: logoUrl,
        placement: input.logoPlacement ?? null,
        logo_scale: input.logoScale ?? null,
        logo_padding: input.logoPadding ?? null,
        banner_style: input.bannerStyle ?? null,
        banner_color: input.bannerColor ?? null,
        banner_opacity: input.bannerOpacity ?? null,
        overlay_color: input.overlayColor ?? null,
        overlay_opacity: input.overlayOpacity ?? null,
        base_transform: input.baseTransform ?? null,
        filters: input.filters ?? null,
        text_styles: input.textStyles ?? null,
      },
      created_by: user.id,
    };

    const { data: composition, error: compositionError } = await supabase
      .from("image_compositions")
      .insert(compositionPayload)
      .select("*")
      .single();

    if (compositionError || !composition) {
      return NextResponse.json({ error: "Failed to create composition" }, { status: 500 });
    }

    const filePath = `brands/${input.brandId}/posts/${input.postId}/composition-${composition.id}.svg`;
    const publicUrl = await uploadSvg({ path: filePath, data: svg });
    const fileUrl = publicUrl || `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    const { data: asset, error: assetError } = await supabase
      .from("image_assets")
      .insert({
        brand_id: input.brandId,
        created_by: user.id,
        asset_type: "composed",
        source: "library",
        file_url: fileUrl,
        width: 1200,
        height: 628,
        metadata: {
          composition_id: composition.id,
          storage_path: publicUrl ? filePath : null,
        },
      })
      .select("*")
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Failed to save composed asset" }, { status: 500 });
    }

    await supabase
      .from("image_compositions")
      .update({ output_asset_id: asset.id })
      .eq("id", composition.id);

    await supabase
      .from("posts")
      .update({
        composed_image_asset_id: asset.id,
        image_composition_id: composition.id,
        image_url: fileUrl,
      })
      .eq("id", input.postId);

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "image_composed",
      entity_type: "image_composition",
      entity_id: composition.id,
      metadata: { asset_id: asset.id },
    });

    return NextResponse.json({
      composition_id: composition.id,
      asset_id: asset.id,
      file_url: fileUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
