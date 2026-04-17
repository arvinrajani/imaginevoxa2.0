'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
    Building2,
    Plus,
    Loader2,
    Trash2,
    Pencil,
    Sparkles,
    ArrowRight,
    Tag,
    Palette,
    Upload,
    Image as ImageIcon,
    FolderOpen,
    CheckCircle2,
    XCircle,
    MessageSquare,
    Globe,
    Mail,
    Info,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/context/workspace-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { LogoUpload } from '@/components/shared/LogoUpload';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const companySchema = z.object({
    name: z.string().min(2, 'Company name must be at least 2 characters'),
    website: z.string().optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    industry: z.string().optional(),
});

type CompanyFormValues = z.infer<typeof companySchema>;

const COMPANY_INDUSTRIES = [
    { value: 'electrical', label: 'Electrical' },
    { value: 'manufacturing', label: 'Manufacturing' },
    { value: 'construction', label: 'Construction' },
    { value: 'technology', label: 'Technology' },
    { value: 'automotive', label: 'Automotive' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'general', label: 'General' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Company = {
    id: string;
    owner_user_id: string;
    name: string;
    logo_url: string | null;
    website: string | null;
    email: string | null;
    industry: string | null;
    created_at: string;
    updated_at: string;
};

type Brand = {
    id: string;
    owner_user_id: string;
    name: string;
    description: string | null;
    industry: string | null;
    website: string | null;
};

type BrandKitRow = {
    id: string;
    brand_id: string;
    primary_colors: string[] | null;
    is_active: boolean | null;
};

type BrandAssetRow = {
    id: string;
    brand_id: string;
    kind: string;
    is_primary: boolean | null;
    image_asset_id: string | null;
};

type ImageAssetRow = {
    id: string;
    file_url: string;
};

type BrandCardData = Brand & {
    logoUrl: string | null;
    primaryColor: string | null;
};

// ---------------------------------------------------------------------------
// Step 1: Company Registration Section
// ---------------------------------------------------------------------------

function CompanyRegistrationSection() {
    const supabase = useMemo(() => createClient(), []);
    const queryClient = useQueryClient();

    const companyQuery = useQuery({
        queryKey: ['company-profile'],
        queryFn: async (): Promise<Company | null> => {
            const {
                data: { user },
                error: authError,
            } = await supabase.auth.getUser();
            if (authError || !user) throw new Error('Unauthorized');

            const { data, error } = await supabase
                .from('companies')
                .select('id, owner_user_id, name, logo_url, website, email, industry, created_at, updated_at')
                .eq('owner_user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            return (data?.[0] as Company | undefined) ?? null;
        },
    });

    const form = useForm<CompanyFormValues>({
        resolver: zodResolver(companySchema),
        values: {
            name: companyQuery.data?.name ?? '',
            website: companyQuery.data?.website ?? '',
            email: companyQuery.data?.email ?? '',
            industry: companyQuery.data?.industry ?? 'general',
        },
    });

    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    // Keep logo in sync with query data
    const companyLogoUrl = logoUrl ?? companyQuery.data?.logo_url ?? null;
    const companyId = companyQuery.data?.id;

    const saveMutation = useMutation({
        mutationFn: async (values: CompanyFormValues) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error('Unauthorized');

            const { data: existingRows, error: existingError } = await supabase
                .from('companies')
                .select('id')
                .eq('owner_user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1);
            if (existingError) throw existingError;

            const payload = {
                owner_user_id: user.id,
                name: values.name.trim(),
                website: values.website?.trim() || null,
                email: values.email?.trim() || null,
                industry: values.industry || 'general',
                logo_url: companyLogoUrl,
                updated_at: new Date().toISOString(),
            };

            const existingCompanyId = existingRows?.[0]?.id ?? companyQuery.data?.id;
            if (existingCompanyId) {
                const { error } = await supabase
                    .from('companies')
                    .update(payload)
                    .eq('id', existingCompanyId);
                if (error) throw error;
                return;
            }

            const { error } = await supabase.from('companies').insert(payload);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success('Company saved');
            queryClient.invalidateQueries({ queryKey: ['company-profile'] });
        },
        onError: (err: Error) => {
            toast.error('Failed to save company', { description: err.message });
        },
    });

    const onSubmit = form.handleSubmit((values) => {
        saveMutation.mutate(values);
    });

    if (companyQuery.isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </div>
        );
    }

    const isNew = !companyQuery.data;

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-6 border-gray-200">
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {isNew ? 'Step 1 — Register Your Company' : 'Company Registered'}
                            </h2>
                            {!isNew && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                        </div>
                        <p className="text-sm text-gray-500">
                            {isNew
                                ? 'Create your company first. Then add brands underneath it.'
                                : `Your company "${companyQuery.data?.name}" is set up. You can rename it below.`}
                        </p>
                    </div>
                </div>

                <form onSubmit={onSubmit} className="space-y-4 mt-4 max-w-lg">
                    {/* Company Logo */}
                    <LogoUpload
                        label="Company Logo"
                        description="This appears on the left side of every marketing banner"
                        currentUrl={companyLogoUrl}
                        bucket="company-logos"
                        storagePath={companyId ? `${companyId}/logo` : `tmp-${Date.now()}/logo`}
                        onUploaded={(url) => setLogoUrl(url)}
                    />

                    {/* Company Name */}
                    <div>
                        <label
                            htmlFor="company-name"
                            className="block text-sm font-medium text-gray-700 mb-1.5"
                        >
                            Company Name
                        </label>
                        <Input
                            id="company-name"
                            placeholder="e.g., Zaincom Solutions"
                            className="h-11"
                            {...form.register('name')}
                        />
                        {form.formState.errors.name && (
                            <p className="text-sm text-red-500 mt-1">
                                {form.formState.errors.name.message}
                            </p>
                        )}
                    </div>

                    {/* Website */}
                    <div>
                        <label
                            htmlFor="company-website"
                            className="block text-sm font-medium text-gray-700 mb-1.5"
                        >
                            <Globe className="h-3.5 w-3.5 inline mr-1" />
                            Website
                        </label>
                        <Input
                            id="company-website"
                            placeholder="www.yourcompany.com"
                            className="h-11"
                            {...form.register('website')}
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label
                            htmlFor="company-email"
                            className="block text-sm font-medium text-gray-700 mb-1.5"
                        >
                            <Mail className="h-3.5 w-3.5 inline mr-1" />
                            Contact Email
                        </label>
                        <Input
                            id="company-email"
                            type="email"
                            placeholder="info@yourcompany.com"
                            className="h-11"
                            {...form.register('email')}
                        />
                        {form.formState.errors.email && (
                            <p className="text-sm text-red-500 mt-1">
                                {form.formState.errors.email.message}
                            </p>
                        )}
                    </div>

                    {/* Industry */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Your Industry
                        </label>
                        <Select
                            value={form.watch('industry') || 'general'}
                            onValueChange={(v) => form.setValue('industry', v, { shouldDirty: true })}
                        >
                            <SelectTrigger className="h-11">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {COMPANY_INDUSTRIES.map((ind) => (
                                    <SelectItem key={ind.value} value={ind.value}>
                                        {ind.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Info banner */}
                    <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
                        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-700">
                            Your logo and details are used automatically in all marketing banners — you only need to set this once.
                        </p>
                    </div>

                    <Button
                        type="submit"
                        disabled={saveMutation.isPending || (!form.formState.isDirty && !logoUrl)}
                        className="h-11 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:from-violet-700 hover:to-blue-700 text-white"
                    >
                        {saveMutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving…
                            </>
                        ) : isNew ? (
                            'Register Company'
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </form>
            </Card>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Step 3: Asset Manager Dialog
// ---------------------------------------------------------------------------

function BrandAssetManager({
    brand,
    open,
    onOpenChange,
}: {
    brand: BrandCardData;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const supabase = useMemo(() => createClient(), []);
    const queryClient = useQueryClient();
    const router = useRouter();
    const { setSelectedBrand } = useWorkspace();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [colorInput, setColorInput] = useState('');
    const [savingColor, setSavingColor] = useState(false);

    // Fetch existing assets
    const assetsQuery = useQuery({
        queryKey: ['brand-assets', brand.id],
        enabled: open,
        queryFn: async () => {
            const { data: assets, error } = await supabase
                .from('brand_assets')
                .select('id, brand_id, kind, is_primary, image_asset_id')
                .eq('brand_id', brand.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!assets || assets.length === 0) return [];

            const imageIds = assets
                .map((a: BrandAssetRow) => a.image_asset_id)
                .filter((id: string | null | undefined): id is string => Boolean(id));

            let images: ImageAssetRow[] = [];
            if (imageIds.length > 0) {
                const { data } = await supabase
                    .from('image_assets')
                    .select('id, file_url')
                    .in('id', imageIds);
                images = (data ?? []) as ImageAssetRow[];
            }

            const imageMap = new Map(images.map((img) => [img.id, img]));

            return assets.map((a: BrandAssetRow) => ({
                ...a,
                imageUrl: a.image_asset_id ? imageMap.get(a.image_asset_id)?.file_url : null,
            }));
        },
    });

    const handleLogoUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            setUploading(true);
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) throw new Error('Unauthorized');

                const ext = file.name.split('.').pop() || 'png';
                const path = `brand-logos/${brand.id}/${Date.now()}.${ext}`;

                const { error: uploadError } = await supabase.storage
                    .from('brand-assets')
                    .upload(path, file, { upsert: true });
                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('brand-assets')
                    .getPublicUrl(path);

                // Create image_asset record
                const { data: imgAsset, error: imgError } = await supabase
                    .from('image_assets')
                    .insert({
                        brand_id: brand.id,
                        created_by: user.id,
                        asset_type: 'logo',
                        file_url: urlData.publicUrl,
                        source: 'upload',
                        metadata: { label: `${brand.name} logo` },
                    })
                    .select('id')
                    .single();
                if (imgError) throw imgError;

                // Create brand_asset record
                const { error: assetError } = await supabase.from('brand_assets').insert({
                    brand_id: brand.id,
                    kind: 'logo',
                    is_primary: true,
                    image_asset_id: imgAsset.id,
                });
                if (assetError) throw assetError;

                // Also update brands.logo_url for backward compatibility
                await supabase
                    .from('brands')
                    .update({ logo_url: urlData.publicUrl })
                    .eq('id', brand.id);

                toast.success('Logo uploaded successfully');
                queryClient.invalidateQueries({ queryKey: ['brand-assets', brand.id] });
                queryClient.invalidateQueries({ queryKey: ['company-brands'] });
            } catch (err: unknown) {
                const msg = (err && typeof err === 'object' && 'message' in err)
                    ? (err as { message: string }).message
                    : JSON.stringify(err);
                console.error('[brand-logo-upload] Failed:', err);
                toast.error('Upload failed', { description: msg || 'Unknown error' });
            } finally {
                setUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        },
        [supabase, brand.id, brand.name, queryClient]
    );

    const handleSaveColor = useCallback(async () => {
        const color = colorInput.trim();
        if (!color) return;
        setSavingColor(true);
        try {
            // Upsert active brand kit with the color
            const { error } = await supabase.from('brand_kits').upsert(
                {
                    brand_id: brand.id,
                    is_active: true,
                    primary_colors: [color],
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'brand_id' }
            );
            if (error) throw error;

            toast.success('Brand color saved');
            queryClient.invalidateQueries({ queryKey: ['company-brands'] });
        } catch (err) {
            toast.error('Failed to save color', {
                description: err instanceof Error ? err.message : 'Try again.',
            });
        } finally {
            setSavingColor(false);
        }
    }, [supabase, brand.id, colorInput, queryClient]);

    const logos = (assetsQuery.data ?? []).filter(
        (a: { kind: string }) => a.kind === 'logo'
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-violet-500" />
                        Manage Assets — {brand.name}
                    </DialogTitle>
                    <DialogDescription>
                        Upload logos, set brand colors, and manage assets for this brand.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-2">
                    {/* Logo Upload */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <ImageIcon className="h-4 w-4 text-violet-500" />
                            Brand Logo
                        </h3>
                        <div className="flex items-center gap-3">
                            {brand.logoUrl && (
                                <img
                                    src={brand.logoUrl}
                                    alt="Current logo"
                                    className="h-14 w-14 rounded-xl border object-cover"
                                />
                            )}
                            <div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleLogoUpload}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                            Uploading…
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                                            {brand.logoUrl ? 'Replace Logo' : 'Upload Logo'}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {logos.length > 0 && (
                            <div className="mt-3 grid grid-cols-4 gap-2">
                                {logos.map(
                                    (logo: { id: string; imageUrl: string | null | undefined }) =>
                                        logo.imageUrl && (
                                            <img
                                                key={logo.id}
                                                src={logo.imageUrl}
                                                alt="Brand logo"
                                                className="h-16 w-16 rounded-lg border object-cover"
                                            />
                                        )
                                )}
                            </div>
                        )}
                    </div>

                    {/* Brand Color */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Palette className="h-4 w-4 text-pink-500" />
                            Primary Brand Color
                        </h3>
                        <div className="flex items-center gap-3">
                            {brand.primaryColor && (
                                <div
                                    className="h-10 w-10 rounded-lg border-2"
                                    style={{ backgroundColor: brand.primaryColor }}
                                />
                            )}
                            <Input
                                type="color"
                                value={colorInput || brand.primaryColor || '#6366f1'}
                                onChange={(e) => setColorInput(e.target.value)}
                                className="h-10 w-20 p-1 cursor-pointer"
                            />
                            <Input
                                type="text"
                                value={colorInput || brand.primaryColor || ''}
                                onChange={(e) => setColorInput(e.target.value)}
                                placeholder="#6366f1"
                                className="flex-1 h-10"
                            />
                            <Button
                                size="sm"
                                onClick={handleSaveColor}
                                disabled={savingColor || !colorInput.trim()}
                                className="bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 text-white"
                            >
                                {savingColor ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    'Save'
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Brand Info */}
                    <div className="rounded-lg bg-gray-50/50 p-4 text-sm">
                        <p className="font-medium text-gray-900 mb-1">Brand Details</p>
                        <div className="grid grid-cols-2 gap-2 text-gray-600">
                            <span>Industry: {brand.industry || '—'}</span>
                            <span>Website: {brand.website || '—'}</span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            Tip:{' '}
                            <button
                                type="button"
                                onClick={() => {
                                    onOpenChange(false);
                                    setSelectedBrand({
                                        id: brand.id,
                                        name: brand.name,
                                        description: brand.description,
                                        industry: brand.industry,
                                        website: brand.website,
                                    });
                                    router.push('/app/studio');
                                }}
                                className="text-violet-600 hover:text-violet-700 underline underline-offset-2"
                            >
                                Open Brand Analyzer in Studio
                            </button>{' '}
                            to auto-detect products, audience, and tone.
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// Step 2: Brand Card (with Manage Assets button)
// ---------------------------------------------------------------------------

function BrandCard({
    brand,
    onDelete,
    isDeleting,
}: {
    brand: BrandCardData;
    onDelete: (brandId: string) => void;
    isDeleting: boolean;
}) {
    const router = useRouter();
    const { setSelectedBrand } = useWorkspace();
    const [assetsOpen, setAssetsOpen] = useState(false);

    const handleOpenInStudio = useCallback(() => {
        setSelectedBrand({
            id: brand.id,
            name: brand.name,
            description: brand.description,
            industry: brand.industry,
            website: brand.website,
        });
        router.push('/app/studio?direct=true');
    }, [brand, setSelectedBrand, router]);

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
            >
                <Card className="p-5 hover:shadow-md transition-shadow border-gray-200">
                    <div className="flex items-start gap-4">
                        {/* Logo or colored circle */}
                        {brand.logoUrl ? (
                            <img
                                src={brand.logoUrl}
                                alt={`${brand.name} logo`}
                                className="h-12 w-12 rounded-xl object-cover border border-gray-200"
                                onError={(e) => {
                                    const target = e.currentTarget;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement | null;
                                    if (fallback) fallback.style.display = 'flex';
                                }}
                            />
                        ) : null}
                        <div
                            className={`h-12 w-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0 ${brand.logoUrl ? 'hidden' : ''
                                }`}
                            style={{
                                backgroundColor: brand.primaryColor ?? '#6366f1',
                                display: brand.logoUrl ? 'none' : 'flex',
                            }}
                        >
                            {brand.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">
                                {brand.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {brand.industry && (
                                    <Badge variant="secondary" className="text-xs">
                                        <Tag className="h-3 w-3 mr-1" />
                                        {brand.industry}
                                    </Badge>
                                )}
                                {brand.primaryColor && (
                                    <div className="flex items-center gap-1.5">
                                        <div
                                            className="h-4 w-4 rounded-full border border-gray-200"
                                            style={{ backgroundColor: brand.primaryColor }}
                                            title="Primary color"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 flex-wrap">
                        <Button
                            size="sm"
                            onClick={handleOpenInStudio}
                            className="bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:from-violet-700 hover:to-blue-700 text-white"
                        >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Open in Studio
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAssetsOpen(true)}
                        >
                            <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                            Manage Assets
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleOpenInStudio}
                        >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Edit
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setSelectedBrand({
                                    id: brand.id,
                                    name: brand.name,
                                    description: brand.description,
                                    industry: brand.industry,
                                    website: brand.website,
                                });
                                router.push('/app/settings/chatbot');
                            }}
                        >
                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                            Chatbot
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="ml-auto border-red-200 text-red-600 hover:bg-red-50/30"
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete &ldquo;{brand.name}&rdquo;?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete the brand and all related data
                                        (brand kits, posts, images, campaigns). This action cannot be
                                        undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                        onClick={() => onDelete(brand.id)}
                                    >
                                        Delete Brand
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </Card>
            </motion.div>

            <BrandAssetManager
                brand={brand}
                open={assetsOpen}
                onOpenChange={setAssetsOpen}
            />
        </>
    );
}

// ---------------------------------------------------------------------------
// Step 2: Brand Management Section
// ---------------------------------------------------------------------------

function BrandManagementSection() {
    const supabase = useMemo(() => createClient(), []);
    const queryClient = useQueryClient();
    const router = useRouter();
    const { setSelectedBrand, loadWorkspace } = useWorkspace();
    const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);
    const [showAddBrand, setShowAddBrand] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [brandName, setBrandName] = useState('');
    const [brandIndustry, setBrandIndustry] = useState('');
    const [targetAudience, setTargetAudience] = useState('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const [brandIndustryIcons, setBrandIndustryIcons] = useState<string[]>([]);

    const ICON_OPTIONS = [
        { value: 'datacenter', label: 'Data Centers' },
        { value: 'manufacturing', label: 'Manufacturing' },
        { value: 'hospital', label: 'Hospitals' },
        { value: 'mining', label: 'Mining' },
        { value: 'automotive', label: 'Automotive' },
        { value: 'building', label: 'Buildings' },
        { value: 'energy', label: 'Energy' },
        { value: 'agriculture', label: 'Agriculture' },
    ];

    const resetForm = () => {
        setBrandName('');
        setBrandIndustry('');
        setTargetAudience('');
        setLinkedinUrl('');
        setLogoFile(null);
        setLogoPreview(null);
        setBrandIndustryIcons([]);
        if (logoInputRef.current) logoInputRef.current.value = '';
    };

    const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoFile(file);
        const reader = new FileReader();
        reader.onload = () => setLogoPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleCreateBrand = async () => {
        if (!brandName.trim()) return;
        setIsCreating(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Unauthorized');

            // 0. Auto-create company if none exists
            let companyId: string | null = null;
            const { data: existingCo } = await supabase.from('companies')
                .select('id').eq('owner_user_id', user.id).limit(1).maybeSingle();
            if (existingCo) {
                companyId = existingCo.id;
            } else {
                const { data: newCo } = await supabase.from('companies')
                    .insert({ owner_user_id: user.id, name: brandName.trim() })
                    .select('id').single();
                if (newCo) companyId = newCo.id;
            }

            // 1. Create the brand
            const { data: brand, error: brandError } = await supabase
                .from('brands')
                .insert({
                    owner_user_id: user.id,
                    name: brandName.trim(),
                    industry: brandIndustry.trim() || null,
                    description: targetAudience.trim() ? `Target audience: ${targetAudience.trim()}` : null,
                    company_id: companyId,
                    industry_icons: brandIndustryIcons.length > 0 ? brandIndustryIcons : [],
                })
                .select('id, name, description, industry, website')
                .single();
            if (brandError) throw brandError;

            // 2. Upload logo if provided — save directly to brands.logo_url
            if (logoFile && brand?.id) {
                try {
                    const ext = logoFile.name.split('.').pop() || 'png';
                    const path = `${brand.id}/logo-${Date.now()}.${ext}`;
                    const { error: uploadError } = await supabase.storage
                        .from('brand-logos')
                        .upload(path, logoFile, { upsert: true });
                    if (!uploadError) {
                        const { data: urlData } = supabase.storage.from('brand-logos').getPublicUrl(path);
                        await supabase.from('brands').update({ logo_url: urlData.publicUrl }).eq('id', brand.id);
                    }
                } catch { /* logo upload failure is non-fatal */ }
            }

            toast.success('Brand created!', { description: brandName.trim() });
            setShowAddBrand(false);
            resetForm();
            queryClient.invalidateQueries({ queryKey: ['company-brands'] });

            // Set the newly created brand as active so Studio loads its data (not the previous brand's)
            if (brand) {
                setSelectedBrand({
                    id: brand.id,
                    name: (brand as any).name || brandName.trim(),
                    description: (brand as any).description ?? null,
                    industry: (brand as any).industry ?? null,
                    website: (brand as any).website ?? null,
                });
            }

            // Redirect to Studio — pass LinkedIn URL so the analyzer can run it there
            const studioParams = new URLSearchParams();
            if (linkedinUrl.trim()) {
                studioParams.set('linkedinUrl', linkedinUrl.trim());
            }
            const studioQuery = studioParams.toString();
            router.push(`/app/studio${studioQuery ? `?${studioQuery}` : ''}`);
        } catch (err) {
            toast.error('Failed to create brand', { description: err instanceof Error ? err.message : 'Please try again.' });
        } finally {
            setIsCreating(false);
        }
    };

    const brandsQuery = useQuery({
        queryKey: ['company-brands'],
        queryFn: async (): Promise<BrandCardData[]> => {
            const {
                data: { user },
                error: authError,
            } = await supabase.auth.getUser();
            if (authError || !user) throw new Error('Unauthorized');

            // Fetch all brands
            const { data: brands, error: brandsError } = await supabase
                .from('brands')
                .select('id, owner_user_id, name, description, industry, website')
                .eq('owner_user_id', user.id)
                .order('created_at', { ascending: true });

            if (brandsError) throw brandsError;
            if (!brands || brands.length === 0) return [];

            const brandIds = brands.map((b: any) => b.id);

            // Fetch brand kits for primary colors (is_active filter omitted for compatibility)
            const { data: kits } = await supabase
                .from('brand_kits')
                .select('id, brand_id, primary_colors')
                .in('brand_id', brandIds)
                .order('created_at', { ascending: false });

            // Fetch primary logo brand_assets
            const { data: assets } = await supabase
                .from('brand_assets')
                .select('id, brand_id, kind, is_primary, image_asset_id')
                .in('brand_id', brandIds)
                .eq('kind', 'logo')
                .eq('is_primary', true);

            // Fetch image_assets for those logos
            const imageAssetIds = (assets ?? [])
                .map((a: any) => (a as BrandAssetRow).image_asset_id)
                .filter((id: any): id is string => Boolean(id));

            let imageAssets: ImageAssetRow[] = [];
            if (imageAssetIds.length > 0) {
                const { data: imgData } = await supabase
                    .from('image_assets')
                    .select('id, file_url')
                    .in('id', imageAssetIds);
                imageAssets = (imgData ?? []) as ImageAssetRow[];
            }

            // Build lookup maps
            const kitsByBrand = new Map<string, BrandKitRow>();
            for (const k of (kits ?? []) as BrandKitRow[]) {
                kitsByBrand.set(k.brand_id, k);
            }

            const assetsByBrand = new Map<string, BrandAssetRow>();
            for (const a of (assets ?? []) as BrandAssetRow[]) {
                assetsByBrand.set(a.brand_id, a);
            }

            const imageAssetsById = new Map<string, ImageAssetRow>();
            for (const img of imageAssets) {
                imageAssetsById.set(img.id, img);
            }

            return brands.map((brand: any) => {
                const kit = kitsByBrand.get(brand.id);
                const asset = assetsByBrand.get(brand.id);
                const imageAsset = asset?.image_asset_id
                    ? imageAssetsById.get(asset.image_asset_id)
                    : undefined;

                const primaryColors = kit?.primary_colors;
                const primaryColor =
                    Array.isArray(primaryColors) && primaryColors.length > 0
                        ? primaryColors[0]
                        : null;

                return {
                    ...brand,
                    logoUrl: imageAsset?.file_url ?? null,
                    primaryColor,
                } as BrandCardData;
            });
        },
    });

    const handleDelete = useCallback(
        async (brandId: string) => {
            setDeletingBrandId(brandId);
            try {
                const { error } = await supabase
                    .from('brands')
                    .delete()
                    .eq('id', brandId);

                if (error) throw error;

                toast.success('Brand deleted');
                queryClient.invalidateQueries({ queryKey: ['company-brands'] });
            } catch (err) {
                toast.error('Failed to delete brand', {
                    description: err instanceof Error ? err.message : 'Please try again.',
                });
            } finally {
                setDeletingBrandId(null);
            }
        },
        [supabase, queryClient]
    );

    if (brandsQuery.isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </div>
        );
    }

    const brands = brandsQuery.data ?? [];

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="p-6 border-gray-200">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <Palette className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">
                                Step 2 — Your Brands
                            </h2>
                            <p className="text-sm text-gray-500">
                                {brands.length} brand{brands.length !== 1 ? 's' : ''} registered. Each brand has its own assets, products, and social accounts.
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => setShowAddBrand(true)}
                        className="bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:from-violet-700 hover:to-blue-700 text-white"
                    >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add Brand
                    </Button>
                </div>

                {brands.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-16"
                    >
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100/40 flex items-center justify-center mx-auto mb-4">
                            <Sparkles className="h-8 w-8 text-violet-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            No brands yet
                        </h3>
                        <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                            Add your first brand to start creating content. Each brand keeps its own logos, colors, products, and posts isolated.
                        </p>
                        <Button
                            onClick={() => setShowAddBrand(true)}
                            className="bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:from-violet-700 hover:to-blue-700 text-white"
                        >
                            <Plus className="h-4 w-4 mr-1.5" />
                            Create First Brand
                            <ArrowRight className="h-4 w-4 ml-1.5" />
                        </Button>
                    </motion.div>
                ) : (
                    <div className="grid gap-4">
                        {brands.map((brand) => (
                            <BrandCard
                                key={brand.id}
                                brand={brand}
                                onDelete={handleDelete}
                                isDeleting={deletingBrandId === brand.id}
                            />
                        ))}
                    </div>
                )}

                {/* Add Brand Dialog */}
                <Dialog open={showAddBrand} onOpenChange={(open) => { setShowAddBrand(open); if (!open) resetForm(); }}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-violet-500" />
                                Add New Brand
                            </DialogTitle>
                            <DialogDescription>Fill in the basics. We&apos;ll handle the rest.</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                            {/* Brand Name */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700">Brand Name <span className="text-red-500">*</span></label>
                                <Input
                                    value={brandName}
                                    onChange={(e) => setBrandName(e.target.value)}
                                    placeholder="e.g., Acme Corp"
                                    className="h-11"
                                />
                            </div>

                            {/* Industry */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700">Industry</label>
                                <Input
                                    value={brandIndustry}
                                    onChange={(e) => setBrandIndustry(e.target.value)}
                                    placeholder="e.g., SaaS, Healthcare, Retail"
                                    className="h-11"
                                />
                            </div>

                            {/* Target Audience */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700">Target Audience</label>
                                <Textarea
                                    value={targetAudience}
                                    onChange={(e) => setTargetAudience(e.target.value)}
                                    placeholder="e.g., Marketing managers at mid-size B2B companies"
                                    className="min-h-[72px] resize-none"
                                />
                            </div>

                            {/* Logo Upload */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700">Brand / Partner Logo</label>
                                <p className="text-xs text-gray-500">
                                    The manufacturer or partner brand logo (e.g. CHNT, ABB, Schneider).
                                    This appears on the right side of marketing banners.
                                </p>
                                <div
                                    className="flex items-center gap-4 rounded-xl border-2 border-dashed border-gray-200 p-4 cursor-pointer hover:border-violet-400 transition-colors"
                                    onClick={() => logoInputRef.current?.click()}
                                >
                                    {logoPreview ? (
                                        <img src={logoPreview} alt="Logo preview" className="h-14 w-14 rounded-lg object-cover border" />
                                    ) : (
                                        <div className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center">
                                            <Upload className="h-6 w-6 text-gray-400" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm font-medium text-gray-700">
                                            {logoPreview ? 'Change logo' : 'Upload logo'}
                                        </p>
                                        <p className="text-xs text-gray-500">PNG, JPG, SVG (optional)</p>
                                    </div>
                                    <input
                                        ref={logoInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleLogoSelect}
                                    />
                                </div>
                            </div>

                            {/* LinkedIn URL */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
                                    LinkedIn Profile URL
                                    <span className="text-xs font-normal text-gray-400 ml-1">(optional — AI will analyze it)</span>
                                </label>
                                <Input
                                    value={linkedinUrl}
                                    onChange={(e) => setLinkedinUrl(e.target.value)}
                                    placeholder="https://linkedin.com/company/your-brand"
                                    className="h-11"
                                />
                            </div>

                            {/* Industry Sectors Served */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700">Industry Sectors Served</label>
                                <p className="text-xs text-gray-500">These icons appear at the bottom of marketing banners</p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {ICON_OPTIONS.map((opt) => {
                                        const active = brandIndustryIcons.includes(opt.value);
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() =>
                                                    setBrandIndustryIcons((prev) =>
                                                        active
                                                            ? prev.filter((v) => v !== opt.value)
                                                            : [...prev, opt.value]
                                                    )
                                                }
                                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                                    }`}
                                            >
                                                {active ? '✓ ' : ''}{opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => { setShowAddBrand(false); resetForm(); }}
                                disabled={isCreating}
                            >
                                Cancel
                            </Button>
                            <Button
                                disabled={isCreating || !brandName.trim()}
                                onClick={handleCreateBrand}
                                className="bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:from-violet-700 hover:to-blue-700 text-white"
                            >
                                {isCreating ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
                                ) : (
                                    <>Create Brand</>
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </Card>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BrandsPage() {
    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Building2 className="h-7 w-7 text-violet-600" />
                    Workspaces
                </h1>
                <p className="text-gray-500 mt-1">
                    Register your company, create brands, and manage each brand&apos;s assets.
                </p>
            </div>

            <div className="space-y-6">
                <CompanyRegistrationSection />
                <BrandManagementSection />
            </div>
        </div>
    );
}
