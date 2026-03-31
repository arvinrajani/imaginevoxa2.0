import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { generateImageBase, generateImageEdit } from '@/lib/ai/openai';
import sharp from 'sharp';
import { composeAlliancePoster } from '@/lib/studio/alliance-poster';
import { composeThemeImage, THEME_SCHEMAS } from '@/lib/studio/theme-composer';
import { applyThemeBrandFinisher } from '@/lib/studio/theme-finisher';
import { resolveServerScene } from '@/lib/studio/industry-scenes';
import { buildVoxaPromptPackage } from '@/lib/studio/voxa-prompt-spec';

export const maxDuration = 60;

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
  additionalReferenceUrls?: string[];
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
  /https?:\/\//i,
  /\S+@\S+\.[a-zA-Z]{2,}/,
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
  industry?: string | null;
  businessFocus?: string | null;
}) {
  // Priority: explicit industry field → businessFocus → keyword match against all text
  const fallbackText = `${options.productName || ''} ${options.headline || ''} ${options.postImagePrompt || ''} ${options.postText || ''} ${options.contextBrief || ''}`;
  const matched = resolveServerScene(
    options.industry,
    options.businessFocus,
    fallbackText
  );

  const parts: string[] = [matched];
  if (options.brandName) {
    parts.push(`Reflect ${options.brandName} brand personality in the environment lighting, material palette, and spatial composition.`);
  }
  if (options.productName) {
    parts.push(`Highlight product context: ${options.productName} — show it in a believable professional setting with proper staging and lighting.`);
  }
  parts.push('Keep the scene concrete and identifiable, never abstract-only. Every surface must show real material texture and catch light believably.');
  parts.push('Avoid: generic gradients, blurred bokeh-only backgrounds, empty color washes, flat featureless fills, stock photography poses. The background must look like it was shot on location by a premium commercial photographer specifically for this brand.');
  return parts.join(' ');
}

function describeThemeShape(shape: 'rect' | 'circle' | 'rounded-rect') {
  switch (shape) {
    case 'circle':
      return 'circular';
    case 'rounded-rect':
      return 'rounded-rect';
    default:
      return 'rectangular';
  }
}

function buildThemeSlotGuidance(themeId: string) {
  const schema = THEME_SCHEMAS[themeId];
  if (!schema?.imageSlots?.length) return '';

  return schema.imageSlots
    .map((slot) => {
      const right = slot.x + slot.width;
      const bottom = slot.y + slot.height;
      return `- Slot "${slot.label}" (${slot.id}) is a ${describeThemeShape(slot.shape)} image zone spanning ${slot.x}%-${right}% width and ${slot.y}%-${bottom}% height.`;
    })
    .join('\n');
}

function buildThemeSelectionGuidance(options: {
  themeId: string;
  slotImages: Record<string, string>;
  referenceImageUrl?: string | null;
  referenceAsHero?: boolean;
}) {
  const schema = THEME_SCHEMAS[options.themeId];
  const selectedSlotLines =
    schema?.imageSlots
      ?.filter((slot) => Boolean(options.slotImages[slot.id]))
      .map((slot) => `- The user selected an image for "${slot.label}" (${slot.id}). Treat it as visual truth for subject matter, materials, and scene context.`) || [];

  const lines = [
    options.referenceImageUrl
      ? `- The user has provided a direct reference image${options.referenceAsHero ? ' — it IS the primary hero/product and MUST be the visual centerpiece' : ' — it MUST appear prominently in the final poster'}.`
      : null,
    ...selectedSlotLines,
    (options.referenceImageUrl || selectedSlotLines.length)
      ? `- These are the USER'S CHOSEN images. They are NON-NEGOTIABLE. The poster must be built around showcasing these specific assets — same product, same materials, same identity.`
      : null,
    (options.referenceImageUrl || selectedSlotLines.length)
      ? `- The selected visuals MUST appear clearly, prominently, and recognizably in the final poster as the hero or major supporting panel. They should be the first thing the viewer notices.`
      : null,
    (options.referenceImageUrl || selectedSlotLines.length)
      ? `- Use the theme slot map as composition guidance, but the user's selected assets take absolute priority over rigid template adherence.`
      : null,
    (options.referenceImageUrl || selectedSlotLines.length)
      ? `- You may elevate the staging, improve lighting, and enhance the presentation, but NEVER hide the asset in vague texture, shrink it to a background element, or replace it with a different invented product.`
      : null,
  ].filter(Boolean);

  return lines.join('\n');
}

function collectUniqueImageSources(...groups: Array<Array<string | null | undefined> | null | undefined>) {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const group of groups) {
    if (!Array.isArray(group)) continue;

    for (const raw of group) {
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (!value || seen.has(value)) continue;
      seen.add(value);
      ordered.push(value);
    }
  }

  return ordered;
}

const NATIVE_LOGO_THEME_IDS = new Set([
  'guided-auto',
  'alliance-poster',
  'product-hero',
  'knowledge-visual',
  'clean-brand',
  'industrial-campaign',
  'datasheet-frame',
  'proof-stack',
  'launch-banner',
  'sector-collage',
  'brand-story',
  'offer-card',
  'comparison-board',
  'premium-editorial',
  'job-posting',
  'hiring-banner',
  'team-spotlight',
  'career-growth',
]);

function getPreferredLogoPlacement(themeId: string): 'overlay' | 'infuse' | 'none' {
  return NATIVE_LOGO_THEME_IDS.has(themeId) ? 'infuse' : 'overlay';
}

function buildThemeDirective(themeId: string) {
  // Each direction describes both the structural layout AND the specific visual atmosphere
  // the AI must generate. The AI output is a background plate — the SVG overlay composites
  // all text, logos, panels, and layout chrome on top of it.
  const themeMap: Record<string, { label: string; direction: string }> = {
    'guided-auto': {
      label: 'AI Guided',
      direction:
        'FREEFORM AI MODE: Build the COMPLETE final image yourself based on the confirmed post, selected tone/style, brand colors, references, and the user\'s "Your Vision" brief. There is NO locked template overlay for this mode. If a reference image is supplied, use it as a strong visual anchor or subject reference, but compose the full poster/image yourself. The result should feel intentional, polished, and fully art-directed rather than like a fixed template.',
    },
    'alliance-poster': {
      label: 'Alliance Poster',
      direction:
        'BACKGROUND PLATE — ALLIANCE POSTER: Generate a premium atmospheric backdrop. The SVG overlay will add a dark header band (top 15%), a LEFT product card (3%-40% width, 18%-88% height), a RIGHT text/bullets lane (44%-96%), and a footer. Your job: fill the canvas with a rich, dramatic industrial or infrastructure scene using the brand colors as dominant tones. LEFT SIDE should be visually interesting but not cluttered — machinery silhouettes, energy arcs, metallic surfaces — so the product card floats cleanly on top. RIGHT SIDE should be darker and calmer, a deep brand-colored gradient or soft texture that makes white text pop. Think Siemens or ABB campaign photography. No text, no logos, no UI of any kind.',
    },
    'product-hero': {
      label: 'Product Hero',
      direction:
        'BACKGROUND PLATE — PRODUCT HERO: Generate a clean, premium studio-quality background. The SVG overlay places a circular product showcase in the CENTER (50% width, 39% height, ~19% radius), a headline below at 72% height, and a logo card at top-left. Your job: create a surface-and-light background that makes a circular cutout product image POP. Use the brand colors for the surface — think premium automotive showroom floor, clean exhibition pedestal, or high-end product launch set. A subtle radial gradient glow centered at 50%/40% in an accent brand color adds drama. The background should be clean enough that any product drops in and immediately looks prestigious. No text, no circles drawn in advance, no UI.',
    },
    'knowledge-visual': {
      label: 'Knowledge-Led',
      direction:
        'BACKGROUND PLATE — KNOWLEDGE VISUAL: Generate a dark, technical, intelligence-rich backdrop. The SVG overlay places a reference image panel on the LEFT (4%-56% width, full height) and a text/info panel on the RIGHT (58%-96%). Your job: create a deep, confident background using brand colors. LEFT SIDE: dark but visually rich — subtle technical grid lines, circuit traces, blueprint-style depth, data visualization silhouettes, or engineering detail. RIGHT SIDE: darker and quieter so white text overlays stay readable — use a deep brand-colored gradient. The overall mood: a serious analytical brief, a McKinsey-style intelligence deck, or a technology white paper cover. No text, no panels, no UI.',
    },
    'clean-brand': {
      label: 'Clean Brand',
      direction:
        'BACKGROUND PLATE — CLEAN BRAND: Generate a light, minimal, brand-forward backdrop. The SVG overlay adds a header bar (top 14%), a LEFT headline/text column (6%-55%), a RIGHT hero image panel (60%-96%, 16%-88%), and a footer (bottom 10%). Your job: create a crisp, airy background — think high-end brand identity, Apple-style clarity, or premium editorial minimalism. Use the brand colors as LIGHT, DESATURATED surfaces rather than dark tones. A subtle gradient from brand-light to near-white, with one refined brand-colored element (a soft wash, a gentle arc, a light geometric accent) creating visual interest without noise. The RIGHT side should be clean enough for a product image card to sit naturally on top. No text, no cards, no UI.',
    },
    'industrial-campaign': {
      label: 'Industrial Campaign',
      direction:
        'BACKGROUND PLATE — INDUSTRIAL CAMPAIGN: Generate a dramatic, premium electrification campaign atmosphere. The SVG overlay places a dark header band (top 15%), a LEFT product hero card (3%-40% width, 18%-88% height), a RIGHT text/features zone (44%-96%), and a dark footer. Your job: build a richly layered industrial world using the brand palette as the DOMINANT color tone. Reference look: premium power-quality campaign art with a luminous city/plant backdrop, transmission towers or grid infrastructure silhouettes, high-voltage line geometry, metallic reflections, atmospheric depth, and engineered light streaks. Specific visual ingredients to mix with restraint: power-distribution equipment, control panels, substation structures, factory silhouettes, cable trays, electrical glow lines, reflective floor/platform surfaces, and distant city or plant lights. LIGHTING: dramatic and directional — bright electrical highlights, crisp metallic edges, deep shadows, and one or two focused light blooms. LEFT SIDE should feel like a prestige hero bay where a product can sit confidently. RIGHT SIDE should be darker, smoother, and more text-safe, but still enriched with subtle grid lines, energy traces, and industrial depth. Avoid flat blue emptiness. Avoid generic blur. The mood is high-stakes industrial engineering, premium campaign photography, and enterprise power-systems credibility. No text, no panels, no logos, no UI.',
    },
    'datasheet-frame': {
      label: 'Datasheet Frame',
      direction:
        'BACKGROUND PLATE — DATASHEET FRAME: Generate a clean, technical, brochure-quality backdrop. The SVG overlay places a LEFT product panel (4%-46% width, full height), a TOP-RIGHT info card (50%-96% width, 4%-29% height), and a 2×2 spec-card grid on the right (50%-96%, 34%-92%). Your job: create a professional technical surface using brand colors — think product catalog, engineering brochure, or premium data sheet. LEFT SIDE: a deep brand-colored panel or subtle dark gradient for the product to sit in front of. RIGHT SIDE: light, clean, almost neutral — like white paper with subtle brand-colored accents — so the spec cards read clearly. Overall: precise, well-organized, catalog-quality. No text, no cards, no grid lines, no UI.',
    },
    'proof-stack': {
      label: 'Proof Stack',
      direction:
        'BACKGROUND PLATE — PROOF STACK: Generate a credibility-rich, trustworthy backdrop. The SVG overlay places THREE stacked proof cards on the LEFT (4%-50% width) and a large RIGHT info panel (52%-96%, 8%-92%). Your job: create a clean, corporate, confidence-building background using brand colors. Think professional services firm, B2B SaaS dashboard, or enterprise brand identity. LEFT SIDE: subtle brand-colored texture or soft geometric pattern — light enough for the proof cards to sit naturally on top. RIGHT SIDE: a deep, solid brand-colored panel — the darkest brand color or a rich gradient, creating authority and contrast. A subtle dividing element between left and right (a thin brand-colored line or soft shadow) adds structure. No text, no cards, no UI.',
    },
    'launch-banner': {
      label: 'Launch Banner',
      direction:
        'BACKGROUND PLATE — LAUNCH BANNER: Generate an energetic, announcement-ready backdrop. The SVG overlay places a logo badge at top-left, an accent badge at top-right, a LARGE headline in the center-left (8% from left, 35%-45% height), and a launch label at bottom-right. Your job: create a vibrant, kinetic background using brand colors as a bold gradient sweep. Think product launch, conference keynote, or announcement campaign. Visual elements: dynamic diagonal light sweeps or color waves in brand palette, subtle motion blur streaks suggesting momentum, a soft radial burst at the center-left (where the headline sits) drawing the eye. The energy should feel: anticipation, reveal, excitement — not garish or cheesy. Bold use of brand colors, high saturation, strong luminosity. No text, no badges, no UI.',
    },
    'sector-collage': {
      label: 'Sector Collage',
      direction:
        'BACKGROUND PLATE — SECTOR COLLAGE: Generate a deep, multi-layered industry backdrop. The SVG overlay places a header band (top 16%) with logo and centered headline, THREE equal image panels side by side (3%/35%/67% x positions, 19%-68% height, 30% wide each), and sector labels at 78% height. Your job: create a rich, dark gradient background using brand colors that gives visual depth and context without competing with the three image panels. Think trade show booth backdrop or sector overview brochure. HEADER ZONE (top 16%): consistent dark brand color. PANEL ZONE (19%-68%): slightly lighter — the panels will sit on top but the background should suggest industry and depth. FOOTER ZONE (bottom 30%): smooth gradient back to the darker brand tone. Subtle atmospheric elements: industrial silhouettes, infrastructure depth, technical texture at very low opacity. No text, no panels, no UI.',
    },
    'brand-story': {
      label: 'Brand Story',
      direction:
        'BACKGROUND PLATE — BRAND STORY: Generate a warm, editorial, human-centric backdrop. The SVG overlay places a large circular portrait on the LEFT (centered at 24% width, 50% height), a logo on the RIGHT (52% width, 18% height), a serif headline, and a story-highlight label. Your job: create an inviting, warm background that feels personal and editorial. Think Mailchimp, Notion, or a premium lifestyle brand — human, approachable, trustworthy. Color approach: use the brand palette in its warmest, lightest register — soft gradients, warm ambient light from the LEFT side where the portrait sits, cooler and quieter on the RIGHT for the text column. A subtle organic texture (soft bokeh, blurred foliage, paper-like surface, gentle light leak) adds depth without distraction. No text, no circles, no logos, no UI.',
    },
    'offer-card': {
      label: 'Offer Card',
      direction:
        'BACKGROUND PLATE — OFFER CARD: Generate a bold, vibrant, product-spotlight backdrop. The SVG overlay places a LEFT info zone (4%-54% width) with badge, headline, and tagline, and a RIGHT product panel (58%-96%, full height). Your job: create a high-energy background using brand colors as a rich gradient sweep — left zone should be confident and slightly darker for text readability, right zone should create a natural spotlight stage for the product. Think: flagship product launch, premium e-commerce hero, or event sponsorship billboard. A diagonal or radial gradient transition from the left brand tone to a warmer/lighter accent on the right creates the spotlight effect. The energy: confident, premium, commercial without being cheap. No text, no badges, no panels, no UI.',
    },
    'comparison-board': {
      label: 'Comparison Board',
      direction:
        'BACKGROUND PLATE — COMPARISON BOARD: Generate a clean, analytical, professional backdrop. The SVG overlay places a top bar with logo and headline, a LEFT comparison panel (4%-48% width, 18%-92% height), and a RIGHT comparison panel (52%-96%, 18%-92%). Your job: create a neutral, well-structured background using brand colors that supports analytical side-by-side content. Think McKinsey slide, enterprise proposal deck, or product comparison page. The background should be LIGHT and ORDERLY: a very subtle two-tone split (left side fractionally lighter, right side fractionally more brand-colored) suggests the dual-panel structure without drawing attention away from it. Minimal visual noise — no textures, no atmospheric elements — just a refined, clean surface with subtle brand color identity. No text, no panels, no cards, no UI.',
    },
    'premium-editorial': {
      label: 'Premium Editorial',
      direction:
        'BACKGROUND PLATE — PREMIUM EDITORIAL: Generate a luxurious, magazine-quality backdrop. The SVG overlay places a LEFT editorial image panel (3%-33% width, full height), headline text on the RIGHT (30% height), an accent line, tagline below, and an editorial label. Your job: create a rich, dark, sophisticated background using brand colors in their most premium register. Think Rolex, Porsche, or luxury magazine — every visual element whispers quality. LEFT SIDE: deep shadows with a narrow strip of dramatic side light where the editorial image panel sits — creating a stage-lit, gallery feel. RIGHT SIDE: a deep, rich gradient in the darkest brand color — almost black but with color depth, ensuring white editorial text reads with maximum contrast. Subtle material richness: fine grain texture, deep vignette, very slight warm glow at the image panel border. No text, no panels, no lines, no UI.',
    },
    'job-posting': {
      label: 'Job Posting',
      direction:
        'BACKGROUND PLATE — JOB POSTING: Generate a professional, corporate-quality backdrop for a recruitment visual. The SVG overlay places a brand-colored "WE\'RE HIRING" header bar at top, a LEFT text column (5%-52%) with role title, description, and requirement bullets, a RIGHT image panel (58%-96%, 18%-78%) for an office/team photo, an "Apply Now" button at bottom-left, and a footer. Your job: create a clean, modern, trustworthy workplace environment background using brand colors. Think LinkedIn recruitment ad, corporate career page, or professional job board feature. LEFT SIDE: a subtle brand-tinted gradient, slightly darker, giving the text column depth without clutter. RIGHT SIDE: lighter and warmer — suggesting an office environment, workspace, or professional setting that makes the image panel feel naturally placed. The mood: professional, welcoming, opportunity-forward. Use brand colors confidently but in their corporate register — not too playful, not too dark. No text, no cards, no UI elements.',
    },
    'hiring-banner': {
      label: 'Hiring Banner',
      direction:
        'BACKGROUND PLATE — HIRING BANNER: Generate a bold, energetic, talent-attraction backdrop. The SVG overlay places a logo at top-left, a "WE\'RE HIRING" pill badge at center-top, a LARGE role title in the center, a tagline below, a "View Openings" CTA button, and a border frame. Your job: fill the canvas with a confident, vibrant gradient using brand colors at high saturation — think tech company career page hero, hiring campaign billboard, or modern recruitment poster. Visual approach: a bold diagonal or radial gradient sweep in the brand palette with a subtle radial glow at center (where the headline sits) drawing focus. Add very subtle geometric patterns or abstract shapes at low opacity — hexagons, dots, or flowing lines — suggesting innovation and growth. The energy: ambitious, modern, dynamic — not corporate-stale. Strong brand color usage, high energy, optimistic. No text, no badges, no UI.',
    },
    'team-spotlight': {
      label: 'Team Spotlight',
      direction:
        'BACKGROUND PLATE — TEAM SPOTLIGHT: Generate a warm, human, culture-forward backdrop. The SVG overlay places a large circular team photo on the LEFT (centered at 24%/50%, 18% radius), a RIGHT text panel (48%-96%) with "JOIN OUR TEAM" label, headline, tagline, value cards, and a "Join Us" CTA button. Your job: create a warm, inviting background that feels like a real workplace — approachable, vibrant, team-oriented. Think Google careers page, Notion team page, or Spotify culture blog. LEFT SIDE: warm brand-colored ambient light from the left, suggesting natural office lighting or an outdoor team gathering. A subtle warm glow where the circular photo sits creates a welcoming frame. RIGHT SIDE: slightly darker and quieter — a rich but calm brand-colored gradient for text readability. Overall mood: collaborative, human, growth-minded. Brand colors in their warmest register — think sunset office hours, team lunch light, collaborative energy. No text, no circles, no UI.',
    },
    'career-growth': {
      label: 'Career Growth',
      direction:
        'BACKGROUND PLATE — CAREER GROWTH: Generate a professional, aspirational, growth-themed backdrop. The SVG overlay places a "CAREER OPPORTUNITY" label at top, logo, headline, and tagline on the LEFT (5%-52%), numbered benefit/perk cards stacked below (4%-52%), a RIGHT image panel (56%-96%, 14%-86%) for a workplace photo, and an "Explore Roles" CTA. Your job: create an upward-looking, aspirational background using brand colors. Think LinkedIn\'s career sections, premium job board feature, or corporate growth report cover. LEFT SIDE: a clean brand gradient with subtle depth — a gentle progression from a deeper brand tone at bottom to a lighter one at top, subtly suggesting upward growth. RIGHT SIDE: warmer and slightly brighter — suggesting an open, bright workspace environment for the image panel. Include a very subtle abstract upward element: soft diagonal light sweeps, ascending dots at low opacity, or gentle ascending lines — suggesting career trajectory and growth. The mood: professional ambition, real opportunity, forward momentum. No text, no cards, no numbered elements, no UI.',
    },
  };

  return themeMap[themeId] || themeMap['guided-auto'];
}

