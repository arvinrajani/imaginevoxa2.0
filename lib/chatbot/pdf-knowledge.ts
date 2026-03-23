import { createAdminClient } from '../supabase/admin';
import { createPdfParser } from '@/lib/pdf-parse-config';

type AdminClient = ReturnType<typeof createAdminClient>;

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

type ContentSourceRow = {
  content?: string | null;
  content_excerpt?: string | null;
  title?: string | null;
};

type ChunkRow = {
  brand_id: string;
  source_file: string;
  source_type?: string;
  chunk_text: string;
  chunk_index?: number;
  embedding: string;
  metadata: Record<string, string>;
};

export type ChatbotKnowledgeSyncResult = {
  status: 'indexed' | 'no_text' | 'missing_content_source' | 'unsupported_schema';
  detail?: string;
  chunks_created: number;
  chunk_limit_applied: boolean;
  source_file: string;
  source_mode: 'stored_pdf' | 'content_source';
};

export type DeleteChatbotKnowledgeResult = {
  status: 'deleted' | 'unsupported_schema';
  deleted_count: number;
};

const CHUNK_TARGET_WORDS = 500;
const CHUNK_OVERLAP_WORDS = 50;
const CHUNK_MIN_WORDS = 20;
const MAX_CHUNKS_PER_FILE = 160;
const EMBEDDING_BATCH_SIZE = 20;
const INSERT_BATCH_SIZE = 50;

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

function isMissingTable(error: unknown, tableName: string): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes(tableName.toLowerCase()) &&
    (message.includes('could not find the table') ||
      (message.includes('relation') && message.includes('does not exist')))
  );
}

function isMissingColumn(error: unknown, columnName: string): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const normalizedColumn = columnName.toLowerCase();
  return (
    message.includes('column') &&
    message.includes(normalizedColumn) &&
    (message.includes('does not exist') || message.includes('could not find'))
  );
}

function fallbackSourceTitle(filePath: string, provided?: string) {
  if (provided?.trim()) return provided.trim();
  const fileName = filePath.split('/').pop() || filePath;
  return fileName.replace(/\.pdf$/i, '');
}

export function isIndexedOnlyStoragePath(filePath: string | null | undefined) {
  return typeof filePath === 'string' && filePath.startsWith('indexed-only/');
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
    if (start >= words.length || end >= words.length) break;
  }

  return chunks;
}

