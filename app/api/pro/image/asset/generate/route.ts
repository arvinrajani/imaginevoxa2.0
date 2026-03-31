import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { generateImageBase } from '@/lib/ai/openai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { brandId, type, prompt, brandColors, brandName, toneGuidelines, allowedImageStyles } = body;

    // type: 'logo' | 'background' | 'pattern' | 'icon'

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const devUserId = process.env.DEV_USER_ID?.trim();
    const allowDevFallback = process.env.NODE_ENV !== 'production' && Boolean(devUserId);
    const actingUserId = user?.id || (allowDevFallback ? devUserId : undefined);

    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client (service role, bypasses RLS) when cookie auth is unavailable
    // Always use admin client â€” avoids RLS recursion on brand_members
    const db = createAdminClient();

    const colorPalette = brandColors?.length 
      ? `Brand color palette: ${brandColors.join(', ')}. Use these exact colors prominently.` 
      : '';

    const toneContext = toneGuidelines?.length
      ? `Brand tone: ${toneGuidelines.join(', ')}. The visual should reflect this mood and personality.`
      : '';

    const styleContext = allowedImageStyles?.length
      ? `Visual style direction: ${allowedImageStyles.join(', ')}.`
      : '';

    const brandContext = [colorPalette, toneContext, styleContext].filter(Boolean).join(' ');

    const prompts: Record<string, string> = {
      logo: `You are a world-class brand identity designer. Design a stunning, iconic logo for "${brandName || 'Brand'}".

${brandContext}

DESIGN BRIEF:
- Create a single, memorable logo mark that works at any size (favicon to billboard).
- Modern, sophisticated, and timeless â€” think Nike swoosh, Apple logo, or Airbnb symbol level of simplicity and recognition.
- The logo should feel premium and trustworthy.
- Use clean geometric forms, balanced proportions, and intentional negative space.
- Transparent or white background. NO text, NO taglines â€” just the symbol.
- The design should be immediately recognizable and unique.
${prompt ? `\nAdditional direction: ${prompt}` : ''}

ABSOLUTELY AVOID: Generic clipart, overly complex designs, gradients that won't work in single-color, text/lettering.`,

      background: `You are an award-winning creative director at a top design agency. Create a stunning, scroll-stopping image for a LinkedIn post.

${brandContext}
${brandName ? `Brand: "${brandName}".` : ''}
Topic: ${prompt || 'Professional business visual'}

CREATIVE DIRECTION:
- This must look like it was produced by a Fortune 500 marketing team with a $50K creative budget.
- Use one of these approaches: professional photography with dramatic lighting, high-end 3D renders with realistic materials, or cinematic illustration.
- Include conceptual visual metaphors that make the viewer pause and think.
- Strong composition: rule of thirds, leading lines, depth of field, or dynamic symmetry.
- Premium color grading â€” think movie poster or luxury brand campaign.
- The image should dominate a LinkedIn feed and earn clicks.

TECHNICAL QUALITY:
- Ultra-sharp, 4K-quality rendering
- Professional color correction and grading
- Realistic lighting and shadows
- Clean, uncluttered composition with clear focal point

ABSOLUTELY AVOID: Abstract geometric shapes, generic stock photos, clip art, cartoon style, blurry/grainy output, busy/cluttered compositions.`,

      pattern: `You are a textile and surface pattern designer. Create a sophisticated, seamless repeating pattern.

${brandContext}

DESIGN BRIEF:
- Elegant, refined pattern suitable for premium brand backgrounds and overlays.
- Should tile perfectly in all directions with no visible seams.
- Subtle enough to work as a background but interesting enough to add visual texture.
- Think luxury packaging, premium stationery, or high-end website backgrounds.
- NO text, NO logos â€” purely decorative pattern.
${prompt ? `\nAdditional direction: ${prompt}` : ''}`,

      icon: `You are a UI/UX icon designer. Create a clean, professional icon/symbol.

${brandContext}

DESIGN BRIEF:
- Simple, pixel-perfect icon that works at small sizes (32px to 256px).
- Flat design with clean geometric lines and consistent stroke width.
- Single color (or two-tone max) â€” must work in monochrome.
- Transparent background â€” suitable for watermarks, UI elements, and brand stamps.
- Think Material Design or SF Symbols level of precision and clarity.
${prompt ? `\nAdditional direction: ${prompt}` : ''}`,
    };

    const assetType = type || 'background';
    const imagePrompt = prompts[assetType] || prompts.background;
    
    const size = assetType === 'logo' || assetType === 'icon' 
      ? '1024x1024' 
      : '1536x1024';

    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';

    const { base64 } = await generateImageBase({
      model,
      prompt: imagePrompt,
      size,
      quality: 'high',
      outputFormat: 'png',
      background: assetType === 'logo' || assetType === 'icon' ? 'transparent' : 'opaque',
    });

    // Upload to Supabase storage
    const buffer = Buffer.from(base64, 'base64');
    const fileName = `${brandId || actingUserId}/${assetType}-${Date.now()}.png`;
    let publicUrl: string | null = null;
    let storagePath: string | null = null;
    let storageBucket: string | null = null;

    const { error: uploadError } = await db.storage
      .from('brand-assets')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      // If bucket doesn't exist, try the images bucket
      const { error: fallbackError } = await db.storage
        .from('images')
        .upload(fileName, buffer, {
          contentType: 'image/png',
          upsert: false,
        });

      if (fallbackError) {
        publicUrl = `data:image/png;base64,${base64}`;
      } else {
        const { data } = db.storage
          .from('images')
          .getPublicUrl(fileName);
        publicUrl = data.publicUrl;
        storagePath = fileName;
        storageBucket = 'images';
      }
    } else {
      const { data } = db.storage
        .from('brand-assets')
        .getPublicUrl(fileName);
      publicUrl = data.publicUrl;
      storagePath = fileName;
      storageBucket = 'brand-assets';
    }

    const finalUrl = publicUrl || `data:image/png;base64,${base64}`;

    // Save to image_assets table if brand
    let insertedAssetId: string | null = null;
    if (brandId) {
      try {
        const dbAssetType = assetType === 'logo' ? 'logo' : 'reference';
        const width = assetType === 'logo' || assetType === 'icon' ? 1024 : 1536;
        const height = 1024;
        const { data: asset } = await db
          .from('image_assets')
          .insert({
          brand_id: brandId,
          created_by: actingUserId,
          asset_type: dbAssetType,
          source: 'ai',
          file_url: finalUrl,
          width,
          height,
          metadata: {
            storage_path: storagePath,
            storage_bucket: storageBucket,
            format: 'png',
            tags: [assetType, 'ai-generated'],
            requested_type: assetType,
            prompt: imagePrompt,
            model,
          },
        })
          .select('id')
          .single();
        insertedAssetId = asset?.id || null;
      } catch {
        // Table might not exist or schema may differ, silently continue
      }
    }

    return NextResponse.json({
      url: finalUrl,
      file_url: finalUrl,
      asset_id: insertedAssetId,
      assetId: insertedAssetId,
      assetType,
      generated: true,
      storagePath,
    });
  } catch (error: any) {
    console.error('Asset generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate asset' },
      { status: 500 }
    );
  }
}