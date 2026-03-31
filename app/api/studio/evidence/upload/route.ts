import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  isMissingColumnError,
  isMissingTableOrRelationError,
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';
import {
  EVIDENCE_STORAGE_BUCKET,
  dedupeTags,
  extractPdfImagesIntoEvidence,
  insertEvidenceRow,
} from '@/lib/studio/pdf-extraction';
import {
  extractPdfTextFromBuffer,
  syncContentSourceToChatbotKnowledge,
  syncPdfTextToChatbotKnowledge,
} from '@/lib/chatbot/pdf-knowledge';
import { createPdfParser } from '@/lib/pdf-parse-config';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const MAX_PDF_CONTENT_CHARS = 120_000;

type PdfKnowledgeSync = {
  source_id: string | null;
  status: string;
  detail?: string;
  pages?: number | null;
  text_chars?: number;
  image_extraction?: {
    status: 'saved' | 'none_found' | 'extract_failed' | 'skipped';
    found_count: number;
    saved_count: number;
    failed_count: number;
    skipped_count: number;
    detail?: string;
  };
};

type ChatbotKnowledgeSync = Awaited<
  ReturnType<typeof syncPdfTextToChatbotKnowledge>
> | null;

type EvidenceRowWithSignedUrl = {
  id: string;
  brand_id: string;
  owner_user_id: string;
  type: string;
  title: string;
  description: string | null;
  bucket: string;
  tags: string[];
  file_path: string | null;
  url: string | null;
  note_text: string | null;
  created_at: string;
  signed_url: string | null;
};

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const maybeMessage = (error as { message?: unknown }).message;
  return typeof maybeMessage === 'string' ? maybeMessage.toLowerCase() : '';
}

function isBucketMissingError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes('bucket') &&
    (message.includes('not found') || message.includes('does not exist'))
  );
}

function isStorageLimitError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes('maximum allowed size') ||
    message.includes('file size limit') ||
    message.includes('quota') ||
    message.includes('storage limit') ||
    message.includes('insufficient storage') ||
    message.includes('not enough space')
  );
}

function isStoragePathConflictError(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes('already exists') || message.includes('duplicate');
}

async function ensureEvidenceBucket(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin']
) {
  const existing = await admin.storage.getBucket(EVIDENCE_STORAGE_BUCKET);
  if (!existing.error && existing.data) {
    return;
  }
  if (existing.error && !isBucketMissingError(existing.error)) {
    // Some hosted projects return opaque size-limit errors for bucket admin calls
    // even though the bucket already exists. Let the upload attempt verify that.
    if (isStorageLimitError(existing.error)) {
      return;
    }
    throw new Error(existing.error.message || 'Failed to check storage bucket');
  }

  const created = await admin.storage.createBucket(EVIDENCE_STORAGE_BUCKET, {
    public: false,
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ],
  });

  if (
    created.error &&
    !errorMessage(created.error).includes('already exists') &&
    !isStorageLimitError(created.error)
  ) {
    throw new Error(created.error.message || 'Failed to create storage bucket');
  }
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function parseTags(input: FormDataEntryValue | null): string[] {
  if (typeof input !== 'string' || !input.trim()) return [];
  const raw = input.trim();

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .slice(0, 20);
    }
  } catch {
    // Fall through to comma parsing.
  }

  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function scorePdfParagraphForKnowledge(paragraph: string) {
  let score = Math.min(paragraph.length, 900) / 120;

  if (/\d/.test(paragraph)) score += 3;
  if (/%|\$|£|€|roi|revenue|pipeline|conversion|growth|reduction|increase|decrease|customers?|users?|teams?|days?|weeks?|months?/i.test(paragraph)) {
    score += 4;
  }
  if (/product|feature|capability|benefit|problem|solution|workflow|platform|integration|security|pricing|case study|testimonial|launch|release|spec/i.test(paragraph)) {
    score += 3;
  }
  if (paragraph.length < 60) score -= 2;

  return score;
}

function buildKnowledgeDensePdfText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return text.slice(0, maxChars);
  }

  const scored = paragraphs.map((paragraph, index) => ({
    paragraph,
    index,
    score: scorePdfParagraphForKnowledge(paragraph),
  }));

  const selectedIndexes = new Set<number>();
  let usedChars = 0;

  const trySelect = (index: number) => {
    if (selectedIndexes.has(index)) return;
    const paragraph = paragraphs[index];
    const nextSize = usedChars === 0 ? paragraph.length : usedChars + 2 + paragraph.length;
    if (nextSize > maxChars) return;
    selectedIndexes.add(index);
    usedChars = nextSize;
  };

  trySelect(0);
  trySelect(paragraphs.length - 1);

  for (const item of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    trySelect(item.index);
    if (usedChars >= maxChars * 0.88) break;
  }

  if (usedChars < maxChars) {
    const step = Math.max(1, Math.floor(paragraphs.length / 8));
    for (let index = 0; index < paragraphs.length; index += step) {
      trySelect(index);
      if (usedChars >= maxChars) break;
    }
  }

  const selectedParagraphs = Array.from(selectedIndexes)
    .sort((a, b) => a - b)
    .map((index) => paragraphs[index]);

  return selectedParagraphs.join('\n\n').slice(0, maxChars);
}

