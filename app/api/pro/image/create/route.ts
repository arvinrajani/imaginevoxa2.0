import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { generateImageBase, generateImageEdit } from '@/lib/ai/openai';
import sharp from 'sharp';
import { composeAlliancePoster } from '@/lib/studio/alliance-poster';
import { composeThemeImage, THEME_SCHEMAS } from '@/lib/studio/theme-composer';

type CreateImageRequest = {
  brandId?: string;
  brandName?: string;
  productName?: string;
  brandColors?: string[];
  themeId?: string;
  contextBrief?: string;
  headline?: string;
  tagline?: string;
  tone?: string;
  style?: string;
  logoUrl?: string;
  logoPlacement?: 'overlay' | 'infuse' | 'none';
  additionalLogoUrls?: string[];
  partnerName?: string;
  partnerTagline?: string;
  footerWebsite?: string;
  footerEmail?: string;
  featureBullets?: string[];
  referenceAsHero?: boolean;
  postText?: string;
  postImagePrompt?: string;
  customPrompt?: string;
  generationNonce?: number;
  imageAspect?: 'landscape' | 'square' | 'portrait';
  referenceImageUrl?: string;
  slotImages?: Record<string, string>;
};

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

const WEAK_FEATURE_PATTERNS = [
  /^feature\s+(one|two|three|four|five|six)$/i,
  /^benefit(\s+pointer)?\s+(one|two|three|four|five|six)$/i,
  /^post proof points appear here$/i,
  /learn more/i,
  /discover more/i,
  /visit (our|the) website/i,
  /contact us/i,
  /click /i,
  /^https?:\/\//i,
];

function isWeakFeatureLine(value: string) {
  return WEAK_FEATURE_PATTERNS.some((pattern) => pattern.test(value));
}

