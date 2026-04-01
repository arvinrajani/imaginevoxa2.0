'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspace } from '@/lib/context/workspace-context';
import { toast } from 'sonner';
import {
    FileText,
    CheckCircle2,
    Clock,
    Trash2,
    Loader2,
    Copy,
    ExternalLink,
    MessageSquare,
    Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Brand = {
    id: string;
    name: string;
    website: string | null;
    chatbot_enabled: boolean | null;
    chatbot_slug: string | null;
    chatbot_welcome_message: string | null;
};

type EvidenceAsset = {
    id: string;
    brand_id: string;
    type: string;
    title: string;
    file_path: string | null;
    created_at: string;
};

type LegacyPdfSourceMeta = {
    sourceFile: string;
    filePath: string | null;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type ChatSession = {
    id: string;
    brand_id: string;
    session_token: string;
    messages: ChatMessage[];
    created_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64);
}

function validateSlug(slug: string): boolean {
    return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug) && slug.length >= 3;
}

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null | undefined, relationName?: string) {
    if (!error) return false;
    const code = (error.code || '').toUpperCase();
    const message = (error.message || '').toLowerCase();
    const relation = relationName?.toLowerCase();

    if (code === '42P01' || code === 'PGRST205') {
        return relation ? message.includes(relation) : true;
    }

    if (relation) {
        return message.includes(relation) && message.includes('does not exist');
    }

    return message.includes('relation') && message.includes('does not exist');
}

