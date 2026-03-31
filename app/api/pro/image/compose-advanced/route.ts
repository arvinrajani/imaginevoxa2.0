import { NextResponse } from 'next/server';

export const maxDuration = 60;

import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { brandId, baseImage, logoUrl, stamps = [], template, enhancement, imageProfileId, moodBoardId, baseAssetId } = body;

    if (!brandId || !baseImage) {
      return NextResponse.json({ error: 'brandId and baseImage are required' }, { status: 400 });
    }

    // In a real implementation, this would:
    // 1. Download the base image
    // 2. Apply logo overlay at specified position
    // 3. Apply each stamp at its position
    // 4. Add text overlays if from template
    // 5. Apply filters/effects
    // 6. Upload final composed image to storage
    // 7. Return the public URL

    // For now, return a composed image URL (mock)
    const composedUrl = baseImage; // Would be the newly composed image

    const layers = [
      { type: 'base', data: { url: baseImage } },
      logoUrl && { type: 'logo', data: { url: logoUrl, position: 'bottom-right' } },
      ...stamps.map((stamp: any) => ({
        type: 'stamp',
        data: stamp,
      })),
    ].filter(Boolean);

    const metadata = {
      size: { width: 1200, height: 627 },
      template: template?.id,
      stamps: stamps.map((s: any) => s.id),
      createdAt: new Date().toISOString(),
    };

    // Save composition to database
    const { data: composition, error: compositionError } = await supabase
      .from('image_compositions')
      .insert({
      brand_id: brandId,
      base_asset_id: baseAssetId || null,
      image_profile_id: imageProfileId || null,
      mood_board_id: moodBoardId || null,
      layout_json: {
        enhancement: enhancement || null,
        template_id: template?.id || null,
        canvas: metadata.size,
      },
      text_blocks: Array.isArray(template?.textBlocks) ? template.textBlocks : [],
      logo_overrides: {
        logo_url: logoUrl || null,
        stamps,
        layers,
      },
      created_by: user.id,
    })
      .select('id')
      .single();

    if (compositionError || !composition) {
      throw compositionError || new Error('Failed to save composition');
    }

    const { data: asset } = await supabase
      .from('image_assets')
      .insert({
        brand_id: brandId,
        created_by: user.id,
        asset_type: 'composed',
        source: 'library',
        file_url: composedUrl,
        width: metadata.size.width,
        height: metadata.size.height,
        metadata: {
          composition_id: composition.id,
          layers,
          template: template?.id || null,
          enhancement: enhancement || null,
        },
      })
      .select('id')
      .single();

    if (asset?.id) {
      await supabase
        .from('image_compositions')
        .update({ output_asset_id: asset.id })
        .eq('id', composition.id);
    }

    return NextResponse.json({
      success: true,
      url: composedUrl,
      layers,
      metadata,
      composition_id: composition.id,
      asset_id: asset?.id || null,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    console.error('Error composing image:', error);
    return NextResponse.json(
      { error: 'Failed to compose image' },
      { status: 500 }
    );
  }
}