function deriveFeatureBullets(...sources: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const lines: string[] = [];

  const remember = (value: string) => {
    const cleaned = sanitizeDisplayText(value, 96)
      .replace(/^[-*+.\d)\s]+/, '')
      .trim()
      .replace(/^["']+|["']+$/g, '');
    const key = cleaned.toLowerCase();
    if (
      !cleaned ||
      cleaned.length < 14 ||
      cleaned.length > 96 ||
      isWeakFeatureLine(cleaned) ||
      seen.has(key)
    ) {
      return;
    }
    seen.add(key);
    lines.push(cleaned);
  };

  for (const source of sources) {
    if (!source) continue;

    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .forEach(remember);

    if (lines.length >= 6) break;

    source
      .split(/[.!?]/)
      .map((line) => line.trim())
      .forEach(remember);

    if (lines.length >= 6) break;
  }

  return lines.slice(0, 6);
}

function deriveEmailFromWebsite(website: string | null | undefined) {
  const trimmed = website?.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  if (!normalized) return null;

  return `info@${normalized}`;
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
  contextBrief?: string;
}) {
  const raw = `${options.productName || ''} ${options.headline || ''} ${options.postImagePrompt || ''} ${options.postText || ''} ${options.contextBrief || ''}`.toLowerCase();

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

function buildThemeDirective(themeId: string) {
  // Each direction describes the EXACT structural layout that the SVG overlay will
  // composite on top. The AI must generate a background plate that supports this
  // fixed structure — not improvise a different layout.
  const themeMap: Record<string, { label: string; direction: string }> = {
    'guided-auto': {
      label: 'AI Guided',
      direction:
        'LAYOUT CONTRACT: The final image has a LEFT panel (4%-50% width) for a hero image and a RIGHT panel (54%-96% width) for headline text, tagline, and a CTA button. Generate a rich, atmospheric background plate using the brand colors as the dominant palette. Keep the left half suitable for a large hero image overlay and the right half dark/moody enough for text readability. Do NOT render any text, panels, or UI elements — the overlay system adds those.',
    },
    'alliance-poster': {
      label: 'Alliance Poster',
      direction:
        'LAYOUT CONTRACT: The final image has a dark header band (top 15%), a LEFT hero bay (3%-40% width, 18%-88% height) for a product/hero image, a RIGHT information lane (44%-96% width) for headlines, bullet points, and logos, and a footer strip (bottom 10%). Generate ONLY a premium atmospheric background plate using the brand colors as the dominant tones — industrial, electrification, or infrastructure context. Do NOT render any text, logos, panels, bullets, or UI. Keep the left side clean for a hero cutout and the right side visually quiet for text overlay.',
    },
    'product-hero': {
      label: 'Product Hero',
      direction:
        'LAYOUT CONTRACT: The final image has a centered circular product showcase (centered at 50% width, 39% height, ~19% radius), a headline below it at 72% height, a tagline at 79% height, and a centered CTA button at 84% height. A small logo card sits at top-left. Generate a clean, premium background plate using the brand colors for surfaces and lighting that makes a circular product cutout pop. Keep the center clear for the product circle. Do NOT render any text, circles, buttons, or UI elements.',
    },
    'knowledge-visual': {
      label: 'Knowledge-Led',
      direction:
        'LAYOUT CONTRACT: The final image has a LEFT reference panel (4%-56% width, full height) for a data/reference image and a RIGHT dark info panel (58%-96% width) for headline text and tagline. Generate a dark, technical-feeling background plate using the brand colors as dominant tones. Keep the left half clean for an overlaid reference image and the right half dark enough for light text. Do NOT render any text, panels, or UI elements.',
    },
    'clean-brand': {
      label: 'Clean Brand',
      direction:
        'LAYOUT CONTRACT: The final image has a light background using the brand colors, a top header bar with logo (top 14%), a LEFT text zone (6% from left) for large headline and tagline, a RIGHT hero image panel (60%-96% width, 16%-88% height), a CTA button at 68% height, and a light footer (bottom 10%). Generate a subtle, minimal, clean background plate — mostly light with gentle brand-colored accents. Do NOT render any text, logos, buttons, or UI elements.',
    },
    'industrial-campaign': {
      label: 'Industrial Campaign',
      direction:
        'LAYOUT CONTRACT: The final image has a dark header band (top 15%) with a logo card, a LEFT hero bay (3%-40% width, 18%-88% height) for a product/hero image, a RIGHT info zone (44%-96% width) for headlines, accent bar, and bullet points with checkmarks, and a dark footer (bottom 10%). Generate a premium industrial/electrification atmospheric background plate using the brand colors as dominant surfaces. Do NOT render any text, logos, panels, bullets, or UI.',
    },
    'datasheet-frame': {
      label: 'Datasheet Frame',
      direction:
        'LAYOUT CONTRACT: The final image has a LEFT dark product panel (4%-46% width, full height) for a product image, a TOP-RIGHT info card (50%-96% width, 4%-29% height) with logo and headline, and FOUR spec-block cards in a 2×2 grid on the right (50%-96% width, 34%-92% height). Background uses the brand colors for a clean, technical, brochure-style plate. Do NOT render any text, cards, grids, or UI elements.',
    },
    'proof-stack': {
      label: 'Proof Stack',
      direction:
        'LAYOUT CONTRACT: The final image has THREE stacked proof cards on the LEFT (4%-50% width, evenly spaced from top) with colored accent squares, and a LARGE dark info panel on the RIGHT (52%-96% width, 8%-92% height) for headline, tagline, and CTA. Background uses the brand colors for a clean, trust-building plate. Do NOT render any text, cards, panels, or UI elements.',
    },
    'launch-banner': {
      label: 'Launch Banner',
      direction:
        'LAYOUT CONTRACT: The final image has a vibrant gradient background using the brand colors, a pill-shaped logo badge at top-left, an accent badge at top-right, a LARGE bold headline in the center-left (8% from left, 35%-45% height), a tagline below it, and a CTA button at bottom-right. Generate a rich, energetic gradient background plate with launch/announcement energy using brand colors as the dominant palette. Do NOT render any text, badges, buttons, or UI elements.',
    },
    'sector-collage': {
      label: 'Sector Collage',
      direction:
        'LAYOUT CONTRACT: The final image has a dark gradient background using the brand colors, a dark header band (top 16%) with a logo card and centered headline, THREE equal image panels side by side (3%/35%/67% x positions, 19%-68% height, each 30% wide), and sector label text at 78% height. Generate a dark, premium gradient background plate using brand colors. Do NOT render any text, panels, tiles, or UI elements.',
    },
    'brand-story': {
      label: 'Brand Story',
      direction:
        'LAYOUT CONTRACT: The final image has a warm background using the brand colors, a LARGE circular portrait/story image on the LEFT (centered at 24% width, 50% height), a small logo on the RIGHT at 52% width / 18% height, a serif headline at 34% height on the right, a tagline below it, and a CTA button at 72% height. Generate a warm, elegant, story-telling background plate tinted with brand colors. Do NOT render any text, circles, logos, buttons, or UI elements.',
    },
    'offer-card': {
      label: 'Offer Card',
      direction:
        'LAYOUT CONTRACT: The final image has a rich gradient background using the brand colors, a LEFT info zone (4%-54% width) with an accent badge, large headline, tagline, and CTA button, and a RIGHT product panel (58%-96% width, full height) for a product/service image. Generate a vibrant, conversion-oriented gradient background plate using brand colors. Do NOT render any text, badges, buttons, panels, or UI elements.',
    },
    'comparison-board': {
      label: 'Comparison Board',
      direction:
        'LAYOUT CONTRACT: The final image has a light background using the brand colors, a top bar with logo and headline, and TWO equal side-by-side panels (LEFT at 4%-48% width and RIGHT at 52%-96% width, both 18%-92% height) for comparing options. Generate a clean, neutral background plate using brand colors suitable for analytical comparison layouts. Do NOT render any text, panels, cards, or UI elements.',
    },
    'premium-editorial': {
      label: 'Premium Editorial',
      direction:
        'LAYOUT CONTRACT: The final image has a luxurious dark gradient background using the brand colors, a LEFT editorial image panel (3%-33% width, full height), headline text on the right at 30% height, an accent line, tagline text below, and a CTA button at bottom-right. Generate a rich, magazine-quality dark gradient background plate using brand colors for luxury finishing. Do NOT render any text, panels, lines, buttons, or UI elements.',
    },
  };

  return themeMap[themeId] || themeMap['guided-auto'];
}

function buildVariationDirective(nonce: number, themeId: string) {
  // Variations ONLY change background atmosphere/scene/lighting — NEVER the layout.
  // The layout is fixed by the theme's SVG overlay and must not be altered.
  const themedRecipes: Record<string, string[]> = {
    'alliance-poster': [
      'Background atmosphere: industrial factory floor with dramatic overhead lighting and metallic surfaces, tinted with brand colors.',
      'Background atmosphere: electrification infrastructure with high-voltage energy, surfaces reflecting brand color palette.',
      'Background atmosphere: modern automation facility with clean engineering surfaces and directional light in brand color tones.',
    ],
    'product-hero': [
      'Background atmosphere: clean studio surface with soft gradient lighting in brand colors and subtle reflections.',
      'Background atmosphere: premium showroom with warm directional key light, surfaces tinted with brand palette.',
      'Background atmosphere: minimal pedestal setup with edge-lit highlights using brand colors.',
    ],
    'knowledge-visual': [
      'Background atmosphere: dark technical workspace with subtle grid lines and brand-colored data accents.',
      'Background atmosphere: deep research environment in brand color tones with soft ambient glow.',
      'Background atmosphere: dark editorial surface with technical diagram-style patterns in brand colors.',
    ],
    'industrial-campaign': [
      'Background atmosphere: heavy machinery environment with dramatic spotlights and brand-colored metallic textures.',
      'Background atmosphere: high-voltage infrastructure with brand-colored arc accents and industrial depth.',
      'Background atmosphere: automated production line with premium engineering surfaces in brand color tones.',
    ],
    'datasheet-frame': [
      'Background atmosphere: clean technical surface with subtle engineering grid lines tinted with brand colors.',
      'Background atmosphere: light studio tinted with brand colors, precise catalog-quality even lighting.',
      'Background atmosphere: neutral technical environment with brand-colored blueprint-style accents.',
    ],
    'proof-stack': [
      'Background atmosphere: clean corporate environment with confidence-building lighting in brand color tones.',
      'Background atmosphere: light analytical workspace with soft brand-colored ambient light.',
      'Background atmosphere: premium B2B setting with brand-colored clean surfaces.',
    ],
    'launch-banner': [
      'Background atmosphere: energetic gradient in brand colors with particle effects and launch energy.',
      'Background atmosphere: bold brand-color sweep with dynamic light streaks suggesting reveal and momentum.',
      'Background atmosphere: dramatic spotlight effect with vibrant brand-colored gradient and celebration energy.',
    ],
    'sector-collage': [
      'Background atmosphere: deep gradient in brand colors with subtle infrastructure silhouettes in the distance.',
      'Background atmosphere: dark brand-colored gradient with faint sector iconography and premium depth.',
      'Background atmosphere: brand-colored gradient with subtle energy grid lines.',
    ],
    'brand-story': [
      'Background atmosphere: warm, inviting brand-colored tones with soft natural light from the side.',
      'Background atmosphere: elegant warm gradient using brand colors with gentle editorial softness.',
      'Background atmosphere: premium story-telling environment with warm brand-colored ambient lighting.',
    ],
    'offer-card': [
      'Background atmosphere: vibrant promotional gradient in brand colors with urgency-driven energy.',
      'Background atmosphere: rich brand-colored sweep with conversion-focused bold tones.',
      'Background atmosphere: dynamic sales-energy gradient using brand palette with premium warmth.',
    ],
    'comparison-board': [
      'Background atmosphere: clean, neutral surface tinted with brand colors and soft even lighting.',
      'Background atmosphere: minimal brand-tinted workspace with precise, balanced illumination.',
      'Background atmosphere: professional comparison-ready surface with subtle brand-colored depth separation.',
    ],
    'premium-editorial': [
      'Background atmosphere: luxurious dark tones with brand-colored accent lighting and magazine-quality finish.',
      'Background atmosphere: rich editorial darkness in brand colors with subtle material textures and dramatic side light.',
      'Background atmosphere: sophisticated dark brand-colored gradient with restrained luxury warmth.',
    ],
    default: [
      'Background atmosphere: professional corporate gradient using brand colors with balanced tones.',
      'Background atmosphere: clean modern surface with brand-colored ambient lighting.',
      'Background atmosphere: premium dark gradient in brand colors with soft directional light creating depth.',
    ],
  };

  const recipes = themedRecipes[themeId] || themedRecipes.default;

  const recipe = recipes[Math.abs(nonce) % recipes.length];
  return `Variation directive (attempt ${nonce}): ${recipe} IMPORTANT: Do NOT change the layout structure — only vary the background scene, lighting, and atmosphere. The layout is fixed by the theme overlay system.`;
}

// ---------------------------------------------------------------------------
// Security: constants & helpers
// ---------------------------------------------------------------------------

/** Maximum image buffer size (10 MB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Maximum data-URI payload size (10 MB base64 ≈ 13.3 MB encoded). */
const MAX_DATA_URI_LENGTH = 14 * 1024 * 1024;
/** Fetch timeout for external image URLs (15 seconds). */
const FETCH_TIMEOUT_MS = 15_000;
/** Maximum length for free-text prompt fields. */
const MAX_PROMPT_LENGTH = 2000;
/** Maximum length for short text fields (headline, tagline, etc.). */
const MAX_SHORT_TEXT = 200;

const ALLOWED_THEMES = new Set([
  'guided-auto', 'alliance-poster', 'product-hero', 'knowledge-visual',
  'clean-brand', 'industrial-campaign', 'datasheet-frame', 'proof-stack',
  'launch-banner', 'sector-collage', 'brand-story', 'offer-card',
  'comparison-board', 'premium-editorial',
]);

const ALLOWED_TONES = new Set([
  'professional', 'bold', 'creative', 'minimal', 'warm', 'tech', 'luxury',
]);

const ALLOWED_STYLES = new Set([
  'text-overlay', 'photo-blend', 'abstract-brand', 'split-layout', 'infographic', 'cinematic',
]);

/**
 * Validate that a URL is safe to fetch server-side (SSRF protection).
 * Only allows https:// with public hostnames.
 */
function isAllowedImageUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block private/internal IPs and metadata endpoints
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.localhost')
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/** Sanitize user text before embedding in an AI prompt to reduce injection risk. */
function sanitizePromptText(text: string, maxLength: number): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
    .trim()
    .slice(0, maxLength);
}

