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
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Enforce max image size (25 MB)
    const MAX_IMAGE_SIZE = 25 * 1024 * 1024;
    if (buffer.byteLength > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image too large. Maximum size is 25 MB.' }, { status: 413 });
    }

    const extension = file.name.split(".").pop() || "png";
    const filePath = `uploads/${user.id}/reference-${Date.now()}.${extension}`;
    const publicUrl = await uploadToSupabaseStorage({
      path: filePath,
      contentType: file.type || "image/png",
      data: buffer,
    });
    const fileUrl = publicUrl || `data:${file.type};base64,${buffer.toString("base64")}`;

    return NextResponse.json({ file_url: fileUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
