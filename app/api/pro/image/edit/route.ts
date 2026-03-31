import { NextResponse } from "next/server";

export const maxDuration = 60;

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({
  postId: z.string().uuid(),
  brandId: z.string().uuid(),
  baseAssetId: z.string().uuid(),
  prompt: z.string().min(5),
  maskDataUrl: z.string(),
  size: z.string().optional(),
  outputFormat: z.enum(["png", "jpeg", "webp"]).optional(),
});

const OPENAI_API_BASE = "https://api.openai.com/v1";

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY.");
  }
  return key;
}

function dataUrlToBuffer(dataUrl: string) {
  const [header, data] = dataUrl.split(",");
  if (!header || !data) throw new Error("Invalid data URL.");
  return Buffer.from(data, "base64");
}

async function fetchImageBuffer(url: string) {
  if (url.startsWith("data:image")) {
    return dataUrlToBuffer(url);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch base image: ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseAssetRes = await supabase
      .from("image_assets")
      .select("*")
      .eq("id", input.baseAssetId)
      .single();

    if (baseAssetRes.error || !baseAssetRes.data) {
      return NextResponse.json({ error: "Base image not found" }, { status: 404 });
    }

    const baseImageBuffer = await fetchImageBuffer(baseAssetRes.data.file_url);
    const maskBuffer = dataUrlToBuffer(input.maskDataUrl);

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", input.prompt);
    form.append("image", new Blob([baseImageBuffer], { type: "image/png" }), "image.png");
    form.append("mask", new Blob([maskBuffer], { type: "image/png" }), "mask.png");
    if (input.size) form.append("size", input.size);
    form.append("response_format", "b64_json");

    const editRes = await fetch(`${OPENAI_API_BASE}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: form,
    });

    if (!editRes.ok) {
      const errorText = await editRes.text();
      return NextResponse.json({ error: `OpenAI edit failed: ${errorText}` }, { status: 500 });
    }

    const editJson = (await editRes.json()) as { data?: Array<{ b64_json?: string }> };
    const base64 = editJson.data?.[0]?.b64_json;
    if (!base64) {
      return NextResponse.json({ error: "OpenAI edit returned no image" }, { status: 502 });
    }

    const outputFormat = input.outputFormat || "png";
    const imageBuffer = Buffer.from(base64, "base64");
    const filePath = `brands/${input.brandId}/posts/${input.postId}/edit-${Date.now()}.${outputFormat}`;
    const publicUrl = await uploadToSupabaseStorage({
      path: filePath,
      contentType: `image/${outputFormat}`,
      data: imageBuffer,
    });
    const fileUrl = publicUrl || `data:image/${outputFormat};base64,${base64}`;

    const { data: asset, error: assetError } = await supabase
      .from("image_assets")
      .insert({
        brand_id: input.brandId,
        created_by: user.id,
        asset_type: "base",
        source: "ai",
        file_url: fileUrl,
        metadata: {
          prompt: input.prompt,
          base_asset_id: input.baseAssetId,
          storage_path: publicUrl ? filePath : null,
        },
      })
      .select("*")
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Failed to save edited image" }, { status: 500 });
    }

    await supabase
      .from("posts")
      .update({
        base_image_asset_id: asset.id,
        image_url: fileUrl,
      })
      .eq("id", input.postId);

    return NextResponse.json({ asset_id: asset.id, file_url: fileUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