function scoreExtractedVisual(row: { title?: string | null; tags?: string[] | null }) {
  const title = typeof row.title === 'string' ? row.title.toLowerCase() : '';
  const tags = Array.isArray(row.tags) ? row.tags : [];

  let score = 0;
  if (tags.includes('pdf-embedded-image') || title.includes('extracted image')) score += 420;
  if (tags.includes('pdf-page-1') || title.includes('page 1 visual')) score += 300;
  if (tags.includes('pdf-rendered-page')) score += 180;
  return score;
}

async function loadExtractedEvidenceForPdf(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin'],
  params: {
    brandId: string;
    userId: string;
    parentEvidenceId: string;
    parentTitle: string;
  }
) {
  const query = await admin
    .from('evidence_assets')
    .select('*')
    .eq('brand_id', params.brandId)
    .eq('owner_user_id', params.userId)
    .eq('type', 'image')
    .order('created_at', { ascending: false });

  if (query.error || !Array.isArray(query.data)) {
    return [] as EvidenceRowWithSignedUrl[];
  }

  const sourceTag = `pdf-source-${params.parentEvidenceId}`;
  const normalizedParentTitle = params.parentTitle.trim().toLowerCase();

  const extractedRows = query.data
    .filter((row) => {
      const tags = Array.isArray(row.tags)
        ? row.tags.filter(
            (tag: unknown): tag is string =>
              typeof tag === 'string' && tag.trim().length > 0
          )
        : [];
      const filePath =
        typeof row.file_path === 'string' && row.file_path.trim().length > 0
          ? row.file_path.trim()
          : '';
      const title =
        typeof row.title === 'string' && row.title.trim().length > 0
          ? row.title.trim().toLowerCase()
          : '';

      return (
        tags.includes(sourceTag) ||
        (filePath.includes('/pdf-extract/') &&
          normalizedParentTitle.length > 0 &&
          title.startsWith(normalizedParentTitle))
      );
    })
    .sort((left, right) => {
      const scoreDifference = scoreExtractedVisual(right) - scoreExtractedVisual(left);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const rightTime = Date.parse(typeof right.created_at === 'string' ? right.created_at : '') || 0;
      const leftTime = Date.parse(typeof left.created_at === 'string' ? left.created_at : '') || 0;
      return rightTime - leftTime;
    });

  return Promise.all(
    extractedRows.map(async (row) => {
      if (!row.file_path) {
        return {
          ...row,
          signed_url: null,
        } as EvidenceRowWithSignedUrl;
      }

      const signed = await admin.storage
        .from(EVIDENCE_STORAGE_BUCKET)
        .createSignedUrl(row.file_path, 60 * 60);

      return {
        ...row,
        signed_url: signed.error ? null : signed.data?.signedUrl || null,
      } as EvidenceRowWithSignedUrl;
    })
  );
}

