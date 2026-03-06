'use client';

import './studio.css';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
  ChevronDown,
  ChevronUp,
  Building2,
  Plus,
  Boxes,
  Users,
  Globe,
  Tag,
  Loader2,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/context/workspace-context';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
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
import { EvidenceModal } from '@/components/studio/evidence-modal';
import { useEvidenceLocker } from '@/components/studio/hooks/use-evidence-locker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Company = {
  id: string;
  name: string;
  owner_user_id: string;
};

type Brand = {
  id: string;
  name: string;
  owner_user_id: string;
  company_id?: string | null;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
};

type Product = {
  id: string;
  name: string;
  brand_id: string;
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

type PostChannel = 'linkedin' | 'facebook' | 'instagram';

interface ConfirmedPost {
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  imageUrl?: string;
  imagePrompt?: string;
  variantLabel?: string;
  selectedChannels?: PostChannel[];
  primaryChannel?: PostChannel;
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
    description: 'Logo + wording + tone ? AI image',
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const { selectedBrand: workspaceBrand, setSelectedBrand: setWorkspaceBrand } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>('welcome');
  const [brandSetupComplete, setBrandSetupComplete] = useState(false);
  const [brandIntelligence, setBrandIntelligence] = useState<BrandIntelligence | null>(null);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [createBrandOpen, setCreateBrandOpen] = useState(false);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [newBrandForm, setNewBrandForm] = useState<NewBrandForm>({
    name: '',
    description: '',
    industry: '',
    website: '',
  });
  const selectedBrandIdRef = useRef<string | null>(null);

  const {
    evidence,
    selectedEvidenceIds,
    selectedEvidence,
    loading: evidenceLoading,
    mutating: evidenceMutating,
    toggleEvidence,
    clearSelection: clearSelectedEvidence,
    uploadFileEvidence,
    createUrlEvidence,
    createNoteEvidence,
  } = useEvidenceLocker(selectedBrand?.id || null);

  // Onboarding wizard state
  const [onboardStep, setOnboardStep] = useState<1 | 2 | 3>(1);
  const [companyNameInput, setCompanyNameInput] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);
  const [brandNameInput, setBrandNameInput] = useState('');
  const [addingBrand, setAddingBrand] = useState(false);
  const [productNameInput, setProductNameInput] = useState('');
  const [onboardProducts, setOnboardProducts] = useState<string[]>([]);

  // Product create dialog
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);

  // Derived: brands filtered by selected company (include orphan brands with null company_id)
  const filteredBrands = useMemo(
    () => selectedCompany
      ? brands.filter((b) => b.company_id === selectedCompany.id || !b.company_id)
      : brands,
    [brands, selectedCompany]
  );

  // Derived: products filtered by selected brand
  const filteredProducts = useMemo(
    () => selectedBrand ? products.filter((p) => p.brand_id === selectedBrand.id) : [],
    [products, selectedBrand]
  );

  // Derived: PDF-extracted images from the evidence locker (kept in sync after every upload)
  const pdfEvidenceImages = useMemo(
    () =>
      evidence
        .filter(
          (item) =>
            item.type === 'image' &&
            Array.isArray(item.tags) &&
            item.tags.includes('pdf-extracted') &&
            typeof item.signed_url === 'string' &&
            item.signed_url.length > 0
        )
        .map((item) => ({
          id: item.id,
          title: item.title,
          signed_url: item.signed_url as string,
        })),
    [evidence]
  );

  const selectedEvidenceContext = useMemo(
    () =>
      selectedEvidence.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        summary:
          item.description ||
          item.note_text ||
          (Array.isArray(item.tags) && item.tags.length ? `Tags: ${item.tags.join(', ')}` : undefined) ||
          undefined,
      })),
    [selectedEvidence]
  );

  // Pipeline state � initialised from ?step= URL param
  const [activeStep, setActiveStep] = useState(() => {
    const stepParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('step') : null;
    const parsed = stepParam ? parseInt(stepParam, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 4 ? parsed : 0;
  });

  // Brand styling
  const [brandColors, setBrandColors] = useState<string[]>(['#0A66C2', '#0F172A', '#22D3EE']);
  const [brandColorNames, setBrandColorNames] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);

  // Pipeline data flow
  const [confirmedPost, setConfirmedPost] = useState<ConfirmedPost | null>(null);
  const [confirmedImageUrl, setConfirmedImageUrl] = useState<string | null>(null);
  const [draftPostId, setDraftPostId] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const effectiveBrandName =
    selectedBrand?.name?.trim() || brandKit?.brandName?.trim() || 'My Brand';

  // --- Sync activeStep ? URL ---
  useEffect(() => {
    const current = searchParams.get('step');
    const next = String(activeStep);
    if (current !== next) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', next);
      router.replace(`/app/studio?${params.toString()}`, { scroll: false });
    }
  }, [activeStep, searchParams, router]);

  // --- Load saved draft post from ?postId= URL param ---
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    const postId = searchParams.get('postId');
    if (!postId || draftLoaded) return;

    (async () => {
      try {
        const { data: post, error } = await supabase
          .from('posts')
          .select('*')
          .eq('id', postId)
          .single();

        if (error || !post) {
          console.error('Failed to load draft post:', error);
          return;
        }

        // Parse post_content back into structured parts
        // Format from save-draft: headline\n\nbody\n\ncta\n\n#hashtag1 #hashtag2
        const parts = (post.post_content || '').split('\n\n').filter(Boolean);
        const headline = post.title || parts[0] || 'Untitled Post';

        // Detect hashtag section (last part starting with #)
        let hashtags: string[] = [];
        let bodyParts = parts.slice(1); // skip headline (use title instead)

        if (bodyParts.length > 0) {
          const lastPart = bodyParts[bodyParts.length - 1];
          if (lastPart.trim().startsWith('#')) {
            hashtags = lastPart.split(/\s+/).filter((t: string) => t.startsWith('#')).map((t: string) => t.replace(/^#/, ''));
            bodyParts = bodyParts.slice(0, -1);
          }
        }

        // Detect CTA (last remaining part, often short)
        let cta = '';
        let body = bodyParts.join('\n\n');
        if (bodyParts.length > 1) {
          const lastBody = bodyParts[bodyParts.length - 1];
          if (lastBody.length < 120) {
            cta = lastBody;
            body = bodyParts.slice(0, -1).join('\n\n');
          }
        }

        const loadedPost: ConfirmedPost = {
          headline,
          body,
          cta,
          hashtags,
          imageUrl: post.image_url || undefined,
          selectedChannels: ['linkedin', 'facebook', 'instagram'],
          primaryChannel: 'linkedin',
        };

        setConfirmedPost(loadedPost);
        if (post.image_url) {
          setConfirmedImageUrl(post.image_url);
        }
        setActiveStep(3);
        setDraftLoaded(true);

        // Also sync the brand if the post has one
        if (post.brand_id && brands.length > 0) {
          const match = brands.find((b: any) => b.id === post.brand_id);
          if (match) setSelectedBrand(match);
        }
      } catch (err) {
        console.error('Error loading draft:', err);
      }
    })();
  }, [searchParams, supabase, draftLoaded, brands]);

  // --- Sync selectedBrand → workspace (one-directional to avoid circular loop) ---
  // A ref tracks the last brand ID we synced TO the workspace context, so that when the
  // workspace context pushes an initial value back we don't re-trigger a second sync.
  const lastSyncedBrandIdRef = useRef<string | null>(null);

  useEffect(() => {
    // On mount / brand list load: if there is a workspace brand set elsewhere, prefer it.
    if (!workspaceBrand || brands.length === 0) return;
    if (workspaceBrand.id === selectedBrand?.id) return; // already in sync
    const match = brands.find((b) => b.id === workspaceBrand.id);
    if (match) {
      lastSyncedBrandIdRef.current = match.id; // mark so the next effect won't re-fire
      setSelectedBrand(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceBrand?.id, brands]);

  useEffect(() => {
    if (!selectedBrand) return;
    if (lastSyncedBrandIdRef.current === selectedBrand.id) return; // originated from workspace, skip
    lastSyncedBrandIdRef.current = selectedBrand.id;
    setWorkspaceBrand({
      id: selectedBrand.id,
      name: selectedBrand.name,
      description: selectedBrand.description ?? null,
      industry: selectedBrand.industry ?? null,
      website: selectedBrand.website ?? null,
    });
  }, [selectedBrand?.id, setWorkspaceBrand]);

  // --- Data Loading ---

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

      // Load companies
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, name, owner_user_id')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: true });

      const resolvedCompanies = (companyData || []) as Company[];
      setCompanies(resolvedCompanies);
      if (resolvedCompanies.length > 0) {
        setSelectedCompany(resolvedCompanies[0]);
      }

      // Load brands
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, owner_user_id, company_id, description, industry, website')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      let resolvedBrands = (data || []) as Brand[];

      if (resolvedBrands.length === 0) {
        // Guard: check again to prevent race-condition duplicates
        const { data: existingCheck } = await supabase
          .from('brands')
          .select('id, name, owner_user_id, company_id, description, industry, website')
          .eq('owner_user_id', user.id)
          .limit(1);

        if (existingCheck && existingCheck.length > 0) {
          // Another concurrent call already created the brand; use it
          resolvedBrands = existingCheck as Brand[];
        } else {
          const { data: newBrand, error: createError } = await supabase
            .from('brands')
            .insert({
              owner_user_id: user.id,
              name: 'My Brand',
              description: 'Default brand for PRO Studio',
              company_id: resolvedCompanies[0]?.id || null,
            })
            .select('id, name, owner_user_id, company_id, description, industry, website')
            .single();

          if (createError || !newBrand) {
            throw createError || new Error('Failed to create default brand.');
          }

          resolvedBrands = [newBrand as Brand];
        }
      }

      // Auto-assign orphan brands (null company_id) to the first company
      if (resolvedCompanies.length > 0) {
        const orphanBrands = resolvedBrands.filter((b) => !b.company_id);
        if (orphanBrands.length > 0) {
          const companyId = resolvedCompanies[0].id;
          // Update in DB (fire-and-forget)
          supabase
            .from('brands')
            .update({ company_id: companyId })
            .in('id', orphanBrands.map((b) => b.id))
            .then(() => { /* ignore */ });
          // Update locally
          resolvedBrands = resolvedBrands.map((b) =>
            !b.company_id ? { ...b, company_id: companyId } : b
          );
        }
      }

      setBrands(resolvedBrands);

      // Prefer globally active brand (from WorkspaceContext / localStorage); fall back to company's first brand
      const savedBrandId = (() => {
        try { return localStorage.getItem('voxa_active_brand_id'); } catch { return null; }
      })();
      const preferredBrand =
        (savedBrandId ? resolvedBrands.find((b) => b.id === savedBrandId) : null) ??
        (resolvedCompanies.length > 0
          ? resolvedBrands.find((b) => b.company_id === resolvedCompanies[0].id)
          : null) ??
        resolvedBrands[0] ??
        null;
      setSelectedBrand(preferredBrand);

      // Load all products for all user brands from products table
      const brandIds = resolvedBrands.map((b) => b.id);
      if (brandIds.length > 0) {
        const { data: productData } = await supabase
          .from('products')
          .select('id, name, brand_id')
          .in('brand_id', brandIds)
          .order('created_at', { ascending: true });
        setProducts((productData || []) as Product[]);
      }
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

        // Also extract colors from evidence if available and no brand_kit colors loaded yet
        const evidenceColors = asStringList(evidence.primary_colors);
        if (evidenceColors.length > 0) {
          setBrandColors((prev) => {
            // Only update if still on default colors
            const isDefault = prev.length === 3
              && prev[0] === '#0A66C2'
              && prev[1] === '#0F172A'
              && prev[2] === '#22D3EE';
            return isDefault ? evidenceColors.slice(0, 6) : prev;
          });
        }

        // Extract color names from evidence if available
        const colorNames = evidence.color_names;
        if (colorNames && typeof colorNames === 'object' && !Array.isArray(colorNames)) {
          setBrandColorNames(colorNames as Record<string, string>);
        }
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
        company_id: selectedCompany?.id || null,
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

  const handleCreateProduct = async () => {
    const trimmedName = newProductName.trim();
    if (!trimmedName || !selectedBrand) {
      toast.error('Product name and a selected brand are required');
      return;
    }
    setCreatingProduct(true);
    try {
      const { data: createdProduct, error } = await supabase
        .from('products')
        .insert({
          brand_id: selectedBrand.id,
          name: trimmedName,
          description: newProductDescription.trim() || null,
        })
        .select('id, name, brand_id')
        .single();
      if (error || !createdProduct) throw error || new Error('Could not create product');
      setProducts((prev) => [...prev, createdProduct as Product]);
      setSelectedProduct(createdProduct as Product);
      setCreateProductOpen(false);
      setNewProductName('');
      setNewProductDescription('');
      toast.success('Product created', {
        description: `"${(createdProduct as Product).name}" added to ${selectedBrand.name}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create product';
      toast.error('Failed to create product', { description: message });
    } finally {
      setCreatingProduct(false);
    }
  };

  const checkBrandSetup = useCallback(async (brandId: string) => {
    try {
      const res = await fetch(`/api/pro/brand-kit/status?brandId=${brandId}`);
      if (!res.ok) return;
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
      }
      // If no kit found, leave brandSetupComplete as-is (set by useEffect based on isDirect)
    } catch {
      // silently ignore � leave brandSetupComplete unchanged
    }
  }, []);

  useEffect(() => {
    if (!selectedBrand?.id) return;

    // If navigated with ?direct=true (e.g. from Brands page), skip setup and go straight to studio
    const params = new URLSearchParams(window.location.search);
    const isDirect = params.get('direct') === 'true';
    const hasPostId = !!params.get('postId');

    // When loading a saved draft, skip reset � the draft loader handles state
    if (hasPostId) {
      setBrandSetupComplete(true);
      void Promise.all([
        checkBrandSetup(selectedBrand.id),
        loadBrandIntelligence(selectedBrand.id),
      ]);
      return;
    }

    setBrandSetupComplete(isDirect);
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

  // --- Setup Handlers ---

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

  // --- Pipeline Navigation ---

  const goToStep = useCallback((step: number) => {
    setActiveStep(Math.max(0, Math.min(PIPELINE_STEPS.length - 1, step)));
  }, []);

  const handlePostConfirmed = useCallback((post: ConfirmedPost) => {
    setConfirmedPost(post);
    setActiveStep(1); // Move to Image Creator
  }, []);

  // Helper: update draft post's image_url in DB
  const updateDraftImage = useCallback(async (imageUrl: string) => {
    if (!draftPostId || !selectedBrand?.id || !confirmedPost) return;
    try {
      await fetch('/api/pro/post/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: draftPostId,
          brandId: selectedBrand.id,
          headline: confirmedPost.headline,
          body: confirmedPost.body,
          cta: confirmedPost.cta,
          hashtags: confirmedPost.hashtags,
          imageUrl,
        }),
      });
    } catch (err) {
      console.error('Failed to update draft image:', err);
    }
  }, [draftPostId, selectedBrand?.id, confirmedPost]);

  const handleImageConfirmedFromCreator = useCallback((imageDataUrl: string) => {
    setConfirmedImageUrl(imageDataUrl);
    updateDraftImage(imageDataUrl);
    toast.success('Image generated! Opening editor for final adjustments...');
    setActiveStep(2); // Move to Image Editor
  }, [updateDraftImage]);

  // Auto-sync generated image URL without navigating � ensures image is available in draft/preview
  const handleImageAutoSync = useCallback((imageUrl: string) => {
    setConfirmedImageUrl(imageUrl);
    updateDraftImage(imageUrl);
  }, [updateDraftImage]);

  const handleImageConfirmedFromEditor = useCallback((imageDataUrl: string) => {
    setConfirmedImageUrl(imageDataUrl);
    updateDraftImage(imageDataUrl);
    toast.success('Image updated! Moving to Preview�');
    setActiveStep(3); // Move to Preview & Publish
  }, [updateDraftImage]);

  // --- Render: Welcome Screen ---

  const renderBrandWorkspaceBar = () => (
    <Card className="mb-6 voxa-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2 text-cyan-600">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Workspace</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setWorkspaceCollapsed((prev) => !prev)}
          className="h-8 text-xs text-cyan-600 hover:bg-gray-100 hover:text-gray-900"
        >
          {workspaceCollapsed ? (
            <>
              Expand <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Collapse <ChevronUp className="ml-1 h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>

      {/* --- 3-Row Cascading Selector --- */}
      {!workspaceCollapsed && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {/* Row 1: Company */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Company</label>
              <Select
                value={selectedCompany?.id || ''}
                onValueChange={(companyId) => {
                  const next = companies.find((c) => c.id === companyId);
                  if (!next) return;
                  setSelectedCompany(next);
                  // Reset brand & product when company changes
                  const firstBrand = brands.find((b) => b.company_id === next.id)
                    || brands.find((b) => !b.company_id);
                  setSelectedBrand(firstBrand ?? null);
                  setSelectedProduct(null);
                }}
              >
                <SelectTrigger className="h-10 border-gray-200 bg-gray-100 text-gray-900">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 2: Brand (filtered by company) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Brand</label>
              <Select
                value={selectedBrand?.id || ''}
                onValueChange={(brandId) => {
                  const next = filteredBrands.find((b) => b.id === brandId);
                  if (!next) return;
                  setSelectedBrand(next);
                  // Reset product when brand changes
                  setSelectedProduct(null);
                }}
              >
                <SelectTrigger className="h-10 border-gray-200 bg-gray-100 text-gray-900">
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {filteredBrands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 3: Product (optional, filtered by brand) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Product (optional)</label>
              <Select
                value={selectedProduct?.id || 'none'}
                onValueChange={(val) => {
                  if (val === 'none') {
                    setSelectedProduct(null);
                    return;
                  }
                  const next = filteredProducts.find((p) => p.id === val);
                  setSelectedProduct(next ?? null);
                }}
              >
                <SelectTrigger className="h-10 border-gray-200 bg-gray-100 text-gray-900">
                  <SelectValue placeholder="All products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All products (brand-level)</SelectItem>
                  {filteredProducts.length === 0 && (
                    <SelectItem value="__no_products" disabled>
                      No products yet - click Quick Add Product
                    </SelectItem>
                  )}
                  {filteredProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {/* Scope summary + brand card */}
      <div className="mt-3 rounded-lg border border-gray-200/60 bg-gray-100/60 px-4 py-2.5 text-sm text-gray-600 flex flex-wrap items-center gap-2">
        <span className="text-gray-500 font-medium">Scope:</span>
        <span className="font-semibold text-cyan-600">
          {selectedCompany?.name || '�'}
        </span>
        <span className="text-gray-400">?</span>
        <span className="font-semibold text-cyan-600">
          {selectedBrand?.name || '�'}
        </span>
        {selectedProduct && (
          <>
            <span className="text-gray-400">?</span>
            <span className="font-semibold text-cyan-600">{selectedProduct.name}</span>
          </>
        )}
        <span className="ml-auto flex items-center gap-2 flex-wrap">
          {selectedBrand?.industry && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200/60 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
              <Tag className="h-3 w-3" />
              {selectedBrand.industry}
            </span>
          )}
          {brandIntelligence?.analyzedAt && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-50/30 bg-emerald-50/10 px-2 py-0.5 text-[11px] text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Analyzed {new Date(brandIntelligence.analyzedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
          {!brandIntelligence?.analyzedAt && brandSetupComplete && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-50/30 bg-amber-50/10 px-2 py-0.5 text-[11px] text-amber-400">
              No analysis yet
            </span>
          )}
          {confirmedPost && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-50/30 bg-blue-50/10 px-2 py-0.5 text-[11px] text-blue-400">
              1 post ready
            </span>
          )}
        </span>
      </div>

      {!workspaceCollapsed && (
        <>
          {/* Quick action buttons */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Link href="/app/brands">
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-cyan-200 bg-cyan-50 text-cyan-600 hover:bg-cyan-100 text-xs"
              >
                <Building2 className="mr-1 h-3.5 w-3.5" />
                Manage Companies, Brands & Assets
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => setCreateProductOpen(true)}
              disabled={!selectedBrand}
              className="h-8 bg-voxa-brand-gradient text-white hover:opacity-90 text-xs disabled:opacity-40"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Quick Add Product
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateBrandOpen(true)}
              className="h-8 bg-voxa-brand-gradient text-white hover:opacity-90 text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Quick Add Brand
            </Button>
            {selectedBrand?.industry && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs">
                <Tag className="h-3 w-3" />
                {selectedBrand.industry}
              </span>
            )}
            {selectedBrand?.website && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs">
                <Globe className="h-3 w-3" />
                {selectedBrand.website}
              </span>
            )}
          </div>

          {/* Brand Intelligence summary */}
          {brandIntelligence && (
            <div className="mt-4 grid gap-4 rounded-xl border border-gray-200/60 bg-gray-100/80 p-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-600">
                  <Boxes className="h-3.5 w-3.5" />
                  Products & Offerings
                </p>
                <p className="text-sm leading-relaxed text-gray-800">
                  {[...brandIntelligence.products, ...brandIntelligence.offerings]
                    .slice(0, 4)
                    .join(' � ') || 'Run Brand Analysis to detect products and offers'}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-600">
                  <Users className="h-3.5 w-3.5" />
                  Target Audience
                </p>
                <p className="text-sm leading-relaxed text-gray-800">
                  {brandIntelligence.targetAudience || 'Add audience details in Brand Analyzer'}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-600">Business Focus</p>
                <p className="text-sm leading-relaxed text-gray-800">
                  {brandIntelligence.businessFocus || 'Define positioning in Brand Analyzer'}
                </p>
              </div>
            </div>
          )}

          {/* Brand Colors preview */}
          {brandColors.length > 0 && brandColors[0] !== '#0A66C2' && !workspaceCollapsed && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-200/60 bg-gray-100/60 px-3 py-2">
              <span className="text-xs font-medium text-gray-500">Brand Colors:</span>
              <div className="flex items-center gap-1.5">
                {brandColors.slice(0, 6).map((color, idx) => (
                  <label
                    key={idx}
                    className="relative h-6 w-6 cursor-pointer rounded-md border border-gray-200 shadow-sm hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    title={brandColorNames?.[color] ? `${brandColorNames[color]} (${color}) � click to edit` : `${color} � click to edit`}
                  >
                    <input
                      type="color"
                      className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                      value={color}
                      onChange={(e) => {
                        const newColors = [...brandColors];
                        newColors[idx] = e.target.value;
                        setBrandColors(newColors);
                      }}
                    />
                  </label>
                ))}
              </div>
              <span className="text-[11px] text-gray-400 ml-1">Click to edit</span>
              <button
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                onClick={() => {
                  setBrandSetupComplete(false);
                  setSetupStep('style');
                }}
                title="Edit brand colors and style"
              >
                <Palette className="w-3 h-3" />
                Full Edit
              </button>
            </div>
          )}
        </>
      )}

      <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
        <DialogContent className="border-gray-200/60 bg-white text-gray-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Product{selectedBrand ? ` to ${selectedBrand.name}` : ''}</DialogTitle>
            <DialogDescription className="text-gray-600">
              Products help scope posts, images, and analytics to a specific offering.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Product Name</label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g., PowerGuard Pro, Enterprise Suite"
                className="border-gray-200/60 bg-gray-100 text-gray-900"
                onKeyDown={(e) => e.key === 'Enter' && void handleCreateProduct()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Description (optional)</label>
              <Textarea
                value={newProductDescription}
                onChange={(e) => setNewProductDescription(e.target.value)}
                placeholder="Short description of what this product does."
                className="min-h-[72px] border-gray-200/60 bg-gray-100 text-gray-900"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateProductOpen(false)}
              className="border-gray-200 bg-transparent text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              disabled={creatingProduct || !newProductName.trim()}
              onClick={() => void handleCreateProduct()}
              className="bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:opacity-90"
            >
              {creatingProduct ? 'Adding...' : 'Add Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createBrandOpen} onOpenChange={setCreateBrandOpen}>
        <DialogContent className="border-gray-200/60 bg-white text-gray-900 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a New Brand{selectedCompany ? ` under ${selectedCompany.name}` : ''}</DialogTitle>
            <DialogDescription className="text-gray-600">
              Add a brand, then analyze it for products, audience, and messaging.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Brand Name</label>
              <Input
                value={newBrandForm.name}
                onChange={(e) => setNewBrandForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., ABB, Chint, Elstar"
                className="border-gray-200/60 bg-gray-100 text-gray-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Textarea
                value={newBrandForm.description}
                onChange={(e) => setNewBrandForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What this brand does, who it serves, and its positioning."
                className="min-h-[96px] border-gray-200/60 bg-gray-100 text-gray-900"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Industry</label>
                <Input
                  value={newBrandForm.industry}
                  onChange={(e) => setNewBrandForm((prev) => ({ ...prev, industry: e.target.value }))}
                  placeholder="e.g., Energy, SaaS, Healthcare"
                  className="border-gray-200/60 bg-gray-100 text-gray-900"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Website</label>
                <Input
                  value={newBrandForm.website}
                  onChange={(e) => setNewBrandForm((prev) => ({ ...prev, website: e.target.value }))}
                  placeholder="https://example.com"
                  className="border-gray-200/60 bg-gray-100 text-gray-900"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateBrandOpen(false)}
              className="border-gray-200 bg-transparent text-gray-700 hover:bg-gray-100"
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

  const renderWelcomeScreen = () => {
    // Sync onboard step with company data
    const effectiveOnboardStep = (companies.length > 0 && companies[0].name !== 'My Company' && onboardStep === 1) ? 2 : onboardStep;

    const handleSaveCompany = async () => {
      if (!companyNameInput.trim()) return;
      setSavingCompany(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');

        if (companies.length > 0) {
          await supabase.from('companies').update({ name: companyNameInput.trim() }).eq('id', companies[0].id);
          setCompanies(prev => prev.map((c, i) => i === 0 ? { ...c, name: companyNameInput.trim() } : c));
          setSelectedCompany(prev => prev ? { ...prev, name: companyNameInput.trim() } : prev);
        } else {
          const { data, error } = await supabase.from('companies')
            .insert({ owner_user_id: user.id, name: companyNameInput.trim() })
            .select('id, name, owner_user_id')
            .single();
          if (error) throw error;
          const newCompany = data as Company;
          setCompanies([newCompany]);
          setSelectedCompany(newCompany);
        }
        toast.success(`Company "${companyNameInput.trim()}" saved!`);
        setOnboardStep(2);
      } catch (err) {
        toast.error('Failed to save company', { description: err instanceof Error ? err.message : '' });
      } finally {
        setSavingCompany(false);
      }
    };

    const handleAddBrand = async () => {
      if (!brandNameInput.trim()) return;
      setAddingBrand(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');

        const companyId = companies[0]?.id || selectedCompany?.id || null;
        const { data, error } = await supabase.from('brands')
          .insert({
            owner_user_id: user.id,
            name: brandNameInput.trim(),
            company_id: companyId,
          })
          .select('id, name, owner_user_id, company_id, description, industry, website')
          .single();
        if (error) throw error;
        const newBrand = data as Brand;
        setBrands(prev => [...prev, newBrand]);
        if (!selectedBrand) setSelectedBrand(newBrand);
        setBrandNameInput('');
        toast.success(`Brand "${newBrand.name}" added!`);
      } catch (err) {
        toast.error('Failed to add brand', { description: err instanceof Error ? err.message : '' });
      } finally {
        setAddingBrand(false);
      }
    };

    const handleAddProduct = () => {
      if (!productNameInput.trim()) return;
      setOnboardProducts(prev => [...prev, productNameInput.trim()]);
      setProductNameInput('');
    };

    const handleFinishOnboarding = async () => {
      const targetBrand = selectedBrand ?? brands[0];
      if (targetBrand && onboardProducts.length > 0) {
        const rows = onboardProducts.map((name) => ({ brand_id: targetBrand.id, name }));
        const { data: savedProducts } = await supabase
          .from('products')
          .insert(rows)
          .select('id, name, brand_id');
        if (savedProducts) {
          setProducts((prev) => [...prev, ...(savedProducts as Product[])]);
        }
      }
      setSetupStep('analyze');
    };

    const userBrands = selectedCompany
      ? brands.filter(b => b.company_id === selectedCompany.id)
      : brands.filter(b => b.name !== 'My Brand');

    return (
      <div className="relative min-h-[84vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-background">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full blur-3xl animate-pulse bg-voxa-gradient-soft opacity-30" />
          <div className="absolute bottom-16 right-20 w-96 h-96 rounded-full blur-3xl animate-pulse delay-1000 bg-voxa-gradient-soft opacity-20" />
        </div>

        <div className="relative z-10 w-full max-w-2xl px-4">
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-8 justify-center">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step < effectiveOnboardStep ? 'bg-emerald-500 text-white' :
                  step === effectiveOnboardStep ? 'bg-cyan-500 text-white scale-110 shadow-lg shadow-cyan-50/40' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                  {step < effectiveOnboardStep ? <CheckCircle2 className="w-5 h-5" /> : step}
                </div>
                {step < 3 && <div className={`w-16 h-0.5 ${step < effectiveOnboardStep ? 'bg-emerald-50' : 'bg-white/20'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Name your Company */}
          {effectiveOnboardStep === 1 && (
            <Card className="voxa-card p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-[16px] bg-voxa-brand-gradient mb-4 shadow-voxa">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold">Name Your Company</h2>
                <p className="text-gray-600 mt-2">This is the parent organization that holds all your brands.</p>
              </div>
              <div className="space-y-4 max-w-md mx-auto">
                <Input
                  value={companyNameInput}
                  onChange={(e) => setCompanyNameInput(e.target.value)}
                  placeholder="e.g., Zaincom Solutions"
                  className="h-12 text-lg border-gray-200 bg-gray-100 text-gray-900 placeholder:text-gray-400"
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveCompany()}
                  autoFocus
                />
                <Button
                  onClick={handleSaveCompany}
                  disabled={savingCompany || !companyNameInput.trim()}
                  className="w-full h-12 text-lg font-semibold bg-voxa-brand-gradient hover:-translate-y-0.5 transition-transform shadow-md"
                >
                  {savingCompany ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    <>Save & Continue <ArrowRight className="w-5 h-5 ml-2" /></>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* Step 2: Add your Brands */}
          {effectiveOnboardStep === 2 && (
            <Card className="voxa-card p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-[16px] bg-voxa-brand-gradient mb-4 shadow-voxa">
                  <Palette className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold">Add Your Brands</h2>
                <p className="text-gray-600 mt-2">
                  Add the brands under <span className="font-semibold text-cyan-600">{selectedCompany?.name || companyNameInput}</span>.
                  Each brand gets its own assets, products, and posts.
                </p>
              </div>

              <div className="space-y-4 max-w-md mx-auto">
                <div className="flex gap-2">
                  <Input
                    value={brandNameInput}
                    onChange={(e) => setBrandNameInput(e.target.value)}
                    placeholder="e.g., ABB, Chint, Elstar"
                    className="h-11 border-gray-200 bg-gray-100 text-gray-900 placeholder:text-gray-400"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddBrand()}
                    autoFocus
                  />
                  <Button
                    onClick={handleAddBrand}
                    disabled={addingBrand || !brandNameInput.trim()}
                    className="h-11 px-5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    {addingBrand ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
                  </Button>
                </div>

                {/* Brand list */}
                {userBrands.length > 0 && (
                  <div className="rounded-xl border border-gray-200/60 bg-gray-50 overflow-hidden">
                    {userBrands.map((brand, idx) => (
                      <div key={brand.id} className={`flex items-center gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-gray-200/60' : ''}`}>
                        <div className="w-8 h-8 rounded-lg bg-voxa-brand-gradient flex items-center justify-center text-white text-sm font-bold shadow-[0_2px_10px_rgba(74,144,226,0.3)]">
                          {brand.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{brand.name}</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setOnboardStep(1)}
                    className="flex-1 h-11 border-gray-200 bg-transparent text-gray-600 hover:bg-gray-100"
                  >
                    ? Back
                  </Button>
                  <Button
                    onClick={() => setOnboardStep(3)}
                    disabled={userBrands.length === 0}
                    className="flex-1 h-11 font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
                  >
                    Continue <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Step 3: Add Products (optional) & Launch */}
          {effectiveOnboardStep === 3 && (
            <Card className="voxa-card p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-[16px] bg-voxa-brand-gradient mb-4 shadow-voxa">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold">Ready to Launch!</h2>
                <p className="text-gray-600 mt-2">
                  Your workspace is set up. You can optionally add products for <span className="font-semibold text-cyan-600">{selectedBrand?.name || 'your brand'}</span>, or jump straight in.
                </p>
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-gray-200/60 bg-gray-50 p-4 mb-6 max-w-md mx-auto">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Your Setup</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-violet-400" />
                    <span className="text-gray-600">Company:</span>
                    <span className="font-semibold text-gray-900">{selectedCompany?.name}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Palette className="w-4 h-4 text-pink-400 mt-0.5" />
                    <span className="text-gray-600">Brands:</span>
                    <span className="font-semibold text-gray-900">{userBrands.map(b => b.name).join(', ') || '�'}</span>
                  </div>
                  {onboardProducts.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Target className="w-4 h-4 text-cyan-600 mt-0.5" />
                      <span className="text-gray-600">Products:</span>
                      <span className="font-semibold text-gray-900">{onboardProducts.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Optional product additions */}
              <div className="max-w-md mx-auto space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={productNameInput}
                    onChange={(e) => setProductNameInput(e.target.value)}
                    placeholder={`Add a product for ${selectedBrand?.name || 'brand'} (optional)`}
                    className="h-10 border-gray-200 bg-gray-100 text-gray-900 placeholder:text-gray-400 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddProduct()}
                  />
                  <Button
                    onClick={handleAddProduct}
                    disabled={!productNameInput.trim()}
                    variant="outline"
                    className="h-10 border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {onboardProducts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {onboardProducts.map((p, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-cyan-50/20 border border-cyan-50/30 px-3 py-1 text-xs text-cyan-600">
                        {p}
                        <button onClick={() => setOnboardProducts(prev => prev.filter((_, idx) => idx !== i))} className="ml-1 hover:text-red-300">�</button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setOnboardStep(2)}
                    className="flex-1 h-11 border-gray-200 bg-transparent text-gray-600 hover:bg-gray-100"
                  >
                    ? Back
                  </Button>
                  <Button
                    onClick={() => void handleFinishOnboarding()}
                    className="flex-1 h-12 text-lg font-bold bg-voxa-brand-gradient hover:-translate-y-0.5 transition-transform shadow-voxa"
                  >
                    <Rocket className="w-5 h-5 mr-2" />
                    Launch Studio
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  };

  // --- Render: Setup Flow ---

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
        <Card className="p-6 voxa-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Brand Setup: {selectedBrand.name}</h2>
              <p className="text-gray-600">Complete these steps to unlock AI-powered content generation for your brand</p>
            </div>
            <Badge variant="secondary" className="bg-cyan-50/20 text-cyan-100 border-cyan-300/30">
              {currentIndex + 1} of 4 steps
            </Badge>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 overflow-x-auto pb-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const done = index < currentIndex;
              const active = index === currentIndex;
              const canClick = done || active; // allow clicking completed or active steps
              const stepDescriptions = [
                'Understand your brand',
                'Define visual style',
                'Upload brand assets',
                'Start creating',
              ];
              const stepKeys: SetupStep[] = ['analyze', 'style', 'assets', 'complete'];
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 min-w-[160px] ${canClick ? 'cursor-pointer group' : ''}`}
                  onClick={() => {
                    if (canClick && stepKeys[index]) {
                      setSetupStep(stepKeys[index]);
                    }
                  }}
                  role={canClick ? 'button' : undefined}
                  tabIndex={canClick ? 0 : undefined}
                >
                  <div
                    className={`w-12 h-12 rounded-[16px] flex items-center justify-center border transition-all ${done
                      ? 'bg-emerald-500 border-emerald-400 text-white group-hover:bg-emerald-400 group-hover:scale-105'
                      : active
                        ? 'bg-voxa-brand-gradient border-none text-white shadow-voxa'
                        : 'bg-gray-100 border-gray-200 text-gray-600'
                      }`}
                  >
                    {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{step.label}</p>
                    <p
                      className={`text-xs ${done ? 'text-emerald-300' : active ? 'text-cyan-600' : 'text-gray-500'
                        }`}
                    >
                      {done ? 'Click to edit' : stepDescriptions[index]}
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
            <VisualStyleWizard brandId={selectedBrand.id} onComplete={handleStyleComplete} analyzedColors={brandColors} analyzedColorNames={brandColorNames} />
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
              onBannersUpdate={() => { }}
              onSkip={handleAssetsComplete}
            />
            <div className="mt-6 flex justify-end">
              <Button onClick={handleAssetsComplete}>Continue to Studio</Button>
            </div>
          </Card>
        )}

        {setupStep === 'complete' && (
          <Card className="p-8 text-center voxa-card">
            <div className="w-20 h-20 rounded-[20px] bg-voxa-brand-gradient mx-auto flex items-center justify-center mb-5 shadow-voxa">
              <Rocket className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-3xl font-black text-gray-900">Setup Complete</h3>
            <p className="text-gray-700 mt-2 mb-6">Your brand profile is ready for brand-matched generation.</p>
            <Button
              size="lg"
              className="px-10 bg-voxa-brand-gradient border-none"
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

  // --- Render: Main Studio (5-step pipeline) ---

  const renderMainStudio = () => {
    if (!selectedBrand) return null;

    const currentStep = PIPELINE_STEPS[activeStep];

    return (
      <div className="relative">
        {/* --- Header --- */}
        <div className="relative mb-6 px-6 py-5 rounded-2xl bg-card border border-border overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-20 -left-20 w-60 h-60 bg-voxa-gradient-soft rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-voxa-gradient-soft rounded-full blur-3xl" />
          </div>

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-voxa-brand-gradient flex items-center justify-center shadow-voxa">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Pro Studio</h1>
                  <span className="px-2 py-0.5 rounded-md bg-amber-50/20 border border-amber-400/30 text-amber-200 text-[10px] font-bold uppercase tracking-wider">Pro</span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {currentStep.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100/50 rounded-xl border border-gray-200/60">
                <div className="flex gap-1">
                  {brandColors.slice(0, 3).map((color, idx) => (
                    <div
                      key={idx}
                      className="w-4 h-4 rounded-md border border-gray-200"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className="text-gray-600 font-medium text-xs">{effectiveBrandName}</span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-gray-50 border-gray-200/60 text-gray-500 hover:bg-gray-100 hover:text-gray-900 text-xs h-8"
                  >
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    Brand
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-white border-gray-200 text-gray-900">
                  <DropdownMenuLabel className="text-gray-500 text-xs">Edit Brand Setup</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-gray-200" />
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50"
                    onClick={() => {
                      setBrandSetupComplete(false);
                      setSetupStep('analyze');
                    }}
                  >
                    <Target className="w-4 h-4 mr-2 text-cyan-600" />
                    Re-analyze Brand
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50"
                    onClick={() => {
                      setBrandSetupComplete(false);
                      setSetupStep('style');
                    }}
                  >
                    <Palette className="w-4 h-4 mr-2 text-purple-400" />
                    Edit Colors & Style
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50"
                    onClick={() => {
                      setBrandSetupComplete(false);
                      setSetupStep('assets');
                    }}
                  >
                    <Briefcase className="w-4 h-4 mr-2 text-amber-400" />
                    Edit Assets
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* --- Step Navigation Bar --- */}
        <div className="mb-6 p-2 rounded-2xl bg-card border border-border shadow-voxa backdrop-blur-sm">
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
                    className={`w-full flex items-center justify-center gap-2 px-2 py-3 rounded-xl font-medium text-sm transition-all ${isActive
                      ? `bg-voxa-brand-gradient text-white shadow-voxa`
                      : isCompleted
                        ? 'bg-emerald-50/15 text-emerald-300 hover:bg-emerald-50/20 border border-emerald-400/30'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    {isCompleted && !isActive ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-gray-50 text-gray-600'
                        }`}>
                        {idx + 1}
                      </div>
                    )}
                    <span className="hidden xl:inline truncate">{step.label}</span>
                    <span className="xl:hidden truncate">{step.shortLabel}</span>
                  </button>
                  {showConnector && (
                    <div className={`hidden md:block w-4 h-px mx-0.5 flex-shrink-0 ${isCompleted ? 'bg-emerald-400' : 'bg-gray-200'
                      }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* --- Step Content --- */}
        <div className="mb-6 rounded-xl border border-gray-200/60 bg-white/75 px-3 py-2 text-xs text-gray-700">
          <span className="font-semibold text-cyan-600">Active scope:</span>{' '}
          <span className="text-cyan-100">{selectedCompany?.name || '�'}</span>{' '}
          <span className="text-gray-400">?</span>{' '}
          <span className="text-cyan-100">{selectedBrand?.name || '�'}</span>
          {selectedProduct && (
            <>
              {' '}
              <span className="text-gray-400">?</span>{' '}
              <span className="text-cyan-100">{selectedProduct.name}</span>
            </>
          )}
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500" key={activeStep}>
          {/* Step 1: Post Generator */}
          {activeStep === 0 && (
            <Card className="p-6 rounded-2xl bg-card border border-border shadow-voxa">
              <div className="mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-voxa-brand-gradient flex items-center justify-center shadow-sm`}>
                      <PenLine className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Generate Your Post</h2>
                      <p className="text-sm text-slate-600">Write or AI-generate your LinkedIn post, then confirm the best one</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEvidenceModalOpen(true)}
                    className="text-xs border-cyan-200 text-cyan-700 hover:bg-cyan-50"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    Brand Knowledge PDFs
                  </Button>
                </div>
                <div className="mt-3 rounded-xl border border-cyan-200/60 bg-cyan-50/40 px-3 py-2 text-xs text-cyan-800">
                  <span className="font-semibold">Knowledge grounding:</span>{' '}
                  {selectedEvidence.length > 0
                    ? `${selectedEvidence.length} source${selectedEvidence.length === 1 ? '' : 's'} selected for generation`
                    : 'No sources selected. Add PDFs or notes to ground your post with brand knowledge.'}
                </div>
                {confirmedPost && (
                  <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200/60 text-sm flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
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
                productId={selectedProduct?.id}
                productName={selectedProduct?.name}
                brandColors={brandColors}
                brandName={effectiveBrandName}
                logoUrl={logoUrl}
                evidenceContext={selectedEvidenceContext}
                evidenceIds={selectedEvidenceIds}
                initialTopic={searchParams.get('topic') ?? undefined}
                onPostGenerated={(post, postId) => {
                  if (postId) setDraftPostId(postId);
                  toast.success('Post saved to drafts', { description: post.headline.slice(0, 60) });
                }}
                onPostConfirmed={handlePostConfirmed}
              />
            </Card>
          )}

          {/* Step 2: Image Creator */}
          {activeStep === 1 && (
            <Card className="p-6 rounded-2xl bg-card border border-border shadow-voxa">
              <div className="mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-voxa-brand-gradient flex items-center justify-center shadow-sm`}>
                      <ImageIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Create Your Image</h2>
                      <p className="text-sm text-slate-600">
                        Add your logo, enter your wording, choose a tone � AI creates a branded LinkedIn image
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
                  <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm flex items-center gap-3">
                    <PenLine className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-blue-900 text-xs">Creating image for</p>
                      <p className="text-blue-700 truncate text-xs mt-0.5">{confirmedPost.headline.slice(0, 80)}</p>
                    </div>
                  </div>
                )}
              </div>
              <ImageCreator
                brandId={selectedBrand.id}
                brandName={effectiveBrandName}
                productName={selectedProduct?.name}
                brandColors={brandColors}
                logoUrl={logoUrl}
                confirmedPostText={confirmedPost ? `${confirmedPost.headline}\n\n${confirmedPost.body}` : undefined}
                confirmedPostHeadline={confirmedPost?.headline}
                onImageConfirmed={handleImageConfirmedFromCreator}
                onImageGenerated={handleImageAutoSync}
                pdfImages={pdfEvidenceImages}
              />
            </Card>
          )}

          {/* Step 3: Image Editor (fine-tune) */}
          {activeStep === 2 && (
            <Card className="p-2 bg-card border-border border rounded-2xl shadow-voxa">
              <div className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-voxa-brand-gradient flex items-center justify-center shadow-sm`}>
                    <SlidersHorizontal className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Edit & Refine</h2>
                    <p className="text-sm text-gray-500">Fine-tune your image � adjust colors, add text, reposition elements</p>
                  </div>
                  {!confirmedImageUrl && (
                    <Button size="sm" variant="outline" onClick={() => goToStep(1)} className="ml-auto border-gray-300 text-gray-600 hover:text-gray-900 text-xs">
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
                onExport={() => {
                  toast.success('Image exported');
                }}
                onImageConfirmed={handleImageConfirmedFromEditor}
              />
            </Card>
          )}

          {/* Step 4: Preview & Publish */}
          {activeStep === 3 && (
            <Card className="p-6 rounded-2xl bg-card border border-border shadow-voxa">
              <div className="mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-voxa-brand-gradient flex items-center justify-center shadow-sm`}>
                    <Send className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Preview & Publish</h2>
                    <p className="text-sm text-slate-600">Review everything and publish to your platforms</p>
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
                selectedChannels={confirmedPost?.selectedChannels || ['linkedin']}
                primaryChannel={confirmedPost?.primaryChannel || 'linkedin'}
              />
            </Card>
          )}
        </div>

        {/* --- Bottom Navigation --- */}
        <div className="mt-8 flex items-center justify-between px-1">
          <Button
            variant="outline"
            onClick={() => goToStep(activeStep - 1)}
            disabled={activeStep === 0}
            className="gap-1.5 text-sm h-10 px-4 border-slate-300 bg-white/7060"
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
                className={`rounded-full transition-all ${idx === activeStep
                  ? 'bg-cyan-500 w-7 h-2'
                  : (idx === 0 && confirmedPost) || (idx === 1 && confirmedImageUrl)
                    ? 'bg-emerald-400 w-2 h-2 hover:bg-emerald-300'
                    : 'bg-slate-400/70 w-2 h-2 hover:bg-slate-50'
                  }`}
              />
            ))}
          </div>

          <Button
            variant="outline"
            onClick={() => goToStep(activeStep + 1)}
            disabled={activeStep === PIPELINE_STEPS.length - 1}
            className="gap-1.5 text-sm h-10 px-4 border-slate-300 bg-white/7060"
          >
            {activeStep < PIPELINE_STEPS.length - 1 ? PIPELINE_STEPS[activeStep + 1].shortLabel : 'Next'}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  // --- Main Render ---

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-50/20 animate-pulse">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-sm text-gray-400 font-medium">Loading Pro Studio�</p>
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
      <div className="rounded-[16px] bg-background border border-border p-4 shadow-voxa">
        {renderBrandWorkspaceBar()}
        {!brandSetupComplete && setupStep !== 'welcome'
          ? renderSetupFlow()
          : !brandSetupComplete
            ? renderWelcomeScreen()
            : renderMainStudio()}

        <EvidenceModal
          open={evidenceModalOpen}
          onOpenChange={setEvidenceModalOpen}
          brandId={selectedBrand.id}
          evidence={evidence}
          selectedEvidenceIds={selectedEvidenceIds}
          loading={evidenceLoading}
          mutating={evidenceMutating}
          onToggleEvidence={toggleEvidence}
          onClearSelection={clearSelectedEvidence}
          onUploadFile={uploadFileEvidence}
          onCreateUrl={createUrlEvidence}
          onCreateNote={createNoteEvidence}
        />
      </div>
    </div>
  );
}
