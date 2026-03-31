import { NextResponse } from "next/server";

export const maxDuration = 60;
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

const deleteSchema = z.object({
  brandKitId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  url: z.string().url().optional(),
});

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "-");

async function uploadLogoToStorage(file: File, path: string) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  if (!bucket) {
    throw new Error("Missing SUPABASE_STORAGE_BUCKET.");
  }

  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await admin.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || "image/png",
    upsert: true,
  });

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  const publicUrl = admin.storage.from(bucket).getPublicUrl(path);
  return { url: publicUrl.data.publicUrl, path };
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const brandId = formData.get("brandId");
    const brandKitId = formData.get("brandKitId");
    const file = formData.get("file");

    if (typeof brandId !== "string" || typeof brandKitId !== "string") {
      return NextResponse.json({ error: "Missing brand identifiers." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing logo file." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
    }

    if (file.size > MAX_LOGO_SIZE) {
      return NextResponse.json({ error: "Logo must be under 5MB." }, { status: 413 });
    }

    const kitRes = await supabase.from("brand_kits").select("*").eq("id", brandKitId).single();
    if (kitRes.error || !kitRes.data) {
      return NextResponse.json({ error: "Brand kit not found." }, { status: 404 });
    }

    if (kitRes.data.is_locked) {
      return NextResponse.json({ error: "Brand kit is locked." }, { status: 400 });
    }

    if (kitRes.data.brand_id !== brandId) {
      return NextResponse.json({ error: "Brand kit does not match brand." }, { status: 400 });
    }

    const filename = sanitizeFilename(file.name || "logo");
    const path = `brands/${brandId}/brand-kits/${brandKitId}/logos/${Date.now()}-${filename}`;
    const upload = await uploadLogoToStorage(file, path);

    const { data: asset, error: assetError } = await supabase
      .from("image_assets")
      .insert({
        brand_id: brandId,
        created_by: user.id,
        asset_type: "logo",
        source: "upload",
        file_url: upload.url,
        metadata: { original_name: file.name, storage_path: upload.path },
      })
      .select("*")
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Failed to save logo asset." }, { status: 500 });
    }

    const existing = (kitRes.data.logo_assets as Array<Record<string, unknown>> | null) || [];
    const nextAssets = [
      ...existing,
      { url: upload.url, asset_id: asset.id, name: file.name, path: upload.path },
    ];

    const { data: updatedKit, error: updateError } = await supabase
      .from("brand_kits")
      .update({ logo_assets: nextAssets })
      .eq("id", brandKitId)
      .select("*")
      .single();

    if (updateError || !updatedKit) {
      return NextResponse.json({ error: "Failed to update brand kit." }, { status: 500 });
    }

    await supabase.from("audit_logs").insert({
      brand_id: brandId,
      actor_id: user.id,
      action: "brand_logo_uploaded",
      entity_type: "brand_kit",
      entity_id: updatedKit.id,
      metadata: { asset_id: asset.id, file_name: file.name },
    });

    return NextResponse.json({ brand_kit: updatedKit, asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const input = deleteSchema.parse(body);

    const kitRes = await supabase.from("brand_kits").select("*").eq("id", input.brandKitId).single();
    if (kitRes.error || !kitRes.data) {
      return NextResponse.json({ error: "Brand kit not found." }, { status: 404 });
    }

    if (kitRes.data.is_locked) {
      return NextResponse.json({ error: "Brand kit is locked." }, { status: 400 });
    }

    const existing = (kitRes.data.logo_assets as Array<Record<string, unknown>> | null) || [];
    const nextAssets = existing.filter((asset) => {
      const assetId = asset.asset_id as string | undefined;
      const url = asset.url as string | undefined;
      if (input.assetId && assetId === input.assetId) return false;
      if (input.url && url === input.url) return false;
      return true;
    });

    const { data: updatedKit, error: updateError } = await supabase
      .from("brand_kits")
      .update({ logo_assets: nextAssets })
      .eq("id", input.brandKitId)
      .select("*")
      .single();

    if (updateError || !updatedKit) {
      return NextResponse.json({ error: "Failed to update brand kit." }, { status: 500 });
    }

    if (input.assetId) {
      await supabase.from("image_assets").delete().eq("id", input.assetId);
    }

    const removed = existing.find((asset) => {
      const assetId = asset.asset_id as string | undefined;
      const url = asset.url as string | undefined;
      if (input.assetId && assetId === input.assetId) return true;
      if (input.url && url === input.url) return true;
      return false;
    });

    const storagePath = removed?.path as string | undefined;
    if (storagePath) {
      const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
      if (bucket) {
        const admin = createAdminClient();
        await admin.storage.from(bucket).remove([storagePath]);
      }
    }

    await supabase.from("audit_logs").insert({
      brand_id: kitRes.data.brand_id,
      actor_id: user.id,
      action: "brand_logo_removed",
      entity_type: "brand_kit",
      entity_id: updatedKit.id,
      metadata: { asset_id: input.assetId, url: input.url },
    });

    return NextResponse.json({ brand_kit: updatedKit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}