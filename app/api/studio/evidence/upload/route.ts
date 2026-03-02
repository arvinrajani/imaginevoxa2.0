import { NextResponse } from 'next/server';
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
  if (!existing.error && existing.data) return;
  if (existing.error && !isBucketMissingError(existing.error)) {
    throw new Error(existing.error.message || 'Failed to check storage bucket');
  }

  const created = await admin.storage.createBucket(EVIDENCE_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: '200MB',
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

    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds 200MB limit' },
        { status: 400 }
      );
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, brandId, userId);

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
      compatibility_mode: insertResult.usedFallback ? 'legacy_no_evidence_assets_table' : null,
    });
  } catch (error) {
    console.error('[api/studio/evidence/upload] failed:', error);
    return studioErrorResponse(error);
  }
}
