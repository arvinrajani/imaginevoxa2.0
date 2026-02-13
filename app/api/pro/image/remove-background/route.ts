import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateImageBase } from '@/lib/ai/openai';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { imageUrl, brandId } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    // Use gpt-image-1 with transparent background to regenerate
    // This approach: re-generate the image with background: transparent
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

    const { base64 } = await generateImageBase({
      model,
      prompt: `Recreate this exact image subject/object but with a completely transparent background. Remove all background elements. Keep only the main subject. Clean edges, no artifacts.`,
      size: '1024x1024',
      quality: 'high',
      outputFormat: 'png',
      background: 'transparent',
    });

    // Upload to Supabase storage
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'brand-assets';
    const fileName = `${user.id}/${brandId || 'default'}/bg-removed-${Date.now()}.png`;
    const buffer = Buffer.from(base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to save processed image' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error: any) {
    console.error('Background removal error:', error);
    return NextResponse.json(
      { error: error.message || 'Background removal failed' },
      { status: 500 }
    );
  }
}
