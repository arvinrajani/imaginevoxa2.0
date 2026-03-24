'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  Sparkles,
  ImageIcon,
  Type,
  Palette,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Wand2,
  Zap,
  Eye,
  X,
  Info,
  Download,
  Link2,
  Plus,
  Trash2,
  Building2,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { getThemeSlots } from '@/lib/studio/theme-slots';
import { deriveStudioPalette } from '@/lib/studio/theme-palette';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageCreatorProps {
  brandId: string;
  brandName?: string;
  productName?: string;
  brandColors?: string[];
  brandColorNames?: Record<string, string>;
  logoUrl?: string;
  logoAssets?: Array<{ url: string; name?: string }>;
  analysisProfile?: {
    tone?: string | null;
    imageStyle?: string | null;
    postTypes?: string[];
    contentPillars?: string[];
    targetAudience?: string | null;
    businessFocus?: string | null;
    tagline?: string | null;
    website?: string | null;
    brandDescription?: string | null;
    ctaStyle?: string | null;
    visualDensity?: string | null;
  };
  confirmedPostText?: string;
  confirmedPostHeadline?: string;
  confirmedPostImagePrompt?: string;
  onImageConfirmed?: (imageUrl: string) => void;
  /** Called whenever a new image is generated — auto-syncs URL to parent without navigating */
  onImageGenerated?: (imageUrl: string) => void;
  /** Called when user edits brand colors manually */
  onBrandColorsChange?: (colors: string[]) => void;
  /** Pre-loaded PDF-extracted images from the parent's evidence state. When supplied the
   *  internal fetch is skipped — images stay in sync whenever evidence changes. */
  pdfImages?: PdfImageReference[];
  /** Selected PDFs in the current Studio run so the image panel can show missing-visual status. */
  selectedPdfs?: SelectedPdfSource[];
  /** Called to refresh evidence data (e.g. after re-extract) */
  onRefreshEvidence?: () => void;
  /** Called to upload PDF files for evidence extraction */
  onUploadPdfFiles?: (files: File[]) => Promise<void>;
  /** Called to re-extract visuals from already-uploaded PDFs */
  onReextractPdfs?: (ids: string[]) => Promise<void>;
  /** Called to delete extracted images or evidence rows */
  onDeleteEvidenceIds?: (ids: string[]) => Promise<void>;
}

type BlendModeId = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light';

type PdfImageReference = {
  id: string;
  title: string;
  signed_url: string;
  description?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
  sourceEvidenceId?: string | null;
};

type SelectedPdfSource = {
  id: string;
  title: string;
  extractedCount: number;
  canReextract: boolean;
};

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
    sanitizeVisualText(text, 120).replace(/^[-*\d.)\s]+/, '').trim();

  return {
    headline: clean(firstLine).slice(0, 80),
    tagline: clean(secondLine).slice(0, 120),
  };
}

function normalizeReferenceText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sanitizeVisualText(value: string | null | undefined, maxLength = 160) {
  if (!value) return '';

  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2022\u00B7•]/g, ' ')
    .replace(/[✓✔✅☑]/g, ' ')
    .replace(/[👉➜➤➡]/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function wrapPreviewText(value: string | null | undefined, maxChars: number, maxLines = 2) {
  const cleaned = sanitizeVisualText(value, Math.max(160, maxChars * Math.max(2, maxLines) * 4));
  if (!cleaned) return [];

  const words = cleaned.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function fitPreviewText(value: string | null | undefined, widths: number[], maxLines = 2) {
  if (!Array.isArray(widths) || widths.length === 0) return [];

  const cleaned = sanitizeVisualText(
    value,
    Math.max(...widths, 16) * Math.max(2, maxLines) * 4
  );
  if (!cleaned) return [];

  let fallback: string[] = [];
  for (const width of widths) {
    const lines = wrapPreviewText(cleaned, width, maxLines);
    fallback = lines;
    if (lines.join(' ').trim().length >= cleaned.length) {
      return lines;
    }
  }

  return fallback;
}

function normalizeHexColor(value: string | null | undefined) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{3,6}$/.test(hex)) return null;

  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toLowerCase()}`;
  }

  return `#${hex.slice(0, 6).toLowerCase()}`;
}

function dedupeBrandColorList(colors: string[]) {
  return Array.from(
    new Set(
      colors
        .map((color) => normalizeHexColor(color))
        .filter((color): color is string => Boolean(color))
    )
  ).slice(0, 8);
}

function colorListSignature(colors: string[]) {
  return dedupeBrandColorList(colors).join('|');
}

function resolveColorLabel(
  color: string,
  colorNames?: Record<string, string>
) {
  if (!colorNames) return color.toUpperCase();

  return (
    colorNames[color] ||
    colorNames[color.toLowerCase()] ||
    colorNames[color.toUpperCase()] ||
    color.toUpperCase()
  );
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

function getPdfImageDisplayTitle(title: string) {
  const normalized = title.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.*?)[\u2022\u00b7-]\s*(Extracted image \d+)$/i);

  if (!match) {
    return {
      primary: normalized,
      secondary: null as string | null,
    };
  }

  return {
    primary: match[2],
    secondary: match[1].trim() || null,
  };
}

function parsePdfImageSizeHint(description?: string | null) {
  if (typeof description !== 'string') return null;
  const match = description.match(/(\d{2,5})x(\d{2,5})px/i);
  if (!match) return null;

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width,
    height,
    area: width * height,
    aspectRatio: width / height,
  };
}

function getPdfImageKind(image: {
  title: string;
  description?: string | null;
  tags?: string[] | null;
}) {
  const normalized = image.title.toLowerCase();
  const description = (image.description || '').toLowerCase();
  const tags = Array.isArray(image.tags) ? image.tags : [];

  const isRenderedPage =
    tags.includes('pdf-rendered-page') ||
    tags.includes('pdf-page-1') ||
    /(?:cover|front|page)\s+\d*\s*visual/.test(normalized) ||
    description.includes('rendered page');

  const isEmbedded =
    tags.includes('pdf-embedded-image') ||
    normalized.includes('extracted image') ||
    description.includes('embedded image');

  if (isEmbedded && !isRenderedPage) return 'embedded';
  if (isRenderedPage && /cover|front page/.test(normalized)) return 'cover-page';
  if (isRenderedPage) return 'page';
  return 'unknown';
}

function isPdfPageLike(image: {
  title: string;
  description?: string | null;
  tags?: string[] | null;
}) {
  const kind = getPdfImageKind(image);
  return kind === 'page' || kind === 'cover-page';
}

function getPdfImageMetaLabel(image: {
  title: string;
  description?: string | null;
  tags?: string[] | null;
}) {
  const sizeHint = parsePdfImageSizeHint(image.description);
  const kind = getPdfImageKind(image);
  const kindLabel =
    kind === 'embedded'
      ? 'Extracted visual'
      : kind === 'cover-page'
        ? 'Cover page'
        : kind === 'page'
          ? 'Document page'
          : 'PDF visual';

  return {
    kindLabel,
    sizeLabel: sizeHint ? `${sizeHint.width}×${sizeHint.height}` : null,
  };
}

function getPdfImagePriorityScore(image: {
  title: string;
  description?: string | null;
  tags?: string[] | null;
}) {
  const normalized = image.title.toLowerCase();
  const tags = Array.isArray(image.tags) ? image.tags : [];
  const sizeHint = parsePdfImageSizeHint(image.description);
  const kind = getPdfImageKind(image);

  let score = 0;
  if (kind === 'embedded') score += 220;
  if (kind === 'cover-page') score -= 40;
  if (kind === 'page') score -= 180;

  if (tags.includes('pdf-page-1')) score += 30;
  if (tags.includes('pdf-rendered-page')) score -= 80;
  if (tags.includes('pdf-embedded-image')) score += 70;

  if (sizeHint) {
    if (sizeHint.area >= 260000) score += 220;
    else if (sizeHint.area >= 150000) score += 160;
    else if (sizeHint.area >= 90000) score += 100;
    else if (sizeHint.area < 45000) score -= 320;
    else if (sizeHint.area < 80000) score -= 180;

    if (Math.min(sizeHint.width, sizeHint.height) < 180) score -= 220;

    if (sizeHint.aspectRatio >= 0.5 && sizeHint.aspectRatio <= 2.3) score += 120;
    else if (sizeHint.aspectRatio >= 0.35 && sizeHint.aspectRatio <= 3.2) score += 40;
    else score -= 280;
  }

  if (/(logo|icon|shape|triangle|arrow|divider|bullet|seal|stamp)/.test(normalized)) {
    score -= 260;
  }

  if (normalized.includes('extracted image') && !sizeHint) {
    score -= 120;
  }

  if (kind === 'page' && sizeHint && sizeHint.area > 900000) {
    score -= 120;
  }

  return score;
}

function sortPdfImageReferences<
  T extends {
    title: string;
    description?: string | null;
    tags?: string[] | null;
    created_at?: string | null;
  }
>(images: T[]) {
  const sorted = [...images].sort((left, right) => {
    const scoreDifference =
      getPdfImagePriorityScore(right) - getPdfImagePriorityScore(left);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const rightTime = Date.parse(right.created_at || '') || 0;
    const leftTime = Date.parse(left.created_at || '') || 0;
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return left.title.localeCompare(right.title);
  });

  if (sorted.length <= 12) {
    return sorted;
  }

  const strongCandidates = sorted.filter((image) => getPdfImagePriorityScore(image) >= 120);
  if (strongCandidates.length >= 6) {
    return strongCandidates.slice(0, 24);
  }

  const usableCandidates = sorted.filter((image) => getPdfImagePriorityScore(image) >= 0);
  if (usableCandidates.length >= 6) {
    return usableCandidates.slice(0, 24);
  }

  return sorted.slice(0, 24);
}

function getPdfSourceEvidenceId(tags?: string[] | null) {
  if (!Array.isArray(tags)) return null;
  const sourceTag = tags.find(
    (tag) => typeof tag === 'string' && tag.startsWith('pdf-source-')
  );
  return sourceTag ? sourceTag.slice('pdf-source-'.length) : null;
}

function normalizeLogoAssets(
  assets?: Array<{ url: string; name?: string }>
): UploadedLogoAsset[] {
  if (!Array.isArray(assets)) return [];

  const seen = new Set<string>();
  return assets
    .map((asset, index) => {
      const url = typeof asset?.url === 'string' ? asset.url.trim() : '';
      if (!url) return null;
      const key = url.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: `brand-logo-${index}`,
        name: asset?.name?.trim() || `Brand logo ${index + 1}`,
        url,
      } satisfies UploadedLogoAsset;
    })
    .filter((asset): asset is UploadedLogoAsset => Boolean(asset));
}

function mergeLogoAssets(...collections: UploadedLogoAsset[][]): UploadedLogoAsset[] {
  const seen = new Set<string>();
  const merged: UploadedLogoAsset[] = [];

  for (const collection of collections) {
    for (const asset of collection) {
      const key = asset.url.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(asset);
    }
  }

  return merged;
}

type ToneOption = {
  id: string;
  label: string;
  emoji: string;
  description: string;
};

type StyleOption = {
  id: string;
  label: string;
  emoji: string;
  description: string;
};

type ThemeId =
  | 'guided-auto'
  | 'alliance-poster'
  | 'product-hero'
  | 'knowledge-visual'
  | 'clean-brand'
  | 'industrial-campaign'
  | 'datasheet-frame'
  | 'proof-stack'
  | 'launch-banner'
  | 'sector-collage'
  | 'brand-story'
  | 'offer-card'
  | 'comparison-board'
  | 'premium-editorial'
  | 'job-posting'
  | 'hiring-banner'
  | 'team-spotlight'
  | 'career-growth';

type ThemeOption = {
  id: ThemeId;
  label: string;
  category: 'General' | 'Campaign' | 'Technical' | 'Sales' | 'Hiring';
  description: string;
  summary: string;
  promptHint: string;
  recommendedTone: string;
  recommendedStyle: string;
  recommendedLogoPlacement: 'overlay' | 'infuse' | 'none';
};

type SavedImagePreset = {
  id: string;
  name: string;
  themeId: ThemeId;
  contextBrief: string;
  customPrompt: string;
  selectedTone: string;
  selectedStyle: string;
  logoPlacement: 'overlay' | 'infuse' | 'none';
  imageAspect: 'landscape' | 'square' | 'portrait';
  partnerName?: string;
  partnerTagline?: string;
  footerWebsite?: string;
  footerEmail?: string;
  benefitsText?: string;
  useReferenceAsHero?: boolean;
};

type UploadedLogoAsset = {
  id: string;
  name: string;
  url: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TONE_OPTIONS: ToneOption[] = [
  { id: 'professional', label: 'Professional', emoji: 'P', description: 'Corporate and polished' },
  { id: 'bold', label: 'Bold', emoji: 'B', description: 'High-impact and vibrant' },
  { id: 'creative', label: 'Creative', emoji: 'C', description: 'Artistic and expressive' },
  { id: 'minimal', label: 'Minimal', emoji: 'M', description: 'Clean and refined' },
  { id: 'warm', label: 'Warm', emoji: 'W', description: 'Friendly and approachable' },
  { id: 'tech', label: 'Tech', emoji: 'T', description: 'Futuristic and digital' },
  { id: 'luxury', label: 'Luxury', emoji: 'L', description: 'Premium and exclusive' },
];

const STYLE_OPTIONS: StyleOption[] = [
  { id: 'text-overlay', label: 'Quote Card', emoji: 'Q', description: 'Text-safe hero layout' },
  { id: 'photo-blend', label: 'Photo + Text', emoji: 'P', description: 'Photo with clear text-safe zone' },
  { id: 'abstract-brand', label: 'Brand Abstract', emoji: 'A', description: 'Gradients and shapes for overlays' },
  { id: 'split-layout', label: 'Split Layout', emoji: 'S', description: 'Visual + reserved text zone' },
  { id: 'infographic', label: 'Data Card', emoji: 'D', description: 'Stats and icons layout' },
  { id: 'cinematic', label: 'Cinematic', emoji: 'C', description: 'Dramatic and moody' },
];

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'guided-auto',
    label: 'AI Guided',
    category: 'General',
    description: 'Fully AI-built image mode driven by your vision, references, and brand direction.',
    summary: 'Best when you want AI to compose the full visual instead of forcing a fixed template.',
    promptHint:
      'Describe the exact image you want: subject, setting, camera angle, composition, lighting, typography treatment, and must-show elements.',
    recommendedTone: 'professional',
    recommendedStyle: 'split-layout',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'alliance-poster',
    label: 'Alliance Poster',
    category: 'Campaign',
    description: 'Structured brand + product poster with a more campaign-style layout.',
    summary: 'Best for Zaincom-style alliance/product creatives instead of generic ad images.',
    promptHint:
      'Mention the partner brand, product name, headline direction, and whether the product image should be the main hero on the left.',
    recommendedTone: 'bold',
    recommendedStyle: 'split-layout',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'product-hero',
    label: 'Product Hero',
    category: 'Sales',
    description: 'Clean, premium product-led visual with strong focus on the item itself.',
    summary: 'Best when the product image or object should carry most of the design.',
    promptHint:
      'Describe the product, ideal setting, material finish, viewing angle, and what should feel premium about it.',
    recommendedTone: 'professional',
    recommendedStyle: 'photo-blend',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'knowledge-visual',
    label: 'Knowledge-Led',
    category: 'Technical',
    description: 'Uses PDF/site references more heavily so the result feels grounded in real materials.',
    summary: 'Best when you want AI to follow a brochure, datasheet, or extracted PDF image closely.',
    promptHint:
      'Explain what the reference image proves, what facts or features matter, and what the audience should understand immediately.',
    recommendedTone: 'tech',
    recommendedStyle: 'split-layout',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'clean-brand',
    label: 'Clean Brand',
    category: 'General',
    description: 'Minimal, controlled, brand-native visual with less visual clutter.',
    summary: 'Best for polished branded posts where restraint matters more than visual density.',
    promptHint:
      'Describe the message in one or two sentences and note any required whitespace, clean text zones, or minimal design cues.',
    recommendedTone: 'minimal',
    recommendedStyle: 'text-overlay',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'industrial-campaign',
    label: 'Industrial Campaign',
    category: 'Campaign',
    description: 'High-energy industrial ad look with machinery, infrastructure, and strong hierarchy.',
    summary: 'Best for motors, switchgear, automation, electrification, and heavy-duty product campaigns.',
    promptHint:
      'Mention the industrial setting, equipment, scale, and whether the result should feel like a premium electrical campaign poster.',
    recommendedTone: 'bold',
    recommendedStyle: 'cinematic',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'datasheet-frame',
    label: 'Datasheet Frame',
    category: 'Technical',
    description: 'Brochure-like product layout with clear content blocks and disciplined information areas.',
    summary: 'Best when you want the result to feel like a technical brochure, not a generic ad image.',
    promptHint:
      'Describe the product, specs or proof points that matter, and whether the design should feel technical, modular, or brochure-driven.',
    recommendedTone: 'tech',
    recommendedStyle: 'infographic',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'proof-stack',
    label: 'Proof Stack',
    category: 'Technical',
    description: 'Trust-led visual with proof cards, metrics, and strong evidence-style framing.',
    summary: 'Best for case studies, certifications, performance proof, and B2B credibility posts.',
    promptHint:
      'Describe the proof you want to show: metrics, certifications, product reliability, client trust, or evidence-led features.',
    recommendedTone: 'professional',
    recommendedStyle: 'split-layout',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'launch-banner',
    label: 'Launch Banner',
    category: 'Campaign',
    description: 'Headline-first announcement layout for launches, new arrivals, or bold campaign reveals.',
    summary: 'Best for product launches, event announcements, or attention-grabbing rollout creatives.',
    promptHint:
      'Describe what is launching, who it is for, and whether the image should feel urgent, premium, or celebratory.',
    recommendedTone: 'bold',
    recommendedStyle: 'text-overlay',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'sector-collage',
    label: 'Sector Collage',
    category: 'Campaign',
    description: 'Multi-scene layout that shows application sectors, environments, or use cases in one creative.',
    summary: 'Best when you want to show industries served such as data centers, hospitals, factories, and buildings.',
    promptHint:
      'List the sectors or environments that should appear and what the audience should understand about their applications.',
    recommendedTone: 'tech',
    recommendedStyle: 'split-layout',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'brand-story',
    label: 'Brand Story',
    category: 'General',
    description: 'Narrative-led theme for founder, company story, values, and positioning visuals.',
    summary: 'Best for brand positioning, story-led posts, and more human company narratives.',
    promptHint:
      'Describe the story, values, or positioning you want to communicate and whether the image should feel personal, premium, or visionary.',
    recommendedTone: 'warm',
    recommendedStyle: 'photo-blend',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'offer-card',
    label: 'Offer Card',
    category: 'Sales',
    description: 'Clear spotlight card for offers, bundles, service promos, or package-focused post creatives.',
    summary: 'Best for LinkedIn posts where the offer, package, or service should be immediately clear without looking like a web ad.',
    promptHint:
      'Describe the offer, promotion, or service highlight and whether the image should feel urgent, premium, or brand-forward.',
    recommendedTone: 'bold',
    recommendedStyle: 'text-overlay',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'comparison-board',
    label: 'Comparison Board',
    category: 'Technical',
    description: 'Structured side-by-side visual for product comparisons, before/after, or feature contrasts.',
    summary: 'Best when you want a disciplined comparison layout rather than one single hero scene.',
    promptHint:
      'Mention what is being compared and what the viewer should understand immediately from the visual contrast.',
    recommendedTone: 'professional',
    recommendedStyle: 'infographic',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'premium-editorial',
    label: 'Premium Editorial',
    category: 'Campaign',
    description: 'Magazine-style polished creative with art-directed composition and luxury finishing.',
    summary: 'Best for premium brand perception, executive-level visuals, and polished campaign moments.',
    promptHint:
      'Describe the premium mood, materials, lighting, and subject so the image feels editorial rather than generic.',
    recommendedTone: 'luxury',
    recommendedStyle: 'cinematic',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'job-posting',
    label: 'Job Posting',
    category: 'Hiring',
    description: 'Professional job listing card with role title, requirements, and a clear Apply Now call-to-action.',
    summary: 'Best for sharing open positions, job listings, and role announcements on LinkedIn.',
    promptHint:
      'Describe the role title, key requirements, location, and what makes this opportunity stand out.',
    recommendedTone: 'professional',
    recommendedStyle: 'corporate',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'hiring-banner',
    label: 'Hiring Banner',
    category: 'Hiring',
    description: 'Bold, attention-grabbing "We\'re Hiring" banner designed to stop the scroll and attract top talent.',
    summary: 'Best for general recruitment announcements, hiring drives, and talent attraction campaigns.',
    promptHint:
      'Describe the energy and culture of your workplace so the banner radiates the right vibe for candidates.',
    recommendedTone: 'bold',
    recommendedStyle: 'vibrant',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'team-spotlight',
    label: 'Team Spotlight',
    category: 'Hiring',
    description: 'Warm team culture showcase with a team photo, company values, and a welcoming "Join Us" message.',
    summary: 'Best for employer branding, culture posts, team introductions, and "life at" content.',
    promptHint:
      'Describe your team culture, values, and what makes working here special. Upload a team or office photo.',
    recommendedTone: 'warm',
    recommendedStyle: 'lifestyle',
    recommendedLogoPlacement: 'overlay',
  },
  {
    id: 'career-growth',
    label: 'Career Growth',
    category: 'Hiring',
    description: 'Career opportunity card highlighting benefits, perks, and growth path to attract ambitious candidates.',
    summary: 'Best for showcasing career development, employee benefits, and why candidates should join.',
    promptHint:
      'Describe the key benefits, growth opportunities, and perks that make this role or company attractive.',
    recommendedTone: 'inspirational',
    recommendedStyle: 'corporate',
    recommendedLogoPlacement: 'overlay',
  },
];

const THEME_CATEGORY_ORDER: Array<ThemeOption['category']> = [
  'General',
  'Campaign',
  'Technical',
  'Sales',
  'Hiring',
];

const BLEND_MODE_OPTIONS: Array<{ id: BlendModeId; label: string; description: string }> = [
  { id: 'normal', label: 'Normal', description: 'No extra blending' },
  { id: 'multiply', label: 'Multiply', description: 'Natural on light backgrounds' },
  { id: 'screen', label: 'Screen', description: 'Natural on dark backgrounds' },
  { id: 'overlay', label: 'Overlay', description: 'High-contrast mix' },
  { id: 'soft-light', label: 'Soft Light', description: 'Subtle premium blend' },
];

