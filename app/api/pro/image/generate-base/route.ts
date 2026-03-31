import { NextResponse } from 'next/server';

export const maxDuration = 60;

import { createServerSupabase } from '@/lib/supabase/server';
import { generateImageBase } from '@/lib/ai/openai';
import { buildBaseImagePrompt } from '@/lib/studio/prompt-builder';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, moodBoardId, brandId, imageProfile } = body;

    if (!prompt || !brandId) {
      return NextResponse.json(
        { error: 'Prompt and brand ID are required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch brand kit for color, tone, and style context
    const { data: brandKit } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get mood board if provided, or fall back to latest for brand
    let moodBoard: any = null;
    if (moodBoardId) {
      const { data } = await supabase
        .from('mood_boards')
        .select('*')
        .eq('id', moodBoardId)
        .single();
      moodBoard = data;
    } else {
      const { data } = await supabase
        .from('mood_boards')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      moodBoard = data;
    }

    // Use the shared prompt builder which integrates brand colors, style, and mood
    const { prompt: enhancedPrompt } = buildBaseImagePrompt({
      userPrompt: prompt,
      brandKit: brandKit || null,
      moodBoard: moodBoard || null,
      imageProfile: imageProfile || null,
    });

    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';

    const { base64 } = await generateImageBase({
      model,
      prompt: enhancedPrompt,
      size: '1536x1024',
      quality: 'high',
      outputFormat: 'png',
    });

    // Convert base64 to data URI as fallback (no storage upload in this simple route)
    const imageUrl = `data:image/png;base64,${base64}`;

    // Save to database
    const { data: imageAsset, error } = await supabase
      .from('image_assets')
      .insert({
        brand_id: brandId,
        created_by: user.id,
        asset_type: 'base',
        source: 'ai',
        file_url: imageUrl,
        width: 1536,
        height: 1024,
        metadata: {
          prompt: enhancedPrompt,
          original_prompt: prompt,
          model,
          mood_board_id: moodBoardId,
          image_profile: imageProfile,
          generated_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      imageUrl,
      file_url: imageUrl,
      url: imageUrl,
      assetId: imageAsset.id,
      asset_id: imageAsset.id,
      imageAsset,
    });
  } catch (error: any) {
    console.error('Error generating base image:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate image' },
      { status: 500 }
    );
  }
}