function buildAiThemePosterGuide(themeId: string) {
  const themeMap: Record<string, { label: string; direction: string }> = {
    'guided-auto': {
      label: 'AI Guided',
      direction:
        'FULL AI POSTER MODE: Build the complete final LinkedIn poster yourself.\n'
        + '• TOP-LEFT (4% from left, 4% from top): place the brand LOGO in a clean rounded card or negative-space lockup. Make it prominent (12-20% of width).\n'
        + '• Use the full canvas to create a bespoke campaign-quality composition with strong hierarchy, premium typography, and believable atmosphere.\n'
        + '• HEADLINE: largest text element, bold sans-serif, placed in a clear text-safe zone.\n'
        + '• Tagline below headline, proof bullets below tagline, all aligned to one left edge.\n'
        + '• Use brand palette as dominant color story. Build real depth — not a flat gradient.',
    },
    'alliance-poster': {
      label: 'Alliance Poster',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• TOP HEADER BAND (top 16%): dark brand-colored strip. Place the brand LOGO in a white rounded box at LEFT (3%-24%). Place the headline text CENTERED (25%-75%) in bold white. Place partner/secondary logos at RIGHT (75%-97%) in a dark panel.\n'
        + '• LEFT HERO BAY (4%-38% width, 20%-88% height): a large rounded panel containing the product/reference image with premium framing.\n'
        + '• RIGHT PROOF LANE (42%-96% width, 20%-88% height): darker panel with a branded accent bar on the left edge. Contains: tagline at top, a thin divider line, then 4 PROOF BULLET CARDS stacked vertically with equal spacing. Each bullet card has a rounded dark background, a small colored checkmark icon on the left, and white text on the right. All cards must align to the same left edge.\n'
        + '• FOOTER STRIP (bottom 9%): brand website on left, email on right, separated by a thin line.\n'
        + 'The overall feel: premium enterprise co-branded campaign creative.',
    },
    'product-hero': {
      label: 'Product Hero',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• TOP-LEFT: brand LOGO in a white rounded card with border shadow (4% from left, 4% from top, 14-20% of canvas width). Must be the uploaded logo reproduced exactly — large and clearly visible.\n'
        + '• A horizontal accent line at 19% height spanning the left half.\n'
        + '• LEFT TEXT COLUMN (6%-50% width, 24%-84% height): brand name label at top in small caps, then the HEADLINE in large bold text (largest element), then tagline in smaller muted text, then feature bullet dots if provided, then a rounded CTA button at bottom.\n'
        + '• RIGHT HERO PANEL (55%-95% width, 14%-88% height): a large white rounded card with drop shadow containing the product/reference image centered with padding. The product image is the STAR.\n'
        + 'Background: light brand-tinted surface with subtle gradient. The mood is clean, premium, product-focused.',
    },
    'knowledge-visual': {
      label: 'Knowledge-Led',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• Full dark brand-colored background with gradient.\n'
        + '• TOP-LEFT (4% from left, 4% from top): brand LOGO in a clean rounded card (12-18% width). Must be the uploaded logo reproduced exactly.\n'
        + '• LEFT IMAGE PANEL (4%-52% width, 14%-96% height): large rounded panel with white/light background containing the reference/product image.\n'
        + '• RIGHT INFO PANEL (55%-96% width, 4%-96% height): rounded panel with brand accent tint and border. Contains: brand name label in small caps at top, HEADLINE in large bold text, tagline below, then 3 NUMBERED PROOF POINTS stacked vertically. Each proof point has a small colored numbered circle (1, 2, 3) on the left and text on the right. A CTA button at the bottom.\n'
        + 'The mood is analytical, knowledge-led, enterprise-quality.',
    },
    'clean-brand': {
      label: 'Clean Brand',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• WHITE/LIGHT background with very subtle gradient.\n'
        + '• TOP HEADER BAR (top 14%): brand LOGO in a rounded bordered card at left (12-18% of canvas width), clearly visible and prominent. Brand name text at right. Thin bottom border line.\n'
        + '• LEFT TEXT COLUMN (6%-54% width, 18%-88% height): brand name label with accent bar at top, HEADLINE in large bold dark text (largest element), tagline in muted text below, feature bullet dots if provided (small accent-colored dots with text), then a rounded accent-colored CTA button.\n'
        + '• RIGHT HERO PANEL (60%-96% width, 16%-88% height): rounded bordered card with light background containing the product/reference image.\n'
        + '• FOOTER (bottom 10%): thin top border, footer text in muted color.\n'
        + 'The mood is minimal, Apple-style clean, premium whitespace.',
    },
    'industrial-campaign': {
      label: 'Industrial Campaign',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• TOP HEADER BAND (top 14%): dark brand-colored strip with subtle industrial accents (skewed bars). Brand LOGO in a white rounded box at LEFT (3%-22%). Decorative skewed accent bars between logo and right edge. Partner/secondary logos or "Industrial Campaign" label at RIGHT.\n'
        + '• LEFT HERO BAY (3%-36% width, 18%-88% height): large rounded panel with subtle border and glow, containing the product/reference image.\n'
        + '• RIGHT INFO PANEL (42%-96% width, 18%-88% height): dark semi-transparent panel with branded accent bar on left edge. Contains: HEADLINE at top in large bold white text, tagline in brand accent color below, a short accent-colored divider bar, then 4 PROOF BULLET CARDS stacked with equal spacing. Each card has a dark rounded background, an accent-colored checkmark icon on left, white text on right. All cards align to the same left edge.\n'
        + '• FOOTER STRIP (bottom 8%): brand website on left, contact on right.\n'
        + '• BACKGROUND: rich industrial atmosphere with brand-colored gradient, subtle energy arc lines, infrastructure depth.\n'
        + 'The feel: premium electrification campaign, Siemens/ABB quality.',
    },
    'datasheet-frame': {
      label: 'Datasheet Frame',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• Light/white background with subtle brand tint.\n'
        + '• LEFT PRODUCT PANEL (4%-46% width, 4%-96% height): rounded panel with brand-colored dark background containing the product/reference image.\n'
        + '• TOP-RIGHT INFO CARD (50%-96% width, 4%-28% height): white rounded card with border. Contains: brand LOGO (12-16% of canvas width) prominently at top-left corner of this card, clearly visible. Brand name beside it, HEADLINE in bold dark text below, tagline below that.\n'
        + '• BOTTOM-RIGHT SPEC GRID (50%-96% width, 32%-96% height): 2x2 grid of white rounded cards with borders. Each card has a small numbered circle badge (1-4) and specification text below.\n'
        + 'The mood is technical datasheet, brochure-quality, catalog precision.',
    },
    'proof-stack': {
      label: 'Proof Stack',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• Light background with subtle brand tint.\n'
        + '• LEFT PROOF COLUMN (4%-50% width, 4%-96% height): 3 stacked proof cards filling the height equally with gaps. Each card is a rounded bordered panel with brand accent tint. Contains: a numbered badge circle (1, 2, 3) on the left and proof point text on the right.\n'
        + '• RIGHT INFO PANEL (52%-96% width, 4%-96% height): dark brand-colored rounded panel. Contains: brand LOGO prominently at top (12-18% of canvas width, clearly visible with breathing room), brand name label below it, HEADLINE in large bold white text, tagline in lighter text, then a CTA button at bottom.\n'
        + 'The mood is evidence-driven, trustworthy, enterprise-ready.',
    },
    'launch-banner': {
      label: 'Launch Banner',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• VIBRANT brand-colored gradient background with energy (diagonal sweeps, radial glow).\n'
        + '• TOP ROW: brand LOGO in a white rounded pill at left (4% from left, 5% from top, 14-20% of canvas width — large and clearly visible), brand name badge in accent color at right.\n'
        + '• CENTER-LEFT (8% from left, 22% from top): HEADLINE in very large bold white text (the dominant element). Tagline in smaller white/muted text below.\n'
        + '• Feature bullet dots below tagline if provided (small accent-colored dots with white text).\n'
        + '• BOTTOM ROW (8% from bottom): brand name pill at left, white rounded CTA button at right.\n'
        + 'The energy: launch announcement, conference keynote reveal, momentum.',
    },
    'sector-collage': {
      label: 'Sector Collage',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• DARK brand-colored gradient background.\n'
        + '• TOP HEADER BAND (top 16%): dark brand panel. Brand LOGO in a white rounded box at LEFT. HEADLINE in large bold white text at RIGHT side of header. Tagline in smaller text below headline.\n'
        + '• THREE EQUAL IMAGE PANELS side by side (3% gap between, spanning 3%-97% width, 19%-74% height): each is a rounded panel showing a different product/application/sector image. If only one reference image is available, show it in the center panel and use related industry imagery for the other two.\n'
        + '• THREE INFO CARDS at bottom (3%-97% width, 78%-94% height): each is a dark rounded card with a small numbered circle badge (1, 2, 3) at top center and a label/feature text below.\n'
        + 'The mood is industry overview, trade show quality, multi-sector capability showcase.',
    },
    'brand-story': {
      label: 'Brand Story',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• Light warm editorial background with subtle brand tint.\n'
        + '• LEFT: large oval/rounded portrait or product image (centered at 24% width, 50% height, taking ~36% width) with shadow.\n'
        + '• RIGHT COLUMN (52%-96% width, 10%-90% height): brand LOGO prominently at top (12-18% of canvas width, clearly visible), HEADLINE in large bold dark text, tagline in muted text, feature bullet dots if provided, then CTA button + accent line at bottom.\n'
        + 'The mood is editorial, storytelling, magazine-feature quality.',
    },
    'offer-card': {
      label: 'Offer Card',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• Rich brand-colored gradient background.\n'
        + '• LEFT INFO ZONE (4%-56% width, 4%-96% height): rounded panel with semi-transparent background. Contains: brand LOGO prominently at top (12-18% of canvas width, clearly visible with clean contrast), "Special Offer" badge in accent color, HEADLINE in large bold white text, tagline, feature bullet dots if provided, then white CTA button.\n'
        + '• RIGHT HERO PANEL (58%-96% width, 4%-96% height): white/light rounded panel containing the product/reference image.\n'
        + 'The mood is bold, product-spotlight, premium commercial.',
    },
    'comparison-board': {
      label: 'Comparison Board',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• WHITE background with subtle gradient.\n'
        + '• TOP ROW (4% from top): brand LOGO in a rounded card at left (12-16% of canvas width, clearly visible), HEADLINE in bold dark text next to it.\n'
        + '• TWO EQUAL COLUMNS (4%-48% and 52%-96% width, 18%-92% height): LEFT column is a white rounded card with border containing "Operational Value" label, an image area, and 2 numbered bullet points. RIGHT column is a rounded card with accent-color tint and border containing "Protection & Control" label, an image area, and 2 numbered bullet points.\n'
        + 'The mood is analytical, structured, comparison-focused.',
    },
    'premium-editorial': {
      label: 'Premium Editorial',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• DARK luxurious brand-colored background.\n'
        + '• TOP-LEFT (3% from left, 3% from top): brand LOGO in an elegant negative-space lockup (12-18% width). Must be the uploaded logo reproduced exactly.\n'
        + '• LEFT IMAGE PANEL (3%-33% width, 12%-97% height): rounded panel with the editorial/reference image.\n'
        + '• RIGHT TEXT AREA (38%-96% width): accent line + "Editorial" label at top, HEADLINE in large bold white serif font, another accent line, tagline text below, feature bullets if provided, then at bottom: brand name on left, CTA button on right.\n'
        + 'The mood is magazine-quality luxury, Rolex/Porsche editorial.',
    },
    'job-posting': {
      label: 'Job Posting',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• Brand-colored gradient background.\n'
        + '• TOP HEADER BAR (top 12%): solid accent-colored bar with "WE\'RE HIRING" in bold white centered text. Brand LOGO prominently at top-left (12-18% of canvas width, clearly visible).\n'
        + '• LEFT TEXT COLUMN (4%-52% width, 16%-84% height): rounded semi-transparent panel. HEADLINE (job title) in very large bold white text at top, tagline/description below, feature bullet dots with accent-colored dot markers, CTA button "Apply Now" at bottom.\n'
        + '• RIGHT PHOTO PANEL (58%-96% width, 18%-84% height): rounded white/light panel for workplace/team photo.\n'
        + '• FOOTER (bottom 6%): contact info centered in muted text.\n'
        + 'The mood: professional recruitment, corporate careers page.',
    },
    'hiring-banner': {
      label: 'Hiring Banner',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• VIBRANT brand gradient background (accent to support color sweep) with subtle radial glow.\n'
        + '• Rounded border frame inset 3% from edges.\n'
        + '• Brand LOGO at top-left (4%, 4%, 14-20% of canvas width — large and clearly visible with clean contrast).\n'
        + '• "WE\'RE HIRING" pill badge centered near top (17% from top) with contrasting background.\n'
        + '• HEADLINE centered at vertical middle (32%-50% from top): VERY LARGE bold white text, the dominant focal element.\n'
        + '• Tagline centered below headline in smaller white text.\n'
        + '• Feature tags as small pills below tagline if provided.\n'
        + '• CTA button "View Openings" centered at 70% height.\n'
        + '• FOOTER (bottom 7%): semi-transparent bar with contact info.\n'
        + 'The energy: ambitious tech recruitment, scroll-stopping.',
    },
    'team-spotlight': {
      label: 'Team Spotlight',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• Dark brand-colored gradient background.\n'
        + '• LEFT: large circular photo frame (centered at 24% width, 50% height) with ring border, containing team/workplace image.\n'
        + '• RIGHT PANEL (48%-96% width, 4%-92% height): semi-transparent rounded panel. Brand LOGO prominently at top-left of panel (12-18% of canvas width, clearly visible), "JOIN OUR TEAM" label in accent color, HEADLINE in large bold white text, tagline below, then 2-3 feature value cards as small rounded dark pills, CTA button "Join Us" at bottom.\n'
        + '• FOOTER (bottom 6%): contact info centered.\n'
        + 'The mood: warm, team culture, employer brand.',
    },
    'career-growth': {
      label: 'Career Growth',
      direction:
        'Create the COMPLETE poster with this EXACT layout structure:\n'
        + '• Brand-colored gradient background (darker at bottom, lighter at top suggesting growth).\n'
        + '• Brand LOGO at top-left (5%, 4%, 14-20% of canvas width — large and clearly visible with clean contrast).\n'
        + '• "CAREER OPPORTUNITY" label in accent color at 13% from top.\n'
        + '• LEFT TEXT AREA (5%-52% width): HEADLINE in large bold white text at 18% from top, tagline below at 34%.\n'
        + '• LEFT BENEFIT CARDS (4%-52% width, 44%-80% height): 4 stacked rounded cards with semi-transparent background. Each has a numbered accent-colored circle (1-4) and benefit text.\n'
        + '• RIGHT PHOTO PANEL (56%-96% width, 14%-86% height): rounded white panel for workplace photo.\n'
        + '• CTA button "Explore Roles" at bottom-left.\n'
        + '• Footer text at bottom-right.\n'
        + 'The mood: aspirational career, upward growth, professional ambition.',
    },
  };

  return themeMap[themeId] || themeMap['guided-auto'];
}

