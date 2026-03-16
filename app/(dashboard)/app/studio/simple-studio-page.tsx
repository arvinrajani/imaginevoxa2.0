'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  PencilLine,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

type Brand = {
  id: string;
  name: string;
  owner_user_id: string;
};

type ReferenceType = 'image' | 'pdf' | 'text';

type ReferenceItem = {
  id: string;
  name: string;
  type: ReferenceType;
  previewUrl?: string;
  summary?: string;
};

function isAutoPlaceholderBrand(brand: Pick<Brand, 'name'> | null | undefined) {
  if (!brand) return false;
  return typeof brand.name === 'string' && brand.name.trim() === 'My Brand';
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function truncate(value: string, max = 1200) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function hashtagsToInput(hashtags: string[]) {
  return hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(', ');
}

function normalizeHashtags(input: string) {
  const seen = new Set<string>();
  const items = input
    .split(/[\s,]+/)
    .map((item) => item.trim().replace(/^#+/, '').replace(/[^a-zA-Z0-9_]/g, ''))
    .filter(Boolean);

  for (const item of items) {
    if (seen.size >= 8) break;
    seen.add(item);
  }

  return Array.from(seen);
}

async function getErrorMessage(response: Response) {
  try {
    const payload = await response.json();
    if (typeof payload?.error === 'string') return payload.error;
    return `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SimpleStudioPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const referenceInputRef = useRef<HTMLInputElement>(null);
  const replacementImageInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');

  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [uploadingReferences, setUploadingReferences] = useState(false);

  const [sharedPrompt, setSharedPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [regeneratingPost, setRegeneratingPost] = useState(false);
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [uploadingReplacementImage, setUploadingReplacementImage] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [cta, setCta] = useState('');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [sourcePostId, setSourcePostId] = useState<string | null>(null);
  const [savedPostId, setSavedPostId] = useState<string | null>(null);

  const [generationError, setGenerationError] = useState('');
  const [generationWarning, setGenerationWarning] = useState('');
  const [textFallbackUsed, setTextFallbackUsed] = useState(false);
  const [imageFallbackUsed, setImageFallbackUsed] = useState(false);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === selectedBrandId) ?? null,
    [brands, selectedBrandId]
  );

  const referenceContext = useMemo(() => {
    if (references.length === 0) return '';

    const contextParts = references.map((reference) => {
      if (reference.type === 'image') {
        return `Image reference: ${reference.name}. Follow this visual style.`;
      }
      if (reference.summary) {
        const label = reference.type === 'pdf' ? 'PDF reference' : 'Text reference';
        return `${label} (${reference.name}): ${reference.summary}`;
      }
      return '';
    });

    return contextParts.filter(Boolean).join('\n\n');
  }, [references]);

  const hasGeneratedDraft =
    headline.trim().length > 0 || body.trim().length > 0 || imageUrl.trim().length > 0;

  useEffect(() => {
    const loadBrands = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace('/login');
          return;
        }

        const { data, error } = await supabase
          .from('brands')
          .select('id, name, owner_user_id')
          .eq('owner_user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) {
          throw error;
        }

        const resolvedBrands = ((data || []) as Brand[]).filter(
          (brand) => !isAutoPlaceholderBrand(brand)
        );

        setBrands(resolvedBrands);
        setSelectedBrandId((current) => current || resolvedBrands[0]?.id || '');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load brands.';
        toast.error('Studio setup failed', { description: message });
      } finally {
        setLoading(false);
      }
    };

    void loadBrands();
  }, [router, supabase]);

  const buildUnifiedPrompt = () => {
    const promptParts = [sharedPrompt.trim(), referenceContext.trim()].filter(Boolean);
    return promptParts.join('\n\n');
  };

  const handleReferenceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (files.length === 0) return;

    setUploadingReferences(true);
    try {
      const acceptedFiles = files.slice(0, 6);
      const nextReferences: ReferenceItem[] = [];

      for (const file of acceptedFiles) {
        if (file.type.startsWith('image/')) {
          const previewUrl = await readFileAsDataUrl(file);
          nextReferences.push({
            id: makeId('img'),
            name: file.name,
            type: 'image',
            previewUrl,
          });
          continue;
        }

        if (file.type === 'application/pdf') {
          const formData = new FormData();
          formData.append('pdf', file);

          let summary = `PDF uploaded: ${file.name}`;
          try {
            const response = await fetch('/api/extract-pdf', {
              method: 'POST',
              body: formData,
            });
            if (response.ok) {
              const payload = await response.json();
              if (typeof payload?.text === 'string' && payload.text.trim().length > 0) {
                summary = truncate(payload.text.trim(), 1200);
              }
            }
          } catch {
            summary = `PDF uploaded: ${file.name}`;
          }

          nextReferences.push({
            id: makeId('pdf'),
            name: file.name,
            type: 'pdf',
            summary,
          });
          continue;
        }

        const lowerName = file.name.toLowerCase();
        const isText =
          file.type === 'text/plain' || lowerName.endsWith('.txt') || lowerName.endsWith('.md');

        if (isText) {
          const textContent = truncate((await file.text()).trim(), 1200);
          nextReferences.push({
            id: makeId('txt'),
            name: file.name,
            type: 'text',
            summary: textContent || `Text note uploaded: ${file.name}`,
          });
        }
      }

      if (nextReferences.length === 0) {
        toast.error('Please upload image, PDF, or text files.');
        return;
      }

      setReferences((current) => [...current, ...nextReferences].slice(0, 6));
      toast.success(`${nextReferences.length} reference file(s) ready.`);
    } catch {
      toast.error('Could not process uploaded files.');
    } finally {
      setUploadingReferences(false);
    }
  };

  const removeReference = (referenceId: string) => {
    setReferences((current) => current.filter((reference) => reference.id !== referenceId));
  };

  const handleGenerate = async () => {
    if (!selectedBrandId) {
      toast.error('Select a brand first.');
      return;
    }

    if (sharedPrompt.trim().length < 8) {
      toast.error('Write a clearer prompt before generating.');
      return;
    }

    setGenerating(true);
    setGenerationError('');
    setGenerationWarning('');
    setSavedPostId(null);
    setTextFallbackUsed(false);
    setImageFallbackUsed(false);

    try {
      const unifiedPrompt = buildUnifiedPrompt();

      const postResponse = await fetch('/api/pro/post-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrandId,
          prompt: unifiedPrompt,
          count: 1,
          solutionMode: true,
          experimentMode: false,
          emojiPolicy: { min: 0, max: 2, style: 'minimal' },
        }),
      });

      if (!postResponse.ok) {
        throw new Error(await getErrorMessage(postResponse));
      }

      const postPayload = await postResponse.json();
      const option = postPayload?.options?.[0];

      if (!option) {
        throw new Error('The generator returned no post options.');
      }

      const draftPostId = typeof postPayload?.post_id === 'string' ? postPayload.post_id : null;
      const nextImagePrompt =
        typeof option.image_prompt === 'string' && option.image_prompt.trim().length > 0
          ? option.image_prompt.trim()
          : sharedPrompt.trim();

      setSourcePostId(draftPostId);
      setHeadline((option.headline || 'Generated LinkedIn post').trim());
      setBody((option.body || option.hook || '').trim());
      setCta((option.cta || 'What is your take on this?').trim());
      setHashtagsInput(
        Array.isArray(option.hashtags) ? hashtagsToInput(option.hashtags as string[]) : ''
      );
      setImagePrompt(nextImagePrompt);

      if (Boolean(postPayload?.fallback)) {
        setTextFallbackUsed(true);
        setGenerationWarning(
          'Text was generated with a fallback template. Add a working OpenAI key for higher-quality writing.'
        );
      }

      const imageResponse = await fetch('/api/pro/image/base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: draftPostId,
          brandId: selectedBrandId,
          prompt: nextImagePrompt,
          userPrompt: sharedPrompt.trim(),
          size: '1536x1024',
        }),
      });

      if (!imageResponse.ok) {
        const imageError = await getErrorMessage(imageResponse);
        setGenerationWarning((current) =>
          [current, `Image generation issue: ${imageError}`].filter(Boolean).join(' ')
        );
        setImageUrl('');
        setImageAssetId(null);
        toast.error('Post generated but image failed', { description: imageError });
        return;
      }

      const imagePayload = await imageResponse.json();
      const resolvedImageUrl =
        imagePayload?.url || imagePayload?.file_url || imagePayload?.imageUrl || '';

      setImageUrl(typeof resolvedImageUrl === 'string' ? resolvedImageUrl : '');
      setImageAssetId(
        imagePayload?.assetId || imagePayload?.asset_id || imagePayload?.imageAsset?.id || null
      );

      if (Boolean(imagePayload?.fallback)) {
        setImageFallbackUsed(true);
        setGenerationWarning((current) => {
          const intro = current ? `${current} ` : '';
          return `${intro}Image used a fallback visual. Configure OpenAI for full AI image quality.`;
        });
      }

      toast.success('Post and image generated. You can edit everything below.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed.';
      setGenerationError(message);
      toast.error('Generation failed', { description: message });
    } finally {
      setGenerating(false);
    }
  };

  const handleRegeneratePost = async () => {
    if (!selectedBrandId || sharedPrompt.trim().length < 8) {
      toast.error('Add a clear prompt first.');
      return;
    }

    setRegeneratingPost(true);
    try {
      const response = await fetch('/api/pro/post-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrandId,
          prompt: `${buildUnifiedPrompt()}\n\nRewrite with a different angle but keep it practical and solution-first.`,
          count: 1,
          solutionMode: true,
          experimentMode: true,
          experimentAxes: ['angle'],
          emojiPolicy: { min: 0, max: 2, style: 'minimal' },
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const payload = await response.json();
      const option = payload?.options?.[0];
      if (!option) {
        throw new Error('No regenerated post returned.');
      }

      setHeadline((option.headline || headline || 'Updated post').trim());
      setBody((option.body || body).trim());
      setCta((option.cta || cta).trim());
      if (Array.isArray(option.hashtags)) {
        setHashtagsInput(hashtagsToInput(option.hashtags as string[]));
      }
      if (typeof option.image_prompt === 'string' && option.image_prompt.trim().length > 0) {
        setImagePrompt(option.image_prompt.trim());
      }

      setTextFallbackUsed(Boolean(payload?.fallback));
      toast.success('Post text regenerated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not regenerate post.';
      toast.error('Regeneration failed', { description: message });
    } finally {
      setRegeneratingPost(false);
    }
  };

  const handleRegenerateImage = async () => {
    if (!selectedBrandId) {
      toast.error('Select a brand first.');
      return;
    }

    if (imagePrompt.trim().length < 5) {
      toast.error('Write an image prompt first.');
      return;
    }

    setRegeneratingImage(true);
    try {
      const response = await fetch('/api/pro/image/base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: sourcePostId,
          brandId: selectedBrandId,
          prompt: imagePrompt.trim(),
          userPrompt: headline.trim() || sharedPrompt.trim(),
          size: '1536x1024',
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const payload = await response.json();
      const resolvedImageUrl = payload?.url || payload?.file_url || payload?.imageUrl || '';
      if (typeof resolvedImageUrl === 'string') {
        setImageUrl(resolvedImageUrl);
      }

      setImageAssetId(payload?.assetId || payload?.asset_id || payload?.imageAsset?.id || null);
      setImageFallbackUsed(Boolean(payload?.fallback));
      toast.success('Image regenerated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not regenerate image.';
      toast.error('Image regeneration failed', { description: message });
    } finally {
      setRegeneratingImage(false);
    }
  };

  const handleReplacementImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }

    setUploadingReplacementImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/pro/image/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const payload = await response.json();
      const uploadedUrl = payload?.file_url || payload?.url || '';
      if (typeof uploadedUrl === 'string' && uploadedUrl.length > 0) {
        setImageUrl(uploadedUrl);
        setImageAssetId(null);
        toast.success('Replacement image uploaded.');
      } else {
        throw new Error('Upload succeeded but no file URL was returned.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image upload failed.';
      toast.error('Could not upload image', { description: message });
    } finally {
      setUploadingReplacementImage(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedBrandId) {
      toast.error('Select a brand first.');
      return;
    }

    if (!headline.trim() && !body.trim()) {
      toast.error('Generate or write post content before saving.');
      return;
    }

    setSavingDraft(true);
    try {
      const payload = {
        brandId: selectedBrandId,
        prompt: sharedPrompt.trim() || imagePrompt.trim() || headline.trim(),
        headline: headline.trim() || 'Draft post',
        body: body.trim(),
        cta: cta.trim(),
        hashtags: normalizeHashtags(hashtagsInput),
        imagePrompt: imagePrompt.trim(),
        imageUrl: imageUrl || null,
        imageAssetId,
      };

      const endpoint = sourcePostId ? '/api/pro/post/update' : '/api/pro/post/save-draft';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: sourcePostId,
          ...payload,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const data = await response.json();
      const resolvedPostId =
        data?.postId || data?.post?.id || data?.updatedPost?.id || sourcePostId || null;

      if (typeof resolvedPostId === 'string') {
        setSourcePostId(resolvedPostId);
        setSavedPostId(resolvedPostId);
      }

      toast.success(sourcePostId ? 'Draft updated.' : 'Draft saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save draft.';
      toast.error('Save failed', { description: message });
    } finally {
      setSavingDraft(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  if (!selectedBrand) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <Card className="border-gray-200/60 bg-white/80 p-8 text-center text-gray-800">
          <h2 className="text-2xl font-semibold">No brand available</h2>
          <p className="mt-2 text-gray-600">
            We could not load a brand for this account. Please refresh or create a brand in
            Settings.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6 px-3 pb-10 sm:px-6">
      <PageHeader
        eyebrow="Studio"
        title="Simple Creation Flow"
        subtitle="Upload references, generate post + image from one prompt, then edit both before saving."
        actions={
          <div className="flex items-center gap-2">
            {savedPostId ? (
              <Badge className="border-emerald-400/40 bg-emerald-50/20 text-emerald-100">
                Draft saved
              </Badge>
            ) : (
              <Badge variant="outline" className="border-cyan-400/40 text-cyan-100">
                Unsaved changes
              </Badge>
            )}
          </div>
        }
      />

      <Card className="gap-5 border-gray-200/60 bg-white/80 p-8 text-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">1. Upload your references</h2>
            <p className="mt-1 text-gray-600">
              Add images, PDFs, or text notes. The same context is used for both post and image
              generation.
            </p>
          </div>
          <Badge variant="outline" className="border-gray-200 text-gray-700">
            Optional
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Brand</label>
            <select
              value={selectedBrandId}
              onChange={(event) => setSelectedBrandId(event.target.value)}
              className="h-12 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-cyan-300"
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <input
              ref={referenceInputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*,application/pdf,text/plain,.txt,.md"
              onChange={handleReferenceUpload}
            />
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={uploadingReferences}
              className="h-12 border-gray-200 bg-gray-50 px-5 text-gray-800 hover:bg-gray-100"
              onClick={() => referenceInputRef.current?.click()}
            >
              {uploadingReferences ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing files...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload reference files
                </>
              )}
            </Button>

            <p className="text-sm text-gray-600">
              Tip: upload a short PDF case study or an image style reference for better output.
            </p>

            {references.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {references.map((reference) => (
                  <div
                    key={reference.id}
                    className="rounded-xl border border-gray-200/60 bg-gray-50/80 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className="border-gray-200 text-[10px] uppercase text-gray-600"
                      >
                        {reference.type}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => removeReference(reference.id)}
                        className="rounded-md p-1 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                        aria-label={`Remove ${reference.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {reference.previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={reference.previewUrl}
                        alt={reference.name}
                        className="mb-2 h-24 w-full rounded-md object-cover"
                      />
                    )}

                    <p className="text-sm font-medium text-gray-800">{reference.name}</p>
                    {reference.summary && (
                      <p className="mt-2 text-xs leading-5 text-gray-600">
                        {truncate(reference.summary, 240)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="gap-5 border-gray-200/60 bg-white/80 p-8 text-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">2. Generate from one prompt</h2>
            <p className="mt-1 text-gray-600">
              This prompt drives both the post draft and the generated image.
            </p>
          </div>
          <Badge variant="outline" className="border-cyan-300/40 text-cyan-100">
            Required
          </Badge>
        </div>

        <Textarea
          value={sharedPrompt}
          onChange={(event) => setSharedPrompt(event.target.value)}
          placeholder="Example: Share how we helped logistics teams cut shipment delays by 32% using a simple forecasting workflow."
          className="min-h-36 border-gray-200 bg-gray-50/70 text-base text-gray-900 placeholder:text-gray-400"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="lg"
            disabled={generating}
            onClick={handleGenerate}
            className="h-12 min-w-[220px] bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating post and image...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate post + image
              </>
            )}
          </Button>

          {textFallbackUsed && (
            <Badge variant="outline" className="border-amber-300/40 text-amber-100">
              Text fallback used
            </Badge>
          )}

          {imageFallbackUsed && (
            <Badge variant="outline" className="border-amber-300/40 text-amber-100">
              Image fallback used
            </Badge>
          )}
        </div>

        {generationError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-100">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <p>{generationError}</p>
          </div>
        )}

        {generationWarning && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-950/40 p-4 text-sm text-amber-100">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <p>{generationWarning}</p>
          </div>
        )}
      </Card>

      <Card className="gap-5 border-gray-200/60 bg-white/80 p-8 text-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">3. Edit everything before saving</h2>
            <p className="mt-1 text-gray-600">
              Update post copy, hashtags, image prompt, and image itself on this single page.
            </p>
          </div>
          <Badge variant="outline" className="border-gray-200 text-gray-700">
            Human review
          </Badge>
        </div>

        {!hasGeneratedDraft && (
          <div className="rounded-xl border border-dashed border-white/25 bg-gray-50/60 p-8 text-center text-gray-600">
            Generate once to unlock the post and image editors.
          </div>
        )}

        {hasGeneratedDraft && (
          <>
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-gray-200/60 bg-gray-50/70 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">Post editor</h3>
                  <FileText className="h-4 w-4 text-cyan-600" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Headline</label>
                  <Input
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    className="h-11 border-gray-200 bg-gray-50 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Body</label>
                  <Textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="min-h-56 border-gray-200 bg-gray-50 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">CTA</label>
                  <Input
                    value={cta}
                    onChange={(event) => setCta(event.target.value)}
                    className="h-11 border-gray-200 bg-gray-50 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Hashtags</label>
                  <Input
                    value={hashtagsInput}
                    onChange={(event) => setHashtagsInput(event.target.value)}
                    placeholder="#LinkedIn, #B2B, #Growth"
                    className="h-11 border-gray-200 bg-gray-50 text-gray-900"
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={regeneratingPost}
                  onClick={handleRegeneratePost}
                  className="h-11 border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
                >
                  {regeneratingPost ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Regenerating text...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Regenerate post text
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-4 rounded-xl border border-gray-200/60 bg-gray-50/70 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">Image editor</h3>
                  <ImageIcon className="h-4 w-4 text-cyan-600" />
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200/60 bg-gray-50">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="Generated visual" className="h-[280px] w-full object-cover" />
                  ) : (
                    <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">
                      No image yet. Generate or upload one.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Image prompt</label>
                  <Textarea
                    value={imagePrompt}
                    onChange={(event) => setImagePrompt(event.target.value)}
                    className="min-h-28 border-gray-200 bg-gray-50 text-gray-900"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={regeneratingImage}
                    onClick={handleRegenerateImage}
                    className="h-11 border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
                  >
                    {regeneratingImage ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Regenerating image...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Regenerate image
                      </>
                    )}
                  </Button>

                  <input
                    ref={replacementImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReplacementImageUpload}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploadingReplacementImage}
                    onClick={() => replacementImageInputRef.current?.click()}
                    className="h-11 border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
                  >
                    {uploadingReplacementImage ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Upload replacement
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setImageUrl('');
                      setImageAssetId(null);
                    }}
                    className="h-11 border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove image
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200/60 bg-gray-50/70 p-5">
              <div className="flex items-center gap-2 text-gray-800">
                <PencilLine className="h-4 w-4 text-cyan-600" />
                <h3 className="text-lg font-semibold">Live preview</h3>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white p-5 text-slate-900 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{selectedBrand.name}</p>
                <h4 className="mt-2 text-xl font-semibold leading-snug">
                  {headline || 'Your headline appears here'}
                </h4>

                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt="Post preview"
                    className="mt-4 h-56 w-full rounded-lg object-cover"
                  />
                )}

                <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
                  {body || 'Your post body appears here.'}
                </p>

                {cta.trim() && <p className="mt-4 font-medium text-slate-900">{cta.trim()}</p>}

                {normalizeHashtags(hashtagsInput).length > 0 && (
                  <p className="mt-4 text-sm text-cyan-700">
                    {normalizeHashtags(hashtagsInput)
                      .map((tag) => `#${tag}`)
                      .join(' ')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                disabled={savingDraft}
                onClick={handleSaveDraft}
                className="h-12 min-w-[190px] bg-emerald-500 text-white hover:bg-emerald-600"
              >
                {savingDraft ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save draft
                  </>
                )}
              </Button>

              {savedPostId && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-50/10 px-3 py-2 text-sm text-emerald-100">
                  <CheckCircle2 className="h-4 w-4" />
                  Draft saved with ID {savedPostId}
                </div>
              )}

              <Button
                asChild
                variant="outline"
                className="h-12 border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
              >
                <Link href="/app/posts">Open My Posts</Link>
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
