import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { EVIDENCE_STORAGE_BUCKET } from '@/lib/studio/pdf-extraction';
import {
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';

const requestSchema = z.object({
  brandId: z.string().trim().min(1, 'brandId is required'),
  fileName: z.string().trim().min(1, 'fileName is required'),
  fileSize: z.number().int().positive().max(200 * 1024 * 1024).optional(),
  contentType: z.string().trim().optional(),
});

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isBucketMissingError(error: unknown) {
  const message =
    error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.toLowerCase()
      : '';
  return message.includes('bucket') && (message.includes('not found') || message.includes('does not exist'));
}

function isStorageLimitError(error: unknown) {
  const message =
    error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.toLowerCase()
      : '';
  return (
    message.includes('maximum allowed size') ||
    message.includes('file size limit') ||
    message.includes('quota') ||
    message.includes('storage limit') ||
    message.includes('insufficient storage') ||
    message.includes('not enough space')
  );
}

async function ensureEvidenceBucket(admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin']) {
  const existing = await admin.storage.getBucket(EVIDENCE_STORAGE_BUCKET);
  if (!existing.error && existing.data) {
    return;
  }

  if (existing.error && !isBucketMissingError(existing.error)) {
    // Bucket admin inspection is flaky on some hosted projects. If upload URL
    // creation works below, the bucket already exists and we do not need to fail here.
    if (isStorageLimitError(existing.error)) {
      return;
    }
    throw new Error(existing.error.message || 'Failed to check storage bucket');
  }

  const created = await admin.storage.createBucket(EVIDENCE_STORAGE_BUCKET, {
    public: false,
    allowedMimeTypes: ['application/pdf'],
  });

  if (
    created.error &&
    !String(created.error.message || '').toLowerCase().includes('already exists') &&
    !isStorageLimitError(created.error)
  ) {
    throw new Error(created.error.message || 'Failed to create storage bucket');
  }
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const contentType = body.contentType?.toLowerCase() || '';
    const lowerName = body.fileName.toLowerCase();

    if (contentType && contentType !== 'application/pdf' && !lowerName.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, body.brandId, userId);
    await ensureEvidenceBucket(admin);

    const storagePath = `${userId}/${body.brandId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(body.fileName)}`;
    const signedUpload = await admin.storage
      .from(EVIDENCE_STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signedUpload.error || !signedUpload.data?.token) {
      throw new Error(signedUpload.error?.message || 'Failed to create upload URL');
    }

    return NextResponse.json({
      bucket: EVIDENCE_STORAGE_BUCKET,
      storagePath,
      token: signedUpload.data.token,
      signedUrl: signedUpload.data.signedUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((issue) => issue.message).join(', ') },
        { status: 400 }
      );
    }

    return studioErrorResponse(error);
  }
}