function buildAiThemeStructureGuide(themeId: string, hasStructuredBranding: boolean) {
  const shared = hasStructuredBranding
    ? [
        'STRUCTURAL BRAND LANES (MANDATORY):',
        '- A structured composition pass will lock the exact selected logo(s), partner marks, and footer/contact details into disciplined brand lanes after you render the main poster.',
        '- Reserve those lanes by keeping them visually calm, high-contrast, and free of critical subject matter, dense props, or tiny text.',
        '- Do not place the hero subject, product edges, headline block, or bullet stack where the locked brand/header/footer treatment must sit.',
        '- Do not invent duplicate floating logos, duplicate footer strips, or alternate brand badges outside the reserved structure.',
      ]
    : [
        'THEME ZONE MAP (MANDATORY):',
        '- The selected theme is a placement and portrayal brief for the AI-rendered final poster, not a later SVG overlay.',
        '- Render the full poster yourself: AI-generated background scene, hero visual, headline hierarchy, proof bullets, footer details when they fit, and the exact supplied logo integrated into the design.',
        '- Put the supplied logo in a crisp top brand/header lane with clean contrast and enough negative space for perfect readability.',
        '- Make the logo feel native to a real design surface: a header fascia, glass strip, metal plate, printed brand band, negative-space lockup, or structural chrome element.',
        '- If the theme implies a header band, footer strip, text panel, or proof card system, render those structures visibly with real tonal separation or surfaces so elements do not feel like they are floating.',
        '- Keep the theme lanes real and disciplined: one clear hero area, one clear text-safe/message lane, and a calm footer edge when contact details are used.',
        '- Do not turn the logo into a watermark, background texture, tiny corner artifact, pasted sticker, or random floating badge. It should feel intentionally designed into the poster.',
      ];

  const themeSpecificMap: Record<string, string[]> = {
    'alliance-poster': [
      '- Reserve a disciplined top brand band in the top 14% of the canvas.',
      '- Treat that brand band like a real integrated fascia with believable edge definition, not a floating white card strip.',
      '- Keep a left header lockup zone clear at roughly x 3%-24%, y 3%-12% for the primary brand mark.',
      '- Keep a central headline lane calm at roughly x 24%-74%, y 3%-15%. The main headline should live here, not lower in the frame.',
      '- Keep a right partner-header zone clear at roughly x 75%-97%, y 3%-12% for secondary logos and partner text.',
      '- Reserve a left hero bay at roughly x 4%-42%, y 20%-88% for the main product or reference visual.',
      '- Reserve a right proof lane at roughly x 50%-95%, y 24%-84% for the benefits stack.',
      '- PROOF BULLETS in the right lane: stack them with a shared left edge at x ~52%. Use identical vertical gaps. Each bullet gets a consistent marker (filled circle or brand accent bar). Keep bullets to one line each.',
      '- HEADLINE in the right lane: bold, commanding, 2-3x larger than bullet text. Place at top of the proof lane.',
      '- Avoid generic frosted logo cards unless a restrained plated surface is absolutely required for contrast. Prefer integrated header modules and native lockups.',
      '- Keep the bottom 8% clean for a locked footer strip with website/email.',
    ],
    'industrial-campaign': [
      '- Reserve the top 14% for a disciplined brand/header treatment.',
      '- Make that header treatment feel engineered: a built-in beam, panel, fascia, or plated strip with believable lighting, not a floating sticker zone.',
      '- Keep the primary brand zone calm at top-left and the partner/logo zone calm at top-right.',
      '- Reserve a strong left hero bay at roughly x 4%-36%, y 18%-88% for the product visual.',
      '- Reserve a right information panel at roughly x 43%-96%, y 18%-88% for the headline and proof bullets.',
      '- HEADLINE: Place at the top of the right panel, bold 800+ weight, occupying 20-30% of the panel width. Must be the largest text element.',
      '- PROOF BULLETS in the right panel: stack below the headline with identical spacing. All bullets share one left edge at x ~45%. Use consistent filled-circle or accent-bar markers. Keep each bullet to one clean line.',
      '- Keep logos native to the header structure. No random corner stamps, no pasted sticker marks, and no default white logo cards unless absolutely necessary for legibility.',
      '- Keep the bottom 8%-9% calm and readable for the footer strip.',
    ],
    'clean-brand': [
      '- Reserve the top 14% for a restrained brand/header treatment and the bottom 10% for footer information.',
      '- Keep the left narrative column clean at roughly x 6%-55%, y 20%-78% for headline and supporting copy.',
      '- HEADLINE: Place at the top of the left column with bold 800+ weight. It should be the largest, most commanding text element in the entire poster.',
      '- TAGLINE: Place below headline at 50-60% of headline size, with 1-2 line-heights of space above.',
      '- PROOF BULLETS: Stack below tagline in the left column. All bullets share one left edge at x ~8%. Identical vertical gaps between each. Use consistent markers. Keep each bullet to one line.',
      '- Keep the right hero zone clean at roughly x 60%-96%, y 18%-86% for the selected product or reference visual.',
    ],
    'product-hero': [
      '- Reserve the top 14% for a restrained brand/header treatment with the logo prominently placed.',
      '- The product/reference image is the STAR — it should occupy 40-60% of the canvas as the commanding hero visual.',
      '- HEADLINE: Place in a clean text-safe zone opposite or below the product. Bold 800+ weight, 3-4x larger than any supporting text. Must feel like a premium campaign headline.',
      '- PROOF BULLETS: If included, stack them with consistent markers and identical spacing in the text lane. All share one left edge. Keep each bullet to one line.',
      '- Keep the bottom 8% clean for footer details if needed.',
    ],
    'knowledge-visual': [
      '- Full dark brand-colored background with gradient.',
      '- LEFT IMAGE PANEL at roughly x 4%-52%, y 4%-96%: rounded panel with light background for the product/reference image.',
      '- RIGHT INFO PANEL at roughly x 55%-96%, y 4%-96%: rounded panel with brand accent tint and border.',
      '- Inside the right panel: brand name label in small caps at top, HEADLINE in bold text (largest element), tagline below.',
      '- Below tagline: 3 NUMBERED PROOF POINTS stacked vertically. Each has a small colored numbered circle (1, 2, 3) on the left and text on the right. Consistent spacing between points.',
      '- CTA button at the bottom of the right panel.',
      '- Do not overlap the image panel with text elements.',
    ],
    'datasheet-frame': [
      '- Light/white background with subtle brand tint.',
      '- LEFT PRODUCT PANEL at roughly x 4%-46%, y 4%-96%: rounded panel with dark brand-colored background for the product/reference image.',
      '- TOP-RIGHT INFO CARD at roughly x 50%-96%, y 4%-28%: white rounded card with border. Contains logo + brand name at top-left, HEADLINE in bold dark text, tagline below.',
      '- BOTTOM-RIGHT SPEC GRID at roughly x 50%-96%, y 32%-96%: 2x2 grid of 4 white rounded cards with borders. Each card has a small numbered circle badge (1-4) and specification text.',
      '- Keep the grid cards evenly sized and consistently spaced.',
      '- The overall feel is technical sell-sheet, datasheet catalog quality.',
    ],
    'proof-stack': [
      '- Light background with subtle brand tint.',
      '- LEFT PROOF COLUMN at roughly x 4%-50%, y 4%-96%: 3 stacked proof cards filling the height equally with gaps between them. Each card is a rounded bordered panel with brand accent tint. Contains a numbered badge circle (1, 2, 3) on the left and proof point text on the right.',
      '- RIGHT INFO PANEL at roughly x 52%-96%, y 4%-96%: dark brand-colored rounded panel. Contains logo at top, brand name label, HEADLINE in large bold white text, tagline in lighter text, CTA button at bottom.',
      '- All 3 proof cards must be consistently sized and evenly spaced.',
      '- Do not overlap the proof column with the info panel.',
    ],
    'launch-banner': [
      '- Vibrant brand-colored gradient background with energy (diagonal sweeps, radial glow).',
      '- TOP ROW: logo in a white rounded pill at left (x 4%, y 5%), brand name badge in accent color at right.',
      '- CENTER-LEFT (x 8%, y 22%): HEADLINE in very large bold white text — the dominant focal element. Tagline in smaller white text below.',
      '- Feature bullet dots below tagline if provided (accent-colored dots with white text).',
      '- BOTTOM ROW (y ~92%): brand name pill at left, white rounded CTA button at right.',
      '- Keep the headline in the center-left zone, not squeezed to corners.',
    ],
    'sector-collage': [
      '- Dark brand-colored gradient background.',
      '- TOP HEADER BAND (top 16%): dark brand panel. Logo in a white rounded box at LEFT. HEADLINE in large bold white text at RIGHT of header. Tagline in smaller text below headline.',
      '- THREE EQUAL IMAGE PANELS side by side (x 3%-97%, y 19%-74%, ~3% gap between panels): each rounded panel shows a different product/application/sector image.',
      '- THREE INFO CARDS at bottom (x 3%-97%, y 78%-94%): each is a dark rounded card with a small numbered circle badge (1, 2, 3) at top and label text below.',
      '- The 3 image panels and 3 info cards must be EQUAL width and aligned to each other vertically.',
      '- Do not let panel imagery bleed into the header or card zones.',
    ],
    'brand-story': [
      '- Light warm editorial background with subtle brand tint.',
      '- LEFT: large oval or rounded portrait/product image centered at roughly x 24%, y 50%, taking ~36% width. Apply shadow.',
      '- RIGHT COLUMN at roughly x 52%-96%, y 10%-90%: logo at top, HEADLINE in large bold dark text, tagline in muted text, feature bullet dots if provided, CTA button + accent line at bottom.',
      '- Keep the portrait image and text column well-separated with breathing room.',
      '- The mood is editorial, storytelling, magazine-feature quality.',
    ],
    'offer-card': [
      '- Rich brand-colored gradient background.',
      '- LEFT INFO ZONE at roughly x 4%-56%, y 4%-96%: rounded panel with semi-transparent background. Contains logo at top, "Special Offer" badge in accent color, HEADLINE in large bold white text, tagline, feature bullet dots if provided, white CTA button at bottom.',
      '- RIGHT HERO PANEL at roughly x 58%-96%, y 4%-96%: white/light rounded panel containing the product/reference image.',
      '- Keep both zones clearly separated with disciplined edges.',
    ],
    'comparison-board': [
      '- White background with subtle gradient.',
      '- TOP ROW (y 4%): logo in a small rounded card at left, HEADLINE in bold dark text next to it.',
      '- TWO EQUAL COLUMNS: LEFT at x 4%-48%, y 18%-92% (white rounded card with border, "Operational Value" label, image area, 2 numbered bullet points). RIGHT at x 52%-96%, y 18%-92% (accent-tinted rounded card with border, "Protection & Control" label, image area, 2 numbered bullet points).',
      '- Both columns must be exactly equal width, aligned at the same top and bottom edges.',
      '- Keep the bottom edge clean for footer if needed.',
    ],
    'premium-editorial': [
      '- Dark luxurious brand-colored background.',
      '- LEFT IMAGE PANEL at roughly x 3%-33%, y 3%-97%: rounded panel with the editorial/reference image.',
      '- RIGHT TEXT AREA at roughly x 38%-96%: accent line + "Editorial" label at top, HEADLINE in large bold white serif font, another accent line, tagline text below, feature bullets if provided. At bottom: brand name on left, CTA button on right.',
      '- Keep the image panel and text area clearly separated with luxury-grade spacing.',
      '- The mood is magazine-quality luxury, aspirational editorial.',
    ],
    'job-posting': [
      '- Reserve the top 14% for an employer-brand header band with logo at left and hiring badge or label at right.',
      '- Keep the left text lane at roughly x 5%-52%, y 20%-78% for the role title, description, and requirement bullets.',
      '- ROLE TITLE HEADLINE: Bold 800+ weight, occupying the top of the left lane. Must be the largest text element — 3x bigger than bullet text.',
      '- REQUIREMENT BULLETS: Stack them below the role description with identical vertical gaps. All share one clean left edge at x ~7%. Use consistent filled-circle markers. Keep each to one line — 2-3 bullets maximum, not more.',
      '- Keep the right photo lane at roughly x 58%-96%, y 18%-78% clear for a workplace or team photo.',
      '- Place the CTA button at bottom-left near roughly x 5%-30%, y 82%-90%, with ample breathing room.',
      '- Keep the bottom 8% clean for a footer strip with contact details.',
    ],
    'hiring-banner': [
      '- Reserve the top-left zone for the brand logo at roughly x 4%-20%, y 4%-12%. Logo must be clear and prominent.',
      '- Place the hiring badge/pill centered at top near y 12%-18%.',
      '- HEADLINE: Keep the main headline centered in the vertical middle near y 35%-50% with generous left/right padding (8% each side). Bold 800-900 weight, the largest text in the poster by far — commanding and scroll-stopping.',
      '- TAGLINE: Place directly below the headline near y 52%-58% at 50-60% of headline size.',
      '- Place the CTA button centered near y 65%-75%.',
      '- Keep the bottom 8% clean for a footer/contact lane.',
      '- The border frame or brand accent should have at least 3% padding from the canvas edge.',
    ],
    'team-spotlight': [
      '- Reserve a top brand zone at top-left for the employer logo.',
      '- Place the circular team photo on the LEFT centered at roughly x 24%, y 50% with ~18% radius.',
      '- Keep the right text panel at roughly x 48%-96%, y 20%-80% for the JOIN OUR TEAM label, headline, tagline, and value cards.',
      '- Place the CTA button in the right panel near y 82%-90%.',
      '- Keep the bottom 8% clean for a footer lane.',
      '- Do not overlap the circular photo with text or branding elements.',
    ],
    'career-growth': [
      '- Reserve the top lane for a CAREER OPPORTUNITY label and brand logo.',
      '- Keep the left column at roughly x 5%-52%, y 18%-88% for the headline, tagline, and numbered benefit cards.',
      '- Keep the right image panel at roughly x 56%-96%, y 14%-86% for the workplace photo.',
      '- Place the CTA button at bottom-left near y 84%-92%.',
      '- Keep the bottom 8% clean for a footer strip with contact details.',
      '- Number circles for benefit cards should be compact and consistently sized.',
    ],
  };

  const themeSpecific = themeSpecificMap[themeId] || [
    '- Reserve a calm top brand lane (top 14%) for the logo and header treatment, and a clean bottom footer lane (bottom 8%).',
    '- Keep the main hero subject and the headline/proof copy inside their intended zones with breathing room away from those reserved strips.',
    '- HEADLINE: Bold 800+ weight, the largest text element in the poster. Place it prominently with clean contrast behind it.',
    '- PROOF BULLETS: If used, stack them with identical vertical spacing, consistent markers (filled circles or brand accent bars), and one shared left edge. Keep each to one line.',
    '- All text must share one clean left alignment edge per column. No scattered or randomly staggered text.',
  ];

  return [...shared, ...themeSpecific].join('\n');
}