function sanitizeDisplayText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';

  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2022\u00B7•]/g, ' ')
    .replace(/[✓✔✅☑]/g, ' ')
    .replace(/[👉➜➤➡]/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function decodeDataUriToBuffer(dataUri: string): Buffer | null {
  if (dataUri.length > MAX_DATA_URI_LENGTH) return null;

  const match = dataUri.match(/^data:([^;,]+)?((?:;[^,]*)*?),([\s\S]*)$/);
  if (!match) return null;

  // Validate content-type is image
  const mimeType = (match[1] || '').toLowerCase();
  if (mimeType && !mimeType.startsWith('image/')) return null;

  const meta = match[2] || '';
  const payload = match[3] || '';

  try {
    let buf: Buffer;
    if (meta.includes(';base64')) {
      buf = Buffer.from(payload, 'base64');
    } else {
      buf = Buffer.from(decodeURIComponent(payload), 'utf8');
    }
    if (buf.length > MAX_IMAGE_BYTES) return null;
    return buf;
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

  // SSRF protection: only allow safe HTTPS URLs
  if (!isAllowedImageUrl(trimmed)) {
    console.warn('[image-create] Blocked unsafe URL:', trimmed.slice(0, 120));
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(trimmed, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return null;

    // Validate content-type is image
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;

    // Check content-length before buffering when available
    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) return null;

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
    const requestedBrandName = (body.brandName?.trim() || '').slice(0, MAX_SHORT_TEXT);
    const productName = (body.productName?.trim() || '').slice(0, MAX_SHORT_TEXT);
    const requestedBrandColors = Array.isArray(body.brandColors)
      ? body.brandColors.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.trim())).slice(0, 10)
      : [];
    const themeId = ALLOWED_THEMES.has(body.themeId?.trim() || '') ? body.themeId!.trim() : 'guided-auto';
    const contextBrief = (body.contextBrief?.trim() || '').slice(0, MAX_PROMPT_LENGTH);
    const tone = ALLOWED_TONES.has(body.tone?.trim() || '') ? body.tone!.trim() : 'professional';
    const style = ALLOWED_STYLES.has(body.style?.trim() || '') ? body.style!.trim() : 'text-overlay';
    const providedLogoUrl = body.logoUrl?.trim() || '';
    const customPrompt = (body.customPrompt?.trim() || '').slice(0, MAX_PROMPT_LENGTH);
    const postText = (body.postText?.trim() || '').slice(0, 5000);
    const postImagePrompt = (body.postImagePrompt?.trim() || '').slice(0, MAX_PROMPT_LENGTH);
    const logoPlacement = (['overlay', 'infuse', 'none'].includes(body.logoPlacement || '') ? body.logoPlacement : 'overlay') as 'overlay' | 'infuse' | 'none';
    const additionalLogoUrls = Array.isArray(body.additionalLogoUrls)
      ? body.additionalLogoUrls.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const partnerName = (body.partnerName?.trim() || '').slice(0, MAX_SHORT_TEXT);
    const partnerTagline = (body.partnerTagline?.trim() || '').slice(0, MAX_SHORT_TEXT);
    const footerWebsite = (body.footerWebsite?.trim() || '').slice(0, MAX_SHORT_TEXT);
    const footerEmail = (body.footerEmail?.trim() || '').slice(0, MAX_SHORT_TEXT);
    const featureBullets = Array.isArray(body.featureBullets)
      ? body.featureBullets
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const referenceAsHero = body.referenceAsHero !== false;
    const imageAspect = (['landscape', 'square', 'portrait'].includes(body.imageAspect || '') ? body.imageAspect : 'landscape') as 'landscape' | 'square' | 'portrait';
    const generationNonce = Number.isFinite(body.generationNonce)
      ? Math.max(1, Math.floor(body.generationNonce as number))
      : 1;
    const referenceImageUrl = body.referenceImageUrl?.trim() || '';
    const rawSlotImages = body.slotImages && typeof body.slotImages === 'object' && !Array.isArray(body.slotImages)
      ? body.slotImages as Record<string, string>
      : {};
    const slotImages: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawSlotImages)) {
      if (typeof val === 'string' && val.trim()) slotImages[key] = val.trim();
    }

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

    // ── Brand ownership verification ──
    if (brandId) {
      const { data: ownerCheck } = await db
        .from('brands')
        .select('id')
        .eq('id', brandId)
        .eq('owner_user_id', actingUserId)
        .maybeSingle();

      if (!ownerCheck) {
        return NextResponse.json(
          { error: 'You do not have access to this brand.' },
          { status: 403 }
        );
      }
    }

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
    const isAlliancePoster = themeId === 'alliance-poster';
    const hasThemeComposition = Boolean(THEME_SCHEMAS[themeId]);
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
    const shouldInfuseLogo = !isAlliancePoster && logoPlacement === 'infuse' && hasLogo;
    const shouldOverlayLogo = !isAlliancePoster && logoPlacement === 'overlay' && hasLogo;
    const posterFeatureBullets =
      featureBullets.length > 0
        ? featureBullets
        : deriveFeatureBullets(postText, postImagePrompt, displayHeadline, displayTagline, contextBrief, customPrompt);
    const posterFooterWebsite =
      footerWebsite ||
      marketingDnaContext?.website ||
      asTrimmedString(brandRow?.website) ||
      '';
    const posterFooterEmail = footerEmail || deriveEmailFromWebsite(posterFooterWebsite) || '';
    const composedBrandName = sanitizeDisplayText(effectiveBrandName, 48);
    const composedHeadline = sanitizeDisplayText(displayHeadline, 80);
    const composedTagline = sanitizeDisplayText(displayTagline, 120);
    const composedFeatureBullets = posterFeatureBullets
      .map((line) => sanitizeDisplayText(line, 96))
      .filter(Boolean)
      .slice(0, 6);
    const composedFooterWebsite = sanitizeDisplayText(posterFooterWebsite, 72);
    const composedFooterEmail = sanitizeDisplayText(posterFooterEmail, 72);

    if (!isAlliancePoster && logoPlacement !== 'none' && !hasLogo) {
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
    const outputSizeMap: Record<'landscape' | 'square' | 'portrait', { width: number; height: number }> = {
      landscape: { width: 1200, height: 628 },
      square: { width: 1080, height: 1080 },
      portrait: { width: 1080, height: 1350 },
    };
    const dimensionMap: Record<string, string> = {
      landscape: '1200x628 landscape feed',
      square: '1080x1080 square',
      portrait: '1080x1350 portrait',
    };

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
    // Sanitize all user-controlled text before embedding in AI prompt
    const safeContextBrief = sanitizePromptText(contextBrief, MAX_PROMPT_LENGTH);
    const safeCustomPrompt = sanitizePromptText(customPrompt, MAX_PROMPT_LENGTH);
    const safePostImagePrompt = sanitizePromptText(postImagePrompt, MAX_PROMPT_LENGTH);
    const safeBrandName = sanitizePromptText(effectiveBrandName, MAX_SHORT_TEXT);
    const safeProductName = sanitizePromptText(productName, MAX_SHORT_TEXT);
    const safeHeadline = sanitizePromptText(displayHeadline, MAX_SHORT_TEXT);
    const safeTagline = sanitizePromptText(displayTagline, MAX_SHORT_TEXT);
    const brandNamingDirective = safeBrandName
      ? [
          `BRAND NAMING RULES:`,
          `- Ensure the brand name is visibly present somewhere in the final composition, either through the main headline, brand label, product branding, or the supplied logo.`,
          `- If any visible text, label, badge, product marking, signage, or title appears in the image, use the exact brand name "${safeBrandName}".`,
          safeProductName
            ? `- If the product name appears in visible text or on the product itself, use the exact product name "${safeProductName}".`
            : null,
          safeHeadline
            ? `- For layouts with text, the primary visible headline should follow this exact wording: "${safeHeadline}".`
            : null,
          safeTagline
            ? `- Use this supporting line only when it remains large and readable: "${safeTagline}".`
            : null,
          `- Never invent alternate company names, sub-brands, or fake UI/product labels.`,
          `- Never change spelling, punctuation, or capitalization of the brand or product names.`,
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    const postImageAnchor = safePostImagePrompt.replace(/\s+/g, ' ').trim().slice(0, 220);
    const semanticAnchor =
      safeProductName ||
      postImageAnchor ||
      safeHeadline ||
      marketingDnaContext?.businessFocus ||
      postText.replace(/\s+/g, ' ').trim().slice(0, 220) ||
      safeBrandName ||
      'professional business growth';
    const sceneBrief = deriveSceneBrief({
      brandName: safeBrandName,
      productName: safeProductName,
      headline: safeHeadline,
      postImagePrompt: safePostImagePrompt,
      postText,
      contextBrief: safeContextBrief,
    });

    const postContext = postText.replace(/\s+/g, ' ').trim().slice(0, 1200);
    const selectedTheme = buildThemeDirective(themeId);
    const variationDirective = buildVariationDirective(generationNonce, themeId);
    const variationSalt = `${generationNonce}-${Date.now().toString(36).slice(-6)}`;

    const imagePrompt = `
You are an elite creative director and visual designer who has art-directed campaigns for Fortune 500 brands. You specialize in LinkedIn visual content that stops the scroll and drives engagement.

Your mission: create a visually stunning, magazine-quality image that makes the viewer pause, feel something, and engage with the post.

CANVAS: ${dimensionMap[imageAspect] || dimensionMap.landscape} format.

CREATIVE MODE:
- Theme: ${selectedTheme.label}
- Theme direction: ${selectedTheme.direction}

THEME FIDELITY — CRITICAL (THIS OVERRIDES ALL OTHER COMPOSITION RULES):
- Your image will be placed INSIDE the theme layout as the hero visual content.
- A structured SVG overlay will be composited on top, adding panels, text, logos, buttons, and layout around your image.
- Generate a STRONG, FOCUSED visual subject — the product, scene, environment, or concept that tells the story.
- Do NOT render any text, headlines, taglines, brand names, logos, buttons, UI panels, cards, or structural layout elements — the overlay adds all of those.
- Do NOT improvise your own layout, poster system, or text hierarchy — focus entirely on the visual content.
- Fill the frame with rich, detailed visual content — this image will be cropped into the theme's hero slot.
- Use brand colors in the scene (lighting, surfaces, materials, environment) so the AI content harmonizes with the theme overlay colors.

${safeBrandName || effectiveBrandColors.length ? `═══════════════════════════════════════════════════
BRAND IDENTITY — #1 PRIORITY (READ THIS FIRST)
═══════════════════════════════════════════════════
${safeBrandName ? (THEME_SCHEMAS[themeId] || isAlliancePoster
  ? `BRAND: "${safeBrandName}"
- Do NOT render the brand name as text in the image — the theme overlay adds it.
- Use the brand's visual identity (colors, aesthetic) to make the background feel brand-native.`
  : `BRAND: "${safeBrandName}"
- The brand name "${safeBrandName}" MUST appear as clearly readable text somewhere in the final image.
- Place it in a high-contrast area so it is legible at LinkedIn feed size (552px wide).
- Use it exactly as written — never invent alternate names, sub-brands, or fake labels.
- It can appear as: a headline, a brand label/badge, a watermark, or text integrated into the design.
- Minimum apparent size: equivalent to 28pt bold text relative to the canvas.`) : ''}
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
${safeProductName ? `\nPRODUCT: "${safeProductName}" — if the product appears as visible text or on the product itself, use this exact name.` : ''}
═══════════════════════════════════════════════════
` : ''}

${analyzedContextLines ? `BRAND INTELLIGENCE (use this to inform every design decision):
${analyzedContextLines}
This is the brand's DNA. Every color choice, composition style, and visual element should feel native to this brand.
` : ''}

${safePostImagePrompt ? `POST GENERATOR VISUAL BRIEF (PRIMARY MESSAGE ANCHOR):
"${safePostImagePrompt}"
This brief came directly from the post generator. The final image must clearly support this message.\n` : ''}

${safeContextBrief ? `USER CONTEXT (TREAT THIS LIKE THE MAIN CHATGPT-STYLE REQUEST):
"${safeContextBrief}"
Use this as the main explanation of what the user wants the picture to communicate and what must be shown.\n` : ''}

${safeCustomPrompt ? `USER IMAGE REQUEST (CREATIVE REFINEMENT):
"${safeCustomPrompt}"
Use this to refine the scene, angle, composition, and mood while staying aligned with the post generator brief and confirmed post.\n` : ''}

CONTENT CONTEXT:
${postContext || 'Use the provided headline and tagline as the post message.'}

POST-TO-IMAGE ALIGNMENT RULES:
- The final visual must make immediate sense beside the confirmed post headline and body.
- If both a post generator brief and a user image request are provided, merge them.
- If a user context brief is provided, treat it as the clearest description of what the final image should communicate.
- The post generator brief defines the message/topic.
- The user context and user request refine how that topic is visualized.
- Do not drift into a different topic, metaphor, or subject that weakens the post.

${brandNamingDirective ? `${brandNamingDirective}

` : ''}

VISUAL STORYTELLING BRIEF:
${safeHeadline ? `- Core message: ${safeHeadline}` : ''}
${safeTagline ? `- Supporting message: ${safeTagline}` : ''}
${safeProductName ? `- Product/service spotlight: ${safeProductName}` : ''}
${safeContextBrief ? `- User context: ${safeContextBrief}` : ''}

SUBJECT ANCHOR (the image MUST visually represent this):
- "${semanticAnchor}"
- The viewer should immediately understand what this image is about without reading the post.

${isAlliancePoster ? `ALLIANCE POSTER BACKGROUND RULES:
- Generate the background plate only. Final logos, headlines, footer text, and bullet pointers will be composited later.
- Do NOT render readable text, letterforms, logos, product labels, or fake UI in the image itself.
- This is a strict template, not a freeform poster. Keep the header logo zones, left hero bay, and right information lane clean.
- Keep the hero subject isolated on the left with negative space around it so later composition stays crisp.
- Hard failure if any readable text, logo marks, or UI chrome appears anywhere in the image.
- Keep the left side strong enough for a hero product cutout and the right side visually clean enough for benefit bullets.
- Favor premium industrial, electrification, energy, automation, or infrastructure context when it matches the brief.
- Make the backdrop sharp, high contrast, and poster-friendly rather than generic lifestyle photography.
` : ''}

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
- IMPORTANT: The image will be viewed at 552px wide in the LinkedIn feed. All text, icons, and key details must be clearly readable at that size. Avoid tiny text, thin lines, or subtle details that vanish at feed scale.

${THEME_SCHEMAS[themeId] || isAlliancePoster ? `TEXT RENDERING RULES (CRITICAL):
- Do NOT render ANY text, headlines, taglines, brand names, logos, or letterforms in the image.
- The theme overlay system will add all text, logos, and UI elements on top of your background plate.
- Any text you render will be covered by the overlay and create visual noise.
- Focus entirely on creating a rich, atmospheric background.` : `TEXT RENDERING RULES (CRITICAL — AI text must be perfect):
- Every letter in every word must be spelled correctly with no missing, extra, swapped, or garbled characters.
- Before rendering any text, mentally spell it out letter by letter: "${displayHeadline || effectiveBrandName || ''}".
- Use clean, bold sans-serif fonts (Helvetica, Inter, or similar) for maximum readability.
- Ensure strong contrast between text and background — minimum 4.5:1 contrast ratio.
- Text should be large and confident — the headline should occupy at least 15-25% of the image width.
- Never render text smaller than equivalent to 18pt at final output size.
- If the text would be hard to render perfectly, use fewer words but make them flawless.
- Double-check: brand name "${effectiveBrandName}" must be letter-perfect if it appears.`}

LINKEDIN FEED OPTIMIZATION:
- Images appear at 552px wide in the LinkedIn feed — design for impact at that size.
- Use bold, high-contrast elements that pop on both desktop and mobile screens.
- Avoid fine details, thin lines, or subtle gradients that disappear at feed size.
- Key message and hero subject should be instantly recognizable within 0.3 seconds.
- White/negative space is a power tool — use it to create focus, not fill every pixel.

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
- All visible text must be perfectly spelled, properly kerned, and clearly legible.
- Color accuracy: brand colors must match the hex values provided — no approximations.

ABSOLUTE PROHIBITIONS:
- Blurry, soft-focus, or low-resolution output
- Watermarks, stock photo badges, or placeholder artifacts
- Cluttered compositions with competing visual elements
- Generic clip-art, cartoon, or illustration-style elements (unless style explicitly calls for it)
- Gaussian blur blobs, foggy haze, or dreamy soft-focus backgrounds
- Abstract color gradients that communicate nothing about the topic
- Cheesy visual metaphors (lightbulbs for ideas, handshakes for partnership, puzzle pieces for teamwork)
- Human hands with incorrect finger counts or anatomical errors
${THEME_SCHEMAS[themeId] || isAlliancePoster ? `- ANY readable text, headlines, taglines, brand names, logos, letterforms, UI panels, buttons, or structural overlay elements — the theme overlay adds all of these
- Fake UI, mockup screens, or layout structures — the theme system handles structure` : `- Misspelled text, garbled letters, or nonsensical words anywhere in the image
- Text that is too small to read at 552px display width`}
- Generic stock-photo compositions that lack brand personality
`.trim();

    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
    const renderSize = sizeMap[imageAspect] || sizeMap.landscape;
    const canvas = outputSizeMap[imageAspect];

    // ── Resolve reference images (logo + optional URL reference) ──
    const referenceImages: Array<{ buffer: Buffer; filename: string; role: string }> = [];
    const primaryLogoBuffer =
      hasLogo ? await resolveImageBufferFromSource(effectiveLogoUrl) : null;
    const posterSecondaryLogoBuffers = isAlliancePoster
      ? (
          await Promise.all(
            additionalLogoUrls.slice(0, 3).map((value) => resolveImageBufferFromSource(value))
          )
        ).filter((value): value is Buffer => Boolean(value))
      : [];
    const posterHeroBuffer =
      isAlliancePoster && referenceAsHero && referenceImageUrl
        ? await resolveImageBufferFromSource(referenceImageUrl)
        : null;

    // For themed images: the SVG overlay handles logo + slot images, so we only
    // feed reference images into the AI when there is NO theme composition.
    // For themed images, reference images are routed into the hero slot instead.
    if (!hasThemeComposition && !isAlliancePoster) {
      // Resolve logo buffer for baking into the AI image (non-themed only)
      if (hasLogo && logoPlacement !== 'none') {
        if (primaryLogoBuffer) {
          const logoPng = await sharp(primaryLogoBuffer)
            .resize({ width: 512, height: 512, fit: 'contain', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
          referenceImages.push({ buffer: logoPng, filename: 'logo.png', role: 'logo' });
        }
      }

      // Resolve reference image from URL (non-themed only)
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
    }

    // For themed images with a reference image but no explicit hero slot assignment,
    // auto-route the reference image into the theme's hero slot.
    if (hasThemeComposition && referenceImageUrl && !slotImages['hero']) {
      const themeSlots = THEME_SCHEMAS[themeId]?.imageSlots || [];
      const heroSlot = themeSlots.find((s) => s.id === 'hero');
      if (heroSlot) {
        slotImages['hero'] = referenceImageUrl;
      }
    }

    const useEditEndpoint =
      !isAlliancePoster &&
      !hasThemeComposition &&
      referenceImages.length > 0 &&
      model.startsWith('gpt-image');

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
2. Make the logo a visually important branded element. It must be crisp, readable, and intentionally placed.
3. The logo must be DESIGNED INTO the composition, not floating randomly. Give it:
   - Proper visual weight and sizing
   - A clean background area or contrasting zone behind it so it reads perfectly
   - Professional integration: subtle drop shadow, clean edges, or a complementary backdrop
4. ${logoPlacement === 'infuse' 
    ? 'INFUSE MODE: Make the logo a central, hero element of the design. It can be large and commanding — centered or prominently placed. It should feel like the image was designed AROUND the logo. Think of it like a brand-launch hero banner where the logo is the star.' 
    : themeId === 'alliance-poster'
      ? 'OVERLAY MODE: Place the logo inside a disciplined brand zone such as a top header, corner stamp, or structured title band. Keep it clearly readable and premium, but do not let it overpower the hero product or core message.'
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

    const generatedAt = Date.now();
    const folder = `${brandId || actingUserId}`;

    if (useEditEndpoint) {
      const editResult = await generateImageEdit({
        model,
        prompt: editPrompt,
        images: referenceImages.map((r) => ({ buffer: r.buffer, filename: r.filename })),
        size: renderSize,
        quality: 'high',
      });
      base64 = editResult.base64;
    } else {
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
    generationPass = 1;

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
${!hasThemeComposition && !isAlliancePoster && effectiveBrandName ? `- REMINDER: The brand name "${effectiveBrandName}" must appear as readable text in the image.` : ''}
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
          `\nFALLBACK STYLE OVERRIDE (MANDATORY): Use a sharp split-layout with a clearly defined subject area and a separate clean text-safe area.${effectiveBrandColors.length ? ` Use brand colors (${effectiveBrandColors.slice(0, 4).join(', ')}) as the dominant palette.` : ''}${!hasThemeComposition && !isAlliancePoster && effectiveBrandName ? ` Include the brand name "${effectiveBrandName}" as readable text.` : ''}`
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

    const basePngBuffer = await sharp(Buffer.from(base64, 'base64'))
      .resize({
        width: canvas.width,
        height: canvas.height,
        fit: 'cover',
        position: 'attention',
      })
      .png()
      .toBuffer();
    const baseFileName = `${folder}/linkedin-image-${generatedAt}.png`;

    const basePublicUrl = await uploadToAvailableBucket({
      db,
      fileName: baseFileName,
      data: basePngBuffer,
      contentType: 'image/png',
    });

    const baseUrl = basePublicUrl || `data:image/png;base64,${basePngBuffer.toString('base64')}`;

    let finalUrl = baseUrl;
    let finalPngBuffer = basePngBuffer;
    let logoApplied = useEditEndpoint && hasLogo && logoPlacement !== 'none';

    // Only do sharp-based overlay if we did NOT use the edit endpoint
    // and this is NOT a themed image (theme overlay handles logo placement)
    if (!useEditEndpoint && !hasThemeComposition && !isAlliancePoster && (shouldOverlayLogo || shouldInfuseLogo)) {
      if (primaryLogoBuffer) {
        let composedPngBuffer: Buffer;

        if (shouldOverlayLogo) {
          const pad = Math.max(12, Math.round(canvas.width * 0.025));
          const logoW = Math.round(canvas.width * 0.15);
          const logoH = Math.round(canvas.height * 0.15);
          const x = canvas.width - logoW - pad;
          const y = pad;

          const bgPad = Math.max(8, Math.round(canvas.width * 0.008));
          const bgX = x - bgPad;
          const bgY = y - bgPad;
          const bgW = logoW + bgPad * 2;
          const bgH = logoH + bgPad * 2;
          const bgRadius = Math.max(10, Math.round(bgH * 0.2));

          const logoCardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bgW}" height="${bgH}" viewBox="0 0 ${bgW} ${bgH}">
  <rect width="${bgW}" height="${bgH}" rx="${bgRadius}" fill="rgba(255,255,255,0.92)" />
</svg>`;

          const logoCardPngBuffer = await sharp(Buffer.from(logoCardSvg)).png().toBuffer();
          const resizedLogoBuffer = await sharp(primaryLogoBuffer)
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
          const pad = Math.max(16, Math.round(canvas.width * 0.03));
          const logoW = Math.round(canvas.width * 0.18);
          const logoH = Math.round(canvas.height * 0.18);
          const x = canvas.width - logoW - pad;
          const y = canvas.height - logoH - pad;

          const resizedLogoBuffer = await sharp(primaryLogoBuffer)
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
        finalPngBuffer = composedPngBuffer;
        logoApplied = true;
      }
    }

    if (isAlliancePoster) {
      finalPngBuffer = await composeAlliancePoster({
        width: canvas.width,
        height: canvas.height,
        baseImageBuffer: basePngBuffer,
        primaryLogoBuffer,
        secondaryLogoBuffers: posterSecondaryLogoBuffers,
        heroImageBuffer: posterHeroBuffer,
        headline: composedHeadline,
        tagline: composedTagline,
        brandName: composedBrandName,
        partnerName,
        partnerTagline,
        featureBullets: composedFeatureBullets,
        footerWebsite: composedFooterWebsite,
        footerEmail: composedFooterEmail,
        palette: effectiveBrandColors,
      });

      logoApplied = Boolean(primaryLogoBuffer || posterSecondaryLogoBuffers.length > 0);
    }

    // Generic theme composition for non-alliance-poster themes.
    // ALWAYS run for themed images — the theme overlay defines the final structure.
    if (!isAlliancePoster && hasThemeComposition) {
      // Resolve slot image URLs to buffers
      const slotImageBuffers: Record<string, Buffer> = {};
      const slotEntries = Object.entries(slotImages);
      await Promise.all(
        slotEntries.map(async ([slotId, url]) => {
          try {
            const buf = await resolveImageBufferFromSource(url);
            if (buf) slotImageBuffers[slotId] = buf;
          } catch {
            console.warn(`[theme-compose] Failed to resolve slot image for ${slotId}`);
          }
        })
      );

      finalPngBuffer = await composeThemeImage({
        width: canvas.width,
        height: canvas.height,
        baseImageBuffer: basePngBuffer,
        themeId,
        slotImageBuffers,
        primaryLogoBuffer,
        headline: composedHeadline,
        tagline: composedTagline,
        brandName: composedBrandName,
        footerWebsite: composedFooterWebsite,
        footerEmail: composedFooterEmail,
        palette: effectiveBrandColors,
        featureBullets: composedFeatureBullets,
        partnerName,
      });
      logoApplied = Boolean(primaryLogoBuffer);
    }

    if (finalPngBuffer !== basePngBuffer) {
      const composedFileName = `${folder}/linkedin-image-${generatedAt}-composed.png`;
      const composedPublicUrl = await uploadToAvailableBucket({
        db,
        fileName: composedFileName,
        data: finalPngBuffer,
        contentType: 'image/png',
      });

      finalUrl = composedPublicUrl || `data:image/png;base64,${finalPngBuffer.toString('base64')}`;
    }

    let assetId: string | null = null;
    const overlayApplied = isAlliancePoster || finalPngBuffer !== basePngBuffer;

    if (brandId) {
      try {
        const { data: asset } = await db
          .from('image_assets')
          .insert({
            brand_id: brandId,
            created_by: actingUserId,
            asset_type: overlayApplied ? 'composed' : 'base',
            source: 'ai',
            file_url: finalUrl,
            width: canvas.width,
            height: canvas.height,
            metadata: {
              headline: composedHeadline,
              tagline: composedTagline,
              theme_id: themeId,
              theme_label: selectedTheme.label,
              tone,
              style,
              model,
              type: 'linkedin-image-creator',
              logo_applied: logoApplied,
              logo_placement: logoPlacement,
              logo_baked_by_ai: useEditEndpoint && hasLogo,
              reference_image_url: referenceImageUrl || null,
              reference_as_hero: isAlliancePoster ? referenceAsHero : null,
              additional_logo_count: isAlliancePoster ? posterSecondaryLogoBuffers.length : 0,
              partner_name: partnerName || null,
              partner_tagline: partnerTagline || null,
              footer_website: composedFooterWebsite || null,
              footer_email: composedFooterEmail || null,
              feature_bullets: composedFeatureBullets,
              logo_source: providedLogoUrl ? 'uploaded' : brandKitLogoUrl ? 'brand-kit' : 'none',
              logo_url_used: effectiveLogoUrl || null,
              base_image_url: baseUrl,
              generation_nonce: generationNonce,
              generation_pass: generationPass,
              variation_directive: variationDirective,
              variation_salt: variationSalt,
              post_context_excerpt: postContext || null,
              context_brief: contextBrief || null,
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
