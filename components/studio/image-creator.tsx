'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { getThemeSlots } from '@/lib/studio/theme-slots';
import { deriveStudioPalette } from '@/lib/studio/theme-palette';
import { resolveClientScene } from '@/lib/studio/industry-scenes';
import { buildVoxaPreflight } from '@/lib/studio/voxa-prompt-spec';

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
  industry?: string | null;
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
  /** Called whenever a new image is generated â€” auto-syncs URL to parent without navigating */
  onImageGenerated?: (imageUrl: string) => void;
  /** Called when user edits brand colors manually */
  onBrandColorsChange?: (colors: string[]) => void;
  /** Pre-loaded PDF-extracted images from the parent's evidence state. When supplied the
   *  internal fetch is skipped â€” images stay in sync whenever evidence changes. */
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
    .replace(/[\u2022\u00B7â€¢]/g, ' ')
    .replace(/[âœ“âœ”âœ…â˜‘]/g, ' ')
    .replace(/[ðŸ‘‰âžœâž¤âž¡]/g, ' ')
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
    sizeLabel: sizeHint ? `${sizeHint.width}Ã—${sizeHint.height}` : null,
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

type VisionComponentKey =
  | 'heroImage'
  | 'header'
  | 'footer'
  | 'body'
  | 'logo'
  | 'palette'
  | 'overlay';

type VisionComponentOption = {
  id: string;
  label: string;
  summary: string;
  details: string[];
  autoText: string;
  apply?: {
    paletteColors?: string[];
    logoPlacement?: 'overlay' | 'infuse' | 'none';
  };
};

type VisionComponentEntry = {
  key: VisionComponentKey;
  label: string;
  option: VisionComponentOption;
  accepted: boolean;
  overrideText: string;
  resolvedText: string;
};

type GeneratedArtifactMeta = {
  baseUrl: string;
  finalUrl: string;
  rationale: string;
  revisionTarget?: VisionComponentKey | null;
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
    label: 'Minimal / Clean',
    category: 'General',
    description: 'Whitespace-led premium brand visual with minimal chrome and one clear focal point.',
    summary: 'Best for premium thought leadership, restrained product moments, and clean editorial layouts.',
    promptHint:
      'Describe the single main message and any whitespace, restraint, or premium editorial cues the composition must preserve.',
    recommendedTone: 'minimal',
    recommendedStyle: 'text-overlay',
    recommendedLogoPlacement: 'infuse',
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
    recommendedLogoPlacement: 'infuse',
  },
  {
    id: 'datasheet-frame',
    label: 'Technical / Data',
    category: 'Technical',
    description: 'Structured technical layout for product specs, diagrams, proof blocks, and engineering clarity.',
    summary: 'Best when the output should feel like a modern technical sell-sheet rather than a generic ad visual.',
    promptHint:
      'Describe the product, key specifications, technical proof points, and whether the result should feel like a datasheet, diagram, or brochure cover.',
    recommendedTone: 'tech',
    recommendedStyle: 'infographic',
    recommendedLogoPlacement: 'infuse',
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
    recommendedLogoPlacement: 'infuse',
  },
  {
    id: 'launch-banner',
    label: 'Bold Announcement',
    category: 'Campaign',
    description: 'High-contrast announcement theme where typography is the hero and the visual supports the reveal.',
    summary: 'Best for launches, major announcements, event reveals, and scroll-stopping campaign moments.',
    promptHint:
      'Describe what is being announced, who it is for, and whether the reveal should feel urgent, premium, or high-energy.',
    recommendedTone: 'bold',
    recommendedStyle: 'text-overlay',
    recommendedLogoPlacement: 'infuse',
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
    recommendedLogoPlacement: 'infuse',
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
    recommendedLogoPlacement: 'infuse',
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
    recommendedLogoPlacement: 'infuse',
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
    recommendedLogoPlacement: 'infuse',
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
    recommendedLogoPlacement: 'infuse',
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
    recommendedLogoPlacement: 'infuse',
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

function getThemeRecommendedLogoPlacement(themeId: ThemeId) {
  return (
    THEME_OPTIONS.find((theme) => theme.id === themeId)?.recommendedLogoPlacement ||
    'overlay'
  );
}

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
  landscape: { width: 1536, height: 1024 },
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
};

const VISION_COMPONENT_ORDER: VisionComponentKey[] = [
  'heroImage',
  'header',
  'footer',
  'body',
  'logo',
  'palette',
  'overlay',
];

const VISION_COMPONENT_LABELS: Record<VisionComponentKey, string> = {
  heroImage: 'Hero Image',
  header: 'Header',
  footer: 'Footer',
  body: 'Bullet / Body Style',
  logo: 'Logo Zone',
  palette: 'Color Palette',
  overlay: 'Overlay',
};

function createVisionAcceptedState(defaultValue = false) {
  return VISION_COMPONENT_ORDER.reduce((acc, key) => {
    acc[key] = defaultValue;
    return acc;
  }, {} as Record<VisionComponentKey, boolean>);
}

function createVisionOverrideState() {
  return VISION_COMPONENT_ORDER.reduce((acc, key) => {
    acc[key] = '';
    return acc;
  }, {} as Record<VisionComponentKey, string>);
}

