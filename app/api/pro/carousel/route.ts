import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createStructuredChatCompletion, generateImageBase } from '@/lib/ai/openai';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { content, brandId, slideCount = 5, style = 'modern', includeImages = false } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }
    if (content.length > 50000) {
      return NextResponse.json({ error: 'Content must be under 50,000 characters' }, { status: 400 });
    }

    const actualSlideCount = Math.min(Math.max(slideCount, 3), 10);

    // Fetch brand data
    let brandContext = '';
    let brandColors: string[] = [];
    if (brandId) {
      const { data: brand } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', brandId)
        .single();

      if (brand) {
        brandContext = `Brand: "${brand.name || ''}". Colors: ${(brand.colors || []).join(', ')}. Font style: ${brand.font_heading || 'sans-serif'}. `;
        brandColors = brand.colors || [];
      }
    }

    const model = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';

    // Generate carousel slide content
    const carouselData = await createStructuredChatCompletion<{
      title: string;
      slides: Array<{
        slide_number: number;
        headline: string;
        body: string;
        visual_suggestion: string;
        layout: 'title' | 'content' | 'quote' | 'list' | 'cta';
      }>;
      caption: string;
      hashtags: string[];
    }>({
      model,
      system: `You are a LinkedIn carousel content strategist. Create engaging multi-slide carousel content.

Rules:
- Slide 1 is always the "hook" title slide — bold, attention-grabbing
- Middle slides deliver value with one key point each
- Last slide is always a CTA (follow, comment, share, save)
- Each slide should have a short headline (max 8 words) and body text (max 30 words)
- Suggest a visual/background concept for each slide
- Choose appropriate layouts per slide
- Include a caption for the LinkedIn post itself
${brandContext ? `Brand context: ${brandContext}` : ''}
Style: ${style}`,
      user: `Create a ${actualSlideCount}-slide LinkedIn carousel from this content:

"${content}"

Generate structured slide content with headlines, body text, visual suggestions, and layouts.`,
      schema: {
        name: 'carousel_content',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            slides: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  slide_number: { type: 'number' },
                  headline: { type: 'string' },
                  body: { type: 'string' },
                  visual_suggestion: { type: 'string' },
                  layout: { type: 'string', enum: ['title', 'content', 'quote', 'list', 'cta'] },
                },
                required: ['slide_number', 'headline', 'body', 'visual_suggestion', 'layout'],
                additionalProperties: false,
              },
            },
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'slides', 'caption', 'hashtags'],
          additionalProperties: false,
        },
      },
    });

    // Optionally generate background images for each slide
    let slideImages: Array<{ slide_number: number; url: string } | null> = [];

    if (includeImages) {
      const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
      const primaryColor = brandColors[0] || '#1a365d';
      const accentColor = brandColors[1] || '#3182ce';

      // Generate images for up to 3 key slides (to save costs)
      const keySlides = carouselData.slides.filter(
        (s) => s.layout === 'title' || s.layout === 'cta' || s.slide_number === Math.ceil(actualSlideCount / 2)
      ).slice(0, 3);

      const imageResults = await Promise.allSettled(
        keySlides.map(async (slide) => {
          const imgPrompt = `LinkedIn carousel slide background, ${style} style, ${slide.visual_suggestion}. Colors: ${primaryColor}, ${accentColor}. Clean, professional, minimal text space. 1080x1080 social media format.`;

          const result = await generateImageBase({
            model: imageModel,
            prompt: imgPrompt,
            size: '1024x1024',
            quality: 'medium',
            outputFormat: 'png',
          });

          // Upload to storage
          const filename = `carousel-slide-${slide.slide_number}-${Date.now()}.png`;
          const filePath = `${user.id}/carousels/${filename}`;
          const buffer = Buffer.from(result.base64, 'base64');

          await supabase.storage
            .from('brand-assets')
            .upload(filePath, buffer, { contentType: 'image/png', upsert: true });

          const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(filePath);

          return { slide_number: slide.slide_number, url: urlData.publicUrl };
        })
      );

      slideImages = imageResults
        .filter((r): r is PromiseFulfilledResult<{ slide_number: number; url: string }> => r.status === 'fulfilled')
        .map((r) => r.value);
    }

    // Merge images into slides
    const enrichedSlides = carouselData.slides.map((slide) => {
      const img = slideImages.find((si) => si?.slide_number === slide.slide_number);
      return {
        ...slide,
        background_image: img?.url || null,
      };
    });

    return NextResponse.json({
      title: carouselData.title,
      slides: enrichedSlides,
      caption: carouselData.caption,
      hashtags: carouselData.hashtags,
      slide_count: enrichedSlides.length,
      brand_colors: brandColors,
    });
  } catch (error: any) {
    console.error('Carousel generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate carousel' },
      { status: 500 }
    );
  }
}