async function ingestPdfKnowledgeSource(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin'],
  params: {
    brandId: string;
    userId: string;
    evidenceId: string | null;
    title: string;
    storagePath: string | null;
    fileName: string;
    fileBuffer: Buffer;
  }
) {
  if (!params.evidenceId) {
    return {
      source_id: null,
      status: 'skipped',
      detail: 'Evidence row unavailable on this schema; PDF knowledge indexing skipped.',
    };
  }

  let rawText = '';
  let totalPages: number | null = null;

  try {
    const parser = await createPdfParser({ data: params.fileBuffer });
    const parsed = await parser.getText();
    await parser.destroy();
    rawText = typeof parsed.text === 'string' ? parsed.text : '';
    totalPages = typeof parsed.total === 'number' ? parsed.total : null;
  } catch (error) {
    return {
      source_id: null,
      status: 'parse_failed',
      detail: error instanceof Error ? error.message : 'Could not parse PDF text.',
    };
  }

  const normalized = normalizePdfText(rawText);
  if (normalized.length < 80) {
    return {
      source_id: null,
      status: 'no_text',
      detail: 'PDF had little or no extractable text.',
      pages: totalPages,
    };
  }

  const clipped = buildKnowledgeDensePdfText(normalized, MAX_PDF_CONTENT_CHARS);
  const excerpt = clipped.slice(0, 2500);
  const contentHash = crypto.createHash('sha256').update(clipped).digest('hex');
  const sourceUrl = `evidence://pdf/${params.evidenceId}`;

  const fullPayload = {
    brand_id: params.brandId,
    source_type: 'document',
    source_url: sourceUrl,
    title: params.title || params.fileName,
    content: clipped,
    content_excerpt: excerpt,
    content_hash: contentHash,
    metadata: {
      evidence_asset_id: params.evidenceId,
      evidence_storage_bucket: EVIDENCE_STORAGE_BUCKET,
      evidence_file_path: params.storagePath,
      source_file_name: params.fileName,
      pages: totalPages,
      ingest_version: 'studio_pdf_v2',
      source_text_chars: normalized.length,
      indexed_text_chars: clipped.length,
    },
    created_by: params.userId,
  };

  const payloads: Array<Record<string, unknown>> = [
    fullPayload,
    {
      brand_id: params.brandId,
      source_type: 'document',
      source_url: sourceUrl,
      title: params.title || params.fileName,
      content: clipped,
      content_excerpt: excerpt,
      content_hash: contentHash,
      created_by: params.userId,
    },
    {
      brand_id: params.brandId,
      source_url: sourceUrl,
      title: params.title || params.fileName,
      content: clipped,
      content_excerpt: excerpt,
      content_hash: contentHash,
    },
  ];

  let lastError: { message?: string } | null = null;

  for (const payload of payloads) {
    const attempt = await admin
      .from('content_sources')
      .insert(payload)
      .select('id')
      .single();

    if (!attempt.error && attempt.data?.id) {
      return {
        source_id: attempt.data.id as string,
        status: 'ingested',
        pages: totalPages,
        text_chars: clipped.length,
      };
    }

    if (isMissingTableOrRelationError(attempt.error, 'content_sources')) {
      return {
        source_id: null,
        status: 'unsupported_schema',
        detail: 'content_sources table is missing.',
      };
    }

    lastError = {
      message: typeof attempt.error?.message === 'string' ? attempt.error.message : 'Unknown insert error',
    };

    if (!isMissingColumnError(attempt.error)) {
      break;
    }
  }

  return {
    source_id: null,
    status: 'ingest_failed',
    detail: lastError?.message || 'Failed to index PDF knowledge',
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const brandId = String(formData.get('brandId') || '').trim();
    const title = String(formData.get('title') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const bucket = String(formData.get('bucket') || 'general').trim() || 'general';
    const tags = parseTags(formData.get('tags'));
    const file = formData.get('file');

    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const mime = String(file.type || '').toLowerCase();
    const lowerFileName = String(file.name || '').toLowerCase();
    const isPdf = mime === 'application/pdf' || lowerFileName.endsWith('.pdf');
    const isImage = mime.startsWith('image/');

    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: 'Only PDF or image files are supported' },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds 1GB limit' },
        { status: 400 }
      );
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, brandId, userId);
    await ensureEvidenceBucket(admin);

    const cleanName = sanitizeFileName(file.name || `evidence-${Date.now()}`);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    let storagePath = `${userId}/${brandId}/${Date.now()}-${cleanName}`;
    let persistedStoragePath: string | null = storagePath;
    let storedInBucket = true;
    let storageWarning: string | null = null;

    const uploadToStorage = async (path: string) =>
      admin.storage
        .from(EVIDENCE_STORAGE_BUCKET)
        .upload(path, fileBuffer, {
          contentType: mime || undefined,
          upsert: false,
        });

    let upload = await uploadToStorage(storagePath);

    // Self-heal deployments where the storage bucket was not created yet.
    if (upload.error && isBucketMissingError(upload.error)) {
      await ensureEvidenceBucket(admin);
      upload = await uploadToStorage(storagePath);
    }

    // If a path collision happens (same timestamp/name), retry once with a nonce.
    if (upload.error && isStoragePathConflictError(upload.error)) {
      storagePath = `${userId}/${brandId}/${Date.now()}-${crypto.randomUUID()}-${cleanName}`;
      upload = await uploadToStorage(storagePath);
      if (!upload.error) {
        persistedStoragePath = storagePath;
      }
    }

    if (upload.error) {
      const uploadMessage = upload.error.message || 'Failed to upload evidence file';
      if (isPdf && isStorageLimitError(upload.error)) {
        storedInBucket = false;
        // Keep a synthetic path so the PDF row can exist on schemas that require file_path for type='pdf'.
        persistedStoragePath = `indexed-only/${userId}/${brandId}/${Date.now()}-${cleanName}`;
        storageWarning =
          'PDF text was indexed, but the original file could not be stored in Supabase Storage because of current storage limits.';
      } else {
        throw new Error(uploadMessage);
      }
    }

    const titleValue = title || cleanName;
    const insertResult = await insertEvidenceRow(admin, {
      brandId,
      userId,
      isPdf,
      title: titleValue,
      description,
      bucket,
      tags: storedInBucket ? tags : dedupeTags([...tags, 'indexed-only', 'storage-limit-fallback']),
      storagePath: persistedStoragePath,
    });
    const inserted = insertResult.inserted;

    let knowledgeSync: PdfKnowledgeSync | null = null;
    let chatbotSync: ChatbotKnowledgeSync = null;
    let extractedEvidence: EvidenceRowWithSignedUrl[] = [];

    if (isPdf) {
      knowledgeSync = await ingestPdfKnowledgeSource(admin, {
        brandId,
        userId,
        evidenceId: inserted && typeof inserted.id === 'string' ? inserted.id : null,
        title: titleValue,
        storagePath: persistedStoragePath,
        fileName: cleanName,
        fileBuffer,
      });

      try {
        if (knowledgeSync.status === 'ingested' && inserted && typeof inserted.id === 'string') {
          chatbotSync = await syncContentSourceToChatbotKnowledge(admin, {
            brandId,
            evidenceAssetId: inserted.id,
            sourceFile: titleValue,
            storagePath: persistedStoragePath,
            logPrefix: '[studio-evidence-upload/chatbot]',
          });
        } else {
          const parsedPdf = await extractPdfTextFromBuffer(fileBuffer);
          chatbotSync = await syncPdfTextToChatbotKnowledge(admin, {
            brandId,
            evidenceAssetId:
              inserted && typeof inserted.id === 'string' ? inserted.id : undefined,
            sourceFile: titleValue,
            storagePath: persistedStoragePath,
            text: parsedPdf.text,
            sourceMode: 'stored_pdf',
            logPrefix: '[studio-evidence-upload/chatbot]',
          });
        }
      } catch (chatbotError) {
        chatbotSync = {
          status: 'no_text',
          detail:
            chatbotError instanceof Error
              ? chatbotError.message
              : 'Chatbot indexing could not parse the uploaded PDF.',
          chunks_created: 0,
          chunk_limit_applied: false,
          source_file: titleValue,
          source_mode: 'stored_pdf',
        };
      }

      if (inserted && typeof inserted.id === 'string') {
        try {
          const imageExtraction = await extractPdfImagesIntoEvidence(admin, {
            brandId,
            userId,
            parentEvidenceId: inserted.id,
            parentTitle: titleValue,
            fileBuffer,
            bucket,
            tags,
          });
          knowledgeSync = {
            ...knowledgeSync,
            image_extraction: imageExtraction,
          };
          if (imageExtraction.saved_count > 0) {
            extractedEvidence = await loadExtractedEvidenceForPdf(admin, {
              brandId,
              userId,
              parentEvidenceId: inserted.id,
              parentTitle: titleValue,
            });
          }
        } catch (extractionError) {
          console.error('[studio-evidence-upload] Image extraction crashed:', extractionError);
          knowledgeSync = {
            ...knowledgeSync,
            image_extraction: {
              status: 'extract_failed',
              found_count: 0,
              saved_count: 0,
              failed_count: 0,
              skipped_count: 0,
              detail: extractionError instanceof Error ? extractionError.message : 'Image extraction failed unexpectedly.',
            },
          };
        }
      } else {
        knowledgeSync = {
          ...knowledgeSync,
          image_extraction: {
            status: 'skipped',
            found_count: 0,
            saved_count: 0,
            failed_count: 0,
            skipped_count: 0,
            detail:
              'Image extraction skipped because the evidence row is unavailable on this schema.',
          },
        };
      }
    }

    const signed = storedInBucket && persistedStoragePath
      ? await admin.storage
          .from(EVIDENCE_STORAGE_BUCKET)
          .createSignedUrl(persistedStoragePath, 60 * 60)
      : { data: { signedUrl: null } };

    return NextResponse.json({
      evidence: {
        ...(inserted ?? {
          id: null,
          brand_id: brandId,
          type: isPdf ? 'pdf' : 'image',
          title: titleValue,
          file_path: persistedStoragePath,
          created_at: new Date().toISOString(),
        }),
        signed_url: storedInBucket && persistedStoragePath ? signed.data?.signedUrl || null : null,
      },
      knowledge_sync: knowledgeSync,
      extracted_evidence: extractedEvidence,
      chatbot_sync: chatbotSync,
      storage_warning: storageWarning,
      compatibility_mode: insertResult.usedFallback ? 'legacy_no_evidence_assets_table' : null,
    });
  } catch (error) {
    console.error('[api/studio/evidence/upload] failed:', error);
    return studioErrorResponse(error);
  }
}
