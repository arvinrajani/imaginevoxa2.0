import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';
import {
  isMissingColumnError,
  isMissingTableOrRelationError,
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';

export const runtime = 'nodejs';
const EVIDENCE_STORAGE_BUCKET =
  process.env.STUDIO_EVIDENCE_BUCKET?.trim() || 'brand-evidence';
const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
const MAX_PDF_CONTENT_CHARS = 40_000;
const MAX_PDF_IMAGE_EXTRACTION_BYTES = 40 * 1024 * 1024;
const MAX_EXTRACTED_IMAGES_PER_PDF = 12;
const MIN_EXTRACTED_IMAGE_SIZE_PX = 96;
const MAX_EXTRACTED_IMAGE_BYTES = 12 * 1024 * 1024;

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

type ParsedPdfImage = {
  pageNumber: number;
  imageIndex: number;
  width: number;
  height: number;
  data: Buffer;
  hash: string;
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

async function ensureEvidenceBucket(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin']
) {
  const existing = await admin.storage.getBucket(EVIDENCE_STORAGE_BUCKET);
  if (!existing.error && existing.data) {
    const updated = await admin.storage.updateBucket(EVIDENCE_STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: '300MB',
      allowedMimeTypes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/svg+xml',
      ],
    });

    if (updated.error && !errorMessage(updated.error).includes('already exists')) {
      throw new Error(updated.error.message || 'Failed to update storage bucket');
    }
    return;
  }
  if (existing.error && !isBucketMissingError(existing.error)) {
    throw new Error(existing.error.message || 'Failed to check storage bucket');
  }

  const created = await admin.storage.createBucket(EVIDENCE_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: '300MB',
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ],
  });

  if (created.error && !errorMessage(created.error).includes('already exists')) {
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

function dedupeTags(tags: string[]) {
  const normalized = tags.map((tag) => tag.trim()).filter(Boolean);
  return Array.from(new Set(normalized));
}

async function insertEvidenceRow(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin'],
  params: {
    brandId: string;
    userId: string;
    isPdf: boolean;
    title: string;
    description: string;
    bucket: string;
    tags: string[];
    storagePath: string;
  }
) {
  const fullPayload = {
    brand_id: params.brandId,
    owner_user_id: params.userId,
    type: params.isPdf ? 'pdf' : 'image',
    title: params.title,
    description: params.description || null,
    bucket: params.bucket,
    tags: params.tags,
    file_path: params.storagePath,
  };

  let attempt = await admin
    .from('evidence_assets')
    .insert(fullPayload)
    .select('*')
    .single();

  if (attempt.error && isMissingTableOrRelationError(attempt.error, 'evidence_assets')) {
    return { inserted: null, usedFallback: true };
  }

  if (attempt.error && isMissingColumnError(attempt.error, ['bucket', 'tags', 'description'])) {
    const withoutOptionalColumns = {
      brand_id: params.brandId,
      owner_user_id: params.userId,
      type: params.isPdf ? 'pdf' : 'image',
      title: params.title,
      file_path: params.storagePath,
    };

    attempt = await admin
      .from('evidence_assets')
      .insert(withoutOptionalColumns)
      .select('*')
      .single();
  }

  if (attempt.error && isMissingColumnError(attempt.error, ['owner_user_id'])) {
    const legacyPayload = {
      brand_id: params.brandId,
      type: params.isPdf ? 'pdf' : 'image',
      title: params.title,
      file_path: params.storagePath,
    };

    attempt = await admin
      .from('evidence_assets')
      .insert(legacyPayload)
      .select('*')
      .single();
  }

  if (attempt.error) {
    throw new Error(attempt.error.message || 'Failed to create evidence row');
  }

  return { inserted: attempt.data, usedFallback: false };
}

async function ingestPdfKnowledgeSource(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin'],
  params: {
    brandId: string;
    userId: string;
    evidenceId: string | null;
    title: string;
    storagePath: string;
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
    const parser = new PDFParse({ data: params.fileBuffer });
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

  const clipped = normalized.slice(0, MAX_PDF_CONTENT_CHARS);
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
      ingest_version: 'studio_pdf_v1',
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

async function parsePdfEmbeddedImages(fileBuffer: Buffer) {
  if (fileBuffer.byteLength > MAX_PDF_IMAGE_EXTRACTION_BYTES) {
    return {
      status: 'skipped' as const,
      detail: `PDF is larger than ${Math.round(
        MAX_PDF_IMAGE_EXTRACTION_BYTES / (1024 * 1024)
      )}MB, so image extraction was skipped for performance.`,
      images: [] as ParsedPdfImage[],
      foundCount: 0,
    };
  }

  const parser = new PDFParse({ data: fileBuffer });
  try {
    const parsed = await parser.getImage({
      imageThreshold: MIN_EXTRACTED_IMAGE_SIZE_PX,
      imageDataUrl: false,
      imageBuffer: true,
    });

    const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    const hashes = new Set<string>();
    const images: ParsedPdfImage[] = [];
    let foundCount = 0;

    for (const page of pages) {
      const pageNumber = typeof page.pageNumber === 'number' ? page.pageNumber : 0;
      const pageImages = Array.isArray(page.images) ? page.images : [];

      for (let i = 0; i < pageImages.length; i += 1) {
        const image = pageImages[i];
        const imageData = image?.data;
        if (!(imageData instanceof Uint8Array) || imageData.byteLength === 0) {
          continue;
        }

        foundCount += 1;
        const buffer = Buffer.from(imageData);
        if (buffer.byteLength > MAX_EXTRACTED_IMAGE_BYTES) {
          continue;
        }

        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        if (hashes.has(hash)) {
          continue;
        }
        hashes.add(hash);

        const width = typeof image.width === 'number' ? image.width : 0;
        const height = typeof image.height === 'number' ? image.height : 0;

        images.push({
          pageNumber,
          imageIndex: i + 1,
          width,
          height,
          data: buffer,
          hash,
        });

        if (images.length >= MAX_EXTRACTED_IMAGES_PER_PDF) {
          break;
        }
      }

      if (images.length >= MAX_EXTRACTED_IMAGES_PER_PDF) {
        break;
      }
    }

    return {
      status: 'ok' as const,
      detail: null,
      images,
      foundCount,
    };
  } catch (error) {
    return {
      status: 'extract_failed' as const,
      detail: error instanceof Error ? error.message : 'Could not extract images from PDF.',
      images: [] as ParsedPdfImage[],
      foundCount: 0,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractPdfImagesIntoEvidence(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin'],
  params: {
    brandId: string;
    userId: string;
    parentEvidenceId: string;
    parentTitle: string;
    fileBuffer: Buffer;
    bucket: string;
    tags: string[];
  }
) {
  const parsed = await parsePdfEmbeddedImages(params.fileBuffer);
  if (parsed.status === 'skipped') {
    return {
      status: 'skipped' as const,
      found_count: 0,
      saved_count: 0,
      failed_count: 0,
      skipped_count: 0,
      detail: parsed.detail,
    };
  }

  if (parsed.status === 'extract_failed') {
    return {
      status: 'extract_failed' as const,
      found_count: 0,
      saved_count: 0,
      failed_count: 0,
      skipped_count: 0,
      detail: parsed.detail,
    };
  }

  if (parsed.images.length === 0) {
    return {
      status: 'none_found' as const,
      found_count: parsed.foundCount,
      saved_count: 0,
      failed_count: 0,
      skipped_count: 0,
    };
  }

  let savedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const batchId = Date.now();

  for (let i = 0; i < parsed.images.length; i += 1) {
    const image = parsed.images[i];
    const imageName = `pdf-${batchId}-${i + 1}-p${image.pageNumber || 0}-${image.imageIndex}.png`;
    const storagePath = `${params.userId}/${params.brandId}/pdf-extract/${imageName}`;

    const upload = await admin.storage
      .from(EVIDENCE_STORAGE_BUCKET)
      .upload(storagePath, image.data, {
        contentType: 'image/png',
        upsert: false,
      });

    if (upload.error) {
      failedCount += 1;
      continue;
    }

    const imageTags = dedupeTags([
      ...params.tags,
      'pdf-extracted',
      image.pageNumber > 0 ? `pdf-page-${image.pageNumber}` : 'pdf-page-unknown',
    ]).slice(0, 20);

    const imageTitle = `${params.parentTitle} • Extracted image ${savedCount + 1}`;
    const sizeHint =
      image.width > 0 && image.height > 0
        ? `${image.width}x${image.height}px`
        : 'size unavailable';
    const imageDescription = `Extracted from PDF "${params.parentTitle}" (page ${image.pageNumber || '?'
      }, ${sizeHint}). Source evidence: ${params.parentEvidenceId}.`;

    const insert = await insertEvidenceRow(admin, {
      brandId: params.brandId,
      userId: params.userId,
      isPdf: false,
      title: imageTitle,
      description: imageDescription,
      bucket: params.bucket,
      tags: imageTags,
      storagePath,
    });

    if (insert.usedFallback || !insert.inserted) {
      skippedCount += 1;
      continue;
    }

    savedCount += 1;
  }

  const status =
    savedCount > 0
      ? ('saved' as const)
      : failedCount > 0 || skippedCount > 0
        ? ('extract_failed' as const)
        : ('none_found' as const);

  return {
    status,
    found_count: parsed.foundCount,
    saved_count: savedCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    detail:
      parsed.images.length >= MAX_EXTRACTED_IMAGES_PER_PDF
        ? `Saved first ${MAX_EXTRACTED_IMAGES_PER_PDF} extracted images from this PDF.`
        : status === 'extract_failed'
          ? 'Images were found in the PDF, but they could not be saved as evidence.'
          : undefined,
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
        { error: 'File size exceeds 300MB limit' },
        { status: 400 }
      );
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, brandId, userId);
    await ensureEvidenceBucket(admin);

    const cleanName = sanitizeFileName(file.name || `evidence-${Date.now()}`);
    const storagePath = `${userId}/${brandId}/${Date.now()}-${cleanName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    let upload = await admin.storage
      .from(EVIDENCE_STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mime || undefined,
        upsert: false,
      });

    // Self-heal deployments where the storage bucket was not created yet.
    if (upload.error && isBucketMissingError(upload.error)) {
      await ensureEvidenceBucket(admin);
      upload = await admin.storage
        .from(EVIDENCE_STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: mime || undefined,
          upsert: false,
        });
    }

    if (upload.error) {
      throw new Error(upload.error.message || 'Failed to upload evidence file');
    }

    const titleValue = title || cleanName;
    const insertResult = await insertEvidenceRow(admin, {
      brandId,
      userId,
      isPdf,
      title: titleValue,
      description,
      bucket,
      tags,
      storagePath,
    });
    const inserted = insertResult.inserted;

    let knowledgeSync: PdfKnowledgeSync | null = null;

    if (isPdf) {
      knowledgeSync = await ingestPdfKnowledgeSource(admin, {
        brandId,
        userId,
        evidenceId: inserted && typeof inserted.id === 'string' ? inserted.id : null,
        title: titleValue,
        storagePath,
        fileName: cleanName,
        fileBuffer,
      });

      if (inserted && typeof inserted.id === 'string') {
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

    const signed = await admin.storage
      .from(EVIDENCE_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    return NextResponse.json({
      evidence: {
        ...(inserted ?? {
          id: null,
          brand_id: brandId,
          type: isPdf ? 'pdf' : 'image',
          title: titleValue,
          file_path: storagePath,
          created_at: new Date().toISOString(),
        }),
        signed_url: signed.data?.signedUrl || null,
      },
      knowledge_sync: knowledgeSync,
      compatibility_mode: insertResult.usedFallback ? 'legacy_no_evidence_assets_table' : null,
    });
  } catch (error) {
    console.error('[api/studio/evidence/upload] failed:', error);
    return studioErrorResponse(error);
  }
}
