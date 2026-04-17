import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const VALID_INDUSTRIES = [
  'electrical',
  'manufacturing',
  'construction',
  'technology',
  'automotive',
  'healthcare',
  'general',
];

export async function POST(req: NextRequest) {
  try {
    // Admin check
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== process.env.ADMIN_USER_ID) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const name = (formData.get('name') as string)?.trim();
    const industry = (formData.get('industry') as string)?.trim()?.toLowerCase();

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!industry || !VALID_INDUSTRIES.includes(industry)) {
      return NextResponse.json(
        { error: `industry must be one of: ${VALID_INDUSTRIES.join(', ')}` },
        { status: 400 }
      );
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds 15MB limit' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    const fullBuffer = await sharp(rawBuffer)
      .resize(1536, 1024, { fit: 'cover' })
      .png()
      .toBuffer();

    const previewBuffer = await sharp(rawBuffer)
      .resize(384, 256, { fit: 'cover' })
      .png()
      .toBuffer();

    const adminClient = createAdminClient();
    const timestamp = Date.now();
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const fullPath = `backgrounds/${industry}/${safeName}-${timestamp}.png`;
    const previewPath = `previews/${safeName}-${timestamp}-preview.png`;

    const { error: uploadFullErr } = await adminClient.storage
      .from('banner-assets')
      .upload(fullPath, fullBuffer, { contentType: 'image/png' });

    if (uploadFullErr) {
      console.error('[bg-upload] Full upload error:', uploadFullErr.message);
      return NextResponse.json({ error: 'Failed to upload background' }, { status: 500 });
    }

    const { error: uploadPreviewErr } = await adminClient.storage
      .from('banner-assets')
      .upload(previewPath, previewBuffer, { contentType: 'image/png' });

    if (uploadPreviewErr) {
      console.error('[bg-upload] Preview upload error:', uploadPreviewErr.message);
    }

    const {
      data: { publicUrl: storageUrl },
    } = adminClient.storage.from('banner-assets').getPublicUrl(fullPath);

    const {
      data: { publicUrl: previewUrl },
    } = adminClient.storage.from('banner-assets').getPublicUrl(previewPath);

    const { data: row, error: insertErr } = await adminClient
      .from('banner_backgrounds')
      .insert({
        name,
        industry,
        storage_url: storageUrl,
        preview_url: previewUrl,
        is_active: true,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[bg-upload] Insert error:', insertErr.message);
      return NextResponse.json({ error: 'Failed to save background record' }, { status: 500 });
    }

    return NextResponse.json(row);
  } catch (error) {
    console.error(
      '[bg-upload] Unhandled:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
