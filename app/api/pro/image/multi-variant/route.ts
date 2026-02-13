import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateImageBase, createStructuredChatCompletion } from '@/lib/ai/openai';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, style, brandId, count = 3, size = '1024x1024' } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const variantCount = Math.min(Math.max(count, 2), 4);

    // Fetch brand data if available
    let brandContext = '';
    if (brandId) {
      const { data: brand } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', brandId)
        .single();

      if (brand) {
        brandContext = `Brand: "${brand.name || ''}". Colors: ${(brand.colors || []).join(', ')}. Style: ${brand.visual_style || 'modern'}. `;
      }
    }

    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';

    // Generate variant prompts using GPT
    const variantPrompts = await createStructuredChatCompletion<{
      variants: Array<{
        label: string;
        prompt: string;
        style_note: string;
      }>;
    }>({
      model,
      system: `You are a creative director specializing in LinkedIn visual content. 
Given a base image prompt, generate ${variantCount} distinct visual variations. 
Each variant should have:
- A short label (2-4 words)
- A complete, detailed image generation prompt
- A brief style note explaining the approach

Keep the core message/concept the same but vary the visual approach, composition, color palette, mood, or artistic style.
${brandContext ? `Incorporate brand context: ${brandContext}` : ''}
${style ? `Base style preference: ${style}` : ''}`,
      user: `Base prompt: "${prompt}"

Generate ${variantCount} visually distinct variations of this concept for LinkedIn.`,
      schema: {
        name: 'image_variants',
        schema: {
          type: 'object',
          properties: {
            variants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  prompt: { type: 'string' },
                  style_note: { type: 'string' },
                },
                required: ['label', 'prompt', 'style_note'],
                additionalProperties: false,
              },
            },
          },
          required: ['variants'],
          additionalProperties: false,
        },
      },
    });

    // Generate all images in parallel
    const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

    const imageResults = await Promise.allSettled(
      variantPrompts.variants.map(async (variant) => {
        const result = await generateImageBase({
          model: imageModel,
          prompt: variant.prompt,
          size,
          quality: 'high',
          outputFormat: 'png',
        });

        // Upload to Supabase storage
        const filename = `multi-variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const filePath = `${user.id}/generated/${filename}`;
        const buffer = Buffer.from(result.base64, 'base64');

        const { error: uploadError } = await supabase.storage
          .from('brand-assets')
          .upload(filePath, buffer, { contentType: 'image/png', upsert: true });

        let publicUrl = '';
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(filePath);
          publicUrl = urlData.publicUrl;
        }

        return {
          label: variant.label,
          style_note: variant.style_note,
          prompt: variant.prompt,
          url: publicUrl,
          base64: publicUrl ? undefined : `data:image/png;base64,${result.base64}`,
        };
      })
    );

    const variants = imageResults
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value);

    const errors = imageResults
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason?.message || 'Image generation failed');

    if (variants.length === 0) {
      return NextResponse.json(
        { error: 'All image generations failed', details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      variants,
      total_requested: variantCount,
      total_generated: variants.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Multi-variant generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate variants' },
      { status: 500 }
    );
  }
}
