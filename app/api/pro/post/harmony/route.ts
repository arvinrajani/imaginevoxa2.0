import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;
import { NextResponse } from 'next/server';
import { createStructuredChatCompletion } from '@/lib/ai/openai';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { postContent, imageDescription, imageUrl, brandTone } = await request.json();

    if (!postContent) {
      return NextResponse.json({ error: 'Post content is required' }, { status: 400 });
    }

    if (!imageDescription && !imageUrl) {
      return NextResponse.json({ error: 'Image description or URL is required' }, { status: 400 });
    }

    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';

    // Build the analysis prompt with image context
    let imageContext = '';
    if (imageUrl) {
      // If we have a URL, describe what GPT-4o would see
      imageContext = `Image URL provided: ${imageUrl}. `;
    }
    if (imageDescription) {
      imageContext += `Image description: ${imageDescription}`;
    }

    const result = await createStructuredChatCompletion<{
      harmony_score: number;
      overall_assessment: string;
      checks: Array<{
        category: string;
        score: number;
        finding: string;
        suggestion: string;
      }>;
      message_alignment: {
        post_message: string;
        image_message: string;
        alignment_score: number;
        gap: string;
      };
      emotional_match: {
        post_emotion: string;
        image_emotion: string;
        match_score: number;
      };
      audience_fit: {
        score: number;
        assessment: string;
      };
      recommendations: string[];
      improved_image_prompt: string;
    }>({
      model,
      system: `You are a LinkedIn visual content strategist who analyzes the harmony between post text and accompanying images.

Evaluate these dimensions (each scored 0-100):
1. Message Alignment: Does the image reinforce the post's core message?
2. Emotional Match: Do the image mood and post tone convey the same feeling?
3. Professional Quality: Is the image suitable for LinkedIn's professional context?
4. Brand Consistency: Does the visual match the brand tone described?
5. Scroll-Stop Factor: Would this image+text combo make someone stop scrolling?
6. Cognitive Load: Is the combined message clear or confusing?
7. CTA Support: Does the image complement the post's call-to-action?

Overall harmony_score is a weighted average of all checks.

If the image doesn't match the post well, suggest a better image prompt that would create perfect harmony.`,
      user: `Analyze the harmony between this LinkedIn post and its image:

POST:
"""
${postContent}
"""

IMAGE:
${imageContext}

${brandTone ? `Brand tone: ${brandTone}` : ''}

Provide a comprehensive harmony analysis with scores, findings, and improvement suggestions.`,
      schema: {
        name: 'harmony_analysis',
        schema: {
          type: 'object',
          properties: {
            harmony_score: { type: 'number' },
            overall_assessment: { type: 'string' },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  score: { type: 'number' },
                  finding: { type: 'string' },
                  suggestion: { type: 'string' },
                },
                required: ['category', 'score', 'finding', 'suggestion'],
                additionalProperties: false,
              },
            },
            message_alignment: {
              type: 'object',
              properties: {
                post_message: { type: 'string' },
                image_message: { type: 'string' },
                alignment_score: { type: 'number' },
                gap: { type: 'string' },
              },
              required: ['post_message', 'image_message', 'alignment_score', 'gap'],
              additionalProperties: false,
            },
            emotional_match: {
              type: 'object',
              properties: {
                post_emotion: { type: 'string' },
                image_emotion: { type: 'string' },
                match_score: { type: 'number' },
              },
              required: ['post_emotion', 'image_emotion', 'match_score'],
              additionalProperties: false,
            },
            audience_fit: {
              type: 'object',
              properties: {
                score: { type: 'number' },
                assessment: { type: 'string' },
              },
              required: ['score', 'assessment'],
              additionalProperties: false,
            },
            recommendations: { type: 'array', items: { type: 'string' } },
            improved_image_prompt: { type: 'string' },
          },
          required: ['harmony_score', 'overall_assessment', 'checks', 'message_alignment', 'emotional_match', 'audience_fit', 'recommendations', 'improved_image_prompt'],
          additionalProperties: false,
        },
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Harmony check error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze harmony' },
      { status: 500 }
    );
  }
}