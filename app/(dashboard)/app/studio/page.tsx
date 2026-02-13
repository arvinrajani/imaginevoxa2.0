'use client';

import './studio.css';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Sparkles,
  Palette,
  Image as ImageIcon,
  Wand2,
  Settings,
  Play,
  Rocket,
  Crown,
  CheckCircle2,
  Target,
  Briefcase,
  Send,
  PenLine,
  SlidersHorizontal,
  ArrowRight,
  ArrowLeft,
  Building2,
  Plus,
  Boxes,
  Users,
  Globe,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BrandAnalyzer } from '@/components/studio/brand-analyzer';
import { VisualStyleWizard } from '@/components/studio/visual-style-wizard';
import { AssetManager } from '@/components/studio/asset-manager';
import { PostGenerator } from '@/components/studio/post-generator';
import { ImageCreator } from '@/components/studio/image-creator';
import { ImageEditor } from '@/components/studio/image-editor';
import { PreviewPublish } from '@/components/studio/preview-publish';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Brand = {
  id: string;
  name: string;
  owner_user_id: string;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
};

interface BrandKit {
  brandName: string;
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
  logoAssets: Array<{ url: string; name?: string }>;
  fontPersonality: string | null;
  toneGuidelines: string[];
  allowedImageStyles: string[];
}

function resolveLogoUrl(
  assets: Array<{ url?: string; file_url?: string; publicUrl?: string } | string> | null | undefined
) {
  if (!Array.isArray(assets)) return '';
  for (const asset of assets) {
    if (typeof asset === 'string' && asset.trim()) return asset.trim();
    if (!asset || typeof asset !== 'object') continue;
    if (typeof asset.url === 'string' && asset.url.trim()) return asset.url.trim();
    if (typeof asset.file_url === 'string' && asset.file_url.trim()) return asset.file_url.trim();
    if (typeof asset.publicUrl === 'string' && asset.publicUrl.trim()) return asset.publicUrl.trim();
  }
  return '';
}

interface ConfirmedPost {
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  imageUrl?: string;
  imagePrompt?: string;
  variantLabel?: string;
}

type SetupStep = 'welcome' | 'analyze' | 'style' | 'assets' | 'complete';

type BrandIntelligence = {
  products: string[];
  offerings: string[];
  targetAudience: string | null;
  businessFocus: string | null;
  tagline: string | null;
  brandDescription: string | null;
  website: string | null;
  analyzedAt: string | null;
};

type NewBrandForm = {
  name: string;
  description: string;
  industry: string;
  website: string;
};

type AnalysisResult = {
  primary_colors?: string[];
  brand_name?: string;
  brand_description?: string;
  industry?: string;
  website?: string;
  products?: string[];
  key_offerings?: string[];
  target_audience?: string;
  business_focus?: string;
  tagline?: string;
};

