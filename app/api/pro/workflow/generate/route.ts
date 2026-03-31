import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

import { createServerSupabase } from '@/lib/supabase/server';

/**
 * PRO Studio Complete Workflow API
 * 
 * This endpoint orchestrates the complete two-phase image generation + composition flow:
 * 
 * 1. Generate base image (Phase 1 - gpt-image-1)
 * 2. Compose with brand elements (Phase 2 - Deterministic)
 * 3. Run compliance checks
 * 4. Save as draft for human approval
 * 
 * This is the "one-click" generation that users see in the UI.
 */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      brandId, 
      headline,
      bodyText,
      cta,
      hashtags,
      imagePrompt,
      profileName = 'LinkedIn Hero Post',
      outcomeBrief,
      experimentMode,
      experimentAxes,
    } = body;

    if (!brandId || !headline) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify brand ownership
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, owner_user_id')
      .eq('id', brandId)
      .eq('owner_user_id', user.id)
      .single();

    if (brandError || !brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Get brand kit, mood board, and image profile context
    const [brandKitRes, moodBoardRes, imageProfileRes] = await Promise.all([
      supabase
        .from('brand_kits')
        .select('id, logo_assets, primary_colors, secondary_colors, accent_colors')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('mood_boards')
        .select('id, palette_colors, typography_mood, composition_style')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('image_profiles')
        .select('id, name')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const brandKit = brandKitRes.data;
    const moodBoard = moodBoardRes.data;
    const imageProfile = imageProfileRes.data;

    // PHASE 1: Generate base image with gpt-image-1
    const phase1Response = await fetch(
      `${request.nextUrl.origin}/api/pro/image/generate-base`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'cookie': request.headers.get('cookie') || '',
        },
        body: JSON.stringify({
          brandId,
          prompt: imagePrompt || headline,
          userPrompt: headline,
        }),
      }
    );

    if (!phase1Response.ok) {
      const error = await phase1Response.json();
      return NextResponse.json({ error: 'Phase 1 failed: ' + error.error }, { status: 500 });
    }

    const phase1Data = await phase1Response.json();
    const baseImageUrl =
      phase1Data.url ||
      phase1Data.file_url ||
      phase1Data.imageUrl ||
      null;
    const baseAssetId =
      phase1Data.assetId ||
      phase1Data.asset_id ||
      phase1Data.imageAsset?.id ||
      null;

    if (!baseImageUrl) {
      return NextResponse.json({ error: 'Phase 1 failed: image URL missing' }, { status: 500 });
    }

    const normalizedHashtags = Array.isArray(hashtags)
      ? hashtags
          .filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          .map((tag) => `#${tag.replace(/^#/, '').trim()}`)
      : [];
    const postContent = [headline, bodyText || '', cta || '', normalizedHashtags.join(' ')]
      .filter((section) => typeof section === 'string' && section.trim().length > 0)
      .join('\n\n');

    // Create post draft first
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        brand_id: brandId,
        user_id: user.id,
        prompt: imagePrompt || headline,
        title: headline,
        post_content: postContent,
        image_url: baseImageUrl,
        base_image_asset_id: baseAssetId,
        status: 'draft',
      })
      .select()
      .single();

    if (postError || !post) {
      console.error('Failed to create post:', postError);
      return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
    }

    // PHASE 2: Compose with brand elements (if composition API is available)
    let composedImageUrl = baseImageUrl;
    let compositionId = null;
    let compositionSkippedReason: string | null = null;
    let visualQaScore: number | null = null;
    let brandQaScore: number | null = null;

    const textBlocks = [
      { id: 'title', type: 'title', text: headline },
      ...(bodyText ? [{ id: 'meta', type: 'meta', text: bodyText.slice(0, 280) }] : []),
      ...(cta ? [{ id: 'cta', type: 'cta', text: cta.slice(0, 120) }] : []),
    ];

    if (brandKit?.logo_assets?.[0] && moodBoard?.id && imageProfile?.id && baseAssetId) {
      try {
        const phase2Response = await fetch(
          `${request.nextUrl.origin}/api/pro/image/compose`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'cookie': request.headers.get('cookie') || '',
            },
            body: JSON.stringify({
              postId: post.id,
              brandId,
              brandKitId: brandKit.id,
              moodBoardId: moodBoard.id,
              imageProfileId: imageProfile.id,
              baseAssetId,
              textBlocks,
              logoPlacement: 'bottom-right',
              logoScale: 0.8,
            }),
          }
        );

        if (phase2Response.ok) {
          const phase2Data = await phase2Response.json();
          composedImageUrl = phase2Data.file_url || phase2Data.url || baseImageUrl;
          compositionId = phase2Data.composition_id;
          
          // Update post with composed image
          await supabase
            .from('posts')
            .update({ 
              image_url: composedImageUrl,
              image_composition_id: compositionId,
            })
            .eq('id', post.id);
        } else {
          compositionSkippedReason = 'compose_api_error';
        }
      } catch (error) {
        console.error('Phase 2 composition failed (non-critical):', error);
        // Continue with base image
        compositionSkippedReason = 'compose_exception';
      }
    } else {
      compositionSkippedReason = 'missing_brand_assets_or_profile';
    }

    // Visual QA checks (logo safety, collisions, readability heuristics)
    try {
      const qaResponse = await fetch(
        `${request.nextUrl.origin}/api/pro/image/qa`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            canvas: { width: 1200, height: 628 },
            logoPlacement: 'bottom-right',
            logoScale: 0.8,
            textZones: [
              { id: 'title', x: 72, y: 150, w: 780, h: 200 },
              { id: 'meta', x: 72, y: 390, w: 620, h: 80 },
              { id: 'cta', x: 72, y: 470, w: 620, h: 80 },
            ],
            brandColors: [
              ...((brandKit?.primary_colors as string[] | undefined) || []),
              ...((brandKit?.secondary_colors as string[] | undefined) || []),
              ...((brandKit?.accent_colors as string[] | undefined) || []),
            ],
            overlayOpacity: 0.2,
          }),
        }
      );

      if (qaResponse.ok) {
        const qaPayload = await qaResponse.json();
        if (typeof qaPayload.overallScore === 'number') {
          visualQaScore = qaPayload.overallScore;
          brandQaScore = qaPayload.overallScore;
        }
      }
    } catch (error) {
      console.error('Visual QA failed (non-critical):', error);
    }

    if (visualQaScore !== null || brandQaScore !== null) {
      await supabase
        .from('posts')
        .update({
          visual_consistency_score: visualQaScore,
          brand_consistency_score: brandQaScore,
        })
        .eq('id', post.id);
    }

    // Run compliance checks
    try {
      await fetch(
        `${request.nextUrl.origin}/api/pro/compliance/check`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ postId: post.id }),
        }
      );
    } catch (error) {
      console.error('Compliance check failed (non-critical):', error);
    }

    // Log workflow completion
    await supabase.from('audit_logs').insert({
      brand_id: brandId,
      actor_id: user.id,
      action: 'pro_workflow_complete',
      entity_type: 'post',
      entity_id: post.id,
      metadata: {
        base_asset_id: baseAssetId,
        composition_id: compositionId,
        profile_name: profileName,
        image_profile_id: imageProfile?.id || null,
        composition_skipped_reason: compositionSkippedReason,
        visual_qa_score: visualQaScore,
        outcome_brief: outcomeBrief || null,
        experiment_mode: experimentMode ?? null,
        experiment_axes: Array.isArray(experimentAxes) ? experimentAxes : null,
      },
    });

    return NextResponse.json({
      success: true,
      postId: post.id,
      baseImageUrl,
      composedImageUrl,
      compositionId,
      message: 'Post generated successfully. Review and publish when ready.',
    });

  } catch (error) {
    console.error('Workflow error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
