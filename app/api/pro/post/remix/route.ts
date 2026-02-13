import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createStructuredChatCompletion } from '@/lib/ai/openai';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { originalPost, angle, tone, audience } = await request.json();

    if (!originalPost) {
      return NextResponse.json({ error: 'Original post content is required' }, { status: 400 });
    }

    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';

    const result = await createStructuredChatCompletion<{
      remixes: Array<{
        title: string;
        body: string;
        hashtags: string[];
        approach: string;
        difference_from_original: string;
      }>;
      original_analysis: {
        core_message: string;
        structure: string;
        engagement_drivers: string[];
      };
    }>({
      model,
      system: `You are a LinkedIn content strategist who specializes in remixing successful content.

Your job: Take a post that performed well and create fresh variations that keep the same winning formula but feel completely new.

Rules:
- Analyze what made the original post work (structure, hook, emotional triggers)
- Generate 3 remixed versions with different approaches:
  1. A "Fresh Angle" — same core message, completely different hook and structure
  2. A "Deep Dive" — expand on one sub-point from the original
  3. A "Flip It" — take the contrarian perspective of the original
- Keep the same approximate length and energy
- Maintain the author's voice and brand
- Each remix should stand alone without feeling like a copy
- Include relevant hashtags for each`,
      user: `Remix this LinkedIn post into 3 fresh variations:

Original post:
"""
${originalPost}
"""

${angle ? `Preferred angle: ${angle}` : ''}
${tone ? `Tone: ${tone}` : ''}
${audience ? `Target audience: ${audience}` : ''}`,
      schema: {
        name: 'post_remixes',
        schema: {
          type: 'object',
          properties: {
            remixes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                  hashtags: { type: 'array', items: { type: 'string' } },
                  approach: { type: 'string' },
                  difference_from_original: { type: 'string' },
                },
                required: ['title', 'body', 'hashtags', 'approach', 'difference_from_original'],
                additionalProperties: false,
              },
            },
            original_analysis: {
              type: 'object',
              properties: {
                core_message: { type: 'string' },
                structure: { type: 'string' },
                engagement_drivers: { type: 'array', items: { type: 'string' } },
              },
              required: ['core_message', 'structure', 'engagement_drivers'],
              additionalProperties: false,
            },
          },
          required: ['remixes', 'original_analysis'],
          additionalProperties: false,
        },
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Post remix error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remix post' },
      { status: 500 }
    );
  }
}