type StyleProfile = {
  colorScheme?: {
    primary?: string[];
    accent?: string[];
    secondary?: string[];
  };
  typography?: {
    fontMood?: string | null;
  };
  tone?: {
    voice?: string[];
  };
  imagery?: {
    style?: string[];
  };
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Pipeline Steps
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  {
    id: 'post',
    label: 'Post Generator',
    shortLabel: 'Post',
    icon: PenLine,
    description: 'Write & generate your LinkedIn post',
    gradient: 'from-cyan-500 to-blue-500',
  },
  {
    id: 'image-create',
    label: 'Image Creator',
    shortLabel: 'Image',
    icon: ImageIcon,
    description: 'Logo + wording + tone → AI image',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    id: 'image-edit',
    label: 'Image Editor',
    shortLabel: 'Edit',
    icon: SlidersHorizontal,
    description: 'Fine-tune your generated image',
    gradient: 'from-orange-500 to-amber-500',
  },
  {
    id: 'logo-gen',
    label: 'Logo Generator',
    shortLabel: 'Logo',
    icon: Wand2,
    description: 'Create AI logos (standalone tool)',
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    id: 'preview',
    label: 'Preview & Publish',
    shortLabel: 'Publish',
    icon: Send,
    description: 'Review and publish to LinkedIn',
    gradient: 'from-blue-600 to-indigo-600',
  },
];

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function StudioPage() {
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>('welcome');
  const [brandSetupComplete, setBrandSetupComplete] = useState(false);
  const [brandIntelligence, setBrandIntelligence] = useState<BrandIntelligence | null>(null);
  const [createBrandOpen, setCreateBrandOpen] = useState(false);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [newBrandForm, setNewBrandForm] = useState<NewBrandForm>({
    name: '',
    description: '',
    industry: '',
    website: '',
  });
  const selectedBrandIdRef = useRef<string | null>(null);

  // Pipeline state
  const [activeStep, setActiveStep] = useState(0);

  // Brand styling
  const [brandColors, setBrandColors] = useState<string[]>(['#0A66C2', '#0F172A', '#22D3EE']);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);

  // Pipeline data flow
  const [confirmedPost, setConfirmedPost] = useState<ConfirmedPost | null>(null);
  const [confirmedImageUrl, setConfirmedImageUrl] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const effectiveBrandName =
    selectedBrand?.name?.trim() || brandKit?.brandName?.trim() || 'My Brand';

  // ─── Data Loading ───

  const loadBrands = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        window.location.href = '/login';
        return;
      }

      const { data, error } = await supabase
        .from('brands')
        .select('id, name, owner_user_id, description, industry, website')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      let resolvedBrands = (data || []) as Brand[];

      if (resolvedBrands.length === 0) {
        const { data: newBrand, error: createError } = await supabase
          .from('brands')
          .insert({
            owner_user_id: user.id,
            name: 'My Brand',
            description: 'Default brand for PRO Studio',
          })
          .select('id, name, owner_user_id, description, industry, website')
          .single();

        if (createError || !newBrand) {
          throw createError || new Error('Failed to create default brand.');
        }

        resolvedBrands = [newBrand as Brand];
      }

      setBrands(resolvedBrands);
      setSelectedBrand(resolvedBrands[0] ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load brands';
      toast.error('Could not load Studio', { description: message });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadBrands();
  }, [loadBrands]);

  useEffect(() => {
    selectedBrandIdRef.current = selectedBrand?.id ?? null;
  }, [selectedBrand?.id]);

  const loadBrandIntelligence = useCallback(async (brandId: string) => {
    try {
      const { data, error } = await supabase
        .from('marketing_dna')
        .select('analyzed_at, evidence, created_at')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        if (selectedBrandIdRef.current === brandId) {
          setBrandIntelligence(null);
        }
        return;
      }

      const evidence = (data.evidence || {}) as Record<string, unknown>;
      const nextIntelligence: BrandIntelligence = {
        products: asStringList(evidence.products),
        offerings: asStringList(evidence.key_offerings),
        targetAudience: asTrimmedString(evidence.target_audience),
        businessFocus: asTrimmedString(evidence.business_focus),
        tagline: asTrimmedString(evidence.tagline),
        brandDescription: asTrimmedString(evidence.brand_description),
        website: asTrimmedString(evidence.website),
        analyzedAt: typeof data.analyzed_at === 'string' ? data.analyzed_at : null,
      };

      if (selectedBrandIdRef.current === brandId) {
        setBrandIntelligence(nextIntelligence);
      }
    } catch {
      if (selectedBrandIdRef.current === brandId) {
        setBrandIntelligence(null);
      }
    }
  }, [supabase]);

  const handleCreateBrand = async () => {
    const trimmedName = newBrandForm.name.trim();
    if (!trimmedName) {
      toast.error('Brand name is required');
      return;
    }

    setCreatingBrand(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        toast.error('Please sign in again to create a brand');
        return;
      }

      const payload = {
        owner_user_id: user.id,
        name: trimmedName,
        description: newBrandForm.description.trim() || null,
        industry: newBrandForm.industry.trim() || null,
        website: newBrandForm.website.trim() || null,
      };

      const { data: createdBrand, error } = await supabase
        .from('brands')
        .insert(payload)
        .select('id, name, owner_user_id, description, industry, website')
        .single();

      if (error || !createdBrand) {
        throw error || new Error('Could not create brand');
      }

      setBrands((prev) => [...prev, createdBrand as Brand]);
      setSelectedBrand(createdBrand as Brand);
      setCreateBrandOpen(false);
      setNewBrandForm({ name: '', description: '', industry: '', website: '' });
      toast.success('Brand created', {
        description: `"${createdBrand.name}" is ready for setup.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create brand';
      toast.error('Failed to create brand', { description: message });
    } finally {
      setCreatingBrand(false);
    }
  };

  const checkBrandSetup = useCallback(async (brandId: string) => {
    try {
      const res = await fetch(`/api/pro/brand-kit/status?brandId=${brandId}`);
      if (!res.ok) {
        if (selectedBrandIdRef.current !== brandId) return;
        setBrandSetupComplete(false);
        return;
      }
      const data = await res.json();
      if (selectedBrandIdRef.current !== brandId) return;
      if (data.setupComplete) {
        setBrandSetupComplete(true);

        const kit: BrandKit = {
          brandName: data.brandName || '',
          primaryColors: data.primaryColors || [],
          secondaryColors: data.secondaryColors || [],
          accentColors: data.accentColors || [],
          logoAssets: data.logoAssets || [],
          fontPersonality: data.fontPersonality || null,
          toneGuidelines: data.toneGuidelines || [],
          allowedImageStyles: data.allowedImageStyles || [],
        };
        setBrandKit(kit);

        const allColors = [
          ...(kit.primaryColors || []),
          ...(kit.accentColors || []),
          ...(kit.secondaryColors || []),
        ].filter(Boolean);

        if (allColors.length > 0) {
          setBrandColors(allColors.slice(0, 6));
        }

        const resolvedLogo = resolveLogoUrl(kit.logoAssets as Array<{ url?: string; file_url?: string; publicUrl?: string } | string>);
        setLogoUrl(resolvedLogo);
      } else {
        setBrandSetupComplete(false);
      }
    } catch {
      if (selectedBrandIdRef.current !== brandId) return;
      setBrandSetupComplete(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedBrand?.id) return;

    setBrandSetupComplete(false);
    setBrandKit(null);
    setLogoUrl('');
    setBrandColors(['#0A66C2', '#0F172A', '#22D3EE']);
    setSetupStep('welcome');
    setActiveStep(0);
    setConfirmedPost(null);
    setConfirmedImageUrl(null);

    void Promise.all([
      checkBrandSetup(selectedBrand.id),
      loadBrandIntelligence(selectedBrand.id),
    ]);
  }, [selectedBrand?.id, checkBrandSetup, loadBrandIntelligence]);

  // ─── Setup Handlers ───

  const handleAnalysisComplete = (analysis: AnalysisResult) => {
    if (analysis?.primary_colors?.length) {
      setBrandColors(analysis.primary_colors);
    }

    const extractedName =
      typeof analysis?.brand_name === 'string' && analysis.brand_name.trim()
        ? analysis.brand_name.trim()
        : null;
    const extractedDescription =
      typeof analysis?.brand_description === 'string' && analysis.brand_description.trim()
        ? analysis.brand_description.trim()
        : null;
    const extractedIndustry =
      typeof analysis?.industry === 'string' && analysis.industry.trim()
        ? analysis.industry.trim()
        : null;
    const extractedWebsite =
      typeof analysis?.website === 'string' && analysis.website.trim()
        ? analysis.website.trim()
        : null;

    if (selectedBrand && (extractedName || extractedDescription || extractedIndustry || extractedWebsite)) {
      setSelectedBrand((prev) =>
        prev
          ? {
              ...prev,
              name: extractedName || prev.name,
              description: extractedDescription || prev.description || null,
              industry: extractedIndustry || prev.industry || null,
              website: extractedWebsite || prev.website || null,
            }
          : prev
      );

      setBrands((prev) =>
        prev.map((brand) =>
          brand.id === selectedBrand.id
            ? {
                ...brand,
                name: extractedName || brand.name,
                description: extractedDescription || brand.description || null,
                industry: extractedIndustry || brand.industry || null,
                website: extractedWebsite || brand.website || null,
              }
            : brand
        )
      );
    }

    if (extractedName || extractedDescription) {
      setBrandKit((prev) => ({
        brandName: extractedName || prev?.brandName || selectedBrand?.name || '',
        primaryColors: prev?.primaryColors || [],
        secondaryColors: prev?.secondaryColors || [],
        accentColors: prev?.accentColors || [],
        logoAssets: prev?.logoAssets || [],
        fontPersonality: prev?.fontPersonality || null,
        toneGuidelines: prev?.toneGuidelines || [],
        allowedImageStyles: prev?.allowedImageStyles || [],
      }));
    }

    setBrandIntelligence({
      products: asStringList(analysis?.products),
      offerings: asStringList(analysis?.key_offerings),
      targetAudience: asTrimmedString(analysis?.target_audience),
      businessFocus: asTrimmedString(analysis?.business_focus),
      tagline: asTrimmedString(analysis?.tagline),
      brandDescription: extractedDescription || asTrimmedString(analysis?.brand_description),
      website: extractedWebsite || asTrimmedString(analysis?.website),
      analyzedAt: new Date().toISOString(),
    });

    setSetupStep('style');
  };

  const handleStyleComplete = (styleProfile: StyleProfile) => {
    const allColors = [
      ...(styleProfile?.colorScheme?.primary || []),
      ...(styleProfile?.colorScheme?.accent || []),
      ...(styleProfile?.colorScheme?.secondary || []),
    ].filter(Boolean);

    if (allColors.length > 0) {
      setBrandColors(allColors.slice(0, 6));
    }

    setBrandKit((prev) => ({
      brandName: prev?.brandName || selectedBrand?.name || '',
      primaryColors: styleProfile?.colorScheme?.primary || prev?.primaryColors || [],
      secondaryColors: styleProfile?.colorScheme?.secondary || prev?.secondaryColors || [],
      accentColors: styleProfile?.colorScheme?.accent || prev?.accentColors || [],
      logoAssets: prev?.logoAssets || [],
      fontPersonality: styleProfile?.typography?.fontMood || prev?.fontPersonality || null,
      toneGuidelines: styleProfile?.tone?.voice || prev?.toneGuidelines || [],
      allowedImageStyles: styleProfile?.imagery?.style || prev?.allowedImageStyles || [],
    }));

    setSetupStep('assets');
  };

  const handleAssetsComplete = () => {
    setSetupStep('complete');
    setBrandSetupComplete(true);
  };

  // ─── Pipeline Navigation ───

  const goToStep = useCallback((step: number) => {
    setActiveStep(Math.max(0, Math.min(PIPELINE_STEPS.length - 1, step)));
  }, []);

  const handlePostConfirmed = useCallback((post: ConfirmedPost) => {
    setConfirmedPost(post);
    setActiveStep(1); // Move to Image Creator
  }, []);

  const handleImageConfirmedFromCreator = useCallback((imageDataUrl: string) => {
    setConfirmedImageUrl(imageDataUrl);
    toast.success('Image generated! Opening editor for final adjustments...');
    setActiveStep(2); // Move to Image Editor
  }, []);

  const handleImageConfirmedFromEditor = useCallback((imageDataUrl: string) => {
    setConfirmedImageUrl(imageDataUrl);
    toast.success('Image updated! Moving to Preview…');
    setActiveStep(4); // Move to Preview & Publish
  }, []);

  // ─── Render: Welcome Screen ───

  const renderBrandWorkspaceBar = () => (
    <Card className="mb-6 border-white/10 bg-[#0b1234]/80 p-4 text-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-cyan-200">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Brand Workspace</span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-white">
            {selectedBrand?.name || 'Select a brand'}
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Select a brand before generation. Posts, assets, and analysis stay scoped to the selected brand.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            {selectedBrand?.industry ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                <Tag className="h-3.5 w-3.5" />
                {selectedBrand.industry}
              </span>
            ) : null}
            {selectedBrand?.website ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                <Globe className="h-3.5 w-3.5" />
                {selectedBrand.website}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[360px]">
          <Select
            value={selectedBrand?.id || ''}
            onValueChange={(brandId) => {
              const nextBrand = brands.find((brand) => brand.id === brandId);
              if (!nextBrand) return;
              setSelectedBrand(nextBrand);
            }}
          >
            <SelectTrigger className="h-10 border-white/20 bg-white/10 text-white">
              <SelectValue placeholder="Choose a brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={() => setCreateBrandOpen(true)}
            className="h-10 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Brand
          </Button>
        </div>
      </div>

      {brandIntelligence && (
        <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-[#0f173d]/80 p-3 text-sm md:grid-cols-3">
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-cyan-200">
              <Boxes className="h-3.5 w-3.5" />
              Products & Offerings
            </p>
            <p className="text-slate-200">
              {[...brandIntelligence.products, ...brandIntelligence.offerings]
                .slice(0, 4)
                .join(' • ') || 'Run Brand Analysis to detect products and offers'}
            </p>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-cyan-200">
              <Users className="h-3.5 w-3.5" />
              Target Audience
            </p>
            <p className="text-slate-200">
              {brandIntelligence.targetAudience || 'Add audience details in Brand Analyzer'}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-cyan-200">Business Focus</p>
            <p className="text-slate-200">
              {brandIntelligence.businessFocus || 'Define positioning in Brand Analyzer'}
            </p>
          </div>
        </div>
      )}

      <Dialog open={createBrandOpen} onOpenChange={setCreateBrandOpen}>
        <DialogContent className="border-white/10 bg-[#0b1234] text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a New Brand Workspace</DialogTitle>
            <DialogDescription className="text-slate-300">
              Add a brand, then analyze it for products, audience, and messaging.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-200">Brand Name</label>
              <Input
                value={newBrandForm.name}
                onChange={(e) => setNewBrandForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Zaincom"
                className="border-white/15 bg-[#0f173d] text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-200">Description</label>
              <Textarea
                value={newBrandForm.description}
                onChange={(e) => setNewBrandForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What this brand does, who it serves, and its positioning."
                className="min-h-[96px] border-white/15 bg-[#0f173d] text-white"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-200">Industry</label>
                <Input
                  value={newBrandForm.industry}
                  onChange={(e) => setNewBrandForm((prev) => ({ ...prev, industry: e.target.value }))}
                  placeholder="e.g., Energy, SaaS, Healthcare"
                  className="border-white/15 bg-[#0f173d] text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-200">Website</label>
                <Input
                  value={newBrandForm.website}
                  onChange={(e) => setNewBrandForm((prev) => ({ ...prev, website: e.target.value }))}
                  placeholder="https://example.com"
                  className="border-white/15 bg-[#0f173d] text-white"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateBrandOpen(false)}
              className="border-white/20 bg-transparent text-slate-200 hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              disabled={creatingBrand || !newBrandForm.name.trim()}
              onClick={handleCreateBrand}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90"
            >
              {creatingBrand ? 'Creating...' : 'Create Brand'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );

  const renderWelcomeScreen = () => (
    <div className="relative min-h-[84vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="absolute top-20 left-20 w-72 h-72 bg-cyan-500/25 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-16 right-20 w-96 h-96 bg-blue-500/25 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 w-full max-w-5xl text-center px-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-300/30 px-4 py-1.5 text-amber-100 mb-6">
          <Crown className="w-4 h-4" />
          PRO STUDIO
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-white leading-tight">
          Your Brand.
          <span className="block bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-300 bg-clip-text text-transparent">
            AI-Powered Content.
          </span>
        </h1>
        <p className="mt-5 text-lg text-slate-200 max-w-3xl mx-auto">
          Set up your brand once. Then generate perfectly on-brand LinkedIn posts with matching images in seconds.
        </p>

        <div className="mt-8 grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-300/30 flex items-center justify-center mb-3">
              <Target className="w-5 h-5 text-cyan-300" />
            </div>
            <h3 className="text-white font-semibold mb-1">Brand Analysis</h3>
            <p className="text-sm text-slate-300">We analyze your LinkedIn profile or manual brief to understand your voice and style</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-300/30 flex items-center justify-center mb-3">
              <Palette className="w-5 h-5 text-blue-300" />
            </div>
            <h3 className="text-white font-semibold mb-1">Visual Identity</h3>
            <p className="text-sm text-slate-300">Lock in your colors, fonts, and imagery style for consistent content</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 border border-purple-300/30 flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-purple-300" />
            </div>
            <h3 className="text-white font-semibold mb-1">AI Generation</h3>
            <p className="text-sm text-slate-300">Create posts and images that match your brand automatically</p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4">
          <Button
            size="lg"
            onClick={() => setSetupStep('analyze')}
            className="px-10 py-7 text-lg font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 hover:from-cyan-600 hover:via-blue-600 hover:to-purple-600 shadow-2xl hover:shadow-cyan-500/50 transition-all hover:scale-105"
          >
            <Play className="w-5 h-5 mr-2" />
            Start 3-Minute Setup
          </Button>
          <p className="text-xs text-slate-400">
            Takes just 3 minutes • Analyze brand → Set style → Add logos
          </p>
        </div>
      </div>
    </div>
  );

  // ─── Render: Setup Flow ───

  const renderSetupFlow = () => {
    if (!selectedBrand) return null;

    const steps = [
      { id: 'analyze', label: 'Analyze', icon: Target },
      { id: 'style', label: 'Style', icon: Palette },
      { id: 'assets', label: 'Assets', icon: Briefcase },
      { id: 'complete', label: 'Launch', icon: Rocket },
    ] as const;

    const stepIndexMap: Record<SetupStep, number> = {
      welcome: -1,
      analyze: 0,
      style: 1,
      assets: 2,
      complete: 3,
    };

    const currentIndex = stepIndexMap[setupStep];

    return (
      <div className="space-y-8">
        <Card className="p-6 bg-[#0b1234]/80 border-white/10 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Brand Setup: {selectedBrand.name}</h2>
              <p className="text-slate-300">Complete these steps to unlock AI-powered content generation for your brand</p>
            </div>
            <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-100 border-cyan-300/30">
              {currentIndex + 1} of 4 steps
            </Badge>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 overflow-x-auto pb-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const done = index < currentIndex;
              const active = index === currentIndex;
              const stepDescriptions = [
                'Understand your brand',
                'Define visual style',
                'Upload brand assets',
                'Start creating',
              ];
              return (
                <div key={step.id} className="flex items-center gap-3 min-w-[160px]">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                      done
                        ? 'bg-emerald-500 border-emerald-400 text-white'
                        : active
                        ? 'bg-cyan-500 border-cyan-300 text-white shadow-lg shadow-cyan-500/50'
                        : 'bg-white/10 border-white/20 text-slate-300'
                    }`}
                  >
                    {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{step.label}</p>
                    <p
                      className={`text-xs ${
                        done ? 'text-emerald-300' : active ? 'text-cyan-300' : 'text-slate-400'
                      }`}
                    >
                      {stepDescriptions[index]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {setupStep === 'analyze' && (
          <Card className="p-6">
            <BrandAnalyzer
              brandId={selectedBrand.id}
              brandContext={{
                name: selectedBrand.name,
                description: selectedBrand.description || undefined,
                industry: selectedBrand.industry || undefined,
                website: selectedBrand.website || undefined,
                products: brandIntelligence?.products || [],
                offerings: brandIntelligence?.offerings || [],
                targetAudience: brandIntelligence?.targetAudience || undefined,
              }}
              onAnalysisComplete={handleAnalysisComplete}
            />
          </Card>
        )}

        {setupStep === 'style' && (
          <Card className="p-6">
            <VisualStyleWizard brandId={selectedBrand.id} onComplete={handleStyleComplete} />
          </Card>
        )}

        {setupStep === 'assets' && (
          <Card className="p-6">
            <AssetManager
              brandId={selectedBrand.id}
              brandName={selectedBrand.name}
              brandColors={brandColors}
              onLogosUpdate={(logos) => {
                if (logos.length > 0) {
                  setLogoUrl(logos[0].url);
                }
              }}
              onBannersUpdate={() => {}}
              onSkip={handleAssetsComplete}
            />
            <div className="mt-6 flex justify-end">
              <Button onClick={handleAssetsComplete}>Continue to Studio</Button>
            </div>
          </Card>
        )}

        {setupStep === 'complete' && (
          <Card className="p-8 text-center bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border-emerald-400/30">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-cyan-500 mx-auto flex items-center justify-center mb-5">
              <Rocket className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-3xl font-black text-white">Setup Complete</h3>
            <p className="text-slate-200 mt-2 mb-6">Your brand profile is ready for brand-matched generation.</p>
            <Button
              size="lg"
              className="px-10 bg-gradient-to-r from-cyan-500 to-blue-500"
              onClick={() => setBrandSetupComplete(true)}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Launch Studio
            </Button>
          </Card>
        )}
      </div>
    );
  };

  // ─── Render: Main Studio (5-step pipeline) ───

  const renderMainStudio = () => {
    if (!selectedBrand) return null;

    const currentStep = PIPELINE_STEPS[activeStep];

    return (
      <div className="relative">
        {/* ─── Header ─── */}
        <div className="relative mb-6 px-6 py-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07]">
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-cyan-400 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-blue-400 rounded-full blur-3xl" />
          </div>

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold text-white tracking-tight">Pro Studio</h1>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-amber-200 text-[10px] font-bold uppercase tracking-wider">Pro</span>
                </div>
                <p className="text-sm text-slate-400 mt-0.5">
                  {currentStep.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/[0.08] rounded-xl border border-white/10">
                <div className="flex gap-1">
                  {brandColors.slice(0, 3).map((color, idx) => (
                    <div
                      key={idx}
                      className="w-4 h-4 rounded-md border border-white/20"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className="text-white/80 font-medium text-xs">{effectiveBrandName}</span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBrandSetupComplete(false);
                  setSetupStep('analyze');
                }}
                className="bg-white/[0.06] border-white/10 text-white/70 hover:bg-white/10 hover:text-white text-xs h-8"
              >
                <Settings className="w-3.5 h-3.5 mr-1" />
                Brand
              </Button>
            </div>
          </div>
        </div>

        {/* ─── Step Navigation Bar ─── */}
        <div className="mb-6 p-2 rounded-2xl bg-slate-900/85 border border-slate-700/70 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.85)] backdrop-blur-sm">
          <div className="flex items-center gap-1">
            {PIPELINE_STEPS.map((step, idx) => {
              const isActive = idx === activeStep;
              const isCompleted =
                (idx === 0 && confirmedPost !== null) ||
                (idx === 1 && confirmedImageUrl !== null) ||
                (idx === 2 && confirmedImageUrl !== null);

              // Connector line between steps
              const showConnector = idx < PIPELINE_STEPS.length - 1;

              return (
                <div key={step.id} className="flex-1 flex items-center">
                  <button
                    onClick={() => goToStep(idx)}
                    className={`w-full flex items-center justify-center gap-2 px-2 py-3 rounded-xl font-medium text-sm transition-all ${
                      isActive
                        ? `bg-gradient-to-r ${step.gradient} text-white shadow-lg shadow-cyan-900/40`
                        : isCompleted
                        ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-400/30'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {isCompleted && !isActive ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isActive
                          ? 'bg-white/25 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {idx + 1}
                      </div>
                    )}
                    <span className="hidden xl:inline truncate">{step.label}</span>
                    <span className="xl:hidden truncate">{step.shortLabel}</span>
                  </button>
                  {showConnector && (
                    <div className={`hidden md:block w-4 h-px mx-0.5 flex-shrink-0 ${
                      isCompleted ? 'bg-emerald-400' : 'bg-slate-700'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Step Content ─── */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" key={activeStep}>
          {/* Step 1: Post Generator */}
          {activeStep === 0 && (
            <Card className="p-6 rounded-2xl bg-gradient-to-b from-white to-slate-50 border border-slate-300/70 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.45)] dark:from-slate-950/80 dark:to-slate-900/70 dark:border-slate-700/70">
              <div className="mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${currentStep.gradient} flex items-center justify-center shadow-sm`}>
                      <PenLine className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Generate Your Post</h2>
                      <p className="text-sm text-slate-500">Write or AI-generate your LinkedIn post, then confirm the best one</p>
                    </div>
                  </div>
                </div>
                {confirmedPost && (
                  <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200/60 text-sm flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-emerald-800">Post confirmed</p>
                      <p className="text-emerald-600 truncate text-xs mt-0.5">{confirmedPost.headline.slice(0, 80)}</p>
                    </div>
                    <Button size="sm" onClick={() => goToStep(1)} className="bg-emerald-500 hover:bg-emerald-600 text-white flex-shrink-0 shadow-sm">
                      Create Image <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
              <PostGenerator
                brandId={selectedBrand.id}
                brandColors={brandColors}
                brandName={effectiveBrandName}
                logoUrl={logoUrl}
                onPostGenerated={(post) => {
                  toast.success('Post saved to drafts', { description: post.headline.slice(0, 60) });
                }}
                onPostConfirmed={handlePostConfirmed}
              />
            </Card>
          )}

          {/* Step 2: Image Creator */}
          {activeStep === 1 && (
            <Card className="p-6 rounded-2xl bg-gradient-to-b from-white to-slate-50 border border-slate-300/70 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.45)] dark:from-slate-950/80 dark:to-slate-900/70 dark:border-slate-700/70">
              <div className="mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${PIPELINE_STEPS[1].gradient} flex items-center justify-center shadow-sm`}>
                      <ImageIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Create Your Image</h2>
                      <p className="text-sm text-slate-500">
                        Add your logo, enter your wording, choose a tone — AI creates a branded LinkedIn image
                      </p>
                    </div>
                  </div>
                  {!confirmedPost && (
                    <Button size="sm" variant="outline" onClick={() => goToStep(0)} className="flex-shrink-0 text-xs">
                      <ArrowLeft className="w-3 h-3 mr-1" />
                      Write post first
                    </Button>
                  )}
                </div>
                {confirmedPost && (
                  <div className="mt-4 p-3 rounded-xl bg-blue-50/80 border border-blue-200/60 text-sm flex items-center gap-3">
                    <PenLine className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-blue-800 text-xs">Creating image for</p>
                      <p className="text-blue-600 truncate text-xs mt-0.5">{confirmedPost.headline.slice(0, 80)}</p>
                    </div>
                  </div>
                )}
              </div>
              <ImageCreator
                brandId={selectedBrand.id}
                brandName={effectiveBrandName}
                brandColors={brandColors}
                logoUrl={logoUrl}
                confirmedPostText={confirmedPost ? `${confirmedPost.headline}\n\n${confirmedPost.body}` : undefined}
                confirmedPostHeadline={confirmedPost?.headline}
                onImageConfirmed={handleImageConfirmedFromCreator}
              />
            </Card>
          )}

          {/* Step 3: Image Editor (fine-tune) */}
          {activeStep === 2 && (
            <Card className="p-2 bg-slate-900 border-slate-700/50 border rounded-2xl shadow-sm">
              <div className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${PIPELINE_STEPS[2].gradient} flex items-center justify-center shadow-sm`}>
                    <SlidersHorizontal className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Edit & Refine</h2>
                    <p className="text-sm text-slate-400">Fine-tune your image — adjust colors, add text, reposition elements</p>
                  </div>
                  {!confirmedImageUrl && (
                    <Button size="sm" variant="outline" onClick={() => goToStep(1)} className="ml-auto border-slate-600 text-slate-300 hover:text-white text-xs">
                      <ArrowLeft className="w-3 h-3 mr-1" />
                      Create image first
                    </Button>
                  )}
                </div>
              </div>
              <ImageEditor
                baseImageUrl={confirmedImageUrl || undefined}
                brandId={selectedBrand.id}
                brandColors={brandColors}
                brandName={effectiveBrandName}
                logoUrl={logoUrl}
                logoAssets={brandKit?.logoAssets}
                toneGuidelines={brandKit?.toneGuidelines}
                allowedImageStyles={brandKit?.allowedImageStyles}
                fontPersonality={brandKit?.fontPersonality || undefined}
                initialHeadline={confirmedPost?.headline}
                initialTagline={confirmedPost?.cta}
                onExport={() => {
                  toast.success('Image exported');
                }}
                onImageConfirmed={handleImageConfirmedFromEditor}
              />
            </Card>
          )}

          {/* Step 4: Logo Generator (Standalone Tool) */}
          {activeStep === 3 && (
            <Card className="p-6 rounded-2xl bg-gradient-to-b from-white to-slate-50 border border-slate-300/70 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.45)] dark:from-slate-950/80 dark:to-slate-900/70 dark:border-slate-700/70">
              <div className="mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${PIPELINE_STEPS[3].gradient} flex items-center justify-center shadow-sm`}>
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">AI Logo Generator</h2>
                    <p className="text-sm text-slate-500">Create logos, patterns, and brand assets with AI</p>
                  </div>
                  <Badge className="ml-auto bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                    Standalone Tool
                  </Badge>
                </div>
                <div className="mt-4 p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/50 text-sm flex items-center gap-2.5">
                  <Wand2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-emerald-700 text-xs">Generate logos anytime — they&apos;re saved to your brand kit and available for all future images.</span>
                </div>
              </div>
              <AssetManager
                brandId={selectedBrand.id}
                brandName={selectedBrand.name}
                brandColors={brandColors}
                onLogosUpdate={(logos) => {
                  if (logos.length > 0) {
                    setLogoUrl(logos[0].url);
                  }
                }}
                onBannersUpdate={() => {}}
              />
            </Card>
          )}

          {/* Step 5: Preview & Publish */}
          {activeStep === 4 && (
            <Card className="p-6 rounded-2xl bg-gradient-to-b from-white to-slate-50 border border-slate-300/70 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.45)] dark:from-slate-950/80 dark:to-slate-900/70 dark:border-slate-700/70">
              <div className="mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${PIPELINE_STEPS[4].gradient} flex items-center justify-center shadow-sm`}>
                    <Send className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Preview & Publish</h2>
                    <p className="text-sm text-slate-500">Review everything and publish directly to LinkedIn</p>
                  </div>
                </div>
              </div>
              <PreviewPublish
                confirmedPost={confirmedPost}
                confirmedImageUrl={confirmedImageUrl}
                brandName={effectiveBrandName}
                brandColors={brandColors}
                logoUrl={logoUrl}
                brandId={selectedBrand.id}
                onGoToStep={goToStep}
              />
            </Card>
          )}
        </div>

        {/* ─── Bottom Navigation ─── */}
        <div className="mt-8 flex items-center justify-between px-1">
          <Button
            variant="outline"
            onClick={() => goToStep(activeStep - 1)}
            disabled={activeStep === 0}
            className="gap-1.5 text-sm h-10 px-4 border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {activeStep > 0 ? PIPELINE_STEPS[activeStep - 1].shortLabel : 'Back'}
          </Button>

          <div className="flex items-center gap-1.5">
            {PIPELINE_STEPS.map((step, idx) => (
              <button
                key={idx}
                onClick={() => goToStep(idx)}
                title={step.label}
                className={`rounded-full transition-all ${
                  idx === activeStep
                    ? 'bg-cyan-500 w-7 h-2'
                    : (idx === 0 && confirmedPost) || (idx === 1 && confirmedImageUrl)
                    ? 'bg-emerald-400 w-2 h-2 hover:bg-emerald-300'
                    : 'bg-slate-400/70 dark:bg-slate-600 w-2 h-2 hover:bg-slate-500 dark:hover:bg-slate-500'
                }`}
              />
            ))}
          </div>

          <Button
            variant="outline"
            onClick={() => goToStep(activeStep + 1)}
            disabled={activeStep === PIPELINE_STEPS.length - 1}
            className="gap-1.5 text-sm h-10 px-4 border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60"
          >
            {activeStep < PIPELINE_STEPS.length - 1 ? PIPELINE_STEPS[activeStep + 1].shortLabel : 'Next'}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  // ─── Main Render ───

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 animate-pulse">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-sm text-slate-500 font-medium">Loading Pro Studio…</p>
      </div>
    );
  }

  if (!selectedBrand) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">No Brand Found</h2>
          <p className="text-gray-600 mb-4">Please create a brand first</p>
          <Button onClick={() => void loadBrands()}>Create Brand</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="rounded-3xl border border-slate-300/60 bg-gradient-to-b from-slate-100 via-white to-slate-100/70 p-4 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)] dark:border-slate-800/70 dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        {renderBrandWorkspaceBar()}
        {!brandSetupComplete && setupStep !== 'welcome'
          ? renderSetupFlow()
          : !brandSetupComplete
          ? renderWelcomeScreen()
          : renderMainStudio()}
      </div>
    </div>
  );
}
