import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { generateImageBase, generateImageEdit } from '@/lib/ai/openai';
import sharp from 'sharp';
import { composeAlliancePoster } from '@/lib/studio/alliance-poster';
import { composeThemeImage, THEME_SCHEMAS } from '@/lib/studio/theme-composer';
import { applyThemeBrandFinisher } from '@/lib/studio/theme-finisher';

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
      ? `- A direct reference image is supplied${options.referenceAsHero ? ' and should be treated as the primary hero/product truth' : ''}.`
      : null,
    ...selectedSlotLines,
    (options.referenceImageUrl || selectedSlotLines.length)
      ? `- These selected images are not optional. Use them to anchor the product family, silhouette, materials, environment, and lighting language.`
      : null,
    (options.referenceImageUrl || selectedSlotLines.length)
      ? `- At least one of the selected visuals should appear clearly and recognizably in the final poster as the hero or a major supporting panel.`
      : null,
    (options.referenceImageUrl || selectedSlotLines.length)
      ? `- Use the theme slot map as composition guidance for where these visuals belong, but integrate them naturally into a polished final poster instead of a rigid pasted template.`
      : null,
    (options.referenceImageUrl || selectedSlotLines.length)
      ? `- You may crop, reframe, stylize, or elevate the selected asset, but never hide it inside vague texture or replace it with an invented product that ignores the user's choice.`
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
        'FULL AI POSTER MODE: Build the complete final LinkedIn poster yourself. Use the selected references, brand palette, headline, tagline, logo, and proof lines to create a bespoke campaign-quality composition with strong hierarchy, premium typography, and believable atmosphere.',
    },
    'alliance-poster': {
      label: 'Alliance Poster',
      direction:
        'Create a polished alliance-style campaign poster with a disciplined brand header, a powerful left hero product zone, a right-side benefits lane, and a clean footer. The result should feel like a premium electrical campaign board, not a blank background with graphics dropped later.',
    },
    'product-hero': {
      label: 'Product Hero',
      direction:
        'Create a premium product-led poster where the selected product or reference image is the star. Use a controlled studio/editorial layout, strong product lighting, a concise headline block, and elegant brand placement.',
    },
    'knowledge-visual': {
      label: 'Knowledge-Led',
      direction:
        'Create a technical, brochure-aware poster grounded in the selected brochure, datasheet, or reference visuals. Balance a credible product or evidence panel with a clean knowledge-led text column and restrained proof callouts.',
    },
    'clean-brand': {
      label: 'Clean Brand',
      direction:
        'Create a minimal, premium branded poster with disciplined whitespace, one clear hero visual, elegant typography, subtle brand accents, and no clutter. The feeling should be refined, current, and intentional.',
    },
    'industrial-campaign': {
      label: 'Industrial Campaign',
      direction:
        'Create a dramatic industrial campaign poster with a layered electrification or infrastructure backdrop, a strong product bay, a premium headline block, and clean proof bullets. The composition should feel like a real enterprise power-systems campaign, not a template mockup.',
    },
    'datasheet-frame': {
      label: 'Datasheet Frame',
      direction:
        'Create a brochure-quality technical poster with modular information framing, disciplined product presentation, crisp hierarchy, and clear evidence-led structure. It should feel like a modern technical sell-sheet reimagined for LinkedIn.',
    },
    'proof-stack': {
      label: 'Proof Stack',
      direction:
        'Create a trust-led poster with 2-3 refined proof or credibility cards, a clean supporting visual, and a confident information panel. The mood should be evidence-driven, premium, and enterprise-ready.',
    },
    'launch-banner': {
      label: 'Launch Banner',
      direction:
        'Create a launch-ready reveal poster with a dominant headline, bold brand energy, one hero subject, and a strong sense of motion and announcement. It should stop the scroll without looking like a cheap ad.',
    },
    'sector-collage': {
      label: 'Sector Collage',
      direction:
        'Create a multi-scene sector poster that clearly shows several served industries or application environments in one coherent campaign composition, with polished labels and a disciplined central headline.',
    },
    'brand-story': {
      label: 'Brand Story',
      direction:
        'Create an editorial brand-narrative poster with a warm human or founder-led visual, refined typography, and premium story cues. It should feel like a magazine feature or high-end company story visual.',
    },
    'offer-card': {
      label: 'Offer Card',
      direction:
        'Create a crisp offer or service spotlight poster with a clear hero proposition, refined product or service visual, and premium supporting hierarchy. Avoid hard-sell ecommerce energy or generic CTA clutter.',
    },
    'comparison-board': {
      label: 'Comparison Board',
      direction:
        'Create a structured comparison poster with two clearly separated lanes, disciplined typographic hierarchy, and immediate visual understanding of the contrast or before/after story.',
    },
    'premium-editorial': {
      label: 'Premium Editorial',
      direction:
        'Create a magazine-quality premium poster with art-directed lighting, luxury-grade finishing, a strong editorial image area, and elegant text hierarchy. Every surface should feel intentional and expensive.',
    },
    'job-posting': {
      label: 'Job Posting',
      direction:
        'Create a polished recruitment poster with a credible role title block, a clean employer-brand zone, a professional workplace visual, and concise requirement or opportunity highlights.',
    },
    'hiring-banner': {
      label: 'Hiring Banner',
      direction:
        'Create a bold hiring poster with strong employer-brand energy, one dominant recruitment headline, a supportive workplace or team visual, and disciplined supporting text. Avoid gimmicky web-ad styling.',
    },
    'team-spotlight': {
      label: 'Team Spotlight',
      direction:
        'Create a warm culture-led poster with a welcoming team or office visual, approachable typography, a clear employer-brand cue, and a balanced message about joining the team.',
    },
    'career-growth': {
      label: 'Career Growth',
      direction:
        'Create an aspirational career-opportunity poster with upward-looking composition, refined benefits framing, a credible workplace visual, and a modern employer-brand presence.',
    },
  };

  return themeMap[themeId] || themeMap['guided-auto'];
}