async function readApiError(response: Response, fallback: string) {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text().catch(() => '');

    if (contentType.includes('application/json')) {
        try {
            const data = JSON.parse(text) as { error?: string } | null;
            if (data?.error) {
                return data.error;
            }
        } catch {
            // Fall back to the raw response body below.
        }
    }

    const normalized = text.trim();
    if (!normalized) {
        return fallback;
    }

    if (/request entity too large/i.test(normalized)) {
        return 'The upload was rejected before the server could process it. Please retry; the chatbot uploader now uses direct storage upload.';
    }

    return normalized.slice(0, 240);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatbotSettingsPage() {
    const supabase = useMemo(() => createClient(), []);
    const { selectedBrand: workspaceBrand } = useWorkspace();

    // Brand selection
    const [brands, setBrands] = useState<Brand[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState<string>('');
    const [loadingBrands, setLoadingBrands] = useState(true);

    // Settings form
    const [chatbotSlug, setChatbotSlug] = useState('');
    const [welcomeMessage, setWelcomeMessage] = useState('');
    const [savingSettings, setSavingSettings] = useState(false);

    // Knowledge base
    const [pdfAssets, setPdfAssets] = useState<EvidenceAsset[]>([]);
    const [chunkCounts, setChunkCounts] = useState<Record<string, number>>({});
    const [totalChunks, setTotalChunks] = useState(0);
    const [processingAssetId, setProcessingAssetId] = useState<string | null>(null);
    const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
    const [legacyPdfMetaById, setLegacyPdfMetaById] = useState<Record<string, LegacyPdfSourceMeta>>({});

    // Migration state – true when chatbot columns exist on the brands table
    const [chatbotMigrated, setChatbotMigrated] = useState(true);

    // Conversations
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [viewingSession, setViewingSession] = useState<ChatSession | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const selectedBrand = useMemo(
        () => brands.find((brand) => brand.id === selectedBrandId) ?? null,
        [brands, selectedBrandId]
    );
    const isLocalOrigin = useMemo(() => {
        if (typeof window === 'undefined') return false;
        try {
            const current = new URL(window.location.origin);
            return ['localhost', '127.0.0.1', '0.0.0.0'].includes(current.hostname);
        } catch {
            return false;
        }
    }, []);
    const hasPublicChatbot = Boolean(selectedBrand?.chatbot_enabled && selectedBrand?.chatbot_slug);

    const chatbotPublicUrl = useMemo(() => {
        if (!selectedBrand?.chatbot_slug) return '';
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        return origin ? `${origin}/chat/${selectedBrand.chatbot_slug}` : '';
    }, [selectedBrand?.chatbot_slug]);

    const chatbotPreviewUrl = useMemo(() => {
        if (!isLocalOrigin || !selectedBrandId || !chatbotSlug) return '';
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        if (!origin) return '';
        const previewUrl = new URL(`/chat/${chatbotSlug}`, origin);
        previewUrl.searchParams.set('preview', '1');
        previewUrl.searchParams.set('brandId', selectedBrandId);
        return previewUrl.toString();
    }, [chatbotSlug, isLocalOrigin, selectedBrandId]);

    // ---- Load brands ----
    useEffect(() => {
        async function loadBrands() {
            setLoadingBrands(true);
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                setLoadingBrands(false);
                return;
            }

            // Try loading with chatbot columns first
            const { data, error } = await supabase
                .from('brands')
                .select('id, name, website, chatbot_enabled, chatbot_slug, chatbot_welcome_message')
                .eq('owner_user_id', user.id)
                .order('name');

            let brandList: Brand[];

            if (error && (error.message?.includes('does not exist') || error.code === 'PGRST204' || error.code === '42703')) {
                // Chatbot columns missing – fall back to basic columns
                setChatbotMigrated(false);
                const { data: basicData } = await supabase
                    .from('brands')
                    .select('id, name, website')
                    .eq('owner_user_id', user.id)
                    .order('name');

                brandList = ((basicData ?? []) as { id: string; name: string; website: string | null }[]).map((b) => ({
                    ...b,
                    chatbot_enabled: null,
                    chatbot_slug: null,
                    chatbot_welcome_message: null,
                }));
            } else {
                setChatbotMigrated(true);
                brandList = (data ?? []) as Brand[];
            }

            setBrands(brandList);
            if (brandList.length > 0 && !selectedBrandId) {
                const preferredId = workspaceBrand?.id && brandList.find((b) => b.id === workspaceBrand.id)
                    ? workspaceBrand.id
                    : brandList[0].id;
                setSelectedBrandId(preferredId);
            }
            setLoadingBrands(false);
        }
        loadBrands();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supabase]);

    // ---- When brand changes, load brand-specific data ----
    useEffect(() => {
        if (!selectedBrandId) return;

        const brand = brands.find((b) => b.id === selectedBrandId);
        if (brand) {
            setChatbotSlug(brand.chatbot_slug ?? slugify(brand.name));
            setWelcomeMessage(
                brand.chatbot_welcome_message ??
                `Hi! I can answer questions about ${brand.name}. How can I help you?`
            );
        }

        void loadKnowledgeBase(selectedBrandId).catch((err) => {
            const message = err instanceof Error ? err.message : 'Failed to load knowledge base';
            toast.error('Failed to load knowledge base', { description: message });
        });
        void loadSessions(selectedBrandId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBrandId, brands]);

    // ---- Knowledge base loader ----
    const loadKnowledgeBase = useCallback(
        async (brandId: string) => {
            // Load PDF evidence assets
            const { data: pdfs, error: pdfError } = await supabase
                .from('evidence_assets')
                .select('id, brand_id, type, title, file_path, created_at')
                .eq('brand_id', brandId)
                .eq('type', 'pdf')
                .order('created_at', { ascending: false });

            // Compatibility mode: older databases may not have evidence_assets yet.
            if (pdfError && isMissingRelationError(pdfError, 'evidence_assets')) {
                type LegacyChunkRow = {
                    source_file: string | null;
                    created_at: string;
                    metadata: Record<string, unknown> | null;
                };

                const { data: legacyChunks, error: legacyError } = await supabase
                    .from('brand_knowledge_chunks')
                    .select('source_file, created_at, metadata')
                    .eq('brand_id', brandId)
                    .order('created_at', { ascending: false });

                // brand_knowledge_chunks table also missing – fresh DB, nothing to load
                if (legacyError && isMissingRelationError(legacyError, 'brand_knowledge_chunks')) {
                    setPdfAssets([]);
                    setChunkCounts({});
                    setLegacyPdfMetaById({});
                    setTotalChunks(0);
                    return;
                }

                if (legacyError) {
                    throw legacyError;
                }

                const counts: Record<string, number> = {};
                const itemsById = new Map<string, EvidenceAsset>();
                const legacyMeta: Record<string, LegacyPdfSourceMeta> = {};

                for (const row of (legacyChunks ?? []) as LegacyChunkRow[]) {
                    const sourceFile = (row.source_file || '').trim();
                    if (!sourceFile) continue;

                    const id = `source:${sourceFile}`;
                    counts[id] = (counts[id] ?? 0) + 1;

                    if (!itemsById.has(id)) {
                        itemsById.set(id, {
                            id,
                            brand_id: brandId,
                            type: 'pdf',
                            title: sourceFile,
                            file_path: null,
                            created_at: row.created_at,
                        });
                    }

                    const maybePath = typeof row.metadata?.storage_path === 'string'
                        ? row.metadata.storage_path
                        : null;
                    if (maybePath && !legacyMeta[id]) {
                        legacyMeta[id] = {
                            sourceFile,
                            filePath: maybePath,
                        };
                    }
                }

                const pdfList = Array.from(itemsById.values()).sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );

                setPdfAssets(pdfList);
                setChunkCounts(counts);
                setLegacyPdfMetaById(legacyMeta);
                setTotalChunks(Object.values(counts).reduce((sum, value) => sum + value, 0));
                return;
            }

            if (pdfError) {
                throw pdfError;
            }

            const pdfList = (pdfs ?? []) as EvidenceAsset[];
            setPdfAssets(pdfList);
            setLegacyPdfMetaById({});

            // Get chunk counts per evidence asset
            const counts: Record<string, number> = {};
            // Only query brand_knowledge_chunks if the table exists
            const { count: probeCount, error: probeError } = await supabase
                .from('brand_knowledge_chunks')
                .select('id', { count: 'exact', head: true })
                .eq('brand_id', brandId);

            if (probeError && isMissingRelationError(probeError, 'brand_knowledge_chunks')) {
                // Table doesn't exist yet on this database
                setChunkCounts({});
                setTotalChunks(0);
                return;
            }

            for (const pdf of pdfList) {
                const { count } = await supabase
                    .from('brand_knowledge_chunks')
                    .select('id', { count: 'exact', head: true })
                    .eq('brand_id', brandId)
                    .filter('metadata->>evidence_asset_id', 'eq', pdf.id);
                counts[pdf.id] = count ?? 0;
            }
            setChunkCounts(counts);

            setTotalChunks(probeCount ?? 0);
        },
        [supabase]
    );

    // ---- Sessions loader ----
    const loadSessions = useCallback(
        async (brandId: string) => {
            const { data, error } = await supabase
                .from('chatbot_sessions')
                .select('id, brand_id, session_token, messages, created_at')
                .eq('brand_id', brandId)
                .order('created_at', { ascending: false })
                .limit(10);

            // Gracefully handle missing chatbot_sessions table on fresh databases
            if (error && isMissingRelationError(error, 'chatbot_sessions')) {
                setSessions([]);
                return;
            }

            setSessions((data ?? []) as ChatSession[]);
        },
        [supabase]
    );

    // ---- Save settings ----
    const saveSettings = async () => {
        if (!selectedBrandId) return;

        if (!chatbotMigrated) {
            toast.error('Database migration required', {
                description: 'Run supabase/chatbot.sql in the Supabase SQL Editor before saving chatbot settings.',
            });
            return;
        }

        if (!validateSlug(chatbotSlug)) {
            toast.error('Invalid slug', {
                description: 'Slug must be at least 3 characters, lowercase letters, numbers, and hyphens only.',
            });
            return;
        }

        setSavingSettings(true);
        try {
            // Check if slug is already taken by another brand
            const { data: existing } = await supabase
                .from('brands')
                .select('id')
                .eq('chatbot_slug', chatbotSlug)
                .neq('id', selectedBrandId)
                .maybeSingle();

            if (existing) {
                toast.error('Slug already taken', {
                    description: `The chatbot URL "${chatbotSlug}" is already in use by another brand. Please choose a different slug.`,
                });
                setSavingSettings(false);
                return;
            }

            const { error, count } = await supabase
                .from('brands')
                .update({
                    chatbot_enabled: true,
                    chatbot_slug: chatbotSlug,
                    chatbot_welcome_message: welcomeMessage,
                })
                .eq('id', selectedBrandId)
                .select('id', { count: 'exact', head: true });

            if (error) {
                // Friendly message for unique constraint violations
                if (error.code === '23505' || error.message?.includes('unique')) {
                    throw new Error(`The slug "${chatbotSlug}" is already taken. Please choose a different one.`);
                }
                // Friendly message for missing columns (migration not run)
                if (error.code === '42703' || error.message?.includes('does not exist')) {
                    throw new Error('Chatbot columns are missing from the database. Please run the chatbot migration (supabase/chatbot.sql) in the Supabase SQL Editor.');
                }
                throw error;
            }

            // If no rows were updated, RLS may have blocked the update (e.g. different owner)
            if (count === 0) {
                throw new Error(
                    'No brand was updated. This can happen if your account does not own this brand. ' +
                    'Make sure you are logged in with the same account that created the brand.'
                );
            }

            // Update local brand cache
            setBrands((prev) =>
                prev.map((b) =>
                    b.id === selectedBrandId
                        ? {
                            ...b,
                            chatbot_enabled: true,
                            chatbot_slug: chatbotSlug,
                            chatbot_welcome_message: welcomeMessage,
                        }
                        : b
                )
            );

            toast.success('Chatbot settings saved');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save';
            toast.error('Save failed', { description: message });
        } finally {
            setSavingSettings(false);
        }
    };

    // ---- Process PDF ----
    const processPdf = async (
        input: { assetId?: string; filePath?: string; sourceFile?: string; itemKey?: string },
        options?: { silent?: boolean; skipReload?: boolean }
    ): Promise<boolean> => {
        const silent = options?.silent ?? false;
        const skipReload = options?.skipReload ?? false;
        const processingKey = input.itemKey || input.assetId || input.sourceFile || null;
        setProcessingAssetId(processingKey);
        try {
            const response = await fetch('/api/chatbot/process-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brand_id: selectedBrandId,
                    ...(input.assetId ? { evidence_asset_id: input.assetId } : {}),
                    ...(input.filePath ? { file_path: input.filePath } : {}),
                    ...(input.sourceFile ? { source_file: input.sourceFile } : {}),
                }),
            });

            if (!response.ok) {
                throw new Error(await readApiError(response, 'Processing failed'));
            }

            const data = (await response.json()) as {
                chunks_created: number;
                source_mode?: 'stored_pdf' | 'content_source';
            };
            if (!silent) {
                toast.success('PDF processed', {
                    description:
                        data.source_mode === 'content_source'
                            ? `${data.chunks_created} knowledge chunks created from saved Studio text`
                            : `${data.chunks_created} knowledge chunks created`,
                });
            }

            if (!skipReload) {
                await loadKnowledgeBase(selectedBrandId);
            }
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Processing failed';
            if (!silent) {
                toast.error('PDF processing failed', { description: message });
            }
            return false;
        } finally {
            setProcessingAssetId(null);
        }
    };

    function validatePdfFile(file: File): string | null {
        const isPdfMime = file.type === 'application/pdf';
        const isPdfByName = /\.pdf$/i.test(file.name);
        if (!isPdfMime && !isPdfByName) {
            return 'Only PDF files are supported';
        }
        if (file.size > 1024 * 1024 * 1024) {
            return 'PDF must be 1GB or smaller';
        }
        return null;
    }

    async function uploadSinglePdf(file: File, options?: { silent?: boolean }): Promise<boolean> {
        const silent = options?.silent ?? false;
        const validationError = validatePdfFile(file);
        if (validationError) {
            if (!silent) {
                toast.error(validationError);
            }
            return false;
        }

        try {
            const uploadUrlResponse = await fetch('/api/chatbot/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    fileName: file.name,
                    fileSize: file.size,
                    contentType: file.type || 'application/pdf',
                }),
            });

            if (!uploadUrlResponse.ok) {
                throw new Error(await readApiError(uploadUrlResponse, 'Failed to prepare PDF upload'));
            }

            const uploadTarget = (await uploadUrlResponse.json()) as {
                bucket: string;
                storagePath: string;
                token: string;
            };

            const storageUpload = await supabase.storage
                .from(uploadTarget.bucket)
                .uploadToSignedUrl(uploadTarget.storagePath, uploadTarget.token, file, {
                    contentType: file.type || 'application/pdf',
                });

            if (storageUpload.error) {
                throw new Error(storageUpload.error.message || 'Failed to upload PDF to storage');
            }

            const registerResponse = await fetch('/api/chatbot/register-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId: selectedBrandId,
                    bucket: 'chat',
                    title: file.name.replace(/\.pdf$/i, ''),
                    fileName: file.name,
                    storagePath: uploadTarget.storagePath,
                }),
            });

            if (!registerResponse.ok) {
                throw new Error(await readApiError(registerResponse, 'Failed to register uploaded PDF'));
            }

            const uploadData = (await registerResponse.json()) as {
                evidence?: { id?: string | null; file_path?: string | null; title?: string | null };
            };
            const evidenceId = typeof uploadData.evidence?.id === 'string' ? uploadData.evidence.id : null;
            const uploadedFilePath = typeof uploadData.evidence?.file_path === 'string'
                ? uploadData.evidence.file_path
                : null;
            const uploadedTitle = typeof uploadData.evidence?.title === 'string'
                ? uploadData.evidence.title
                : file.name.replace(/\.pdf$/i, '');

            if (!evidenceId && !uploadedFilePath) {
                throw new Error('Upload succeeded but file metadata was not returned');
            }

            if (!silent) {
                toast.success('PDF uploaded', { description: 'Indexing document for chatbot answers...' });
            }

            const indexed = await processPdf(
                evidenceId
                    ? { assetId: evidenceId, itemKey: evidenceId }
                    : {
                        filePath: uploadedFilePath ?? undefined,
                        sourceFile: uploadedTitle,
                        itemKey: `source:${uploadedTitle}`,
                    },
                { silent, skipReload: true }
            );
            if (!indexed) {
                throw new Error('PDF uploaded but indexing failed');
            }

            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            if (!silent) {
                toast.error('PDF upload failed', { description: message });
            }
            return false;
        }
    }

    // ---- Upload PDFs directly into chatbot knowledge base ----
    const uploadPdfs = async (files: File[]) => {
        if (!selectedBrandId) {
            toast.error('Select a brand first');
            return;
        }

        if (files.length === 0) {
            return;
        }

        const isBatch = files.length > 1;
        const failures: string[] = [];
        let successCount = 0;
        setUploadingPdf(true);
        setUploadProgress({ done: 0, total: files.length });
        try {
            for (const file of files) {
                const uploaded = await uploadSinglePdf(file, { silent: isBatch });
                if (uploaded) {
                    successCount += 1;
                } else if (isBatch) {
                    failures.push(file.name);
                }
                setUploadProgress((prev) =>
                    prev
                        ? {
                            ...prev,
                            done: Math.min(prev.done + 1, prev.total),
                        }
                        : prev
                );
            }

            await loadKnowledgeBase(selectedBrandId);

            if (isBatch && successCount > 0) {
                toast.success(
                    `${successCount} PDF${successCount !== 1 ? 's' : ''} uploaded and indexed`
                );
            }

            if (isBatch && failures.length > 0) {
                toast.error(
                    `${failures.length} PDF${failures.length !== 1 ? 's' : ''} failed`,
                    {
                        description: failures.slice(0, 3).join(', '),
                    }
                );
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            toast.error('PDF upload failed', { description: message });
        } finally {
            setUploadingPdf(false);
            setUploadProgress(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // ---- Delete knowledge ----
    const deleteKnowledge = async (assetId: string) => {
        if (!confirm('Remove all knowledge chunks from this PDF?')) return;

        setDeletingAssetId(assetId);
        try {
            const isLegacySource = assetId.startsWith('source:');
            const legacyMeta = legacyPdfMetaById[assetId];
            const response = await fetch('/api/chatbot/delete-knowledge', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brand_id: selectedBrandId,
                    ...(isLegacySource
                        ? { source_file: legacyMeta?.sourceFile || assetId.replace(/^source:/, '') }
                        : { evidence_asset_id: assetId }),
                }),
            });

            if (!response.ok) {
                throw new Error(await readApiError(response, 'Delete failed'));
            }

            toast.success('Knowledge chunks removed');
            await loadKnowledgeBase(selectedBrandId);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed';
            toast.error('Delete failed', { description: message });
        } finally {
            setDeletingAssetId(null);
        }
    };

    // ---- Copy link ----
    const copyLink = () => {
        const activeUrl = hasPublicChatbot ? chatbotPublicUrl : chatbotPreviewUrl;
        if (!activeUrl) {
            toast.error('No chatbot link available', {
                description: 'Save settings to activate a public chatbot link, or use localhost for preview testing.',
            });
            return;
        }
        navigator.clipboard.writeText(activeUrl);
        toast.success(hasPublicChatbot ? 'Link copied!' : 'Preview link copied!');
    };

    const openChatbot = () => {
        const activeUrl = hasPublicChatbot ? chatbotPublicUrl : chatbotPreviewUrl;
        if (!activeUrl) {
            toast.error('No chatbot link available', {
                description: 'Save settings to activate a public chatbot link, or use localhost for preview testing.',
            });
            return;
        }
        window.open(activeUrl, '_blank', 'noopener,noreferrer');
    };

    // ---- Processed PDF count ----
    const processedPdfCount = pdfAssets.filter((p) => (chunkCounts[p.id] ?? 0) > 0).length;

    if (loadingBrands) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (brands.length === 0) {
        return (
            <div className="rounded-2xl border bg-card p-10 text-center">
                <MessageSquare className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold">No Brands Found</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    Create a brand first to set up your AI chatbot.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Migration Banner */}
            {!chatbotMigrated && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-50/10 p-5">
                    <h3 className="text-sm font-semibold text-amber-600">Database Migration Required</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Chatbot columns are missing from the database. Run{' '}
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">supabase/chatbot.sql</code>{' '}
                        in the Supabase SQL Editor, then refresh this page.
                    </p>
                </div>
            )}

            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">AI Chatbot</h1>
                <p className="text-sm text-muted-foreground">
                    Set up a public AI chatbot that answers product questions from your uploaded PDFs.
                </p>
            </div>

            {/* Brand Selector */}
            <div>
                <Label className="text-sm font-medium">Select Brand</Label>
                <select
                    value={selectedBrandId}
                    onChange={(e) => setSelectedBrandId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                    {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Section A: Settings */}
            <section className="rounded-2xl border bg-card p-6 space-y-6">
                <h2 className="text-lg font-semibold">Chatbot Settings</h2>

                <div className="space-y-2">
                    <Label className="text-sm">Chatbot URL Slug</Label>
                    <Input
                        value={chatbotSlug}
                        onChange={(e) => setChatbotSlug(slugify(e.target.value))}
                        placeholder="your-brand-name"
                        className="font-mono text-sm"
                    />
                    {chatbotSlug && (
                        <p className="text-xs text-muted-foreground">
                            {hasPublicChatbot ? 'Live URL:' : 'Preview:'}{' '}
                            <a
                                href={hasPublicChatbot ? chatbotPublicUrl : chatbotPreviewUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-primary underline hover:opacity-80"
                            >
                                {hasPublicChatbot
                                    ? chatbotPublicUrl
                                    : chatbotPreviewUrl || 'Save settings to activate the public chatbot link'}
                            </a>
                        </p>
                    )}
                    {!hasPublicChatbot && (
                        <p className="text-xs text-amber-600">
                            Save settings to activate the public chatbot link. On localhost you can still use the preview link for testing.
                        </p>
                    )}
                    {chatbotSlug && !validateSlug(chatbotSlug) && (
                        <p className="text-xs text-destructive">
                            Slug must be at least 3 characters, lowercase letters, numbers, and hyphens only.
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label className="text-sm">Welcome Message</Label>
                    <Textarea
                        value={welcomeMessage}
                        onChange={(e) => setWelcomeMessage(e.target.value)}
                        placeholder="Hi! I can answer questions about our products. How can I help you?"
                        rows={3}
                        className="text-sm"
                    />
                </div>

                <Button onClick={saveSettings} disabled={savingSettings} className="gap-2">
                    {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Settings
                </Button>
            </section>

            {/* Section B: Knowledge Base */}
            <section className="rounded-2xl border bg-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Knowledge Base</h2>
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                            {processedPdfCount} PDF{processedPdfCount !== 1 ? 's' : ''} processed - {totalChunks} knowledge chunk{totalChunks !== 1 ? 's' : ''} indexed
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/pdf"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                const files = Array.from(e.target.files ?? []);
                                if (files.length > 0) {
                                    void uploadPdfs(files);
                                }
                            }}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={uploadingPdf || !selectedBrandId}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {uploadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {uploadingPdf
                                ? uploadProgress
                                    ? `Uploading ${uploadProgress.done}/${uploadProgress.total}...`
                                    : 'Uploading...'
                                : 'Upload PDFs'}
                        </Button>
                    </div>
                </div>

                {pdfAssets.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center flex flex-col items-center justify-center">
                        <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-4">
                            No PDF documents found. Upload directly here or use your Brand&apos;s Evidence Locker.
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={uploadingPdf}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                                Upload PDFs
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => window.location.href = '/app/settings?tab=data'}
                            >
                                Go to Evidence Locker
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {pdfAssets.map((pdf) => {
                            const chunks = chunkCounts[pdf.id] ?? 0;
                            const isProcessed = chunks > 0;
                            const isProcessing = processingAssetId === pdf.id;
                            const isDeleting = deletingAssetId === pdf.id;
                            const isLegacySource = pdf.id.startsWith('source:');
                            const legacyMeta = legacyPdfMetaById[pdf.id];
                            const canProcess = isLegacySource ? Boolean(legacyMeta?.filePath) : true;

                            return (
                                <div
                                    key={pdf.id}
                                    className="flex items-center gap-4 rounded-xl border px-4 py-3"
                                >
                                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm font-medium">{pdf.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Uploaded {formatDate(pdf.created_at)} · {chunks} chunk{chunks !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                    {isProcessed ? (
                                        <span className="flex items-center gap-1 rounded-full bg-emerald-50/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Processed
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 rounded-full bg-amber-50/10 px-2.5 py-1 text-xs font-medium text-amber-500">
                                            <Clock className="h-3 w-3" />
                                            Not Processed
                                        </span>
                                    )}
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                processPdf(
                                                    isLegacySource
                                                        ? {
                                                            filePath: legacyMeta?.filePath ?? undefined,
                                                            sourceFile: legacyMeta?.sourceFile || pdf.title,
                                                            itemKey: pdf.id,
                                                        }
                                                        : { assetId: pdf.id, itemKey: pdf.id }
                                                )
                                            }
                                            disabled={isProcessing || isDeleting || !canProcess}
                                            className="gap-1.5 text-xs"
                                        >
                                            {isProcessing ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : null}
                                            {isProcessing ? 'Processing...' : canProcess ? 'Process' : 'Re-upload to Process'}
                                        </Button>
                                        {isProcessed && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => deleteKnowledge(pdf.id)}
                                                disabled={isProcessing || isDeleting}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                {isDeleting ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Section C: Share */}
            {chatbotSlug && (
                <section className="rounded-2xl border bg-card p-6 space-y-4">
                    <h2 className="text-lg font-semibold">
                        {hasPublicChatbot ? 'Share Your Chatbot' : 'Local Preview'}
                    </h2>

                    <div className="flex items-center gap-3">
                        <Input
                            value={hasPublicChatbot ? chatbotPublicUrl : chatbotPreviewUrl}
                            readOnly
                            className="font-mono text-sm"
                        />
                        <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5 shrink-0">
                            <Copy className="h-3.5 w-3.5" />
                            {hasPublicChatbot ? 'Copy Link' : 'Copy Preview'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={openChatbot}
                            className="gap-1.5 shrink-0"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {hasPublicChatbot ? 'Test Chatbot' : 'Test Preview'}
                        </Button>
                    </div>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <p className="text-sm text-muted-foreground">
                            {hasPublicChatbot
                                ? 'Share this link in your LinkedIn and Instagram posts so followers can learn more about your products.'
                                : 'This preview link is for localhost testing only. Save settings when you are ready to activate the public chatbot URL.'}
                        </p>
                    </div>
                </section>
            )}

            {/* Section D: Recent Conversations */}
            <section className="rounded-2xl border bg-card p-6 space-y-4">
                <h2 className="text-lg font-semibold">Recent Conversations</h2>

                {sessions.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">
                        <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            No conversations yet. Share your chatbot link to get started.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sessions.map((session) => {
                            const msgArray = Array.isArray(session.messages)
                                ? session.messages
                                : [];
                            const firstUserMsg = msgArray.find((m) => m.role === 'user');
                            return (
                                <button
                                    key={session.id}
                                    type="button"
                                    onClick={() => setViewingSession(session)}
                                    className="flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition hover:bg-muted/50"
                                >
                                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm">
                                            {firstUserMsg?.content ?? 'No messages'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(session.created_at)} - {msgArray.length} message
                                            {msgArray.length !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Conversation Dialog */}
            <Dialog
                open={viewingSession !== null}
                onOpenChange={(open) => {
                    if (!open) setViewingSession(null);
                }}
            >
                <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Conversation
                        </DialogTitle>
                    </DialogHeader>
                    {viewingSession && (
                        <div className="space-y-3 pt-2">
                            {(Array.isArray(viewingSession.messages)
                                ? viewingSession.messages
                                : []
                            ).map((msg, idx) => (
                                <div
                                    key={idx}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user'
                                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                            : 'bg-muted rounded-tl-sm'
                                            }`}
                                    >
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
