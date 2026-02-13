import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const formData = await request.formData();
    const postId = formData.get("postId")?.toString();
    const brandId = formData.get("brandId")?.toString();
    const file = formData.get("file") as File | null;

    if (!postId || !brandId || !file) {
      return NextResponse.json({ error: "Missing postId, brandId, or file" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.split(".").pop() || "png";
    const filePath = `brands/${brandId}/posts/${postId}/upload-${Date.now()}.${extension}`;
    const publicUrl = await uploadToSupabaseStorage({
      path: filePath,
      contentType: file.type || "image/png",
      data: buffer,
    });
    const fileUrl = publicUrl || `data:${file.type};base64,${buffer.toString("base64")}`;

    const { data: asset, error: assetError } = await supabase
      .from("image_assets")
      .insert({
        brand_id: brandId,
        created_by: user.id,
        asset_type: "base",
        source: "upload",
        file_url: fileUrl,
        metadata: { storage_path: publicUrl ? filePath : null },
      })
      .select("*")
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Failed to save base image" }, { status: 500 });
    }

    await supabase
      .from("posts")
      .update({
        base_image_asset_id: asset.id,
        image_url: fileUrl,
      })
      .eq("id", postId);

    return NextResponse.json({ asset_id: asset.id, file_url: fileUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