function buildAiReadabilityGuide(
  imageAspect: 'landscape' | 'square' | 'portrait'
) {
  const aspectSpecific =
    imageAspect === 'portrait'
      ? [
          '- Portrait: headline max 2-3 lines, tagline max 2 short lines, proof bullets max 3, footer max 1 short line.',
          '- Portrait: keep the top brand/header lane clear, keep the text in one strong column, and avoid crowding the lower third.',
          '- Portrait: if proof bullets would wrap awkwardly, rewrite them as very short proof tags or compact chips rather than forcing long wrapped lines.',
        ]
      : imageAspect === 'square'
        ? [
            '- Square: headline max 2-3 lines, tagline max 2 short lines, proof bullets max 3, footer max 1 short line.',
            '- Square: keep generous padding on all sides and do not scatter text into multiple unrelated corners.',
            '- Square: if proof bullets would wrap awkwardly, rewrite them as very short proof tags or compact chips rather than forcing long wrapped lines.',
          ]
        : [
            '- Landscape: headline max 3 lines, tagline max 1-2 short lines, proof bullets max 3-4 short lines only if spacing stays premium, footer max 1 short line.',
            '- Landscape: keep the hero lane and the text lane clearly separated so the reading column stays calm and highly legible.',
        ];

  const shared = [
    'LAYOUT / READABILITY GUARDRAILS (MANDATORY):',
    '- Use one headline block only. Do not duplicate, echo, or repeat the headline elsewhere in the poster.',
    '- Keep the logo/header, headline block, tagline, proof bullets, hero subject, and footer in distinct lanes with visible breathing room between them.',
    '- ALIGNMENT GRID: Imagine an invisible vertical grid with one strong left margin line. The headline left edge, tagline left edge, and ALL bullet left edges MUST align to this same vertical line. Do not indent, offset, or stagger them inconsistently.',
    '- BULLET RENDERING: Stack bullets vertically with IDENTICAL spacing. Every bullet gets the same marker (filled circle or accent bar) at the same X position. Result must look professionally typeset.',
    '- SPACING RHYTHM: Consistent gaps throughout — same gap between headline/tagline, tagline/first bullet, and between each bullet.',
    '- Avoid awkward text wrapping with one stranded word on its own line. Shorten the line instead.',
    '- If the copy feels crowded, shorten, simplify, or omit lower-priority text before reducing font size. ALWAYS prefer fewer, larger, cleaner lines over cramming more text in.',
    '- Footer/contact details are lowest priority. Drop them first if space is tight.',
    '- If a footer/contact line is included, anchor it in a calm bottom lane near the lower edge. Never let it float in the middle of the poster.',
    '- Rewrite proof bullets for fit when necessary, preserving meaning but keeping each bullet to one clean line. No bullet should wrap to a second line.',
    '- MAXIMUM TEXT DENSITY: Never show more than 4 proof bullets. If more exist, select only the 2-3 strongest. White space is more premium than extra text.',
    '- Never let text touch the canvas edge, overlap the logo, overlap the hero subject, or run into the footer zone. Maintain at least 5% canvas padding on all sides.',
    '- Always keep a clear calm surface behind text so contrast remains strong at LinkedIn feed size.',
  ];

  return [...shared, ...aspectSpecific].join('\n');
}

