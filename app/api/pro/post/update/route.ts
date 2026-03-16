import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';

const inputSchema = z.object({
  postId: z.string().uuid(),
  brandId: z.string().uuid(),
  prompt: z.string().optional(),
  headline: z.string().min(1),
  body: z.string().optional(),
  cta: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  imageAssetId: z.string().uuid().nullable().optional(),
  publishChannels: z.array(z.enum(['linkedin', 'facebook', 'instagram'])).optional(),
  targetType: z.enum(['person', 'organization']).optional(),
  targetUrn: z.string().nullable().optional(),
  facebookPageId: z.string().nullable().optional(),
  instagramAccountId: z.string().nullable().optional(),
});

function normalizeHashtags(hashtags: string[] | undefined) {
  if (!Array.isArray(hashtags)) return [];

  return hashtags
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => `#${tag.replace(/^#/, '').trim()}`);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);

    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, brand_id, content_version')
      .eq('id', input.postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (postError) throw postError;
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.brand_id && post.brand_id !== input.brandId) {
      return NextResponse.json({ error: 'Brand mismatch for this post' }, { status: 403 });
    }

    const tags = normalizeHashtags(input.hashtags);
    const bodyText = input.body?.trim() || '';
    const ctaText = input.cta?.trim() || '';
    const content = [input.headline.trim(), bodyText, ctaText, tags.join(' ')]
      .filter((part) => part.length > 0)
      .join('\n\n');

    if (!content.trim()) {
      return NextResponse.json({ error: 'Post content cannot be empty' }, { status: 400 });
    }

    const resolvedPrompt =
      (input.prompt && input.prompt.trim()) ||
      (input.imagePrompt && input.imagePrompt.trim()) ||
      input.headline.trim();

    const currentVersion = typeof post.content_version === 'number' ? post.content_version : 1;

    const { data: updatedPost, error: updateError } = await supabase
      .from('posts')
      .update({
        title: input.headline.trim(),
        prompt: resolvedPrompt,
        post_content: content,
        image_url: input.imageUrl || null,
        base_image_asset_id: input.imageAssetId || null,
        ...(input.publishChannels
          ? {
              publish_channels:
                Array.from(new Set(input.publishChannels)).length > 0
                  ? Array.from(new Set(input.publishChannels))
                  : ['linkedin'],
            }
          : {}),
        ...(input.targetType ? { target_type: input.targetType } : {}),
        ...(input.targetUrn !== undefined ? { target_urn: input.targetUrn || null } : {}),
        ...(input.facebookPageId !== undefined
          ? { facebook_page_id: input.facebookPageId || null }
          : {}),
        ...(input.instagramAccountId !== undefined
          ? { instagram_account_id: input.instagramAccountId || null }
          : {}),
        content_version: currentVersion + 1,
        last_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.postId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updatedPost) {
      throw updateError || new Error('Failed to update post');
    }

    return NextResponse.json({
      success: true,
      postId: updatedPost.id,
      post: updatedPost,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update post' },
      { status: 500 }
    );
  }
}