function getNextVisionOptionId(options: VisionComponentOption[], currentId?: string | null) {
  if (options.length === 0) return null;
  const currentIndex = options.findIndex((option) => option.id === currentId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0;
  return options[nextIndex]?.id || options[0].id;
}

function buildVisionBriefBlock(entries: VisionComponentEntry[], revisionTarget?: VisionComponentKey | null) {
  const resolvedEntries = entries.filter((entry) => entry.resolvedText.trim());
  const approvedEntries = resolvedEntries.filter((entry) => entry.accepted);
  const workingEntries = resolvedEntries.filter((entry) => !entry.accepted);
  const activeEntries = [...approvedEntries, ...workingEntries];

  const revisionLine = revisionTarget
    ? `REVISION PRIORITY: Keep every other approved component stable. Rework only the ${VISION_COMPONENT_LABELS[revisionTarget].toLowerCase()} unless a small supporting adjustment is required for coherence.`
    : '';

  return [
    'MY VISION BRIEF:',
    ...activeEntries.map((entry, index) => {
      const status = entry.accepted ? 'APPROVED' : 'WORKING';
      return `${index + 1}. ${status} ${entry.label}: ${sanitizeVisualText(entry.resolvedText, 180)}`;
    }),
    '',
    'AI ENHANCEMENT PASS (MANDATORY):',
    'You are an expert graphic designer. Based on the user selections below, produce a pixel-perfect, print-ready composition.',
    '1. Logo infusion: do not drop the logo on top. Blend its colors, shape, spacing, and shadow language into the layout so it feels native.',
    '2. Overlay correction: if the hero background is busy or high-contrast, calculate a brand-matched overlay that preserves image personality while keeping text readable.',
    '3. Header/footer coherence: make both feel like one design system with matched alignment rhythm, weight, and color temperature.',
    '4. Image optimization: crop to the focal point and tune brightness, contrast, and saturation so the hero supports the copy instead of competing with it.',
    '5. Typography hierarchy: enforce deliberate vertical rhythm between headline, supporting text, bullets, and footer details.',
    '6. Final output: return the enhanced composition with a short rationale explaining what was adjusted and why.',
    revisionLine,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1800);
}

function buildEnhancementRationale(args: {
  themeLabel: string;
  entries: VisionComponentEntry[];
  revisionTarget?: VisionComponentKey | null;
}) {
  const byKey = Object.fromEntries(
    args.entries.map((entry) => [entry.key, entry])
  ) as Record<VisionComponentKey, VisionComponentEntry>;

  const overlaySummary = byKey.overlay?.option.summary || 'brand-aware overlay logic';
  const logoSummary = byKey.logo?.option.summary || 'logo integration';
  const headerSummary = byKey.header?.option.summary || 'header hierarchy';
  const footerSummary = byKey.footer?.option.summary || 'footer coherence';
  const revisionSummary = args.revisionTarget
    ? ` This pass prioritized the ${VISION_COMPONENT_LABELS[args.revisionTarget].toLowerCase()}.`
    : '';

  return `${args.themeLabel} was enhanced by tightening ${headerSummary.toLowerCase()} with ${footerSummary.toLowerCase()}, using ${overlaySummary.toLowerCase()} to keep text readable, and treating ${logoSummary.toLowerCase()} as a native design input instead of a pasted overlay.${revisionSummary}`.slice(
    0,
    420
  );
}

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
      .replace(/^[â€¢âœ“âœ”]+\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["'â€œâ€]+|["'â€œâ€]+$/g, '');
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

function deriveIndustryBackdropHint(
  industryField: string | null | undefined,
  ...sources: Array<string | null | undefined>
) {
  return resolveClientScene(industryField, ...sources);
}

/**
 * Auto-compose a human-readable "Your Vision" paragraph from all available
 * brand, theme, and content data. The output goes directly into the textarea
 * so the user sees (and can edit) the creative brief before generating.
 */
function composeSmartVision(options: {
  industry?: string | null;
  businessFocus?: string | null;
  brandDescription?: string | null;
  targetAudience?: string | null;
  brandName?: string;
  productName?: string;
  tagline?: string | null;
  tone?: string | null;
  imageStyle?: string | null;
  themeLabel: string;
  themeLayoutHint: string;
  headline?: string;
  taglineText?: string;
  featureBullets?: string[];
  hasLogo: boolean;
  partnerName?: string;
  footerWebsite?: string;
  footerEmail?: string;
  brandColors?: string[];
  toneName?: string;
  styleName?: string;
  referenceDetail?: string;
}): string {
  const scene = resolveClientScene(
    options.industry,
    options.businessFocus,
    options.brandDescription
  );
  const toneStr = options.toneName || options.tone || 'professional';
  const styleStr = options.styleName || options.imageStyle || 'split-layout';
  const lines: string[] = [
    `Create a premium LinkedIn poster that feels bespoke, high-end, and custom-built for this client.`,
    scene,
    `Follow the ${options.themeLabel} composition blueprint: ${options.themeLayoutHint}`,
    `Use a ${toneStr} tone with ${styleStr} aesthetics, clean hierarchy, disciplined spacing, and no cheap template feel.`,
  ];

  if (options.headline) {
    lines.push(`Primary headline (DO NOT CHANGE THIS WORDING): "${options.headline.slice(0, 96)}".`);
  }

  if (options.taglineText) {
    lines.push(`Supporting tagline (DO NOT CHANGE THIS WORDING): "${options.taglineText.slice(0, 96)}".`);
  }

  if (options.referenceDetail) {
    lines.push(`Use the selected reference as the visual truth for the main hero subject and improve its staging, lighting, crop, and atmosphere instead of replacing it with a generic invented product.`);
  } else {
    lines.push(`Create a strong hero subject that feels specific to the client and chosen theme, not generic stock imagery.`);
  }

  if (options.hasLogo) {
    lines.push(`Place the selected main logo in a clean premium brand zone with strong readability.`);
  }

  if (options.partnerName) {
    lines.push(`Include partner branding for ${options.partnerName} in the header/brand area without crowding the composition.`);
  }

  if (options.featureBullets && options.featureBullets.length > 0) {
    lines.push(`Support these proof points with clean readable hierarchy: ${options.featureBullets.slice(0, 4).join('; ')}.`);
  }

  if (options.footerWebsite || options.footerEmail) {
    const footer = [options.footerWebsite, options.footerEmail].filter(Boolean).join(' | ');
    lines.push(`Keep a restrained footer lockup for ${footer} if it fits cleanly.`);
  }

  if (options.targetAudience) {
    lines.push(`The final look should feel credible and persuasive for ${options.targetAudience.slice(0, 120)}.`);
  }

  if (options.brandColors && options.brandColors.length > 0) {
    lines.push(`Stay inside the selected brand palette: ${options.brandColors.slice(0, 4).join(', ')}.`);
  }

  lines.push(`Build a rich client-specific background with depth, atmosphere, and polished lighting. Keep text-safe lanes calm and keep the final result clean at LinkedIn feed size.`);
  lines.push(`AVOID: generic gradients, blurred bokeh-only backgrounds, empty color washes, stock photography feel, fake UI mockups, crowded bullets, flat blue voids.`);

  let result = lines.join(' ');
  if (result.length > 1200) {
    result = `${result.slice(0, 1197)}...`;
  }
  return result;
}

function deriveThemeLayoutHint(themeId: ThemeId) {
  switch (themeId) {
    case 'alliance-poster':
      return 'Use a disciplined top brand band with the main logo on the left, the campaign headline centered, the partner lockup on the right, a left hero bay, a right proof lane, and a clean footer strip.';
    case 'industrial-campaign':
      return 'Use a premium industrial campaign structure with a restrained top brand band, a strong left-side product bay, a right-side headline and proof lane, and a footer that stays readable.';
    case 'clean-brand':
      return 'Keep the structure elegant and minimal: restrained brand zone at the top, narrative copy on the left, hero visual on the right, and a slim footer only if it stays clean.';
    case 'knowledge-visual':
      return 'Use a knowledge-led split with evidence or reference visuals on the left, a clear insight/message lane on the right, and clean brand/footer treatment.';
    case 'datasheet-frame':
      return 'Use a technical brochure-like structure with a disciplined brand zone, a strong product panel, and modular information lanes that feel engineered and tidy.';
    case 'proof-stack':
      return 'Use a structured proof-led layout with clear stacked evidence lanes and a separate narrative zone so the message reads fast and clean.';
    case 'product-hero':
      return 'Keep the product as the clear hero, give it premium staging, and reserve a calm brand zone instead of crowding the frame with labels.';
    case 'launch-banner':
      return 'Use a bold announcement structure: brand zone at the top, a dominant centered headline, a short tagline below it, a single CTA, and a footer â€” nothing else should compete with the headline.';
    case 'sector-collage':
      return 'Use a top header band with the brand lockup and centered headline, three equal image panels below with sector labels, and a clean footer strip.';
    case 'offer-card':
      return 'Use a left text zone (brand, offer badge, headline, tagline, CTA) and a right hero image panel â€” keep both zones uncluttered with clear visual separation.';
    case 'comparison-board':
      return 'Use a top header with brand and headline, then two equal left-and-right comparison panels with disciplined labels and evidence â€” keep the layout symmetrical and analytical.';
    case 'premium-editorial':
      return 'Use a dramatic left editorial image panel, a deep dark right column for the headline and supporting text, and a subtle brand/footer zone â€” every element should feel magazine-quality.';
    case 'brand-story':
      return 'Use a large circular portrait on the left, a brand lockup at the top-right, a narrative headline and supporting copy on the right, and a warm ambient footer.';
    case 'job-posting':
      return 'Use a bold accent header with a "WE\'RE HIRING" label, the brand mark at top-left, the role title and description on the left, a workplace image on the right, an Apply Now CTA, and a branded footer.';
    case 'hiring-banner':
      return 'Use a top brand bar, a centered "WE\'RE HIRING" pill badge, a dominant role headline, a short tagline, a "View Openings" CTA, and a footer â€” keep the composition bold and centered.';
    case 'team-spotlight':
      return 'Use a top header bar with the brand mark, a large circular team image on the left, a "JOIN OUR TEAM" label and headline on the right, supporting values, a CTA, and a footer.';
    case 'career-growth':
      return 'Use a top header with the brand mark, a career opportunity label and headline on the left, numbered benefit cards below, a workplace image card on the right, and a footer with CTA.';
    default:
      return 'Follow the selected theme as a true composition blueprint: keep brand lanes calm, the hero zone intentional, and footer details clean and readable.';
  }
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
      <div className={`mb-3 h-20 overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-[#08172f] via-[#0e3d73] to-[#0c5d88] p-2 shadow-sm ${ringClass}`}>
        <div className="relative flex h-full flex-col">
          <div className="flex h-[28%] items-center gap-2 rounded-md border border-white/10 bg-black/15 px-1.5">
            <div className="relative h-5 w-14 overflow-hidden rounded-md border border-white/12 bg-slate-950/18">
              <div className="absolute inset-y-0 left-0 w-1 bg-amber-300/90" />
              <div className="absolute inset-[3px] rounded-[4px] bg-white/95" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="h-2.5 w-28 rounded bg-white/92" />
              <div className="h-2 w-20 rounded bg-amber-300/95" />
            </div>
            <div className="flex gap-1.5">
              <div className="relative h-5 w-8 overflow-hidden rounded-md border border-white/10 bg-slate-950/26">
                <div className="absolute inset-y-[20%] left-[10%] w-[10%] rounded-full bg-amber-300/80" />
                <div className="absolute inset-[3px] rounded-[4px] bg-white/90" />
              </div>
              <div className="relative h-5 w-8 overflow-hidden rounded-md border border-white/10 bg-slate-950/26">
                <div className="absolute inset-y-[20%] left-[10%] w-[10%] rounded-full bg-amber-300/70" />
                <div className="absolute inset-[3px] rounded-[4px] bg-white/82" />
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-1 gap-2">
            <div className="relative w-[34%] overflow-hidden rounded-xl border border-white/12 bg-white/12">
              <div className="absolute left-[14%] top-[10%] rounded-full border border-white/10 bg-black/24 px-1.5 py-0.5 text-[5px] font-semibold uppercase tracking-[0.18em] text-white/60">
                Hero
              </div>
            </div>
            <div className="flex-1 rounded-xl border border-white/10 bg-slate-950/28 p-2">
              <div className="h-2 w-20 rounded bg-white/58" />
              <div className="mt-2 space-y-1.5">
                <div className="h-3 rounded-lg bg-white/18" />
                <div className="h-3 rounded-lg bg-white/18" />
                <div className="h-3 w-11/12 rounded-lg bg-white/18" />
              </div>
            </div>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-950/26">
            <div className="h-full w-1/2 rounded-full bg-white/78" />
          </div>
        </div>
      </div>
    );
  }

  if (themeId === 'product-hero') {
    return (
      <div className={`mb-3 h-20 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-200 p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-slate-700 shadow-lg ring-2 ring-white/20" />
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
      <div className={`mb-3 h-20 overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-2">
          <div className="h-2.5 w-16 rounded bg-slate-300" />
          <div className="mt-3 h-3 w-40 rounded bg-slate-900" />
          <div className="mt-1.5 h-2.5 w-24 rounded bg-slate-600" />
          <div className="mt-auto flex justify-end">
            <div className="h-5 w-12 rounded bg-slate-900" />
          </div>
        </div>
      </div>
    );
  }

  if ((themeId as string) === 'industrial-campaign') {
    return (
      <div className={`mb-3 h-20 overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-slate-950 via-[#13325e] to-[#1d5aa8] p-2 shadow-sm ${ringClass}`}>
        <div className="relative flex h-full flex-col">
          <div className="flex h-[27%] items-center gap-2 rounded-md border border-white/10 bg-black/16 px-1.5">
            <div className="relative h-5 w-14 overflow-hidden rounded-md border border-white/12 bg-slate-950/22">
              <div className="absolute inset-y-0 left-0 w-1 bg-cyan-300/90" />
              <div className="absolute inset-[3px] rounded-[4px] bg-white/94" />
            </div>
            <div className="flex-1">
              <div className="h-2 w-24 rounded bg-white/55" />
            </div>
            <div className="h-4 w-16 rounded-full border border-white/10 bg-black/24" />
          </div>
          <div className="mt-2 flex flex-1 gap-2">
            <div className="relative w-[36%] overflow-hidden rounded-xl border border-white/12 bg-white/10">
              <div className="absolute inset-x-[15%] bottom-[10%] h-2 rounded-full bg-slate-950/30 blur-[2px]" />
            </div>
            <div className="flex-1 rounded-xl border border-white/10 bg-slate-950/34 p-2">
              <div className="h-2.5 w-4/5 rounded bg-white/92" />
              <div className="mt-1.5 h-2 w-3/5 rounded bg-cyan-300/95" />
              <div className="mt-2 space-y-1.5">
                <div className="h-3 rounded-lg bg-white/18" />
                <div className="h-3 rounded-lg bg-white/18" />
                <div className="h-3 w-10/12 rounded-lg bg-white/18" />
              </div>
            </div>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-white/12" />
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
      <div className={`mb-3 h-20 overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-[#0d203f] via-[#214d7e] to-[#7bb2d8] p-2 shadow-sm ${ringClass}`}>
        <div className="flex h-full flex-col gap-1">
          <div className="grid flex-1 grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/14" />
            <div className="rounded-xl bg-white/10" />
            <div className="rounded-xl bg-white/14" />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <div className="h-2 rounded bg-white/70" />
            <div className="h-2 rounded bg-white/70" />
            <div className="h-2 rounded bg-white/70" />
            <div className="h-2 rounded bg-white/70" />
          </div>
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
      <div className={`mb-3 h-20 overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-[#1a2744] via-[#2d4a7a] to-[#4a90d9] p-2 shadow-sm ${ringClass}`}>
        <div className="mb-1 h-3 w-full rounded-t bg-blue-500/80">
          <p className="text-center text-[6px] font-bold leading-[12px] text-white">WE&apos;RE HIRING</p>
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
            <p className="text-center text-[5.5px] font-bold leading-[14px] text-purple-700">WE&apos;RE HIRING</p>
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ThemePreviewLarge â€” full-size right-panel layout mockup per theme
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const allianceTaglineLines = fitPreviewText(safeTagline, [26, 30, 34], 1);
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
    const paddingClass = options?.imagePaddingClass || 'p-2';
    return (
      <div className={`flex items-center justify-center overflow-hidden ${className}`}>
        {showHero ? (
          <img
            src={heroSrc!}
            alt="Reference"
            className={`h-full w-full ${fitClass} ${paddingClass} drop-shadow-lg`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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

  function renderHeaderBrandLockup(className: string) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div className="absolute inset-0 rounded-[18px] border border-white/12 bg-black/16" />
        <div
          className="absolute inset-y-0 left-0 w-[4%] rounded-l-[18px]"
          style={{ backgroundColor: `${previewPalette.accent}e0` }}
        />
        <div className="absolute inset-[8%] rounded-[14px] bg-white/[0.96] shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]" />
        <div className="absolute inset-[8%] flex items-center justify-center px-[11%]">
          {uploadedLogo ? (
            <img
              src={uploadedLogo}
              alt="Brand logo preview"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-center text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">
              {brandName || 'Brand'}
            </span>
          )}
        </div>
      </div>
    );
  }

  function renderHeaderPartnerLockup(
    className: string,
    fallbackTitle = 'Alliance partner',
    fallbackSubline = 'Co-branded header rail'
  ) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div className="absolute inset-0 rounded-[18px] border border-white/10 bg-slate-950/26 backdrop-blur-sm" />
        <div
          className="absolute inset-y-[14%] left-[3.5%] w-[1.8%] rounded-full"
          style={{ backgroundColor: `${previewPalette.accent}d6` }}
        />
        {allianceHeaderLogos.length > 0 ? (
          <div className="absolute inset-[8%] flex items-center gap-2">
            {allianceHeaderLogos.slice(0, 3).map((logo) => (
              <div
                key={logo.id}
                className="flex h-full flex-1 items-center justify-center rounded-[12px] border border-white/8 bg-white/92 px-2 py-1"
              >
                <img src={logo.url} alt={logo.name} className="h-full w-full object-contain" />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-[8%] flex flex-col items-center justify-center px-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/58">
              Partner Lockup
            </p>
            <p className="mt-1 text-[11px] font-semibold text-white">
              {partnerName || fallbackTitle}
            </p>
            <p className="mt-0.5 text-[10px] leading-tight text-white/68">
              {partnerTagline || fallbackSubline}
            </p>
          </div>
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
                <img src={heroSrc!} alt="Reference" className="h-full w-full object-contain p-2" />
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
    const allianceHeaderHeadlineLines = fitPreviewText(safeHeadline, [22, 24, 26], 2);
    const allianceSupportLines = fitPreviewText(
      safeTagline || `${brandName || 'Brand'} partnership creative`,
      [28, 32, 36],
      2
    );
    const allianceFeatureLines = (
      safeFeatureLines.length > 0
        ? safeFeatureLines
        : [
            'Premium co-branded campaign hierarchy',
            'Native logo lockup with protected breathing room',
            'Product-led hero bay with cleaner proof rhythm',
            'Footer lockup stays readable at feed size',
          ]
    ).slice(0, 4);
    return (
      <div className={`${previewAspectClass} overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div
          className="relative h-full w-full text-white"
          style={{
            backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 72%, ${previewPalette.accent}1c 100%)`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 18% 48%, ${previewPalette.accent}1c, transparent 28%), radial-gradient(circle at 76% 18%, rgba(255,255,255,0.10), transparent 18%)`,
            }}
          />
          <div
            className="absolute inset-x-0 top-0 h-[16.5%] border-b border-white/10"
            style={{ backgroundImage: `linear-gradient(90deg, ${previewPalette.bgStart}f2 0%, ${previewPalette.bgEnd}d8 100%)` }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[9.5%] border-t border-white/10"
            style={{ backgroundImage: `linear-gradient(90deg, ${previewPalette.footer}f1 0%, ${previewPalette.bgEnd}d1 100%)` }}
          />

          <div className="absolute left-[3.2%] top-[3%] h-[9.4%] w-[20%]">
            {renderHeaderBrandLockup('h-full w-full')}
          </div>

          <div className="absolute right-[3%] top-[3%] h-[9.4%] w-[22%]">
            {renderHeaderPartnerLockup(
              'h-full w-full',
              'Alliance partner',
              'Co-branded header rail'
            )}
          </div>

          <div className="absolute left-[25.4%] right-[25.8%] top-[3.2%] text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/62">
              Alliance Campaign
            </p>
            <div className="mt-1 space-y-0.5">
              {allianceHeaderHeadlineLines.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="font-black text-white"
                  style={{
                    fontSize: allianceHeaderHeadlineLines.length > 1 ? '20px' : '22px',
                    lineHeight: allianceHeaderHeadlineLines.length > 1 ? 1.05 : 1.08,
                    textShadow: '0 2px 10px rgba(0,0,0,0.34)',
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
            {allianceTaglineLines.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {allianceTaglineLines.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                    style={{ color: previewPalette.accent }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="absolute left-[4.2%] top-[21%] bottom-[12%] w-[33.5%]">
            <div className="absolute inset-0 rounded-[28px] border border-white/16 bg-white/[0.10] shadow-[0_24px_54px_rgba(0,0,0,0.26)]" />
            <div className="absolute inset-[4%] overflow-hidden rounded-[24px] border border-white/12 bg-slate-950/16">
              <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent pointer-events-none" />
              {renderHeroZone('absolute inset-0 rounded-[24px]', {
                fit: 'contain',
                imagePaddingClass: 'p-3',
                fallbackLabel: 'Product hero',
              })}
            </div>
          </div>

          <div className="absolute right-[4%] top-[21%] bottom-[12%] w-[55%]">
            <div className="absolute inset-0 rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-950/34 via-slate-950/16 to-transparent shadow-[0_22px_48px_rgba(0,0,0,0.18)]" />
            <div
              className="absolute inset-y-[8.5%] left-0 w-[1.2%] rounded-full"
              style={{ backgroundColor: `${previewPalette.accent}d2` }}
            />
            <div className="relative flex h-full flex-col px-[5%] py-[4%]">
              <div className="space-y-1">
                {allianceSupportLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="text-[11px] font-medium leading-snug text-white/86">
                    {line}
                  </p>
                ))}
              </div>
              <div className="mt-1.5 h-px w-[74%] bg-white/10" />
              <div className="mt-2 space-y-1.5">
                {allianceFeatureLines.map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className="relative flex items-start gap-2 rounded-xl border border-white/10 bg-slate-950/26 px-2.5 py-1.5"
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-[1.3%] rounded-l-xl"
                      style={{ backgroundColor: `${previewPalette.accent}d8` }}
                    />
                    <div
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: previewPalette.accent }}
                    >
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {fitPreviewText(line, [28, 32, 36], 2).map((chunk, chunkIndex) => (
                        <p key={`${chunk}-${chunkIndex}`} className="text-[10px] font-semibold leading-snug text-white/94">
                          {chunk}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex h-[9.5%] items-center justify-between px-[5%] text-[10px] font-semibold uppercase tracking-[0.18em] text-white/78">
            <span className="max-w-[42%] truncate">{safeFooterWebsite || brandName || 'Brand site'}</span>
            <span className="h-px w-[12%] bg-white/12" />
            <span className="max-w-[42%] truncate text-right">{safeFooterEmail || 'info@brand.com'}</span>
          </div>
        </div>
      </div>
    );
  }

  if ((themeId as string) === 'industrial-campaign') {
    const industrialHeadlineLines = fitPreviewText(safeHeadline, [22, 26, 30], 2);
    const industrialTaglineLines = fitPreviewText(safeTagline, [28, 32, 36], 1);
    const industrialFeatures = (
      safeFeatureLines.length > 0
        ? safeFeatureLines
        : [
            'Engineered campaign hierarchy with a protected message lane',
            'Native logo lockup inside the header fascia',
            'Hero equipment bay staged for premium depth and contrast',
            'Proof stack reads cleanly at LinkedIn feed size',
          ]
    ).slice(0, 4);
    const industrialFooterLeft = safeFooterWebsite || brandName || 'Brand site';
    const industrialFooterRight = safeFooterEmail || '';
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 68%, ${previewPalette.accent}26 100%)` }} />
        <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(ellipse at 20% 52%, ${previewPalette.accent}20, transparent 50%), radial-gradient(circle at 82% 18%, rgba(255,255,255,0.12), transparent 16%)` }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 26%, transparent 100%)' }} />
        <div className="absolute inset-x-0 top-0 h-[14.5%] border-b border-white/10" style={{ backgroundImage: `linear-gradient(90deg, ${previewPalette.bgStart}f0 0%, ${previewPalette.bgEnd}c8 100%)` }} />
        <div className="absolute inset-x-0 bottom-0 h-[8.5%]" style={{ backgroundImage: `linear-gradient(90deg, ${previewPalette.bgStart}ee 0%, ${previewPalette.bgEnd}dd 100%)` }} />
        <div className="absolute left-[24%] top-[4.8%] h-[7.2%] w-[1.1%] -skew-x-[18deg] bg-white/25" />
        <div className="absolute left-[26%] top-[4.8%] h-[7.2%] w-[0.7%] -skew-x-[18deg]" style={{ backgroundColor: previewPalette.accent }} />
        <div className="absolute right-[22%] top-[3.2%] h-[8.4%] w-[1.2%] -skew-x-[18deg] bg-white/20" />
        <div className="absolute right-[19.5%] top-[3.2%] h-[8.4%] w-[0.8%] -skew-x-[18deg]" style={{ backgroundColor: previewPalette.accent }} />
        <div className="absolute right-[9.5%] top-[3.2%] h-[8.4%] w-[1.2%] -skew-x-[18deg] bg-white/20" />
        <div className="absolute right-[7%] top-[3.2%] h-[8.4%] w-[0.8%] -skew-x-[18deg]" style={{ backgroundColor: previewPalette.accent }} />
        {[0, 1, 2].map((index) => (
          <div
            key={`industrial-rail-${index}`}
            className="absolute right-[6.5%] h-[1px] bg-white/12"
            style={{ left: '45%', top: `${20.5 + index * 1.8}%` }}
          />
        ))}
        {[0, 1, 2, 3].map((index) => (
          <div
            key={`industrial-flow-${index}`}
            className="absolute rounded-full bg-white/10 blur-[0.5px]"
            style={{
              left: `${18 + index * 4}%`,
              top: `${28 + index * 8.2}%`,
              width: `${54 - index * 2}%`,
              height: '2px',
            }}
          />
        ))}

        <div className="absolute left-[3%] top-[2.8%] h-[9%] w-[18.5%]">
          {renderHeaderBrandLockup('h-full w-full')}
        </div>

        {hasAllianceHeaderContent ? (
          <div className="absolute right-[2.6%] top-[2.8%] h-[9%] w-[22%]">
            {renderHeaderPartnerLockup('h-full w-full', 'Partner brand', 'Header lockup')}
          </div>
        ) : (
          <div className="absolute right-[3.2%] top-[4.2%] rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
            Industrial Campaign
          </div>
        )}

        <div className="absolute left-[24%] right-[25%] top-[3.8%] text-center">
          <div className="space-y-1">
            {industrialHeadlineLines.length <= 2 && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/58">
                Campaign
              </p>
            )}
          </div>
        </div>

        <div className="absolute bottom-[12%] left-[3.5%] top-[21%] w-[32.5%]">
          <div className="absolute inset-0 rounded-[28px] border border-white/16 bg-white/[0.10] shadow-[0_24px_54px_rgba(0,0,0,0.28)]" />
          <div className="absolute inset-[4%] overflow-hidden rounded-[24px] border border-white/12 bg-white/[0.06]">
            <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent pointer-events-none" />
            {renderHeroZone('absolute inset-0 rounded-[22px]', {
              fit: 'contain',
              imagePaddingClass: 'p-3',
            })}
          </div>
        </div>

        <div className="absolute bottom-[12%] right-[3.2%] top-[21%] w-[58.5%]">
          <div className="absolute inset-0 rounded-[28px] border border-white/10 px-[4.8%] py-[5.2%] shadow-[0_20px_45px_rgba(0,0,0,0.18)]" style={{ backgroundImage: 'linear-gradient(135deg, rgba(7,18,36,0.52), rgba(4,11,24,0.82))' }} />
          <div className="absolute inset-y-[8.5%] left-0 w-[1.4%] rounded-full" style={{ backgroundColor: `${previewPalette.accent}cc` }} />
          <div className="relative flex h-full flex-col px-[5%] py-[4%]">
            <div className="space-y-0.5">
              {industrialHeadlineLines.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="font-black text-white"
                  style={{
                    fontSize: industrialHeadlineLines.length > 1 ? '17px' : '20px',
                    lineHeight: 1.12,
                    textShadow: '0 2px 10px rgba(0,0,0,0.34)',
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
            {industrialTaglineLines.length > 0 && (
              <div className="space-y-0.5 pt-1">
                {industrialTaglineLines.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className="text-[10px] font-semibold uppercase tracking-[0.20em]"
                    style={{ color: previewPalette.accent }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-1.5 h-0.5 w-[20%] rounded-full" style={{ backgroundColor: previewPalette.accent }} />
            <div className="mt-2 space-y-1.5">
              {industrialFeatures.map((line, index) => (
                <div key={`${line}-${index}`} className="relative flex items-start gap-2 rounded-xl border border-white/10 bg-slate-950/32 px-2.5 py-1.5">
                  <div className="absolute inset-y-0 left-0 w-[1.3%] rounded-l-xl" style={{ backgroundColor: `${previewPalette.accent}dd` }} />
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: previewPalette.accent }}>
                    <CheckCircle2 className="h-3 w-3 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {fitPreviewText(line, [28, 32, 36], 2).map((chunk, chunkIndex) => (
                      <p key={`${chunk}-${chunkIndex}`} className="text-[10px] font-semibold leading-snug text-white/95">
                        {chunk}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex h-[8.5%] items-center justify-between border-t border-white/10 px-[5%] text-[10px] font-semibold text-white/80">
          <span className="max-w-[42%] truncate text-left">{industrialFooterLeft}</span>
          {industrialFooterRight ? <span className="max-w-[42%] truncate text-right">{industrialFooterRight}</span> : <span />}
        </div>
      </div>
    );
  }

  // â”€â”€ Alliance Poster â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Legacy duplicate Alliance preview branch kept inert for safe cleanup.
  if ((themeId as string) === '__legacy-alliance-preview') {
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
                  âœ“
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

  // â”€â”€ Clean Brand â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (themeId === 'clean-brand') {
    const cleanTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 3);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden bg-white`}>
        <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-slate-100" />
        <div className="absolute inset-x-0 top-0 flex h-[14%] items-center justify-between border-b border-slate-100 px-[5%]">
          {renderLogoBox('h-[65%] w-[13%] rounded-lg border border-slate-200 bg-white shadow-sm')}
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{brandName || 'Brand'}</p>
        </div>
        <div className="absolute bottom-[12%] left-[6%] top-[18%] flex w-[48%] flex-col justify-center gap-2">
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
                  fontSize: standardHeadlineLines.length > 2 ? '20px' : '23px',
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
          {safeFeatureLines.length > 0 && (
            <div className="space-y-1.5">
              {safeFeatureLines.slice(0, 3).map((bullet, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: previewPalette.accent }} />
                  <p className="text-[10px] font-medium leading-tight" style={{ color: previewPalette.muted }}>{bullet}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex h-8 w-28 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Learn More
          </div>
        </div>
        <div className="absolute bottom-[12%] right-[4%] top-[16%] left-[60%] rounded-2xl border border-slate-200 bg-slate-100">
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

  // â”€â”€ Brand Story â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (themeId === 'brand-story') {
    const storyHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22], 3);
    const storyTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 4);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.surface} 0%, white 50%, ${previewPalette.muted}33 100%)` }} />
        <div className="absolute bottom-[8%] left-[4%] top-[8%] w-[40%] flex items-center justify-center">
          <div className="h-[80%] w-[76%] rounded-[40%] shadow-xl overflow-hidden" style={{ backgroundColor: `${previewPalette.bgStart}cc` }}>
            {showHero ? (
              <img src={heroSrc!} alt="Story" className="h-full w-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-8 w-8" style={{ color: `${previewPalette.muted}44` }} />
              </div>
            )}
          </div>
        </div>
        <div className="absolute bottom-[10%] right-[4%] top-[10%] flex w-[52%] flex-col justify-center gap-2">
          {renderLogoBox('h-10 w-14 rounded-lg border border-slate-200 bg-white shadow-sm')}
          <div className="space-y-1">
            {storyHeadlineLines.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className="font-black"
                style={{
                  color: previewPalette.bgStart,
                  fontSize: storyHeadlineLines.length > 2 ? '17px' : '20px',
                  lineHeight: 1.14,
                }}
              >
                {line}
              </p>
            ))}
          </div>
          <div className="space-y-1">
            {(storyTaglineLines.length > 0 ? storyTaglineLines : ['Use this layout for thoughtful storytelling and a more editorial tone.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug" style={{ color: `${previewPalette.muted}dd` }}>
                {line}
              </p>
            ))}
          </div>
          {safeFeatureLines.length > 0 && (
            <div className="space-y-1">
              {safeFeatureLines.slice(0, 3).map((bullet, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: previewPalette.accent }} />
                  <p className="text-[10px] font-medium leading-tight" style={{ color: previewPalette.muted }}>{bullet}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-28 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
              Read More
            </div>
            <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: previewPalette.muted }} />
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Product Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (themeId === 'product-hero') {
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.surface }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(180deg, ${previewPalette.surface} 0%, white 48%, ${previewPalette.muted}44 100%)` }} />
        {renderLogoBox('absolute left-[4%] top-[4%] h-[10%] w-[13%] rounded-xl border border-slate-200 bg-white shadow-sm')}
        <div className="absolute left-[6%] top-[19%] h-1 w-[42%] rounded-full" style={{ backgroundColor: previewPalette.accent }} />
        <div className="absolute bottom-[16%] left-[6%] top-[24%] flex w-[44%] flex-col justify-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: previewPalette.muted }}>
            {brandName || 'Product'}
          </p>
          {productHeadlineLines.map((line, index) => (
            <p
              key={`${line}-${index}`}
              className="font-black leading-tight"
              style={{
                color: previewPalette.text,
                fontSize: productHeadlineLines.length > 2 ? '19px' : '22px',
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
          {safeFeatureLines.length > 0 && (
            <div className="space-y-1.5">
              {safeFeatureLines.slice(0, 3).map((bullet, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: previewPalette.accent }} />
                  <p className="text-[10px] font-medium leading-tight" style={{ color: previewPalette.muted }}>{bullet}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex h-8 w-32 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Learn More
          </div>
        </div>
        <div className="absolute bottom-[12%] right-[5%] top-[14%] w-[38%] rounded-[26px] border border-slate-200 bg-white/92 shadow-lg">
          {renderHeroZone('absolute inset-[5%] rounded-[20px]', { fit: 'contain', imagePaddingClass: 'p-2' })}
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Knowledge Visual â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (themeId === 'knowledge-visual') {
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)` }} />
        <div className="absolute inset-[4%] grid grid-cols-[1.1fr_0.9fr] gap-[3%]">
          <div className="rounded-xl border border-white/20 overflow-hidden bg-white/88">
            {renderHeroZone('h-full w-full rounded-xl', { fit: 'contain', imagePaddingClass: 'p-2' })}
          </div>
          <div className="flex flex-col justify-center gap-2 rounded-xl p-3" style={{ border: `1px solid ${previewPalette.accent}88`, backgroundColor: `${previewPalette.accent}40` }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: previewPalette.muted }}>{brandName || 'Brand'}</p>
            {knowledgeHeadlineLines.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className="font-black leading-tight"
                style={{
                  color: previewPalette.text,
                  fontSize: knowledgeHeadlineLines.length > 2 ? '19px' : '22px',
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
                  <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ backgroundColor: previewPalette.support }}>
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
            <div className="mt-1 flex h-8 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.support }}>
              Learn More
            </div>
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Datasheet Frame â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                {renderLogoBox('h-8 w-12 rounded border border-slate-200')}
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{brandName || 'Datasheet'}</p>
              </div>
              {datasheetHeadlineLines.map((line, index) => (
                <p key={`${line}-${index}`} className="font-black leading-tight text-slate-900" style={{ fontSize: datasheetHeadlineLines.length > 1 ? '17px' : '20px' }}>
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
                  <div className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ backgroundColor: previewPalette.support }}>
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

  // â”€â”€ Proof Stack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          <div className="flex flex-col justify-center gap-2 rounded-xl border border-slate-200 p-3" style={{ backgroundColor: previewPalette.bgStart }}>
            {renderLogoBox('h-7 w-12 rounded-lg bg-white/15 mb-1', true)}
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: previewPalette.muted }}>{brandName || 'Brand'}</p>
            {proofHeadlineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-[19px] font-black leading-tight text-white">
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
            <div className="flex h-8 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.support }}>
              View Details
            </div>
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Launch Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              <span className="text-[10px] font-bold text-slate-700">{brandName || 'Brand'}</span>
            )}
          </div>
          <div className="flex h-6 w-24 items-center justify-center rounded-full px-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ backgroundColor: previewPalette.accent, color: previewPalette.text }}>
            {brandName || 'Launch'}
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
          {safeFeatureLines.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {safeFeatureLines.slice(0, 3).map((bullet, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: previewPalette.accent }} />
                  <p className="text-[10px] text-white/80 font-medium leading-tight">{bullet}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="absolute bottom-[8%] inset-x-[8%] flex items-center justify-between">
          <div className="rounded-full px-4 py-2 text-[11px] font-semibold" style={{ backgroundColor: `${previewPalette.surface}44`, color: previewPalette.text }}>
            {brandName || 'Brand'}
          </div>
          <div className="flex h-8 w-28 items-center justify-center rounded-xl bg-white/90 text-[10px] font-bold text-slate-800">
            Learn More
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Sector Collage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              <p key={`${line}-${index}`} className="text-[18px] font-black leading-tight text-white">
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
                  <img src={src} alt={`Sector ${i + 1}`} className="h-full w-full object-contain rounded-xl p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
                <p key={`${line}-${index}`} className="mt-1 text-[10px] font-semibold leading-snug text-white/88">
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

  // â”€â”€ Offer Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (themeId === 'offer-card') {
    const offerTaglineLines = fitPreviewText(safeTagline, [24, 28, 32], 2);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 50%, ${previewPalette.accent}88 100%)` }} />
        <div className="absolute inset-[4%] grid grid-cols-[1.4fr_1fr] gap-[3%]">
          <div className="flex flex-col justify-center gap-3 rounded-xl p-4" style={{ backgroundColor: `${previewPalette.surface}18` }}>
            {renderLogoBox('h-7 w-12 rounded-lg mb-1', true)}
            <div className="flex h-5 w-24 items-center justify-center rounded-full text-[10px] font-bold uppercase tracking-[0.16em]" style={{ backgroundColor: `${previewPalette.accent}e6`, color: previewPalette.text }}>
              Special Offer
            </div>
            <div className="space-y-1.5">
              {standardHeadlineLines.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="font-black text-white"
                  style={{ fontSize: standardHeadlineLines.length > 2 ? '20px' : '24px', lineHeight: 1.12 }}
                >
                  {line}
                </p>
              ))}
            </div>
            {offerTaglineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] font-medium leading-snug text-white/75">
                {line}
              </p>
            ))}
            {safeFeatureLines.length > 0 && (
              <div className="space-y-1.5">
                {safeFeatureLines.slice(0, 3).map((bullet, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/60" />
                    <p className="text-[10px] text-white/80 leading-tight">{bullet}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex h-8 w-32 items-center justify-center rounded-xl bg-white/90 text-[10px] font-bold text-slate-800">
              Learn More
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

  // â”€â”€ Comparison Board â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          {renderLogoBox('h-10 w-14 rounded-lg border border-slate-200 bg-white shadow-sm')}
          <div className="space-y-1">
            {fitPreviewText(safeHeadline, [22, 24, 26], 2).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[18px] font-black leading-tight text-slate-900">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="absolute inset-x-[4%] top-[18%] grid grid-cols-2 gap-[3%]" style={{ bottom: '8%' }}>
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-bold text-slate-900">Operational Value</p>
            <div className="flex-1 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
              {getSlotSrc('panel-left') ? (
                <img src={getSlotSrc('panel-left')!} alt="Option A" className="h-full w-full object-contain rounded-xl p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-300" />
              )}
            </div>
            <div className="space-y-1.5">
              {leftBullets.map((line, index) => (
                <div key={`${line}-${index}`} className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    {fitPreviewText(line, [18, 20, 22], 2).map((chunk, chunkIndex) => (
                      <p key={`${chunk}-${chunkIndex}`} className="text-[10px] font-semibold leading-snug text-slate-700">
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
            <div className="flex-1 rounded-xl overflow-hidden flex items-center justify-center" style={{ backgroundColor: `${previewPalette.accent}44` }}>
              {getSlotSrc('panel-right') ? (
                <img src={getSlotSrc('panel-right')!} alt="Option B" className="h-full w-full object-contain rounded-xl p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-300" />
              )}
            </div>
            <div className="space-y-1.5">
              {rightBullets.map((line, index) => (
                <div key={`${line}-${index}`} className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ backgroundColor: previewPalette.accent }}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    {fitPreviewText(line, [18, 20, 22], 2).map((chunk, chunkIndex) => (
                      <p key={`${chunk}-${chunkIndex}`} className="text-[10px] font-semibold leading-snug text-slate-700">
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

  // â”€â”€ Premium Editorial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (themeId === 'premium-editorial') {
    const editorialHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22, 24], 3);
    const editorialTaglineLines = fitPreviewText(safeTagline, [26, 30, 34], 4);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 60%, ${previewPalette.accent}44 100%)` }} />
        <div className="absolute inset-[3%] grid grid-cols-[0.45fr_1fr] gap-[3%]">
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: `${previewPalette.surface}22` }}>
            {showHero ? (
              <img src={heroSrc!} alt="Editorial" className="h-full w-full rounded-2xl object-contain p-2" />
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
                  style={{ fontFamily: 'Georgia, serif', fontSize: editorialHeadlineLines.length > 2 ? '20px' : '24px', lineHeight: 1.14 }}
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
            {safeFeatureLines.length > 0 && (
              <div className="space-y-1.5">
                {safeFeatureLines.slice(0, 3).map((bullet, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: previewPalette.accent }} />
                    <p className="text-[10px] text-white/75 font-medium leading-tight">{bullet}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto flex items-center justify-between">
              <p className="text-[10px] font-semibold text-white/45">{brandName || 'Brand editorial'}</p>
              <div className="flex h-8 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
                Read More
              </div>
            </div>
          </div>
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Job Posting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (themeId === 'job-posting') {
    const jpHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22, 24], 2);
    const jpTaglineLines = fitPreviewText(safeTagline, [26, 30, 34], 3);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)` }} />
        <div className="absolute inset-x-0 top-0 flex h-[12%] items-center justify-center" style={{ backgroundColor: previewPalette.accent }}>
          <p className="text-[12px] font-black tracking-[0.2em] text-white">WE&apos;RE HIRING</p>
        </div>
        <div className="absolute left-[5%] top-[3%] z-10">
          {renderLogoBox('h-[8%] w-[10%] rounded-lg', true)}
        </div>
        <div className="absolute bottom-[8%] left-[4%] top-[16%] flex w-[50%] flex-col justify-start gap-2 rounded-2xl px-[3%] py-[3%]" style={{ backgroundColor: `${previewPalette.surface}55` }}>
          <div className="space-y-1.5 mt-2">
            {jpHeadlineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="font-black text-white" style={{ fontSize: jpHeadlineLines.length > 1 ? '20px' : '24px', lineHeight: 1.12 }}>
                {line}
              </p>
            ))}
          </div>
          <div className="space-y-1">
            {(jpTaglineLines.length > 0 ? jpTaglineLines : ['Join our team and make an impact.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug text-white/72">{line}</p>
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
          <div className="mt-auto flex h-8 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Apply Now
          </div>
        </div>
        <div className="absolute bottom-[8%] right-[4%] top-[18%] w-[38%] overflow-hidden rounded-2xl bg-white/88">
          {renderHeroZone('h-full w-full rounded-2xl', { fit: 'cover', fallbackLabel: 'Office / Team photo' })}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[6%] items-center justify-center" style={{ backgroundColor: `${previewPalette.bgStart}aa` }}>
          <p className="text-[10px] text-white/60">{footerPreviewLines[0] || safeFooterWebsite || brandName || 'careers.company.com'}</p>
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Hiring Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            <p className="text-[11px] font-black tracking-[0.25em]" style={{ color: previewPalette.accent }}>WE&apos;RE HIRING</p>
          </div>
        </div>
        <div className="absolute inset-x-[10%] top-[32%] flex flex-col items-center gap-2">
          <div className="text-center space-y-1.5">
            {hbHeadlineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="font-black text-white text-center" style={{ fontSize: hbHeadlineLines.length > 1 ? '24px' : '30px', lineHeight: 1.1 }}>
                {line}
              </p>
            ))}
          </div>
          <div className="text-center space-y-1">
            {(hbTaglineLines.length > 0 ? hbTaglineLines : ['Be part of something extraordinary.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[11px] leading-snug text-white/72 text-center">{line}</p>
            ))}
          </div>
          {featureLines.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {featureLines.slice(0, 3).map((bullet, i) => (
                <div key={i} className="rounded-full px-3 py-1" style={{ backgroundColor: `${previewPalette.surface}30` }}>
                  <p className="text-[10px] text-white/80 font-medium">{bullet}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-[14%] flex justify-center">
          <div className="flex h-8 w-32 items-center justify-center rounded-xl text-[11px] font-bold" style={{ backgroundColor: `${previewPalette.surface}ee`, color: previewPalette.bgStart }}>
            View Openings
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[7%] items-center justify-center" style={{ backgroundColor: `${previewPalette.bgStart}80` }}>
          <p className="text-[10px] text-white/55">{footerPreviewLines[0] || safeFooterWebsite || brandName || 'careers.company.com'}</p>
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Team Spotlight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (themeId === 'team-spotlight') {
    const tsHeadlineLines = fitPreviewText(safeHeadline, [18, 20, 22], 2);
    const tsTaglineLines = fitPreviewText(safeTagline, [22, 26, 30], 3);
    return (
      <div className={`${previewAspectClass} relative overflow-hidden`} style={{ backgroundColor: previewPalette.bgStart }}>
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(160deg, ${previewPalette.bgStart} 0%, ${previewPalette.bgEnd} 100%)` }} />
        <div className="absolute left-[4%] top-[8%] bottom-[8%] w-[42%] flex items-center justify-center">
          <div className="relative h-[70%] aspect-square rounded-full overflow-hidden ring-4 ring-white/20" style={{ boxShadow: `0 0 0 4px ${previewPalette.accent}55` }}>
            {showHero ? (
              <img src={heroSrc!} alt="Team" className="h-full w-full object-contain p-2" />
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
          <p className="text-[10px] font-bold tracking-[0.15em] mb-2" style={{ color: previewPalette.accent }}>JOIN OUR TEAM</p>
          <div className="space-y-1.5">
            {tsHeadlineLines.map((line, index) => (
              <p key={`${line}-${index}`} className="font-black text-white" style={{ fontSize: tsHeadlineLines.length > 1 ? '18px' : '21px', lineHeight: 1.14 }}>
                {line}
              </p>
            ))}
          </div>
          <div className="space-y-1 mt-2">
            {(tsTaglineLines.length > 0 ? tsTaglineLines : ['Great people build great products.', 'Come join us.']).map((line, index) => (
              <p key={`${line}-${index}`} className="text-[10px] leading-snug text-white/72">{line}</p>
            ))}
          </div>
          {featureLines.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {featureLines.slice(0, 3).map((bullet, i) => (
                <div key={i} className="rounded-lg px-2 py-1.5" style={{ backgroundColor: `${previewPalette.surface}28` }}>
                  <p className="text-[10px] text-white/75 font-medium">{bullet}</p>
                </div>
              ))}
            </div>
          )}
          <div className="absolute bottom-[8%] left-[3%]">
            <div className="flex h-8 w-24 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
              Join Us
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[6%] items-center justify-center" style={{ backgroundColor: `${previewPalette.bgStart}88` }}>
          <p className="text-[10px] text-white/55">{footerPreviewLines[0] || safeFooterWebsite || brandName || 'Company'}</p>
        </div>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Career Growth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        <p className="absolute left-[5%] top-[13%] text-[10px] font-bold tracking-[0.15em]" style={{ color: previewPalette.accent }}>CAREER OPPORTUNITY</p>
        <div className="absolute left-[5%] top-[18%] w-[48%] space-y-1.5">
          {cgHeadlineLines.map((line, index) => (
            <p key={`${line}-${index}`} className="font-black text-white" style={{ fontSize: cgHeadlineLines.length > 1 ? '20px' : '24px', lineHeight: 1.12 }}>
              {line}
            </p>
          ))}
        </div>
        <div className="absolute left-[5%] top-[34%] w-[48%] space-y-1">
          {(cgTaglineLines.length > 0 ? cgTaglineLines : ['Build your career with us.']).map((line, index) => (
            <p key={`${line}-${index}`} className="text-[10px] leading-snug text-white/72">{line}</p>
          ))}
        </div>
        <div className="absolute left-[4%] top-[44%] w-[48%] space-y-2">
          {benefitItems.map((benefit, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: `${previewPalette.surface}30` }}>
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
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
          <div className="flex h-8 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Explore Roles
          </div>
        </div>
        <p className="absolute bottom-[5%] right-[4%] text-[10px] text-white/45">{footerPreviewLines[0] || safeFooterWebsite || brandName || ''}</p>
        {generateCta}
      </div>
    );
  }

  // â”€â”€ Default / AI Guided â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            <p key={`${line}-${index}`} className="text-[20px] font-black leading-tight text-white">
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
          <div className="flex h-8 w-28 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: previewPalette.accent }}>
            Learn More
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
  industry,
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
  const [isVisionUserEdited, setIsVisionUserEdited] = useState(false);
  const [visionSelections, setVisionSelections] = useState<Partial<Record<VisionComponentKey, string>>>({});
  const [acceptedVisionComponents, setAcceptedVisionComponents] = useState<Record<VisionComponentKey, boolean>>(
    () => createVisionAcceptedState(false)
  );
  const [visionOverrides, setVisionOverrides] = useState<Record<VisionComponentKey, string>>(
    () => createVisionOverrideState()
  );
  const visionComposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploadedLogo, setUploadedLogo] = useState<string | null>(primaryBrandLogoUrl);
  const [logoPlacement, setLogoPlacement] = useState<'overlay' | 'infuse' | 'none'>(
    primaryBrandLogoUrl ? getThemeRecommendedLogoPlacement('guided-auto') : 'none'
  );
  const [allianceLogos, setAllianceLogos] = useState<UploadedLogoAsset[]>([]);
  const [partnerName, setPartnerName] = useState('');
  const [partnerTagline, setPartnerTagline] = useState('');
  const [footerWebsite, setFooterWebsite] = useState('');
  const [footerEmail, setFooterEmail] = useState('');
  const [benefitsText, setBenefitsText] = useState('');
  const [benefitsTouched, setBenefitsTouched] = useState(false);
  const [selectedBlendMode] = useState<BlendModeId>('soft-light');
  const [imageAspect, setImageAspect] = useState<'landscape' | 'square' | 'portrait'>('landscape');
  const [referenceSelectionTouched, setReferenceSelectionTouched] = useState(false);

  // Theme slot image assignments (maps slot id â†’ image URL)
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string | null>>({});

  // Reference image state (fetched from URL)
  const [siteUrl, setSiteUrl] = useState('');
  const [isFetchingSiteImages, setIsFetchingSiteImages] = useState(false);
  const [fetchedSiteImages, setFetchedSiteImages] = useState<Array<{ url: string; source: string; width: number | null; height: number | null }>>([]);
  const [selectedReferenceImage, setSelectedReferenceImage] = useState<string | null>(null);

  // Image source tab for unified card
  const [imageSourceTab, setImageSourceTab] = useState<'upload' | 'pdf' | 'url'>('upload');

  // Additional reference images for AI Guided multi-image mode
  const [additionalReferenceImages, setAdditionalReferenceImages] = useState<string[]>([]);
  const additionalImagesInputRef = useRef<HTMLInputElement>(null);
  const unifiedUploadRef = useRef<HTMLInputElement>(null);

  // Per-slot image upload
  const slotUploadInputRef = useRef<HTMLInputElement>(null);
  const [slotUploadTarget, setSlotUploadTarget] = useState<string | null>(null);

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
  const [artifactMetaByUrl, setArtifactMetaByUrl] = useState<Record<string, GeneratedArtifactMeta>>({});
  const [artifactCompareView, setArtifactCompareView] = useState<'before' | 'after'>('after');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const allianceLogoInputRef = useRef<HTMLInputElement>(null);
  const partnerLogoInputRef = useRef<HTMLInputElement>(null);
  const referenceImageInputRef = useRef<HTMLInputElement>(null);
  const revisionTargetRef = useRef<VisionComponentKey | null>(null);
  const themeVisionOptionsRef = useRef<Record<VisionComponentKey, VisionComponentOption[]> | null>(null);
  const themeVisionEntriesRef = useRef<VisionComponentEntry[]>([]);
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
        // Non-critical â€” silently absorb
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
  const maxReferenceImages = useMemo(() => {
    if (selectedThemeId === 'guided-auto' || selectedThemeId === 'alliance-poster') return 5;
    return Math.max(1, activeThemeSlots.length);
  }, [selectedThemeId, activeThemeSlots]);
  const totalSelectedImages = (selectedReferenceImage ? 1 : 0) + additionalReferenceImages.length;
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

  const handleSwapVisionOption = useCallback(
    (key: VisionComponentKey) => {
      const options = themeVisionOptionsRef.current?.[key] || [];
      if (options.length === 0) return;

      const currentId = visionSelections[key];
      const nextId = getNextVisionOptionId(options, visionSelections[key]);
      if (!nextId) return;

      const nextOption = options.find((option) => option.id === nextId) || options[0];
      setVisionSelections((prev) => ({ ...prev, [key]: nextId }));
      if (currentId !== nextId) {
        setAcceptedVisionComponents((prev) =>
          prev[key]
            ? {
                ...prev,
                [key]: false,
              }
            : prev
        );
      }

      if (nextOption.apply?.paletteColors && nextOption.apply.paletteColors.length > 0) {
        applyBrandColors(nextOption.apply.paletteColors);
      }

      if (typeof nextOption.apply?.logoPlacement === 'string') {
        setLogoPlacement(nextOption.apply.logoPlacement);
      }

      toast.message(`${VISION_COMPONENT_LABELS[key]} swapped`, {
        description: nextOption.label,
      });
    },
    [applyBrandColors, visionSelections]
  );

  const handleToggleVisionAcceptance = useCallback((key: VisionComponentKey) => {
    setAcceptedVisionComponents((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleVisionOverrideChange = useCallback((key: VisionComponentKey, value: string) => {
    setVisionOverrides((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

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
    setIsVisionUserEdited(Boolean(preset.customPrompt));
    setSelectedTone(preset.selectedTone || 'professional');
    setSelectedStyle(preset.selectedStyle || 'split-layout');
    setLogoPlacement(preset.logoPlacement || getThemeRecommendedLogoPlacement(preset.themeId));
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

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Logo Upload ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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

  // â”€â”€ Per-slot image upload handler â”€â”€
  const handleSlotImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetSlot = slotUploadTarget;
    e.target.value = '';
    if (!file || !targetSlot) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSlotAssignments((prev) => ({ ...prev, [targetSlot]: reader.result as string }));
      toast.success('Image assigned to slot');
    };
    reader.readAsDataURL(file);
  }, [slotUploadTarget]);

  const triggerSlotUpload = useCallback((slotId: string) => {
    setSlotUploadTarget(slotId);
    // Use setTimeout to ensure state is set before triggering click
    setTimeout(() => slotUploadInputRef.current?.click(), 0);
  }, []);

  // â”€â”€ Upload multiple additional reference images (AI Guided) â”€â”€
  const handleAdditionalImagesUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const maxTotal = 5;
    const available = maxTotal - additionalReferenceImages.length;
    if (available <= 0) {
      toast.error(`Maximum ${maxTotal} additional images allowed`);
      e.target.value = '';
      return;
    }

    const filesToProcess = files.slice(0, available);
    let processed = 0;

    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is over 10MB â€” skipped`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAdditionalReferenceImages((prev) => {
          if (prev.length >= maxTotal) return prev;
          return [...prev, reader.result as string];
        });
        processed++;
        if (processed === filesToProcess.length) {
          toast.success(`${processed} image${processed > 1 ? 's' : ''} added`);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, [additionalReferenceImages.length]);

  // â”€â”€ Add image from PDF/fetched to additional references â”€â”€
  const addToAdditionalReferences = useCallback((url: string) => {
    const current = (selectedReferenceImage ? 1 : 0) + additionalReferenceImages.length;
    if (current >= maxReferenceImages) {
      toast.error(`Maximum ${maxReferenceImages} image${maxReferenceImages !== 1 ? 's' : ''} for this theme`);
      return;
    }
    if (additionalReferenceImages.includes(url)) {
      toast('Image already added');
      return;
    }
    setAdditionalReferenceImages((prev) => [...prev, url]);
    toast.success('Added to references');
  }, [additionalReferenceImages, selectedReferenceImage, maxReferenceImages]);

  const removeAdditionalReference = useCallback((index: number) => {
    setAdditionalReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // â”€â”€ Unified image selection handler (for any source tab) â”€â”€
  const handleUnifiedImageSelect = useCallback((url: string) => {
    // Deselect if already selected
    if (selectedReferenceImage === url) {
      setReferenceSelectionTouched(true);
      setSelectedReferenceImage(null);
      return;
    }
    const addIdx = additionalReferenceImages.indexOf(url);
    if (addIdx >= 0) {
      setAdditionalReferenceImages((prev) => prev.filter((_, i) => i !== addIdx));
      return;
    }
    // Check max
    const current = (selectedReferenceImage ? 1 : 0) + additionalReferenceImages.length;
    if (current >= maxReferenceImages) {
      toast.error(`Maximum ${maxReferenceImages} image${maxReferenceImages !== 1 ? 's' : ''} for this theme`);
      return;
    }
    // Add: hero first, then additional
    if (!selectedReferenceImage) {
      setReferenceSelectionTouched(true);
      setSelectedReferenceImage(url);
    } else {
      setAdditionalReferenceImages((prev) => [...prev, url]);
    }
  }, [selectedReferenceImage, additionalReferenceImages, maxReferenceImages]);

  // â”€â”€ Unified upload handler (any images, respects slot limit) â”€â”€
  const handleUnifiedUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const current = (selectedReferenceImage ? 1 : 0) + additionalReferenceImages.length;
    const available = maxReferenceImages - current;
    if (available <= 0) {
      toast.error(`Maximum ${maxReferenceImages} image${maxReferenceImages !== 1 ? 's' : ''} for this theme`);
      e.target.value = '';
      return;
    }
    const filesToProcess = files.slice(0, available);
    let processed = 0;
    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is over 10MB â€” skipped`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        if (!selectedReferenceImage && processed === 0) {
          setReferenceSelectionTouched(true);
          setSelectedReferenceImage(url);
        } else {
          setAdditionalReferenceImages((prev) => {
            if (prev.length >= maxReferenceImages - 1) return prev;
            return [...prev, url];
          });
        }
        processed++;
        if (processed === filesToProcess.length) {
          toast.success(`${processed} image${processed > 1 ? 's' : ''} added`);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, [selectedReferenceImage, additionalReferenceImages.length, maxReferenceImages]);

  // â”€â”€ Fetch Images from URL â”€â”€
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

  const selectedPdfImage =
    effectivePdfImages.find((img) => img.signed_url === selectedReferenceImage) || null;
  const selectedSiteImage =
    fetchedSiteImages.find((img) => img.url === selectedReferenceImage) || null;
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
  const autoBackdropHintRef = useRef('');

  // â”€â”€ Generate Image (supports batch) â”€â”€
  const handleGenerate = useCallback(async () => {
    const revisionTarget = revisionTargetRef.current;
    revisionTargetRef.current = null;
    const currentVisionEntries = themeVisionEntriesRef.current;

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
    const generationAutoVisionLines = [
      contextBrief.trim()
        ? `Campaign context: ${contextBrief.trim()}.`
        : '',
      confirmedPostText
        ? `Ground the composition in the confirmed post message: ${sanitizeVisualText(confirmedPostText, 220)}.`
        : '',
      confirmedPostImageBrief
        ? `Use the confirmed post visual brief as supporting context: ${sanitizeVisualText(confirmedPostImageBrief, 180)}.`
        : '',
      effectiveHeadline
        ? `Primary headline: ${sanitizeVisualText(effectiveHeadline, 120)}.`
        : '',
      effectiveTagline
        ? `Supporting tagline: ${sanitizeVisualText(effectiveTagline, 140)}.`
        : '',
      themeUsesHeroReference && selectedReferenceImage
        ? 'Use the selected reference visual as the main hero source.'
        : themeUsesHeroReference
          ? 'Reserve the hero lane for the selected PDF or uploaded reference when one is chosen.'
          : '',
      resolvedLogoForGeneration
        ? 'Use the selected primary logo as the main brand mark in a deliberate brand zone.'
        : '',
      effectiveAllianceLogos.length > 0 || partnerName.trim()
        ? partnerTagline.trim()
          ? `Partner branding: ${sanitizeVisualText(partnerName || 'Partner brand', 64)} with supporting line "${sanitizeVisualText(partnerTagline, 90)}".`
          : `Partner branding: ${sanitizeVisualText(partnerName || 'Partner brand', 64)}.`
        : '',
      footerWebsite.trim() || footerEmail.trim()
        ? `Footer lockup: ${[sanitizeVisualText(footerWebsite, 64), sanitizeVisualText(footerEmail, 64)].filter(Boolean).join(' and ')}.`
        : '',
      benefitBullets.length > 0
        ? `Proof points: ${benefitBullets.map((line) => sanitizeVisualText(line, 120)).join('; ')}.`
        : '',
      normalizedBrandColors.length > 0
        ? `Brand palette: ${normalizedBrandColors.slice(0, 4).join(', ')}.`
        : '',
    ].filter(Boolean);
    const effectiveVisionPromptForGeneration = [
      buildVisionBriefBlock(currentVisionEntries, revisionTarget),
      generationAutoVisionLines.length > 0
        ? `AUTOMATIC CONTEXT:\n${generationAutoVisionLines.map((line) => `- ${line}`).join('\n')}`
        : '',
      isVisionUserEdited && customPrompt.trim() ? `MASTER BRIEF OVERRIDE:\n${customPrompt.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();
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

    const voxaPreflight = buildVoxaPreflight({
      themeId: selectedThemeId,
      format: imageAspect,
      aiOwnsFullPoster: selectedThemeId === 'guided-auto',
      hasStructuredBranding: selectedThemeId !== 'guided-auto',
      brandColors: normalizedBrandColors,
      brandName,
      productName: productName || undefined,
      headline: effectiveHeadline || undefined,
      tagline: effectiveTagline || undefined,
      benefits: benefitBullets,
      contextBrief: contextBrief.trim() || undefined,
      customPrompt: effectiveVisionPromptForGeneration || undefined,
      sceneBrief: autoBackdropHintRef.current,
      industry,
      website: footerWebsite.trim() || undefined,
      email: footerEmail.trim() || undefined,
      partnerName: partnerName.trim() || undefined,
      partnerTagline: partnerTagline.trim() || undefined,
      hasPrimaryLogo: Boolean(resolvedLogoForGeneration),
      secondaryLogoCount: effectiveAllianceLogos.length,
      hasReferenceImage: Boolean(selectedReferenceImage),
      referenceSummary: selectedReferenceSummary?.detail || undefined,
    });

    if (voxaPreflight.supported && voxaPreflight.errors.length > 0) {
      toast.error('VOXA preflight failed', {
        description: voxaPreflight.errors.slice(0, 2).join(' '),
      });
      return;
    }

    if (voxaPreflight.supported && voxaPreflight.warnings.length > 0 && voxaPreflight.score < 23) {
      toast.message(`VOXA preflight ${voxaPreflight.score}/25`, {
        description: voxaPreflight.warnings.slice(0, 2).join(' '),
      });
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
            customPrompt: effectiveVisionPromptForGeneration || undefined,
            generationNonce: nonce,
            imageAspect,
            referenceImageUrl: selectedReferenceImage || undefined,
            additionalReferenceUrls: additionalReferenceImages.length > 0 ? additionalReferenceImages : undefined,
          }),
        });

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: 'Generation failed' })) as {
            error?: string;
            details?: string[];
          };
          const detailText = Array.isArray(err.details) ? err.details.slice(0, 2).join(' ') : '';
          throw new Error(detailText || err.error || 'Generation failed');
        }

        const data = await res.json();

        if (data.url) {
          const rawImageUrl = (typeof data.baseUrl === 'string' && data.baseUrl.trim()) || data.url;
          let finalImageUrl: string = data.url;

          // AI integrates the logo directly via the edit endpoint â€”
          // no additional client-side blend needed (prevents double-logo).
          const shouldApplyBlend = false;

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
                  logoOpacity: logoPlacement === 'infuse' ? 0.80 : 0.92,
                  logoScale: logoPlacement === 'infuse' ? 1.0 : 1,
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

          const rationale = buildEnhancementRationale({
            themeLabel: activeTheme.label,
            entries: currentVisionEntries,
            revisionTarget,
          });
          setArtifactMetaByUrl((prev) => ({
            ...prev,
            [finalImageUrl]: {
              baseUrl: rawImageUrl,
              finalUrl: finalImageUrl,
              rationale,
              revisionTarget,
            },
          }));
          setArtifactCompareView('after');
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
        toast.success(`${successCount} ${activeTheme.label} images generated â€” pick your favourite.`);
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
    isVisionUserEdited,
    postDerivedFeatureLines,
    onImageGenerated,
    resolvedNonHeroSlotAssignments,
    themeUsesHeroReference,
    industry,
    selectedReferenceSummary,
  ]);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Confirm ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  const handleRegenerateComponent = useCallback((key: VisionComponentKey) => {
    revisionTargetRef.current = key;
    setArtifactCompareView('after');
    toast.message(`Regenerating ${VISION_COMPONENT_LABELS[key].toLowerCase()}...`, {
      description: 'The next pass will keep the rest of the approved system as stable as possible.',
    });
    void handleGenerate();
  }, [handleGenerate]);

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
  const previewedPdfImage = useMemo(() => {
    if (effectivePdfImages.length === 0) return null;
    return (
      effectivePdfImages.find((img) => img.id === previewedPdfImageId) ||
      selectedPdfImage ||
      effectivePdfImages[0] ||
      null
    );
  }, [effectivePdfImages, previewedPdfImageId, selectedPdfImage]);
  const hasReadyLogo = Boolean(uploadedLogo || primaryBrandLogoUrl);
  const selectedArtifactMeta =
    selectedImage !== null && generatedImages[selectedImage]
      ? artifactMetaByUrl[generatedImages[selectedImage]] || null
      : null;
  const isAiGuidedTheme = selectedThemeId === 'guided-auto';
  const hasUserVisionNotes = customPrompt.trim().length > 0;
  const autoBackdropHint = useMemo(
    () =>
      deriveIndustryBackdropHint(
        industry,
        analysisProfile?.businessFocus,
        analysisProfile?.brandDescription,
        analysisProfile?.targetAudience,
        productName,
        confirmedPostHeadline,
        confirmedPostImageBrief,
        confirmedPostText,
        partnerName,
        brandName
      ),
    [
      industry,
      analysisProfile?.brandDescription,
      analysisProfile?.businessFocus,
      analysisProfile?.targetAudience,
      brandName,
      confirmedPostHeadline,
      confirmedPostImageBrief,
      confirmedPostText,
      partnerName,
      productName,
    ]
  );
  useEffect(() => {
    autoBackdropHintRef.current = autoBackdropHint;
  }, [autoBackdropHint]);
  // â”€â”€ Smart Vision Auto-Compose â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const selectionDrivenVisionLines = useMemo(() => {
    const lines: string[] = [];
    const safeBusinessFocus = sanitizeVisualText(analysisProfile?.businessFocus || '', 120);
    const safeBrandDescription = sanitizeVisualText(analysisProfile?.brandDescription || '', 160);
    const safeAudience = sanitizeVisualText(analysisProfile?.targetAudience || '', 100);
    const safePartnerName = sanitizeVisualText(partnerName || '', 48);
    const safePartnerTagline = sanitizeVisualText(partnerTagline || '', 72);
    const safeFooterWebsite = sanitizeVisualText(footerWebsite || '', 64);
    const safeFooterEmail = sanitizeVisualText(footerEmail || '', 64);
    const safeReferenceDetail = sanitizeVisualText(
      selectedReferenceSummary?.detail || selectedPdfImage?.title || selectedSiteImage?.source || '',
      120
    );
    const featureSummary = previewFeatureLines.slice(0, selectedThemeId === 'industrial-campaign' ? 4 : 5);

    lines.push(
      `Use the ${activeTheme.label} theme as the layout and composition direction. ${sanitizeVisualText(activeTheme.description, 160)}`
    );
    lines.push(deriveThemeLayoutHint(selectedThemeId));

    if (safeBusinessFocus) {
      lines.push(`Client category: ${safeBusinessFocus}.`);
    } else if (safeBrandDescription) {
      lines.push(`Client context: ${safeBrandDescription}.`);
    }

    if (safeAudience) {
      lines.push(`Target audience: ${safeAudience}.`);
    }

    lines.push(`Background direction: ${autoBackdropHint}`);

    if (currentTone?.label || currentStyle?.label) {
      lines.push(
        `Creative mode: ${currentTone?.label || 'Professional'} tone with ${currentStyle?.label || 'Split Layout'} styling.`
      );
    }

    if (activeHeadlineText) {
      lines.push(`Support this headline clearly: "${sanitizeVisualText(activeHeadlineText, 96)}".`);
    }

    if (activeTaglineText) {
      lines.push(`Optional support line: "${sanitizeVisualText(activeTaglineText, 120)}".`);
    }

    if (safeReferenceDetail) {
      lines.push(`Use the selected reference visual as the main hero truth: ${safeReferenceDetail}.`);
    } else if (themeUsesHeroReference) {
      lines.push('Use a strong hero visual lane and make the selected PDF or uploaded reference the main subject when one is chosen.');
    }

    if (hasReadyLogo) {
      lines.push('Use the selected primary logo as the main brand mark in a clean, premium brand zone.');
    }

    if (allianceHeaderLogos.length > 0 || safePartnerName) {
      lines.push(
        safePartnerTagline
          ? `Use partner branding in the header area for ${safePartnerName || 'the partner brand'} with the supporting line "${safePartnerTagline}".`
          : `Use partner branding in the header area for ${safePartnerName || 'the partner brand'}.`
      );
    }

    if (safeFooterWebsite || safeFooterEmail) {
      const footerBits = [safeFooterWebsite, safeFooterEmail].filter(Boolean);
      lines.push(`Keep a clean footer lockup with ${footerBits.join(' and ')}.`);
    }

    if (featureSummary.length > 0) {
      lines.push(`Support these proof points: ${featureSummary.join('; ')}.`);
    }

    if (normalizedBrandColors.length > 0) {
      lines.push(`Stay inside the selected brand palette: ${normalizedBrandColors.slice(0, 4).join(', ')}.`);
    }

    return lines
      .map((line) => sanitizeVisualText(line, 220))
      .filter(Boolean)
      .slice(0, 10);
  }, [
    activeHeadlineText,
    activeTaglineText,
    activeTheme.description,
    activeTheme.label,
    allianceHeaderLogos.length,
    analysisProfile?.brandDescription,
    analysisProfile?.businessFocus,
    analysisProfile?.targetAudience,
    autoBackdropHint,
    currentStyle?.label,
    currentTone?.label,
    footerEmail,
    footerWebsite,
    hasReadyLogo,
    normalizedBrandColors,
    partnerName,
    partnerTagline,
    previewFeatureLines,
    selectedPdfImage?.title,
    selectedReferenceSummary?.detail,
    selectedSiteImage?.source,
    selectedThemeId,
    themeUsesHeroReference,
  ]);
  const autoVisionBrief = useMemo(
    () =>
      selectionDrivenVisionLines.length > 0
        ? `AUTO-FED AI DIRECTION:\n${selectionDrivenVisionLines.map((line) => `- ${line}`).join('\n')}`
        : '',
    [selectionDrivenVisionLines]
  );
  const themePaletteRoles = useMemo(
    () => [
      { label: 'Primary', value: derivedThemePalette.bgStart, hint: 'Main backgrounds and headings' },
      { label: 'Secondary', value: derivedThemePalette.bgEnd, hint: 'Large surfaces and gradients' },
      { label: 'Accent', value: derivedThemePalette.accent, hint: 'CTA and key emphasis' },
      { label: 'Support', value: derivedThemePalette.support, hint: 'Checks, tags, and highlights' },
    ],
    [derivedThemePalette]
  );
  const themeVisionOptions = useMemo<Record<VisionComponentKey, VisionComponentOption[]>>(() => {
    const baselineBrandColors = baselineBrandColorsRef.current;
    const paletteActionOptions = [
      {
        id: 'saved-brand',
        label: 'Restore Saved',
        description: 'Go back to the saved brand palette.',
        colors: baselineBrandColors,
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
      },
    ].filter((action) => action.colors.length > 0);
    const toneLabel = currentTone?.label || selectedTone || 'Professional';
    const styleLabel = currentStyle?.label || selectedStyle || 'Split Layout';
    const safeHeroSubject =
      selectedReferenceSummary?.detail ||
      selectedPdfImage?.title ||
      selectedSiteImage?.source ||
      productName ||
      brandName ||
      'brand-led subject';
    const paletteSignature = themePaletteRoles
      .map((swatch) => `${swatch.label} ${swatch.value}`)
      .join(', ');
    const footerLockup = [footerWebsite, footerEmail].filter(Boolean).join(' | ') || brandName || 'brand signature';
    const bulletSummary =
      previewFeatureLines.slice(0, selectedThemeId === 'industrial-campaign' ? 4 : 3).join('; ') ||
      'short proof-led bullet stack';
    const logoPresence = hasReadyLogo ? 'selected main logo is available' : 'no logo has been uploaded yet';
    const overlayOpacity =
      selectedStyle === 'cinematic'
        ? '62%'
        : selectedStyle === 'text-overlay'
          ? '68%'
          : selectedStyle === 'photo-blend'
            ? '54%'
            : '58%';

    return {
      heroImage: [
        {
          id: 'hero-reference-led',
          label: 'Reference-Led Hero',
          summary: 'Uses the chosen reference as the focal subject with a cleaner crop and stronger staging.',
          details: [
            `Style: ${themeUsesHeroReference || selectedReferenceImage ? 'reference-led photographic hero' : `${styleLabel.toLowerCase()} hero composition`}`,
            `Mood: ${toneLabel.toLowerCase()} with ${sanitizeVisualText(activeTheme.label, 42).toLowerCase()} energy`,
            `Subject: ${sanitizeVisualText(safeHeroSubject, 72)}`,
            `Placement: ${selectedThemeId === 'alliance-poster' || selectedThemeId === 'industrial-campaign' ? 'left hero bay with protected headline lane' : 'primary focal zone inside the theme layout'}`,
          ],
          autoText: `Use a ${toneLabel.toLowerCase()} hero image built around ${sanitizeVisualText(safeHeroSubject, 96)}. Keep the crop disciplined, preserve the subject focal point, and stage it so the ${activeTheme.label} layout still has calm text-safe space.`,
        },
        {
          id: 'hero-cinematic',
          label: 'Cinematic Focus',
          summary: 'Pushes the hero toward deeper contrast, stronger depth, and more atmospheric lighting.',
          details: [
            'Style: cinematic photographic treatment',
            `Mood: dramatic ${sanitizeVisualText(toneLabel, 32).toLowerCase()} atmosphere`,
            `Subject: ${sanitizeVisualText(safeHeroSubject, 72)}`,
            'Placement: full-bleed focal subject with a deliberately quieter copy side',
          ],
          autoText: `Treat the hero image like a cinematic focal frame: sharper lighting, deeper contrast, and richer atmosphere around ${sanitizeVisualText(safeHeroSubject, 96)} while protecting a calm area for copy.`,
        },
        {
          id: 'hero-contextual',
          label: 'Contextual Story',
          summary: 'Shows more environment and category context so the image feels specific to the client, not generic stock.',
          details: [
            `Style: ${styleLabel.toLowerCase()} with environmental context`,
            `Mood: ${sanitizeVisualText(autoBackdropHint, 80)}`,
            `Subject: ${sanitizeVisualText(safeHeroSubject, 72)}`,
            'Placement: wider environmental framing with secondary detail in the background',
          ],
          autoText: `Show ${sanitizeVisualText(safeHeroSubject, 96)} inside a believable client-specific environment. Keep enough context to communicate category and industry while still preserving a strong focal point.`,
        },
      ],
      header: [
        {
          id: 'header-brand-band',
          label: 'Brand Band',
          summary: 'A disciplined header band with clear brand lockup and headline rhythm.',
          details: [
            'Font: bold sans-serif, 44-60px equivalent headline scale',
            `Placement: ${selectedThemeId === 'launch-banner' || selectedThemeId === 'hiring-banner' ? 'centered top band' : 'structured top header lane'}`,
            `Style: ${sanitizeVisualText(deriveThemeLayoutHint(selectedThemeId), 92)}`,
          ],
          autoText: `Use a disciplined header band. The brand lockup and headline should feel intentional, aligned, and clearly separated from the hero image, with bold sans-serif hierarchy and premium spacing.`,
        },
        {
          id: 'header-editorial',
          label: 'Editorial Masthead',
          summary: 'Keeps the top treatment more editorial and less template-like, with cleaner whitespace.',
          details: [
            'Font: bold editorial sans with tighter tracking',
            'Placement: headline-led top lane with restrained brand support',
            'Style: premium masthead rhythm with calmer whitespace',
          ],
          autoText: `Make the header feel editorial rather than templated: use a strong masthead-like headline treatment, tighter rhythm, and enough whitespace that the top of the composition feels premium.`,
        },
        {
          id: 'header-minimal',
          label: 'Minimal Ribbon',
          summary: 'Uses a lighter-weight ribbon so the hero image carries more of the visual drama.',
          details: [
            'Font: medium-to-bold sans, controlled scale',
            'Placement: slim top ribbon or corner-led lockup',
            'Style: restrained and brand-native, with minimal chrome',
          ],
          autoText: `Keep the header minimal and calm. Use a restrained ribbon or lockup rather than a heavy banner so the image keeps more of the attention without losing brand clarity.`,
        },
      ],
      footer: [
        {
          id: 'footer-split-strip',
          label: 'Split Contact Strip',
          summary: 'A clean footer that separates website and email into a disciplined contact lane.',
          details: [
            'Layout: slim split footer bar',
            `Content blocks: ${sanitizeVisualText(footerLockup, 88)}`,
            'Style: low-noise informational strip with consistent baseline rhythm',
          ],
          autoText: `Use a slim split footer strip for ${sanitizeVisualText(footerLockup, 120)}. Keep it readable, low-noise, and visually aligned with the header so both feel like one system.`,
        },
        {
          id: 'footer-signature',
          label: 'Signature Footer',
          summary: 'Uses a quieter footer treatment that feels like a signature instead of a utility bar.',
          details: [
            'Layout: single-line signature footer',
            `Content blocks: ${sanitizeVisualText(footerLockup, 88)}`,
            'Style: premium restrained signature aligned to one side',
          ],
          autoText: `Use a restrained signature footer with ${sanitizeVisualText(footerLockup, 120)}. It should feel elegant and secondary, never like a crowded utility bar.`,
        },
        {
          id: 'footer-branded',
          label: 'Branded Footer Band',
          summary: 'Turns the footer into a more visible brand-colored closing band when the theme needs more structure.',
          details: [
            'Layout: visible brand-colored footer band',
            `Content blocks: ${sanitizeVisualText(footerLockup, 88)}`,
            'Style: stronger closure with a clearer design-system edge',
          ],
          autoText: `Finish the composition with a branded footer band. Use ${sanitizeVisualText(footerLockup, 120)} inside a stronger closing lane that still stays clean and readable.`,
        },
      ],
      body: [
        {
          id: 'body-proof-stack',
          label: 'Proof Stack',
          summary: 'Uses stacked proof bullets or cards for fast-scanning LinkedIn readability.',
          details: [
            'Typography: 14-18px equivalent bullets with medium-to-bold weight',
            'Spacing: 12-16px vertical rhythm between proof items',
            `Visual style: proof-led stack using ${sanitizeVisualText(bulletSummary, 100)}`,
          ],
          autoText: `Use a proof-stack body treatment with short, high-signal bullet points such as ${sanitizeVisualText(bulletSummary, 120)}. Keep the vertical rhythm deliberate and the bullets easy to scan at feed size.`,
        },
        {
          id: 'body-editorial',
          label: 'Editorial Copy Block',
          summary: 'Reduces bullet density and uses a cleaner narrative block with stronger hierarchy.',
          details: [
            'Typography: large supporting copy with lighter density',
            'Spacing: generous line-height and calmer separation from the headline',
            'Visual style: narrative-led copy lane with one or two emphasized proof points',
          ],
          autoText: `Use an editorial body style: fewer bullets, more narrative hierarchy, and deliberate spacing so the supporting text feels written and art-directed rather than stuffed into the layout.`,
        },
        {
          id: 'body-cards',
          label: 'Callout Cards',
          summary: 'Turns the body area into modular callout cards with more visible separation.',
          details: [
            'Typography: short labels and concise support text',
            'Spacing: modular card rhythm with protected gutters',
            'Visual style: separated proof modules instead of one continuous text block',
          ],
          autoText: `Break the body zone into modular callout cards. Each card should carry one clean proof point or benefit with generous gutters and clear hierarchy.`,
        },
      ],
      logo: [
        {
          id: 'logo-corner-lockup',
          label: 'Header Lockup',
          summary: 'Places the logo in a disciplined header rail so it feels integrated and highly legible.',
          details: [
            `Position: ${selectedThemeId === 'alliance-poster' || selectedThemeId === 'industrial-campaign' ? 'top-left header fascia' : 'top-left structured brand rail'}`,
            'Background: native header surface or restrained plated lockup with clear separation',
            `Treatment: refined and readable without looking stickered on`,
          ],
          autoText: `Use the selected logo in a disciplined header lockup with a native brand surface and enough breathing room that it feels built into the composition, not pasted on top.`,
          apply: { logoPlacement: hasReadyLogo ? 'overlay' : 'none' },
        },
        {
          id: 'logo-native-infusion',
          label: 'Native Infusion',
          summary: 'Treats the logo as part of the composition language, not a separate sticker.',
          details: [
            `Position: integrated into a header or brand lane`,
            'Background: native to the composition, with colors and shadows tuned around it',
            'Treatment: blend the mark into the surrounding design system',
          ],
          autoText: `Infuse the selected logo into the composition. Adjust surrounding colors, spacing, and shadow language so the mark feels designed into the layout rather than dropped on top.`,
          apply: { logoPlacement: hasReadyLogo ? 'infuse' : 'none' },
        },
        {
          id: 'logo-minimal',
          label: 'Minimal Mark',
          summary: 'Keeps the logo quieter so the content system or hero image stays dominant.',
          details: [
            'Position: reduced-size supporting brand zone',
            'Background: minimal or no container treatment',
            'Treatment: low-noise brand presence with careful contrast',
          ],
          autoText: `Keep the logo treatment restrained. Use the mark as a quiet supporting brand cue rather than a dominant element, but maintain enough contrast for trust and recognition.`,
          apply: { logoPlacement: hasReadyLogo ? logoPlacement : 'none' },
        },
      ],
      palette: [
        {
          id: 'palette-current',
          label: 'Current Brand Palette',
          summary: 'Uses the currently active saved/edited palette as the main color system.',
          details: themePaletteRoles.map((swatch) => `${swatch.label}: ${swatch.value}`),
          autoText: `Use the active brand palette exactly as shown: ${paletteSignature}. Treat these swatches as the main design system for backgrounds, accents, text-safe zones, and supporting UI.`,
          apply: { paletteColors: normalizedBrandColors },
        },
        ...paletteActionOptions.slice(0, 2).map((action) => ({
          id: `palette-${action.id}`,
          label: action.label,
          summary: action.description,
          details: action.colors.slice(0, 4).map((color, index) => `Swatch ${index + 1}: ${color}`),
          autoText: `Use the ${action.label.toLowerCase()} palette direction: ${action.colors.slice(0, 4).join(', ')}. Keep the theme colors coherent across hero, overlay, header, and footer.`,
          apply: { paletteColors: action.colors },
        })),
      ],
      overlay: [
        {
          id: 'overlay-brand-gradient',
          label: 'Brand Gradient Shield',
          summary: 'A brand-tinted gradient overlay that protects readability while keeping the hero personality visible.',
          details: [
            'Type: gradient',
            `Opacity: approximately ${overlayOpacity}`,
            `Bias: built from ${derivedThemePalette.bgStart} into ${derivedThemePalette.accent}`,
          ],
          autoText: `Use a brand-tinted gradient overlay at roughly ${overlayOpacity}. It should preserve the hero image personality, but protect headline and body readability with colors pulled from the active brand palette.`,
        },
        {
          id: 'overlay-contrast-veil',
          label: 'Contrast Veil',
          summary: 'A softer contrast-correction veil for busy photography or higher-detail backgrounds.',
          details: [
            'Type: soft solid-to-transparent veil',
            'Opacity: approximately 52%',
            'Bias: tuned for WCAG-friendly text contrast over busy detail',
          ],
          autoText: `Use a softer contrast veil instead of a heavy generic dark wash. Correct for busy detail, keep the image alive, and make the copy zones comfortably readable without flattening the scene.`,
        },
        {
          id: 'overlay-minimal',
          label: 'Minimal Overlay',
          summary: 'Uses the lightest overlay touch when the image already has strong natural text-safe space.',
          details: [
            'Type: minimal gradient or none',
            'Opacity: 24-32%',
            'Bias: preserve natural image tonality with only a small text-safe correction',
          ],
          autoText: `Keep the overlay minimal. Only add enough of a brand-matched wash to preserve readability while letting the natural hero tonality lead.`,
        },
      ],
    };
  }, [
    activeTheme.label,
    autoBackdropHint,
    brandName,
    currentStyle?.label,
    currentTone?.label,
    derivedThemePalette.accent,
    derivedThemePalette.bgEnd,
    derivedThemePalette.bgStart,
    derivedThemePalette.support,
    footerEmail,
    footerWebsite,
    hasReadyLogo,
    logoPlacement,
    normalizedBrandColors,
    previewFeatureLines,
    productName,
    selectedPdfImage?.title,
    selectedReferenceImage,
    selectedReferenceSummary?.detail,
    selectedSiteImage?.source,
    selectedStyle,
    selectedThemeId,
    selectedTone,
    themePaletteRoles,
    themeUsesHeroReference,
  ]);
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
  useEffect(() => {
    setVisionSelections((prev) => {
      const next: Partial<Record<VisionComponentKey, string>> = { ...prev };
      let changed = false;

      for (const key of VISION_COMPONENT_ORDER) {
        const options = themeVisionOptions[key] || [];
        if (options.length === 0) continue;
        const currentId = prev[key];
        if (!currentId || !options.some((option) => option.id === currentId)) {
          next[key] = options[0].id;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [themeVisionOptions]);

  useEffect(() => {
    setAcceptedVisionComponents(createVisionAcceptedState(false));
    setVisionOverrides(createVisionOverrideState());
    setVisionSelections({});
  }, [brandId, selectedThemeId]);

  const themeVisionEntries = useMemo<VisionComponentEntry[]>(() => {
    return VISION_COMPONENT_ORDER.map((key) => {
      const options = themeVisionOptions[key] || [];
      const selectedOptionId = visionSelections[key];
      const option =
        options.find((item) => item.id === selectedOptionId) ||
        options[0] || {
          id: `${key}-fallback`,
          label: 'Default',
          summary: 'Default component state',
          details: [],
          autoText: '',
        };
      const overrideText = visionOverrides[key] || '';
      return {
        key,
        label: VISION_COMPONENT_LABELS[key],
        option,
        accepted: acceptedVisionComponents[key],
        overrideText,
        resolvedText: (overrideText.trim() || option.autoText || '').trim(),
      };
    });
  }, [acceptedVisionComponents, themeVisionOptions, visionOverrides, visionSelections]);

  useEffect(() => {
    themeVisionOptionsRef.current = themeVisionOptions;
  }, [themeVisionOptions]);

  useEffect(() => {
    themeVisionEntriesRef.current = themeVisionEntries;
  }, [themeVisionEntries]);

  const orderedVisionEntries = useMemo(
    () =>
      [...themeVisionEntries].sort((left, right) => {
        if (left.accepted === right.accepted) {
          return VISION_COMPONENT_ORDER.indexOf(left.key) - VISION_COMPONENT_ORDER.indexOf(right.key);
        }
        return left.accepted ? -1 : 1;
      }),
    [themeVisionEntries]
  );

  const acceptedVisionCount = useMemo(
    () => themeVisionEntries.filter((entry) => entry.accepted).length,
    [themeVisionEntries]
  );
  const composedVision = useMemo(
    () => {
      const baselineVision = composeSmartVision({
        industry,
        businessFocus: analysisProfile?.businessFocus,
        brandDescription: analysisProfile?.brandDescription,
        targetAudience: analysisProfile?.targetAudience,
        brandName,
        productName,
        tagline: analysisProfile?.tagline,
        tone: analysisProfile?.tone,
        imageStyle: analysisProfile?.imageStyle,
        themeLabel: activeTheme.label,
        themeLayoutHint: deriveThemeLayoutHint(selectedThemeId),
        headline: activeHeadlineText || undefined,
        taglineText: activeTaglineText || undefined,
        featureBullets: previewFeatureLines.length > 0 ? previewFeatureLines : undefined,
        hasLogo: hasReadyLogo,
        partnerName: partnerName || undefined,
        footerWebsite: footerWebsite || undefined,
        footerEmail: footerEmail || undefined,
        brandColors: normalizedBrandColors.length > 0 ? normalizedBrandColors : undefined,
        toneName: currentTone?.label,
        styleName: currentStyle?.label,
        referenceDetail:
          selectedReferenceSummary?.detail ||
          selectedPdfImage?.title ||
          selectedSiteImage?.source ||
          undefined,
      });
      const componentLines = themeVisionEntries.map((entry) => {
        const status = entry.accepted ? 'Approved' : 'Draft';
        return `${status} ${entry.label}: ${sanitizeVisualText(entry.resolvedText, 160)}.`;
      });

      return [baselineVision, 'My Vision components:', ...componentLines]
        .filter(Boolean)
        .join('\n')
        .slice(0, 1800);
    },
    [
      industry,
      analysisProfile?.businessFocus,
      analysisProfile?.brandDescription,
      analysisProfile?.targetAudience,
      analysisProfile?.tagline,
      analysisProfile?.tone,
      analysisProfile?.imageStyle,
      brandName,
      productName,
      activeTheme.label,
      selectedThemeId,
      activeHeadlineText,
      activeTaglineText,
      previewFeatureLines,
      hasReadyLogo,
      partnerName,
      footerWebsite,
      footerEmail,
      normalizedBrandColors,
      currentTone?.label,
      currentStyle?.label,
      selectedReferenceSummary?.detail,
      selectedPdfImage?.title,
      selectedSiteImage?.source,
      themeVisionEntries,
    ]
  );
  const effectiveVisionPrompt = useMemo(
    () => {
      if (!isVisionUserEdited && customPrompt.trim()) {
        return `AUTO-COMPOSED CREATIVE BRIEF:\n${customPrompt.trim()}`;
      }
      return [
        buildVisionBriefBlock(themeVisionEntries),
        autoVisionBrief,
        hasUserVisionNotes ? `MASTER BRIEF OVERRIDE:\n${customPrompt.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
    },
    [autoVisionBrief, customPrompt, hasUserVisionNotes, isVisionUserEdited, themeVisionEntries]
  );
  const visionPreviewText = useMemo(
    () =>
      hasUserVisionNotes
        ? customPrompt.trim()
        : themeVisionEntries.slice(0, 4).map((entry) => entry.resolvedText).join(' '),
    [customPrompt, hasUserVisionNotes, themeVisionEntries]
  );

  useEffect(() => {
    if (isVisionUserEdited) return;
    if (visionComposeTimerRef.current) {
      clearTimeout(visionComposeTimerRef.current);
    }
    visionComposeTimerRef.current = setTimeout(() => {
      setCustomPrompt(composedVision);
    }, 300);
    return () => {
      if (visionComposeTimerRef.current) {
        clearTimeout(visionComposeTimerRef.current);
      }
    };
  }, [composedVision, isVisionUserEdited]);

  useEffect(() => {
    setIsVisionUserEdited(false);
  }, [brandId]);

  useEffect(() => {
    setIsVisionUserEdited(false);
  }, [selectedThemeId]);

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
        : isAiGuidedTheme && !effectiveVisionPrompt
          ? 'Add Your Vision or enough theme/client details so AI Guided knows what to build.'
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
  // Match on any word â‰¥4 chars from an image title appearing in the prompt (case-insensitive).
  const promptMatchedPdfImage = useMemo(() => {
    if (!customPrompt.trim() || effectivePdfImages.length === 0) return null;
    const promptLower = normalizedPrompt;
    // Score each image by how many of its title words appear in the prompt
    let bestMatch: { img: typeof effectivePdfImages[number]; score: number } | null = null;
    for (const img of effectivePdfImages) {
      const words = img.title
        .toLowerCase()
        .replace(/[â€¢Â·â€”â€“]/g, ' ')
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
      {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â LEFT: Form Controls ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
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

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Post Context (if available) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 1. Logo Upload ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

            {/* Selected theme indicator â€” minimal since right panel shows preview */}
            <div className="rounded-lg border border-fuchsia-200/60 bg-fuchsia-50/40 px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-fuchsia-500 flex-shrink-0" />
              <p className="text-[11px] text-fuchsia-700 font-medium truncate">{activeTheme.label}: {activeTheme.summary}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Stage 1 Â· Theme Breakdown
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Review each theme component, then accept or swap it before you generate.
                  </p>
                </div>
                <Badge className="border border-slate-200 bg-slate-50 text-slate-600 text-[9px]">
                  {acceptedVisionCount}/{VISION_COMPONENT_ORDER.length} accepted
                </Badge>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {themeVisionEntries.map((entry) => {
                  const isPalette = entry.key === 'palette';
                  return (
                    <div
                      key={`theme-component-${entry.key}`}
                      className={`rounded-xl border px-3 py-3 transition-all ${
                        entry.accepted
                          ? 'border-emerald-200 bg-emerald-50/60 shadow-sm'
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {entry.label}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{entry.option.label}</p>
                        </div>
                        <Badge className={`text-[9px] ${entry.accepted ? 'border-emerald-300 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                          {entry.accepted ? 'Accepted' : 'Draft'}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-slate-600">{entry.option.summary}</p>
                      <div className="mt-2 space-y-1">
                        {entry.option.details.slice(0, 4).map((detail) => (
                          <p key={`${entry.key}-${detail}`} className="text-[11px] leading-5 text-slate-700">
                            <span className="mr-1 text-fuchsia-500">â€¢</span>
                            {detail}
                          </p>
                        ))}
                      </div>
                      {isPalette && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {themePaletteRoles.map((swatch) => (
                            <div
                              key={`${entry.key}-${swatch.label}`}
                              className="h-6 w-6 rounded-md border border-white shadow-sm ring-1 ring-slate-200/70"
                              style={{ backgroundColor: swatch.value }}
                              title={`${swatch.label}: ${swatch.value}`}
                            />
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSwapVisionOption(entry.key)}
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 transition-colors hover:border-fuchsia-200 hover:bg-fuchsia-50"
                        >
                          Swap
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleVisionAcceptance(entry.key)}
                          className={`inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
                            entry.accepted
                              ? 'border border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'border border-slate-200 bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          {entry.accepted ? 'Accepted' : 'Accept'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* â”€â”€ Theme Palette & Brand Colors â”€â”€ */}
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

              {/* Brand color swatches â€” always editable */}
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

                {/* Inline color picker â€” always visible when editing or no colors */}
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

            {/* â”€â”€ Theme Image Slot Pickers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                              ? `Reference image active â€” AI will use this as hero for ${activeTheme.label}.`
                              : 'Reference image active â€” AI will use this as hero.'}
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
                          <button
                            type="button"
                            onClick={() => triggerSlotUpload(slot.id)}
                            className="w-full aspect-square rounded-md border-2 border-dashed border-indigo-300 bg-indigo-50/50 flex flex-col items-center justify-center gap-1 hover:bg-indigo-100/60 hover:border-indigo-400 transition-colors cursor-pointer"
                          >
                            <Upload className="w-5 h-5 text-indigo-400" />
                            <span className="text-[9px] text-indigo-500 font-medium">Upload</span>
                          </button>
                        )}
                        {/* Quick-pick from available images + upload */}
                        <div className="flex flex-wrap gap-1 max-h-[96px] overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => triggerSlotUpload(slot.id)}
                            className="w-10 h-10 rounded border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center flex-shrink-0 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                            title="Upload image for this slot"
                          >
                            <Upload className="w-3.5 h-3.5 text-slate-400" />
                          </button>
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
                              className={`w-10 h-10 rounded border overflow-hidden flex-shrink-0 transition-all ${
                                assigned === img.signed_url
                                  ? 'border-indigo-400 ring-2 ring-indigo-300'
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
                              className={`w-10 h-10 rounded border overflow-hidden flex-shrink-0 transition-all ${
                                assigned === img.url
                                  ? 'border-indigo-400 ring-2 ring-indigo-300'
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
                              className={`w-10 h-10 rounded border overflow-hidden flex-shrink-0 transition-all ${
                                assigned === selectedReferenceImage
                                  ? 'border-indigo-400 ring-2 ring-indigo-300'
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

            <input
              ref={additionalImagesInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleAdditionalImagesUpload}
              className="hidden"
            />

            <input
              ref={unifiedUploadRef}
              type="file"
              accept="image/*"
              multiple={maxReferenceImages > 1}
              onChange={handleUnifiedUpload}
              className="hidden"
            />

            <input
              ref={slotUploadInputRef}
              type="file"
              accept="image/*"
              onChange={handleSlotImageUpload}
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

          {/* â”€â”€ Theme Details (merged) â”€â”€ */}
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


        {/* â”€â”€ Reference Images â€” Unified (Upload / PDF / URL) â”€â”€ */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm hover:border-indigo-300 transition-colors">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                <ImageIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-900">
                  Reference Images
                  {totalSelectedImages > 0 && (
                    <span className="ml-1.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                      {totalSelectedImages} / {maxReferenceImages}
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-gray-400">
                  Select up to {maxReferenceImages} image{maxReferenceImages !== 1 ? 's' : ''} for {activeTheme.label}
                </p>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            <button type="button" onClick={() => setImageSourceTab('upload')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-all ${imageSourceTab === 'upload' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
            <button type="button" onClick={() => setImageSourceTab('pdf')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-all ${imageSourceTab === 'pdf' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <FileText className="w-3.5 h-3.5" />
              From PDF
              {effectivePdfImages.length > 0 && (
                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded-full">{effectivePdfImages.length}</span>
              )}
            </button>
            <button type="button" onClick={() => setImageSourceTab('url')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-all ${imageSourceTab === 'url' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Link2 className="w-3.5 h-3.5" />
              From URL
            </button>
          </div>

          {/* Upload tab */}
          {imageSourceTab === 'upload' && (
            <button
              type="button"
              onClick={() => unifiedUploadRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 py-6 text-center transition-all hover:border-indigo-400 hover:bg-indigo-50"
            >
              <Upload className="mx-auto mb-1 h-5 w-5 text-indigo-500" />
              <p className="text-sm font-medium text-indigo-700">
                {maxReferenceImages > 1 ? 'Upload images' : 'Upload image'}
              </p>
              <p className="text-[10px] text-indigo-400">PNG, JPG, or WebP â€” up to 10MB</p>
            </button>
          )}

          {/* PDF tab */}
          {imageSourceTab === 'pdf' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
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
                  <button type="button" onClick={onRefreshEvidence} className="text-[10px] text-slate-400 hover:text-emerald-600 font-medium flex items-center gap-1 transition-colors">
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                )}
              </div>

              {(isUploadingPdfImages || isReextractingPdfImages) && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{isUploadingPdfImages ? 'Uploading PDFs and extracting visuals...' : 'Re-extracting visuals...'}</span>
                </div>
              )}

              {isLoadingPdf ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning PDFs for images...
                </div>
              ) : effectivePdfImages.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {effectivePdfImages.map((img) => {
                    const isSelected = selectedReferenceImage === img.signed_url || additionalReferenceImages.includes(img.signed_url);
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => handleUnifiedImageSelect(img.signed_url)}
                        className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected
                            ? 'border-indigo-400 ring-2 ring-indigo-200 shadow-md'
                            : 'border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        <img src={img.signed_url} alt={img.title || 'PDF image'} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        {isSelected && (
                          <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-white drop-shadow-md" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <ImageIcon className="w-5 h-5 text-slate-300" />
                  <p className="text-xs text-gray-500">No PDF images found</p>
                  <p className="text-[10px] text-gray-400">Upload a PDF to extract visuals</p>
                </div>
              )}
            </div>
          )}

          {/* URL tab */}
          {imageSourceTab === 'url' && (
            <div className="space-y-3">
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
                  {isFetchingSiteImages ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Fetch'}
                </Button>
              </div>

              {fetchedSiteImages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-700 font-semibold">
                    {fetchedSiteImages.length} image{fetchedSiteImages.length !== 1 ? 's' : ''} found
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {fetchedSiteImages.map((img, i) => {
                      const isSelected = selectedReferenceImage === img.url || additionalReferenceImages.includes(img.url);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleUnifiedImageSelect(img.url)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            isSelected
                              ? 'border-indigo-400 ring-2 ring-indigo-200'
                              : 'border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <img src={img.url} alt={`Site image ${i + 1}`} className="w-full h-full object-cover" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5 text-white drop-shadow-md" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected images */}
          {totalSelectedImages > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-[11px] font-semibold text-slate-700">
                {totalSelectedImages} of {maxReferenceImages} selected
              </p>
              <div className={`grid gap-2 ${maxReferenceImages >= 3 ? 'grid-cols-3' : maxReferenceImages === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {selectedReferenceImage && (
                  <div className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square">
                    <img src={selectedPdfImage?.signed_url || selectedSiteImage?.url || selectedReferenceImage} alt="Hero" className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Hero</div>
                    <button
                      type="button"
                      onClick={() => { setReferenceSelectionTouched(true); setSelectedReferenceImage(null); }}
                      className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {additionalReferenceImages.map((imgUrl, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square">
                    <img src={imgUrl} alt={`Reference ${i + 2}`} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">{i + 2}</div>
                    <button
                      type="button"
                      onClick={() => removeAdditionalReference(i)}
                      className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* â”€â”€ 2. Your Vision / Creative Prompt â”€â”€ */}

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 2. Your Vision / Creative Prompt ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        {/* Your Vision */}
        <Card className={`p-3.5 space-y-2.5 bg-white border shadow-sm ${isAiGuidedTheme ? 'border-violet-300 bg-violet-50/30' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-violet-500" />
            <h3 className="font-semibold text-sm text-slate-900">
              My Vision <span className="text-[10px] font-normal text-gray-400">(live brief)</span>
            </h3>
            <Badge className="border border-violet-200 bg-violet-100 text-violet-700 text-[9px]">
              Selection-fed
            </Badge>
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
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  AI Direction From Your Selections
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">
                  Theme, client category, logos, footer details, proof points, selected visuals, and palette are merged automatically.
                </p>
              </div>
              <Badge className="border border-slate-200 bg-white text-slate-600 text-[9px]">
                Auto
              </Badge>
            </div>
            <div className="mt-2 space-y-1.5">
              {selectionDrivenVisionLines.slice(0, 6).map((line, index) => (
                <p key={`${line}-${index}`} className="text-[11px] leading-5 text-slate-800">
                  <span className="mr-1 text-violet-500">â€¢</span>
                  {line}
                </p>
              ))}
            </div>
          </div>
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
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  Stage 2 Â· My Vision
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">
                  This brief grows as you approve components. Edit any field to override the auto direction.
                </p>
              </div>
              <Badge className="border border-slate-200 bg-white text-slate-600 text-[9px]">
                {acceptedVisionCount} approved
              </Badge>
            </div>

            <div className="mt-3 space-y-2">
              <AnimatePresence initial={false}>
                {orderedVisionEntries.map((entry) => (
                  <motion.div
                    key={`vision-entry-${entry.key}-${entry.option.id}-${entry.accepted ? 'accepted' : 'draft'}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: [0.19, 1, 0.22, 1] }}
                    className={`rounded-xl border p-3 ${
                      entry.accepted
                        ? 'border-emerald-200 bg-white shadow-sm'
                        : 'border-slate-200 bg-white/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          {entry.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{entry.option.label}</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-600">{entry.option.summary}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSwapVisionOption(entry.key)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 transition-colors hover:border-fuchsia-200 hover:bg-fuchsia-50"
                        >
                          Swap
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleVisionAcceptance(entry.key)}
                          className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                            entry.accepted
                              ? 'border border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'border border-slate-200 bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          {entry.accepted ? 'Approved' : 'Approve'}
                        </button>
                      </div>
                    </div>
                    <Textarea
                      value={entry.overrideText || entry.option.autoText}
                      onChange={(e) => handleVisionOverrideChange(entry.key, e.target.value)}
                      rows={2}
                      className="mt-3 resize-none border-slate-200 bg-white text-sm text-slate-900"
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Badge className={`text-[9px] ${isVisionUserEdited ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                {isVisionUserEdited ? 'Custom' : 'Auto-composed'}
              </Badge>
            </div>
            {isVisionUserEdited && (
              <button
                type="button"
                onClick={() => {
                  setIsVisionUserEdited(false);
                  setCustomPrompt(composedVision);
                }}
                className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reset to auto-vision
              </button>
            )}
          </div>
          <p className="text-[11px] leading-5 text-slate-500">
            Master brief. This is the combined prompt that goes to the AI. Edit it directly if you want to override the structured vision cards above.
          </p>
          <Textarea
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              if (!isVisionUserEdited) setIsVisionUserEdited(true);
            }}
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
              ? 'You do not need to write everything manually. Add only the refinements: subject nuance, camera angle, environment, composition, lighting, or any must-show detail the auto brief missed.'
              : 'Selections already feed the AI direction. Use this box only for extra refinements like scene mood, materials, camera angle, or what to avoid.'}
          </p>
        </Card>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 3. Text / Wording ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ 6. Image Size ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        {/* Image Size */}
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Image Size</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'landscape' as const, label: 'Landscape', ratio: '1536x1024' },
              { id: 'square' as const, label: 'Square', ratio: '1024x1024' },
              { id: 'portrait' as const, label: 'Portrait', ratio: '1024x1536' },
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

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Brand Colors Preview ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        </div>
        {/* â”€â”€ Sticky Generate Footer â”€â”€ */}
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

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Generate Button ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        {/* â”€â”€ Theme & Aspect Label â”€â”€ */}
        <div className="flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-purple-500" />
          <p className="text-[11px] font-semibold text-slate-700 truncate">
            {activeTheme.label} &middot; {imageAspect}
          </p>
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
                    ? effectiveVisionPrompt
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                    : !themeUsesHeroReference || selectedReferenceImage
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                }`}
              >
                {isAiGuidedTheme
                  ? hasUserVisionNotes
                    ? 'Ready'
                    : effectiveVisionPrompt
                      ? 'Auto-built'
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
              {isApplyingBlend ? 'Applying blend mode...' : 'Generating your image...'}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate Image â€” {activeTheme.label}
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

      {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â RIGHT: Preview / Gallery ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
      <div className="space-y-4">
        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Main Preview ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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
                {isApplyingBlend ? 'Applying blend mode...' : `Creating your ${activeTheme.label} image...`}
              </p>
              <p className="text-sm text-purple-300/70 mt-1">Usually takes 10â€“20 seconds</p>

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
              {/* Full-size image display â€” no aspect ratio constraint so the image shows completely */}
              <div className="relative w-full flex items-center justify-center">
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
              customPrompt={visionPreviewText}
              selectedToneLabel={currentTone?.label}
              selectedStyleLabel={currentStyle?.label}
            />
          )}
        </Card>

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Confirm & Continue ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
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

        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Tips ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
        {generatedImages.length === 0 && !isGenerating && !isApplyingBlend && (
          <Card className="p-4 bg-gradient-to-br from-purple-50 via-fuchsia-50/60 to-pink-50/40 border border-purple-200/50 shadow-sm rounded-xl">
            <h4 className="font-bold text-[10px] text-purple-700 mb-3 flex items-center gap-1.5 uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" />
              Tips for great images
            </h4>
            <ul className="space-y-2 text-xs text-purple-800">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-purple-200/60 text-[8px] font-bold text-purple-600">1</span>
                <span>Keep headlines short and punchy â€” 3 to 8 words work best</span>
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
