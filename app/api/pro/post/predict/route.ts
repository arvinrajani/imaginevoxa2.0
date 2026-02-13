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

    const { content, hasImage, imageDescription, audience } = await request.json();

    if (!content) {
      return NextResponse.json({ error: 'Post content is required' }, { status: 400 });
    }

    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';

    const prediction = await createStructuredChatCompletion<{
      overall_score: number;
      engagement_prediction: {
        likes_range: string;
        comments_range: string;
        shares_range: string;
        impressions_range: string;
      };
      breakdown: {
        hook_strength: number;
        readability: number;
        emotional_resonance: number;
        value_density: number;
        cta_effectiveness: number;
        visual_complement: number;
        hashtag_strategy: number;
        length_optimization: number;
      };
      strengths: string[];
      improvements: Array<{
        issue: string;
        suggestion: string;
        impact: string;
      }>;
      best_posting_times: string[];
      rewritten_hook: string;
      content_type: string;
    }>({
      model,
      system: `You are a LinkedIn algorithm expert and engagement analyst. Analyze posts and predict their performance.

Scoring criteria (each 0-100):
- hook_strength: How attention-grabbing is the first line? Pattern interrupts, curiosity gaps, bold claims score higher.
- readability: Short sentences, white space, scannable format. LinkedIn rewards mobile-friendly posts.
- emotional_resonance: Does it evoke emotion? Stories, vulnerability, controversy score higher.
- value_density: Actionable insights per word. Avoid fluff.
- cta_effectiveness: Clear, specific call-to-action. "Comment below" beats no CTA.
- visual_complement: Does the image/visual support the message? (score based on description or 50 if no image)
- hashtag_strategy: 3-5 relevant hashtags, mix of broad and niche.
- length_optimization: 100-300 words is the sweet spot. Too short lacks depth, too long loses readers.

Overall score is a weighted average: hook (25%), readability (15%), emotion (20%), value (15%), CTA (10%), visual (5%), hashtags (5%), length (5%).

Provide realistic engagement ranges based on a typical LinkedIn user with 500-5000 connections.
Suggest 3 specific improvements with expected impact.
Rewrite just the hook (first 1-2 lines) for maximum impact.`,
      user: `Analyze this LinkedIn post:

"""
${content}
"""

${hasImage ? `Image description: ${imageDescription || 'An image is included with the post'}` : 'No image included with this post.'}
${audience ? `Target audience: ${audience}` : ''}

Provide a comprehensive performance prediction with scores, engagement estimates, and specific improvement suggestions.`,
      schema: {
        name: 'performance_prediction',
        schema: {
          type: 'object',
          properties: {
            overall_score: { type: 'number' },
            engagement_prediction: {
              type: 'object',
              properties: {
                likes_range: { type: 'string' },
                comments_range: { type: 'string' },
                shares_range: { type: 'string' },
                impressions_range: { type: 'string' },
              },
              required: ['likes_range', 'comments_range', 'shares_range', 'impressions_range'],
              additionalProperties: false,
            },
            breakdown: {
              type: 'object',
              properties: {
                hook_strength: { type: 'number' },
                readability: { type: 'number' },
                emotional_resonance: { type: 'number' },
                value_density: { type: 'number' },
                cta_effectiveness: { type: 'number' },
                visual_complement: { type: 'number' },
                hashtag_strategy: { type: 'number' },
                length_optimization: { type: 'number' },
              },
              required: ['hook_strength', 'readability', 'emotional_resonance', 'value_density', 'cta_effectiveness', 'visual_complement', 'hashtag_strategy', 'length_optimization'],
              additionalProperties: false,
            },
            strengths: { type: 'array', items: { type: 'string' } },
            improvements: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  issue: { type: 'string' },
                  suggestion: { type: 'string' },
                  impact: { type: 'string' },
                },
                required: ['issue', 'suggestion', 'impact'],
                additionalProperties: false,
              },
            },
            best_posting_times: { type: 'array', items: { type: 'string' } },
            rewritten_hook: { type: 'string' },
            content_type: { type: 'string' },
          },
          required: ['overall_score', 'engagement_prediction', 'breakdown', 'strengths', 'improvements', 'best_posting_times', 'rewritten_hook', 'content_type'],
          additionalProperties: false,
        },
      },
    });

    return NextResponse.json(prediction);
  } catch (error: any) {
    console.error('Performance prediction error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to predict performance' },
      { status: 500 }
    );
  }
}
