import { NextResponse } from "next/server";

export const maxDuration = 60;

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBaseImagePrompt } from "@/lib/studio/prompt-builder";
import { generateImageBase } from "@/lib/ai/openai";

const inputSchema = z
  .object({
    postId: z.string().uuid().optional().nullable(),
    brandId: z.string().uuid(),
    brandKitId: z.string().uuid().optional().nullable(),
    moodBoardId: z.string().uuid().optional().nullable(),
    imageProfileId: z.string().uuid().optional().nullable(),
    userPrompt: z.string().min(5).optional(),
    prompt: z.string().min(5).optional(),
    size: z.string().optional(),
    quality: z.enum(["low", "medium", "high"]).optional(),
    outputFormat: z.enum(["png", "jpeg", "webp"]).optional(),
  })
  .refine((value) => Boolean(value.userPrompt || value.prompt), {
    message: "userPrompt or prompt is required",
    path: ["userPrompt"],
  });

function parseSize(size?: string) {
  if (!size) return null;
  const [width, height] = size.split("x").map((value) => Number(value));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

function resolveBrandLogoUrl(brandKit: Record<string, unknown> | null) {
  if (!brandKit) return null;
  const raw = brandKit.logo_assets;
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) return item.trim();
    if (item && typeof item === "object" && "url" in item) {
      const value = (item as { url?: unknown }).url;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function buildLogoOverlaySvg(options: {
  baseImageUrl: string;
  logoUrl: string;
  width: number;
  height: number;
}) {
  const { baseImageUrl, logoUrl, width, height } = options;
  const pad = Math.max(12, Math.round(width * 0.025));
  const logoW = Math.round(width * 0.16);
  const logoH = Math.round(height * 0.16);
  const x = width - logoW - pad;
  const y = pad;
  const bgPad = 10;
  const bgX = x - bgPad;
  const bgY = y - bgPad;
  const bgW = logoW + bgPad * 2;
  const bgH = logoH + bgPad * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${escapeSvgText(baseImageUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
  <rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" rx="14" fill="rgba(255,255,255,0.88)" />
  <image href="${escapeSvgText(logoUrl)}" x="${x}" y="${y}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" />
</svg>`;
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildFallbackImageBase64(options: {
  width: number;
  height: number;
  title: string;
  subtitle: string;
  colors: string[];
}) {
  const [c1, c2, c3] = options.colors.length
    ? options.colors.slice(0, 3)
    : ["#0A66C2", "#1E293B", "#22D3EE"];

  const title = escapeSvgText(options.title);
  const subtitle = escapeSvgText(options.subtitle);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" role="img" aria-label="Fallback visual">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="52%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="glowA" cx="16%" cy="20%" r="44%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <radialGradient id="glowB" cx="82%" cy="82%" r="40%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.24)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glowA)"/>
  <rect width="100%" height="100%" fill="url(#glowB)"/>
  <rect x="56" y="56" width="${Math.max(options.width - 112, 100)}" height="${Math.max(
    options.height - 112,
    100
  )}" rx="26" fill="rgba(0,0,0,0.26)" stroke="rgba(255,255,255,0.24)"/>
  <text x="88" y="${Math.round(options.height * 0.42)}" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="46" font-weight="700">${title}</text>
  <text x="88" y="${Math.round(
    options.height * 0.52
  )}" fill="rgba(255,255,255,0.94)" font-family="Segoe UI, Arial, sans-serif" font-size="26">${subtitle}</text>
  <text x="88" y="${Math.round(
    options.height * 0.89
  )}" fill="rgba(255,255,255,0.82)" font-family="Segoe UI, Arial, sans-serif" font-size="18">Fallback visual generated locally</text>
</svg>`;

  return Buffer.from(svg).toString("base64");
}

async function uploadToSupabaseStorage(options: {
  path: string;
  contentType: string;
  data: Buffer;
}) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  if (!bucket) return null;

  const admin = createAdminClient();
  const upload = await admin.storage.from(bucket).upload(options.path, options.data, {
    contentType: options.contentType,
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
    const userPrompt = (input.userPrompt || input.prompt || "").trim();

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    const devUserId = process.env.DEV_USER_ID?.trim();
    const allowDevFallback = process.env.NODE_ENV !== "production" && Boolean(devUserId);
    const actingUserId = user?.id || (allowDevFallback ? devUserId : undefined);

    if (!actingUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use admin client (service role, bypasses RLS) when cookie auth is unavailable
    // Always use admin client — avoids RLS recursion on brand_members
    const db = createAdminClient();

    const [brandKitRes, moodBoardRes, imageProfileRes] = await Promise.all([
      input.brandKitId
        ? db
            .from("brand_kits")
            .select("*")
            .eq("id", input.brandKitId)
            .eq("brand_id", input.brandId)
            .maybeSingle()
        : db
            .from("brand_kits")
            .select("*")
            .eq("brand_id", input.brandId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
      input.moodBoardId
        ? db
            .from("mood_boards")
            .select("*")
            .eq("id", input.moodBoardId)
            .eq("brand_id", input.brandId)
            .maybeSingle()
        : db
            .from("mood_boards")
            .select("*")
            .eq("brand_id", input.brandId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
      input.imageProfileId
        ? db
            .from("image_profiles")
            .select("*")
            .eq("id", input.imageProfileId)
            .eq("brand_id", input.brandId)
            .maybeSingle()
        : db
            .from("image_profiles")
            .select("*")
            .eq("brand_id", input.brandId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    if (brandKitRes.error) {
      console.warn("Failed to resolve brand kit:", brandKitRes.error.message);
    }
    if (moodBoardRes.error) {
      console.warn("Failed to resolve mood board:", moodBoardRes.error.message);
    }
    if (imageProfileRes.error) {
      console.warn("Failed to resolve image profile:", imageProfileRes.error.message);
    }

    if (input.brandKitId && !brandKitRes.data) {
      return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
    }
    if (input.moodBoardId && !moodBoardRes.data) {
      return NextResponse.json({ error: "Mood board not found" }, { status: 404 });
    }
    if (input.imageProfileId && !imageProfileRes.data) {
      return NextResponse.json({ error: "Image profile not found" }, { status: 404 });
    }

    const promptData = buildBaseImagePrompt({
      userPrompt,
      brandKit: brandKitRes.data || null,
      moodBoard: moodBoardRes.data || null,
      imageProfile: imageProfileRes.data || null,
    });

    const imageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
    const jobPayload = {
      brand_id: input.brandId,
      mood_board_id: moodBoardRes.data?.id || null,
      image_profile_id: imageProfileRes.data?.id || null,
      post_id: input.postId || null,
      prompt: promptData.prompt,
      negative_prompt: promptData.negativePrompt.join(", "),
      provider: "openai",
      model_name: imageModel,
      model_version: null,
      params: {
        image_model: imageModel,
        size: input.size || "1200x628",
        quality: input.quality || "high",
        output_format: input.outputFormat || "png",
        palette: promptData.palette,
        style_notes: promptData.styleNotes,
      },
      status: "generating",
      created_by: actingUserId,
    };

    const { data: job, error: jobError } = await db
      .from("image_generation_jobs")
      .insert(jobPayload)
      .select("*")
      .single();

    if (jobError || !job) {
      console.error("Failed to create image job:", jobError?.message);
      return NextResponse.json({ error: "Failed to create image generation job" }, { status: 500 });
    }

    try {
      let base64: string;
      let usedFallback = false;
      let fallbackReason: string | null = null;

      try {
        const result = await generateImageBase({
          model: imageModel,
          prompt: promptData.prompt,
          size: input.size || "1200x628",
          quality: input.quality || "high",
          outputFormat: input.outputFormat || "png",
        });
        base64 = result.base64;
      } catch (generationError) {
        usedFallback = true;
        fallbackReason =
          generationError instanceof Error ? generationError.message : "Unknown image generation error";

        const sizeHint = parseSize(input.size || "1200x628") || { width: 1200, height: 628 };
        const title = (input.userPrompt || input.prompt || "Generated visual")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 44);
        const subtitle = "AI image temporarily unavailable";

        base64 = buildFallbackImageBase64({
          width: sizeHint.width,
          height: sizeHint.height,
          title: title || "Generated visual",
          subtitle,
          colors: promptData.palette || [],
        });
      }

      const size = parseSize(input.size || "1200x628");
      const imageBuffer = Buffer.from(base64, "base64");
      const postSegment = input.postId || `adhoc-${job.id}`;
      const filePath = `brands/${input.brandId}/posts/${postSegment}/${job.id}.${input.outputFormat || "png"}`;
      let publicUrl: string | null = null;

      try {
        publicUrl = await uploadToSupabaseStorage({
          path: filePath,
          contentType: `image/${input.outputFormat || "png"}`,
          data: imageBuffer,
        });
      } catch (uploadErr) {
        console.warn("Storage upload failed, using data URL:", uploadErr);
      }

      const baseFileUrl = publicUrl || `data:image/${input.outputFormat || "png"};base64,${base64}`;
      let finalFileUrl = baseFileUrl;
      let composedAssetId: string | null = null;
      let logoApplied = false;

      const { data: asset, error: assetError } = await db
        .from("image_assets")
        .insert({
          brand_id: input.brandId,
          created_by: actingUserId,
          asset_type: "base",
          source: usedFallback ? "upload" : "ai",
          file_url: baseFileUrl,
          width: size?.width ?? null,
          height: size?.height ?? null,
          metadata: {
            job_id: job.id,
            storage_path: publicUrl ? filePath : null,
            image_model: imageModel,
            fallback_used: usedFallback,
            fallback_reason: fallbackReason,
          },
        })
        .select("*")
        .single();

      if (assetError || !asset) {
        throw new Error("Failed to save image asset");
      }

      await db.from("image_generation_outputs").insert({
        job_id: job.id,
        asset_id: asset.id,
        variation_index: 0,
        metadata: { output_format: input.outputFormat || "png" },
      });

      const brandLogoUrl = resolveBrandLogoUrl((brandKitRes.data as Record<string, unknown>) || null);
      if (brandLogoUrl) {
        const canvas = size || { width: 1200, height: 628 };
        const composedSvg = buildLogoOverlaySvg({
          baseImageUrl: baseFileUrl,
          logoUrl: brandLogoUrl,
          width: canvas.width,
          height: canvas.height,
        });
        const composedPath = `brands/${input.brandId}/posts/${postSegment}/${job.id}-composed.svg`;
        let composedPublicUrl: string | null = null;

        try {
          composedPublicUrl = await uploadToSupabaseStorage({
            path: composedPath,
            contentType: "image/svg+xml",
            data: Buffer.from(composedSvg),
          });
        } catch (uploadErr) {
          console.warn("Composed image upload failed, using data URL:", uploadErr);
        }

        const composedFileUrl =
          composedPublicUrl || `data:image/svg+xml;utf8,${encodeURIComponent(composedSvg)}`;

        const { data: composedAsset } = await db
          .from("image_assets")
          .insert({
            brand_id: input.brandId,
            created_by: actingUserId,
            asset_type: "composed",
            source: "library",
            file_url: composedFileUrl,
            width: canvas.width,
            height: canvas.height,
            metadata: {
              job_id: job.id,
              base_asset_id: asset.id,
              logo_url: brandLogoUrl,
              storage_path: composedPublicUrl ? composedPath : null,
              auto_logo_applied: true,
            },
          })
          .select("*")
          .single();

        if (composedAsset?.id) {
          composedAssetId = composedAsset.id;
          finalFileUrl = composedFileUrl;
          logoApplied = true;
        }
      }

      await db
        .from("image_generation_jobs")
        .update({
          status: "completed",
          error_message: usedFallback ? fallbackReason : null,
        })
        .eq("id", job.id);

      if (input.postId) {
        await db
          .from("posts")
          .update({
            base_image_asset_id: asset.id,
            composed_image_asset_id: composedAssetId,
            image_generation_job_id: job.id,
            image_url: finalFileUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.postId);
      }

      return NextResponse.json({
        job_id: job.id,
        asset_id: asset.id,
        composed_asset_id: composedAssetId,
        file_url: finalFileUrl,
        base_file_url: baseFileUrl,
        url: finalFileUrl,
        imageUrl: finalFileUrl,
        assetId: asset.id,
        imageAsset: asset,
        logoApplied,
        fallback: usedFallback,
        warning: usedFallback
          ? "Fallback visual returned because AI image generation is unavailable right now."
          : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image generation failed";
      await db
        .from("image_generation_jobs")
        .update({ status: "failed", error_message: message })
        .eq("id", job.id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
