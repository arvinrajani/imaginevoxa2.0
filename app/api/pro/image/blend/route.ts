import { NextResponse } from "next/server";

export const maxDuration = 60;

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import sharp from "sharp";

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

type Placement = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

const PLACEMENT_OFFSETS: Record<Placement, { xPct: number; yPct: number }> = {
  "top-left": { xPct: 0.04, yPct: 0.04 },
  "top-right": { xPct: 0.78, yPct: 0.04 },
  "bottom-left": { xPct: 0.04, yPct: 0.78 },
  "bottom-right": { xPct: 0.78, yPct: 0.78 },
  center: { xPct: 0.4, yPct: 0.4 },
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

function isAllowedImageUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    const h = parsed.hostname.toLowerCase();
    if (
      h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' ||
      h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('172.') ||
      h === '169.254.169.254' || h.endsWith('.internal') || h.endsWith('.local') || h.endsWith('.localhost')
    ) return false;
    return true;
  } catch { return false; }
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!isAllowedImageUrl(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const cl = Number(res.headers.get('content-length') || '0');
    if (cl > MAX_IMAGE_BYTES) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function uploadPng(options: { path: string; data: Buffer }) {
  const buckets = ["brand-assets", "images"];
  const admin = createAdminClient();

  for (const bucket of buckets) {
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(options.path, options.data, {
        contentType: "image/png",
        upsert: true,
      });

    if (!uploadError) {
      const { data } = admin.storage.from(bucket).getPublicUrl(options.path);
      return data.publicUrl || null;
    }
  }

  return null;
}

/**
 * POST /api/pro/image/blend
 *
 * Composites a logo onto a base image using sharp (real PNG output).
 * Replaces the old SVG-based approach which had cross-origin rendering issues.
 */
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

    // Brand ownership verification
    const admin = createAdminClient();
    const { data: ownerCheck } = await admin
      .from("brands")
      .select("id")
      .eq("id", input.brandId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (!ownerCheck) {
      return NextResponse.json(
        { error: "You do not have access to this brand." },
        { status: 403 }
      );
    }

    const W = input.canvasWidth ?? 1200;
    const H = input.canvasHeight ?? 628;
    const logoOpacity = input.logoOpacity ?? 0.92;
    const logoScale = input.logoScale ?? 1;
    const logoPadding = input.logoPadding ?? 16;
    const placement: Placement = input.logoPlacement ?? "top-right";

    // Fetch both images in parallel
    const [baseBuffer, logoBuffer] = await Promise.all([
      fetchImageBuffer(input.baseImageUrl),
      fetchImageBuffer(input.logoUrl),
    ]);

    if (!baseBuffer) {
      return NextResponse.json(
        { error: "Could not fetch the base image." },
        { status: 400 }
      );
    }

    if (!logoBuffer) {
      return NextResponse.json(
        { error: "Could not fetch the logo image." },
        { status: 400 }
      );
    }

    // Resize base image to exact canvas dimensions
    const base = await sharp(baseBuffer)
      .resize(W, H, { fit: "cover" })
      .png()
      .toBuffer();

    // Calculate logo dimensions
    const logoTargetW = Math.round(W * 0.18 * logoScale);
    const logoTargetH = Math.round(H * 0.18 * logoScale);

    // Resize logo with transparency preserved
    const logo = await sharp(logoBuffer)
      .resize(logoTargetW, logoTargetH, {
        fit: "contain",
        withoutEnlargement: false,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .png()
      .toBuffer();

    // Apply opacity to logo if not full
    let logoWithOpacity = logo;
    if (logoOpacity < 1) {
      // Multiply alpha channel by the desired opacity
      const logoMeta = await sharp(logo).metadata();
      const lw = logoMeta.width || logoTargetW;
      const lh = logoMeta.height || logoTargetH;

      // Create a semi-transparent overlay to reduce opacity
      const opacityMask = await sharp({
        create: {
          width: lw,
          height: lh,
          channels: 4,
          background: {
            r: 255,
            g: 255,
            b: 255,
            alpha: Math.round(logoOpacity * 255),
          },
        },
      })
        .png()
        .toBuffer();

      logoWithOpacity = await sharp(logo)
        .composite([{ input: opacityMask, blend: "dest-in" }])
        .png()
        .toBuffer();
    }

    // Calculate position
    const pos = PLACEMENT_OFFSETS[placement];
    const left = Math.round(W * pos.xPct + logoPadding);
    const top = Math.round(H * pos.yPct + logoPadding);

    // Composite logo onto base image
    // Note: sharp's composite `blend` option supports: over, multiply, screen, overlay, etc.
    const sharpBlend = mapBlendMode(input.blendMode ?? "normal");

    const composited = await sharp(base)
      .composite([
        {
          input: logoWithOpacity,
          left,
          top,
          blend: sharpBlend,
        },
      ])
      .png({ quality: 90 })
      .toBuffer();

    // Upload to storage
    const timestamp = Date.now();
    const filePath = `brands/${input.brandId}/blends/blend-${timestamp}.png`;
    const publicUrl = await uploadPng({ path: filePath, data: composited });

    if (!publicUrl) {
      // Fallback: return as base64 data URL
      const base64 = composited.toString("base64");
      const dataUrl = `data:image/png;base64,${base64}`;

      return NextResponse.json({
        asset_id: null,
        file_url: dataUrl,
        blend_mode: input.blendMode ?? "normal",
      });
    }

    const { data: asset, error: assetError } = await supabase
      .from("image_assets")
      .insert({
        brand_id: input.brandId,
        created_by: user.id,
        asset_type: "composed",
        source: "library",
        file_url: publicUrl,
        width: W,
        height: H,
        metadata: {
          blend_mode: input.blendMode ?? "normal",
          logo_url: input.logoUrl,
          base_image_url: input.baseImageUrl,
          storage_path: filePath,
        },
      })
      .select("id, file_url")
      .single();

    if (assetError || !asset) {
      // Still return the URL even if DB insert fails
      return NextResponse.json({
        asset_id: null,
        file_url: publicUrl,
        blend_mode: input.blendMode ?? "normal",
      });
    }

    if (input.postId) {
      await supabase
        .from("posts")
        .update({ base_image_asset_id: asset.id, image_url: publicUrl })
        .eq("id", input.postId);
    }

    await supabase.from("audit_logs").insert({
      brand_id: input.brandId,
      actor_id: user.id,
      action: "image_blended",
      entity_type: "image_asset",
      entity_id: asset.id,
      metadata: {
        blend_mode: input.blendMode ?? "normal",
        logo_url: input.logoUrl,
      },
    });

    return NextResponse.json({
      asset_id: asset.id,
      file_url: publicUrl,
      blend_mode: input.blendMode ?? "normal",
    });
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

/**
 * Maps our blend mode names to sharp's supported composite blend operations.
 */
function mapBlendMode(
  mode: string
): "over" | "multiply" | "screen" | "overlay" | "soft-light" {
  switch (mode) {
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "soft-light":
      return "soft-light";
    case "luminosity":
    case "color-dodge":
      // sharp doesn't support these directly — fall back to overlay
      return "overlay";
    default:
      return "over";
  }
}
