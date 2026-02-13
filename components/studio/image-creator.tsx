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
  brandColors?: string[];
  logoUrl?: string;
  confirmedPostText?: string;
  confirmedPostHeadline?: string;
  onImageConfirmed?: (imageUrl: string) => void;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageCreator({
  brandId,
  brandName,
  brandColors = [],
  logoUrl: defaultLogoUrl,
  confirmedPostText,
  confirmedPostHeadline,
  onImageConfirmed,
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
  const [imageAspect, setImageAspect] = useState<'landscape' | 'square' | 'portrait'>('landscape');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [generationCount, setGenerationCount] = useState(0);
  const [generationNonce, setGenerationNonce] = useState(0);

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Generate Image Ã¢â€â‚¬Ã¢â€â‚¬
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
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();

      if (data.url) {
        setGeneratedImages((prev) => [data.url, ...prev]);
        setSelectedImage(0);
        setGenerationCount((c) => c + 1);
        if (logoPlacement !== 'none' && effectiveLogoForGeneration && !data.logoApplied) {
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
    brandColors,
    logoPlacement,
    imageAspect,
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

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-8">
      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â LEFT: Form Controls Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <div className="space-y-4 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-2 scrollbar-thin">
        {!hasPostContext && (
          <Card className="p-3.5 bg-amber-50/80 border-amber-200/70">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm min-w-0">
                <p className="font-medium text-amber-800 text-xs">Post required before image generation</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  Go to Step 1, confirm your post, then come back here so AI can generate a relevant image.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Post Context (if available) Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {confirmedPostText && (
          <Card className="p-3.5 bg-blue-50/70 border-blue-200/60">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm min-w-0">
                <p className="font-medium text-blue-800 text-xs">Creating image for your post</p>
                <p className="text-blue-600 line-clamp-2 text-xs mt-0.5">{confirmedPostText.slice(0, 150)}...</p>
              </div>
            </div>
          </Card>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 1. Logo Upload Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="p-4 space-y-3 border border-dashed border-slate-300 hover:border-purple-300 transition-colors bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100/80 flex items-center justify-center">
                <Upload className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">Your Logo</h3>
                <p className="text-[11px] text-slate-400">Auto-applied on generated image when available</p>
              </div>
            </div>
            {uploadedLogo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setUploadedLogo(defaultLogoUrl || null)}
                className="text-slate-400 hover:text-red-500 h-7 w-7 p-0"
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
                <p className="text-sm font-medium text-emerald-700 flex items-center gap-1">
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
              <Upload className="w-6 h-6 mx-auto text-slate-400 group-hover:text-purple-500 mb-1" />
              <p className="text-sm font-medium text-slate-600 group-hover:text-purple-600">
                Click to upload logo
              </p>
              <p className="text-xs text-slate-400">PNG, SVG, or JPG (max 5MB)</p>
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

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 2. Your Vision / Creative Prompt Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="p-4 space-y-3 border border-purple-200/60 bg-purple-50/30">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-purple-100/80 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800">Your Vision</h3>
              <p className="text-[11px] text-slate-400">Describe exactly what you want the AI to create</p>
            </div>
          </div>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={`Describe your ideal image...\n\ne.g. A dark navy background with glowing gold accent lines, our logo centered with a spotlight effect, headline text in white modern font, subtle particle effects`}
            rows={4}
            className="text-sm resize-none"
          />
          <p className="text-[10px] text-slate-400">The more specific you are, the better the result. Mention colors, layout, mood, elements you want.</p>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 3. Text / Wording Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="p-4 space-y-3 border border-slate-200">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-cyan-100/80 flex items-center justify-center">
              <Type className="w-4 h-4 text-cyan-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800">Text on Image</h3>
              <p className="text-[11px] text-slate-400">Headline/tagline are added as editable layers in Image Editor</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                Headline <span className="text-red-400">*</span>
              </label>
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. 5 AI Tips for LinkedIn Growth"
                className="font-semibold text-sm h-10"
                maxLength={80}
              />
              <p className="text-[11px] text-slate-400 text-right mt-1">{headline.length}/80</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                Tagline / Subtitle
              </label>
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Boost your engagement by 10x"
                className="text-sm h-10"
                maxLength={120}
              />
            </div>
          </div>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 3. Tone Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="p-4 space-y-3 border border-slate-200">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-amber-100/80 flex items-center justify-center">
              <Palette className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800">Tone</h3>
              <p className="text-[11px] text-slate-400">Sets the mood & feeling of the image</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {TONE_OPTIONS.map((tone) => (
              <button
                key={tone.id}
                onClick={() => setSelectedTone(tone.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all text-sm ${
                  selectedTone === tone.id
                    ? 'border-purple-400 bg-purple-50/80 ring-1 ring-purple-200'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <span className="text-base leading-none">{tone.emoji}</span>
                <div className="min-w-0">
                  <p className={`font-medium text-xs leading-tight ${selectedTone === tone.id ? 'text-purple-700' : 'text-slate-700'}`}>{tone.label}</p>
                  <p className="text-[10px] text-slate-400 truncate">{tone.description}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 4. Visual Style Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="p-4 space-y-3 border border-slate-200">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-pink-100/80 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-pink-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800">Visual Style</h3>
              <p className="text-[11px] text-slate-400">How the image is composed</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {STYLE_OPTIONS.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all text-sm ${
                  selectedStyle === style.id
                    ? 'border-pink-400 bg-pink-50/80 ring-1 ring-pink-200'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <span className="text-base leading-none">{style.emoji}</span>
                <div className="min-w-0">
                  <p className={`font-medium text-xs leading-tight ${selectedStyle === style.id ? 'text-pink-700' : 'text-slate-700'}`}>{style.label}</p>
                  <p className="text-[10px] text-slate-400 truncate">{style.description}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 5. Logo Placement Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {uploadedLogo && (
          <Card className="p-4 space-y-3 border border-slate-200">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-100/80 flex items-center justify-center">
                <Zap className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">Logo Placement</h3>
                <p className="text-[11px] text-slate-400">How your logo appears in the image</p>
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
                      ? 'border-emerald-400 bg-emerald-50/80 ring-1 ring-emerald-200'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className={`font-medium text-[11px] ${logoPlacement === opt.id ? 'text-emerald-700' : 'text-slate-700'}`}>{opt.label}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ 6. Image Size Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="p-4 space-y-3 border border-slate-200">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800">Image Size</h3>
              <p className="text-[11px] text-slate-400">Format for your post</p>
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
                    ? 'border-slate-400 bg-slate-50 ring-1 ring-slate-300'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className={`font-medium text-[11px] ${imageAspect === size.id ? 'text-slate-800' : 'text-slate-600'}`}>{size.label}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{size.ratio}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Brand Colors Preview Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {brandColors.length > 0 && (
          <div className="flex items-center gap-2 px-1 py-1">
            <span className="text-[11px] text-slate-400 font-medium">Brand colors:</span>
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
              <span className="text-[11px] text-slate-400 ml-auto">{brandName}</span>
            )}
          </div>
        )}

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Generate Button Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={isGenerating || !hasPostContext || (!headline.trim() && !confirmedPostText)}
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 hover:from-purple-700 hover:via-pink-600 hover:to-orange-600 shadow-lg hover:shadow-xl hover:shadow-purple-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Generating your image...
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
          <p className="text-center text-xs text-slate-400">
            {generationCount} image{generationCount > 1 ? 's' : ''} generated this session
          </p>
        )}
      </div>

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â RIGHT: Preview / Gallery Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Main Preview Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
          {isGenerating ? (
            <div className={`${previewAspectClass} flex flex-col items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50`}>
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-[3px] border-purple-200 border-t-purple-500 animate-spin" />
                <Sparkles className="w-5 h-5 text-purple-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="mt-5 text-base font-semibold text-purple-700">Creating your image...</p>
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
              <img
                src={generatedImages[selectedImage]}
                alt="Generated LinkedIn image"
                className={`w-full object-cover bg-slate-100 ${previewAspectClass}`}
              />
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
                      disabled={isGenerating}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Redo
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`${previewAspectClass} flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-white text-slate-400`}>
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <ImageIcon className="w-10 h-10 text-slate-300" />
              </div>
              <p className="text-base font-semibold text-slate-500">Your image will appear here</p>
              <p className="text-sm text-slate-400 mt-1 max-w-sm text-center">
                Enter your headline, pick a tone & style, then hit Generate
              </p>

              <div className="mt-6 flex items-center gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center text-purple-500 font-bold text-[10px]">1</span>
                  <span>Text</span>
                </div>
                <ArrowRight className="w-3 h-3 text-slate-300" />
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 font-bold text-[10px]">2</span>
                  <span>Style</span>
                </div>
                <ArrowRight className="w-3 h-3 text-slate-300" />
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 font-bold text-[10px]">3</span>
                  <span>Generate</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Previous Generations Thumbnails Ã¢â€â‚¬Ã¢â€â‚¬ */}
        {generatedImages.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
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
                      ? 'border-purple-500 shadow-lg shadow-purple-200 ring-2 ring-purple-300'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <img
                    src={img}
                    alt={`Generation ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {selectedImage === idx && (
                    <div className="absolute inset-0 bg-purple-500/10 flex items-center justify-center">
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
        {generatedImages.length === 0 && !isGenerating && (
          <Card className="p-4 bg-purple-50/50 border-purple-100/80">
            <h4 className="font-semibold text-xs text-purple-700 mb-2.5 flex items-center gap-1.5 uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              Tips for great images
            </h4>
            <ul className="space-y-1.5 text-xs text-purple-600/80">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5 text-[8px]">•</span>
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
