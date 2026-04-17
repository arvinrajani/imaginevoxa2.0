import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB per file

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
    const industry = (formData.get('industry') as string)?.trim()?.toLowerCase();

    if (!industry || !VALID_INDUSTRIES.includes(industry)) {
      return NextResponse.json(
        { error: `industry must be one of: ${VALID_INDUSTRIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Collect all files from form
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'files' && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const results: { name: string; url: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const file of files) {
      try {
        // Validate image type
        if (!file.type.startsWith('image/')) {
          errors.push({ name: file.name, error: 'Not an image file' });
          continue;
        }

        // Validate size
        if (file.size > MAX_FILE_SIZE) {
          errors.push({ name: file.name, error: 'Exceeds 20MB limit' });
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();
        const rawBuffer = Buffer.from(arrayBuffer);

        // Resize to exact dimensions
        const fullBuffer = await sharp(rawBuffer)
          .resize(1536, 1024, { fit: 'cover' })
          .png()
          .toBuffer();

        const previewBuffer = await sharp(rawBuffer)
          .resize(384, 256, { fit: 'cover' })
          .png()
          .toBuffer();

        // Generate safe filename
        const baseName = file.name
          .replace(/\.[^.]+$/, '') // strip extension
          .replace(/\s+/g, '-')    // spaces to hyphens
          .replace(/[^a-zA-Z0-9_-]/g, '') // remove special chars
          .toLowerCase();

        const safeName = baseName || 'background';
        const timestamp = Date.now();
        const fullPath = `banner-assets/backgrounds/${industry}/${safeName}-${timestamp}.png`;
        const previewPath = `banner-assets/backgrounds/${industry}/${safeName}-${timestamp}-preview.png`;

        // Upload full image
        const { error: uploadFullErr } = await adminClient.storage
          .from('banner-assets')
          .upload(fullPath, fullBuffer, { contentType: 'image/png' });

        if (uploadFullErr) {
          errors.push({ name: file.name, error: `Upload failed: ${uploadFullErr.message}` });
          continue;
        }

        // Upload preview
        const { error: uploadPreviewErr } = await adminClient.storage
          .from('banner-assets')
          .upload(previewPath, previewBuffer, { contentType: 'image/png' });

        if (uploadPreviewErr) {
          console.error(`[bg-batch] Preview upload error for ${file.name}:`, uploadPreviewErr.message);
        }

        // Get public URLs
        const {
          data: { publicUrl: storageUrl },
        } = adminClient.storage.from('banner-assets').getPublicUrl(fullPath);

        const {
          data: { publicUrl: previewUrl },
        } = adminClient.storage.from('banner-assets').getPublicUrl(previewPath);

        // Display name from filename
        const displayName = baseName
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ') || 'Background';

        // Upsert into banner_backgrounds
        const { error: insertErr } = await adminClient
          .from('banner_backgrounds')
          .upsert(
            {
              name: displayName,
              industry,
              storage_url: storageUrl,
              preview_url: previewUrl,
              is_active: true,
            },
            { onConflict: 'name' }
          );

        if (insertErr) {
          console.error(`[bg-batch] DB insert error for ${file.name}:`, insertErr.message);
          errors.push({ name: file.name, error: 'Database insert failed' });
          continue;
        }

        results.push({ name: displayName, url: storageUrl });
      } catch (fileErr) {
        const msg = fileErr instanceof Error ? fileErr.message : 'Processing failed';
        errors.push({ name: file.name, error: msg });
      }
    }

    return NextResponse.json({
      uploaded: results.length,
      failed: errors.length,
      files: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error(
      '[bg-batch] Unhandled:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