function buildAiThemeStructureGuide(themeId: string, hasStructuredBranding: boolean) {
  if (!hasStructuredBranding) return '';

  const shared = [
    'STRUCTURAL BRAND LANES (MANDATORY):',
    '- A finishing pass will lock the exact selected logo(s), partner marks, and footer/contact details into disciplined brand lanes after you render the main poster.',
    '- Reserve those lanes by keeping them visually calm, high-contrast, and free of critical subject matter, dense props, or tiny text.',
    '- Do not place the hero subject, product edges, headline block, or bullet stack where the locked brand/header/footer treatment must sit.',
    '- Do not invent duplicate floating logos, duplicate footer strips, or alternate brand badges outside the reserved structure.',
  ];

  const themeSpecificMap: Record<string, string[]> = {
    'alliance-poster': [
      '- Reserve a disciplined top brand band in the top 14% of the canvas.',
      '- Keep a left header lockup zone clear at roughly x 3%-24%, y 3%-12% for the primary brand mark.',
      '- Keep a central headline lane calm at roughly x 24%-74%, y 3%-15%. The main headline should live here, not lower in the frame.',
      '- Keep a right partner-header zone clear at roughly x 75%-97%, y 3%-12% for secondary logos and partner text.',
      '- Reserve a left hero bay at roughly x 4%-42%, y 20%-88% for the main product or reference visual.',
      '- Reserve a right proof lane at roughly x 50%-95%, y 24%-84% for the benefits stack.',
      '- Keep the bottom 8% clean for a locked footer strip with website/email.',
    ],
    'industrial-campaign': [
      '- Reserve the top 14% for a disciplined brand/header treatment.',
      '- Keep the primary brand zone calm at top-left and the partner/logo zone calm at top-right.',
      '- Reserve a strong left hero bay at roughly x 4%-36%, y 18%-88% for the product visual.',
      '- Reserve a right information panel at roughly x 43%-96%, y 18%-88% for the headline and proof bullets.',
      '- Keep the bottom 8%-9% calm and readable for the footer strip.',
    ],
    'clean-brand': [
      '- Reserve the top 14% for a restrained brand/header treatment and the bottom 10% for footer information.',
      '- Keep the left narrative column clean at roughly x 6%-55%, y 20%-78% for headline and supporting copy.',
      '- Keep the right hero zone clean at roughly x 60%-96%, y 18%-86% for the selected product or reference visual.',
    ],
    'knowledge-visual': [
      '- Keep a top-left brand card zone clear and calm.',
      '- Reserve the left evidence or reference lane at roughly x 4%-56% and the right knowledge lane at x 58%-96%.',
      '- Leave a clean footer lane for locked website/email if provided.',
    ],
    'datasheet-frame': [
      '- Keep the upper-left brand/logo zone clear and disciplined.',
      '- Reserve the left product panel and right information grid with clean separation.',
      '- Leave a clean footer shelf for locked contact details.',
    ],
    'proof-stack': [
      '- Keep the upper brand lane calm for the primary logo or partner lockup.',
      '- Reserve the left stacked-proof lane and right narrative panel without overlap.',
      '- Keep the lower edge clean for footer/contact treatment.',
    ],
    'launch-banner': [
      '- Reserve corner brand zones at the top left/right and keep the lower edge clean for footer/contact details.',
      '- Keep the dominant headline inside a clear central-left announcement lane, not under the brand lockups.',
    ],
    'sector-collage': [
      '- Reserve the top header band for the brand/header treatment and centered title.',
      '- Keep the lower edge clean for a footer/contact strip.',
      '- Do not let panel imagery or labels crowd those brand lanes.',
    ],
    'brand-story': [
      '- Reserve a subtle brand zone at top-left or top-right and keep the bottom edge calm for footer details.',
      '- Keep the portrait/story image and editorial text in separate, non-conflicting lanes.',
    ],
    'offer-card': [
      '- Reserve a top brand zone and a bottom footer lane.',
      '- Keep the left proposition lane and right hero lane distinct so locked brand/footer details remain legible.',
    ],
    'comparison-board': [
      '- Reserve the top header strip for brand/title treatment and the bottom edge for footer details.',
      '- Keep both comparison columns fully inside their lanes with breathing room away from those strips.',
    ],
    'premium-editorial': [
      '- Reserve a subtle brand lockup zone and a slim footer lane.',
      '- Keep the editorial headline clear of those reserved strips and avoid crowding the luxury image area.',
    ],
    'job-posting': [
      '- Reserve the top employer-brand band and the bottom footer lane.',
      '- Keep the role title and requirements inside the left text lane, and keep the right photo lane uncluttered.',
    ],
    'hiring-banner': [
      '- Reserve the top header/logo band and a clean lower footer/contact lane.',
      '- Keep the main recruitment headline centered between those strips with generous breathing room.',
    ],
    'team-spotlight': [
      '- Reserve a top brand zone and bottom footer lane.',
      '- Keep the team visual and message lane separate so the locked branding does not overlap faces or copy.',
    ],
    'career-growth': [
      '- Reserve the top brand/opportunity label lane and bottom footer lane.',
      '- Keep benefit cards, role headline, and workplace image inside their own lanes with clean separation.',
    ],
  };

  const themeSpecific = themeSpecificMap[themeId] || [
    '- Reserve a calm top brand lane and a clean bottom footer lane.',
    '- Keep the main hero subject and the headline/proof copy inside their intended zones with breathing room away from those reserved strips.',
  ];

  return [...shared, ...themeSpecific].join('\n');
}

