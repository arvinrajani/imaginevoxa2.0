import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      brandId,
      content,
      prompt,
      headline,
      body: bodyText,
      cta,
      hashtags,
      imagePrompt,
      imageUrl,
      imageAssetId,
      brandKitId,
      moodBoardId,
      imageProfileId,
      scheduledFor,
    } = body;

    if (!brandId) {
      return NextResponse.json(
        { error: 'Brand ID is required' },
        { status: 400 }
      );
    }

    const normalizedHashtags = Array.isArray(hashtags)
      ? hashtags
          .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          .map((tag) => `#${tag.replace(/^#/, '').trim()}`)
      : [];

    const computedContent =
      (typeof content === 'string' && content.trim()) ||
      [headline?.trim(), bodyText?.trim(), cta?.trim(), normalizedHashtags.length ? normalizedHashtags.join(' ') : null]
        .filter(Boolean)
        .join('\n\n');

    if (!computedContent) {
      return NextResponse.json(
        { error: 'Draft content is required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .maybeSingle();

    if (brandError) throw brandError;
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found or access denied' }, { status: 403 });
    }

    const title = typeof headline === 'string' && headline.trim() ? headline.trim() : 'Draft Post';
    const resolvedPrompt =
      (typeof prompt === 'string' && prompt.trim()) ||
      (typeof imagePrompt === 'string' && imagePrompt.trim()) ||
      title;

    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        brand_id: brandId,
        brand_kit_id: brandKitId || null,
        mood_board_id: moodBoardId || null,
        image_profile_id: imageProfileId || null,
        user_id: user.id,
        prompt: resolvedPrompt,
        title,
        post_content: computedContent,
        image_url: imageUrl,
        base_image_asset_id: imageAssetId || null,
        status: 'draft',
        scheduled_for: scheduledFor || null,
        last_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, postId: post.id, post }, { status: 201 });
  } catch (error: any) {
    console.error('Error saving draft:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save draft' },
      { status: 500 }
    );
  }
}