function buildStructuredBrandContentGuide(options: {
  themeId: string;
  brandName: string;
  headline: string;
  tagline: string;
  partnerName: string;
  partnerTagline: string;
  footerWebsite: string;
  footerEmail: string;
  hasPrimaryLogo: boolean;
  secondaryLogoCount: number;
}) {
  const brandName = options.brandName.trim();
  const headline = options.headline.trim();
  const tagline = options.tagline.trim();
  const partnerName = options.partnerName.trim();
  const partnerTagline = options.partnerTagline.trim();
  const footerWebsite = options.footerWebsite.trim();
  const footerEmail = options.footerEmail.trim();
  const hasPartnerLockup = options.secondaryLogoCount > 0 || Boolean(partnerName || partnerTagline);

  const lines = [
    'USER-SELECTED BRAND CONTENT (DO NOT IGNORE OR REPLACE):',
    options.hasPrimaryLogo
      ? `- Primary brand mark: exact selected main logo for "${brandName || 'the brand'}". Leave a clean, premium lane for it.`
      : brandName
      ? `- Primary brand text reference: "${brandName}". If the brand name appears, spell it exactly.`
      : null,
    headline
      ? `- Selected headline: "${headline}". Treat this as the primary message, not optional filler.`
      : null,
    tagline
      ? `- Selected supporting line: "${tagline}". Use it only if it stays large and readable.`
      : null,
    hasPartnerLockup
      ? `- Partner/header lockup: ${[
          options.secondaryLogoCount > 0 ? `${options.secondaryLogoCount} selected partner logo(s)` : null,
          partnerName ? `partner name "${partnerName}"` : null,
          partnerTagline ? `partner line "${partnerTagline}"` : null,
        ]
          .filter(Boolean)
          .join(', ')}.`
      : null,
    footerWebsite || footerEmail
      ? `- Footer/contact lockup: ${[footerWebsite, footerEmail].filter(Boolean).join(' | ')}. Keep this information exact and readable.`
      : null,
    '- Never replace selected footer details with fake placeholders, random domains, or invented contact information.',
  ].filter(Boolean) as string[];

  const themeSpecificMap: Record<string, string[]> = {
    'alliance-poster': [
      '- For Alliance Poster: place the primary logo on the left side of the top brand band, the main headline in the center of that band, the partner lockup on the right, the hero product on the left body zone, and proof bullets on the right body zone.',
      '- Treat the top brand band as a real co-branded structural fascia with integrated lockups. Do not let either logo feel pasted on top of a generic panel.',
      '- Do not move the main headline into a competing oversized body block if the top band structure is active.',
      '- The body should support the headline band, not fight it.',
    ],
    'industrial-campaign': [
      '- For Industrial Campaign: keep a disciplined top brand/header band with the primary logo left, partner/header details right, and the selected headline treated as the dominant campaign message.',
      '- The brand lockup should feel engineered into the header surface itself: metal plate, glass strip, beam, or native negative-space lockup rather than a sticker or floating badge.',
      '- Use the left body as the prestige product bay and the right body as the proof/message lane.',
    ],
    'clean-brand': [
      '- For Clean Brand: keep the brand/header treatment restrained and elegant, with the narrative headline on the left and the hero visual on the right.',
    ],
    'knowledge-visual': [
      '- For Knowledge Visual: keep the primary brand mark in the top-left, the reference or evidence panel fills the left side, and the headline/insight text fills the right column.',
    ],
    'product-hero': [
      '- For Product Hero: the brand mark sits in a corner zone, the product is the uncontested center hero, and the headline sits cleanly below or beside it — never compete with the product.',
    ],
    'datasheet-frame': [
      '- For Datasheet Frame: the brand mark and product name anchor the top-left, the product fills the main left panel, and spec/info modules fill the right grid — keep it precise and brochure-clean.',
    ],
    'proof-stack': [
      '- For Proof Stack: keep the brand mark visible in the header, the proof cards on the left stacked clearly, and the narrative panel on the right with the headline and supporting context.',
    ],
    'launch-banner': [
      '- For Launch Banner: the brand mark is in the top-left corner, the dominant announcement headline is centered and large, and no second competing headline block should appear elsewhere.',
    ],
    'job-posting': [
      '- For Job Posting: the brand mark is at the top-left inside the accent header band, the role title is the primary headline on the left column, and the workplace image is on the right.',
      '- Keep the footer website/contact detail exact — never invent a URL or email address.',
    ],
    'hiring-banner': [
      '- For Hiring Banner: the brand mark is in the header zone, the WE\'RE HIRING badge is centered near the top, the role title is the dominant centered headline, and only one CTA button appears.',
    ],
    'team-spotlight': [
      '- For Team Spotlight: the brand mark is in the top-left header zone, the circular team image anchors the left body, and the JOIN OUR TEAM copy fills the right column.',
    ],
    'career-growth': [
      '- For Career Growth: the brand mark is in the top-left header zone, the career opportunity label and headline are on the left, numbered benefit cards stack below them, and the workplace image is on the right.',
    ],
  };

  const themeSpecific = themeSpecificMap[options.themeId] || [
    '- Keep the selected brand/logo/header/footer details inside clean, premium lanes instead of scattering them randomly across the poster.',
  ];

  return [...lines, ...themeSpecific].join('\n');
}