async function createEmbeddings(texts: string[], logPrefix: string): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  console.log(
    `${logPrefix} creating embeddings for ${texts.length} chunks, total chars: ${texts.reduce(
      (sum, text) => sum + text.length,
      0
    )}`
  );

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
    console.error(`${logPrefix} OpenAI embeddings failed: ${response.status}`, errorText.slice(0, 500));
    throw new Error(`OpenAI embeddings failed: ${response.status} ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  console.log(`${logPrefix} received ${data.data.length} embeddings`);
  return data.data.map((item) => item.embedding);
}

async function clearExistingChunks(
  admin: AdminClient,
  params: { brandId: string; evidenceAssetId?: string; sourceFile: string }
) {
  let query = admin.from('brand_knowledge_chunks').delete().eq('brand_id', params.brandId);

  if (params.evidenceAssetId) {
    query = query.filter('metadata->>evidence_asset_id', 'eq', params.evidenceAssetId);
  } else {
    query = query.eq('source_file', params.sourceFile);
  }

  const { error } = await query;

  if (error && isMissingTable(error, 'brand_knowledge_chunks')) {
    return { status: 'unsupported_schema' as const };
  }

  if (error) {
    throw new Error(error.message || 'Failed to clear existing chatbot knowledge chunks');
  }

  return { status: 'cleared' as const };
}

async function insertChunkRows(
  admin: AdminClient,
  chunkRows: ChunkRow[],
  logPrefix: string
) {
  const columnsToStrip: string[] = [];

  const stripColumns = (rows: ChunkRow[]) =>
    rows.map((row) => {
      const objectRow: Record<string, unknown> = { ...row };
      for (const column of columnsToStrip) {
        delete objectRow[column];
      }
      return objectRow;
    });

  for (let start = 0; start < chunkRows.length; start += INSERT_BATCH_SIZE) {
    const batch = chunkRows.slice(start, start + INSERT_BATCH_SIZE);
    let result = await admin.from('brand_knowledge_chunks').insert(stripColumns(batch));

    if (result.error && isMissingTable(result.error, 'brand_knowledge_chunks')) {
      return { status: 'unsupported_schema' as const };
    }

    if (result.error && isMissingColumn(result.error, 'chunk_index')) {
      if (!columnsToStrip.includes('chunk_index')) {
        columnsToStrip.push('chunk_index');
        console.log(`${logPrefix} stripping chunk_index column (not in DB)`);
      }
      result = await admin.from('brand_knowledge_chunks').insert(stripColumns(batch));
    }

    if (result.error && isMissingColumn(result.error, 'source_type')) {
      if (!columnsToStrip.includes('source_type')) {
        columnsToStrip.push('source_type');
        console.log(`${logPrefix} stripping source_type column (not in DB)`);
      }
      result = await admin.from('brand_knowledge_chunks').insert(stripColumns(batch));
    }

    if (result.error && isMissingTable(result.error, 'brand_knowledge_chunks')) {
      return { status: 'unsupported_schema' as const };
    }

    if (result.error) {
      console.error(`${logPrefix} insert error:`, result.error);
      throw new Error(result.error.message || 'Failed to insert chatbot knowledge chunks');
    }
  }

  return { status: 'inserted' as const };
}

export async function extractPdfTextFromBuffer(fileBuffer: Buffer) {
  const parser = createPdfParser({ data: fileBuffer });

  try {
    const parsed = await parser.getText();
    return {
      text: typeof parsed?.text === 'string' ? parsed.text : '',
      totalPages: typeof parsed?.total === 'number' ? parsed.total : null,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function syncPdfTextToChatbotKnowledge(
  admin: AdminClient,
  params: {
    brandId: string;
    evidenceAssetId?: string;
    sourceFile?: string;
    storagePath?: string | null;
    text: string;
    sourceMode: 'stored_pdf' | 'content_source';
    logPrefix?: string;
  }
): Promise<ChatbotKnowledgeSyncResult> {
  const logPrefix = params.logPrefix || '[chatbot-knowledge]';
  const sourceFile = fallbackSourceTitle(params.storagePath || params.sourceFile || 'document.pdf', params.sourceFile);
  const normalizedText = params.text.replace(/\s+/g, ' ').trim();

  if (!normalizedText) {
    return {
      status: 'no_text',
      detail: 'No text is available to build chatbot knowledge chunks.',
      chunks_created: 0,
      chunk_limit_applied: false,
      source_file: sourceFile,
      source_mode: params.sourceMode,
    };
  }

  const allChunks = splitTextIntoChunks(normalizedText);
  const chunks = allChunks.slice(0, MAX_CHUNKS_PER_FILE);

  if (chunks.length === 0) {
    return {
      status: 'no_text',
      detail: 'PDF text is too short to create chatbot knowledge chunks.',
      chunks_created: 0,
      chunk_limit_applied: false,
      source_file: sourceFile,
      source_mode: params.sourceMode,
    };
  }

  console.log(`${logPrefix} ${chunks.length} chunks from ${normalizedText.length} chars`);

  const cleared = await clearExistingChunks(admin, {
    brandId: params.brandId,
    evidenceAssetId: params.evidenceAssetId,
    sourceFile,
  });

  if (cleared.status === 'unsupported_schema') {
    return {
      status: 'unsupported_schema',
      detail: 'brand_knowledge_chunks table is missing.',
      chunks_created: 0,
      chunk_limit_applied: false,
      source_file: sourceFile,
      source_mode: params.sourceMode,
    };
  }

  const chunkRows: ChunkRow[] = [];

  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batchChunks = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    console.log(
      `${logPrefix} embedding batch ${Math.floor(start / EMBEDDING_BATCH_SIZE) + 1}/${Math.ceil(
        chunks.length / EMBEDDING_BATCH_SIZE
      )}`
    );
    const batchEmbeddings = await createEmbeddings(batchChunks, logPrefix);

    for (let index = 0; index < batchChunks.length; index += 1) {
      const embedding = batchEmbeddings[index];
      if (!embedding) continue;

      chunkRows.push({
        brand_id: params.brandId,
        source_file: sourceFile,
        source_type: 'pdf',
        chunk_text: batchChunks[index],
        chunk_index: start + index,
        embedding: JSON.stringify(embedding),
        metadata: {
          ...(params.evidenceAssetId ? { evidence_asset_id: params.evidenceAssetId } : {}),
          source_file: sourceFile,
          ...(params.storagePath ? { storage_path: params.storagePath } : {}),
        },
      });
    }
  }

  if (chunkRows.length === 0) {
    throw new Error('Failed to create embeddings for chatbot knowledge chunks');
  }

  console.log(`${logPrefix} inserting ${chunkRows.length} chunk rows`);

  const inserted = await insertChunkRows(admin, chunkRows, logPrefix);

  if (inserted.status === 'unsupported_schema') {
    return {
      status: 'unsupported_schema',
      detail: 'brand_knowledge_chunks table is missing.',
      chunks_created: 0,
      chunk_limit_applied: false,
      source_file: sourceFile,
      source_mode: params.sourceMode,
    };
  }

  return {
    status: 'indexed',
    chunks_created: chunkRows.length,
    chunk_limit_applied: allChunks.length > MAX_CHUNKS_PER_FILE,
    source_file: sourceFile,
    source_mode: params.sourceMode,
  };
}

export async function syncContentSourceToChatbotKnowledge(
  admin: AdminClient,
  params: {
    brandId: string;
    evidenceAssetId: string;
    sourceFile?: string;
    storagePath?: string | null;
    logPrefix?: string;
  }
): Promise<ChatbotKnowledgeSyncResult> {
  const sourceUrl = `evidence://pdf/${params.evidenceAssetId}`;
  const { data, error } = await admin
    .from('content_sources')
    .select('content, content_excerpt, title')
    .eq('brand_id', params.brandId)
    .eq('source_url', sourceUrl)
    .maybeSingle<ContentSourceRow>();

  if (error && isMissingTable(error, 'content_sources')) {
    return {
      status: 'missing_content_source',
      detail: 'Studio content_sources records are not available for this PDF.',
      chunks_created: 0,
      chunk_limit_applied: false,
      source_file: fallbackSourceTitle(
        params.storagePath || params.sourceFile || 'document.pdf',
        params.sourceFile
      ),
      source_mode: 'content_source',
    };
  }

  if (error) {
    throw new Error(error.message || 'Failed to load Studio PDF knowledge source');
  }

  const text =
    (typeof data?.content === 'string' && data.content.trim()) ||
    (typeof data?.content_excerpt === 'string' && data.content_excerpt.trim()) ||
    '';

  if (!text) {
    return {
      status: 'missing_content_source',
      detail: 'This PDF does not have stored Studio text to backfill chatbot knowledge.',
      chunks_created: 0,
      chunk_limit_applied: false,
      source_file: fallbackSourceTitle(
        params.storagePath || params.sourceFile || 'document.pdf',
        params.sourceFile || data?.title || undefined
      ),
      source_mode: 'content_source',
    };
  }

  return syncPdfTextToChatbotKnowledge(admin, {
    brandId: params.brandId,
    evidenceAssetId: params.evidenceAssetId,
    sourceFile: params.sourceFile || data?.title || undefined,
    storagePath: params.storagePath,
    text,
    sourceMode: 'content_source',
    logPrefix: params.logPrefix,
  });
}

export async function deleteChatbotKnowledgeForEvidenceIds(
  admin: AdminClient,
  params: { brandId: string; evidenceIds: string[] }
): Promise<DeleteChatbotKnowledgeResult> {
  let deletedCount = 0;

  for (const evidenceId of params.evidenceIds) {
    const { data, error } = await admin
      .from('brand_knowledge_chunks')
      .delete()
      .eq('brand_id', params.brandId)
      .filter('metadata->>evidence_asset_id', 'eq', evidenceId)
      .select('id');

    if (error && isMissingTable(error, 'brand_knowledge_chunks')) {
      return {
        status: 'unsupported_schema',
        deleted_count: deletedCount,
      };
    }

    if (error) {
      throw new Error(error.message || 'Failed to delete chatbot knowledge chunks');
    }

    deletedCount += Array.isArray(data) ? data.length : 0;
  }

  return {
    status: 'deleted',
    deleted_count: deletedCount,
  };
}
