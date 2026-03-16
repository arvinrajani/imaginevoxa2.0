import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PDFParse } from 'pdf-parse';

export const runtime = 'nodejs';
const EVIDENCE_STORAGE_BUCKET =
    process.env.STUDIO_EVIDENCE_BUCKET?.trim() || 'brand-evidence';

type EvidenceAsset = {
    id: string;
    brand_id: string;
    owner_user_id: string;
    type: string;
    title: string;
    file_path: string | null;
};

type EmbeddingResponse = {
    data: Array<{ embedding: number[] }>;
};

const CHUNK_TARGET_WORDS = 500;
const CHUNK_OVERLAP_WORDS = 50;
const CHUNK_MIN_WORDS = 20;
const MAX_CHUNKS_PER_FILE = 160;
const EMBEDDING_BATCH_SIZE = 20;

function getErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') return '';
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
}

function isMissingTable(error: unknown, tableName: string): boolean {
    const msg = getErrorMessage(error).toLowerCase();
    return (
        msg.includes(tableName.toLowerCase()) &&
        (msg.includes('could not find the table') ||
            (msg.includes('relation') && msg.includes('does not exist')))
    );
}

function isMissingColumn(error: unknown, columnName: string): boolean {
    const msg = getErrorMessage(error).toLowerCase();
    const col = columnName.toLowerCase();
    return (
        msg.includes('column') &&
        msg.includes(col) &&
        (msg.includes('does not exist') || msg.includes('could not find'))
    );
}

function fallbackSourceTitle(filePath: string, provided?: string): string {
    if (provided?.trim()) return provided.trim();
    const fileName = filePath.split('/').pop() || filePath;
    return fileName.replace(/\.pdf$/i, '');
}

function splitTextIntoChunks(text: string): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < CHUNK_MIN_WORDS) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < words.length) {
        const end = Math.min(start + CHUNK_TARGET_WORDS, words.length);
        const chunk = words.slice(start, end).join(' ');
        if (chunk.split(/\s+/).length >= CHUNK_MIN_WORDS) {
            chunks.push(chunk);
        }
        start = end - CHUNK_OVERLAP_WORDS;
        if (start >= words.length) break;
        if (end >= words.length) break;
    }

    return chunks;
}