function buildVariationDirective(
  nonce: number,
  themeId: string,
  context?: {
    brandName?: string;
    headline?: string;
    industry?: string;
    postExcerpt?: string;
  }
) {
  // Variations shift atmosphere, composition emphasis, and supporting scene detail,
  // while staying recognizable to the chosen theme family.
  const themedRecipes: Record<string, string[]> = {
    'alliance-poster': [
      'Variation: industrial switchgear hall — rows of electrical panels, brand-colored indicator lights, dramatic ceiling-mounted floods casting hard shadows. Deep brand-dark atmosphere.',
      'Variation: outdoor power transmission — high-voltage pylons receding into distance, brand-colored sky at dusk, ground-level infrastructure. Epic scale, brand palette dominates.',
      'Variation: control room environment — technical operator consoles, screens with colored data displays, brand-toned ambient light from multiple sources. Premium engineering mood.',
    ],
    'product-hero': [
      'Variation: studio pedestal on a deep brand-colored surface — soft gradient light from above-left, subtle reflection beneath, dark vignette around edges. Clean and dramatic.',
      'Variation: premium exhibition stand — white or brand-colored table surface, warm key light from one side, soft fill from the other. Product launch event feel.',
      'Variation: minimal tech surface — dark glass or brushed metal surface, brand-colored edge lighting, soft bokeh background. High-end electronics catalog quality.',
    ],
    'knowledge-visual': [
      'Variation: data center corridor — server rack rows receding in perspective, brand-colored indicator glow, dark ambient with precision lighting. Technical authority.',
      'Variation: research workspace — dark desk surface, technical instruments, brand-colored light from a monitor glow, deep shadow zones. Analytical and intelligent.',
      'Variation: engineering blueprint surface — dark background with brand-colored technical grid lines and dimension marks at very low opacity. Pure technical depth.',
    ],
    'industrial-campaign': [
      'Variation: electrical substation at dusk — transformer equipment, insulator strings, brand-colored sky, foreground switchgear detail. Infrastructure scale and drama.',
      'Variation: manufacturing control panel — close-up of industrial control equipment, circuit breakers, LED indicators, brand-colored metallic surfaces. Technical precision.',
      'Variation: power distribution facility — interior of a switchgear room, brand-palette metal cabinets, overhead industrial lighting creating long shadows and metallic highlights.',
    ],
    'datasheet-frame': [
      'Variation: clean product photography set — white-to-brand-color gradient surface, precise catalog lighting, minimal reflection. Professional technical catalog look.',
      'Variation: engineering lab surface — light neutral background, precise instrument-quality shadows, brand-colored accents in the corners. Datasheet precision.',
      'Variation: technical brochure surface — very light brand-tinted background, subtle grid texture at low opacity, professional document quality.',
    ],
    'proof-stack': [
      'Variation: corporate boardroom backdrop — blurred conference table foreground, brand-colored ambient light from tall windows, serious and credible.',
      'Variation: clean office environment — neutral background with brand-colored accent wall on one side, soft ambient corporate lighting. Professional services quality.',
      'Variation: B2B technology setting — dark brand-colored right panel, light neutral left panel, subtle environmental depth suggesting enterprise context.',
    ],
    'launch-banner': [
      'Variation: announcement burst — bold radial light explosion at center-left, brand colors in high saturation, diagonal light sweeps from upper-right. Pure launch energy.',
      'Variation: dynamic motion sweep — long horizontal brand-colored light streaks with speed blur, deep shadow at edges, focal glow at center. Momentum and reveal.',
      'Variation: celebration gradient — rich brand-color sweep from deep to bright, subtle particle/confetti texture at very low opacity, premium reveal energy.',
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
      'Background atmosphere: vibrant brand-forward gradient in brand colors with confident spotlight energy.',
      'Background atmosphere: rich brand-colored sweep with professional feature-spotlight tones.',
      'Background atmosphere: dynamic brand-energy gradient using the palette with premium warmth.',
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
    'job-posting': [
      'Variation: modern open-plan office — clean workstations, natural light through tall windows, brand-colored accent walls. Professional and inviting.',
      'Variation: corporate campus exterior — glass building facade, landscaped walkway, brand-colored sky at golden hour. Premium employer brand.',
      'Variation: collaborative workspace — meeting room glass walls, whiteboards, warm overhead lighting, brand palette in furnishings. Dynamic workplace.',
    ],
    'hiring-banner': [
      'Variation: bold geometric burst — brand-colored angular shapes radiating from center, high-saturation gradient, dynamic energy. Modern tech recruitment feel.',
      'Variation: abstract flowing waves — brand-colored curves and gradients flowing diagonally, subtle dot pattern overlay. Innovation and movement.',
      'Variation: confident radial spotlight — deep brand gradient edges, bright accent glow at center, subtle hexagon pattern. Focus and opportunity.',
    ],
    'team-spotlight': [
      'Variation: sunny office atrium — warm natural light from skylights, green plants, brand-colored furniture accents. Welcoming team environment.',
      'Variation: outdoor team gathering — park or terrace setting, warm golden-hour light, brand colors in ambient elements. Human and approachable.',
      'Variation: creative workspace — colorful brand-toned walls, casual seating, warm collaborative lighting. Culture-forward and vibrant.',
    ],
    'career-growth': [
      'Variation: ascending cityscape at dawn — skyline with upward perspective, brand-colored sky gradients, subtle ascending light rays. Growth and ambition.',
      'Variation: modern office stairway — upward-looking perspective, brand-colored accent lighting along rails, clean architectural lines. Career progression.',
      'Variation: bright open workspace — large windows with city view, ascending light from the horizon, brand palette in warm furnishings. Opportunity ahead.',
    ],
    default: [
      'Background atmosphere: professional corporate gradient using brand colors with balanced tones.',
      'Background atmosphere: clean modern surface with brand-colored ambient lighting.',
      'Background atmosphere: premium dark gradient in brand colors with soft directional light creating depth.',
    ],
  };

  const recipes = themedRecipes[themeId] || themedRecipes.default;

  // Hash context so the same nonce produces different recipes for different posts/brands
  const contextSeed = [
    context?.brandName || '',
    context?.headline || '',
    context?.postExcerpt?.slice(0, 50) || '',
  ].join('|');
  let contextHash = 0;
  for (let i = 0; i < contextSeed.length; i++) {
    contextHash = ((contextHash << 5) - contextHash + contextSeed.charCodeAt(i)) | 0;
  }
  const recipeIndex = Math.abs(nonce + contextHash) % recipes.length;
  const recipe = recipes[recipeIndex];

  // Dynamic scene personality ensures every generation feels unique to the brand/post
  const dynamicParts: string[] = [];
  if (context?.industry) {
    dynamicParts.push(`Infuse ${context.industry}-sector visual DNA into materials, fixtures, and environmental details`);
  }
  if (context?.brandName) {
    dynamicParts.push(`This poster is uniquely for "${context.brandName}" — the atmosphere should feel ownable to this brand, not generic`);
  }
  if (context?.headline) {
    const headlineEssence = context.headline.split(/\s+/).slice(0, 6).join(' ');
    dynamicParts.push(`Visual energy should reinforce: "${headlineEssence}"`);
  }
  const dynamicClause = dynamicParts.length
    ? ` SCENE PERSONALITY: ${dynamicParts.join('. ')}.`
    : '';

  return `Variation directive (attempt ${nonce}): ${recipe}${dynamicClause} IMPORTANT: Keep the chosen theme family recognizable, but adapt the framing, atmosphere, supporting structure, and text-safe balance as needed to create the strongest final poster.`;
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
  'job-posting', 'hiring-banner', 'team-spotlight', 'career-growth',
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
  if (dataUri.length > MAX_DATA_URI_LENGTH) {
    console.error(`[image-create] Data URI too large: ${dataUri.length} chars (max ${MAX_DATA_URI_LENGTH})`);
    return null;
  }

  const match = dataUri.match(/^data:([^;,]+)?((?:;[^,]*)*?),([\s\S]*)$/);
  if (!match) {
    console.error('[image-create] Data URI format invalid — could not parse');
    return null;
  }

  // Validate content-type is image
  const mimeType = (match[1] || '').toLowerCase();
  if (mimeType && !mimeType.startsWith('image/')) {
    console.error(`[image-create] Data URI MIME type is not image: ${mimeType}`);
    return null;
  }

  const meta = match[2] || '';
  const payload = match[3] || '';

  try {
    let buf: Buffer;
    if (meta.includes(';base64')) {
      buf = Buffer.from(payload, 'base64');
    } else {
      buf = Buffer.from(decodeURIComponent(payload), 'utf8');
    }
    if (buf.length > MAX_IMAGE_BYTES) {
      console.error(`[image-create] Decoded image too large: ${buf.length} bytes (max ${MAX_IMAGE_BYTES})`);
      return null;
    }
    return buf;
  } catch (err) {
    console.error('[image-create] Failed to decode data URI:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function resolveImageBufferFromSource(source: string): Promise<Buffer | null> {
  const trimmed = source.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    const buf = decodeDataUriToBuffer(trimmed);
    if (!buf) console.error('[image-create] Failed to decode data URI logo (length:', trimmed.length, ')');
    return buf;
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

    if (!response.ok) {
      console.error(`[image-create] Logo fetch failed: HTTP ${response.status} for ${trimmed.slice(0, 120)}`);
      return null;
    }

    // Validate content-type is image (allow octet-stream and empty as fallback)
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
      console.error(`[image-create] Logo fetch returned non-image content-type: ${contentType}`);
      return null;
    }

    // Check content-length before buffering when available
    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > MAX_IMAGE_BYTES) {
      console.error(`[image-create] Logo too large: ${contentLength} bytes`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      console.error(`[image-create] Logo buffer too large: ${arrayBuffer.byteLength} bytes`);
      return null;
    }

    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('[image-create] Logo fetch error:', err instanceof Error ? err.message : err);
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
    const logoPlacement = (
      ['overlay', 'infuse', 'none'].includes(body.logoPlacement || '')
        ? body.logoPlacement
        : getPreferredLogoPlacement(themeId)
    ) as 'overlay' | 'infuse' | 'none';
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
    const additionalReferenceUrls = Array.isArray(body.additionalReferenceUrls)
      ? body.additionalReferenceUrls
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim())
          .slice(0, 5)
      : [];
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
    const isAiGuided = themeId === 'guided-auto';
    const hasThemeComposition = Boolean(THEME_SCHEMAS[themeId]);
    // AI owns ALL poster composition — no SVG overlays, no theme composers.
    // The AI integrates logos, headers, text, bullets, and footers directly
    // via the edit endpoint and per-theme prompt directives.
    const forceSvgThemeComposer = false;
    const shouldUseAllianceComposer = false;
    const shouldUseStructuredThemeComposer = false;
    const effectiveBrandColors = requestedBrandColors.length
      ? requestedBrandColors
      : analyzedBrandColors;
    const analyzedTagline = marketingDnaContext?.tagline || '';
    const displayTagline = (body.tagline?.trim() || derived.tagline || analyzedTagline).slice(0, 120);
    const analyzedContextLines = [
      asTrimmedString(brandRow?.industry) ? `- Industry: ${asTrimmedString(brandRow?.industry)} (USE THIS TO DRIVE SCENE AND BACKGROUND CHOICES)` : null,
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
    ]
      .filter(Boolean)
      .join('\n');

    const effectiveLogoUrl = providedLogoUrl || brandKitLogoUrl || '';
    const hasLogo = Boolean(effectiveLogoUrl);
    // When a logo is provided, always use 'infuse' — the user's uploaded logo
    // must appear in every generated image, integrated naturally by the AI.
    const effectiveLogoPlacement = hasLogo ? 'infuse' : 'none';
    const shouldInfuseLogo = !isAlliancePoster && hasLogo;
    const shouldOverlayLogo = false; // Overlay mode disabled — always infuse
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
    // ── Theme render strategy ─────────────────────────────────────────────
    // Default behavior is AI-first: the selected theme drives composition,
    // placement, and portrayal, but the model renders the finished poster
    // directly. SVG theme composers remain available only as an explicit
    // fallback via env for debugging or emergency recovery.
    const willApplyThemeOverlay =
      shouldUseAllianceComposer || shouldUseStructuredThemeComposer;
    const aiOwnsFullPoster = isAiGuided || !willApplyThemeOverlay;
    const hasStructuredBrandSelections = willApplyThemeOverlay;

    // Determine render size from aspect ratio
    const sizeMap: Record<string, string> = {
      landscape: '1536x1024',
      square: '1024x1024',
      portrait: '1024x1536',
    };
    // Output dimensions MUST match the AI render aspect ratio to prevent
    // destructive cropping that cuts off logos, headers, and footers.
    // AI renders at 1536x1024 (1.5:1), 1024x1024 (1:1), 1024x1536 (1:1.5).
    // We resize down proportionally, never crop.
    const outputSizeMap: Record<'landscape' | 'square' | 'portrait', { width: number; height: number }> = {
      landscape: { width: 1536, height: 1024 },
      square: { width: 1024, height: 1024 },
      portrait: { width: 1024, height: 1536 },
    };
    const dimensionMap: Record<string, string> = {
      landscape: '1536x1024 landscape (3:2 ratio)',
      square: '1024x1024 square (1:1 ratio)',
      portrait: '1024x1536 portrait (2:3 ratio)',
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
        'Design a striking hero composition where 30-40% of the canvas has clean negative space or a subtle gradient zone specifically reserved for text overlays. The remaining area should have a vivid, in-focus visual scene with real environmental depth — concrete surfaces, glass, metal, or architectural elements that catch light. Use a 35mm–50mm equivalent focal length with shallow-to-medium depth of field. Light the scene with a strong directional key from camera-left at 45°, a soft fill from opposite, and a rim/edge light to separate the subject from the background. Think conference keynote slide meets editorial magazine cover — the text zone should feel intentional, not empty.',
      'photo-blend':
        'Create a photorealistic, editorial-quality scene shot on a 50mm–85mm lens at f/2.8–f/4. The primary subject must be tack-sharp with visible micro-textures: metal grain, fabric weave, screen anti-glare, wood pore, concrete aggregate. Use a three-point lighting rig — warm key light from 30–45° camera-left, cool fill from opposite, and a strong hair/rim light to carve the subject from the background. Include a natural text-safe zone created by real environmental depth: a receding corridor, a wall plane, an overhead sky, or a surface — never by artificial Gaussian blur. Background elements should be identifiable at 25–40% defocus, not reduced to meaningless color blobs. Think Bloomberg Businessweek or Condé Nast Traveller cover photography — crisp subject, rich environment, premium atmosphere.',
      'abstract-brand':
        'Create a bold abstract composition using geometric shapes, flowing gradients, and brand-colored elements as the hero visual. Sharp edges, clean intersections, and intentional negative space for text. Use layered depth through overlapping translucent planes, glass-morphism, or 3D-extruded shapes with realistic lighting casting soft shadows. Think Stripe or Linear marketing visuals — abstract but structured, modern, and brand-native. Every surface should catch light believably.',
      'split-layout':
        'Sharp 60/40 or 50/50 split composition: one zone contains a realistic, detailed scene shot on a 35mm–50mm lens with identifiable environmental context, real textures, and directional lighting; the other zone is a clean, solid or subtly textured panel reserved for text with a premium material feel — not flat dead color but a surface with subtle grain, linen, concrete, or brushed-metal texture. The split line should be clean (vertical, diagonal, or curved) and feel designed with a subtle shadow or light edge. No abstract blur wash on either side.',
      infographic:
        'Create a modular, structured layout with distinct visual blocks: a hero data visualization area, icon-driven info panels, and one prominent text-safe card zone. Use crisp flat icons, clean divider lines, and high contrast between sections. Add premium depth through card elevations with realistic drop shadows, subtle glass-morphism panels, and material-design layering. Think annual report infographic meets modern dashboard design — every panel has a real surface, never a flat dead fill.',
      cinematic:
        'Dramatic, widescreen cinematic composition shot on a 35mm anamorphic lens. Use intentional three-point lighting: a hard key light creating defined shadow edges and specular highlights, a soft fill maintaining shadow detail, and a strong backlight or rim light creating subject separation and atmosphere. Depth of field should be shallow with the hero subject razor-sharp and the background at 30-50% defocus — identifiable environment, not blur noise. Atmospheric elements (subtle haze, volumetric god-rays, practical light sources) add mood without obscuring detail. Think Denis Villeneuve cinematography or premium Netflix key art — one frame tells the whole story with cinematic color grading.',
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
      ? hasLogo && effectiveLogoPlacement !== 'none'
        ? [
            `BRAND NAMING RULES:`,
            `- The brand "${safeBrandName}" is represented by the uploaded LOGO IMAGE — do NOT write the brand name as separate text. The logo IS the brand mark.`,
            `- Do NOT render "${safeBrandName}" as standalone text, a text label, a text badge, or any typographic element. The uploaded logo.png already contains the brand identity.`,
            `- If the brand name must appear in the headline, that is fine, but do NOT add extra brand-name text labels, watermarks, or text badges anywhere else.`,
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
          ]
            .filter(Boolean)
            .join('\n')
        : [
            `BRAND NAMING RULES:`,
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
      industry: brandRow?.industry?.trim() || null,
      businessFocus: marketingDnaContext?.businessFocus || null,
    });

    const postContext = postText.replace(/\s+/g, ' ').trim().slice(0, 1200);
    const voxaPromptPackage = buildVoxaPromptPackage({
      themeId,
      format: imageAspect,
      aiOwnsFullPoster,
      hasStructuredBranding: hasStructuredBrandSelections,
      brandColors: effectiveBrandColors,
      brandName: safeBrandName,
      productName: safeProductName,
      headline: safeHeadline,
      tagline: safeTagline,
      benefits: composedFeatureBullets,
      contextBrief: safeContextBrief,
      customPrompt: safeCustomPrompt,
      sceneBrief,
      industry: brandRow?.industry?.trim() || marketingDnaContext?.businessFocus || null,
      website: composedFooterWebsite,
      email: composedFooterEmail,
      partnerName,
      partnerTagline,
      hasPrimaryLogo: Boolean(hasLogo && effectiveLogoPlacement !== 'none'),
      secondaryLogoCount: additionalLogoUrls.length,
      hasReferenceImage: Boolean(referenceImageUrl),
      referenceSummary: semanticAnchor,
    });

    if (voxaPromptPackage.preflight.supported && voxaPromptPackage.preflight.errors.length > 0) {
      return NextResponse.json(
        {
          error: 'VOXA preflight failed',
          details: voxaPromptPackage.preflight.errors,
          warnings: voxaPromptPackage.preflight.warnings,
          preflight: voxaPromptPackage.preflight,
        },
        { status: 400 }
      );
    }

    // Always use our detailed poster guide with exact layout coordinates —
    // the Voxa themeGuide only has vague descriptions that cause the AI to
    // ignore the preview structure. Voxa's positivePrompt still contributes
    // supplementary quality/tone guidance in its own block.
    const selectedTheme =
      aiOwnsFullPoster ? buildAiThemePosterGuide(themeId) : buildThemeDirective(themeId);
    const variationDirective = buildVariationDirective(generationNonce, themeId, {
      brandName: safeBrandName || undefined,
      headline: safeHeadline || undefined,
      industry: brandRow?.industry?.trim() || marketingDnaContext?.businessFocus || undefined,
      postExcerpt: postText.replace(/\s+/g, ' ').trim().slice(0, 100) || undefined,
    });
    const variationSalt = `${generationNonce}-${Date.now().toString(36).slice(-6)}`;
    const themeSlotGuidance = hasThemeComposition ? buildThemeSlotGuidance(themeId) : '';
    const aiStructureGuide = aiOwnsFullPoster
      ? buildAiThemeStructureGuide(themeId, hasStructuredBrandSelections)
      : '';
    const structuredBrandContentGuide =
      aiOwnsFullPoster && (hasThemeComposition || isAlliancePoster)
        ? buildStructuredBrandContentGuide({
            themeId,
            brandName: safeBrandName,
            headline: safeHeadline,
            tagline: safeTagline,
            partnerName,
            partnerTagline,
            footerWebsite: composedFooterWebsite,
            footerEmail: composedFooterEmail,
            hasPrimaryLogo: Boolean(hasLogo && effectiveLogoPlacement !== 'none'),
            secondaryLogoCount: additionalLogoUrls.length,
          })
        : '';
    const themeSelectionGuidance =
      hasThemeComposition || isAlliancePoster
        ? buildThemeSelectionGuidance({
            themeId,
            slotImages,
            referenceImageUrl,
            referenceAsHero,
          })
        : '';
    const voxaPromptBlock = voxaPromptPackage.supported ? voxaPromptPackage.positivePrompt : '';
    const voxaNegativePrompt = voxaPromptPackage.supported ? voxaPromptPackage.negativePrompt : '';
    const voxaQualityGate = voxaPromptPackage.supported ? voxaPromptPackage.qualityGate : '';

    const imagePrompt = `
You are an elite creative director. Create a magazine-quality LinkedIn poster.

CANVAS: ${dimensionMap[imageAspect] || dimensionMap.landscape} format.

═══════════════════════════════════════════════════
THEME LAYOUT (FOLLOW THIS EXACTLY):
═══════════════════════════════════════════════════
Theme: ${selectedTheme.label}
${selectedTheme.direction}

${aiStructureGuide ? `${aiStructureGuide}\n` : ''}
═══════════════════════════════════════════════════
YOU ARE RENDERING THE COMPLETE FINAL POSTER:
- Background, atmosphere, hero image, headline, tagline, proof bullets, logos, footer — ALL rendered by you.
- Follow the theme layout coordinates above precisely. The preview the user sees matches those coordinates.
- The finished image must look LinkedIn-ready with no extra design pass.
═══════════════════════════════════════════════════

${safeCustomPrompt ? `CREATIVE BRIEF (HIGHEST PRIORITY): "${safeCustomPrompt}"\n` : ''}
${themeSlotGuidance ? `THEME SLOT MAP:\n${themeSlotGuidance}\n` : ''}
${themeSelectionGuidance ? `SELECTED VISUAL ASSETS:\n${themeSelectionGuidance}\n` : ''}

${safeBrandName || effectiveBrandColors.length ? `═══════════════════════════════════════════════════
BRAND IDENTITY
═══════════════════════════════════════════════════
${safeBrandName ? (hasLogo && effectiveLogoPlacement !== 'none' ? `BRAND: "${safeBrandName}" — represented by the uploaded logo image (VERY LARGE, DOMINANT, at least 25-35% canvas width). Do NOT render brand name as separate text. The logo MUST be clearly visible, sharp, and THE FIRST thing a viewer notices. It is the single most important brand element — treat it as the hero of the design.` : `BRAND: "${safeBrandName}" — spell exactly, never invent alternate names.`) : ''}
${effectiveBrandColors.length ? `BRAND COLORS (MANDATORY): ${effectiveBrandColors.join(', ')}
- 60%+ of the canvas must use these colors in backgrounds, panels, gradients.
- Dark palette → dark cinematic scene. Warm palette → warm energetic scene.
- NEVER fall back to generic blue/purple/gold/teal unless those hex values are in the palette.` : ''}
${safeProductName ? `PRODUCT: "${safeProductName}" — use this exact name if it appears as text.` : ''}
═══════════════════════════════════════════════════
` : ''}

${analyzedContextLines ? `BRAND INTELLIGENCE:\n${analyzedContextLines}\n` : ''}

${safePostImagePrompt ? `POST VISUAL BRIEF: "${safePostImagePrompt}"\n` : ''}
${safeContextBrief ? `USER CONTEXT: "${safeContextBrief}"\n` : ''}

${isAiGuided ? `AI GUIDED MODE: Build the full image yourself — structure, hierarchy, focal subject, lighting, text. Keep text inside safe area with 8% side and 10% top/bottom padding.\n` : ''}

${structuredBrandContentGuide ? `${structuredBrandContentGuide}\n` : ''}

${voxaPromptBlock ? `VOXA SPEC:\n${voxaPromptBlock}\n` : ''}

CONTENT TO RENDER:
${postContext ? `Context: ${postContext.slice(0, 600)}` : 'Use the headline and tagline as the message.'}
${safeHeadline ? `Headline: "${safeHeadline}"` : ''}
${safeTagline ? `Tagline: "${safeTagline}"` : ''}
${composedFeatureBullets.length ? `Proof bullets:\n${composedFeatureBullets.map((line) => `  ● ${line}`).join('\n')}` : ''}

${brandNamingDirective ? `${brandNamingDirective}\n` : ''}

SUBJECT ANCHOR: "${semanticAnchor}"

${(hasThemeComposition || isAlliancePoster) && referenceImageUrl ? `HERO PRODUCT — USER'S SELECTED IMAGE:
- Reproduce the selected product/scene faithfully. Same shape, proportions, materials, colors.
- Place as the visual hero in the theme's hero zone. Premium lighting, realistic shadows.
- Do NOT replace with a different product or hide it.\n` : ''}

SCENE CONSTRUCTION:
- ${sceneBrief}
- 2-3 depth layers. Real materials (metal, glass, concrete). Directional lighting.
${effectiveBrandColors.length ? `- Use brand colors (${effectiveBrandColors.slice(0, 3).join(', ')}) as dominant palette.` : ''}

TYPOGRAPHY:
- HEADLINE: Bold 800-900 weight sans-serif, 3-4x larger than bullets, 20-30% of image width. Tight tracking.
- TAGLINE: 400-500 weight, 50-60% of headline size.
- BULLETS: 400-500 weight, consistent ● markers, identical vertical spacing, aligned left edge. Max 4 bullets.
- FOOTER: Smallest text, optional. Drop if crowded.
- All text needs clean calm surface behind it. Never place text over busy detail.
- Modern 2025 design: no drop shadows, no embossed text, no gradient fills on letters.

STYLE: ${styleDirection}
TONE: ${toneDirection}

${variationDirective}

QUALITY: Fortune 500 campaign quality. $10K agency deliverable. Sharp rendering, real materials, premium lighting.

PROHIBITIONS:
- Blurry/soft-focus output, watermarks, stock photo badges
- Flat dead gradients, empty void backgrounds, featureless color fills
- Cheesy metaphors (lightbulbs, handshakes, puzzle pieces)
- Tiny unreadable text or logos — everything must read at 552px feed width
- Misaligned text, inconsistent bullet spacing, orphan words
- Misspelled text or garbled letters
${aiOwnsFullPoster ? `- Ignoring uploaded logos or reference images
- Sticker-like floating logos — integrate them into the design
- Tiny logos under 25% of canvas width — logos must be LARGE, DOMINANT, and clearly readable
- Ecommerce "Shop Now" styling unless it's a hiring theme` : ''}
`.trim();

    // ── Prompt budget enforcement (OpenAI limit: 32,000 chars) ──
    // The edit endpoint appends logo/ref instructions (~3K chars extra), so
    // we need a lower cap when images are present. Use 28,500 when logos/refs
    // are likely, 31,500 otherwise.
    const hasUploadedAssets = hasLogo || !!referenceImageUrl || additionalReferenceUrls.length > 0;
    const PROMPT_BUDGET = hasUploadedAssets ? 28500 : 31500;
    let budgetedPrompt = imagePrompt;
    if (budgetedPrompt.length > PROMPT_BUDGET) {
      // 1) Strip VOXA block (duplicate theme info already in main prompt)
      budgetedPrompt = budgetedPrompt
        .replace(/VOXA SPEC:\n[\s\S]*?(?=\n\n[A-Z])/m, '');
    }
    if (budgetedPrompt.length > PROMPT_BUDGET) {
      // 2) Trim SCENE CONSTRUCTION to essentials
      budgetedPrompt = budgetedPrompt.replace(
        /SCENE CONSTRUCTION:\n[\s\S]*?(?=\n\n[A-Z])/m,
        `SCENE CONSTRUCTION:\n- ${sceneBrief}\n- 2-3 depth layers, real materials, directional lighting.\n${effectiveBrandColors.length ? `- Brand colors: ${effectiveBrandColors.slice(0, 3).join(', ')}.` : ''}`
      );
    }
    if (budgetedPrompt.length > PROMPT_BUDGET) {
      // 3) Trim TYPOGRAPHY to essentials
      budgetedPrompt = budgetedPrompt.replace(
        /TYPOGRAPHY:\n[\s\S]*?(?=\n\n[A-Z])/m,
        'TYPOGRAPHY: Bold 800w headline 3-4x larger than bullets, 400w tagline 50-60% of headline, bullets with ● markers aligned left, clean surface behind all text.'
      );
    }
    if (budgetedPrompt.length > PROMPT_BUDGET) {
      // 4) Trim PROHIBITIONS to essentials
      budgetedPrompt = budgetedPrompt.replace(
        /PROHIBITIONS:\n[\s\S]*$/m,
        'PROHIBITIONS: No blurry output, watermarks, flat gradients, cheesy metaphors, tiny text, misaligned bullets, misspelled text, ignored logos.'
      );
    }
    // Final hard cap — truncate trailing content as last resort
    if (budgetedPrompt.length > PROMPT_BUDGET) {
      budgetedPrompt = budgetedPrompt.slice(0, PROMPT_BUDGET);
    }
    // Replace imagePrompt reference for downstream usage
    const finalImagePrompt = budgetedPrompt;
    console.log(`[image-create] theme="${themeId}" promptLen=${finalImagePrompt.length}/${PROMPT_BUDGET} themeLabel="${selectedTheme.label}" directionLen=${selectedTheme.direction.length} aiOwnsFullPoster=${aiOwnsFullPoster} hasLogo=${hasLogo} hasRef=${!!referenceImageUrl}`);

    const configuredImageModel = process.env.OPENAI_IMAGE_MODEL?.trim();
    const model = aiOwnsFullPoster
      ? 'gpt-image-1'
      : configuredImageModel || 'gpt-image-1';
    const renderSize = sizeMap[imageAspect] || sizeMap.landscape;
    const canvas = outputSizeMap[imageAspect];

    // ── Resolve reference images (logo + optional URL reference) ──
    const referenceImages: Array<{ buffer: Buffer; filename: string; role: string }> = [];
    let primaryLogoBuffer =
      hasLogo ? await resolveImageBufferFromSource(effectiveLogoUrl) : null;

    // Fallback: if logo resolution failed, try downloading directly from Supabase storage
    if (hasLogo && !primaryLogoBuffer) {
      console.error(`[image-create] LOGO FAILED TO RESOLVE! logoUrl type=${effectiveLogoUrl.startsWith('data:') ? 'data-uri' : 'url'}, length=${effectiveLogoUrl.length}. Attempting storage fallback...`);

      // Fallback 1: If effectiveLogoUrl is a Supabase URL, extract the storage path and download via admin API
      const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'brand-assets';
      const supabaseUrlMarker = `/storage/v1/object/public/${bucket}/`;
      const urlToTry = effectiveLogoUrl || brandKitLogoUrl || '';
      const markerIdx = urlToTry.indexOf(supabaseUrlMarker);
      if (markerIdx >= 0) {
        const storagePath = urlToTry.slice(markerIdx + supabaseUrlMarker.length);
        if (storagePath) {
          try {
            const { data: dlData, error: dlError } = await db.storage.from(bucket).download(storagePath);
            if (!dlError && dlData) {
              primaryLogoBuffer = Buffer.from(await dlData.arrayBuffer());
              console.log(`[image-create] Logo storage fallback succeeded: ${storagePath} (${primaryLogoBuffer.length} bytes)`);
            } else {
              console.error(`[image-create] Logo storage fallback failed:`, dlError?.message);
            }
          } catch (e) {
            console.error(`[image-create] Logo storage fallback error:`, e instanceof Error ? e.message : e);
          }
        }
      }

      // Fallback 2: If brandKitLogoUrl differs from effectiveLogoUrl, try resolving it too
      if (!primaryLogoBuffer && brandKitLogoUrl && brandKitLogoUrl !== effectiveLogoUrl) {
        primaryLogoBuffer = await resolveImageBufferFromSource(brandKitLogoUrl);
        if (primaryLogoBuffer) {
          console.log(`[image-create] Logo fallback via brandKitLogoUrl succeeded (${primaryLogoBuffer.length} bytes)`);
        }
      }

      // Fallback 3: query image_assets directly for the latest logo file_url
      if (!primaryLogoBuffer && brandId) {
        try {
          const { data: latestAsset } = await db
            .from('image_assets')
            .select('file_url, metadata')
            .eq('brand_id', brandId)
            .eq('asset_type', 'logo')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const assetUrl = asTrimmedString(latestAsset?.file_url);
          if (assetUrl && assetUrl !== effectiveLogoUrl && assetUrl !== brandKitLogoUrl) {
            primaryLogoBuffer = await resolveImageBufferFromSource(assetUrl);
            if (primaryLogoBuffer) {
              console.log(`[image-create] Logo fallback via image_assets succeeded (${primaryLogoBuffer.length} bytes)`);
            }
          }
          // Try storage path from asset metadata
          if (!primaryLogoBuffer) {
            const assetMeta = latestAsset?.metadata as Record<string, unknown> | null;
            const storagePath = asTrimmedString(assetMeta?.storage_path);
            if (storagePath) {
              try {
                const { data: dlData, error: dlError } = await db.storage.from(bucket).download(storagePath);
                if (!dlError && dlData) {
                  primaryLogoBuffer = Buffer.from(await dlData.arrayBuffer());
                  console.log(`[image-create] Logo fallback via asset storage_path succeeded (${primaryLogoBuffer.length} bytes)`);
                }
              } catch (_) { /* already logged above */ }
            }
          }
        } catch (e) {
          console.error(`[image-create] Logo image_assets fallback error:`, e instanceof Error ? e.message : e);
        }
      }

      if (!primaryLogoBuffer) {
        console.error(`[image-create] ALL logo fallbacks exhausted. Aborting generation — user expects their logo in the image.`);
        return NextResponse.json(
          {
            error: 'Logo could not be loaded',
            details: [
              'Your logo image could not be downloaded or decoded.',
              'Please try re-uploading your logo in the Brand Kit or via the logo upload button, then generate again.',
            ],
          },
          { status: 422 }
        );
      }
    }
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

    // For themed images, auto-route the selected reference into the theme slots so
    // posters do not come out blank when the user picked a visual but did not map
    // every slot manually.
    if (hasThemeComposition && referenceImageUrl) {
      const themeSlots = THEME_SCHEMAS[themeId]?.imageSlots || [];
      const heroSlot = themeSlots.find((slot) => slot.id === 'hero');
      if (heroSlot) {
        if (!slotImages['hero']) {
          slotImages['hero'] = referenceImageUrl;
        }
      } else {
        for (const slot of themeSlots) {
          if (!slotImages[slot.id]) {
            slotImages[slot.id] = referenceImageUrl;
          }
        }
      }
    }

    const themedReferenceSources =
      hasThemeComposition || isAlliancePoster
        ? collectUniqueImageSources(
            referenceImageUrl ? [referenceImageUrl] : [],
            Object.values(slotImages)
          ).slice(0, 3)
        : [];

    if (hasLogo && primaryLogoBuffer) {
      // Always send the user's uploaded logo at high resolution so the AI
      // can reproduce fine details, letterforms, and brand marks with fidelity.
      const logoPng = await sharp(primaryLogoBuffer)
        .resize({
          width: 1024,
          height: 1024,
          fit: 'contain',
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      referenceImages.push({ buffer: logoPng, filename: 'logo.png', role: 'logo' });
    }

    if (aiOwnsFullPoster && posterSecondaryLogoBuffers.length) {
      for (const [index, buffer] of posterSecondaryLogoBuffers.entries()) {
        const resized = await sharp(buffer)
          .resize({
            width: 1024,
            height: 1024,
            fit: 'contain',
            withoutEnlargement: true,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer();
        referenceImages.push({
          buffer: resized,
          filename: `partner-logo-${index + 1}.png`,
          role: `partner-logo-${index + 1}`,
        });
      }
    }

    if (!hasThemeComposition && !isAlliancePoster) {
      if (referenceImageUrl) {
        const refBuffer = await resolveImageBufferFromSource(referenceImageUrl);
        if (refBuffer) {
          const refPng = await sharp(refBuffer)
            .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
          referenceImages.push({ buffer: refPng, filename: 'reference.png', role: 'reference' });
        }
      }
    } else {
      for (const [index, source] of themedReferenceSources.entries()) {
        const refBuffer = await resolveImageBufferFromSource(source);
        if (!refBuffer) continue;

        const refPng = await sharp(refBuffer)
          .resize({
            width: 1536,
            height: 1536,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();

        referenceImages.push({
          buffer: refPng,
          filename: `theme-reference-${index + 1}.png`,
          role: index === 0 ? 'reference' : `reference-support-${index + 1}`,
        });
      }
    }

    // Additional reference images — works for ALL themes (not just un-themed)
    for (const [idx, addUrl] of additionalReferenceUrls.entries()) {
      if (referenceImages.length >= 6) break; // OpenAI limit
      if (addUrl === referenceImageUrl) continue; // skip duplicate
      // Also skip if already included via themedReferenceSources
      if (themedReferenceSources.includes(addUrl)) continue;
      try {
        const addBuf = await resolveImageBufferFromSource(addUrl);
        if (addBuf) {
          const addPng = await sharp(addBuf)
            .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
          referenceImages.push({
            buffer: addPng,
            filename: `extra-reference-${idx + 1}.png`,
            role: `reference-extra-${idx + 1}`,
          });
        }
      } catch {
        console.warn(`[image-create] Failed to resolve additional reference ${idx + 1}`);
      }
    }

    const useEditEndpoint = referenceImages.length > 0 && model.startsWith('gpt-image');

    // Augment prompt with logo/reference instructions for the edit endpoint
    let editPrompt = finalImagePrompt;
    if (useEditEndpoint) {
      const hasLogoRef = referenceImages.some((r) => r.role === 'logo');
      const hasPartnerLogoRefs = referenceImages.some((r) => r.role.startsWith('partner-logo'));
      const partnerLogoCount = referenceImages.filter((r) => r.role.startsWith('partner-logo')).length;
      const hasImageRef = referenceImages.some((r) => r.role === 'reference');

      // Build an explicit manifest so the AI knows exactly what each uploaded image is
      const imageManifest = referenceImages.map((r) => {
        if (r.role === 'logo') return `- "${r.filename}": PRIMARY BRAND LOGO — reproduce this EXACTLY, VERY LARGE and clearly dominant (25-35% of canvas width) in the header/brand zone. This is THE #1 most important visual element. IT MUST BE IMPOSSIBLE TO MISS.`;
        if (r.role.startsWith('partner-logo')) return `- "${r.filename}": PARTNER/SECONDARY LOGO — reproduce this EXACTLY in the top-right partner zone`;
        if (r.role === 'reference') return `- "${r.filename}": HERO PRODUCT/SCENE IMAGE — use as the main visual hero of the poster`;
        if (r.role.startsWith('reference-extra')) return `- "${r.filename}": ADDITIONAL REFERENCE IMAGE — incorporate this product/scene/element visibly in the poster composition`;
        if (r.role.startsWith('reference-support')) return `- "${r.filename}": SUPPORTING VISUAL — use as secondary visual content in a panel or supporting area`;
        return `- "${r.filename}": SUPPORTING REFERENCE IMAGE — use as additional visual content`;
      }).join('\n');

      const manifestBlock = `\n\n═══════════════════════════════════════════════════
IMAGE MANIFEST — YOU HAVE BEEN GIVEN ${referenceImages.length} IMAGE(S):
═══════════════════════════════════════════════════
${imageManifest}

CRITICAL: Each image listed above is a REAL asset the user uploaded. You MUST use ALL of them in the final poster. Do NOT ignore any uploaded image. Do NOT replace any uploaded logo with text or a made-up logo. Reproduce each uploaded logo EXACTLY as provided.
═══════════════════════════════════════════════════`;

      const logoInstruction = hasLogoRef
        ? `\n\nPRIMARY LOGO INFUSION (file: "logo.png") — NON-NEGOTIABLE:
You have been given the brand's EXACT logo as a reference image (logo.png). This is the user's real brand mark. It MUST appear in the final image, reproduced with absolute fidelity. The logo is THE SINGLE MOST IMPORTANT element of the poster — it must be impossible to miss.

LOGO RULES:
1. PIXEL-PERFECT: Copy the logo EXACTLY — same shape, colors, proportions, letterforms, internal details. Do not redraw, simplify, or reinterpret it.
2. PROMINENT SIZE: The logo MUST be VERY LARGE and clearly dominant — at least 25-35% of canvas width. It should be immediately recognizable at LinkedIn feed size (552px wide). Never make it small or subtle. BIGGER IS ALWAYS BETTER. If in doubt, make the logo even LARGER.
3. PROMINENT PLACEMENT: Place it in the theme's designated logo zone (usually top-left header). Give it 3-4% breathing room on all sides. It must be THE FIRST thing a viewer notices.
4. INFUSE MODE: The logo is a commanding hero brand element — large, bold, and prominent. It anchors the brand identity of the entire poster.
5. CLEAN CONTRAST: Place on a surface with strong contrast — dark logo on light panel or light logo on dark panel. Give it a dedicated brand zone (header fascia, glass strip, metal plate, or clean background area).
6. CRISP RENDERING: Clean edges, no blurriness, no softening, no color bleeding. Sharp at every pixel.
7. NO TEXT SUBSTITUTION: The logo.png IS the brand identity. Do NOT write the brand name as separate text anywhere. Do NOT add text labels, text badges, or typographic renderings of the brand name. The logo image alone represents the brand.

DO NOT: Replace the logo with text • Draw a different version • Make it tiny or subtle • Turn it into a watermark • Blur or degrade it • Change its colors • Write the brand name as text alongside the logo • Hide it in a corner • Make it smaller than 25% of canvas width. The logo must DOMINATE the brand zone.`
        : '';

      const partnerLogoInstruction = hasPartnerLogoRefs
        ? `\n\nPARTNER LOGO(S) INFUSION (${partnerLogoCount} partner logo file(s)) — NON-NEGOTIABLE:
You have been given ${partnerLogoCount} PARTNER/SECONDARY logo(s) as reference images (partner-logo-1.png${partnerLogoCount > 1 ? ', partner-logo-2.png' : ''}${partnerLogoCount > 2 ? ', partner-logo-3.png' : ''}). These are REAL partner brand marks the user uploaded. Every partner logo MUST appear in the final poster.

PARTNER LOGO RULES:
1. PIXEL-PERFECT: Reproduce each partner logo EXACTLY as provided — same shape, colors, proportions. Do not substitute, redraw, or omit any.
2. PLACEMENT: Place partner logos in the TOP-RIGHT header zone (the partner lockup area, roughly 75%-97% width, 3%-12% height). If multiple partners, arrange them side by side with equal spacing.
3. CLEAN CONTRAST: Each partner logo needs a clean contrasting surface behind it — a dark or light panel appropriate for legibility.
4. EQUAL DIGNITY: Partner logos should be similar in visual weight to the primary brand logo — not tiny, not hidden, not relegated to a footnote.
5. CRISP RENDERING: Clean edges, sharp details, no blurriness.

DO NOT: Omit any partner logo • Replace partner logos with text • Make partner logos smaller than 6% of canvas width • Invent fake partner logos`
        : '';

      const refInstruction = hasImageRef
        ? aiOwnsFullPoster
          ? `\n\nHERO IMAGE INFUSION (file: "reference.png" or "theme-reference-*.png") — MANDATORY:
The user selected specific product/scene images as the hero content. These MUST be the visual centerpiece.

HERO IMAGE RULES:
1. FAITHFUL: Reproduce the selected product/scene recognizably — same shape, proportions, materials, key details.
2. HERO TREATMENT: Place as the primary visual hero — large, well-staged, immediately visible in the hero bay/panel area.
3. PREMIUM STAGING: Elevate with commercial photography lighting, realistic shadows, and environmental context.
4. Do NOT replace the selected product with something else. Do NOT hide it or make it tiny.`
          : hasThemeComposition || isAlliancePoster
          ? `\n\nHERO IMAGE CONTEXT (file: "theme-reference-*.png") — MANDATORY:
Build the composition around the user's selected product/scene images. They are the visual truth for this poster.`
          : `\n\nREFERENCE IMAGE (file: "reference.png") — MUST USE:
Incorporate the user's selected product/scene prominently. Match colors, materials, style, and characteristics faithfully.`
        : '';

      // Build the final edit prompt — logo instruction at the TOP so truncation never cuts it
      editPrompt =
        logoInstruction +
        '\n\n' +
        finalImagePrompt +
        manifestBlock +
        partnerLogoInstruction +
        refInstruction +
        (aiOwnsFullPoster
          ? `\n\n═══════════════════════════════════════════════════
FINAL PRIORITY ORDER (READ THIS LAST — IT OVERRIDES CONFLICTS):
═══════════════════════════════════════════════════
1) USE EVERY UPLOADED IMAGE: ALL uploaded logos and reference images MUST appear in the final poster. None may be omitted.
2) PRIMARY LOGO (logo.png): This is THE highest priority element. Reproduce EXACTLY in the top-left header zone with clean contrast. Make it VERY LARGE (25-35% canvas width), sharp, and absolutely impossible to miss. The logo must be clearly readable at LinkedIn feed thumbnail size.
${hasPartnerLogoRefs ? `3) PARTNER LOGOS (partner-logo-*.png): Reproduce EXACTLY in the top-right partner zone.
4) HERO IMAGE: The selected product/scene must be the visual hero of the poster.
5) THEME STRUCTURE: Follow the layout coordinates from the theme direction.
6) PREMIUM FINISH: Readable hierarchy, premium lighting, material depth, balanced spacing.` : `3) HERO IMAGE: The selected product/scene must be the visual hero of the poster.
4) THEME STRUCTURE: Follow the layout coordinates from the theme direction.
5) PREMIUM FINISH: Readable hierarchy, premium lighting, material depth, balanced spacing.`}
═══════════════════════════════════════════════════`
          : `\n\nFINAL PRIORITY ORDER: 1) Reproduce ALL uploaded logos exactly. 2) Showcase the reference image as the visual hero. 3) Match the visual style and scene direction.`);
    }

    let base64: string;
    let generationPass = 1;

    const generatedAt = Date.now();
    const folder = `${brandId || actingUserId}`;

    // Final safety cap on any prompt before sending to OpenAI
    if (editPrompt.length > 31900) {
      editPrompt = editPrompt.slice(0, 31900);
    }

    console.log(`[image-create] editPromptLen=${editPrompt.length} useEdit=${useEditEndpoint} refImages=${referenceImages.length} [${referenceImages.map(r => `${r.role}:${r.filename}`).join(', ')}]`);

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
        prompt: finalImagePrompt,
        size: renderSize,
        quality: 'high',
        outputFormat: 'png',
        background: 'opaque',
      });
      base64 = firstPass.base64;
    }
    generationPass = 1;

    const basePngBuffer = await sharp(Buffer.from(base64, 'base64'))
      .resize({
        width: canvas.width,
        height: canvas.height,
        fit: 'inside',
        withoutEnlargement: true,
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
    let logoApplied = useEditEndpoint && hasLogo && effectiveLogoPlacement !== 'none';

    // Sharp-based logo overlay DISABLED — AI handles all logo infusion via the
    // edit endpoint reference images. No post-processing overlays.
    // The old overlay code placed a sticker-like logo on the image which looked
    // cheap and disconnected from the design. AI infusion produces integrated results.
    if (false && !useEditEndpoint && !hasThemeComposition && !isAlliancePoster && (shouldOverlayLogo || shouldInfuseLogo)) {
      if (primaryLogoBuffer) {
        let composedPngBuffer: Buffer;

        if (shouldOverlayLogo) {
          const pad = Math.max(12, Math.round(canvas.width * 0.025));
          const logoW = Math.round(canvas.width * 0.15);
          const logoH = Math.round(canvas.height * 0.15);
          const x = canvas.width - logoW - pad;
          const y = pad;

          const resizedLogoBuffer = await sharp(primaryLogoBuffer!)
            .resize({ width: logoW, height: logoH, fit: 'contain', withoutEnlargement: true })
            .png()
            .toBuffer();

          // Subtle drop shadow instead of a white sticker card
          const shadowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${logoW}" height="${logoH}" viewBox="0 0 ${logoW} ${logoH}">
  <defs>
    <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.35)" />
    </filter>
  </defs>
  <rect width="${logoW}" height="${logoH}" rx="6" fill="rgba(0,0,0,0.10)" filter="url(#ds)" />
</svg>`;
          const shadowPng = await sharp(Buffer.from(shadowSvg)).png().toBuffer();

          composedPngBuffer = await sharp(basePngBuffer)
            .composite([
              { input: shadowPng, top: y, left: x },
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

          const resizedLogoBuffer = await sharp(primaryLogoBuffer!)
            .resize({ width: logoW, height: logoH, fit: 'contain', withoutEnlargement: true })
            .png()
            .toBuffer();

          const infusedLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${logoW}" height="${logoH}" viewBox="0 0 ${logoW} ${logoH}">
  <image href="data:image/png;base64,${resizedLogoBuffer.toString('base64')}" x="0" y="0" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" opacity="0.85" />
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

    if (shouldUseAllianceComposer) {
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

    // Structured theme composition for all non-alliance theme layouts.
    if (shouldUseStructuredThemeComposer && !isAlliancePoster) {
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

      try {
        console.log(`[theme-compose] Composing theme "${themeId}" with ${Object.keys(slotImageBuffers).length} slot(s), logo=${Boolean(primaryLogoBuffer)}, headline="${composedHeadline?.slice(0, 40)}", bullets=${composedFeatureBullets.length}`);
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
        console.log(`[theme-compose] Composition succeeded for "${themeId}", output size=${finalPngBuffer.length}`);
        logoApplied = logoApplied || Boolean(primaryLogoBuffer);
      } catch (composeError) {
        console.error(`[theme-compose] FAILED for "${themeId}":`, composeError);
        // Fall through — finalPngBuffer stays as basePngBuffer, user gets base image
        // This prevents a 500 error but still delivers something
      }
    }

    // AI renders the complete poster — no overlays, no finisher ribbons.
    // Logo is integrated by the AI via the edit endpoint reference images.
    const themeComposerApplied = shouldUseStructuredThemeComposer || shouldUseAllianceComposer;
    if (false) {
      // Theme-finisher disabled: AI owns full poster composition.
      // The AI integrates logos, headers, and footers directly in the image.
      try {
        finalPngBuffer = await applyThemeBrandFinisher({
          width: canvas.width,
          height: canvas.height,
          baseImageBuffer: finalPngBuffer,
          themeId: themeId || 'guided-auto',
          primaryLogoBuffer,
          secondaryLogoBuffers: posterSecondaryLogoBuffers,
          brandName: composedBrandName,
          headline: composedHeadline,
          tagline: composedTagline,
          partnerName,
          partnerTagline,
          footerWebsite: composedFooterWebsite,
          footerEmail: composedFooterEmail,
          palette: effectiveBrandColors,
          logoAlreadyPlaced: false,
        });
        logoApplied = true;
      } catch (finisherError) {
        console.error('[theme-finisher] FAILED:', finisherError);
        // Fall through — keep whatever finalPngBuffer we had
      }
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
    const overlayApplied = finalPngBuffer !== basePngBuffer;

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
              theme_composer_applied: willApplyThemeOverlay,
              theme_finisher_applied: false,
              logo_placement: effectiveLogoPlacement,
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
              voxa_theme_id: voxaPromptPackage.preflight.supported
                ? voxaPromptPackage.preflight.themeId
                : null,
              voxa_theme_label: voxaPromptPackage.preflight.supported
                ? voxaPromptPackage.preflight.themeLabel
                : null,
              voxa_preflight_score: voxaPromptPackage.preflight.supported
                ? voxaPromptPackage.preflight.score
                : null,
              voxa_preflight_passed: voxaPromptPackage.preflight.supported
                ? voxaPromptPackage.preflight.passed
                : null,
              voxa_preflight_warnings: voxaPromptPackage.preflight.supported
                ? voxaPromptPackage.preflight.warnings
                : [],
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
      logoWarning: null,
      generationNonceUsed: generationNonce,
      generated: true,
      voxaPreflight: voxaPromptPackage.preflight.supported
        ? voxaPromptPackage.preflight
        : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Image creation failed';
    console.error('Image creation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
