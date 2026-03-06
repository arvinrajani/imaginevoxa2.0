'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  Sparkles,
  ImageIcon,
  Type,
  Palette,
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
  Globe,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageCreatorProps {
  brandId: string;
  brandName?: string;
  productName?: string;
  brandColors?: string[];
  logoUrl?: string;
  confirmedPostText?: string;
  confirmedPostHeadline?: string;
  onImageConfirmed?: (imageUrl: string) => void;
  /** Called whenever a new image is generated — auto-syncs URL to parent without navigating */
  onImageGenerated?: (imageUrl: string) => void;
  /** Pre-loaded PDF-extracted images from the parent's evidence state. When supplied the
   *  internal fetch is skipped — images stay in sync whenever evidence changes. */
  pdfImages?: Array<{ id: string; title: string; signed_url: string }>;
}

type BlendModeId = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light';

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageCreator({
  brandId,
  brandName,
  productName,
  brandColors = [],
  logoUrl: defaultLogoUrl,
  confirmedPostText,
  confirmedPostHeadline,
  onImageConfirmed,
  onImageGenerated,
  pdfImages: propPdfImages,
}: ImageCreatorProps) {
  const derivedWording = useMemo(
    () => deriveWordingFromPost(confirmedPostText),
    [confirmedPostText]
  );
  const hasPostContext = Boolean(confirmedPostText?.trim());

  // Form state
  const [headline, setHeadline] = useState(confirmedPostHeadline || derivedWording.headline || '');
  const [tagline, setTagline] = useState('');
  const [selectedTone, setSelectedTone] = useState('professional');
  const [selectedStyle, setSelectedStyle] = useState('split-layout');
  const [customPrompt, setCustomPrompt] = useState('');
  const [uploadedLogo, setUploadedLogo] = useState<string | null>(defaultLogoUrl || null);
  const [logoPlacement, setLogoPlacement] = useState<'overlay' | 'infuse' | 'none'>('overlay');
  const [selectedBlendMode, setSelectedBlendMode] = useState<BlendModeId>('normal');
  const [imageAspect, setImageAspect] = useState<'landscape' | 'square' | 'portrait'>('landscape');

  // Reference image state (fetched from URL)
  const [siteUrl, setSiteUrl] = useState('');
  const [isFetchingSiteImages, setIsFetchingSiteImages] = useState(false);
  const [fetchedSiteImages, setFetchedSiteImages] = useState<Array<{ url: string; source: string; width: number | null; height: number | null }>>([]);
  const [selectedReferenceImage, setSelectedReferenceImage] = useState<string | null>(null);

  // PDF-extracted brand images (from Evidence Locker)
  const [pdfEvidenceImages, setPdfEvidenceImages] = useState<Array<{ id: string; title: string; signed_url: string }>>([]);
  const [isFetchingPdfImages, setIsFetchingPdfImages] = useState(false);
  // Tracks PDF image suggestions the user has explicitly dismissed this session
  const [dismissedPdfSuggestions, setDismissedPdfSuggestions] = useState<Set<string>>(() => new Set());

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplyingBlend, setIsApplyingBlend] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [generationCount, setGenerationCount] = useState(0);
  const [generationNonce, setGenerationNonce] = useState(0);
  const [latestBlendPreview, setLatestBlendPreview] = useState<{
    mode: BlendModeId;
    rawUrl: string;
    blendedUrl: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!headline.trim() && confirmedPostHeadline?.trim()) {
      setHeadline(confirmedPostHeadline.trim().slice(0, 80));
    }
  }, [confirmedPostHeadline, headline]);

  useEffect(() => {
    if (!headline.trim() && derivedWording.headline) {
      setHeadline(derivedWording.headline);
    }
    if (!tagline.trim() && derivedWording.tagline) {
      setTagline(derivedWording.tagline);
    }
  }, [derivedWording, headline, tagline]);

  useEffect(() => {
    if (defaultLogoUrl && !uploadedLogo) {
      setUploadedLogo(defaultLogoUrl);
    }
  }, [defaultLogoUrl, uploadedLogo]);

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
      .then((payload: { evidence?: Array<{ id: string; type: string; title: string; tags?: string[]; signed_url?: string | null }> }) => {
        const extracted = (payload.evidence ?? []).filter(
          (item) =>
            item.type === 'image' &&
            Array.isArray(item.tags) &&
            item.tags.includes('pdf-extracted') &&
            typeof item.signed_url === 'string' &&
            item.signed_url.length > 0
        );
        setPdfEvidenceImages(
          extracted.map((item) => ({
            id: item.id,
            title: item.title,
            signed_url: item.signed_url as string,
          }))
        );
      })
      .catch(() => {
        // Non-critical — silently absorb
      })
      .finally(() => setIsFetchingPdfImages(false));
  }, [brandId, propPdfImages]);

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

  // ── Fetch Images from URL ──
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

  // ── Generate Image ──
  const handleGenerate = useCallback(async () => {
    if (!hasPostContext) {
      toast.error('Confirm your post first', {
        description: 'Image generation is linked to the confirmed post from Step 1.',
      });
      return;
    }

    const effectiveHeadline = (headline || confirmedPostHeadline || derivedWording.headline || '').trim();
    const effectiveTagline = (tagline || derivedWording.tagline || '').trim();
    const effectiveLogoForGeneration =
      logoPlacement !== 'none' ? (uploadedLogo || defaultLogoUrl || null) : null;
    const nextNonce = generationNonce + 1;

    if (!effectiveHeadline && !confirmedPostText) {
      toast.error('Please enter a headline or generate a post first');
      return;
    }

    if (logoPlacement !== 'none' && !effectiveLogoForGeneration) {
      toast.error('Upload your logo first or choose "No Logo"');
      return;
    }

    setGenerationNonce(nextNonce);
    setIsGenerating(true);
    setSelectedImage(null);

    try {
      const res = await fetch('/api/pro/image/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          brandName,
          productName: productName || undefined,
          brandColors,
          headline: effectiveHeadline,
          tagline: effectiveTagline,
          tone: selectedTone,
          style: selectedStyle,
          logoUrl: effectiveLogoForGeneration || undefined,
          logoPlacement,
          postText: confirmedPostText || undefined,
          customPrompt: customPrompt.trim() || undefined,
          generationNonce: nextNonce,
          imageAspect,
          referenceImageUrl: selectedReferenceImage || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();

      if (data.url) {
        const rawImageUrl = (typeof data.baseUrl === 'string' && data.baseUrl.trim()) || data.url;
        let finalImageUrl: string = data.url;

        const shouldApplyBlend =
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
              const blendErr = await blendRes.json().catch(() => ({} as Record<string, string>));
              toast.warning('Blend mode could not be applied', {
                description: blendErr.error || 'Using the raw generated image instead.',
              });
            }
          } catch {
            setLatestBlendPreview(null);
            toast.warning('Blend mode request failed', {
              description: 'Using the raw generated image instead.',
            });
          } finally {
            setIsApplyingBlend(false);
          }
        } else {
          setLatestBlendPreview(null);
        }

        setGeneratedImages((prev) => [finalImageUrl, ...prev]);
        setSelectedImage(0);
        setGenerationCount((c) => c + 1);

        // Auto-sync the generated image to parent so it's available in draft/preview
        onImageGenerated?.(finalImageUrl);

        if (shouldApplyBlend && finalImageUrl !== rawImageUrl) {
          const modeLabel =
            BLEND_MODE_OPTIONS.find((mode) => mode.id === selectedBlendMode)?.label || 'Blend';
          toast.success(`Image generated with ${modeLabel} mode.`);
        } else if (logoPlacement !== 'none' && effectiveLogoForGeneration && !data.logoApplied) {
          toast.warning('Image generated, but logo was not applied');
        } else if (logoPlacement !== 'none' && effectiveLogoForGeneration && data.logoApplied) {
          toast.success('Image generated with your logo.');
        } else {
          toast.success('Image generated.');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Generation failed', { description: message });
    } finally {
      setIsGenerating(false);
    }
  }, [
    hasPostContext,
    headline,
    confirmedPostHeadline,
    derivedWording,
    tagline,
    selectedTone,
    selectedStyle,
    uploadedLogo,
    defaultLogoUrl,
    confirmedPostText,
    customPrompt,
    generationNonce,
    brandId,
    brandName,
    productName,
    brandColors,
    logoPlacement,
    imageAspect,
    selectedBlendMode,
    selectedReferenceImage,
    onImageGenerated,
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
  const previewAspectClass =
    imageAspect === 'square'
      ? 'aspect-square'
      : imageAspect === 'portrait'
      ? 'aspect-[4/5]'
      : 'aspect-[1200/628]';

  // Use prop-supplied images when the parent passes them (keeps in sync after evidence uploads).
  // Fall back to internally-fetched images when no prop is provided.
  const effectivePdfImages = propPdfImages ?? pdfEvidenceImages;
  const isLoadingPdf = propPdfImages !== undefined ? false : isFetchingPdfImages;

  // Detect if the custom prompt mentions a PDF image by title so we can suggest auto-selecting it.
  // Match on any word ≥4 chars from an image title appearing in the prompt (case-insensitive).
  const promptMatchedPdfImage = useMemo(() => {
    if (!customPrompt.trim() || effectivePdfImages.length === 0) return null;
    const promptLower = customPrompt.toLowerCase();
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
  }, [customPrompt, effectivePdfImages, selectedReferenceImage, dismissedPdfSuggestions]);

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-8">
      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â LEFT: Form Controls Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <div className="space-y-4 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-2 scrollbar-thin">
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
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Upload className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Your Logo</h3>
                <p className="text-[11px] text-gray-400">Auto-applied on generated image when available</p>
              </div>
            </div>
            {uploadedLogo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setUploadedLogo(defaultLogoUrl || null)}
                className="text-gray-500 hover:text-red-500 h-7 w-7 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {uploadedLogo ? (
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border-2 border-purple-200 overflow-hidden bg-white flex items-center justify-center">
                <img src={uploadedLogo} alt="Logo" className="w-full h-full object-contain p-1" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Logo ready
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-purple-600 hover:underline mt-0.5"
                >
                  Change logo
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-purple-400 hover:bg-purple-50 transition-all text-center group"
            >
              <Upload className="w-6 h-6 mx-auto text-gray-500 group-hover:text-purple-500 mb-1" />
              <p className="text-sm font-medium text-slate-700 group-hover:text-purple-600">
                Click to upload logo
              </p>
              <p className="text-xs text-gray-400">PNG, SVG, or JPG (max 5MB)</p>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
        </Card>

        {/* Reference Image from URL */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm hover:border-indigo-300 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Globe className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Reference from URL</h3>
              <p className="text-[11px] text-gray-400">Fetch images from a website to use as AI reference</p>
            </div>
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
                    onClick={() => setSelectedReferenceImage(
                      selectedReferenceImage === img.url ? null : img.url
                    )}
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
            <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg border border-indigo-200">
              <img
                src={selectedReferenceImage}
                alt="Selected reference"
                className="w-10 h-10 rounded object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-indigo-700">Reference image selected</p>
                <p className="text-[10px] text-indigo-50 truncate">{selectedReferenceImage}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedReferenceImage(null)}
                className="h-6 w-6 p-0 text-gray-500 hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </Card>

        {/* ── Brand PDF Images ── */}
        {/* ── Brand PDF Images ── */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm hover:border-emerald-300 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Brand PDF Images</h3>
                <p className="text-[11px] text-gray-400">Click to select as reference, or mention by name in Your Vision</p>
              </div>
            </div>

            {isLoadingPdf ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading brand images...
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {effectivePdfImages.map((img) => (
                  <button
                    key={img.id}
                    onClick={() =>
                      setSelectedReferenceImage(
                        selectedReferenceImage === img.signed_url ? null : img.signed_url
                      )
                    }
                    title={img.title}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selectedReferenceImage === img.signed_url
                        ? 'border-emerald-400 ring-2 ring-emerald-300'
                        : 'border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.signed_url}
                      alt={img.title}
                      className="w-full h-full object-cover"
                    />
                    {selectedReferenceImage === img.signed_url && (
                      <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-white drop-shadow-md" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!isLoadingPdf && effectivePdfImages.length === 0 && (
              <p className="text-xs text-gray-400">
                No PDF images yet. Upload a brand PDF in the Evidence Locker to extract images automatically.
              </p>
            )}
          </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 2. Your Vision / Creative Prompt Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* Your Vision */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Your Vision <span className="text-[10px] font-normal text-gray-400">(optional)</span></h3>
              <p className="text-[11px] text-gray-400">Describe exactly what you want the AI to create</p>
            </div>
          </div>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={`e.g. Dark navy background, glowing gold accent lines, logo centered with spotlight, white modern font, subtle particle effects...`}
            rows={3}
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
                onClick={() => setSelectedReferenceImage(promptMatchedPdfImage.signed_url)}
                className="flex-shrink-0 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Use it
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

          <p className="text-[10px] text-gray-400">Be specific: mention colors, layout, mood, and key visual elements. Reference a PDF image by name to auto-select it above.</p>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 3. Text / Wording Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* Text on Image */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
              <Type className="w-4 h-4 text-cyan-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Text on Image</h3>
              <p className="text-[11px] text-gray-400">Headline &amp; tagline appear on your generated image</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Headline <span className="text-red-500">*</span>
              </label>
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. 5 AI Tips for LinkedIn Growth"
                className="font-semibold text-sm h-10 bg-white border-slate-300 text-slate-900 placeholder:text-gray-400"
                maxLength={80}
              />
              <p className="text-[11px] text-gray-400 text-right mt-1">{headline.length}/80</p>
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

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 3. Tone Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Palette className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Tone</h3>
              <p className="text-[11px] text-gray-400">Sets the mood &amp; feeling of the image</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {TONE_OPTIONS.map((tone) => (
              <button
                key={tone.id}
                onClick={() => setSelectedTone(tone.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all text-sm ${
                  selectedTone === tone.id
                    ? 'border-purple-200 bg-purple-50 ring-1 ring-purple-300'
                    : 'border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/30'
                }`}
              >
                <span className="text-base leading-none">{tone.emoji}</span>
                <div className="min-w-0">
                  <p className={`font-semibold text-xs leading-tight ${selectedTone === tone.id ? 'text-purple-700' : 'text-slate-800'}`}>{tone.label}</p>
                  <p className="text-[10px] text-gray-400 truncate">{tone.description}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 4. Visual Style Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* Visual Style */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-pink-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Visual Style</h3>
              <p className="text-[11px] text-gray-400">How the image is composed</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {STYLE_OPTIONS.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all text-sm ${
                  selectedStyle === style.id
                    ? 'border-pink-500 bg-pink-50 ring-1 ring-pink-300'
                    : 'border-slate-200 bg-white hover:border-pink-300 hover:bg-pink-50/30'
                }`}
              >
                <span className="text-base leading-none">{style.emoji}</span>
                <div className="min-w-0">
                  <p className={`font-semibold text-xs leading-tight ${selectedStyle === style.id ? 'text-pink-700' : 'text-slate-800'}`}>{style.label}</p>
                  <p className="text-[10px] text-gray-400 truncate">{style.description}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 5. Logo Placement Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {uploadedLogo && (
          <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Zap className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Logo Placement</h3>
                <p className="text-[11px] text-gray-400">How your logo appears in the image</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'overlay' as const, label: 'Corner Overlay', desc: 'Placed on top after' },
                { id: 'infuse' as const, label: 'Infused in Art', desc: 'Baked into the design' },
                { id: 'none' as const, label: 'No Logo', desc: 'Image only' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setLogoPlacement(opt.id)}
                  className={`px-2 py-2.5 rounded-lg border text-center transition-all text-xs ${
                    logoPlacement === opt.id
                      ? 'border-emerald-200 bg-emerald-50 ring-1 ring-emerald-300'
                      : 'border-slate-200 bg-white hover:border-emerald-300'
                  }`}
                >
                  <p className={`font-semibold text-[11px] ${logoPlacement === opt.id ? 'text-emerald-700' : 'text-slate-800'}`}>{opt.label}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </Card>
        )}

        {uploadedLogo && logoPlacement !== 'none' && (
          <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-sky-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-900">Blend Mode</h3>
                <p className="text-[11px] text-gray-400">How the logo is composited onto the image</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {BLEND_MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setSelectedBlendMode(mode.id)}
                  className={`px-2.5 py-2.5 rounded-lg border text-left transition-all text-xs ${
                    selectedBlendMode === mode.id
                      ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-300'
                      : 'border-slate-200 bg-white hover:border-sky-300'
                  }`}
                >
                  <p className={`font-semibold ${selectedBlendMode === mode.id ? 'text-sky-700' : 'text-slate-800'}`}>
                    {mode.label}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{mode.description}</p>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 6. Image Size Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {/* Image Size */}
        <Card className="p-4 space-y-3 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-slate-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900">Image Size</h3>
              <p className="text-[11px] text-gray-400">Format for your LinkedIn post</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'landscape' as const, label: 'Landscape', ratio: '1200x628' },
              { id: 'square' as const, label: 'Square', ratio: '1080x1080' },
              { id: 'portrait' as const, label: 'Portrait', ratio: '1080x1350' },
            ].map((size) => (
              <button
                key={size.id}
                onClick={() => setImageAspect(size.id)}
                className={`px-2 py-2.5 rounded-lg border text-center transition-all text-xs ${
                  imageAspect === size.id
                    ? 'border-slate-50 bg-slate-100 ring-1 ring-slate-400'
                    : 'border-slate-200 bg-white hover:border-slate-400'
                }`}
              >
                <p className={`font-semibold text-[11px] ${imageAspect === size.id ? 'text-slate-900' : 'text-slate-700'}`}>{size.label}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">{size.ratio}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Brand Colors Preview Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {brandColors.length > 0 && (
          <div className="flex items-center gap-2 px-1 py-1">
            <span className="text-[11px] text-slate-600 font-semibold">Brand colors:</span>
            <div className="flex gap-1">
              {brandColors.slice(0, 6).map((color, idx) => (
                <div
                  key={idx}
                  className="w-4 h-4 rounded border border-slate-200/80"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            {brandName && (
              <span className="text-[11px] text-slate-600 font-medium ml-auto">{brandName}</span>
            )}
          </div>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Generate Button Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={isGenerating || isApplyingBlend || !hasPostContext || (!headline.trim() && !confirmedPostText)}
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 hover:from-purple-700 hover:via-pink-600 hover:to-orange-600 shadow-lg hover:shadow-xl hover:shadow-purple-50/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
        >
          {isGenerating || isApplyingBlend ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {isApplyingBlend ? 'Applying blend mode...' : 'Generating your image...'}
            </>
          ) : generatedImages.length > 0 ? (
            <>
              <RefreshCw className="w-5 h-5 mr-2" />
              Regenerate Image
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate Image
            </>
          )}
        </Button>

        {generationCount > 0 && (
          <p className="text-center text-xs text-gray-400 font-medium">
            {generationCount} image{generationCount > 1 ? 's' : ''} generated this session
          </p>
        )}
      </div>

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â RIGHT: Preview / Gallery Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Main Preview Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
          {isGenerating || isApplyingBlend ? (
            <div className={`${previewAspectClass} flex flex-col items-center justify-center bg-gradient-to-br from-purple-50 via-pink-500 to-orange-50`}>
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-[3px] border-purple-200 border-t-purple-500 animate-spin" />
                <Sparkles className="w-5 h-5 text-purple-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="mt-5 text-base font-semibold text-purple-700">
                {isApplyingBlend ? 'Applying blend mode...' : 'Creating your image...'}
              </p>
              <p className="text-sm text-purple-400 mt-1">Usually takes 10-20 seconds</p>

              <div className="mt-5 flex items-center gap-3 text-xs text-purple-400">
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> AI Image</span>
                <span className="w-1 h-1 rounded-full bg-purple-300" />
                <span>{currentTone?.emoji} {currentTone?.label}</span>
                <span className="w-1 h-1 rounded-full bg-purple-300" />
                <span>{currentStyle?.emoji} {currentStyle?.label}</span>
              </div>
            </div>
          ) : selectedImage !== null && generatedImages[selectedImage] ? (
            <div className="relative group">
              <div className={`${previewAspectClass} bg-[#f0f0f0]`} style={{ backgroundImage: 'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px' }}>
                <img
                  src={generatedImages[selectedImage]}
                  alt="Generated LinkedIn image"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Badge className="bg-emerald-500/90 text-white text-[10px] backdrop-blur-sm">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Selected
                </Badge>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-end justify-between">
                  <div className="text-white text-sm">
                    <p className="font-semibold text-sm">{headline || 'Your LinkedIn Image'}</p>
                    {tagline && <p className="text-white/60 text-xs mt-0.5">{tagline}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <a
                      href={generatedImages[selectedImage]}
                      download={`linkedin-image-${Date.now()}.png`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors"
                      title="Download image"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <Button
                      size="sm"
                      className="bg-white/20 backdrop-blur text-white hover:bg-white/30 border-0 h-8 px-3 text-xs"
                      onClick={handleGenerate}
                      disabled={isGenerating || isApplyingBlend}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Redo
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`${previewAspectClass} flex flex-col items-center justify-center bg-gradient-to-br from-slate-500 to-white text-gray-500`}>
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <ImageIcon className="w-10 h-10 text-gray-600" />
              </div>
              <p className="text-base font-semibold text-gray-400">Your image will appear here</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm text-center">
                Enter your headline, pick a tone & style, then hit Generate
              </p>

              <div className="mt-6 flex items-center gap-3 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center text-purple-500 font-bold text-[10px]">1</span>
                  <span>Text</span>
                </div>
                <ArrowRight className="w-3 h-3 text-gray-600" />
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 font-bold text-[10px]">2</span>
                  <span>Style</span>
                </div>
                <ArrowRight className="w-3 h-3 text-gray-600" />
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 font-bold text-[10px]">3</span>
                  <span>Generate</span>
                </div>
              </div>
            </div>
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
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
              <Eye className="w-3 h-3" />
              Previous generations ({generatedImages.length})
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {generatedImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === idx
                      ? 'border-purple-50 shadow-lg shadow-purple-200 ring-2 ring-purple-300'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <img
                    src={img}
                    alt={`Generation ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {selectedImage === idx && (
                    <div className="absolute inset-0 bg-purple-50/10 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-purple-600 drop-shadow" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Confirm & Continue Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {selectedImage !== null && generatedImages[selectedImage] && (
          <Button
            size="lg"
            onClick={handleConfirm}
            className="w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-lg hover:shadow-xl transition-all rounded-xl"
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            Confirm & Continue
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Tips Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {generatedImages.length === 0 && !isGenerating && !isApplyingBlend && (
          <Card className="p-4 bg-purple-50 border border-purple-200 shadow-sm">
            <h4 className="font-semibold text-xs text-purple-800 mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              Tips for great images
            </h4>
            <ul className="space-y-1.5 text-xs text-purple-700">
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5 text-[8px]">•</span>
                <span>Keep headlines short and punchy - 3 to 8 words work best</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 text-[8px]">•</span>
                <span>Upload your logo for consistent brand presence</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 text-[8px]">•</span>
                <span>Try <strong>Bold</strong> for announcements, <strong>Minimal</strong> for thought leadership</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 text-[8px]">•</span>
                <span>Generate multiple variations and pick the best one</span>
              </li>
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