const ASPECT_DIMENSIONS: Record<'landscape' | 'square' | 'portrait', { width: number; height: number }> = {
  landscape: { width: 1200, height: 628 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
};

function createPresetId() {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPresetStorageKey(brandId: string) {
  return `image_creator_presets_${brandId}`;
}

function createLocalAssetId() {
  return `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function autoPopulateThemeSlotAssignments(args: {
  themeId: ThemeId;
  currentAssignments: Record<string, string | null>;
  selectedReferenceImage: string | null;
  pdfImages: Array<{ signed_url: string }>;
  siteImages: Array<{ url: string }>;
}) {
  const { themeId, currentAssignments, selectedReferenceImage, pdfImages, siteImages } = args;
  const nextAssignments = { ...currentAssignments };
  const openSlots = getThemeSlots(themeId).filter((slot) => slot.id !== 'hero' && !nextAssignments[slot.id]);
  if (openSlots.length === 0) return nextAssignments;

  const candidatePool = Array.from(
    new Set(
      [
        selectedReferenceImage,
        ...pdfImages.map((image) => image.signed_url),
        ...siteImages.map((image) => image.url),
      ].filter((value): value is string => Boolean(value))
    )
  );

  if (candidatePool.length === 0) return nextAssignments;

  let cursor = 0;
  for (const slot of openSlots) {
    nextAssignments[slot.id] = candidatePool[Math.min(cursor, candidatePool.length - 1)];
    if (cursor < candidatePool.length - 1) {
      cursor += 1;
    }
  }

  return nextAssignments;
}

function splitMultilineList(value: string, max = 6) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*.\d)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function derivePosterBenefitLines(...sources: Array<string | undefined>) {
  const seen = new Set<string>();
  const picked: string[] = [];

  const remember = (value: string) => {
    value = sanitizeVisualText(value, 96);
    const cleaned = value
      .replace(/^[-*.\d)\s]+/, '')
      .replace(/^[•✓✔]+\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["'“”]+|["'“”]+$/g, '');
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
    picked.push(cleaned);
  };

  for (const source of sources) {
    if (!source) continue;

    const directLines = splitMultilineList(source, 12);
    directLines.forEach(remember);

    if (picked.length >= 6) {
      return picked.slice(0, 6);
    }

    source
      .split(/[.!?]/)
      .map((line) => line.trim())
      .forEach(remember);

    if (picked.length >= 6) {
      return picked.slice(0, 6);
    }
  }

  return picked.slice(0, 6);
}

function ThemePreviewMini({
  themeId,
  isActive,
}: {
  themeId: ThemeId;
  isActive: boolean;
}) {
  const ringClass = isActive ? 'ring-1 ring-white/40' : '';

  if ((themeId as string) === 'alliance-poster') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#0a1e3d] via-[#0f4180] to-[#0a4a8a] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2">
            <div className="h-5 w-14 rounded bg-white/95" />
            <div className="flex-1">
              <div className="h-2.5 w-36 rounded bg-white/90" />
              <div className="mt-1 h-2.5 w-28 rounded bg-amber-300" />
            </div>
            <div className="flex gap-1">
              <div className="h-5 w-8 rounded bg-white/90" />
              <div className="h-5 w-8 rounded bg-white/75" />
            </div>
          </div>
          <div className="mt-2 flex flex-1 gap-2">
            <div className="h-full w-16 rounded-xl bg-white/18" />
            <div className="flex-1 space-y-1.5 pt-1">
              <div className="h-2.5 w-full rounded bg-white/75" />
              <div className="h-2.5 w-11/12 rounded bg-white/75" />
              <div className="h-2.5 w-10/12 rounded bg-white/75" />
            </div>
          </div>
          <div className="mt-2 h-3 rounded bg-sky-200/80" />
        </div>
      </div>
    );
  }

  if (themeId === 'product-hero') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-200 p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-slate-700 shadow-lg" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-slate-800" />
            <div className="h-2.5 w-1/2 rounded bg-slate-400" />
            <div className="h-7 w-24 rounded-xl border border-slate-300 bg-white" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'knowledge-visual') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-800 to-slate-700 p-2 shadow-sm ${ringClass}`}>
        <div className="grid h-full grid-cols-[1.1fr_0.9fr] gap-2">
          <div className="rounded-lg border border-white/10 bg-white/10" />
          <div className="space-y-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-2">
            <div className="h-2 w-3/4 rounded bg-cyan-100" />
            <div className="h-2 w-full rounded bg-cyan-100/80" />
            <div className="h-2 w-4/5 rounded bg-cyan-100/80" />
            <div className="mt-2 h-6 rounded bg-white/20" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'clean-brand') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-2">
          <div className="h-2.5 w-16 rounded bg-slate-300" />
          <div className="mt-3 h-3 w-40 rounded bg-slate-900" />
          <div className="mt-1.5 h-2.5 w-24 rounded bg-slate-400" />
          <div className="mt-auto flex justify-end">
            <div className="h-5 w-12 rounded bg-slate-900" />
          </div>
        </div>
      </div>
    );
  }

  if ((themeId as string) === 'industrial-campaign') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-950 via-[#13325e] to-[#1d5aa8] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full gap-2">
          <div className="w-[42%] rounded-xl bg-white/12" />
          <div className="flex-1 space-y-1.5 rounded-xl bg-black/18 p-2">
            <div className="h-2.5 w-4/5 rounded bg-white/90" />
            <div className="h-2.5 w-3/5 rounded bg-amber-300" />
            <div className="mt-2 h-3 w-full rounded bg-white/55" />
            <div className="h-3 w-11/12 rounded bg-white/55" />
            <div className="h-3 w-9/12 rounded bg-white/55" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'datasheet-frame') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-200 p-2 shadow-sm ${ringClass}`}>
        <div className="grid h-full grid-cols-[0.9fr_1.1fr] gap-2">
          <div className="rounded-xl border border-slate-300 bg-slate-900/85" />
          <div className="grid grid-rows-[0.7fr_1fr] gap-2">
            <div className="rounded-lg border border-slate-300 bg-white p-2">
              <div className="h-2.5 w-3/4 rounded bg-slate-900" />
              <div className="mt-1.5 h-2.5 w-2/3 rounded bg-slate-300" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-300 bg-white/85" />
              <div className="rounded-lg border border-slate-300 bg-white/85" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'proof-stack') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#eef4ff] via-white to-[#f7fbff] p-2 shadow-sm ${ringClass}`}>
        <div className="grid h-full grid-cols-[1fr_0.95fr] gap-2">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2">
            <div className="h-2.5 w-3/4 rounded bg-slate-900" />
            <div className="grid grid-cols-3 gap-1.5">
              <div className="h-6 rounded bg-emerald-100" />
              <div className="h-6 rounded bg-sky-100" />
              <div className="h-6 rounded bg-amber-100" />
            </div>
          </div>
          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-900/90 p-2">
            <div className="h-2.5 w-2/3 rounded bg-white/90" />
            <div className="h-2.5 w-full rounded bg-white/55" />
            <div className="h-2.5 w-4/5 rounded bg-white/55" />
            <div className="mt-2 h-4 w-20 rounded bg-emerald-300" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'launch-banner') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#140f2b] via-[#5b2b91] to-[#ff5f6d] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full flex-col rounded-xl border border-white/15 bg-black/10 p-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 rounded-full bg-white/90" />
            <div className="h-4 w-10 rounded-full bg-amber-300" />
          </div>
          <div className="mt-2 h-3 w-4/5 rounded bg-white/95" />
          <div className="mt-1.5 h-3 w-2/3 rounded bg-white/75" />
          <div className="mt-auto flex items-end justify-between">
            <div className="h-5 w-14 rounded-lg bg-white/20" />
            <div className="h-6 w-12 rounded-lg bg-white/90" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'sector-collage') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#0d203f] via-[#214d7e] to-[#7bb2d8] p-2 shadow-sm ${ringClass}`}>
        <div className="grid h-full grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/14" />
          <div className="rounded-xl bg-white/10" />
          <div className="rounded-xl bg-white/14" />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <div className="h-2.5 rounded bg-white/70" />
          <div className="h-2.5 rounded bg-white/70" />
          <div className="h-2.5 rounded bg-white/70" />
          <div className="h-2.5 rounded bg-white/70" />
        </div>
      </div>
    );
  }

  if (themeId === 'brand-story') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#f6efe7] via-white to-[#e7eef7] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full items-center gap-2">
          <div className="h-14 w-14 rounded-full bg-slate-700/85" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-4/5 rounded bg-slate-900" />
            <div className="h-2.5 w-3/5 rounded bg-slate-400" />
            <div className="h-2.5 w-full rounded bg-slate-300" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'offer-card') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#171433] via-[#4a2d88] to-[#ff885a] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full gap-2">
          <div className="flex-1 rounded-xl bg-white/10 p-2">
            <div className="h-3 w-2/3 rounded bg-white/95" />
            <div className="mt-1.5 h-3 w-1/2 rounded bg-amber-300" />
            <div className="mt-3 h-6 w-16 rounded-lg bg-white/90" />
          </div>
          <div className="w-[34%] rounded-xl bg-white/20" />
        </div>
      </div>
    );
  }

  if (themeId === 'comparison-board') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-200 p-2 shadow-sm ${ringClass}`}>
        <div className="grid h-full grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-300 bg-white p-2">
            <div className="h-2.5 w-2/3 rounded bg-slate-900" />
            <div className="mt-2 h-7 rounded bg-slate-200" />
          </div>
          <div className="rounded-xl border border-slate-300 bg-white p-2">
            <div className="h-2.5 w-2/3 rounded bg-slate-900" />
            <div className="mt-2 h-7 rounded bg-sky-200" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'premium-editorial') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#111111] via-[#2c1f1f] to-[#9a6f4f] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full gap-2">
          <div className="w-[38%] rounded-2xl bg-white/10" />
          <div className="flex-1 space-y-2 rounded-2xl bg-black/20 p-2">
            <div className="h-3 w-4/5 rounded bg-white/95" />
            <div className="h-2.5 w-3/5 rounded bg-[#e7c28b]" />
            <div className="mt-3 h-2.5 w-full rounded bg-white/45" />
            <div className="h-2.5 w-5/6 rounded bg-white/45" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'job-posting') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#1a2744] via-[#2d4a7a] to-[#4a90d9] p-2 shadow-sm ${ringClass}`}>
        <div className="mb-1 h-3 w-full rounded-t bg-blue-500/80">
          <p className="text-center text-[6px] font-bold leading-[12px] text-white">WE'RE HIRING</p>
        </div>
        <div className="flex h-[calc(100%-16px)] gap-1.5">
          <div className="flex-1 space-y-1 p-1">
            <div className="h-2.5 w-4/5 rounded bg-white/90" />
            <div className="h-2 w-full rounded bg-white/40" />
            <div className="mt-1 space-y-0.5">
              <div className="h-1.5 w-3/4 rounded bg-white/30" />
              <div className="h-1.5 w-2/3 rounded bg-white/30" />
            </div>
            <div className="mt-1 h-4 w-14 rounded bg-blue-400" />
          </div>
          <div className="w-[36%] rounded-lg bg-white/18" />
        </div>
      </div>
    );
  }

  if (themeId === 'hiring-banner') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#1e1145] via-[#6b2fa0] to-[#e85d75] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full flex-col items-center justify-center rounded-xl border border-white/12 bg-white/5 p-2">
          <div className="mb-1 h-3.5 w-20 rounded-full bg-white/90">
            <p className="text-center text-[5.5px] font-bold leading-[14px] text-purple-700">WE'RE HIRING</p>
          </div>
          <div className="h-3 w-4/5 rounded bg-white/90" />
          <div className="mt-1 h-2.5 w-3/5 rounded bg-white/50" />
          <div className="mt-2 h-4 w-16 rounded-lg bg-white/85" />
        </div>
      </div>
    );
  }

  if (themeId === 'team-spotlight') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#1a3a2a] via-[#2a5a3a] to-[#4a9a6a] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full items-center gap-2">
          <div className="h-14 w-14 flex-shrink-0 rounded-full bg-white/20 ring-2 ring-white/30" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-16 rounded bg-emerald-300/70" />
            <div className="h-3 w-4/5 rounded bg-white/90" />
            <div className="h-2.5 w-3/5 rounded bg-white/50" />
            <div className="mt-1 h-4 w-12 rounded bg-emerald-400" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'career-growth') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full gap-1.5">
          <div className="flex-1 space-y-1 p-1">
            <div className="h-2 w-16 rounded bg-cyan-300/60" />
            <div className="h-2.5 w-4/5 rounded bg-white/90" />
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-cyan-400" />
                <div className="h-2 flex-1 rounded bg-white/35" />
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-cyan-400" />
                <div className="h-2 flex-1 rounded bg-white/35" />
              </div>
            </div>
          </div>
          <div className="w-[36%] rounded-lg bg-white/15" />
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-fuchsia-100 via-white to-indigo-100 p-2 shadow-sm ${ringClass}`}>
      <div className="grid h-full grid-cols-[1fr_1fr] gap-2">
        <div className="rounded-lg bg-gradient-to-br from-fuchsia-400 to-pink-300" />
        <div className="space-y-1.5 rounded-lg border border-white/70 bg-white/75 p-2">
          <div className="h-2.5 w-4/5 rounded bg-slate-800" />
          <div className="h-2.5 w-full rounded bg-slate-500" />
          <div className="h-2.5 w-2/3 rounded bg-slate-400" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ThemePreviewLarge — full-size right-panel layout mockup per theme
// ─────────────────────────────────────────────────────────────────────────────
interface ThemePreviewLargeProps {
  themeId: ThemeId;
  previewAspectClass: string;
  uploadedLogo: string | null;
  brandColors?: string[];
  allianceHeaderLogos: Array<{ id: string; url: string; name: string }>;
  brandName?: string;
  partnerName: string;
  partnerTagline: string;
  activeHeadlineText?: string;
  activeTaglineText?: string;
  featureLines: string[];
  footerWebsite?: string;
  footerEmail?: string;
  selectedReferenceImage: string | null;
  hasPostContext: boolean;
  slotAssignments?: Record<string, string | null>;
  customPrompt?: string;
  selectedToneLabel?: string;
  selectedStyleLabel?: string;
}

function ThemePreviewLarge({
  themeId,
  previewAspectClass,
  uploadedLogo,
  brandColors,
  allianceHeaderLogos,
  brandName,
  partnerName,
  partnerTagline,
  activeHeadlineText,
  activeTaglineText,
  featureLines = [],
  footerWebsite,
  footerEmail,
  selectedReferenceImage,
  hasPostContext,
  slotAssignments,
  customPrompt,
  selectedToneLabel,
  selectedStyleLabel,
}: ThemePreviewLargeProps) {
  const previewPalette = deriveStudioPalette(brandColors);
  const slotHero = slotAssignments?.['hero'] || null;
  const heroSrc = selectedReferenceImage || slotHero || null;
  const showHero = Boolean(heroSrc);
  const safeHeadline = sanitizeVisualText(activeHeadlineText || brandName || 'Campaign headline', 96);
  const safeTagline = sanitizeVisualText(activeTaglineText || partnerTagline || '', 120);
  const safeFeatureLines = derivePosterBenefitLines(
    ...featureLines,
    activeTaglineText,
    activeHeadlineText,
    customPrompt
  ).slice(0, 6);
  const safeFooterWebsite = sanitizeVisualText(footerWebsite || '', 48);
  const safeFooterEmail = sanitizeVisualText(footerEmail || '', 48);
  const visionLines = wrapPreviewText(customPrompt || '', 34, 4);
  const headlineLines = wrapPreviewText(safeHeadline, 28, 2);
  const standardHeadlineLines = fitPreviewText(safeHeadline, [20, 22, 24, 26], 3);
  const compactHeadlineLines = fitPreviewText(safeHeadline, [16, 18, 20, 22], 4);
  const supportingTaglineLines = fitPreviewText(safeTagline, [22, 26, 30, 34], 3);
  const shortTaglineLines = fitPreviewText(safeTagline, [20, 24, 28], 2);
  const productHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22, 24], 3);
  const productTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 3);
  const knowledgeHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22], 3);
  const knowledgeTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 3);
  const datasheetHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22], 2);
  const datasheetTaglineLines = fitPreviewText(safeTagline, [22, 26, 30], 2);
  const proofHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22], 2);
  const proofTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 3);
  const launchHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22, 24], 3);
  const launchTaglineLines = fitPreviewText(safeTagline, [22, 26, 30], 2);
  const footerLine = [safeFooterWebsite, safeFooterEmail].filter(Boolean).join(' | ');
  const footerPreviewLines = fitPreviewText(footerLine, [30, 34, 38, 42], 2);
  const allianceTaglineLines = wrapPreviewText(safeTagline || partnerName || '', 24, 2);
  const hasAllianceHeaderContent =
    allianceHeaderLogos.length > 0 || Boolean((partnerName || '').trim() || (partnerTagline || '').trim());
  const previewTone = sanitizeVisualText(selectedToneLabel || '', 24);
  const previewStyle = sanitizeVisualText(selectedStyleLabel || '', 24);

  /** Get the assigned image URL for a named slot */
  const getSlotSrc = (slotId: string) => slotAssignments?.[slotId] || null;
  const generateCta = null;

  function renderHeroZone(
    className: string,
    options?: {
      fit?: 'contain' | 'cover';
      imagePaddingClass?: string;
      fallbackLabel?: string;
    }
  ) {
    const fitClass = options?.fit === 'cover' ? 'object-cover' : 'object-contain';
    const paddingClass =
      options?.fit === 'cover' ? options?.imagePaddingClass || '' : options?.imagePaddingClass || 'p-3';
    return (
      <div className={`flex items-center justify-center overflow-hidden ${className}`}>
        {showHero ? (
          <img
            src={heroSrc!}
            alt="Reference"
            className={`h-full w-full ${fitClass} ${paddingClass} drop-shadow-lg`}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/30">
            <ImageIcon className="h-8 w-8" />
            <span className="text-[9px] font-medium">
              {options?.fallbackLabel || 'Hero area'}
            </span>
          </div>
        )}
      </div>
    );
  }

  function renderLogoBox(className: string, light = false) {
    return (
      <div className={`flex items-center justify-center overflow-hidden ${className}`}>
        {uploadedLogo ? (
          <>
            <img
              src={uploadedLogo}
              alt="Logo"
              className="h-full w-full object-contain p-1.5 drop-shadow-sm"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling as HTMLSpanElement | null;
                if (fallback) {
                  fallback.style.display = 'block';
                }
              }}
            />
            <span
              className={`hidden px-1.5 text-center text-[9px] font-bold leading-tight ${light ? 'text-white/85' : 'text-slate-600'}`}
            >
              {brandName || 'Brand'}
            </span>
          </>
        ) : (
          <span
            className={`px-1.5 text-center text-[9px] font-bold leading-tight ${light ? 'text-white/85' : 'text-slate-600'}`}
          >
            {brandName || 'Brand'}
          </span>
        )}
      </div>
    );
  }

  if (!hasPostContext) {
    return (
      <div className={`${previewAspectClass} relative flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700`}>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <ImageIcon className="h-8 w-8 text-white/50" />
          </div>
          <p className="text-sm font-semibold text-white/70">Confirm your post first</p>
          <p className="mt-1 text-xs text-white/40 max-w-xs text-center px-4">Go back to Step 1, confirm a post variant, then return here.</p>
        </div>
      </div>
    );
  }

  if (themeId === 'guided-auto') {
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)` }} />
        <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 22% 28%, ${previewPalette.accent}26, transparent 22%), radial-gradient(circle at 78% 76%, ${previewPalette.support}20, transparent 18%)` }} />

        <div className="absolute inset-[4%] grid grid-cols-[0.9fr_1.1fr] gap-[3%]">
          <div className="rounded-[24px] border border-white/12 bg-white/8 p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/12">
                  <Wand2 className="h-4 w-4 text-white/85" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">AI Guided</p>
                  <p className="text-[12px] font-semibold text-white">Fully AI-composed visual</p>
                </div>
              </div>
              {uploadedLogo && (
                <div className="h-9 w-16 rounded-lg bg-white/92 p-1">
                  <img src={uploadedLogo} alt="Brand logo" className="h-full w-full object-contain" />
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[20px] border border-white/10 bg-black/12 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Your Vision</p>
              <div className="mt-2 space-y-2">
                {visionLines.length > 0 ? (
                  visionLines.map((line, index) => (
                    <p key={`${line}-${index}`} className="text-[13px] leading-relaxed text-white/95">
                      {line}
                    </p>
                  ))
                ) : (
                  <>
                    <p className="text-[13px] leading-relaxed text-white/90">Describe the scene, subject, framing, mood, and must-show details.</p>
                    <p className="text-[12px] leading-relaxed text-white/55">AI Guided uses this box as the main creative brief instead of forcing a fixed template.</p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Tone</p>
                <p className="mt-1 text-[12px] font-semibold text-white">{previewTone || 'Professional'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Style</p>
                <p className="mt-1 text-[12px] font-semibold text-white">{previewStyle || 'Split Layout'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/12 bg-white/8 p-3 backdrop-blur-sm">
            <div className="relative h-full overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/20">
              {showHero ? (
                <img src={heroSrc!} alt="Reference" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-white/55">
                  <ImageIcon className="h-10 w-10" />
                  <p className="text-[12px] font-semibold">AI will build the full composition</p>
                  <p className="max-w-[70%] text-center text-[11px] leading-relaxed text-white/45">
                    Add a reference image if you want the AI to follow a product or scene more closely.
                  </p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-5 pb-5 pt-12">
                <div className="max-w-[82%] space-y-1">
                  {wrapPreviewText(safeHeadline, 24, 2).map((line, index) => (
                    <p key={`${line}-${index}`} className="text-[24px] font-black leading-tight text-white drop-shadow-sm">
                      {line}
                    </p>
                  ))}
                  {safeTagline && (
                    <p className="text-[13px] font-medium text-white/82">{safeTagline}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if ((themeId as string) === 'alliance-poster') {
    const allianceHeadlineLines = fitPreviewText(safeHeadline, [22, 24, 26], 2);
    const allianceFeatureLines = (
      safeFeatureLines.length > 0 ? safeFeatureLines : ['Product proof points appear here']
    ).slice(0, 5);
    return (
      <div className={`${previewAspectClass} overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div
          className="relative h-full w-full text-white"
          style={{
            backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 18% 48%, ${previewPalette.muted}30, transparent 26%), radial-gradient(circle at 74% 18%, rgba(255,255,255,0.08), transparent 18%)`,
            }}
          />
          <div className="absolute inset-x-0 top-0 h-[17.5%] border-b border-white/20 bg-black/12" />
          <div className="absolute inset-x-0 bottom-0 h-[8.5%] border-t border-white/20" style={{ backgroundColor: previewPalette.footer }} />

          <div className="absolute left-[3%] top-[3.2%] flex h-[9%] w-[19%] items-center justify-center rounded-xl bg-white/95 p-2 shadow-lg">
            {uploadedLogo ? (
              <img src={uploadedLogo} alt="Primary logo preview" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[11px] font-bold text-slate-700">{brandName || 'Your brand'}</span>
            )}
          </div>

          {hasAllianceHeaderContent && (
            <div
              className="absolute right-[2.5%] top-[3.2%] flex h-[9%] w-[22%] items-center justify-center gap-2 rounded-xl px-2 backdrop-blur-sm"
              style={{ backgroundColor: `${previewPalette.headerPanel}bb` }}
            >
              {allianceHeaderLogos.length > 0 ? (
                allianceHeaderLogos.map((logo) => (
                  <div key={logo.id} className="flex h-[72%] flex-1 items-center justify-center rounded-lg bg-white/92 p-1">
                    <img src={logo.url} alt={logo.name} className="h-full w-full object-contain" />
                  </div>
                ))
              ) : (
                <div className="text-center">
                  <p className="text-[11px] font-semibold">{partnerName || 'Partner logo'}</p>
                  <p className="text-[9px] text-white/70">{partnerTagline || 'Alliance header zone'}</p>
                </div>
              )}
            </div>
          )}

          <div className="absolute left-[24%] right-[25%] top-[4.2%] text-center">
            <div className="space-y-1">
              {allianceHeadlineLines.map((line, index) => (
                <p key={`${line}-${index}`} className="text-[19px] font-semibold italic leading-tight text-white drop-shadow-sm">
                  {line}
                </p>
              ))}
            </div>
            {allianceTaglineLines.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {allianceTaglineLines.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className="text-[25px] font-black italic leading-none drop-shadow-sm"
                    style={{ color: previewPalette.accent }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="absolute bottom-[11%] left-[5.5%] top-[28%] w-[25%]">
            <div className="absolute bottom-[4%] left-[1%] right-[8%] h-[10%] rounded-[18px] bg-white/[16%] blur-sm" />
            <div className="absolute bottom-[1%] left-[3%] right-[9%] h-[10%] rounded-[18px] border border-white/20 bg-white/10" />
            <div className="absolute inset-0 rounded-[24px] border border-white/10 bg-white/5">
              {renderHeroZone('absolute inset-0 rounded-[24px]')}
            </div>
          </div>

          <div className="absolute right-[4%] top-[28%] w-[41%] space-y-2.5">
            {allianceFeatureLines.map((line, index) => (
              <div key={`${line}-${index}`} className="flex items-center gap-3 rounded-r-full bg-slate-950/[28%] px-4 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg shadow" style={{ backgroundColor: previewPalette.support }}>
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  {fitPreviewText(line, [22, 24, 26], 2).map((chunk, chunkIndex) => (
                    <p key={`${chunk}-${chunkIndex}`} className="text-[12px] font-semibold italic leading-tight text-white">
                      {chunk}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="absolute inset-x-[6%] bottom-[2.2%] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold tracking-wide text-white">
            {(footerPreviewLines.length > 0 ? footerPreviewLines : ['www.yoursite.com | info@yoursite.com']).map((line, index) => (
              <span key={`${line}-${index}`}>{line}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if ((themeId as string) === 'industrial-campaign') {
    const industrialFeatures = (
      safeFeatureLines.length > 0
        ? safeFeatureLines
        : ['Performance-led proof point', 'Operational benefit', 'Control and protection detail']
    ).slice(0, 3);
    const industrialFooterLine = [safeFooterWebsite, safeFooterEmail].filter(Boolean).join(' | ') || brandName || 'Brand site';
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 70%, ${previewPalette.accent}22 100%)` }} />
        <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(ellipse at 20% 52%, ${previewPalette.accent}20, transparent 52%), radial-gradient(circle at 82% 18%, rgba(255,255,255,0.10), transparent 18%)` }} />
        <div className="absolute inset-x-0 top-0 h-[12%] border-b border-white/10" style={{ backgroundImage: `linear-gradient(90deg, ${previewPalette.bgStart}dd 0%, ${previewPalette.bgEnd}bb 100%)` }} />
        <div className="absolute inset-x-0 bottom-0 h-[8.5%]" style={{ backgroundImage: `linear-gradient(90deg, ${previewPalette.bgStart}ee 0%, ${previewPalette.bgEnd}dd 100%)` }} />

        <div className="absolute left-[3%] top-[2.8%] flex h-[9%] w-[18%] items-center justify-center rounded-xl bg-white/95 p-2 shadow-lg">
          {uploadedLogo ? (
            <img src={uploadedLogo} alt="Brand logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] font-bold text-slate-700">{brandName || 'Brand'}</span>
          )}
        </div>

        <div className="absolute bottom-[12%] left-[3.2%] top-[18%] w-[32%] rounded-[22px] border border-white/18 bg-white/94 shadow-[0_20px_42px_rgba(0,0,0,0.24)] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent pointer-events-none" />
          {renderHeroZone('absolute inset-0 rounded-[22px]', {
            fit: 'contain',
            imagePaddingClass: 'p-2',
          })}
        </div>

        <div className="absolute bottom-[11.8%] right-[3.2%] top-[18%] flex w-[59.5%] flex-col gap-2.5 rounded-[24px] border border-white/10 px-[4.6%] py-[4.8%] shadow-[0_20px_45px_rgba(0,0,0,0.18)]" style={{ backgroundImage: 'linear-gradient(180deg, rgba(3,10,22,0.56), rgba(3,10,22,0.72))' }}>
          <div className="space-y-1.5">
            {compactHeadlineLines.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className="font-black text-white"
                style={{
                  fontSize: compactHeadlineLines.length > 3 ? '15px' : '18px',
                  lineHeight: compactHeadlineLines.length > 3 ? 1.13 : 1.08,
                  textShadow: '0 2px 10px rgba(0,0,0,0.34)',
                }}
              >
                {line}
              </p>
            ))}
          </div>
          {shortTaglineLines.length > 0 && (
            <div className="space-y-0.5 pt-0.5">
              {shortTaglineLines.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="text-[9px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: previewPalette.accent }}
                >
                  {line}
                </p>
              ))}
            </div>
          )}
          <div className="h-1 w-[18%] rounded-full" style={{ backgroundColor: previewPalette.accent }} />
          <div className="mt-auto space-y-2.5">
            {industrialFeatures.map((line, index) => (
              <div key={`${line}-${index}`} className="flex items-start gap-3 rounded-[18px] border border-white/8 bg-slate-950/26 px-3 py-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: previewPalette.accent }}>
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  {fitPreviewText(line, [24, 26, 28], 2).map((chunk, chunkIndex) => (
                    <p key={`${chunk}-${chunkIndex}`} className="text-[9px] font-semibold leading-[1.32] text-white/95">
                      {chunk}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex h-[8.5%] items-center justify-center border-t border-white/10 px-[5%] text-[8px] font-semibold text-white/80">
          <span className="max-w-[86%] truncate text-center">
            {industrialFooterLine}
          </span>
        </div>
      </div>
    );
  }

  // ── Alliance Poster ──────────────────────────────────────────────────────────
  if ((themeId as string) === 'alliance-poster') {
    return (
      <div className={`${previewAspectClass} overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div
          className="relative h-full w-full text-white"
          style={{
            backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 20% 48%, ${previewPalette.muted}35, transparent 24%), radial-gradient(circle at 72% 18%, rgba(255,255,255,0.10), transparent 16%)`,
            }}
          />
          <div className="absolute inset-x-0 top-0 h-[17.5%] border-b border-white/20 bg-black/12" />
          <div className="absolute inset-x-0 bottom-0 h-[8.5%] border-t border-white/20" style={{ backgroundColor: previewPalette.footer }} />
          <div className="absolute left-[3%] top-[3.2%] flex h-[9%] w-[19%] items-center justify-center rounded-xl bg-white/95 p-2 shadow-lg">
            {uploadedLogo ? (
              <img src={uploadedLogo} alt="Primary logo preview" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[11px] font-bold text-slate-700">{brandName || 'Your brand'}</span>
            )}
          </div>
          <div
            className="absolute right-[2.5%] top-[3.2%] flex h-[9%] w-[22%] items-center justify-center gap-2 rounded-xl px-2 backdrop-blur-sm"
            style={{ backgroundColor: `${previewPalette.headerPanel}bb` }}
          >
            {allianceHeaderLogos.length > 0 ? (
              allianceHeaderLogos.map((logo) => (
                <div key={logo.id} className="flex h-[72%] flex-1 items-center justify-center rounded-lg bg-white/92 p-1">
                  <img src={logo.url} alt={logo.name} className="h-full w-full object-contain" />
                </div>
              ))
            ) : (
              <div className="text-center">
                <p className="text-[11px] font-semibold">{partnerName || 'Partner logo'}</p>
                <p className="text-[9px] text-white/70">{partnerTagline || 'Alliance header zone'}</p>
              </div>
            )}
          </div>
          <div className="absolute left-[24%] right-[25%] top-[4.2%] text-center">
            <div className="space-y-1">
              {headlineLines.map((line, index) => (
                <p key={`${line}-${index}`} className="text-[19px] font-semibold italic leading-tight text-white drop-shadow-sm">
                  {line}
                </p>
              ))}
            </div>
            {allianceTaglineLines.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {allianceTaglineLines.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className="text-[25px] font-black italic leading-none drop-shadow-sm"
                    style={{ color: previewPalette.accent }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="absolute bottom-[11%] left-[5.5%] top-[28%] w-[25%]">
            <div className="absolute bottom-[4%] left-[1%] right-[8%] h-[10%] rounded-[18px] bg-white/[16%] blur-sm" />
            <div className="absolute bottom-[1%] left-[3%] right-[9%] h-[10%] rounded-[18px] border border-white/20 bg-white/10" />
            <div className="absolute inset-0 rounded-[24px] border border-white/10 bg-white/5">
              {renderHeroZone('absolute inset-0 rounded-[24px]')}
            </div>
          </div>
          <div className="absolute right-[4%] top-[28%] w-[41%] space-y-2.5">
            {(safeFeatureLines.length > 0 ? safeFeatureLines : ['Product proof points appear here']).slice(0, 6).map((line, index) => (
              <div key={`${line}-${index}`} className="flex items-center gap-3 rounded-r-full bg-slate-950/[28%] px-4 py-2.5">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-lg font-black text-white shadow"
                  style={{ backgroundColor: previewPalette.support }}
                >
                  ✓
                </div>
                <p className="text-[13px] font-semibold italic leading-tight text-white">{line}</p>
              </div>
            ))}
          </div>
          <div className="absolute inset-x-[6%] bottom-[3%] flex items-center justify-center gap-4 text-[13px] font-semibold tracking-wide text-white">
            <span>{footerWebsite || 'www.yoursite.com'}</span>
            <span className="text-white/70">|</span>
            <span>{footerEmail || 'info@yoursite.com'}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Clean Brand ──────────────────────────────────────────────────────────────
  if (themeId === 'clean-brand') {
    const cleanTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 3);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden bg-white`}>
        <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-slate-100" />
        <div className="absolute inset-x-0 top-0 flex h-[14%] items-center justify-between border-b border-slate-100 px-[5%]">
          {renderLogoBox('h-[65%] w-[13%] rounded-lg border border-slate-200 bg-white shadow-sm')}
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Clean Brand</p>
        </div>
        <div className="absolute bottom-[12%] left-[6%] top-[18%] flex w-[54%] flex-col justify-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-1 w-8 rounded-full" style={{ backgroundColor: previewPalette.bgStart }} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: previewPalette.muted }}>
              {brandName || 'Brand'}
            </p>
          </div>
          <div className="space-y-2">
            {standardHeadlineLines.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className="font-black"
                style={{
                  color: previewPalette.bgStart,
                  fontSize: standardHeadlineLines.length > 2 ? '18px' : '21px',
                  lineHeight: standardHeadlineLines.length > 2 ? 1.16 : 1.1,
                }}
              >
                {line}
              </p>
            ))}
          </div>
          <div className="space-y-1.5">
            {(cleanTaglineLines.length > 0 ? cleanTaglineLines : ['Minimal structure. Clear headline. Premium whitespace.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug" style={{ color: previewPalette.muted }}>
                {line}
              </p>
            ))}
          </div>
          <div className="flex h-8 w-28 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Brand Focus
          </div>
        </div>
        <div className="absolute bottom-[12%] right-[4%] top-[16%] w-[36%] rounded-2xl border border-slate-200 bg-slate-100">
          {renderHeroZone('absolute inset-0 rounded-2xl')}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[10%] items-center border-t border-slate-100 px-[6%]">
          <p className="text-[10px] font-semibold text-slate-400">
            {footerPreviewLines[0] || safeFooterWebsite || brandName || 'Brand site'}
          </p>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Brand Story ──────────────────────────────────────────────────────────────
  if (themeId === 'brand-story') {
    const storyHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22], 3);
    const storyTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 4);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.surface} 0%, white 50%, ${previewPalette.muted}33 100%)` }} />
        <div className="absolute bottom-[8%] left-[4%] top-[8%] w-[40%] flex items-center justify-center">
          <div className="h-[80%] w-[76%] rounded-[40%] shadow-xl overflow-hidden" style={{ backgroundColor: `${previewPalette.bgStart}cc` }}>
            {showHero && <img src={heroSrc!} alt="Story" className="h-full w-full object-cover" />}
          </div>
        </div>
        <div className="absolute bottom-[10%] right-[4%] top-[10%] flex w-[52%] flex-col justify-center gap-3">
          {renderLogoBox('h-8 w-8 rounded-lg border border-slate-200 bg-white shadow-sm')}
          <div className="space-y-2">
            {storyHeadlineLines.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className="font-black"
                style={{
                  color: previewPalette.bgStart,
                  fontSize: storyHeadlineLines.length > 2 ? '17px' : '20px',
                  lineHeight: 1.12,
                }}
              >
                {line}
              </p>
            ))}
          </div>
          <div className="space-y-1.5">
            {(storyTaglineLines.length > 0 ? storyTaglineLines : ['Use this layout for thoughtful storytelling and a more editorial tone.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug" style={{ color: `${previewPalette.muted}dd` }}>
                {line}
              </p>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-28 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
              Story Highlight
            </div>
            <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: previewPalette.muted }} />
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Product Hero ─────────────────────────────────────────────────────────────
  if (themeId === 'product-hero') {
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.surface }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(180deg, ${previewPalette.surface} 0%, white 48%, ${previewPalette.muted}44 100%)` }} />
        {renderLogoBox('absolute left-[4%] top-[4%] h-[10%] w-[13%] rounded-xl border border-slate-200 bg-white shadow-sm')}
        <div className="absolute left-[6%] top-[19%] h-1 w-[42%] rounded-full" style={{ backgroundColor: previewPalette.accent }} />
        <div className="absolute bottom-[16%] left-[6%] top-[24%] flex w-[44%] flex-col justify-center gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: previewPalette.muted }}>
            Product Hero
          </p>
          {productHeadlineLines.map((line, index) => (
            <p
              key={`${line}-${index}`}
              className="font-black leading-tight"
              style={{
                color: previewPalette.text,
                fontSize: productHeadlineLines.length > 2 ? '17px' : '19px',
              }}
            >
              {line}
            </p>
          ))}
          {productTaglineLines.map((line, index) => (
            <p key={`${line}-${index}`} className="text-[11px] leading-snug" style={{ color: previewPalette.muted }}>
              {line}
            </p>
          ))}
          <div className="mt-2 flex h-8 w-32 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Product Spotlight
          </div>
        </div>
        <div className="absolute bottom-[12%] right-[5%] top-[14%] w-[34%] rounded-[26px] border border-slate-200 bg-white/92 shadow-lg">
          {renderHeroZone('absolute inset-[5%] rounded-[20px]', { fit: 'contain', imagePaddingClass: 'p-2' })}
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Knowledge Visual ─────────────────────────────────────────────────────────
  if (themeId === 'knowledge-visual') {
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)` }} />
        <div className="absolute inset-[4%] grid grid-cols-[1.1fr_0.9fr] gap-[3%]">
          <div className="rounded-xl border border-white/20 overflow-hidden bg-white/88">
            {renderHeroZone('h-full w-full rounded-xl', { fit: 'contain', imagePaddingClass: 'p-2' })}
          </div>
          <div className="flex flex-col justify-center gap-2.5 rounded-xl p-4" style={{ border: `1px solid ${previewPalette.accent}88`, backgroundColor: `${previewPalette.accent}40` }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: previewPalette.muted }}>{brandName || 'Brand'}</p>
            {knowledgeHeadlineLines.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className="font-black leading-tight"
                style={{
                  color: previewPalette.text,
                  fontSize: knowledgeHeadlineLines.length > 2 ? '15px' : '16px',
                }}
              >
                {line}
              </p>
            ))}
            {knowledgeTaglineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug" style={{ color: previewPalette.muted }}>
                {line}
              </p>
            ))}
            <div className="mt-2 space-y-2">
              {(safeFeatureLines.length > 0 ? safeFeatureLines : ['Key proof point', 'Operational benefit', 'Control detail']).slice(0, 3).map((line, index) => (
                <div key={`${line}-${index}`} className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white" style={{ backgroundColor: previewPalette.support }}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    {fitPreviewText(line, [18, 20, 22], 2).map((chunk, chunkIndex) => (
                      <p key={`${chunk}-${chunkIndex}`} className="text-[10px] font-semibold leading-snug" style={{ color: previewPalette.text }}>
                        {chunk}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex h-7 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.support }}>
              Knowledge Brief
            </div>
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Datasheet Frame ──────────────────────────────────────────────────────────
  if (themeId === 'datasheet-frame') {
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.surface }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.surface} 0%, white 50%, ${previewPalette.muted}33 100%)` }} />
        <div className="absolute inset-[4%] grid grid-cols-[0.9fr_1.1fr] gap-[3%]">
          <div className="rounded-xl shadow-lg overflow-hidden" style={{ backgroundColor: previewPalette.bgStart }}>
            {renderHeroZone('h-full w-full rounded-xl', { fit: 'contain', imagePaddingClass: 'p-2' })}
          </div>
          <div className="flex flex-col gap-[4%]">
            <div className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2">
                {renderLogoBox('h-6 w-10 rounded border border-slate-200')}
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">Datasheet Frame</p>
              </div>
              {datasheetHeadlineLines.map((line, index) => (
                <p key={`${line}-${index}`} className="text-[13px] font-black leading-tight text-slate-900">
                  {line}
                </p>
              ))}
              {datasheetTaglineLines.map((line, index) => (
                <p key={`${line}-${index}`} className="mt-1.5 text-[10px] leading-snug text-slate-500">
                  {line}
                </p>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-[5%]">
              {(safeFeatureLines.length > 0 ? safeFeatureLines : ['Key specification', 'Product benefit', 'Protection detail', 'Application fit']).slice(0, 4).map((line, i) => (
                <div key={`${line}-${i}`} className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black text-white" style={{ backgroundColor: previewPalette.support }}>
                    {i + 1}
                  </div>
                  {fitPreviewText(line, [16, 18, 20], 3).map((chunk, index) => (
                    <p key={`${chunk}-${index}`} className="mt-2 text-[10px] font-semibold leading-snug text-slate-800">
                      {chunk}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Proof Stack ──────────────────────────────────────────────────────────────
  if (themeId === 'proof-stack') {
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.surface} 0%, white 50%, ${previewPalette.muted}22 100%)` }} />
        <div className="absolute inset-[4%] grid grid-cols-[1fr_0.95fr] gap-[3%]">
          <div className="flex flex-col gap-[4%]">
            {(safeFeatureLines.length > 0 ? safeFeatureLines : ['Proof point one', 'Proof point two', 'Proof point three']).slice(0, 3).map((line, i) => (
              <div key={`${line}-${i}`} className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 p-3" style={{ backgroundColor: `${previewPalette.accent}${Math.round((0.15 + i * 0.1) * 255).toString(16).padStart(2, '0')}` }}>
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white" style={{ backgroundColor: i === 1 ? previewPalette.support : previewPalette.accent }}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  {fitPreviewText(line, [20, 22, 24], 3).map((chunk, index) => (
                    <p key={`${chunk}-${index}`} className="text-[10px] font-semibold leading-snug text-slate-900">
                      {chunk}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col justify-center gap-3 rounded-xl border border-slate-200 p-4" style={{ backgroundColor: previewPalette.bgStart }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: previewPalette.muted }}>{brandName || 'Brand'}</p>
            {proofHeadlineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-[16px] font-black leading-tight text-white">
                {line}
              </p>
            ))}
            <div className="space-y-1.5">
              {proofTaglineLines.map((line, index) => (
                <p key={`${line}-${index}`} className="text-[11px] leading-snug text-white/70">
                  {line}
                </p>
              ))}
            </div>
            <div className="flex h-7 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.support }}>
              Proof Snapshot
            </div>
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Launch Banner ────────────────────────────────────────────────────────────
  if (themeId === 'launch-banner') {
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 50%, ${previewPalette.accent}66 100%)` }} />
        <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(ellipse at 30% 40%, ${previewPalette.muted}22, transparent 60%)` }} />
        <div className="absolute inset-x-[4%] top-[5%] flex items-center justify-between">
          <div className="flex h-8 w-20 items-center justify-center overflow-hidden rounded-full bg-white/90 px-2">
            {uploadedLogo ? (
              <img src={uploadedLogo} alt="Logo" className="h-full w-full object-contain p-0.5" />
            ) : (
              <span className="text-[8px] font-bold text-slate-700">{brandName || 'Brand'}</span>
            )}
          </div>
          <div className="flex h-6 w-24 items-center justify-center rounded-full px-2 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ backgroundColor: previewPalette.accent, color: previewPalette.text }}>
            Launch Mode
          </div>
        </div>
        <div className="absolute inset-x-[8%] top-[22%] space-y-2">
          {launchHeadlineLines.map((line, index) => (
            <p
              key={`${line}-${index}`}
              className="font-black leading-tight text-white"
              style={{ fontSize: launchHeadlineLines.length > 2 ? '20px' : '24px' }}
            >
              {line}
            </p>
          ))}
          {launchTaglineLines.map((line, index) => (
            <p key={`${line}-${index}`} className="mt-2 text-[12px] font-medium text-white/72">
              {line}
            </p>
          ))}
        </div>
        <div className="absolute bottom-[8%] inset-x-[8%] flex items-center justify-between">
          <div className="rounded-full px-4 py-2 text-[11px] font-semibold" style={{ backgroundColor: `${previewPalette.surface}44`, color: previewPalette.text }}>
            {brandName || 'Brand'}
          </div>
          <div className="flex h-8 w-28 items-center justify-center rounded-xl bg-white/90 text-[10px] font-bold text-slate-800">
            Launch Update
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Sector Collage ───────────────────────────────────────────────────────────
  if (themeId === 'sector-collage') {
    const sectorLabels = (
      safeFeatureLines.length > 0
        ? safeFeatureLines
        : ['Power factor improvement', 'Power quality support', 'Controller integration']
    ).slice(0, 3);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 50%, ${previewPalette.accent}44 100%)` }} />
        <div className="absolute inset-x-0 top-0 flex h-[16%] items-center justify-between border-b border-white/10 px-[4%]" style={{ backgroundColor: `${previewPalette.headerPanel}cc` }}>
          {renderLogoBox('h-[65%] w-[13%] rounded bg-white/90 p-1', true)}
          <div className="space-y-1.5 text-right">
            {fitPreviewText(safeHeadline, [20, 22, 24], 2).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[13px] font-black leading-tight text-white">
                {line}
              </p>
            ))}
            {shortTaglineLines[0] && <p className="text-[10px] font-medium text-white/70">{shortTaglineLines[0]}</p>}
          </div>
        </div>
        <div className="absolute inset-x-[3%] flex gap-[2%]" style={{ top: '19%', bottom: '26%' }}>
          {(['panel-1', 'panel-2', 'panel-3'] as const).map((slotId, i) => {
            const src = getSlotSrc(slotId);
            return (
              <div key={i} className="flex-1 rounded-xl overflow-hidden" style={{ backgroundColor: `${previewPalette.surface}22` }}>
                {src ? (
                  <img src={src} alt={`Sector ${i + 1}`} className="h-full w-full object-cover rounded-xl" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/25">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-[3%] grid grid-cols-3 gap-3" style={{ bottom: '8%', minHeight: '14%' }}>
          {sectorLabels.map((label, i) => (
            <div key={`${label}-${i}`} className="rounded-xl border border-white/10 bg-black/18 px-3 py-2 text-center">
              <div className="mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ backgroundColor: previewPalette.support }}>
                {i + 1}
              </div>
              {fitPreviewText(label, [16, 18, 20], 2).map((line, index) => (
                <p key={`${line}-${index}`} className="mt-1 text-[9px] font-semibold leading-snug text-white/88">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Offer Card ───────────────────────────────────────────────────────────────
  if (themeId === 'offer-card') {
    const offerTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 2);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 50%, ${previewPalette.accent}88 100%)` }} />
        <div className="absolute inset-[4%] grid grid-cols-[1.4fr_1fr] gap-[3%]">
          <div className="flex flex-col justify-center gap-3 rounded-xl p-4" style={{ backgroundColor: `${previewPalette.surface}18` }}>
            <div className="flex h-5 w-24 items-center justify-center rounded-full text-[9px] font-bold uppercase tracking-[0.16em]" style={{ backgroundColor: `${previewPalette.accent}e6`, color: previewPalette.text }}>
              Special Offer
            </div>
            <div className="space-y-1.5">
              {standardHeadlineLines.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="font-black text-white"
                  style={{ fontSize: standardHeadlineLines.length > 2 ? '18px' : '21px', lineHeight: 1.12 }}
                >
                  {line}
                </p>
              ))}
            </div>
            {offerTaglineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] font-medium leading-snug" style={{ color: `${previewPalette.accent}` }}>
                {line}
              </p>
            ))}
            <div className="flex h-8 w-32 items-center justify-center rounded-xl bg-white/90 text-[10px] font-bold text-slate-800">
              Offer Spotlight
            </div>
          </div>
          <div className="rounded-xl overflow-hidden bg-white/92">
            {renderHeroZone('h-full w-full rounded-xl', { fit: 'contain', imagePaddingClass: 'p-2' })}
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Comparison Board ─────────────────────────────────────────────────────────
  if (themeId === 'comparison-board') {
    const comparisonBullets = (
      safeFeatureLines.length > 0
        ? safeFeatureLines
        : ['Improve power factor', 'Reduce wasted energy', 'Support automatic networking', 'Built-in protection features']
    ).slice(0, 4);
    const leftBullets = comparisonBullets.slice(0, 2);
    const rightBullets = comparisonBullets.slice(2, 4);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden bg-white`}>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100" />
        <div className="absolute inset-x-[4%] top-[4%] flex items-center gap-3">
          {renderLogoBox('h-8 w-8 rounded-lg border border-slate-200 bg-white shadow-sm')}
          <div className="space-y-1">
            {fitPreviewText(safeHeadline, [22, 24, 26], 2).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[12px] font-black leading-tight text-slate-900">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="absolute inset-x-[4%] top-[18%] grid grid-cols-2 gap-[3%]" style={{ bottom: '8%' }}>
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-bold text-slate-900">Operational Value</p>
            <div className="flex-1 rounded-xl bg-slate-100 overflow-hidden">
              {getSlotSrc('panel-left') ? (
                <img src={getSlotSrc('panel-left')!} alt="Option A" className="h-full w-full object-cover rounded-xl" />
              ) : null}
            </div>
            <div className="space-y-1.5">
              {leftBullets.map((line, index) => (
                <div key={`${line}-${index}`} className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black text-white">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    {fitPreviewText(line, [18, 20, 22], 2).map((chunk, chunkIndex) => (
                      <p key={`${chunk}-${chunkIndex}`} className="text-[9px] font-semibold leading-snug text-slate-700">
                        {chunk}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl p-3 shadow-sm" style={{ border: `1px solid ${previewPalette.accent}77`, backgroundColor: `${previewPalette.accent}15` }}>
            <p className="text-[11px] font-bold text-slate-900">Protection &amp; Control</p>
            <div className="flex-1 rounded-xl overflow-hidden" style={{ backgroundColor: `${previewPalette.accent}44` }}>
              {getSlotSrc('panel-right') ? (
                <img src={getSlotSrc('panel-right')!} alt="Option B" className="h-full w-full object-cover rounded-xl" />
              ) : null}
            </div>
            <div className="space-y-1.5">
              {rightBullets.map((line, index) => (
                <div key={`${line}-${index}`} className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white" style={{ backgroundColor: previewPalette.accent }}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    {fitPreviewText(line, [18, 20, 22], 2).map((chunk, chunkIndex) => (
                      <p key={`${chunk}-${chunkIndex}`} className="text-[9px] font-semibold leading-snug text-slate-700">
                        {chunk}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Premium Editorial ────────────────────────────────────────────────────────
  if (themeId === 'premium-editorial') {
    const editorialHeadlineLines = fitPreviewText(safeHeadline, [20, 22, 24], 3);
    const editorialTaglineLines = fitPreviewText(safeTagline, [26, 30, 34], 4);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 60%, ${previewPalette.accent}44 100%)` }} />
        <div className="absolute inset-[3%] grid grid-cols-[0.45fr_1fr] gap-[3%]">
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: `${previewPalette.surface}22` }}>
            {showHero ? (
              <img src={heroSrc!} alt="Editorial" className="h-full w-full rounded-2xl object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-white/20">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center gap-3 py-2">
            <div className="flex items-center gap-2">
              <div className="h-0.5 w-12 rounded" style={{ backgroundColor: previewPalette.accent }} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Editorial</p>
            </div>
            <div className="space-y-2">
              {editorialHeadlineLines.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="font-black text-white"
                  style={{ fontFamily: 'Georgia, serif', fontSize: editorialHeadlineLines.length > 2 ? '18px' : '20px', lineHeight: 1.14 }}
                >
                  {line}
                </p>
              ))}
            </div>
            <div className="h-0.5 w-12 rounded" style={{ backgroundColor: previewPalette.accent }} />
            <div className="space-y-1.5">
              {(editorialTaglineLines.length > 0 ? editorialTaglineLines : ['Elegant, premium storytelling with a calm editorial rhythm.']).map((line, index) => (
                <p key={`${line}-${index}`} className="text-[11px] leading-snug text-white/72">
                  {line}
                </p>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-between">
              <p className="text-[10px] font-semibold text-white/45">{brandName || 'Brand editorial'}</p>
              <div className="flex h-7 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
                Editorial Feature
              </div>
            </div>
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Job Posting ──────────────────────────────────────────────────────────────
  if (themeId === 'job-posting') {
    const jpHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22, 24], 2);
    const jpTaglineLines = fitPreviewText(safeTagline, [26, 30, 34], 3);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)` }} />
        <div className="absolute inset-x-0 top-0 flex h-[12%] items-center justify-center" style={{ backgroundColor: previewPalette.accent }}>
          <p className="text-[12px] font-black tracking-[0.2em] text-white">WE'RE HIRING</p>
        </div>
        <div className="absolute left-[5%] top-[3%] z-10">
          {renderLogoBox('h-[8%] w-[10%] rounded-lg', true)}
        </div>
        <div className="absolute bottom-[8%] left-[4%] top-[16%] flex w-[50%] flex-col justify-start gap-2 rounded-2xl px-[3%] py-[3%]" style={{ backgroundColor: `${previewPalette.surface}55` }}>
          <div className="space-y-1.5 mt-2">
            {jpHeadlineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="font-black text-white" style={{ fontSize: jpHeadlineLines.length > 1 ? '18px' : '22px', lineHeight: 1.12 }}>
                {line}
              </p>
            ))}
          </div>
          <div className="space-y-1">
            {(jpTaglineLines.length > 0 ? jpTaglineLines : ['Join our team and make an impact.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug text-white/65">{line}</p>
            ))}
          </div>
          {featureLines.length > 0 && (
            <div className="space-y-1.5 mt-1">
              {featureLines.slice(0, 4).map((bullet, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: previewPalette.accent }} />
                  <p className="text-[10px] text-white/80 leading-tight">{bullet}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex h-7 w-24 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Apply Now
          </div>
        </div>
        <div className="absolute bottom-[8%] right-[4%] top-[18%] w-[38%] overflow-hidden rounded-2xl bg-white/88">
          {renderHeroZone('h-full w-full rounded-2xl', { fit: 'cover', fallbackLabel: 'Office / Team photo' })}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[6%] items-center justify-center" style={{ backgroundColor: `${previewPalette.bgStart}aa` }}>
          <p className="text-[9px] text-white/60">{footerPreviewLines[0] || safeFooterWebsite || brandName || 'careers.company.com'}</p>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Hiring Banner ─────────────────────────────────────────────────────────────
  if (themeId === 'hiring-banner') {
    const hbHeadlineLines = fitPreviewText(safeHeadline, [16, 18, 20, 22], 2);
    const hbTaglineLines = fitPreviewText(safeTagline, [26, 30, 34], 2);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.accent} 40%, ${previewPalette.support} 100%)` }} />
        <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(ellipse at 50% 40%, ${previewPalette.accent}40, transparent 60%)` }} />
        <div className="absolute inset-[3%] rounded-3xl border-2 border-white/10" />
        <div className="absolute left-[4%] top-[4%]">
          {renderLogoBox('h-[7%] w-[11%] rounded-lg', true)}
        </div>
        <div className="absolute inset-x-0 top-[17%] flex justify-center">
          <div className="rounded-full px-6 py-1.5" style={{ backgroundColor: `${previewPalette.surface}ee` }}>
            <p className="text-[11px] font-black tracking-[0.25em]" style={{ color: previewPalette.accent }}>WE'RE HIRING</p>
          </div>
        </div>
        <div className="absolute inset-x-[10%] top-[32%] flex flex-col items-center gap-2">
          <div className="text-center space-y-1.5">
            {hbHeadlineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="font-black text-white text-center" style={{ fontSize: hbHeadlineLines.length > 1 ? '22px' : '28px', lineHeight: 1.1 }}>
                {line}
              </p>
            ))}
          </div>
          <div className="text-center space-y-1">
            {(hbTaglineLines.length > 0 ? hbTaglineLines : ['Be part of something extraordinary.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug text-white/65 text-center">{line}</p>
            ))}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-[14%] flex justify-center">
          <div className="flex h-8 w-32 items-center justify-center rounded-xl text-[11px] font-bold" style={{ backgroundColor: `${previewPalette.surface}ee`, color: previewPalette.bgStart }}>
            View Openings
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[7%] items-center justify-center" style={{ backgroundColor: `${previewPalette.bgStart}80` }}>
          <p className="text-[9px] text-white/55">{footerPreviewLines[0] || safeFooterWebsite || brandName || 'careers.company.com'}</p>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Team Spotlight ────────────────────────────────────────────────────────────
  if (themeId === 'team-spotlight') {
    const tsHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22], 2);
    const tsTaglineLines = fitPreviewText(safeTagline, [22, 26, 30], 3);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(160deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)` }} />
        <div className="absolute left-[4%] top-[14%] flex h-[72%] w-[40%] items-center justify-center">
          <div className="relative h-[75%] aspect-square rounded-full overflow-hidden ring-4 ring-white/20" style={{ boxShadow: `0 0 0 4px ${previewPalette.accent}55` }}>
            {showHero ? (
              <img src={heroSrc!} alt="Team" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full" style={{ backgroundColor: `${previewPalette.surface}33` }}>
                <div className="flex flex-col items-center gap-1 text-white/25">
                  <ImageIcon className="h-7 w-7" />
                  <span className="text-[8px]">Team photo</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="absolute right-[4%] top-[4%] bottom-[8%] w-[48%] rounded-2xl px-[3%] py-[3%]" style={{ backgroundColor: `${previewPalette.surface}28` }}>
          <div className="mb-1">
            {renderLogoBox('h-[10%] w-[20%] rounded-lg', true)}
          </div>
          <p className="text-[9px] font-bold tracking-[0.15em] mb-2" style={{ color: previewPalette.accent }}>JOIN OUR TEAM</p>
          <div className="space-y-1.5">
            {tsHeadlineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="font-black text-white" style={{ fontSize: tsHeadlineLines.length > 1 ? '16px' : '19px', lineHeight: 1.14 }}>
                {line}
              </p>
            ))}
          </div>
          <div className="space-y-1 mt-2">
            {(tsTaglineLines.length > 0 ? tsTaglineLines : ['Great people build great products.', 'Come join us.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[10px] leading-snug text-white/60">{line}</p>
            ))}
          </div>
          {featureLines.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {featureLines.slice(0, 3).map((bullet, i) => (
                <div key={i} className="rounded-lg px-2 py-1.5" style={{ backgroundColor: `${previewPalette.surface}28` }}>
                  <p className="text-[9px] text-white/75 font-medium">{bullet}</p>
                </div>
              ))}
            </div>
          )}
          <div className="absolute bottom-[8%] left-[3%]">
            <div className="flex h-6 w-20 items-center justify-center rounded-lg text-[9px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
              Join Us
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[6%] items-center justify-center" style={{ backgroundColor: `${previewPalette.bgStart}88` }}>
          <p className="text-[9px] text-white/55">{footerPreviewLines[0] || safeFooterWebsite || brandName || 'Company'}</p>
        </div>
        {generateCta}
      </div>
    );
  }

  // ── Career Growth ─────────────────────────────────────────────────────────────
  if (themeId === 'career-growth') {
    const cgHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22, 24], 2);
    const cgTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 2);
    const benefitDefaults = ['Competitive salary & equity', 'Remote-first flexibility', 'Learning & development', 'Health & wellness'];
    const benefitItems = featureLines.length > 0 ? featureLines.slice(0, 4) : benefitDefaults;
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 60%, ${previewPalette.accent}40 100%)` }} />
        <div className="absolute left-[5%] top-[4%]">
          {renderLogoBox('h-[6%] w-[10%] rounded-lg', true)}
        </div>
        <p className="absolute left-[5%] top-[13%] text-[9px] font-bold tracking-[0.15em]" style={{ color: previewPalette.accent }}>CAREER OPPORTUNITY</p>
        <div className="absolute left-[5%] top-[18%] w-[48%] space-y-1.5">
          {cgHeadlineLines.map((line, index) => (
            <p key={`${line}-${index}`} className="font-black text-white" style={{ fontSize: cgHeadlineLines.length > 1 ? '18px' : '22px', lineHeight: 1.12 }}>
              {line}
            </p>
          ))}
        </div>
        <div className="absolute left-[5%] top-[34%] w-[48%] space-y-1">
          {(cgTaglineLines.length > 0 ? cgTaglineLines : ['Build your career with us.']).map((line, index) => (
            <p key={`${line}-${index}`} className="text-[10px] leading-snug text-white/60">{line}</p>
          ))}
        </div>
        <div className="absolute left-[4%] top-[44%] w-[48%] space-y-2">
          {benefitItems.map((benefit, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: `${previewPalette.surface}30` }}>
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
                {i + 1}
              </div>
              <p className="text-[10px] text-white/80 font-medium leading-tight">{benefit}</p>
            </div>
          ))}
        </div>
        <div className="absolute bottom-[14%] right-[4%] top-[14%] w-[40%] overflow-hidden rounded-2xl bg-white/88">
          {renderHeroZone('h-full w-full rounded-2xl', { fit: 'cover', fallbackLabel: 'Workplace photo' })}
        </div>
        <div className="absolute bottom-[4%] left-[5%]">
          <div className="flex h-7 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Explore Roles
          </div>
        </div>
        <p className="absolute bottom-[5%] right-[4%] text-[9px] text-white/45">{footerPreviewLines[0] || safeFooterWebsite || brandName || ''}</p>
        {generateCta}
      </div>
    );
  }

  // ── Default / AI Guided ──────────────────────────────────────────────────────
  return (
    <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
      <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)` }} />
      <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(ellipse at 40% 40%, ${previewPalette.accent}28, transparent 60%)` }} />
      <div className="absolute inset-[4%] grid grid-cols-[1fr_1fr] gap-[3%]">
        <div className="rounded-2xl overflow-hidden" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.accent}99, ${previewPalette.bgEnd}66)` }}>
          {renderHeroZone('h-full w-full rounded-2xl')}
        </div>
        <div className="flex flex-col justify-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4">
          {standardHeadlineLines.map((line, index) => (
            <p key={`${line}-${index}`} className="text-[18px] font-black leading-tight text-white">
              {line}
            </p>
          ))}
          <div className="space-y-1.5">
            {(supportingTaglineLines.length > 0 ? supportingTaglineLines : ['Preview reflects the theme direction, hierarchy, and subject placement before generation.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug text-white/72">
                {line}
              </p>
            ))}
          </div>
          <div className="flex h-7 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Theme Preview
          </div>
        </div>
      </div>
      {generateCta}
    </div>
  );
}

function normalizeAnalysisToken(value: string | null | undefined) {
  return (value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function mapAnalysisToneToImageTone(value: string | null | undefined): string | null {
  switch (normalizeAnalysisToken(value)) {
    case 'professional':
    case 'corporate':
      return 'professional';
    case 'professional-founder':
    case 'casual':
      return 'warm';
    case 'thought-leader':
      return 'tech';
    case 'sales-oriented':
      return 'bold';
    default:
      return null;
  }
}

function mapAnalysisImageStyleToLayout(value: string | null | undefined): string | null {
  switch (normalizeAnalysisToken(value)) {
    case 'clean-minimal':
      return 'text-overlay';
    case 'professional-corporate':
      return 'split-layout';
    case 'bold-colorful':
      return 'abstract-brand';
    case 'tech-modern':
      return 'photo-blend';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageCreator({
  brandId,
  brandName,
  productName,
  brandColors = [],
  brandColorNames,
  logoUrl: defaultLogoUrl,
  logoAssets = [],
  analysisProfile,
  confirmedPostText,
  confirmedPostHeadline,
  confirmedPostImagePrompt,
  onImageConfirmed,
  onImageGenerated,
  onBrandColorsChange,
  pdfImages: propPdfImages,
  selectedPdfs = [],
  onRefreshEvidence,
  onUploadPdfFiles,
  onReextractPdfs,
  onDeleteEvidenceIds,
}: ImageCreatorProps) {
  const derivedWording = useMemo(
    () => deriveWordingFromPost(confirmedPostText),
    [confirmedPostText]
  );
  const normalizedBrandLogos = useMemo(
    () => normalizeLogoAssets(logoAssets),
    [logoAssets]
  );
  const normalizedBrandColors = useMemo(
    () => dedupeBrandColorList(brandColors),
    [brandColors]
  );
  const derivedThemePalette = useMemo(
    () => deriveStudioPalette(normalizedBrandColors),
    [normalizedBrandColors]
  );
  const primaryBrandLogoUrl = defaultLogoUrl || normalizedBrandLogos[0]?.url || null;
  const hasPostContext = Boolean(confirmedPostText?.trim());
  const confirmedPostKey = `${confirmedPostHeadline || ''}::${confirmedPostText || ''}::${confirmedPostImagePrompt || ''}`;
  const syncedHeadlineFromPost = (confirmedPostHeadline?.trim() || derivedWording.headline || '').slice(0, 80);
  const confirmedPostImageBrief = (confirmedPostImagePrompt || '').trim();
  const postDerivedFeatureLines = useMemo(
    () =>
      derivePosterBenefitLines(
        confirmedPostText,
        confirmedPostImageBrief,
        confirmedPostHeadline,
        derivedWording.headline,
        derivedWording.tagline
      ),
    [
      confirmedPostHeadline,
      confirmedPostImageBrief,
      confirmedPostText,
      derivedWording.headline,
      derivedWording.tagline,
    ]
  );

  // Form state
  const [headline, setHeadline] = useState(confirmedPostHeadline || derivedWording.headline || '');
  const [usePostHeadline, setUsePostHeadline] = useState(true);
  const [tagline, setTagline] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>('guided-auto');
  const [contextBrief, setContextBrief] = useState('');
  const [selectedTone, setSelectedTone] = useState('professional');
  const [selectedStyle, setSelectedStyle] = useState('split-layout');
  const [customPrompt, setCustomPrompt] = useState('');
  const [uploadedLogo, setUploadedLogo] = useState<string | null>(primaryBrandLogoUrl);
  const [logoPlacement, setLogoPlacement] = useState<'overlay' | 'infuse' | 'none'>(
    primaryBrandLogoUrl ? 'overlay' : 'none'
  );
  const [allianceLogos, setAllianceLogos] = useState<UploadedLogoAsset[]>([]);
  const [partnerName, setPartnerName] = useState('');
  const [partnerTagline, setPartnerTagline] = useState('');
  const [footerWebsite, setFooterWebsite] = useState('');
  const [footerEmail, setFooterEmail] = useState('');
  const [benefitsText, setBenefitsText] = useState('');
  const [benefitsTouched, setBenefitsTouched] = useState(false);
  const [selectedBlendMode] = useState<BlendModeId>('normal');
  const [imageAspect, setImageAspect] = useState<'landscape' | 'square' | 'portrait'>('landscape');
  const [referenceSelectionTouched, setReferenceSelectionTouched] = useState(false);

  // Theme slot image assignments (maps slot id → image URL)
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string | null>>({});

  // Reference image state (fetched from URL)
  const [siteUrl, setSiteUrl] = useState('');
  const [isFetchingSiteImages, setIsFetchingSiteImages] = useState(false);
  const [fetchedSiteImages, setFetchedSiteImages] = useState<Array<{ url: string; source: string; width: number | null; height: number | null }>>([]);
  const [selectedReferenceImage, setSelectedReferenceImage] = useState<string | null>(null);

  // PDF-extracted brand images (from Evidence Locker)
  const [pdfEvidenceImages, setPdfEvidenceImages] = useState<PdfImageReference[]>([]);
  const [isFetchingPdfImages, setIsFetchingPdfImages] = useState(false);
  const [isUploadingPdfImages, setIsUploadingPdfImages] = useState(false);
  const [isReextractingPdfImages, setIsReextractingPdfImages] = useState(false);
  const [previewedPdfImageId, setPreviewedPdfImageId] = useState<string | null>(null);
  const [pdfLibraryActionState, setPdfLibraryActionState] = useState<{
    kind: 'delete-image' | 'reextract-pdf';
    targetId: string;
  } | null>(null);
  // Tracks PDF image suggestions the user has explicitly dismissed this session
  const [dismissedPdfSuggestions, setDismissedPdfSuggestions] = useState<Set<string>>(() => new Set());

  // Color editing
  const [isEditingColors, setIsEditingColors] = useState(false);
  const [newColorInput, setNewColorInput] = useState('#');
  // All controls are now shown inline (no Advanced Controls toggle)
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState<SavedImagePreset[]>([]);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplyingBlend, setIsApplyingBlend] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [generationCount, setGenerationCount] = useState(0);
  const [generationNonce, setGenerationNonce] = useState(0);
  const [batchSize, setBatchSize] = useState(1);
  const [latestBlendPreview, setLatestBlendPreview] = useState<{
    mode: BlendModeId;
    rawUrl: string;
    blendedUrl: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const allianceLogoInputRef = useRef<HTMLInputElement>(null);
  const partnerLogoInputRef = useRef<HTMLInputElement>(null);
  const referenceImageInputRef = useRef<HTMLInputElement>(null);
  const baselineBrandIdRef = useRef('');
  const baselineBrandColorsRef = useRef<string[]>([]);
  const lastSyncedPostKeyRef = useRef('');
  const appliedAnalysisDefaultsRef = useRef({
    tone: false,
    style: false,
    tagline: false,
  });
  const analyzedToneDefault = useMemo(
    () => mapAnalysisToneToImageTone(analysisProfile?.tone),
    [analysisProfile?.tone]
  );
  const analyzedStyleDefault = useMemo(
    () => mapAnalysisImageStyleToLayout(analysisProfile?.imageStyle),
    [analysisProfile?.imageStyle]
  );
  const analyzedTaglineDefault = useMemo(
    () => (analysisProfile?.tagline || '').trim().slice(0, 120),
    [analysisProfile?.tagline]
  );
  const activeTheme = useMemo(
    () => THEME_OPTIONS.find((theme) => theme.id === selectedThemeId) || THEME_OPTIONS[0],
    [selectedThemeId]
  );
  const fallbackAllianceLogos = useMemo(
    () =>
      normalizedBrandLogos.filter(
        (asset) => asset.url.trim().toLowerCase() !== (primaryBrandLogoUrl || '').trim().toLowerCase()
      ),
    [normalizedBrandLogos, primaryBrandLogoUrl]
  );
  const effectiveAllianceLogos = useMemo(
    () => mergeLogoAssets(allianceLogos, fallbackAllianceLogos).slice(0, 4),
    [allianceLogos, fallbackAllianceLogos]
  );
  const themesByCategory = useMemo(
    () =>
      THEME_CATEGORY_ORDER.map((category) => ({
        category,
        themes: THEME_OPTIONS.filter((theme) => theme.category === category),
      })).filter((section) => section.themes.length > 0),
    []
  );

  useEffect(() => {
    appliedAnalysisDefaultsRef.current = {
      tone: false,
      style: false,
      tagline: false,
    };
    lastSyncedPostKeyRef.current = '';
  }, [brandId]);

  useEffect(() => {
    if (!confirmedPostKey.trim()) return;
    if (lastSyncedPostKeyRef.current === confirmedPostKey) return;

    const nextHeadline = (confirmedPostHeadline?.trim() || derivedWording.headline || '').slice(0, 80);
    const nextTagline = (derivedWording.tagline || '').slice(0, 120);

    setHeadline(nextHeadline);
    setUsePostHeadline(true);
    if (nextTagline) {
      setTagline(nextTagline);
    }

    lastSyncedPostKeyRef.current = confirmedPostKey;
  }, [confirmedPostHeadline, confirmedPostKey, derivedWording.headline, derivedWording.tagline]);

  useEffect(() => {
    if (!headline.trim() && derivedWording.headline) {
      setHeadline(derivedWording.headline);
    }
    if (!tagline.trim() && derivedWording.tagline) {
      setTagline(derivedWording.tagline);
    }
  }, [derivedWording, headline, tagline]);

  useEffect(() => {
    if (appliedAnalysisDefaultsRef.current.tone) return;
    if (selectedTone !== 'professional') {
      appliedAnalysisDefaultsRef.current.tone = true;
      return;
    }
    if (!analyzedToneDefault) return;
    setSelectedTone(analyzedToneDefault);
    appliedAnalysisDefaultsRef.current.tone = true;
  }, [analyzedToneDefault, selectedTone]);

  useEffect(() => {
    if (appliedAnalysisDefaultsRef.current.style) return;
    if (selectedStyle !== 'split-layout') {
      appliedAnalysisDefaultsRef.current.style = true;
      return;
    }
    if (!analyzedStyleDefault) return;
    setSelectedStyle(analyzedStyleDefault);
    appliedAnalysisDefaultsRef.current.style = true;
  }, [analyzedStyleDefault, selectedStyle]);

  useEffect(() => {
    if (appliedAnalysisDefaultsRef.current.tagline) return;
    if (tagline.trim()) {
      appliedAnalysisDefaultsRef.current.tagline = true;
      return;
    }
    if (!analyzedTaglineDefault) return;
    setTagline(analyzedTaglineDefault);
    appliedAnalysisDefaultsRef.current.tagline = true;
  }, [analyzedTaglineDefault, tagline]);

  useEffect(() => {
    if (primaryBrandLogoUrl && !uploadedLogo) {
      setUploadedLogo(primaryBrandLogoUrl);
    }
  }, [primaryBrandLogoUrl, uploadedLogo]);

  useEffect(() => {
    if (footerWebsite.trim()) return;
    const nextWebsite = analysisProfile?.website?.trim() || '';
    if (nextWebsite) {
      setFooterWebsite(nextWebsite);
    }
  }, [analysisProfile?.website, footerWebsite]);

  useEffect(() => {
    if (!primaryBrandLogoUrl && !uploadedLogo && logoPlacement !== 'none') {
      setLogoPlacement('none');
    }
  }, [primaryBrandLogoUrl, uploadedLogo, logoPlacement]);

  useEffect(() => {
    setBenefitsTouched(false);
  }, [confirmedPostKey]);

  useEffect(() => {
    if (benefitsTouched) return;
    const nextBenefits = postDerivedFeatureLines.join('\n');
    if (benefitsText === nextBenefits) return;
    setBenefitsText(nextBenefits);
  }, [benefitsText, benefitsTouched, postDerivedFeatureLines]);

  useEffect(() => {
    if (typeof window === 'undefined' || !brandId) {
      setSavedPresets([]);
      return;
    }

    try {
      const raw = window.localStorage.getItem(getPresetStorageKey(brandId));
      if (!raw) {
        setSavedPresets([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setSavedPresets([]);
        return;
      }
      setSavedPresets(
        parsed.filter((item): item is SavedImagePreset => {
          if (!item || typeof item !== 'object') return false;
          const row = item as Record<string, unknown>;
          return (
            typeof row.id === 'string' &&
            typeof row.name === 'string' &&
            typeof row.themeId === 'string' &&
            typeof row.selectedTone === 'string' &&
            typeof row.selectedStyle === 'string' &&
            typeof row.logoPlacement === 'string' &&
            typeof row.imageAspect === 'string'
          );
        })
      );
    } catch {
      setSavedPresets([]);
    }
  }, [brandId]);

  useEffect(() => {
    if (baselineBrandIdRef.current !== brandId) {
      baselineBrandIdRef.current = brandId;
      baselineBrandColorsRef.current = normalizedBrandColors;
      return;
    }

    if (baselineBrandColorsRef.current.length === 0 && normalizedBrandColors.length > 0) {
      baselineBrandColorsRef.current = normalizedBrandColors;
    }
  }, [brandId, normalizedBrandColors]);

  // Fetch PDF-extracted images from the brand's Evidence Locker.
  // Skipped when the parent passes pre-loaded images via the `pdfImages` prop.
  useEffect(() => {
    if (propPdfImages !== undefined) return;
    if (!brandId) return;
    setIsFetchingPdfImages(true);
    fetch(`/api/studio/evidence/list?brandId=${encodeURIComponent(brandId)}`, {
      method: 'GET',
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : Promise.resolve({ evidence: [] })))
      .then((payload: { evidence?: Array<{
        id: string;
        type: string;
        title: string;
        description?: string | null;
        tags?: string[] | null;
        created_at?: string | null;
        file_path?: string;
        signed_url?: string | null;
      }> }) => {
        const extracted = (payload.evidence ?? []).filter(
          (item) =>
            item.type === 'image' &&
            typeof item.signed_url === 'string' &&
            item.signed_url.length > 0 &&
            (
              (Array.isArray(item.tags) && item.tags.includes('pdf-extracted')) ||
              (typeof item.file_path === 'string' && item.file_path.includes('/pdf-extract/'))
            )
        );
        setPdfEvidenceImages(
          extracted.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description || null,
            tags: Array.isArray(item.tags) ? item.tags : [],
            created_at: item.created_at || null,
            signed_url: item.signed_url as string,
            sourceEvidenceId: getPdfSourceEvidenceId(item.tags),
          }))
        );
      })
      .catch(() => {
        // Non-critical — silently absorb
      })
      .finally(() => setIsFetchingPdfImages(false));
  }, [brandId, propPdfImages]);

  const applyBrandColors = useCallback(
    (colors: string[]) => {
      onBrandColorsChange?.(dedupeBrandColorList(colors));
    },
    [onBrandColorsChange]
  );

  const toggleReferenceSelection = useCallback((imageUrl: string) => {
    setReferenceSelectionTouched(true);
    setSelectedReferenceImage((prev) => (prev === imageUrl ? null : imageUrl));
  }, []);

  const activeThemeSlots = useMemo(() => getThemeSlots(selectedThemeId), [selectedThemeId]);
  const themeUsesHeroReference = useMemo(
    () => selectedThemeId === 'alliance-poster' || activeThemeSlots.some((slot) => slot.id === 'hero'),
    [activeThemeSlots, selectedThemeId]
  );
  const additionalThemeSlots = useMemo(
    () => activeThemeSlots.filter((slot) => slot.id !== 'hero'),
    [activeThemeSlots]
  );
  const nonHeroSlotAssignments = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(slotAssignments).filter(
          ([slotId, url]) => slotId !== 'hero' && typeof url === 'string' && url.length > 0
        )
      ) as Record<string, string>,
    [slotAssignments]
  );
  const effectivePdfImages = useMemo(
    () => sortPdfImageReferences(propPdfImages !== undefined ? propPdfImages : pdfEvidenceImages),
    [pdfEvidenceImages, propPdfImages]
  );
  const resolvedNonHeroSlotAssignments = useMemo(
    () =>
      autoPopulateThemeSlotAssignments({
        themeId: selectedThemeId,
        currentAssignments: nonHeroSlotAssignments,
        selectedReferenceImage,
        pdfImages: effectivePdfImages,
        siteImages: fetchedSiteImages,
      }) as Record<string, string>,
    [effectivePdfImages, fetchedSiteImages, nonHeroSlotAssignments, selectedReferenceImage, selectedThemeId]
  );
  const handleThemeSelect = useCallback(
    (themeId: ThemeId) => {
      const theme = THEME_OPTIONS.find((item) => item.id === themeId) || THEME_OPTIONS[0];
      setSelectedThemeId(theme.id);
      setSelectedTone(theme.recommendedTone);
      setSelectedStyle(theme.recommendedStyle);
      setImageAspect('landscape');
      setSlotAssignments({});
      if (uploadedLogo || primaryBrandLogoUrl) {
        setLogoPlacement(theme.recommendedLogoPlacement);
      }
    },
    [primaryBrandLogoUrl, uploadedLogo]
  );

  const persistPresets = useCallback(
    (nextPresets: SavedImagePreset[]) => {
      setSavedPresets(nextPresets);
      if (typeof window !== 'undefined' && brandId) {
        window.localStorage.setItem(getPresetStorageKey(brandId), JSON.stringify(nextPresets));
      }
    },
    [brandId]
  );

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim();
    if (!brandId) return;
    if (!name) {
      toast.error('Name the preset before saving.');
      return;
    }

    const preset: SavedImagePreset = {
      id: createPresetId(),
      name,
      themeId: selectedThemeId,
      contextBrief: contextBrief.trim(),
      customPrompt: customPrompt.trim(),
      selectedTone,
      selectedStyle,
      logoPlacement,
      imageAspect,
      partnerName: partnerName.trim(),
      partnerTagline: partnerTagline.trim(),
      footerWebsite: footerWebsite.trim(),
      footerEmail: footerEmail.trim(),
      benefitsText: benefitsText.trim(),
      useReferenceAsHero: Boolean(selectedReferenceImage),
    };

    const nextPresets = [preset, ...savedPresets.filter((item) => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 8);
    persistPresets(nextPresets);
    setPresetName('');
    toast.success(`Saved preset "${name}".`);
  }, [
    brandId,
    contextBrief,
    customPrompt,
    benefitsText,
    imageAspect,
    logoPlacement,
    partnerName,
    partnerTagline,
    footerEmail,
    footerWebsite,
    persistPresets,
    presetName,
    savedPresets,
    selectedStyle,
    selectedThemeId,
    selectedTone,
    selectedReferenceImage,
  ]);

  const handleApplyPreset = useCallback((preset: SavedImagePreset) => {
    setSelectedThemeId(preset.themeId);
    setContextBrief(preset.contextBrief || '');
    setCustomPrompt(preset.customPrompt || '');
    setSelectedTone(preset.selectedTone || 'professional');
    setSelectedStyle(preset.selectedStyle || 'split-layout');
    setLogoPlacement(preset.logoPlacement || 'overlay');
    setImageAspect(preset.imageAspect || 'landscape');
    setPartnerName(preset.partnerName || '');
    setPartnerTagline(preset.partnerTagline || '');
    setFooterWebsite(preset.footerWebsite || '');
    setFooterEmail(preset.footerEmail || '');
    setBenefitsText(preset.benefitsText || '');
    setBenefitsTouched(Boolean(preset.benefitsText?.trim()));
    toast.success(`Applied preset "${preset.name}".`);
  }, []);

  const handleRemovePreset = useCallback(
    (presetId: string) => {
      if (!brandId) return;
      const nextPresets = savedPresets.filter((preset) => preset.id !== presetId);
      persistPresets(nextPresets);
    },
    [brandId, persistPresets, savedPresets]
  );


  const insertPdfImageIntoPrompt = useCallback(
    (image: PdfImageReference) => {
      const normalizedTitle = image.title.trim();
      if (!normalizedTitle) return;

      const promptSnippet = `Use PDF reference image "${normalizedTitle}" as the visual reference.`;
      const alreadyReferenced = normalizeReferenceText(customPrompt).includes(
        normalizeReferenceText(normalizedTitle)
      );

      if (!alreadyReferenced) {
        setCustomPrompt((prev) => (prev.trim() ? `${prev.trim()}\n${promptSnippet}` : promptSnippet));
      }

      setReferenceSelectionTouched(true);
      setSelectedReferenceImage(image.signed_url);
      setDismissedPdfSuggestions((prev) => {
        if (!prev.has(image.id)) return prev;
        const next = new Set(prev);
        next.delete(image.id);
        return next;
      });

      toast.success(
        alreadyReferenced
          ? `"${normalizedTitle}" is already in Your Vision and has been selected.`
          : `Added "${normalizedTitle}" to Your Vision and selected it as the reference.`
      );
    },
    [customPrompt]
  );

  // Ã¢â€â‚¬Ã¢â€â‚¬ Logo Upload Ã¢â€â‚¬Ã¢â€â‚¬
  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedLogo(reader.result as string);
      toast.success('Logo uploaded!');
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePartnerLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Partner logo must be under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const partnerAsset = {
        id: createLocalAssetId(),
        name: file.name,
        url: reader.result as string,
      } satisfies UploadedLogoAsset;

      setAllianceLogos((prev) => [partnerAsset, ...prev.slice(1)]);
      toast.success('Partner logo uploaded!');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleAllianceLogosUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFile = files.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      toast.error('Only image files can be added as alliance logos.');
      return;
    }

    const oversizedFile = files.find((file) => file.size > 5 * 1024 * 1024);
    if (oversizedFile) {
      toast.error('Each alliance logo must be under 5MB.');
      return;
    }

    const nextAssets = await Promise.all(
      files.slice(0, 4).map(
        (file) =>
          new Promise<UploadedLogoAsset>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: createLocalAssetId(),
                name: file.name,
                url: reader.result as string,
              });
            reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
            reader.readAsDataURL(file);
          })
      )
    ).catch(() => {
      toast.error('One or more alliance logos could not be loaded.');
      return null;
    });

    if (!nextAssets) return;

    setAllianceLogos((prev) => [...prev, ...nextAssets].slice(0, 4));
    e.target.value = '';
    toast.success(`${nextAssets.length} alliance logo${nextAssets.length === 1 ? '' : 's'} added.`);
  }, []);

  const handleReferenceImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Reference image must be under 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReferenceSelectionTouched(true);
      setSelectedReferenceImage(reader.result as string);
      toast.success('Reference image uploaded!');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // ── Fetch Images from URL ──
  const handlePdfUploadSelection = useCallback(
    async (files: File[]) => {
      if (!onUploadPdfFiles || files.length === 0) return;
      setIsUploadingPdfImages(true);
      try {
        await onUploadPdfFiles(files);
      } finally {
        setIsUploadingPdfImages(false);
      }
    },
    [onUploadPdfFiles]
  );

  const handleReextractSelectedPdfs = useCallback(async () => {
    if (!onReextractPdfs) return;

    const targetIds = selectedPdfs
      .filter((item) => item.extractedCount <= 0 && item.canReextract)
      .map((item) => item.id);
    if (targetIds.length === 0) return;

    setIsReextractingPdfImages(true);
    try {
      await onReextractPdfs(targetIds);
    } finally {
      setIsReextractingPdfImages(false);
    }
  }, [onReextractPdfs, selectedPdfs]);

  const handleReextractSinglePdf = useCallback(
    async (pdfId: string) => {
      if (!onReextractPdfs) return;
      const normalized = String(pdfId || '').trim();
      if (!normalized) return;

      setPdfLibraryActionState({ kind: 'reextract-pdf', targetId: normalized });
      try {
        await onReextractPdfs([normalized]);
      } finally {
        setPdfLibraryActionState(null);
      }
    },
    [onReextractPdfs]
  );

  const handleDeletePdfImage = useCallback(
    async (image: PdfImageReference) => {
      if (!onDeleteEvidenceIds) return;
      const confirmed =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              `Delete this extracted visual?\n\n${image.title}\n\nThis removes only the extracted image, not the source PDF.`
            );
      if (!confirmed) return;

      setPdfLibraryActionState({ kind: 'delete-image', targetId: image.id });
      try {
        await onDeleteEvidenceIds([image.id]);
        if (selectedReferenceImage === image.signed_url) {
          setReferenceSelectionTouched(true);
          setSelectedReferenceImage(null);
        }
      } finally {
        setPdfLibraryActionState(null);
      }
    },
    [onDeleteEvidenceIds, selectedReferenceImage]
  );

  const handleFetchSiteImages = useCallback(async () => {
    const url = siteUrl.trim();
    if (!url) {
      toast.error('Enter a website URL first');
      return;
    }

    const candidate = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    setIsFetchingSiteImages(true);
    try {
      const res = await fetch('/api/pro/image/fetch-site-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: candidate }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Could not fetch images');
      }

      const data = await res.json();
      const images = Array.isArray(data.candidates) ? data.candidates : [];

      if (images.length === 0) {
        toast.warning('No usable images found on that page');
        return;
      }

      setFetchedSiteImages(images.slice(0, 12));
      toast.success(`Found ${Math.min(images.length, 12)} images from that page`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch';
      toast.error('Could not fetch images', { description: message });
    } finally {
      setIsFetchingSiteImages(false);
    }
  }, [siteUrl]);

  // ── Generate Image (supports batch) ──
  const handleGenerate = useCallback(async () => {
    if (!hasPostContext) {
      toast.error('Confirm your post first', {
        description: 'Image generation is linked to the confirmed post from Step 1.',
      });
      return;
    }

    const effectiveHeadline = (
      (usePostHeadline ? syncedHeadlineFromPost : headline) ||
      syncedHeadlineFromPost ||
      headline ||
      derivedWording.headline ||
      ''
    ).trim();
    const effectiveTagline = (tagline || derivedWording.tagline || '').trim();
    const resolvedLogoForGeneration = uploadedLogo || primaryBrandLogoUrl || null;
    const effectiveLogoPlacement = resolvedLogoForGeneration ? logoPlacement : 'none';
    const effectiveLogoForGeneration =
      effectiveLogoPlacement !== 'none' ? resolvedLogoForGeneration : null;
    const manualFeatureLines = derivePosterBenefitLines(benefitsText);
    const supplementalFeatureLines = derivePosterBenefitLines(
      effectiveTagline,
      effectiveHeadline,
      contextBrief,
      confirmedPostImageBrief,
      confirmedPostText
    );
    const resolvedFeatureLines =
      manualFeatureLines.length > 0
        ? manualFeatureLines
        : postDerivedFeatureLines.length > 0
          ? postDerivedFeatureLines
          : supplementalFeatureLines;
    const benefitBullets = resolvedFeatureLines.slice(0, selectedThemeId === 'industrial-campaign' ? 4 : 6);
    const resolvedSlotImages: Record<string, string> = { ...resolvedNonHeroSlotAssignments };
    if (themeUsesHeroReference && selectedReferenceImage) {
      resolvedSlotImages.hero = selectedReferenceImage;
    }
    const hasResolvedHeroReference = !themeUsesHeroReference || Boolean(selectedReferenceImage);

    if (!effectiveHeadline && !confirmedPostText) {
      toast.error('Please enter a headline or generate a post first');
      return;
    }

    if (themeUsesHeroReference && !hasResolvedHeroReference) {
      toast.error('Select a visual source first', {
        description: 'Use a PDF-extracted image or a reference image. It will automatically fill the hero area for this theme.',
      });
      return;
    }

    if (logoPlacement !== 'none' && !resolvedLogoForGeneration) {
      toast.message('Generating without logo', {
        description: 'No brand logo was found, so this image will be created without one.',
      });
    }

    const count = batchSize;
    const baseNonce = generationNonce + 1;
    setGenerationNonce(baseNonce + count - 1);
    setIsGenerating(true);
    setSelectedImage(null);

    if (count > 1) {
      toast.message(`Generating ${count} ${activeTheme.label} images...`, {
        description: 'Each variation uses a different layout recipe from this theme.',
      });
    }

    let successCount = 0;
    let lastImageUrl: string | null = null;

    try {
    for (let i = 0; i < count; i++) {
      const nonce = baseNonce + i;

      try {
        const res = await fetch('/api/pro/image/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            brandName,
            productName: productName || undefined,
            brandColors: normalizedBrandColors,
            themeId: selectedThemeId,
            contextBrief: contextBrief.trim() || undefined,
            headline: effectiveHeadline,
            tagline: effectiveTagline,
            tone: selectedTone,
            style: selectedStyle,
            logoUrl: effectiveLogoForGeneration || undefined,
            logoPlacement: effectiveLogoPlacement,
            additionalLogoUrls:
              selectedThemeId === 'alliance-poster'
                ? effectiveAllianceLogos.map((item) => item.url)
                : undefined,
            partnerName: partnerName.trim() || undefined,
            partnerTagline: partnerTagline.trim() || undefined,
            footerWebsite: footerWebsite.trim() || undefined,
            footerEmail: footerEmail.trim() || undefined,
            featureBullets: benefitBullets.length > 0 ? benefitBullets : undefined,
            referenceAsHero: hasResolvedHeroReference,
            slotImages: Object.keys(resolvedSlotImages).length > 0 ? resolvedSlotImages : undefined,
            postText: confirmedPostText || undefined,
            postImagePrompt: confirmedPostImageBrief || undefined,
            customPrompt: customPrompt.trim() || undefined,
            generationNonce: nonce,
            imageAspect,
            referenceImageUrl: selectedReferenceImage || undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Generation failed' }));
          throw new Error(err.error || 'Generation failed');
        }

        const data = await res.json();

        if (data.url) {
          const rawImageUrl = (typeof data.baseUrl === 'string' && data.baseUrl.trim()) || data.url;
          let finalImageUrl: string = data.url;

          const shouldApplyBlend =
            selectedThemeId !== 'alliance-poster' &&
            selectedBlendMode !== 'normal' &&
            logoPlacement !== 'none' &&
            Boolean(effectiveLogoForGeneration);

          if (shouldApplyBlend) {
            setIsApplyingBlend(true);
            try {
              const placement = logoPlacement === 'infuse' ? 'center' : 'top-right';
              const aspectSize = ASPECT_DIMENSIONS[imageAspect];

              const blendRes = await fetch('/api/pro/image/blend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  brandId,
                  baseImageUrl: rawImageUrl,
                  logoUrl: effectiveLogoForGeneration,
                  blendMode: selectedBlendMode,
                  logoPlacement: placement,
                  logoOpacity: logoPlacement === 'infuse' ? 0.42 : 0.92,
                  logoScale: logoPlacement === 'infuse' ? 1.1 : 1,
                  canvasWidth: aspectSize.width,
                  canvasHeight: aspectSize.height,
                  overlayOpacity: 0,
                }),
              });

              if (blendRes.ok) {
                const blendData = await blendRes.json();
                if (blendData?.file_url) {
                  finalImageUrl = blendData.file_url as string;
                  setLatestBlendPreview({
                    mode: selectedBlendMode,
                    rawUrl: rawImageUrl,
                    blendedUrl: finalImageUrl,
                  });
                } else {
                  setLatestBlendPreview(null);
                }
              } else {
                setLatestBlendPreview(null);
              }
            } catch {
              setLatestBlendPreview(null);
            } finally {
              setIsApplyingBlend(false);
            }
          } else {
            setLatestBlendPreview(null);
          }

          setGeneratedImages((prev) => [finalImageUrl, ...prev]);
          setSelectedImage(0);
          setGenerationCount((c) => c + 1);
          successCount++;
          lastImageUrl = finalImageUrl;

          // Auto-sync the latest generated image to parent
          onImageGenerated?.(finalImageUrl);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        if (count === 1) {
          toast.error('Generation failed', { description: message });
        } else {
          toast.error(`Image ${i + 1}/${count} failed`, { description: message });
        }
      }
    }

    if (successCount > 0 && lastImageUrl) {
      if (successCount > 1) {
        toast.success(`${successCount} ${activeTheme.label} images generated — pick your favourite.`);
      } else if (count === 1) {
        toast.success(`${activeTheme.label} image generated.`);
      } else {
        toast.success(`1 of ${count} images generated.`);
      }
    }
    } finally {
      setIsGenerating(false);
    }
  }, [
    hasPostContext,
    headline,
    usePostHeadline,
    syncedHeadlineFromPost,
    confirmedPostImageBrief,
    derivedWording,
    tagline,
    selectedTone,
    selectedStyle,
    selectedThemeId,
    activeTheme,
    contextBrief,
    uploadedLogo,
    effectiveAllianceLogos,
    benefitsText,
    primaryBrandLogoUrl,
    confirmedPostText,
    customPrompt,
    generationNonce,
    batchSize,
    brandId,
    brandName,
    productName,
    normalizedBrandColors,
    logoPlacement,
    imageAspect,
    partnerName,
    partnerTagline,
    footerEmail,
    footerWebsite,
    selectedBlendMode,
    selectedReferenceImage,
    postDerivedFeatureLines,
    onImageGenerated,
    resolvedNonHeroSlotAssignments,
    themeUsesHeroReference,
  ]);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Confirm Ã¢â€â‚¬Ã¢â€â‚¬
  const handleConfirm = useCallback(() => {
    if (selectedImage === null || !generatedImages[selectedImage]) {
      toast.error('Please select an image first');
      return;
    }
    onImageConfirmed?.(generatedImages[selectedImage]);
  }, [selectedImage, generatedImages, onImageConfirmed]);

  const currentTone = TONE_OPTIONS.find((t) => t.id === selectedTone);
  const currentStyle = STYLE_OPTIONS.find((s) => s.id === selectedStyle);
  const headlineInputValue = usePostHeadline ? syncedHeadlineFromPost : headline;
  const activeHeadlineText = (
    headlineInputValue ||
    syncedHeadlineFromPost ||
    derivedWording.headline ||
    ''
  ).trim();
  const activeTaglineText = (tagline || derivedWording.tagline || analyzedTaglineDefault || '').trim();
  const manualFeatureLines = derivePosterBenefitLines(benefitsText);
  const supplementalPreviewFeatureLines = derivePosterBenefitLines(
    activeTaglineText,
    activeHeadlineText,
    contextBrief,
    confirmedPostImageBrief
  );
  const resolvedFeatureLines =
    manualFeatureLines.length > 0
      ? manualFeatureLines
      : postDerivedFeatureLines.length > 0
        ? postDerivedFeatureLines
        : supplementalPreviewFeatureLines;
  const previewFeatureLines = resolvedFeatureLines;
  const partnerLogo = effectiveAllianceLogos[0] || null;
  const additionalAllianceLogos = effectiveAllianceLogos.slice(1);
  const allianceHeaderLogos = effectiveAllianceLogos.slice(0, 3);
  const partnerLogoIsManual = Boolean(
    partnerLogo && allianceLogos.some((item) => item.url === partnerLogo.url)
  );
  const previewAspectClass =
    imageAspect === 'square'
      ? 'aspect-square'
      : imageAspect === 'portrait'
      ? 'aspect-[4/5]'
      : 'aspect-[1200/628]';

  // Use prop-supplied images when the parent passes them (keeps in sync after evidence uploads).
  // Fall back to internally-fetched images when no prop is provided.
  const isLoadingPdf = propPdfImages !== undefined ? false : isFetchingPdfImages;
  const normalizedPrompt = normalizeReferenceText(customPrompt);
  const selectedPdfImage =
    effectivePdfImages.find((img) => img.signed_url === selectedReferenceImage) || null;
  const previewedPdfImage = useMemo(() => {
    if (effectivePdfImages.length === 0) return null;
    return (
      effectivePdfImages.find((img) => img.id === previewedPdfImageId) ||
      selectedPdfImage ||
      effectivePdfImages[0] ||
      null
    );
  }, [effectivePdfImages, previewedPdfImageId, selectedPdfImage]);
  const selectedSiteImage =
    fetchedSiteImages.find((img) => img.url === selectedReferenceImage) || null;
  const hasReadyLogo = Boolean(uploadedLogo || primaryBrandLogoUrl);
  const selectedReferenceSummary = useMemo(() => {
    if (!selectedReferenceImage) return null;
    if (selectedPdfImage) {
      return {
        badge: 'PDF',
        title: 'Hero visual is using a PDF image',
        detail: selectedPdfImage.title,
      };
    }
    if (selectedSiteImage) {
      return {
        badge: 'Website',
        title: 'Hero visual is using a website image',
        detail: selectedSiteImage.source || selectedSiteImage.url,
      };
    }
    return {
      badge: 'Upload',
      title: 'Hero visual is using an uploaded image',
      detail: 'Manual reference upload',
    };
  }, [selectedPdfImage, selectedReferenceImage, selectedSiteImage]);
  const isAiGuidedTheme = selectedThemeId === 'guided-auto';
  const themePaletteRoles = useMemo(
    () => [
      { label: 'Primary', value: derivedThemePalette.bgStart, hint: 'Main backgrounds and headings' },
      { label: 'Secondary', value: derivedThemePalette.bgEnd, hint: 'Large surfaces and gradients' },
      { label: 'Accent', value: derivedThemePalette.accent, hint: 'CTA and key emphasis' },
      { label: 'Support', value: derivedThemePalette.support, hint: 'Checks, tags, and highlights' },
    ],
    [derivedThemePalette]
  );
  const suggestedBrandColors = useMemo(
    () =>
      dedupeBrandColorList([
        derivedThemePalette.bgStart,
        derivedThemePalette.bgEnd,
        derivedThemePalette.accent,
        derivedThemePalette.support,
        derivedThemePalette.surface,
      ]).filter((color) => !normalizedBrandColors.includes(color)).slice(0, 5),
    [derivedThemePalette, normalizedBrandColors]
  );
  const baselineBrandColors = baselineBrandColorsRef.current;
  const paletteQuickActions = useMemo(
    () =>
      [
        {
          id: 'saved-brand',
          label: 'Restore Saved',
          description: 'Go back to the saved brand palette.',
          colors: baselineBrandColors,
          disabled: baselineBrandColors.length === 0,
        },
        {
          id: 'balanced-theme',
          label: 'Balanced Theme',
          description: 'Dark base plus cleaner accent balance.',
          colors: dedupeBrandColorList([
            baselineBrandColors[0] || derivedThemePalette.bgStart,
            baselineBrandColors[1] || derivedThemePalette.bgEnd,
            derivedThemePalette.accent,
            derivedThemePalette.support,
          ]),
          disabled: false,
        },
        {
          id: 'high-contrast',
          label: 'High Contrast',
          description: 'Stronger contrast for sharper templates.',
          colors: dedupeBrandColorList([
            derivedThemePalette.bgStart,
            '#ffffff',
            derivedThemePalette.accent,
            derivedThemePalette.support,
          ]),
          disabled: false,
        },
      ].filter((action) => action.colors.length > 0),
    [baselineBrandColors, derivedThemePalette]
  );
  const canRestoreBrandColors =
    baselineBrandColors.length > 0 &&
    colorListSignature(baselineBrandColors) !== colorListSignature(normalizedBrandColors);
  const selectedPdfVisualCount = useMemo(
    () => selectedPdfs.reduce((sum, item) => sum + Math.max(0, item.extractedCount || 0), 0),
    [selectedPdfs]
  );
  const selectedPdfsMissingVisuals = useMemo(
    () => selectedPdfs.filter((item) => item.extractedCount <= 0),
    [selectedPdfs]
  );
  const reextractableSelectedPdfIds = useMemo(
    () =>
      selectedPdfsMissingVisuals
        .filter((item) => item.canReextract)
        .map((item) => item.id),
    [selectedPdfsMissingVisuals]
  );
  const generationBlockedReason =
    !hasPostContext
      ? 'Confirm a post in Step 1 first.'
      : !activeHeadlineText && !confirmedPostText
        ? 'Add a headline or use the confirmed post headline.'
        : isAiGuidedTheme && !customPrompt.trim()
          ? 'Add Your Vision so AI Guided knows exactly what to build.'
        : themeUsesHeroReference && !selectedReferenceImage
          ? 'Choose a PDF image or uploaded reference for the hero visual.'
          : null;
  const canGenerateImage =
    !isGenerating &&
    !isApplyingBlend &&
    !isUploadingPdfImages &&
    !isReextractingPdfImages &&
    !generationBlockedReason;
  const defaultPdfReferenceUrl = effectivePdfImages[0]?.signed_url || null;

  useEffect(() => {
    if (referenceSelectionTouched) return;
    if (!defaultPdfReferenceUrl) return;
    if (selectedReferenceImage === defaultPdfReferenceUrl) return;
    setSelectedReferenceImage(defaultPdfReferenceUrl);
  }, [defaultPdfReferenceUrl, referenceSelectionTouched, selectedReferenceImage]);

  useEffect(() => {
    if (effectivePdfImages.length === 0) {
      if (previewedPdfImageId !== null) {
        setPreviewedPdfImageId(null);
      }
      return;
    }

    const previewStillExists = previewedPdfImageId
      ? effectivePdfImages.some((img) => img.id === previewedPdfImageId)
      : false;

    if (!previewStillExists) {
      setPreviewedPdfImageId(selectedPdfImage?.id || effectivePdfImages[0].id);
    }
  }, [effectivePdfImages, previewedPdfImageId, selectedPdfImage]);

  // Detect if the custom prompt mentions a PDF image by title so we can suggest auto-selecting it.
  // Match on any word ≥4 chars from an image title appearing in the prompt (case-insensitive).
  const promptMatchedPdfImage = useMemo(() => {
    if (!customPrompt.trim() || effectivePdfImages.length === 0) return null;
    const promptLower = normalizedPrompt;
    // Score each image by how many of its title words appear in the prompt
    let bestMatch: { img: typeof effectivePdfImages[number]; score: number } | null = null;
    for (const img of effectivePdfImages) {
      const words = img.title
        .toLowerCase()
        .replace(/[•·—–]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      if (words.length === 0) continue;
      const matched = words.filter((w) => promptLower.includes(w)).length;
      const score = matched / words.length;
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { img, score };
      }
    }
    // Only suggest when at least one meaningful keyword matched
    if (!bestMatch || bestMatch.score === 0) return null;
    // Don't suggest if already selected or if the user dismissed it
    if (selectedReferenceImage === bestMatch.img.signed_url) return null;
    if (dismissedPdfSuggestions.has(bestMatch.img.id)) return null;
    return bestMatch.img;
  }, [customPrompt, effectivePdfImages, selectedReferenceImage, dismissedPdfSuggestions, normalizedPrompt]);


  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-6">
      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â LEFT: Form Controls Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <div className="flex flex-col lg:max-h-[calc(100vh-200px)]">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 lg:pr-2 scrollbar-thin pb-2">
        {!hasPostContext && (
          <Card className="p-3.5 bg-amber-50 border border-amber-300 shadow-sm">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm min-w-0">
                <p className="font-semibold text-amber-900 text-xs">Post required before image generation</p>
                <p className="text-amber-800 text-xs mt-0.5">
                  Go to Step 1, confirm your post, then come back here so AI can generate a relevant image.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Post Context (if available) Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {confirmedPostText && (
          <Card className="p-3.5 bg-blue-50 border border-blue-200 shadow-sm">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm min-w-0">
                <p className="font-semibold text-blue-900 text-xs">Creating image for</p>
                <p className="text-blue-800 line-clamp-2 text-xs mt-0.5">{confirmedPostText.slice(0, 150)}...</p>
                {productName && (
                  <p className="text-blue-700 text-xs mt-1">
                    Product focus: <span className="font-semibold">{productName}</span>
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 1. Logo Upload Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {hasPostContext && (
          <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3.5 py-2.5 flex items-center gap-3">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <p className="text-xs font-medium text-slate-700 truncate">
                {brandName || 'Post confirmed'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {normalizedBrandColors.length > 0 && (
                <div className="flex gap-0.5">
                  {normalizedBrandColors.slice(0, 4).map((color, idx) => (
                    <div
                      key={idx}
                      className="w-3.5 h-3.5 rounded-sm border border-white shadow-sm ring-1 ring-slate-200/60"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
              {hasReadyLogo && (
                <span className="w-5 h-5 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-center" title="Logo ready">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                </span>
              )}
              {effectivePdfImages.length > 0 && (
                <span className="text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                  {effectivePdfImages.length} img{effectivePdfImages.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        )}

        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Theme & Style</h3>
              <p className="text-[11px] text-slate-500">
                Pick a layout, set your colors, then generate.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Choose a theme
            </p>
            <div className="space-y-4">
              {themesByCategory.map((section) => (
                <div key={section.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {section.category}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {section.themes.length} theme{section.themes.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {section.themes.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => handleThemeSelect(theme.id)}
                        className={`rounded-xl border px-2.5 py-2.5 text-left transition-all ${
                          selectedThemeId === theme.id
                            ? 'border-fuchsia-300 bg-fuchsia-50 ring-1 ring-fuchsia-200 shadow-md shadow-fuchsia-100/50'
                            : 'border-slate-200 bg-white hover:border-fuchsia-200 hover:bg-fuchsia-50/40 hover:shadow-sm'
                        }`}
                      >
                        <ThemePreviewMini
                          themeId={theme.id}
                          isActive={selectedThemeId === theme.id}
                        />
                        <div>
                          <p className="text-xs font-semibold text-slate-900 leading-tight">{theme.label}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500 leading-snug line-clamp-2">{theme.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Selected theme indicator — minimal since right panel shows preview */}
            <div className="rounded-lg border border-fuchsia-200/60 bg-fuchsia-50/40 px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-fuchsia-500 flex-shrink-0" />
              <p className="text-[11px] text-fuchsia-700 font-medium truncate">{activeTheme.label}: {activeTheme.summary}</p>
            </div>

            {/* ── Theme Palette & Brand Colors ── */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              {/* Live palette gradient strip */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-slate-600" />
                    <p className="text-xs font-semibold text-slate-800">Theme Palette</p>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {normalizedBrandColors.length} saved brand color{normalizedBrandColors.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div
                  className="h-8 rounded-lg overflow-hidden shadow-inner ring-1 ring-slate-200/80"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${derivedThemePalette.bgStart} 0%, ${derivedThemePalette.bgEnd} 40%, ${derivedThemePalette.accent} 70%, ${derivedThemePalette.support} 100%)`,
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  {themePaletteRoles.map((swatch) => (
                    <div
                      key={swatch.label}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-8 w-8 flex-shrink-0 rounded-lg border border-white shadow-sm ring-1 ring-slate-200/60"
                          style={{ backgroundColor: swatch.value }}
                          title={`${swatch.label}: ${swatch.value}`}
                        />
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                            {swatch.label}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">{swatch.value}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] leading-snug text-slate-500">{swatch.hint}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Brand Colors</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              {/* Brand color swatches — always editable */}
              <div className="space-y-2.5">
                <div className="grid gap-2 sm:grid-cols-3">
                  {paletteQuickActions.map((action) => {
                    const isActive =
                      colorListSignature(action.colors) === colorListSignature(normalizedBrandColors);

                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={action.disabled}
                        onClick={() => applyBrandColors(action.colors)}
                        className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                          isActive
                            ? 'border-purple-300 bg-purple-50'
                            : 'border-slate-200 bg-slate-50 hover:border-purple-200 hover:bg-purple-50/50'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                          {action.label}
                        </p>
                        <p className="mt-1 text-[10px] leading-snug text-slate-500">
                          {action.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {normalizedBrandColors.slice(0, 8).map((color, idx) => (
                    <div key={`${color}-${idx}`} className="relative group text-center">
                      <div
                        className="h-10 w-10 rounded-xl border-2 border-white shadow-md ring-1 ring-slate-200 transition-transform hover:scale-110 cursor-pointer"
                        style={{ backgroundColor: color }}
                        title={`${resolveColorLabel(color, brandColorNames)} (${color})`}
                      />
                      <p className="mt-0.5 max-w-[64px] truncate text-[8px] font-semibold uppercase tracking-wide text-slate-500">
                        {resolveColorLabel(color, brandColorNames)}
                      </p>
                      <p className="text-[8px] font-mono text-slate-400">{color}</p>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = normalizedBrandColors.filter((_, i) => i !== idx);
                          applyBrandColors(updated);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center shadow-sm hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove color"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {normalizedBrandColors.length < 8 && (
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setIsEditingColors(true)}
                        className="h-10 w-10 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 hover:border-purple-400 hover:text-purple-500 hover:bg-purple-50 transition-colors"
                        title="Add color"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                      <p className="mt-0.5 text-[8px] text-slate-300">Add</p>
                    </div>
                  )}
                </div>

                {/* Inline color picker — always visible when editing or no colors */}
                {(isEditingColors || normalizedBrandColors.length === 0) && normalizedBrandColors.length < 8 && (
                  <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50/50 p-2">
                    <input
                      type="color"
                      value={newColorInput.startsWith('#') && newColorInput.length === 7 ? newColorInput : '#6366f1'}
                      onChange={(e) => setNewColorInput(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-purple-200 cursor-pointer p-0 shadow-sm"
                      title="Pick a color"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={newColorInput}
                        onChange={(e) => setNewColorInput(e.target.value)}
                        placeholder="#hex"
                        className="w-full h-9 text-sm px-3 border border-purple-200 rounded-lg bg-white text-slate-700 font-mono"
                        maxLength={7}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const hex = normalizeHexColor(newColorInput);
                        if (hex && !normalizedBrandColors.includes(hex)) {
                          applyBrandColors([...normalizedBrandColors, hex]);
                          setNewColorInput('#');
                        }
                      }}
                      className="h-9 px-4 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                    >
                      Add
                    </button>
                    {normalizedBrandColors.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsEditingColors(false)}
                        className="h-9 px-2 text-xs font-medium text-slate-500 hover:text-slate-700"
                      >
                        Done
                      </button>
                    )}
                  </div>
                )}

                {/* Suggested colors */}
                {suggestedBrandColors.length > 0 && !isEditingColors && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] text-slate-400 font-medium">Suggestions:</span>
                    {suggestedBrandColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => applyBrandColors([...normalizedBrandColors, color])}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-purple-300 hover:bg-purple-50 transition-colors"
                      >
                        <span
                          className="h-3 w-3 rounded-full ring-1 ring-slate-200"
                          style={{ backgroundColor: color }}
                        />
                        {color}
                      </button>
                    ))}
                  </div>
                )}
                {canRestoreBrandColors && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => applyBrandColors(baselineBrandColors)}
                      className="text-[10px] font-semibold text-purple-700 hover:text-purple-900"
                    >
                      Restore saved brand colors
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Theme Image Slot Pickers ──────────────────────────────── */}
            {(themeUsesHeroReference || additionalThemeSlots.length > 0 || (isAiGuidedTheme && Boolean(selectedReferenceImage))) && (
              <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                    <p className="text-[11px] font-semibold text-indigo-700">
                      {themeUsesHeroReference
                        ? 'Hero Visual Source'
                        : isAiGuidedTheme
                          ? 'Reference Visual'
                          : `Additional image slots for ${activeTheme.label}`}
                    </p>
                  </div>
                  {selectedReferenceSummary && (themeUsesHeroReference || isAiGuidedTheme) && (
                    <Badge className="border border-indigo-200 bg-indigo-100 text-indigo-700 text-[10px]">
                      {selectedReferenceSummary.badge}
                    </Badge>
                  )}
                </div>
                {(themeUsesHeroReference || (isAiGuidedTheme && selectedReferenceImage)) && (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    {selectedReferenceImage ? (
                      <>
                        <img
                          src={selectedPdfImage?.signed_url || selectedSiteImage?.url || selectedReferenceImage}
                          alt="Hero source"
                          className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900">
                            {selectedReferenceSummary?.title || 'Hero visual selected'}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-slate-500">
                            {selectedReferenceSummary?.detail || selectedReferenceImage}
                          </p>
                          <p className="mt-1 text-[10px] text-indigo-600">
                            {themeUsesHeroReference
                              ? `This image fills the hero area automatically for ${activeTheme.label}.`
                              : 'This reference guides the AI composition directly.'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReferenceSelectionTouched(true);
                            setSelectedReferenceImage(null);
                          }}
                          className="h-8 px-2 text-slate-500 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <div className="w-full rounded-xl border border-dashed border-indigo-200 bg-white/80 px-3 py-4 text-center">
                        <p className="text-xs font-semibold text-indigo-700">
                          Pick a PDF image or uploaded reference below
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          The selected visual becomes the hero automatically. There is no separate hero picker anymore.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {additionalThemeSlots.length > 0 && (
                <div className={`grid gap-2 ${additionalThemeSlots.length >= 3 ? 'grid-cols-3' : additionalThemeSlots.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {additionalThemeSlots.map((slot) => {
                    const assigned = nonHeroSlotAssignments[slot.id] || null;
                    return (
                      <div key={slot.id} className="rounded-lg border border-slate-200 bg-white p-2 space-y-1.5">
                        <p className="text-[10px] font-semibold text-slate-600 truncate">
                          {slot.label}
                        </p>
                        {assigned ? (
                          <div className="relative">
                            <img
                              src={assigned}
                              alt={slot.label}
                              className="w-full aspect-square object-cover rounded-md border border-slate-200"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setSlotAssignments((prev) => ({ ...prev, [slot.id]: null }))}
                              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-full aspect-square rounded-md border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1">
                            <ImageIcon className="w-5 h-5 text-slate-300" />
                            <span className="text-[9px] text-slate-400">No image</span>
                          </div>
                        )}
                        {/* Quick-pick from available images */}
                        <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                          {effectivePdfImages.slice(0, 6).map((img) => (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() =>
                                setSlotAssignments((prev) => ({
                                  ...prev,
                                  [slot.id]: img.signed_url,
                                }))
                              }
                              className={`w-8 h-8 rounded border overflow-hidden flex-shrink-0 transition-all ${
                                assigned === img.signed_url
                                  ? 'border-indigo-400 ring-1 ring-indigo-300'
                                  : 'border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <img
                                src={img.signed_url}
                                alt={img.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </button>
                          ))}
                          {fetchedSiteImages.slice(0, 6).map((img, idx) => (
                            <button
                              key={`site-${idx}`}
                              type="button"
                              onClick={() =>
                                setSlotAssignments((prev) => ({
                                  ...prev,
                                  [slot.id]: img.url,
                                }))
                              }
                              className={`w-8 h-8 rounded border overflow-hidden flex-shrink-0 transition-all ${
                                assigned === img.url
                                  ? 'border-indigo-400 ring-1 ring-indigo-300'
                                  : 'border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <img
                                src={img.url}
                                alt="Site"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </button>
                          ))}
                          {selectedReferenceImage && !effectivePdfImages.some((p) => p.signed_url === selectedReferenceImage) && !fetchedSiteImages.some((s) => s.url === selectedReferenceImage) && (
                            <button
                              type="button"
                              onClick={() =>
                                setSlotAssignments((prev) => ({
                                  ...prev,
                                  [slot.id]: selectedReferenceImage,
                                }))
                              }
                              className={`w-8 h-8 rounded border overflow-hidden flex-shrink-0 transition-all ${
                                assigned === selectedReferenceImage
                                  ? 'border-indigo-400 ring-1 ring-indigo-300'
                                  : 'border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <img
                                src={selectedReferenceImage}
                                alt="Ref"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
                <p className="text-[9px] text-indigo-500/70">
                  {additionalThemeSlots.length > 0
                    ? 'Use these extra slots only when the layout needs more than one image. The hero still comes from the selected PDF/reference automatically.'
                    : 'The PDF library is the default source. If a new page 1 PDF visual arrives and you have not manually overridden the selection, Studio will update the hero source automatically.'}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
              What should this image communicate?
            </label>
            <Textarea
              value={contextBrief}
              onChange={(e) => setContextBrief(e.target.value)}
              placeholder={activeTheme.promptHint}
              rows={3}
              className="text-sm resize-none bg-slate-50 border-slate-300 text-slate-900 placeholder:text-gray-400"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              Think of this like ChatGPT: give the campaign context, what must be shown, and what should stand out.
            </p>
          </div>

        </Card>

        <Card className="p-4 space-y-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Upload className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Logos & Details</h3>
              <p className="text-[11px] text-slate-500">
                Brand marks, partner logos, footer info, and proof points.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Your brand logo</p>
                  <p className="text-[10px] text-gray-400">
                    Used as the main brand mark. This stays linked to the active brand.
                  </p>
                </div>
                {uploadedLogo && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setUploadedLogo(primaryBrandLogoUrl || null)}
                    className="h-7 w-7 p-0 text-slate-500 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {uploadedLogo ? (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-purple-200 bg-white">
                    <img src={uploadedLogo} alt="Your brand logo" className="h-full w-full object-contain p-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-emerald-700">Logo ready</p>
                    <p className="mt-0.5 text-[10px] text-slate-500 truncate">
                      {brandName || 'Active brand'}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1 text-[11px] font-medium text-purple-600 hover:underline"
                    >
                      Change logo
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 w-full rounded-xl border-2 border-dashed border-slate-300 bg-white py-4 text-center transition-all hover:border-purple-400 hover:bg-purple-50"
                >
                  <Upload className="mx-auto mb-1 h-5 w-5 text-slate-500" />
                  <p className="text-sm font-medium text-slate-700">Upload your logo</p>
                  <p className="text-[10px] text-gray-400">PNG, SVG, or JPG</p>
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Partner / company logo</p>
                  <p className="text-[10px] text-gray-400">
                    Used for alliance posters and partner-led creatives. Add one main partner logo first.
                  </p>
                </div>
                {partnerLogoIsManual && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAllianceLogos((prev) => prev.slice(1))}
                    className="h-7 w-7 p-0 text-slate-500 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {partnerLogo ? (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-sky-200 bg-white">
                    <img src={partnerLogo.url} alt={partnerLogo.name} className="h-full w-full object-contain p-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-sky-700">Partner logo ready</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {partnerName || partnerLogo.name}
                    </p>
                    {!partnerLogoIsManual && (
                      <p className="mt-1 text-[10px] text-sky-600">
                        Auto-linked from your brand kit.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => partnerLogoInputRef.current?.click()}
                      className="mt-1 text-[11px] font-medium text-sky-600 hover:underline"
                    >
                      Change partner logo
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => partnerLogoInputRef.current?.click()}
                  className="mt-3 w-full rounded-xl border-2 border-dashed border-slate-300 bg-white py-4 text-center transition-all hover:border-sky-400 hover:bg-sky-50"
                >
                  <Building2 className="mx-auto mb-1 h-5 w-5 text-slate-500" />
                  <p className="text-sm font-medium text-slate-700">Upload partner logo</p>
                  <p className="text-[10px] text-gray-400">ABB, CHINT, Schneider, Siemens, etc.</p>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Partner / company name
              </label>
              <Input
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="e.g. ABB"
                className="h-10 bg-white border-slate-300 text-slate-900 placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Partner slogan <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <Input
                value={partnerTagline}
                onChange={(e) => setPartnerTagline(e.target.value)}
                placeholder="e.g. Power and productivity for a better world"
                className="h-10 bg-white border-slate-300 text-slate-900 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-800">Additional alliance logos</p>
                <p className="text-[10px] text-gray-400">
                  Optional extra marks for multi-brand headers. The first partner logo above remains the main linked partner.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => allianceLogoInputRef.current?.click()}
                className="h-8 border-slate-300 text-slate-700"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add more
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />

            <input
              ref={partnerLogoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePartnerLogoUpload}
              className="hidden"
            />

            <input
              ref={allianceLogoInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleAllianceLogosUpload}
              className="hidden"
            />

            <input
              ref={referenceImageInputRef}
              type="file"
              accept="image/*"
              onChange={handleReferenceImageUpload}
              className="hidden"
            />

            {additionalAllianceLogos.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {additionalAllianceLogos.map((logo) => (
                  <div
                    key={logo.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                  >
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                      <img src={logo.url} alt={logo.name} className="h-full w-full object-contain p-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-800">{logo.name}</p>
                      {!allianceLogos.some((item) => item.url === logo.url) && (
                        <p className="mt-0.5 text-[10px] text-cyan-600">From brand kit</p>
                      )}
                    </div>
                    {allianceLogos.some((item) => item.url === logo.url) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setAllianceLogos((prev) => [prev[0], ...prev.slice(1).filter((item) => item.id !== logo.id)].filter(Boolean) as UploadedLogoAsset[])
                        }
                        className="h-8 w-8 p-0 text-slate-500 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
                Optional. Use this when a header needs more than one partner mark.
              </div>
            )}
          </div>

          {/* ── Theme Details (merged) ── */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Footer & Details</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Footer website <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Input
                value={footerWebsite}
                onChange={(e) => setFooterWebsite(e.target.value)}
                placeholder="www.yoursite.com"
                className="h-10 bg-white border-slate-300 text-slate-900 placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Footer email <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={footerEmail}
                  onChange={(e) => setFooterEmail(e.target.value)}
                  placeholder="info@yoursite.com"
                  className="h-10 bg-white border-slate-300 pl-9 text-slate-900 placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-700">
                Theme proof points <span className="font-normal text-slate-400">(from the confirmed post)</span>
              </label>
              {postDerivedFeatureLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setBenefitsTouched(false);
                    setBenefitsText(postDerivedFeatureLines.join('\n'));
                  }}
                  className="text-[10px] font-semibold text-sky-600 hover:text-sky-800"
                >
                  Reset from post
                </button>
              )}
            </div>
            <Textarea
              value={benefitsText}
              onChange={(e) => {
                setBenefitsTouched(true);
                setBenefitsText(e.target.value);
              }}
              rows={3}
              placeholder={
                postDerivedFeatureLines.length > 0
                  ? postDerivedFeatureLines.slice(0, 3).join('\n')
                  : 'Proof point from the confirmed post\nSecond proof point\nThird proof point'
              }
              className="resize-none bg-slate-50 border-slate-300 text-sm text-slate-900 placeholder:text-gray-400"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              One per line. Studio keeps these synced to the current confirmed post until you manually edit them.
            </p>
          </div>
        </Card>


        {/* Reference Image — Upload or URL */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm hover:border-indigo-300 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                <ImageIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Additional References</h3>
                <p className="text-[11px] text-gray-400">Upload your own image or fetch from a URL. Any selected image here becomes the hero visual automatically.</p>
              </div>
            </div>
          </div>

          {/* Upload your own reference image */}
          <button
            type="button"
            onClick={() => referenceImageInputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 py-4 text-center transition-all hover:border-indigo-400 hover:bg-indigo-50"
          >
            <Upload className="mx-auto mb-1 h-5 w-5 text-indigo-500" />
            <p className="text-sm font-medium text-indigo-700">Upload reference image</p>
            <p className="text-[10px] text-indigo-400">PNG, JPG, or WebP — up to 10MB</p>
          </button>

          {/* Or fetch from URL */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">or from URL</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchSiteImages()}
                placeholder="https://example.com"
                className="text-sm h-9 pl-8 bg-white border-slate-300 text-slate-900 placeholder:text-gray-400"
              />
            </div>
            <Button
              size="sm"
              onClick={handleFetchSiteImages}
              disabled={isFetchingSiteImages || !siteUrl.trim()}
              className="h-9 px-4 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {isFetchingSiteImages ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                'Fetch'
              )}
            </Button>
          </div>

          {fetchedSiteImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-700 font-semibold">
                {fetchedSiteImages.length} image{fetchedSiteImages.length !== 1 ? 's' : ''} found — click to select as reference
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {fetchedSiteImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setReferenceSelectionTouched(true);
                      setSelectedReferenceImage(
                        selectedReferenceImage === img.url ? null : img.url
                      );
                    }}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selectedReferenceImage === img.url
                        ? 'border-indigo-50 ring-2 ring-indigo-300'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={`Site image ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {selectedReferenceImage === img.url && (
                      <div className="absolute inset-0 bg-indigo-50/20 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-white drop-shadow-md" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedReferenceImage && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <img
                src={selectedPdfImage?.signed_url || selectedSiteImage?.url || selectedReferenceImage}
                alt="Selected reference"
                className="w-10 h-10 rounded object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-900">
                  {selectedReferenceSummary?.title || (selectedPdfImage ? 'PDF reference selected' : 'Reference image selected')}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {selectedReferenceSummary?.detail || selectedPdfImage?.title || selectedReferenceImage}
                </p>
                <p className="mt-0.5 text-[10px] text-indigo-600">
                  This image is currently driving the hero area.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setReferenceSelectionTouched(true);
                  setSelectedReferenceImage(null);
                }}
                className="h-6 w-6 p-0 text-gray-500 hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </Card>

        {/* ── Brand PDF Images ── */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm hover:border-emerald-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-900">
                    PDF Visual Library
                    {effectivePdfImages.length > 0 && (
                      <span className="ml-1.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                        {effectivePdfImages.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-gray-400">Images auto-extracted from your uploaded PDFs — select one as a visual reference for AI generation</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onUploadPdfFiles && (
                  <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
                    {isUploadingPdfImages ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {isUploadingPdfImages ? 'Uploading...' : 'Upload PDF'}
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          await handlePdfUploadSelection(Array.from(files));
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                )}
                {onRefreshEvidence && (
                  <button
                    type="button"
                    onClick={onRefreshEvidence}
                    className="text-[10px] text-slate-400 hover:text-emerald-600 font-medium flex items-center gap-1 transition-colors"
                    title="Refresh PDF images"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                )}
                {selectedPdfImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setReferenceSelectionTouched(true);
                      setSelectedReferenceImage(null);
                    }}
                    className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {selectedPdfs.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-emerald-900">
                      Selected PDFs for this post
                    </p>
                    <p className="mt-1 text-[10px] text-emerald-700">
                      {selectedPdfs.length} selected PDF{selectedPdfs.length === 1 ? '' : 's'} •{' '}
                      {selectedPdfVisualCount} extracted visual
                      {selectedPdfVisualCount === 1 ? '' : 's'} ready in scope
                    </p>
                  </div>
                  {reextractableSelectedPdfIds.length > 0 && onReextractPdfs && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleReextractSelectedPdfs}
                      disabled={isReextractingPdfImages || isUploadingPdfImages}
                      className="h-8 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                    >
                      {isReextractingPdfImages ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          Extract Missing
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  {selectedPdfs.map((pdf) => {
                    const missingVisuals = pdf.extractedCount <= 0;
                    const reextractingThisPdf =
                      pdfLibraryActionState?.kind === 'reextract-pdf' &&
                      pdfLibraryActionState.targetId === pdf.id;

                    return (
                      <div
                        key={pdf.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-white/80 bg-white/80 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium text-slate-800">
                            {pdf.title}
                          </p>
                          <p
                            className={`mt-1 text-[10px] ${
                              missingVisuals ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {missingVisuals
                              ? pdf.canReextract
                                ? 'No visuals saved yet. Re-extract to populate the image panel.'
                                : 'No visuals saved yet. Re-upload this PDF because the stored file is unavailable.'
                              : `${pdf.extractedCount} extracted visual${pdf.extractedCount === 1 ? '' : 's'} ready.`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {pdf.canReextract && onReextractPdfs && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleReextractSinglePdf(pdf.id)}
                              disabled={isUploadingPdfImages || Boolean(pdfLibraryActionState)}
                              className="h-7 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                            >
                              {reextractingThisPdf ? (
                                <>
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  Redo
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                  Redo
                                </>
                              )}
                            </Button>
                          )}
                          <Badge
                            className={
                              missingVisuals
                                ? 'border border-amber-200 bg-amber-100 text-amber-800'
                                : 'border border-emerald-200 bg-emerald-100 text-emerald-800'
                            }
                          >
                            {missingVisuals ? 'Needs visuals' : `${pdf.extractedCount} ready`}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(isUploadingPdfImages || isReextractingPdfImages || pdfLibraryActionState) && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {isUploadingPdfImages
                    ? 'Uploading PDFs and extracting visuals...'
                    : isReextractingPdfImages
                      ? 'Re-extracting visuals from selected PDFs...'
                      : pdfLibraryActionState?.kind === 'delete-image'
                        ? 'Removing extracted image from the library...'
                        : 'Refreshing extracted visuals from the source PDF...'}
                </span>
              </div>
            )}

            {isLoadingPdf ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning PDFs for images...
              </div>
            ) : effectivePdfImages.length > 0 ? (
              <>
                {previewedPdfImage && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Large Preview
                        </p>
                        <p className="mt-1 truncate text-xs font-medium text-slate-800">
                          {previewedPdfImage.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {selectedReferenceImage === previewedPdfImage.signed_url && (
                          <Badge className="bg-emerald-600/90 text-white text-[9px]">
                            Hero
                          </Badge>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPreviewedPdfImageId(previewedPdfImage.id);
                            toggleReferenceSelection(previewedPdfImage.signed_url);
                          }}
                          className="h-7 px-2 text-[10px]"
                        >
                          {selectedReferenceImage === previewedPdfImage.signed_url
                            ? 'Deselect hero'
                            : 'Use as hero'}
                        </Button>
                      </div>
                    </div>
                    <div className={`overflow-hidden rounded-lg border border-slate-200 ${isPdfPageLike(previewedPdfImage) ? 'bg-white' : 'bg-slate-50'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewedPdfImage.signed_url}
                        alt={previewedPdfImage.title}
                        className={`w-full ${isPdfPageLike(previewedPdfImage) ? 'h-64 object-contain object-top p-2' : 'h-64 object-contain p-4'}`}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge className="border border-slate-200 bg-white text-[9px] text-slate-700">
                        {getPdfImageMetaLabel(previewedPdfImage).kindLabel}
                      </Badge>
                      {getPdfImageMetaLabel(previewedPdfImage).sizeLabel && (
                        <Badge className="border border-slate-200 bg-white text-[9px] text-slate-600">
                          {getPdfImageMetaLabel(previewedPdfImage).sizeLabel}
                        </Badge>
                      )}
                      {isPdfPageLike(previewedPdfImage) && (
                        <span className="text-[10px] text-amber-700">
                          Page renders are usually weaker hero visuals than extracted product images.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Grid thumbnail view */}
                <div className="grid grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {effectivePdfImages.map((img, index) => {
                    const selected = selectedReferenceImage === img.signed_url;
                    const inPrompt = normalizedPrompt.includes(normalizeReferenceText(img.title));
                    const displayTitle = getPdfImageDisplayTitle(img.title);
                    const imageMeta = getPdfImageMetaLabel(img);
                    const isDefaultHero = !referenceSelectionTouched && index === 0;
                    const deletingThisImage =
                      pdfLibraryActionState?.kind === 'delete-image' &&
                      pdfLibraryActionState.targetId === img.id;
                    const reextractingSourcePdf =
                      pdfLibraryActionState?.kind === 'reextract-pdf' &&
                      Boolean(img.sourceEvidenceId) &&
                      pdfLibraryActionState.targetId === img.sourceEvidenceId;
                    const tileActionBusy = deletingThisImage || reextractingSourcePdf;

                    return (
                      <div
                        key={img.id}
                        onMouseEnter={() => setPreviewedPdfImageId(img.id)}
                        className={`group relative rounded-xl border-2 transition-all overflow-hidden ${
                          selected
                            ? 'border-emerald-400 ring-2 ring-emerald-200 shadow-md'
                            : 'border-slate-200 hover:border-emerald-300 hover:shadow-sm'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewedPdfImageId(img.id);
                            toggleReferenceSelection(img.signed_url);
                          }}
                          title={`${selected ? 'Deselect' : 'Select'}: ${img.title}`}
                          className="w-full text-left"
                          onFocus={() => setPreviewedPdfImageId(img.id)}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.signed_url}
                              alt={img.title}
                              className={`h-full w-full transition-transform group-hover:scale-[1.03] object-contain ${isPdfPageLike(img) ? 'object-top p-1.5' : 'p-2'}`}
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent && !parent.querySelector('.img-error-msg')) {
                                  const errorDiv = document.createElement('div');
                                  errorDiv.className = 'img-error-msg absolute inset-0 flex flex-col items-center justify-center p-2 text-center';
                                  errorDiv.innerHTML = '<svg class="w-5 h-5 text-slate-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><span class="text-[8px] text-slate-400">Failed to load</span>';
                                  parent.appendChild(errorDiv);
                                }
                              }}
                            />
                            {selected && (
                              <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/30 backdrop-blur-[1px]">
                                <CheckCircle2 className="h-6 w-6 text-white drop-shadow-lg" />
                              </div>
                            )}
                            {isDefaultHero && !selected && (
                              <div className="absolute top-1 left-1">
                                <Badge className="bg-emerald-600/85 text-white text-[8px] px-1 py-0">
                                  Auto hero
                                </Badge>
                              </div>
                            )}
                            {inPrompt && !selected && (
                              <div className="absolute top-1 right-1">
                                <Badge className="bg-slate-800/70 text-white text-[8px] px-1 py-0">
                                  In prompt
                                </Badge>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1">
                              <Badge className={`text-[8px] px-1 py-0 ${isPdfPageLike(img) ? 'bg-amber-100 text-amber-800' : 'bg-white/90 text-slate-700'}`}>
                                {imageMeta.kindLabel}
                              </Badge>
                            </div>
                            {tileActionBusy && (
                              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]">
                                <div className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {deletingThisImage ? 'Deleting...' : 'Redoing...'}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="p-1.5">
                            <p className="truncate text-[10px] font-medium text-slate-700">
                              {displayTitle.primary}
                            </p>
                            {imageMeta.sizeLabel && (
                              <p className="truncate text-[9px] text-slate-400">
                                {imageMeta.sizeLabel}
                              </p>
                            )}
                            {displayTitle.secondary && (
                              <p className="truncate text-[9px] text-slate-400">
                                {displayTitle.secondary}
                              </p>
                            )}
                          </div>
                        </button>
                        <div className="grid grid-cols-4 gap-1 border-t border-slate-100 bg-white p-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setPreviewedPdfImageId(img.id)}
                            disabled={Boolean(pdfLibraryActionState)}
                            className="h-6 px-1 text-[10px]"
                            title="Preview this image"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={inPrompt ? 'secondary' : 'outline'}
                            onClick={() => insertPdfImageIntoPrompt(img)}
                            disabled={Boolean(pdfLibraryActionState)}
                            className="h-6 px-1 text-[10px]"
                          >
                            {inPrompt ? '✓ In prompt' : '+ Add to prompt'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              img.sourceEvidenceId
                                ? void handleReextractSinglePdf(img.sourceEvidenceId)
                                : undefined
                            }
                            disabled={
                              !img.sourceEvidenceId ||
                              !onReextractPdfs ||
                              isUploadingPdfImages ||
                              Boolean(pdfLibraryActionState)
                            }
                            className="h-6 px-1 text-[10px]"
                          >
                            {reextractingSourcePdf ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Redo'
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDeletePdfImage(img)}
                            disabled={!onDeleteEvidenceIds || Boolean(pdfLibraryActionState)}
                            className="h-6 px-1 text-[10px] text-red-600 hover:text-red-700"
                          >
                            {deletingThisImage ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400">
                  Click an image to make it the hero source. Use the tile actions to
                  add it to the prompt, redo extraction from its source PDF, or remove
                  that extracted visual.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2.5 py-5 text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-50 to-slate-50 flex items-center justify-center border border-slate-200/60">
                  <ImageIcon className="w-5 h-5 text-slate-300" />
                </div>
                <p className="text-xs font-medium text-gray-500">
                  {selectedPdfs.length > 0 ? 'Selected PDFs have no visuals yet' : 'No PDF images found'}
                </p>
                <p className="text-[10px] text-gray-400 max-w-[250px]">
                  {selectedPdfs.length > 0
                    ? 'Extract visuals for the selected PDFs, or upload a new PDF. Once extraction finishes, those images will appear here automatically.'
                    : 'Upload a brand PDF — images will be auto-extracted and appear here for use as visual references.'}
                </p>
                {reextractableSelectedPdfIds.length > 0 && onReextractPdfs && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReextractSelectedPdfs}
                    disabled={isReextractingPdfImages || isUploadingPdfImages}
                    className="h-9 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                  >
                    {isReextractingPdfImages ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Extracting visuals...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Extract visuals from selected PDFs
                      </>
                    )}
                  </Button>
                )}
                {onUploadPdfFiles && (
                  <label className="mt-1 cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
                    {isUploadingPdfImages ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {isUploadingPdfImages ? 'Uploading...' : 'Upload PDF'}
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          await handlePdfUploadSelection(Array.from(files));
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 2. Your Vision / Creative Prompt Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* Your Vision */}
        <Card className={`p-3.5 space-y-2.5 bg-white border shadow-sm ${isAiGuidedTheme ? 'border-violet-300 bg-violet-50/30' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-violet-500" />
            <h3 className="font-semibold text-sm text-slate-900">
              {isAiGuidedTheme ? 'Your Vision' : 'Creative Notes'} <span className="text-[10px] font-normal text-gray-400">(optional)</span>
            </h3>
            {isAiGuidedTheme && (
              <Badge className="border border-violet-200 bg-violet-100 text-violet-700 text-[9px]">
                Primary driver for AI Guided
              </Badge>
            )}
          </div>
          {isAiGuidedTheme && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                AI Guided Mode
              </p>
              <p className="mt-1 text-xs leading-5 text-violet-900">
                This theme is fully AI-composed. Describe the scene, subject, framing, lighting, hierarchy, and must-show details here.
              </p>
            </div>
          )}
          {confirmedPostImageBrief && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
                Post Generator Visual Brief
              </p>
              <p className="mt-1 text-xs leading-5 text-indigo-900">{confirmedPostImageBrief}</p>
              <p className="mt-1 text-[10px] text-indigo-700">
                This comes directly from the post generator. Your vision below refines it.
              </p>
            </div>
          )}
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={activeTheme.promptHint || 'Describe the image you want.'}
            rows={isAiGuidedTheme ? 5 : 3}
            className="text-sm resize-none bg-slate-50 border-slate-300 text-slate-900 placeholder:text-gray-400"
          />

          {/* Auto-suggest: use PDF image detected in prompt */}
          {promptMatchedPdfImage && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <p className="text-[11px] text-emerald-800 flex-1 min-w-0">
                <span className="font-semibold">Detected PDF image:</span>{' '}
                <span className="truncate">&ldquo;{promptMatchedPdfImage.title}&rdquo;</span>
              </p>
              <button
                type="button"
                onClick={() => toggleReferenceSelection(promptMatchedPdfImage.signed_url)}
                className="flex-shrink-0 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Use it
              </button>
              <button
                type="button"
                onClick={() => insertPdfImageIntoPrompt(promptMatchedPdfImage)}
                className="flex-shrink-0 rounded-md border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                Add to prompt
              </button>
              <button
                type="button"
                onClick={() =>
                  setDismissedPdfSuggestions((prev) => new Set([...prev, promptMatchedPdfImage.id]))
                }
                aria-label="Dismiss suggestion"
                className="text-emerald-400 hover:text-emerald-700"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <p className="text-[10px] text-gray-400">
            {isAiGuidedTheme
              ? 'Be explicit: subject, camera angle, environment, composition, lighting, text treatment, and any must-show product or logo details.'
              : 'Be specific: mention subject, setting, layout, mood, and key visual elements. Reference a PDF image by name to auto-select it above.'}
          </p>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 3. Text / Wording Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* Text on Image */}
        <Card className="p-3.5 space-y-2.5 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-cyan-500" />
            <h3 className="font-semibold text-sm text-slate-900">Text on Image</h3>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-slate-700 block">
                  Headline <span className="text-red-500">*</span>
                </label>
                {hasPostContext && (
                  <button
                    type="button"
                    onClick={() => {
                      if (usePostHeadline) {
                        setUsePostHeadline(false);
                        setHeadline(syncedHeadlineFromPost);
                        return;
                      }
                      setHeadline(syncedHeadlineFromPost);
                      setUsePostHeadline(true);
                    }}
                    className="text-[10px] font-semibold text-cyan-700 hover:text-cyan-900"
                  >
                    {usePostHeadline ? 'Edit manually' : 'Use post headline'}
                  </button>
                )}
              </div>
              <Input
                value={headlineInputValue}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. 5 AI Tips for LinkedIn Growth"
                readOnly={usePostHeadline}
                className={`font-semibold text-sm h-10 border-slate-300 text-slate-900 placeholder:text-gray-400 ${
                  usePostHeadline ? 'bg-slate-50' : 'bg-white'
                }`}
                maxLength={80}
              />
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-400">
                  {usePostHeadline
                    ? 'Synced directly from the confirmed post headline.'
                    : 'Manual image headline override.'}
                </p>
                <p className="text-[11px] text-gray-400">{headlineInputValue.length}/80</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Tagline <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Boost your engagement by 10x"
                className="text-sm h-10 bg-white border-slate-300 text-slate-900 placeholder:text-gray-400"
                maxLength={120}
              />
            </div>
          </div>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 6. Image Size Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* Image Size */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Image Size</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'landscape' as const, label: 'Landscape', ratio: '1200x628' },
              { id: 'square' as const, label: 'Square', ratio: '1080x1080' },
              { id: 'portrait' as const, label: 'Portrait', ratio: '1080x1350' },
            ].map((size) => (
              <button
                key={size.id}
                onClick={() => setImageAspect(size.id)}
                className={`px-2 py-2 rounded-lg border text-center transition-all text-xs ${
                  imageAspect === size.id
                    ? 'border-purple-300 bg-purple-50 ring-1 ring-purple-200 text-purple-700'
                    : 'border-slate-200 bg-white hover:border-purple-200 text-slate-600'
                }`}
              >
                <p className="font-semibold text-[11px]">{size.label}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{size.ratio}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Brand Colors Preview Ã¢â€â‚¬Ã¢â€â‚¬ */}
        </div>
        {/* ── Sticky Generate Footer ── */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-slate-50/50 pt-3 pb-1 px-1 space-y-2 rounded-b-xl">

        {/* Compact palette strip in footer */}
        {normalizedBrandColors.length > 0 && (
          <div
            className="h-2 rounded-full overflow-hidden ring-1 ring-slate-200/60"
            style={{
              backgroundImage: `linear-gradient(90deg, ${derivedThemePalette.bgStart} 0%, ${derivedThemePalette.bgEnd} 40%, ${derivedThemePalette.accent} 70%, ${derivedThemePalette.support} 100%)`,
            }}
          />
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Generate Button Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* ── Image Count Selector ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-purple-500" />
            <p className="text-[11px] font-semibold text-slate-700 truncate">
              {activeTheme.label} &middot; {imageAspect}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setBatchSize(n)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                  batchSize === n
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white text-slate-400 border border-slate-200 hover:border-purple-300 hover:text-purple-500'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Post</p>
              <p className={`mt-1 text-[11px] font-medium ${hasPostContext ? 'text-emerald-700' : 'text-amber-700'}`}>
                {hasPostContext ? 'Ready' : 'Needs confirmation'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                {isAiGuidedTheme ? 'Your Vision' : 'Hero Visual'}
              </p>
              <p
                className={`mt-1 text-[11px] font-medium ${
                  isAiGuidedTheme
                    ? customPrompt.trim()
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                    : !themeUsesHeroReference || selectedReferenceImage
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                }`}
              >
                {isAiGuidedTheme
                  ? customPrompt.trim()
                    ? 'Ready'
                    : 'Add details'
                  : !themeUsesHeroReference
                    ? 'Template-managed'
                    : selectedReferenceImage
                      ? selectedReferenceSummary?.badge || 'Selected'
                      : 'Choose one'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                {isAiGuidedTheme ? 'References' : 'PDF Visuals'}
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-700">
                {isAiGuidedTheme
                  ? selectedReferenceImage
                    ? selectedReferenceSummary?.badge || 'Selected'
                    : `${effectivePdfImages.length} ready`
                  : `${effectivePdfImages.length} ready`}
              </p>
            </div>
          </div>
          {generationBlockedReason && (
            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{generationBlockedReason}</span>
            </div>
          )}
        </div>

        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={!canGenerateImage}
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 hover:from-purple-700 hover:via-fuchsia-600 hover:to-pink-600 shadow-lg shadow-purple-200/40 hover:shadow-xl hover:shadow-purple-300/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-xl ring-1 ring-purple-500/20"
        >
          {isGenerating || isApplyingBlend ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {isApplyingBlend ? 'Applying blend mode...' : `Generating ${batchSize > 1 ? `${batchSize} images` : 'your image'}...`}
            </>
          ) : generatedImages.length > 0 ? (
            <>
              <RefreshCw className="w-5 h-5 mr-2" />
              Regenerate {batchSize > 1 ? `${batchSize} Images` : 'Image'} — {activeTheme.label}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate {batchSize > 1 ? `${batchSize} Images` : 'Image'} — {activeTheme.label}
            </>
          )}
        </Button>

        {generationCount > 0 && (
          <p className="text-center text-xs text-gray-400 font-medium">
            {generationCount} image{generationCount > 1 ? 's' : ''} generated this session
          </p>
        )}
        </div>
      </div>

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â RIGHT: Preview / Gallery Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <div className="space-y-4">
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Main Preview Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="overflow-hidden border border-slate-200/60 bg-white shadow-xl shadow-slate-200/50 rounded-2xl">
          {/* Preview header bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-slate-50 via-white to-purple-50/40 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Preview</span>
              <Badge className="bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200/60 text-[9px] font-semibold">
                {activeTheme.label}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              {currentTone && (
                <Badge className="bg-white text-slate-500 border border-slate-200 text-[9px]">
                  {currentTone.emoji} {currentTone.label}
                </Badge>
              )}
              <Badge className="bg-white text-slate-500 border border-slate-200 text-[9px] capitalize">
                {imageAspect}
              </Badge>
            </div>
          </div>
          {isGenerating || isApplyingBlend ? (
            <div className="min-h-[340px] flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 py-12">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-[3px] border-purple-500/30 border-t-purple-400 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center backdrop-blur-sm">
                    <Sparkles className="w-5 h-5 text-purple-300 animate-pulse" />
                  </div>
                </div>
              </div>
              <p className="mt-6 text-base font-semibold text-white">
                {isApplyingBlend ? 'Applying blend mode...' : batchSize > 1 ? `Creating ${batchSize} ${activeTheme.label} images...` : `Creating your ${activeTheme.label} image...`}
              </p>
              <p className="text-sm text-purple-300/70 mt-1">{batchSize > 1 ? `Usually takes ${batchSize * 15}–${batchSize * 25} seconds` : 'Usually takes 10–20 seconds'}</p>

              <div className="mt-5 flex items-center gap-3 text-xs text-purple-400/80">
                <span className="flex items-center gap-1.5 rounded-full bg-purple-500/20 px-2.5 py-1">
                  <Zap className="w-3 h-3" /> AI Image
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-purple-500/15 px-2.5 py-1">
                  {currentTone?.emoji} {currentTone?.label}
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-purple-500/15 px-2.5 py-1">
                  {currentStyle?.emoji} {currentStyle?.label}
                </span>
              </div>
            </div>
          ) : selectedImage !== null && generatedImages[selectedImage] ? (
            <div className="relative group">
              {/* Full-size image display — no aspect ratio constraint so the image shows completely */}
              <div className="relative w-full bg-[#f8f8f8] flex items-center justify-center" style={{ backgroundImage: 'linear-gradient(45deg, #e8e8e8 25%, transparent 25%), linear-gradient(-45deg, #e8e8e8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8e8e8 75%), linear-gradient(-45deg, transparent 75%, #e8e8e8 75%)', backgroundSize: '12px 12px', backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px' }}>
                <img
                  src={generatedImages[selectedImage]}
                  alt="Generated LinkedIn image"
                  className="w-full h-auto block"
                />
              </div>
              {/* Hover overlay with actions */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="absolute top-3 left-3 pointer-events-auto">
                  <Badge className="bg-emerald-500/90 text-white text-[10px] backdrop-blur-sm shadow-lg">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Image #{(selectedImage ?? 0) + 1}
                  </Badge>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pointer-events-auto">
                  <div className="flex items-end justify-between">
                    <div className="text-white text-sm min-w-0 flex-1 mr-3">
                      <p className="font-semibold text-sm truncate">{activeHeadlineText || 'Your LinkedIn Image'}</p>
                      {tagline && <p className="text-white/60 text-xs mt-0.5 truncate">{tagline}</p>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <a
                        href={generatedImages[selectedImage]}
                        download={`linkedin-image-${Date.now()}.png`}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors shadow-lg"
                        title="Download image"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <Button
                        size="sm"
                        className="bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 border-0 h-9 px-3.5 text-xs shadow-lg"
                        onClick={handleGenerate}
                        disabled={isGenerating || isApplyingBlend}
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Regenerate
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ThemePreviewLarge
              themeId={selectedThemeId}
              previewAspectClass={previewAspectClass}
              uploadedLogo={uploadedLogo || primaryBrandLogoUrl}
              brandColors={normalizedBrandColors}
              allianceHeaderLogos={allianceHeaderLogos}
              brandName={brandName}
              partnerName={partnerName}
              partnerTagline={partnerTagline}
              activeHeadlineText={activeHeadlineText}
              activeTaglineText={activeTaglineText}
              featureLines={previewFeatureLines}
              footerWebsite={footerWebsite}
              footerEmail={footerEmail}
              selectedReferenceImage={selectedReferenceImage}
              hasPostContext={hasPostContext}
              slotAssignments={resolvedNonHeroSlotAssignments}
              customPrompt={customPrompt}
              selectedToneLabel={currentTone?.label}
              selectedStyleLabel={currentStyle?.label}
            />
          )}
        </Card>

        {latestBlendPreview && (
          <Card className="p-3 border border-sky-200/70 bg-sky-50/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-sky-800">Blend comparison</p>
              <Badge className="bg-sky-100 text-sky-700 border border-sky-200 text-[10px]">
                {BLEND_MODE_OPTIONS.find((mode) => mode.id === latestBlendPreview.mode)?.label || 'Blend'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Raw AI</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={latestBlendPreview.rawUrl}
                  alt="Raw AI output"
                  className="w-full h-24 rounded-md object-cover border border-slate-200 bg-white"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Blended</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={latestBlendPreview.blendedUrl}
                  alt="Blended output"
                  className="w-full h-24 rounded-md object-cover border border-sky-200 bg-gray-50"
                />
              </div>
            </div>
          </Card>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Previous Generations Thumbnails Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {generatedImages.length > 1 && (
          <Card className="p-3 border border-slate-200/60 bg-white rounded-xl shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Eye className="w-3 h-3" />
              All Generations ({generatedImages.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {generatedImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-[4/3] ${
                    selectedImage === idx
                      ? 'border-purple-400 shadow-lg shadow-purple-200/50 ring-2 ring-purple-300/40 scale-[1.02]'
                      : 'border-slate-200 hover:border-purple-300 hover:shadow-md'
                  }`}
                >
                  <img
                    src={img}
                    alt={`Generation ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {selectedImage === idx && (
                    <div className="absolute inset-0 bg-purple-600/15 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-purple-500 drop-shadow-lg" />
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm">
                    #{idx + 1}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Confirm & Continue Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {selectedImage !== null && generatedImages[selectedImage] && (
          <Button
            size="lg"
            onClick={handleConfirm}
            className="w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-lg shadow-emerald-200/40 hover:shadow-xl hover:shadow-emerald-300/40 transition-all rounded-xl ring-1 ring-emerald-500/20"
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            Confirm & Continue
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Tips Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {generatedImages.length === 0 && !isGenerating && !isApplyingBlend && (
          <Card className="p-4 bg-gradient-to-br from-purple-50 via-fuchsia-50/60 to-pink-50/40 border border-purple-200/50 shadow-sm rounded-xl">
            <h4 className="font-bold text-[10px] text-purple-700 mb-3 flex items-center gap-1.5 uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" />
              Tips for great images
            </h4>
            <ul className="space-y-2 text-xs text-purple-800">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-purple-200/60 text-[8px] font-bold text-purple-600">1</span>
                <span>Keep headlines short and punchy — 3 to 8 words work best</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-purple-200/60 text-[8px] font-bold text-purple-600">2</span>
                <span>Upload your logo for consistent brand presence</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-purple-200/60 text-[8px] font-bold text-purple-600">3</span>
                <span>Try <strong>Bold</strong> for announcements, <strong>Minimal</strong> for thought leadership</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-purple-200/60 text-[8px] font-bold text-purple-600">4</span>
                <span>Generate multiple variations and pick the best one</span>
              </li>
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
