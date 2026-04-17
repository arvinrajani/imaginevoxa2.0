'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ImageIcon, Sparkles, Globe, Mail } from 'lucide-react';
import { BackgroundSelector } from './BackgroundSelector';
import { ProductImagePicker } from './ProductImagePicker';
import { ResultDisplay } from './ResultDisplay';

interface ImageGeneratorProps {
  brandId: string;
  brandIndustry: string;
  postText: string;
  onImageConfirmed?: (imageUrl: string) => void;
  onImageGenerated?: (imageUrl: string) => void;
}

interface GenerateResult {
  url: string;
  headline: string;
  tagline: string;
  bullets: string[];
  assetId: string | null;
}

export function ImageGenerator({
  brandId,
  brandIndustry,
  postText,
  onImageConfirmed,
  onImageGenerated,
}: ImageGeneratorProps) {
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Footer fields
  const [footerWebsite, setFooterWebsite] = useState('');
  const [footerEmail, setFooterEmail] = useState('');
  const [footerLoaded, setFooterLoaded] = useState(false);

  // AI Guided mode
  const [isAiGuided, setIsAiGuided] = useState(false);
  const [aiGuidedPrompt, setAiGuidedPrompt] = useState('');

  // Load company data for footer defaults
  useEffect(() => {
    if (footerLoaded) return;
    async function loadCompanyData() {
      try {
        const res = await fetch(`/api/brands/${brandId}`);
        if (res.ok) {
          const data = await res.json();
          const company = data.company || data;
          if (company.website && !footerWebsite) setFooterWebsite(company.website);
          if (company.email && !footerEmail) setFooterEmail(company.email);
        }
      } catch {
        // Silently fail — user can still type manually
      } finally {
        setFooterLoaded(true);
      }
    }
    loadCompanyData();
  }, [brandId, footerLoaded, footerWebsite, footerEmail]);

  const canGenerate = isAiGuided
    ? aiGuidedPrompt.trim().length >= 10
    : !!selectedBackgroundId;

  async function handleGenerate() {
    if (!canGenerate) {
      toast.error(
        isAiGuided
          ? 'Please describe your banner (at least 10 characters)'
          : 'Please select a background first'
      );
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          postText,
          productImageUrl,
          backgroundId: isAiGuided ? null : selectedBackgroundId,
          footerWebsite,
          footerEmail,
          isAiGuided,
          aiGuidedPrompt: isAiGuided ? aiGuidedPrompt : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setResult(data as GenerateResult);
      onImageGenerated?.(data.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      toast.error('Generation failed', { description: msg });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setIsAiGuided(false)}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            !isAiGuided
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ImageIcon className="mr-1.5 inline h-4 w-4" />
          Standard Mode
        </button>
        <button
          type="button"
          onClick={() => setIsAiGuided(true)}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isAiGuided
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="mr-1.5 inline h-4 w-4" />
          AI Guided Mode
        </button>
      </div>

      {/* ─── STANDARD MODE ─── */}
      {!isAiGuided && (
        <>
          {/* Step 1: Background Selector */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800">
              Step 1 — Choose a Background
            </h3>
            <BackgroundSelector
              defaultIndustry={brandIndustry}
              selectedId={selectedBackgroundId}
              onSelect={setSelectedBackgroundId}
            />
          </div>

          {/* Step 2: Product Image (optional) */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800">
              Step 2 — Add Product Image (optional)
            </h3>
            <p className="text-xs text-gray-500">
              This becomes the hero visual on the left side of the banner
            </p>
            <ProductImagePicker
              onImageSelected={(dataUri) => setProductImageUrl(dataUri)}
              onImageCleared={() => setProductImageUrl(null)}
              selectedImageUrl={productImageUrl}
            />
          </div>
        </>
      )}

      {/* ─── AI GUIDED MODE ─── */}
      {isAiGuided && (
        <>
          {/* Step 1: Describe Banner */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                Step 1 — Describe Your Banner
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Tell AI exactly what to build. Be specific about layout, colors,
                mood, and what to include or exclude.
              </p>
            </div>

            <textarea
              rows={8}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={`Examples:\n• Dark blue industrial background with electrical towers, CHNT product in center, 6 bullet points about power quality\n• Clean white minimal background, no logos, just the product and headline, professional corporate style\n• Premium black showroom feel, both logos prominent, dramatic lighting on the product`}
              value={aiGuidedPrompt}
              onChange={(e) => setAiGuidedPrompt(e.target.value)}
            />

            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1.5 text-xs font-medium text-gray-600">
                Tips for best results:
              </p>
              <ul className="space-y-1 text-xs text-gray-500">
                <li>• Mention logos to include them, say &quot;no logos&quot; to exclude them</li>
                <li>• Describe the background mood: dark industrial, clean minimal, etc</li>
                <li>• Mention if you want the product image prominent or subtle</li>
                <li>• The more specific you are, the better the result</li>
              </ul>
            </div>
          </div>

          {/* Step 2: Product Image (optional) */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800">
              Step 2 — Add Product Image (optional)
            </h3>
            <p className="text-xs text-gray-500">
              Upload a reference product image for the AI to incorporate
            </p>
            <ProductImagePicker
              onImageSelected={(dataUri) => setProductImageUrl(dataUri)}
              onImageCleared={() => setProductImageUrl(null)}
              selectedImageUrl={productImageUrl}
            />
          </div>

          {/* AI Guided note */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              AI Guided creates the entire banner from your description.
              Logos are added by default unless you say &quot;no logos&quot;.
            </p>
          </div>
        </>
      )}

      {/* ─── FOOTER DETAILS (both modes) ─── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Step {isAiGuided ? '3' : '3'} — Footer Details
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Appears at the bottom of your banner. Pre-filled from your company settings.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Globe className="h-3 w-3" />
              Website
            </label>
            <Input
              type="text"
              value={footerWebsite}
              onChange={(e) => setFooterWebsite(e.target.value)}
              placeholder="www.yourcompany.com"
            />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Mail className="h-3 w-3" />
              Email
            </label>
            <Input
              type="text"
              value={footerEmail}
              onChange={(e) => setFooterEmail(e.target.value)}
              placeholder="info@yourcompany.com"
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-400">
          These are saved in your company profile. Edit here to override for this banner only.
        </p>
      </div>

      {/* Post Content preview */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-800">Post Content</h3>
        <p className="text-xs text-gray-500">
          AI will extract headline and bullets from this post
        </p>
        <div className="rounded-lg bg-gray-100 p-3 text-sm text-gray-600">
          {postText.slice(0, 200)}
          {postText.length > 200 ? '…' : ''}
        </div>
      </div>

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={!canGenerate || isGenerating}
        className="w-full"
        size="lg"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating your banner…
          </>
        ) : isAiGuided ? (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate with AI Guidance
          </>
        ) : (
          <>
            <ImageIcon className="mr-2 h-4 w-4" />
            Generate Banner
          </>
        )}
      </Button>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <ResultDisplay
          result={result}
          brandId={brandId}
          onRegenerate={handleGenerate}
          onConfirm={onImageConfirmed ? () => onImageConfirmed(result.url) : undefined}
        />
      )}
    </div>
  );
}