async function createEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

    console.log(`[process-pdf] Creating embeddings for ${texts.length} chunks, total chars: ${texts.reduce((s, t) => s + t.length, 0)}`);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: texts,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[process-pdf] OpenAI embeddings failed: ${response.status}`, errorText.slice(0, 500));
        throw new Error(`OpenAI embeddings failed: ${response.status} ${errorText.slice(0, 200)}`);
    }

    const data = (await response.json()) as EmbeddingResponse;
    console.log(`[process-pdf] Got ${data.data.length} embeddings`);
    return data.data.map((item) => item.embedding);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { brand_id, evidence_asset_id, file_path, source_file } = body as {
            brand_id?: string;
            evidence_asset_id?: string;
            file_path?: string;
            source_file?: string;
        };

        const normalizedFilePath = typeof file_path === 'string' ? file_path.trim() : '';
        const normalizedSourceFile = typeof source_file === 'string' ? source_file.trim() : '';

        if (!brand_id || (!evidence_asset_id && !normalizedFilePath)) {
            return NextResponse.json(
                { error: 'brand_id and either evidence_asset_id or file_path are required' },
                { status: 400 }
            );
        }

        // Authenticate
        const supabase = await createServerSupabase();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Validate brand ownership
        const { data: brand } = await supabase
            .from('brands')
            .select('id')
            .eq('id', brand_id)
            .eq('owner_user_id', user.id)
            .maybeSingle();

        if (!brand) {
            return NextResponse.json({ error: 'Brand not found or access denied' }, { status: 403 });
        }

        const admin = createAdminClient();
        let resolvedFilePath = normalizedFilePath;
        let resolvedSourceTitle = normalizedSourceFile;

        if (evidence_asset_id) {
            const { data: evidenceAsset, error: assetError } = await admin
                .from('evidence_assets')
                .select('id, brand_id, owner_user_id, type, title, file_path')
                .eq('id', evidence_asset_id)
                .eq('brand_id', brand_id)
                .maybeSingle<EvidenceAsset>();

            if (assetError) {
                if (!isMissingTable(assetError, 'evidence_assets')) {
                    return NextResponse.json({ error: `Failed to load evidence asset: ${assetError.message}` }, { status: 500 });
                }
                if (!resolvedFilePath) {
                    return NextResponse.json(
                        { error: 'Evidence table is not available in this database. Upload the PDF again and retry.' },
                        { status: 500 }
                    );
                }
            } else if (evidenceAsset) {
                if (!evidenceAsset.file_path) {
                    return NextResponse.json({ error: 'Evidence asset has no file path' }, { status: 400 });
                }
                resolvedFilePath = evidenceAsset.file_path;
                resolvedSourceTitle = evidenceAsset.title;
            } else if (!resolvedFilePath) {
                return NextResponse.json({ error: 'Evidence asset not found' }, { status: 404 });
            }
        }

        if (!resolvedFilePath) {
            return NextResponse.json({ error: 'No file path available for PDF processing' }, { status: 400 });
        }

        // Detect storage-limit fallback: file was never actually uploaded to the bucket
        if (resolvedFilePath.startsWith('indexed-only/')) {
            return NextResponse.json(
                {
                    error:
                        'This PDF was uploaded when storage was at its limit, so the file itself was not saved — only its text was indexed. Please re-upload the PDF to enable full knowledge processing.',
                },
                { status: 400 }
            );
        }

        resolvedSourceTitle = fallbackSourceTitle(resolvedFilePath, resolvedSourceTitle);

        // Download PDF from Supabase storage
        const { data: fileData, error: downloadError } = await admin.storage
            .from(EVIDENCE_STORAGE_BUCKET)
            .download(resolvedFilePath);

        if (downloadError || !fileData) {
            const downloadMessage = String(downloadError?.message || 'Unknown error');
            const lower = downloadMessage.toLowerCase();
            if (lower.includes('bucket') && (lower.includes('not found') || lower.includes('does not exist'))) {
                return NextResponse.json(
                    {
                        error: `Storage bucket "${EVIDENCE_STORAGE_BUCKET}" is missing. Upload a PDF again to auto-create it or create the bucket in Supabase Storage.`,
                    },
                    { status: 500 }
                );
            }
            return NextResponse.json(
                { error: `Failed to download PDF: ${downloadMessage}` },
                { status: 500 }
            );
        }

        // Extract text from PDF using pdf-parse v2
        let extractedText = '';
        try {
            const buffer = Buffer.from(await fileData.arrayBuffer());
            console.log('[process-pdf] PDF buffer size:', buffer.length, 'bytes');
            const parser = new PDFParse({ data: buffer });
            const pdfData = await parser.getText();
            await parser.destroy().catch(() => {/* cleanup best-effort */});
            extractedText = typeof pdfData?.text === 'string' ? pdfData.text : '';
            console.log('[process-pdf] Extracted text length:', extractedText.length);
        } catch (parseErr) {
            console.error('[process-pdf] PDF parse error:', parseErr);
            return NextResponse.json({ error: `PDF parsing failed: ${parseErr instanceof Error ? parseErr.message : 'Unknown parse error'}` }, { status: 500 });
        }

        if (!extractedText || extractedText.trim().length === 0) {
            return NextResponse.json({ error: 'No text could be extracted from PDF' }, { status: 400 });
        }

        // Split into chunks
        const normalizedText = extractedText.replace(/\s+/g, ' ').trim();
        const chunks = splitTextIntoChunks(normalizedText).slice(0, MAX_CHUNKS_PER_FILE);
        if (chunks.length === 0) {
            return NextResponse.json(
                { error: 'PDF text too short to create knowledge chunks' },
                { status: 400 }
            );
        }

        console.log(`[process-pdf] ${chunks.length} chunks from ${normalizedText.length} chars`);

        // Delete existing chunks for this evidence asset
        let deleteQuery = admin
            .from('brand_knowledge_chunks')
            .delete()
            .eq('brand_id', brand_id);

        if (evidence_asset_id) {
            deleteQuery = deleteQuery.filter('metadata->>evidence_asset_id', 'eq', evidence_asset_id);
        } else {
            deleteQuery = deleteQuery.eq('source_file', resolvedSourceTitle);
        }

        await deleteQuery;

        // Generate embeddings and insert chunks
        type ChunkRow = {
            brand_id: string;
            source_file: string;
            source_type?: string;
            chunk_text: string;
            chunk_index?: number;
            embedding: string;
            metadata: Record<string, string>;
        };

        const chunkRows: ChunkRow[] = [];

        for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
            const batchChunks = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
            console.log(`[process-pdf] Embedding batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE)}`);
            const batchEmbeddings = await createEmbeddings(batchChunks);

            for (let j = 0; j < batchChunks.length; j++) {
                const embedding = batchEmbeddings[j];
                if (!embedding) continue;

                chunkRows.push({
                    brand_id,
                    source_file: resolvedSourceTitle,
                    source_type: 'pdf',
                    chunk_text: batchChunks[j],
                    chunk_index: i + j,
                    embedding: JSON.stringify(embedding),
                    metadata: {
                        ...(evidence_asset_id ? { evidence_asset_id } : {}),
                        source_file: resolvedSourceTitle,
                        storage_path: resolvedFilePath,
                    },
                });
            }
        }

        if (chunkRows.length === 0) {
            return NextResponse.json(
                { error: 'Failed to create embeddings for extracted PDF text' },
                { status: 500 }
            );
        }

        // Batch insert — progressively strip columns the DB may not have
        console.log(`[process-pdf] Inserting ${chunkRows.length} chunk rows`);
        const INSERT_BATCH = 50;
        let insertError: { message: string } | null = null;
        const columnsToStrip: string[] = [];

        function stripColumns(rows: ChunkRow[]): Record<string, unknown>[] {
            return rows.map((row) => {
                const obj: Record<string, unknown> = { ...row };
                for (const col of columnsToStrip) delete obj[col];
                return obj;
            });
        }

        for (let b = 0; b < chunkRows.length; b += INSERT_BATCH) {
            const batch = chunkRows.slice(b, b + INSERT_BATCH);
            let result = await admin.from('brand_knowledge_chunks').insert(stripColumns(batch));

            // If a column doesn't exist, strip it and retry (handles partial schemas)
            if (result.error && isMissingColumn(result.error, 'chunk_index')) {
                columnsToStrip.push('chunk_index');
                console.log('[process-pdf] Stripping chunk_index column (not in DB)');
                result = await admin.from('brand_knowledge_chunks').insert(stripColumns(batch));
            }
            if (result.error && isMissingColumn(result.error, 'source_type')) {
                columnsToStrip.push('source_type');
                console.log('[process-pdf] Stripping source_type column (not in DB)');
                result = await admin.from('brand_knowledge_chunks').insert(stripColumns(batch));
            }

            if (result.error) {
                console.error('[process-pdf] Insert error:', result.error);
                insertError = result.error;
                break;
            }
        }

        if (insertError) {
            return NextResponse.json(
                { error: `Failed to insert chunks: ${insertError.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            chunks_created: chunkRows.length,
            chunk_limit_applied: chunkRows.length >= MAX_CHUNKS_PER_FILE,
            source_file: resolvedSourceTitle,
        });
    } catch (err) {
        console.error('[api/chatbot/process-pdf] failed:', err);
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
