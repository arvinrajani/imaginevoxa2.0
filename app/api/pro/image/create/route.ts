import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { generateImageBase } from '@/lib/ai/openai';
import sharp from 'sharp';

type CreateImageRequest = {
  brandId?: string;
  brandName?: string;
  brandColors?: string[];
  headline?: string;
  tagline?: string;
  tone?: string;
  style?: string;
  logoUrl?: string;
  logoPlacement?: 'overlay' | 'infuse' | 'none';
  postText?: string;
  customPrompt?: string;
  generationNonce?: number;
  imageAspect?: 'landscape' | 'square' | 'portrait';
};

type ParsedSize = {
  width: number;
  height: number;
};

function parseSize(value: string): ParsedSize {
  const [w, h] = value.split('x').map((item) => Number(item));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 1536, height: 1024 };
  }
  return { width: Math.round(w), height: Math.round(h) };
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function resolveLogoUrl(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;

  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      return item.trim();
    }

    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;

    const directUrl = asTrimmedString(row.url);
    if (directUrl) return directUrl;

    const fileUrl = asTrimmedString(row.file_url);
    if (fileUrl) return fileUrl;

    const publicUrl = asTrimmedString(row.publicUrl);
    if (publicUrl) return publicUrl;
  }

  return null;
}

function deriveWordingFromPost(postText?: string) {
  if (!postText) {
    return { headline: '', tagline: '' };
  }

  const lines = postText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const firstLine = lines[0] || '';
  const secondLine = lines.find((line, index) => index > 0 && line.length > 10) || '';

  const clean = (text: string) =>
    text
      .replace(/^[-*\d.)\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();

  return {
    headline: clean(firstLine).slice(0, 80),
    tagline: clean(secondLine).slice(0, 120),
  };
}

function deriveSceneBrief(options: {
  brandName?: string;
  headline?: string;
  postText?: string;
}) {
  const raw = `${options.headline || ''} ${options.postText || ''}`.toLowerCase();

  const sceneByKeyword: Array<{ keywords: string[]; scene: string }> = [
    {
      keywords: ['energy', 'power', 'distribution', 'utility', 'grid', 'solar', 'industrial'],
      scene:
        'A realistic business-energy scene with infrastructure context: professionals reviewing live distribution dashboards and modern industrial assets in the background.',
    },
    {
      keywords: ['saas', 'software', 'platform', 'product', 'ai', 'automation', 'data', 'analytics'],
      scene:
        'A realistic tech workspace scene: professionals collaborating around analytics screens, product UI context, clear subject depth, and modern office detail.',
    },
    {
      keywords: ['finance', 'bank', 'invest', 'fintech', 'wealth', 'capital'],
      scene:
        'A realistic finance business scene: executive discussion with clear financial dashboard visuals and premium corporate environment.',
    },
    {
      keywords: ['health', 'medical', 'clinic', 'hospital', 'care', 'wellness'],
      scene:
        'A realistic healthcare innovation scene: professionals in a clean clinical environment with modern devices and trust-focused composition.',
    },
    {
      keywords: ['logistics', 'supply', 'warehouse', 'shipping', 'transport'],
      scene:
        'A realistic logistics operations scene: organized warehouse or shipping workflow with strong leading lines and clear operational subject.',
    },
    {
      keywords: ['education', 'learning', 'course', 'training', 'students'],
      scene:
        'A realistic professional learning scene: presenter/instructor and learners with clear visual aids and focused collaboration.',
    },
  ];

  const matched =
    sceneByKeyword.find((entry) => entry.keywords.some((keyword) => raw.includes(keyword)))?.scene ||
    'A realistic professional business scene with a clear subject, purposeful environment context, and strong visual depth.';

  return `${matched} Keep the scene concrete and identifiable, never abstract-only. ${options.brandName ? `Reflect ${options.brandName} brand personality.` : ''}`.trim();
}

function buildVariationDirective(nonce: number) {
  const recipes = [
    'Use a left-weighted composition with primary focal point on the left third and supporting shapes on the right.',
    'Use a right-weighted composition with text hierarchy anchored to the right and visuals balancing on the left.',
    'Use a centered hero composition with layered depth and subtle foreground/background separation.',
    'Use a diagonal flow composition from top-left to bottom-right to create motion and energy.',
    'Use a framed card composition with strong border contrast and clear inner content zone.',
    'Use a split-grid composition with asymmetrical proportions and visual rhythm.',
  ];

  const recipe = recipes[Math.abs(nonce) % recipes.length];
  return `Variation directive (attempt ${nonce}): ${recipe} Avoid repeating previous layout, camera angle, and background treatment.`;
}

function decodeDataUriToBuffer(dataUri: string): Buffer | null {
  const match = dataUri.match(/^data:([^;,]+)?((?:;[^,]*)*?),(.*)$/s);
  if (!match) return null;

  const meta = match[2] || '';
  const payload = match[3] || '';

  try {
    if (meta.includes(';base64')) {
      return Buffer.from(payload, 'base64');
    }
    return Buffer.from(decodeURIComponent(payload), 'utf8');
  } catch {
    return null;
  }
}

async function resolveImageBufferFromSource(source: string): Promise<Buffer | null> {
  const trimmed = source.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    return decodeDataUriToBuffer(trimmed);
  }

  try {
    const response = await fetch(trimmed);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function uploadToAvailableBucket(options: {
  db: ReturnType<typeof createAdminClient>;
  fileName: string;
  data: Buffer;
  contentType: string;
}) {
  const { db, fileName, data, contentType } = options;
  const buckets = ['brand-assets', 'images'];

  for (const bucket of buckets) {
    const { error: uploadError } = await db.storage
      .from(bucket)
      .upload(fileName, data, { contentType, upsert: false });

    if (!uploadError) {
      const { data: publicUrlData } = db.storage.from(bucket).getPublicUrl(fileName);
      return publicUrlData.publicUrl;
    }
  }

  return null;
}

/**
 * POST /api/pro/image/create
 *
 * Focused image-creation endpoint for the Image Creator step.
 * Guarantees logo placement when a logo exists and aligns visuals with generated post text.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateImageRequest;

    const brandId = body.brandId?.trim() || '';
    const brandName = body.brandName?.trim() || '';
    const brandColors = Array.isArray(body.brandColors) ? body.brandColors.filter(Boolean) : [];
    const tone = body.tone?.trim() || 'professional';
    const style = body.style?.trim() || 'text-overlay';
    const providedLogoUrl = body.logoUrl?.trim() || '';
    const customPrompt = body.customPrompt?.trim() || '';
    const postText = body.postText?.trim() || '';
    const logoPlacement = (['overlay', 'infuse', 'none'].includes(body.logoPlacement || '') ? body.logoPlacement : 'overlay') as 'overlay' | 'infuse' | 'none';
    const imageAspect = (['landscape', 'square', 'portrait'].includes(body.imageAspect || '') ? body.imageAspect : 'landscape') as 'landscape' | 'square' | 'portrait';
    const generationNonce = Number.isFinite(body.generationNonce)
      ? Math.max(1, Math.floor(body.generationNonce as number))
      : 1;

    const derived = deriveWordingFromPost(postText);
    const displayHeadline = (body.headline?.trim() || derived.headline || '').slice(0, 80);
    const displayTagline = (body.tagline?.trim() || derived.tagline || '').slice(0, 120);

    if (!postText) {
      return NextResponse.json(
        { error: 'Post context is required. Confirm a post in Step 1 before generating an image.' },
        { status: 400 }
      );
    }

    // Auth
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const devUserId = process.env.DEV_USER_ID?.trim();
    const allowDevFallback = process.env.NODE_ENV !== 'production' && Boolean(devUserId);
    const actingUserId = user?.id || (allowDevFallback ? devUserId : undefined);

    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createAdminClient();

    let brandKitLogoUrl: string | null = null;
    if (brandId) {
      const { data: latestKit } = await db
        .from('brand_kits')
        .select('logo_assets')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      brandKitLogoUrl = resolveLogoUrl(latestKit?.logo_assets);

      if (!brandKitLogoUrl) {
        const { data: latestLogoAsset } = await db
          .from('image_assets')
          .select('file_url')
          .eq('brand_id', brandId)
          .eq('asset_type', 'logo')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        brandKitLogoUrl = asTrimmedString(latestLogoAsset?.file_url);
      }
    }

    const effectiveLogoUrl = providedLogoUrl || brandKitLogoUrl || '';
    const hasLogo = Boolean(effectiveLogoUrl);
    const shouldInfuseLogo = logoPlacement === 'infuse' && hasLogo;
    const shouldOverlayLogo = logoPlacement === 'overlay' && hasLogo;

    if (logoPlacement !== 'none' && !hasLogo) {
      return NextResponse.json(
        { error: 'Logo placement was requested, but no logo was found. Upload a logo first.' },
        { status: 400 }
      );
    }

    // Determine render size from aspect ratio
    const sizeMap: Record<string, string> = {
      landscape: '1536x1024',
      square: '1024x1024',
      portrait: '1024x1536',
    };
    const dimensionMap: Record<string, string> = {
      landscape: '1200x628 landscape feed',
      square: '1080x1080 square',
      portrait: '1080x1350 portrait',
    };

    const colorDirective = brandColors.length
      ? `Brand color palette: ${brandColors.join(', ')}. Weave these colors throughout the image backgrounds, accent blocks, gradients, and visual elements.`
      : '';

    const toneMap: Record<string, string> = {
      professional:
        'Clean corporate aesthetic. Navy and dark tones, sophisticated typography, executive feel.',
      bold:
        'High-impact and attention-grabbing. Strong contrast, large text hierarchy, vibrant accents.',
      creative:
        'Artistic and expressive. Unexpected compositions and visual flair while remaining readable.',
      minimal:
        'Ultra-clean with generous whitespace. Refined and elegant, minimal distractions.',
      warm:
        'Warm and approachable. Soft gradients, human-centered composition, friendly visual mood.',
      tech:
        'Futuristic and digital. Structured geometry, modern depth, data-inspired visuals.',
      luxury:
        'Premium and exclusive. High-contrast polish, subtle texture, elevated visual language.',
    };

    const toneDirection = toneMap[tone] || toneMap.professional;

    const styleMap: Record<string, string> = {
      'text-overlay':
        'Design a strong text-safe hero composition with clear negative space for editable overlays and crisp, in-focus visual detail.',
      'photo-blend':
        'Use a concrete, high-detail, in-focus professional photo scene with a visible subject and clean high-contrast text-safe space. No soft-focus blur, no haze, and no abstract blurred wash.',
      'abstract-brand':
        'Use abstract branded gradients and shapes as the main background with clean overlay zones and sharp edges.',
      'split-layout':
        'Use a sharp split composition: one side realistic, concrete visual scene with a clear subject, one side reserved text-safe zone. No abstract blur wash.',
      infographic:
        'Create an infographic-like layout with modular blocks and one clear text-safe card area. Use crisp icons and high contrast.',
      cinematic:
        'Use dramatic lighting and cinematic composition with controlled contrast for later text overlays, while keeping details sharp.',
    };

    const styleDirection = styleMap[style] || styleMap['text-overlay'];
    const semanticAnchor =
      displayHeadline || postText.replace(/\s+/g, ' ').trim().slice(0, 220) || brandName || 'professional business growth';
    const sceneBrief = deriveSceneBrief({
      brandName,
      headline: displayHeadline,
      postText,
    });

    const postContext = postText.replace(/\s+/g, ' ').trim().slice(0, 1200);
    const variationDirective = buildVariationDirective(generationNonce);
    const variationSalt = `${generationNonce}-${Date.now().toString(36).slice(-6)}`;

    const imagePrompt = `
You are a world-class graphic designer specializing in LinkedIn visual content. Create a scroll-stopping, professionally designed image.

DIMENSIONS: ${dimensionMap[imageAspect] || dimensionMap.landscape} format.

${customPrompt ? `PRIMARY CREATIVE DIRECTION FROM USER:
"${customPrompt}"
This is the most important instruction - follow it closely while maintaining quality.\n` : ''}
POST CONTEXT:
${postContext || 'Use the provided headline and tagline as the post message.'}

MESSAGE FOCUS (semantic guidance only, never rendered as text):
${displayHeadline ? `- Headline concept: ${displayHeadline}` : ''}
${displayTagline ? `- Subtitle concept: ${displayTagline}` : ''}
SUBJECT ANCHOR:
- The visual must clearly relate to: "${semanticAnchor}"

SCENE BRIEF (MANDATORY):
- ${sceneBrief}
- Include at least one clear focal subject plus one supporting contextual element tied to the post topic.
- No gradient-only or abstract-only outputs unless style is "abstract-brand".

${shouldInfuseLogo ? `LOGO INTEGRATION (CRITICAL):
- The brand has a logo. Design the image with a prominent, intentional space for a logo mark.
- Create a clean logo-friendly zone (top-left corner, or centered-top, or bottom-right) with a subtle contrasting background area (e.g., a white or semi-transparent rounded rectangle, badge, or clean negative space).
- The logo zone should feel DESIGNED-IN, not pasted on - like the logo is a natural part of the composition.
- Leave this zone clean and uncluttered so the logo can be composited onto it cleanly after generation.
- Brand name: "${brandName || 'Brand'}"
` : ''}
${shouldOverlayLogo ? 'Do NOT draw a logo in the AI generation. Logo will be composited as an overlay after generation. Leave one clean, uncluttered logo-safe zone with subtle contrast.' : ''}
${logoPlacement === 'none' ? 'No logo needed in this image.' : ''}

EDITOR-FIRST COMPOSITION RULES:
- Do NOT render readable words, letters, sentences, logos, or numbers directly in the generated image. No glyphs, no pseudo-text, no typographic artifacts.
- Create clean text-safe zones with strong contrast so editable text can be added in the editor.
- Keep visual hierarchy obvious using shapes, depth, and spacing instead of baked typography. Keep all key visual elements inside an 85% central safe-area so LinkedIn crops stay balanced.

VISUAL STYLE: ${styleDirection}
TONE: ${toneDirection}

${style === 'photo-blend' ? `PHOTO-BLEND HARD RULES:
- Must look like a sharp real scene, not a blurred texture wash.
- Subject edges and textures must remain readable at LinkedIn feed size.
- Use realistic lighting and depth, but keep the frame in focus.
` : ''}

${brandName ? `BRAND: "${brandName}". Reflect this brand\'s identity in the design.` : ''}
${colorDirective}

COLOR FIDELITY (IMPORTANT):
- Make brand colors visibly present in major elements and accents.
- Use at least two of the provided brand colors in clearly noticeable areas.
- Do not replace the palette with unrelated random colors.

${variationDirective}
UNIQUE VARIATION TOKEN: ${variationSalt}

QUALITY REQUIREMENTS:
- Ultra-professional, modern, premium quality
- Clean visual hierarchy with intentional whitespace
- Immediately eye-catching in a LinkedIn feed
- Should look like it was designed by a top creative agency
- No stock photo feel - every element should feel intentional. Image must be crisp and sharp (no blur, no haze, no low-detail mush)

AVOID:
- Blurry or low-quality visuals
- Garbled, misspelled, or unreadable text
- Watermarks or placeholder artifacts
- Overly cluttered compositions
- Generic clip-art style elements
- Soft-focus backgrounds, intentional gaussian blur, or foggy haze that makes the image look out of focus
- Large abstract blur blobs that hide detail
`.trim();

    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
    const renderSize = sizeMap[imageAspect] || sizeMap.landscape;
    const render = parseSize(renderSize);

    let base64: string;
    let generationPass = 1;

    const firstPass = await generateImageBase({
      model,
      prompt: imagePrompt,
      size: renderSize,
      quality: 'high',
      outputFormat: 'png',
      background: 'opaque',
    });

    base64 = firstPass.base64;

    // Guardrail: if the output is too low-detail/compressed for photo-led layouts,
    // retry once with an explicit sharpness override.
    const baseLowDetailThreshold =
      renderSize === '1536x1024' ? 1000000 : renderSize === '1024x1536' ? 850000 : 650000;
    const lowDetailThreshold =
      style === 'photo-blend'
        ? Math.round(baseLowDetailThreshold * 1.12)
        : baseLowDetailThreshold;
    const shouldRetryForDetail =
      style === 'photo-blend' ||
      ((style === 'split-layout' || style === 'cinematic') && base64.length < lowDetailThreshold);

    if (shouldRetryForDetail) {
      const sharpnessOverridePrompt = `${imagePrompt}

CLARITY OVERRIDE (MANDATORY):
- Produce a crisp, high-detail, in-focus image.
- No blur, no haze, no soft-focus treatment.
- Prioritize edge clarity, texture detail, and subject separation.
- Do not return abstract blur fields; return a concrete, identifiable visual scene tied to the subject anchor.
`.trim();

      const secondPass = await generateImageBase({
        model,
        prompt: sharpnessOverridePrompt,
        size: renderSize,
        quality: 'high',
        outputFormat: 'png',
        background: 'opaque',
      });

      if (secondPass.base64.length > base64.length) {
        base64 = secondPass.base64;
      }
      generationPass = 2;
    }

    // Final guard for photo-blend: if output still looks low-detail by payload size,
    // fallback to a cleaner split-layout composition that tends to be sharper.
    if (style === 'photo-blend' && base64.length < lowDetailThreshold) {
      const fallbackPrompt = imagePrompt
        .replace(
          `VISUAL STYLE: ${styleDirection}`,
          `VISUAL STYLE: ${styleMap['split-layout']}`
        )
        .concat(
          `\nFALLBACK STYLE OVERRIDE (MANDATORY): Use a sharp split-layout with a clearly defined subject area and a separate clean text-safe area.`
        );

      const fallbackPass = await generateImageBase({
        model,
        prompt: fallbackPrompt,
        size: renderSize,
        quality: 'high',
        outputFormat: 'png',
        background: 'opaque',
      });

      if (fallbackPass.base64.length >= base64.length) {
        base64 = fallbackPass.base64;
      }
      generationPass = 3;
    }

    // Final safety fallback: if still too low-detail, force a concrete non-abstract composition.
    if (
      (style === 'photo-blend' || style === 'split-layout' || style === 'cinematic') &&
      base64.length < baseLowDetailThreshold
    ) {
      const hardFallbackPrompt = `
${imagePrompt}

FINAL QUALITY FALLBACK (MANDATORY):
- Generate a concrete, realistic, high-detail professional scene.
- No blurred background wash. No abstract blob fields.
- Keep one clear subject in focus and one supporting contextual element.
- Prioritize sharpness, detail, and legibility at social-feed size.
`.trim();

      const hardFallbackPass = await generateImageBase({
        model,
        prompt: hardFallbackPrompt,
        size: renderSize,
        quality: 'high',
        outputFormat: 'png',
        background: 'opaque',
      });

      if (hardFallbackPass.base64.length >= base64.length) {
        base64 = hardFallbackPass.base64;
      }
      generationPass = 4;
    }

    const generatedAt = Date.now();
    const folder = `${brandId || actingUserId}`;

    const basePngBuffer = Buffer.from(base64, 'base64');
    const baseFileName = `${folder}/linkedin-image-${generatedAt}.png`;

    const basePublicUrl = await uploadToAvailableBucket({
      db,
      fileName: baseFileName,
      data: basePngBuffer,
      contentType: 'image/png',
    });

    const baseUrl = basePublicUrl || `data:image/png;base64,${base64}`;

    let finalUrl = baseUrl;
    let logoApplied = false;

    if (shouldOverlayLogo || shouldInfuseLogo) {
      const logoBuffer = await resolveImageBufferFromSource(effectiveLogoUrl);

      if (logoBuffer) {
        const composedFileName = `${folder}/linkedin-image-${generatedAt}-logo.png`;
        let composedPngBuffer: Buffer;

        if (shouldOverlayLogo) {
          const pad = Math.max(12, Math.round(render.width * 0.025));
          const logoW = Math.round(render.width * 0.15);
          const logoH = Math.round(render.height * 0.15);
          const x = render.width - logoW - pad;
          const y = pad;

          const bgPad = Math.max(8, Math.round(render.width * 0.008));
          const bgX = x - bgPad;
          const bgY = y - bgPad;
          const bgW = logoW + bgPad * 2;
          const bgH = logoH + bgPad * 2;
          const bgRadius = Math.max(10, Math.round(bgH * 0.2));

          const logoCardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bgW}" height="${bgH}" viewBox="0 0 ${bgW} ${bgH}">
  <rect width="${bgW}" height="${bgH}" rx="${bgRadius}" fill="rgba(255,255,255,0.92)" />
</svg>`;

          const logoCardPngBuffer = await sharp(Buffer.from(logoCardSvg)).png().toBuffer();
          const resizedLogoBuffer = await sharp(logoBuffer)
            .resize({ width: logoW, height: logoH, fit: 'contain', withoutEnlargement: true })
            .png()
            .toBuffer();

          composedPngBuffer = await sharp(basePngBuffer)
            .composite([
              { input: logoCardPngBuffer, top: bgY, left: bgX },
              { input: resizedLogoBuffer, top: y, left: x },
            ])
            .png()
            .toBuffer();
        } else {
          // Infuse mode: blend logo softly into the image, without a sticker card.
          const pad = Math.max(16, Math.round(render.width * 0.03));
          const logoW = Math.round(render.width * 0.18);
          const logoH = Math.round(render.height * 0.18);
          const x = render.width - logoW - pad;
          const y = render.height - logoH - pad;

          const resizedLogoBuffer = await sharp(logoBuffer)
            .resize({ width: logoW, height: logoH, fit: 'contain', withoutEnlargement: true })
            .png()
            .toBuffer();

          const infusedLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${logoW}" height="${logoH}" viewBox="0 0 ${logoW} ${logoH}">
  <image href="data:image/png;base64,${resizedLogoBuffer.toString('base64')}" x="0" y="0" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" opacity="0.32" />
</svg>`;
          const infusedLogoPng = await sharp(Buffer.from(infusedLogoSvg)).png().toBuffer();

          composedPngBuffer = await sharp(basePngBuffer)
            .composite([{ input: infusedLogoPng, top: y, left: x }])
            .png()
            .toBuffer();
        }

        const composedPublicUrl = await uploadToAvailableBucket({
          db,
          fileName: composedFileName,
          data: composedPngBuffer,
          contentType: 'image/png',
        });

        finalUrl = composedPublicUrl || `data:image/png;base64,${composedPngBuffer.toString('base64')}`;
        logoApplied = true;
      }
    }

    let assetId: string | null = null;

    if (brandId) {
      try {
        const { data: asset } = await db
          .from('image_assets')
          .insert({
            brand_id: brandId,
            created_by: actingUserId,
            asset_type: logoApplied ? 'composed' : 'base',
            source: 'ai',
            file_url: finalUrl,
            width: render.width,
            height: render.height,
            metadata: {
              headline: displayHeadline,
              tagline: displayTagline,
              tone,
              style,
              model,
              type: 'linkedin-image-creator',
              logo_applied: logoApplied,
              logo_placement: logoPlacement,
              logo_source: providedLogoUrl ? 'uploaded' : brandKitLogoUrl ? 'brand-kit' : 'none',
              logo_url_used: effectiveLogoUrl || null,
              base_image_url: baseUrl,
              generation_nonce: generationNonce,
              generation_pass: generationPass,
              variation_directive: variationDirective,
              variation_salt: variationSalt,
              post_context_excerpt: postContext || null,
            },
          })
          .select('id')
          .single();

        assetId = asset?.id || null;
      } catch {
        // Non-blocking persistence failure
      }
    }

    return NextResponse.json({
      url: finalUrl,
      baseUrl,
      assetId,
      logoApplied,
      logoUrlUsed: effectiveLogoUrl || null,
      generationNonceUsed: generationNonce,
      generated: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Image creation failed';
    console.error('Image creation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