function buildVariationDirective(nonce: number, themeId: string) {
  // Variations can shift atmosphere, composition emphasis, and supporting scene detail,
  // while still staying recognizable to the chosen theme family.
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

  const recipe = recipes[Math.abs(nonce) % recipes.length];
  return `Variation directive (attempt ${nonce}): ${recipe} IMPORTANT: Keep the chosen theme family recognizable, but adapt the framing, atmosphere, supporting structure, and text-safe balance as needed to create the strongest final poster.`;
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
    const isAiGuided = themeId === 'guided-auto';
    const hasThemeComposition = Boolean(THEME_SCHEMAS[themeId]);
    const aiOwnsFullPoster = isAiGuided || hasThemeComposition || isAlliancePoster;
    const shouldUseLegacyThemeComposer = process.env.LEGACY_THEME_COMPOSER === '1';
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
    const effectiveLogoPlacement = hasLogo ? logoPlacement : 'none';
    const shouldInfuseLogo = !isAlliancePoster && effectiveLogoPlacement === 'infuse' && hasLogo;
    const shouldOverlayLogo = !isAlliancePoster && effectiveLogoPlacement === 'overlay' && hasLogo;
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
    const hasStructuredBrandSelections =
      aiOwnsFullPoster &&
      !shouldUseLegacyThemeComposer &&
      (
        (hasLogo && effectiveLogoPlacement !== 'none') ||
        additionalLogoUrls.length > 0 ||
        Boolean(composedFooterWebsite || composedFooterEmail || partnerName || partnerTagline)
      );

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
    const selectedTheme = aiOwnsFullPoster
      ? buildAiThemePosterGuide(themeId)
      : buildThemeDirective(themeId);
    const variationDirective = buildVariationDirective(generationNonce, themeId);
    const variationSalt = `${generationNonce}-${Date.now().toString(36).slice(-6)}`;
    const themeSlotGuidance = hasThemeComposition ? buildThemeSlotGuidance(themeId) : '';
    const aiStructureGuide = aiOwnsFullPoster
      ? buildAiThemeStructureGuide(themeId, hasStructuredBrandSelections)
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

    const imagePrompt = `
You are an elite creative director and visual designer who has art-directed campaigns for Fortune 500 brands. You specialize in LinkedIn visual content that stops the scroll and drives engagement.

Your mission: create a visually stunning, magazine-quality image that makes the viewer pause, feel something, and engage with the post.

CANVAS: ${dimensionMap[imageAspect] || dimensionMap.landscape} format.

CREATIVE MODE:
- Theme: ${selectedTheme.label}
- Theme direction: ${selectedTheme.direction}

THEME FIDELITY — CRITICAL (THIS OVERRIDES ALL OTHER COMPOSITION RULES):
${aiOwnsFullPoster ? `- The selected theme is a COMPOSITION BRIEF for the final poster, not a later overlay.
- You are responsible for the COMPLETE final poster: background, atmosphere, hero image treatment, headline, tagline, proof bullets, labels, and overall hierarchy.${hasStructuredBrandSelections ? ' Exact selected logos, partner marks, and footer/contact details may be finalized in a finishing pass, so compose around those reserved brand lanes.' : ' Include final logo integration directly in the composition when it is selected.'}
- Use the theme's spirit and zone map as guidance for where content belongs, but make the result feel bespoke, premium, and art-directed rather than rigid or boxed in.
- The finished image must already look LinkedIn-ready with no extra design pass required.
- Selected visuals, logos, and proof lines are real content inputs. They must visibly shape the final poster instead of being ignored or reduced to background texture.
- Keep every element inside disciplined safe margins with clean spacing. No footer collisions, no bullet overflow, no cramped typography, no fake template feel.
- This is a LinkedIn campaign/editorial poster, not an ecommerce banner. Avoid retail "shop now" aesthetics, coupon energy, and cheap CTA-button styling unless the chosen hiring theme genuinely needs a restrained recruitment action cue.
- Build depth, lighting, and atmosphere that feel expensive and custom-made. Avoid flat dead gradients, empty color washes, or generic blurred nothingness.` : `- Your image will be placed INSIDE the theme layout as the hero visual content.
- A structured SVG overlay will be composited on top, adding panels, text, logos, chips, labels, and layout around your image.
- Generate a STRONG, FOCUSED visual subject — the product, scene, environment, or concept that tells the story.
- Do NOT render any text, headlines, taglines, brand names, logos, chips, labels, UI panels, cards, or structural layout elements — the overlay adds all of those.
- Do NOT improvise your own layout, poster system, or text hierarchy — focus entirely on the visual content.
- Fill the frame with rich, detailed visual content — this image will be cropped into the theme's hero slot.
- Use brand colors in the scene (lighting, surfaces, materials, environment) so the AI content harmonizes with the theme overlay colors.
- This is a LinkedIn post visual system, not an ecommerce ad or landing-page banner. Avoid retail "shop now" aesthetics, coupon energy, or hard-sell web ad styling.
${hasThemeComposition || isAlliancePoster ? `
- Treat the selected theme as an ART DIRECTION SYSTEM, not a generic template. The background plate should feel custom-built for that theme's structure.
- Create premium atmosphere, depth, and lighting that makes the final composed poster feel intentional, not like a stock image with a template dropped on top.
- Preserve a clear relationship between the likely hero zone and the likely text-safe zone: one side may carry richer environmental detail, while the text side stays calmer, deeper, and easier to read over.
- Avoid flat dead gradients, empty color washes, or generic blurred nothingness. The plate must have richness, texture, and believable visual storytelling.
` : ''}`}

${themeSlotGuidance ? `THEME SLOT MAP:
${themeSlotGuidance}
` : ''}

${themeSelectionGuidance ? `SELECTED VISUAL ASSET GUIDANCE:
${themeSelectionGuidance}
` : ''}

${aiStructureGuide ? `${aiStructureGuide}

` : ''}

${safeBrandName || effectiveBrandColors.length ? `═══════════════════════════════════════════════════
BRAND IDENTITY — #1 PRIORITY (READ THIS FIRST)
═══════════════════════════════════════════════════
${safeBrandName ? (aiOwnsFullPoster
  ? `BRAND: "${safeBrandName}"
- The final poster must clearly show the brand through the supplied logo, a refined brand label, product branding, or a disciplined header/footer brand block.
- If visible brand text appears, use the exact brand name "${safeBrandName}" with perfect spelling.
- Place brand presence in a premium position with clean contrast and enough breathing room.
- Never invent alternate company names, sub-brands, or fake product labels.`
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

${isAiGuided ? `AI GUIDED MODE (PRIMARY BEHAVIOR):
- There is NO fixed poster/template overlay for this request.
- "Your Vision" is the main creative brief for composition, scene choice, and visual storytelling.
- Build the full image yourself: structure, hierarchy, focal subject, lighting, and any readable text.
- If a reference image is supplied, use it as a real subject/style input, not as a hidden slot placeholder.
- Make the final image feel bespoke and fully art-directed, not template-like.
- Keep all readable text inside a disciplined safe area with at least 8% side padding and 10% top/bottom padding.
- Never let any headline, brand text, or support label touch the canvas edge.
- If the subject sits on one side, reserve the opposite side as a dedicated text column with clean negative space.
- Prefer 2-4 shorter lines over one oversized headline block. Readability is more important than drama.\n` : ''}

${aiOwnsFullPoster && !isAiGuided ? `AI THEME POSTER MODE (PRIMARY BEHAVIOR):
- This theme defines the intended poster structure and sentiment, but YOU must render the finished poster directly.
- Use the selected theme as an art-direction brief for where the hero visual, headline block, proof bullets, logo zone, and footer details should live.
- Feel free to refine spacing, panel proportions, and emphasis so the poster feels premium and balanced rather than mechanically templated.
- Make the selected visual assets visible and celebrated. If a product/reference image exists, it should be a real recognizable hero or support visual in the poster.
- Keep text disciplined: headline first, tagline optional, 2-4 proof bullets maximum, and only include footer/contact info if it remains readable.
- Do not let bullet stacks, footer text, or logos collide with the canvas edge or each other.
${hasStructuredBrandSelections ? '- The exact selected logos, partner marks, and footer/contact details will be locked in afterward. Compose around those reserved brand lanes instead of improvising duplicate lockups elsewhere.\n' : '\n'}` : ''}

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
${composedFeatureBullets.length ? `- Supporting proof signals: ${composedFeatureBullets.join('; ')}` : ''}
${safeProductName ? `- Product/service spotlight: ${safeProductName}` : ''}
${safeContextBrief ? `- User context: ${safeContextBrief}` : ''}

SUBJECT ANCHOR (the image MUST visually represent this):
- "${semanticAnchor}"
- The viewer should immediately understand what this image is about without reading the post.

${composedFeatureBullets.length ? (aiOwnsFullPoster
  ? `PROOF LINES TO HONOR AND, WHERE APPROPRIATE, RENDER AS SUPPORTING BULLETS:
${composedFeatureBullets.map((line) => `- ${line}`).join('\n')}
- Render at most 2-4 of these as clear supporting proof bullets or proof cards, rewriting only for fit while preserving meaning and brand accuracy.
- If not all lines fit elegantly, prioritize the strongest lines and let the rest influence the environment or supporting details.`
  : `THEME SIGNALS TO HONOR (influence the image visually, never as readable text):
${composedFeatureBullets.map((line) => `- ${line}`).join('\n')}
- Let these signals shape the product details, environment, supporting props, or proof-oriented atmosphere so the final poster feels aligned with the user's selections.`) : ''}

${isAlliancePoster ? (aiOwnsFullPoster ? `ALLIANCE POSTER EXECUTION RULES:
- Deliver a finished alliance/campaign poster with a disciplined top brand band, a left hero product visual, a right-side benefits stack, and a compact footer.
- Keep the left hero highly visible and premium, with enough surrounding depth to feel grounded rather than pasted.
- Keep the right information lane darker and calmer for readable bullets and headline hierarchy.
- Favor premium industrial, electrification, energy, automation, or infrastructure context when it matches the brief.
- This should feel like a real campaign board from a top industrial design team, not a brochure page with random elements.` : `ALLIANCE POSTER BACKGROUND RULES:
- Generate the background plate only. Final logos, headlines, footer text, and bullet pointers will be composited later.
- Do NOT render readable text, letterforms, logos, product labels, or fake UI in the image itself.
- This is a strict template, not a freeform poster. Keep the header logo zones, left hero bay, and right information lane clean.
- Keep the hero subject isolated on the left with negative space around it so later composition stays crisp.
- Hard failure if any readable text, logo marks, or UI chrome appears anywhere in the image.
- Keep the left side strong enough for a hero product cutout and the right side visually clean enough for benefit bullets.
- Favor premium industrial, electrification, energy, automation, or infrastructure context when it matches the brief.
- Make the backdrop sharp, high contrast, and poster-friendly rather than generic lifestyle photography.`) : ''}

${(hasThemeComposition || isAlliancePoster) && referenceImageUrl ? (aiOwnsFullPoster ? `HERO PRODUCT CONTEXT (the user has selected a product/reference image):
- A product or reference image has been selected. Use it as real visual truth and make it a clearly recognizable hero or major support visual in the final poster.
- Light, crop, and stage the composition so the selected product feels prestigious and intentional.
- Keep a strong relationship between the hero visual and the text-safe lane: one side can carry richer visual detail while the text side stays calmer and readable.
- Match the industrial, technical, or environmental character of the selected product and the post context above.` : `HERO PRODUCT CONTEXT (the user has selected a product/reference image for the hero slot):
- A product or reference image has been selected and will be placed in the theme's hero zone by the SVG overlay.
- Your background plate must visually COMPLEMENT and CELEBRATE this product — not compete with it.
- Design the atmosphere, lighting, and environment to make the product feel at home and prestigious.
- The product sits in the LEFT hero zone — create background texture and lighting that gives it context and weight.
- The RIGHT zone (text area) must remain dark and atmospheric so white text reads clearly over it.
- Match the industrial, technical, or environmental character of the product type described in the post context above.`) : ''}
SCENE CONSTRUCTION (MANDATORY):
- ${sceneBrief}
- Every image needs a clear HERO ELEMENT (the main visual subject) and SUPPORTING CONTEXT (environment, props, or secondary elements that reinforce the story).
- Think like a photographer: what would you stage, light, and frame to tell this story in one shot?
- No gradient-only or abstract-only outputs unless style is "abstract-brand".
${effectiveBrandColors.length ? `- Use brand colors (${effectiveBrandColors.slice(0, 3).join(', ')}) as the dominant palette in the scene — in surfaces, lighting, materials, and environment.` : ''}

${effectiveLogoPlacement === 'none' ? 'No logo needed in this image.' : ''}

COMPOSITION MASTERY:
- Apply the rule of thirds for visual balance — place the hero element at an intersection point.
- Create clean text-safe zones with strong contrast for the headline, optional tagline, proof bullets, and footer details.
- Use depth of field, layering, or environmental framing to create visual depth.
- Keep all key visual elements inside an 85% central safe-area so LinkedIn crops stay balanced.
- Use leading lines, color contrast, or light direction to guide the viewer's eye to the focal point.
- IMPORTANT: The image will be viewed at 552px wide in the LinkedIn feed. All text, icons, and key details must be clearly readable at that size. Avoid tiny text, thin lines, or subtle details that vanish at feed scale.

${aiOwnsFullPoster ? `TEXT RENDERING RULES (CRITICAL — YOU ARE RENDERING THE FINAL POSTER):
- The final poster SHOULD include disciplined readable text where the theme calls for it: headline, optional tagline, brand label, and up to 2-4 short proof bullets.
- Use the exact headline wording when possible: "${displayHeadline || effectiveBrandName || ''}".
- Use the exact tagline only when it remains large and readable: "${displayTagline || ''}".
- ${hasStructuredBrandSelections ? 'If structured brand lanes are reserved, keep the headline and proof copy clear of those zones and leave exact footer/contact lockups to the finishing pass.' : 'If the supplied logo is present, reproduce it faithfully and keep it crisp.'}
- Keep typography large, bold, and clean enough to read at LinkedIn feed size.
- Use short lines, clear hierarchy, and generous spacing. Never let bullets or footer details run out of their zone.
- Footer/contact details are optional; include them only if they fit cleanly and remain legible.
- Every brand or product word must be perfectly spelled.` : `TEXT RENDERING RULES (CRITICAL — AI text must be perfect):
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
${aiOwnsFullPoster ? `- Rigid template-looking posters with boxed-in elements, generic pasted overlays, or dead empty background plates
- Cramped bullet stacks, footer collisions, or text running outside its visual lane
- Tiny unreadable logos or unreadable brand marks
- Ecommerce-style "Shop Now", "Buy Now", "Get Started", coupon stickers, or cheap CTA clutter unless the selected hiring theme needs a restrained recruitment action cue
- Ignoring the selected reference images, logos, or proof lines when they were provided
- Misspelled text, garbled letters, or nonsensical words anywhere in the image
- Decorative text effects that reduce readability at feed size` : `- Misspelled text, garbled letters, or nonsensical words anywhere in the image
- Text that is too small to read at 552px display width`}
- Generic stock-photo compositions that lack brand personality
`.trim();

    const configuredImageModel = process.env.OPENAI_IMAGE_MODEL?.trim();
    const model = aiOwnsFullPoster
      ? 'gpt-image-1'
      : configuredImageModel || 'gpt-image-1';
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

    if (hasLogo && effectiveLogoPlacement !== 'none' && primaryLogoBuffer) {
      const logoPng = await sharp(primaryLogoBuffer)
        .resize({
          width: aiOwnsFullPoster ? 720 : 512,
          height: aiOwnsFullPoster ? 420 : 512,
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
            width: 680,
            height: 380,
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
            .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
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
            width: index === 0 ? 1400 : 1100,
            height: index === 0 ? 1400 : 1100,
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

    const useEditEndpoint = referenceImages.length > 0 && model.startsWith('gpt-image');

    // Augment prompt with logo/reference instructions for the edit endpoint
    let editPrompt = imagePrompt;
    if (useEditEndpoint) {
      const hasLogoRef = referenceImages.some((r) => r.role === 'logo');
      const hasImageRef = referenceImages.some((r) => r.role === 'reference');

      const logoInstruction = hasLogoRef
        ? hasStructuredBrandSelections
          ? `\n\nLOGO / BRAND-MARK FIDELITY:
You have been given the brand logo as a reference image. Use it to understand the exact brand mark, proportions, and colors.

CRITICAL BRAND-LANE RULES:
1. A finishing pass will place the exact selected logo(s), partner marks, and footer details into the reserved brand lanes after you render the main poster.
2. Keep those reserved brand lanes clean and supportive — do NOT place critical subject matter, dense props, or competing text inside them.
3. Do NOT invent duplicate floating logos, alternate brand badges, extra footer strips, or off-theme corner stamps outside the reserved structure.
4. If you show any brand presence yourself, it must align with the same reserved header/footer logic and never fight the final brand lockup.
5. Brand name reference: "${effectiveBrandName || 'Brand'}". Keep spelling exact anywhere it appears.`
          : `\n\nLOGO INTEGRATION — THIS IS THE #1 PRIORITY:
You have been given the brand's logo as a reference image. You MUST faithfully reproduce this exact logo inside the generated image as a core, beautiful element of the design.

CRITICAL LOGO RULES:
1. REPRODUCE THE LOGO EXACTLY as provided — same shape, same colors, same proportions, same details. Do not redesign, simplify, or alter it.
2. Make the logo a visually important branded element. It must be crisp, readable, and intentionally placed.
3. The logo must be DESIGNED INTO the composition, not floating randomly. Give it:
   - Proper visual weight and sizing
   - A clean background area or contrasting zone behind it so it reads perfectly
   - Professional integration: subtle drop shadow, clean edges, or a complementary backdrop
4. ${effectiveLogoPlacement === 'infuse'
    ? 'INFUSE MODE: Make the logo a central, hero element of the design. It can be large and commanding — centered or prominently placed. It should feel like the image was designed AROUND the logo. Think of it like a brand-launch hero banner where the logo is the star.' 
    : aiOwnsFullPoster
      ? 'AI THEME POSTER MODE: Place the logo in a premium brand zone that matches the selected theme family — for example a refined header band, disciplined corner stamp, footer lockup, or structured brand label. It must feel intentionally designed into the poster, not pasted on after the fact.'
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
        ? aiOwnsFullPoster
          ? `\n\nSELECTED VISUAL REFERENCES (MANDATORY):
- I have provided one or more user-selected reference images. These are the user's actual chosen product/scene assets.
- Use them directly in the FINAL poster as the hero or major supporting visual(s). They should be clearly recognizable, not hidden inside vague atmosphere.
- Treat them as visual truth for the product family, silhouette, materials, detailing, proportions, finish quality, and environment language.
- You may refine their presentation through better staging, premium lighting, cleaner cropping, richer background integration, and stronger hierarchy.
- Do not replace the selected asset with a different invented product. Elevate the chosen asset into a premium campaign composition.`
          : hasThemeComposition || isAlliancePoster
          ? `\n\nSELECTED VISUAL REFERENCES (MANDATORY):
- I have provided one or more user-selected reference images. These are the user's actual chosen product/scene assets.
- Treat them as visual truth for the product family, silhouette, materials, detailing, proportions, finish quality, and environment language.
- Build the BACKGROUND PLATE around these selections so the final composed theme feels custom-designed from the user's choices.
- If the structured theme overlay later places the chosen asset into a hero slot, do NOT create a second isolated pasted cutout elsewhere in the frame.
- Instead, echo the selection through supporting environmental context: matching reflections, close-up product detailing, relevant supporting hardware, atmospheric lighting, texture language, and realistic surrounding scene cues.
- The final result must feel like a premium campaign background art-directed from these exact selected assets, not a generic stock concept.`
          : `\n\nREFERENCE / PRODUCT IMAGE (MUST USE):
- I have provided a reference or product image. You MUST incorporate the visual subject, product, or scene from this reference prominently in the generated image.
- The generated image should clearly feature and showcase the referenced subject as a key visual element.
- Match the reference's colors, style, and characteristics faithfully while integrating it into a professional, polished composition.
- The reference subject should be recognizable and prominent, not abstracted away.`
        : '';

      // Build the final edit prompt with logo as highest priority
      editPrompt =
        imagePrompt +
        logoInstruction +
        refInstruction +
        (aiOwnsFullPoster
          ? `\n\nFINAL PRIORITY ORDER: 1) Honor the selected reference assets as the product/scene truth. 2) Respect the selected theme structure and any reserved brand lanes. 3) Deliver a finished premium poster with readable hierarchy and balanced spacing.${hasStructuredBrandSelections ? ' 4) Leave the exact selected logos/footer lockups to the finishing pass unless a large, deliberate brand treatment is clearly called for in the reserved header lane.' : ' 4) Reproduce and integrate the supplied logo(s) faithfully.'}`
          : `\n\nFINAL PRIORITY ORDER: 1) Reproduce the logo exactly and prominently. 2) Match the visual style and scene description. 3) Integrate reference images naturally.`);
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
    let logoApplied = useEditEndpoint && hasLogo && effectiveLogoPlacement !== 'none';

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

    if (shouldUseLegacyThemeComposer && isAlliancePoster) {
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
    if (shouldUseLegacyThemeComposer && !isAlliancePoster && hasThemeComposition) {
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
        logoApplied = Boolean(primaryLogoBuffer);
      } catch (composeError) {
        console.error(`[theme-compose] FAILED for "${themeId}":`, composeError);
        // Fall through — finalPngBuffer stays as basePngBuffer, user gets base image
        // This prevents a 500 error but still delivers something
      }
    }

    const shouldApplyThemeFinisher =
      hasStructuredBrandSelections &&
      (
        (hasLogo && effectiveLogoPlacement !== 'none' && Boolean(primaryLogoBuffer)) ||
        posterSecondaryLogoBuffers.length > 0 ||
        Boolean(composedFooterWebsite || composedFooterEmail || partnerName || partnerTagline)
      );

    if (shouldApplyThemeFinisher) {
      finalPngBuffer = await applyThemeBrandFinisher({
        width: canvas.width,
        height: canvas.height,
        baseImageBuffer: finalPngBuffer,
        themeId,
        primaryLogoBuffer,
        secondaryLogoBuffers: posterSecondaryLogoBuffers,
        brandName: composedBrandName,
        partnerName,
        partnerTagline,
        footerWebsite: composedFooterWebsite,
        footerEmail: composedFooterEmail,
        palette: effectiveBrandColors,
      });

      logoApplied =
        logoApplied ||
        Boolean(
          (hasLogo && effectiveLogoPlacement !== 'none') ||
            posterSecondaryLogoBuffers.length > 0
        );
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
              theme_finisher_applied: shouldApplyThemeFinisher,
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
