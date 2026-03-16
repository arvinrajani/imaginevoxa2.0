import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { generateImageBase, generateImageEdit } from '@/lib/ai/openai';
import sharp from 'sharp';

type CreateImageRequest = {
  brandId?: string;
  brandName?: string;
  productName?: string;
  brandColors?: string[];
  headline?: string;
  tagline?: string;
  tone?: string;
  style?: string;
  logoUrl?: string;
  logoPlacement?: 'overlay' | 'infuse' | 'none';
  postText?: string;
  postImagePrompt?: string;
  customPrompt?: string;
  generationNonce?: number;
  imageAspect?: 'landscape' | 'square' | 'portrait';
  referenceImageUrl?: string;
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

function asObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asStringList(value: unknown, max = 10): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function mergeDistinctStrings(...values: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const list of values) {
    if (!Array.isArray(list)) continue;

    for (const item of list) {
      const normalized = typeof item === 'string' ? item.trim() : '';
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      merged.push(normalized);
    }
  }

  return merged;
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
  productName?: string;
  headline?: string;
  postText?: string;
  postImagePrompt?: string;
}) {
  const raw = `${options.productName || ''} ${options.headline || ''} ${options.postImagePrompt || ''} ${options.postText || ''}`.toLowerCase();

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

  return `${matched} Keep the scene concrete and identifiable, never abstract-only. ${options.brandName ? `Reflect ${options.brandName} brand personality.` : ''} ${options.productName ? `Highlight product context: ${options.productName}.` : ''}`.trim();
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
    const requestedBrandName = body.brandName?.trim() || '';
    const productName = body.productName?.trim() || '';
    const requestedBrandColors = Array.isArray(body.brandColors) ? body.brandColors.filter(Boolean) : [];
    const tone = body.tone?.trim() || 'professional';
    const style = body.style?.trim() || 'text-overlay';
    const providedLogoUrl = body.logoUrl?.trim() || '';
    const customPrompt = body.customPrompt?.trim() || '';
    const postText = body.postText?.trim() || '';
    const postImagePrompt = body.postImagePrompt?.trim() || '';
    const logoPlacement = (['overlay', 'infuse', 'none'].includes(body.logoPlacement || '') ? body.logoPlacement : 'overlay') as 'overlay' | 'infuse' | 'none';
    const imageAspect = (['landscape', 'square', 'portrait'].includes(body.imageAspect || '') ? body.imageAspect : 'landscape') as 'landscape' | 'square' | 'portrait';
    const generationNonce = Number.isFinite(body.generationNonce)
      ? Math.max(1, Math.floor(body.generationNonce as number))
      : 1;
    const referenceImageUrl = body.referenceImageUrl?.trim() || '';

    const derived = deriveWordingFromPost(postText);
    const displayHeadline = (body.headline?.trim() || derived.headline || '').slice(0, 80);

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

    let brandRow:
      | {
          name?: string | null;
          description?: string | null;
          website?: string | null;
          industry?: string | null;
        }
      | null = null;
    let brandKitLogoUrl: string | null = null;
    let analyzedBrandColors: string[] = [];
    let marketingDnaContext:
      | {
          tone: string | null;
          imageStyle: string | null;
          postTypes: string[];
          ctaStyle: string | null;
          visualDensity: string | null;
          tagline: string | null;
          brandName: string | null;
          brandDescription: string | null;
          targetAudience: string | null;
          businessFocus: string | null;
          keyOfferings: string[];
          contentPillars: string[];
          website: string | null;
        }
      | null = null;

    if (brandId) {
      const [brandRes, latestKitRes, latestDnaRes] = await Promise.all([
        db
          .from('brands')
          .select('name, description, website, industry')
          .eq('id', brandId)
          .maybeSingle(),
        db
          .from('brand_kits')
          .select('logo_assets')
          .eq('brand_id', brandId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from('marketing_dna')
          .select('tone, image_style, post_types, cta_style, visual_density, primary_colors, accent_colors, evidence, created_at')
          .eq('brand_id', brandId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      brandRow = brandRes.data || null;
      brandKitLogoUrl = resolveLogoUrl(latestKitRes.data?.logo_assets);

      const marketingDna = latestDnaRes.data || null;
      const marketingDnaEvidence = asObjectRecord(marketingDna?.evidence);

      if (marketingDna) {
        marketingDnaContext = {
          tone: asTrimmedString(marketingDna.tone),
          imageStyle: asTrimmedString(marketingDna.image_style),
          postTypes: asStringList(marketingDna.post_types),
          ctaStyle: asTrimmedString(marketingDna.cta_style),
          visualDensity: asTrimmedString(marketingDna.visual_density),
          tagline: asTrimmedString(marketingDnaEvidence.tagline),
          brandName: asTrimmedString(marketingDnaEvidence.brand_name),
          brandDescription: asTrimmedString(marketingDnaEvidence.brand_description),
          targetAudience: asTrimmedString(marketingDnaEvidence.target_audience),
          businessFocus: asTrimmedString(marketingDnaEvidence.business_focus),
          keyOfferings: asStringList(marketingDnaEvidence.key_offerings),
          contentPillars: asStringList(marketingDnaEvidence.content_pillars),
          website: asTrimmedString(marketingDnaEvidence.website) || asTrimmedString(brandRow?.website),
        };

        analyzedBrandColors = mergeDistinctStrings(
          asStringList(marketingDna.primary_colors),
          asStringList(marketingDna.accent_colors),
          asStringList(marketingDnaEvidence.primary_colors),
          asStringList(marketingDnaEvidence.accent_colors)
        );
      }

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

    const effectiveBrandName =
      requestedBrandName ||
      marketingDnaContext?.brandName ||
      asTrimmedString(brandRow?.name) ||
      '';
    const effectiveBrandColors = requestedBrandColors.length
      ? requestedBrandColors
      : analyzedBrandColors;
    const analyzedTagline = marketingDnaContext?.tagline || '';
    const displayTagline = (body.tagline?.trim() || derived.tagline || analyzedTagline).slice(0, 120);
    const analyzedContextLines = [
      marketingDnaContext?.brandDescription ? `- Brand summary: ${marketingDnaContext.brandDescription}` : null,
      marketingDnaContext?.businessFocus ? `- Business focus: ${marketingDnaContext.businessFocus}` : null,
      marketingDnaContext?.targetAudience ? `- Target audience: ${marketingDnaContext.targetAudience}` : null,
      marketingDnaContext?.tagline ? `- Tagline: ${marketingDnaContext.tagline}` : null,
      marketingDnaContext?.tone ? `- Analyzed tone: ${marketingDnaContext.tone}` : null,
      marketingDnaContext?.imageStyle ? `- Preferred image style: ${marketingDnaContext.imageStyle}` : null,
      marketingDnaContext?.visualDensity ? `- Visual density: ${marketingDnaContext.visualDensity}` : null,
      marketingDnaContext?.ctaStyle ? `- CTA style: ${marketingDnaContext.ctaStyle}` : null,
      marketingDnaContext?.postTypes.length ? `- Common post types: ${marketingDnaContext.postTypes.join(', ')}` : null,
      marketingDnaContext?.contentPillars.length ? `- Content pillars: ${marketingDnaContext.contentPillars.join(', ')}` : null,
      marketingDnaContext?.keyOfferings.length ? `- Key offerings: ${marketingDnaContext.keyOfferings.join(', ')}` : null,
      marketingDnaContext?.website ? `- Website: ${marketingDnaContext.website}` : null,
      asTrimmedString(brandRow?.industry) ? `- Industry: ${asTrimmedString(brandRow?.industry)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

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

    const dominantBrandColors = effectiveBrandColors.slice(0, 4);
    const colorDirective = effectiveBrandColors.length
      ? `Brand color palette (hard requirement): ${effectiveBrandColors.join(', ')}. These are the approved brand colors for this image and must be visibly used across the composition.`
      : '';
    const colorPriorityDirective = dominantBrandColors.length
      ? `Primary palette priority: ${dominantBrandColors.join(' -> ')}. Treat these as the hero colors, not optional accents.`
      : '';
    const brandNamingDirective = effectiveBrandName
      ? [
          `BRAND NAMING RULES:`,
          `- Ensure the brand name is visibly present somewhere in the final composition, either through the main headline, brand label, product branding, or the supplied logo.`,
          `- If any visible text, label, badge, product marking, signage, or title appears in the image, use the exact brand name "${effectiveBrandName}".`,
          productName
            ? `- If the product name appears in visible text or on the product itself, use the exact product name "${productName}".`
            : null,
          displayHeadline
            ? `- For layouts with text, the primary visible headline should follow this exact wording: "${displayHeadline}".`
            : null,
          displayTagline
            ? `- Use this supporting line only when it remains large and readable: "${displayTagline}".`
            : null,
          `- Never invent alternate company names, sub-brands, or fake UI/product labels.`,
          `- Never change spelling, punctuation, or capitalization of the brand or product names.`,
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    const toneMap: Record<string, string> = {
      professional:
        'Clean corporate aesthetic with authority. Use disciplined spacing, polished surfaces, structured hierarchy, and executive-level restraint. Think McKinsey presentation meets Apple keynote — minimal but powerful.',
      bold:
        'High-impact and unapologetically attention-grabbing. Use strong contrast, oversized visual hierarchy, and confident motion cues. Think Nike campaign energy — assertive, clear, and modern.',
      creative:
        'Artistic and expressive with unexpected visual surprises. Use dynamic asymmetric compositions, textured layers, and visual storytelling. Think Spotify Wrapped or Airbnb brand imagery, but keep it brand-native.',
      minimal:
        'Ultra-clean with generous whitespace as a design element. Use one focal element, refined spacing, and elegant restraint where less communicates more. Think Muji or Aesop.',
      warm:
        'Warm, human, and approachable. Use inviting lighting, organic shapes, and human-centered composition. Think Mailchimp or Notion brand imagery — friendly and trustworthy.',
      tech:
        'Futuristic and digitally native. Use structured geometry, clean interface-inspired forms, data-visualization rhythm, and precision detailing. Think Stripe or Linear design language without overriding the brand palette.',
      luxury:
        'Premium and exclusive. Use subtle material richness, dramatic lighting, deep contrast, and meticulous finishing. Think Rolex or Porsche — every element should whisper quality.',
    };

    const toneDirection = toneMap[tone] || toneMap.professional;

    const styleMap: Record<string, string> = {
      'text-overlay':
        'Design a striking hero composition where 30-40% of the canvas has clean negative space or a subtle gradient zone specifically reserved for text overlays. The remaining area should have a vivid, in-focus visual scene. Think conference keynote slide meets editorial magazine cover — the text zone should feel intentional, not empty.',
      'photo-blend':
        'Create a photorealistic, editorial-quality scene shot at eye level or slightly elevated angle. The subject must be tack-sharp with visible textures (fabric weave, metal brushing, screen pixels). Include a natural text-safe zone created by depth of field, a wall, sky, or surface — not by artificial blur. Think Bloomberg Businessweek or Fast Company photography.',
      'abstract-brand':
        'Create a bold abstract composition using geometric shapes, flowing gradients, and brand-colored elements as the hero visual. Sharp edges, clean intersections, and intentional negative space for text. Think Stripe or Linear marketing visuals — abstract but structured, modern, and brand-native.',
      'split-layout':
        'Sharp 60/40 or 50/50 split composition: one zone contains a realistic, detailed scene with a clear subject and environment; the other zone is a clean, solid or subtly textured panel reserved for text. The split line should be clean (vertical, diagonal, or curved) and feel designed. No abstract blur wash on either side.',
      infographic:
        'Create a modular, structured layout with distinct visual blocks: a hero data visualization area, icon-driven info panels, and one prominent text-safe card zone. Use crisp flat icons, clean divider lines, and high contrast between sections. Think annual report infographic meets modern dashboard design.',
      cinematic:
        'Dramatic, widescreen cinematic composition with intentional lighting: strong key light creating defined shadows and highlights. Shallow depth of field with the hero subject razor-sharp. Atmospheric elements (subtle haze, volumetric light rays, bokeh) add mood without obscuring detail. Think movie poster or Netflix thumbnail — one frame tells the whole story.',
    };

    const styleDirection = styleMap[style] || styleMap['text-overlay'];
    const postImageAnchor = postImagePrompt.replace(/\s+/g, ' ').trim().slice(0, 220);
    const semanticAnchor =
      productName ||
      postImageAnchor ||
      displayHeadline ||
      marketingDnaContext?.businessFocus ||
      postText.replace(/\s+/g, ' ').trim().slice(0, 220) ||
      effectiveBrandName ||
      'professional business growth';
    const sceneBrief = deriveSceneBrief({
      brandName: effectiveBrandName,
      productName,
      headline: displayHeadline,
      postImagePrompt,
      postText,
    });

    const postContext = postText.replace(/\s+/g, ' ').trim().slice(0, 1200);
    const variationDirective = buildVariationDirective(generationNonce);
    const variationSalt = `${generationNonce}-${Date.now().toString(36).slice(-6)}`;

    const imagePrompt = `
You are an elite creative director and visual designer who has art-directed campaigns for Fortune 500 brands. You specialize in LinkedIn visual content that stops the scroll and drives engagement.

Your mission: create a visually stunning, magazine-quality image that makes the viewer pause, feel something, and engage with the post.

CANVAS: ${dimensionMap[imageAspect] || dimensionMap.landscape} format.

${effectiveBrandName || effectiveBrandColors.length ? `═══════════════════════════════════════════════════
BRAND IDENTITY — #1 PRIORITY (READ THIS FIRST)
═══════════════════════════════════════════════════
${effectiveBrandName ? `BRAND: "${effectiveBrandName}"
- The brand name "${effectiveBrandName}" MUST appear as clearly readable text somewhere in the final image.
- Place it in a high-contrast area so it is legible at LinkedIn feed size (552px wide).
- Use it exactly as written — never invent alternate names, sub-brands, or fake labels.
- It can appear as: a headline, a brand label/badge, a watermark, or text integrated into the design.
- Minimum apparent size: equivalent to 28pt bold text relative to the canvas.` : ''}
${effectiveBrandColors.length ? `
BRAND COLORS (MANDATORY — these override ALL default color choices):
Palette: ${effectiveBrandColors.join(', ')}
Priority order: ${effectiveBrandColors.slice(0, 4).join(' → ')}

COLOR RULES (NON-NEGOTIABLE):
1. The DOMINANT color of the image (backgrounds, panels, large surfaces) MUST be from this palette.
2. At least 60% of the image's color area must use these brand colors.
3. Text-safe zones, gradients, overlays, cards, and panels MUST use brand colors — never fall back to generic navy, blue, purple, gold, teal, or black unless those exact hex values are in the palette above.
4. Use the first 1-2 colors as hero/primary surfaces. Use remaining colors as accents and supporting elements.
5. Environmental elements (lighting gels, material colors, background tones) should harmonize with the brand palette.
6. NEVER substitute the brand palette with random or default colors. Every color decision starts from this palette.` : ''}
${productName ? `\nPRODUCT: "${productName}" — if the product appears as visible text or on the product itself, use this exact name.` : ''}
═══════════════════════════════════════════════════
` : ''}

${analyzedContextLines ? `BRAND INTELLIGENCE (use this to inform every design decision):
${analyzedContextLines}
This is the brand's DNA. Every color choice, composition style, and visual element should feel native to this brand.
` : ''}

${postImagePrompt ? `POST GENERATOR VISUAL BRIEF (PRIMARY MESSAGE ANCHOR):
"${postImagePrompt}"
This brief came directly from the post generator. The final image must clearly support this message.\n` : ''}

${customPrompt ? `USER IMAGE REQUEST (CREATIVE REFINEMENT):
"${customPrompt}"
Use this to refine the scene, angle, composition, and mood while staying aligned with the post generator brief and confirmed post.\n` : ''}

CONTENT CONTEXT:
${postContext || 'Use the provided headline and tagline as the post message.'}

POST-TO-IMAGE ALIGNMENT RULES:
- The final visual must make immediate sense beside the confirmed post headline and body.
- If both a post generator brief and a user image request are provided, merge them.
- The post generator brief defines the message/topic.
- The user request refines how that topic is visualized.
- Do not drift into a different topic, metaphor, or subject that weakens the post.

${brandNamingDirective ? `${brandNamingDirective}

` : ''}

VISUAL STORYTELLING BRIEF:
${displayHeadline ? `- Core message: ${displayHeadline}` : ''}
${displayTagline ? `- Supporting message: ${displayTagline}` : ''}
${productName ? `- Product/service spotlight: ${productName}` : ''}

SUBJECT ANCHOR (the image MUST visually represent this):
- "${semanticAnchor}"
- The viewer should immediately understand what this image is about without reading the post.

SCENE CONSTRUCTION (MANDATORY):
- ${sceneBrief}
- Every image needs a clear HERO ELEMENT (the main visual subject) and SUPPORTING CONTEXT (environment, props, or secondary elements that reinforce the story).
- Think like a photographer: what would you stage, light, and frame to tell this story in one shot?
- No gradient-only or abstract-only outputs unless style is "abstract-brand".
${effectiveBrandColors.length ? `- Use brand colors (${effectiveBrandColors.slice(0, 3).join(', ')}) as the dominant palette in the scene — in surfaces, lighting, materials, and environment.` : ''}

${logoPlacement === 'none' ? 'No logo needed in this image.' : ''}

COMPOSITION MASTERY:
- Apply the rule of thirds for visual balance — place the hero element at an intersection point.
- Create clean text-safe zones (top 20% or bottom 25%) with strong contrast for editable text overlay.
- Use depth of field, layering, or environmental framing to create visual depth.
- Keep all key visual elements inside an 85% central safe-area so LinkedIn crops stay balanced.
- Use leading lines, color contrast, or light direction to guide the viewer's eye to the focal point.

VISUAL STYLE: ${styleDirection}
VISUAL TONE: ${toneDirection}

${style === 'photo-blend' ? `PHOTO-BLEND EXECUTION RULES:
- Must render as a sharp, high-fidelity photographic scene — not a blurred texture wash.
- Subject edges, textures, and materials must be crisp and readable at LinkedIn feed size (typically 552px wide).
- Use studio-quality lighting: directional key light, soft fill, and environmental ambient.
- Maintain realistic depth of field but keep the primary subject tack-sharp.
- Think editorial photography: Condé Nast, Bloomberg Businessweek, or Wired cover quality.
` : ''}

${variationDirective}
VARIATION SEED: ${variationSalt}

QUALITY STANDARD (NON-NEGOTIABLE):
- This image will represent a professional brand on LinkedIn — it must look like a $5,000 creative agency deliverable.
- Ultra-sharp rendering: every edge clean, every texture detailed, every element intentional.
- Modern design sensibility: current visual trends (2024-2026), not dated styles.
- Professional lighting that creates mood and dimension — no flat, evenly-lit compositions.
- Visual hierarchy that tells a story: primary subject → supporting elements → background atmosphere.
- The image should trigger the viewer to stop scrolling within 0.3 seconds.

ABSOLUTE PROHIBITIONS:
- Blurry, soft-focus, or low-resolution output
- Watermarks, stock photo badges, or placeholder artifacts
- Cluttered compositions with competing visual elements
- Generic clip-art, cartoon, or illustration-style elements (unless style explicitly calls for it)
- Gaussian blur blobs, foggy haze, or dreamy soft-focus backgrounds
- Abstract color gradients that communicate nothing about the topic
- Cheesy visual metaphors (lightbulbs for ideas, handshakes for partnership, puzzle pieces for teamwork)
- Human hands with incorrect finger counts or anatomical errors
`.trim();

    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
    const renderSize = sizeMap[imageAspect] || sizeMap.landscape;
    const render = parseSize(renderSize);

    // ── Resolve reference images (logo + optional URL reference) ──
    const referenceImages: Array<{ buffer: Buffer; filename: string; role: string }> = [];

    // Resolve logo buffer for baking into the AI image
    if (hasLogo && logoPlacement !== 'none') {
      const logoBuffer = await resolveImageBufferFromSource(effectiveLogoUrl);
      if (logoBuffer) {
        // Ensure the logo is a clean PNG for the API
        const logoPng = await sharp(logoBuffer)
          .resize({ width: 512, height: 512, fit: 'contain', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        referenceImages.push({ buffer: logoPng, filename: 'logo.png', role: 'logo' });
      }
    }

    // Resolve reference image from URL (e.g. product photo from website)
    if (referenceImageUrl) {
      const refBuffer = await resolveImageBufferFromSource(referenceImageUrl);
      if (refBuffer) {
        const refPng = await sharp(refBuffer)
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        referenceImages.push({ buffer: refPng, filename: 'reference.png', role: 'reference' });
      }
    }

    const useEditEndpoint = referenceImages.length > 0 && model.startsWith('gpt-image');

    // Augment prompt with logo/reference instructions for the edit endpoint
    let editPrompt = imagePrompt;
    if (useEditEndpoint) {
      const hasLogoRef = referenceImages.some((r) => r.role === 'logo');
      const hasImageRef = referenceImages.some((r) => r.role === 'reference');

      const logoInstruction = hasLogoRef
        ? `\n\nLOGO INTEGRATION — THIS IS THE #1 PRIORITY:
You have been given the brand's logo as a reference image. You MUST faithfully reproduce this exact logo inside the generated image as a core, beautiful element of the design.

CRITICAL LOGO RULES:
1. REPRODUCE THE LOGO EXACTLY as provided — same shape, same colors, same proportions, same details. Do not redesign, simplify, or alter it.
2. Make the logo a PROMINENT, LARGE, visually important element — it should be one of the first things viewers notice.
3. The logo must be DESIGNED INTO the composition, not floating randomly. Give it:
   - Proper visual weight and sizing (at least 15-20% of the image area)
   - A clean background area or contrasting zone behind it so it reads perfectly
   - Professional integration: subtle drop shadow, clean edges, or a complementary backdrop
4. ${logoPlacement === 'infuse' 
    ? 'INFUSE MODE: Make the logo a central, hero element of the design. It can be large and commanding — centered or prominently placed. It should feel like the image was designed AROUND the logo. Think of it like a brand-launch hero banner where the logo is the star.' 
    : 'OVERLAY MODE: Place the logo in a premium corner position (top-right or top-left preferred) with a clean backing — a subtle white/frosted card, clean negative space, or a contrasting panel. It should look like a professional watermark/brand stamp that belongs there by design.'}
5. The logo should be CRISP and SHARP — high fidelity rendering with clean edges.
6. Brand name: "${effectiveBrandName || 'Brand'}"

DO NOT:
- Replace the logo with text spelling out the brand name
- Draw a different/simplified version of the logo  
- Make the logo tiny or hard to see
- Put the logo in a cluttered area where it gets lost`
        : '';

      const refInstruction = hasImageRef
        ? `\n\nREFERENCE / PRODUCT IMAGE (MUST USE):
- I have provided a reference or product image. You MUST incorporate the visual subject, product, or scene from this reference prominently in the generated image.
- The generated image should clearly feature and showcase the referenced subject as a key visual element.
- Match the reference's colors, style, and characteristics faithfully while integrating it into a professional, polished composition.
- The reference subject should be recognizable and prominent, not abstracted away.`
        : '';

      // Build the final edit prompt with logo as highest priority
      editPrompt = imagePrompt + logoInstruction + refInstruction + `\n\nFINAL PRIORITY ORDER: 1) Reproduce the logo exactly and prominently. 2) Match the visual style and scene description. 3) Integrate reference images naturally.`;
    }

    let base64: string;
    let generationPass = 1;

    if (useEditEndpoint) {
      // Use the edit endpoint to bake logo/reference into the AI image
      const editResult = await generateImageEdit({
        model,
        prompt: editPrompt,
        images: referenceImages.map((r) => ({ buffer: r.buffer, filename: r.filename })),
        size: renderSize,
        quality: 'high',
      });
      base64 = editResult.base64;
    } else {
      // Standard generation without reference images
      const firstPass = await generateImageBase({
        model,
        prompt: imagePrompt,
        size: renderSize,
        quality: 'high',
        outputFormat: 'png',
        background: 'opaque',
      });
      base64 = firstPass.base64;
    }

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

    if (shouldRetryForDetail && !useEditEndpoint) {
      const sharpnessOverridePrompt = `${imagePrompt}

CLARITY OVERRIDE (MANDATORY):
- Produce a crisp, high-detail, in-focus image.
- No blur, no haze, no soft-focus treatment.
- Prioritize edge clarity, texture detail, and subject separation.
- Do not return abstract blur fields; return a concrete, identifiable visual scene tied to the subject anchor.
${effectiveBrandColors.length ? `- REMINDER: Use brand colors (${effectiveBrandColors.slice(0, 4).join(', ')}) as the dominant palette. Do not fall back to generic colors.` : ''}
${effectiveBrandName ? `- REMINDER: The brand name "${effectiveBrandName}" must appear as readable text in the image.` : ''}
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
    if (style === 'photo-blend' && base64.length < lowDetailThreshold && !useEditEndpoint) {
      const fallbackPrompt = imagePrompt
        .replace(
          `VISUAL STYLE: ${styleDirection}`,
          `VISUAL STYLE: ${styleMap['split-layout']}`
        )
        .concat(
          `\nFALLBACK STYLE OVERRIDE (MANDATORY): Use a sharp split-layout with a clearly defined subject area and a separate clean text-safe area.${effectiveBrandColors.length ? ` Use brand colors (${effectiveBrandColors.slice(0, 4).join(', ')}) as the dominant palette.` : ''}${effectiveBrandName ? ` Include the brand name "${effectiveBrandName}" as readable text.` : ''}`
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
      !useEditEndpoint &&
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
    let logoApplied = useEditEndpoint && hasLogo && logoPlacement !== 'none';

    // Only do sharp-based overlay if we did NOT use the edit endpoint
    // (edit endpoint already baked the logo into the AI image)
    if (!useEditEndpoint && (shouldOverlayLogo || shouldInfuseLogo)) {
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
              logo_baked_by_ai: useEditEndpoint && hasLogo,
              reference_image_url: referenceImageUrl || null,
              logo_source: providedLogoUrl ? 'uploaded' : brandKitLogoUrl ? 'brand-kit' : 'none',
              logo_url_used: effectiveLogoUrl || null,
              base_image_url: baseUrl,
              generation_nonce: generationNonce,
              generation_pass: generationPass,
              variation_directive: variationDirective,
              variation_salt: variationSalt,
              post_context_excerpt: postContext || null,
              post_image_prompt: postImagePrompt || null,
              user_image_prompt: customPrompt || null,
              analyzed_tone: marketingDnaContext?.tone || null,
              analyzed_image_style: marketingDnaContext?.imageStyle || null,
              analyzed_content_pillars: marketingDnaContext?.contentPillars || [],
              analyzed_target_audience: marketingDnaContext?.targetAudience || null,
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
