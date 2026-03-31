import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

import { createServerSupabase } from '@/lib/supabase/server';
import { createStructuredChatCompletion } from '@/lib/ai/openai';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, description, brandColors, industry } = body;

    if (type === 'post-template') {
      // Generate a custom LinkedIn post template
      const result = await createStructuredChatCompletion({
        model: process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-4o-mini',
        system: `You are a LinkedIn content design expert. Generate a professional post template configuration based on the user's description. Return a template that includes layout, example content, and an image prompt.`,
        user: `Create a custom LinkedIn post template with these requirements:
Description: ${description || 'Professional announcement'}
Industry: ${industry || 'Technology'}
Brand Colors: ${(brandColors || ['#0A66C2']).join(', ')}

Generate a complete template with:
1. A creative name
2. A category (announcement, thought-leadership, product, hiring, milestone, or personal)
3. Layout configuration (imageStyle, textOverlay, logoPosition, accentBar)
4. Example headline, body text, and image generation prompt
5. Make the image prompt detailed and professional`,
        schema: {
          name: 'post_template',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Creative template name' },
              category: { type: 'string', enum: ['announcement', 'thought-leadership', 'product', 'hiring', 'milestone', 'personal'] },
              layout: {
                type: 'object',
                properties: {
                  imageStyle: { type: 'string', enum: ['split', 'background', 'top', 'collage'] },
                  textOverlay: { type: 'boolean' },
                  logoPosition: { type: 'string', enum: ['corner', 'center', 'none'] },
                  accentBar: { type: 'boolean' },
                },
                required: ['imageStyle', 'textOverlay', 'logoPosition', 'accentBar'],
                additionalProperties: false,
              },
              example: {
                type: 'object',
                properties: {
                  headline: { type: 'string' },
                  body: { type: 'string' },
                  imagePrompt: { type: 'string' },
                },
                required: ['headline', 'body', 'imagePrompt'],
                additionalProperties: false,
              },
            },
            required: ['name', 'category', 'layout', 'example'],
            additionalProperties: false,
          },
        },
        temperature: 0.8,
      });

      return NextResponse.json({
        template: {
          id: `custom-${Date.now()}`,
          ...(result as Record<string, unknown>),
          isPro: true,
          thumbnail: 'custom',
        },
      });
    }

    if (type === 'stamp-suggestions') {
      // Generate AI stamp design suggestions
      const result = await createStructuredChatCompletion({
        model: process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-4o-mini',
        system: `You are a brand identity design expert. Generate professional brand stamp/watermark design suggestions based on the user's brand identity. Each suggestion should be distinct and suited for LinkedIn content.`,
        user: `Generate 4 unique brand stamp suggestions for:
Industry: ${industry || 'Technology'}
Brand Colors: ${(brandColors || ['#0A66C2', '#0F172A']).join(', ')}
Description: ${description || 'Professional brand'}

For each suggestion provide:
1. A creative name
2. Type (corner, watermark, badge, or seal)
3. Recommended position
4. Shape, background color, text color, and size
5. Short text to display (company initials, tagline, etc.)
6. Brief description of the design concept`,
        schema: {
          name: 'stamp_suggestions',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string', enum: ['corner', 'watermark', 'badge', 'seal'] },
                    position: { type: 'string', enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] },
                    shape: { type: 'string', enum: ['circle', 'square', 'rounded', 'hexagon'] },
                    backgroundColor: { type: 'string', description: 'Hex color' },
                    textColor: { type: 'string', description: 'Hex color' },
                    size: { type: 'string', enum: ['small', 'medium', 'large'] },
                    text: { type: 'string' },
                    concept: { type: 'string' },
                  },
                  required: ['name', 'type', 'position', 'shape', 'backgroundColor', 'textColor', 'size', 'text', 'concept'],
                  additionalProperties: false,
                },
              },
            },
            required: ['suggestions'],
            additionalProperties: false,
          },
        },
        temperature: 0.9,
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid template type. Use "post-template" or "stamp-suggestions".' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[PRO] Template generate error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
