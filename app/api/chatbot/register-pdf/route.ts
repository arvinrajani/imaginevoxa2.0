import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  EVIDENCE_STORAGE_BUCKET,
  insertEvidenceRow,
} from '@/lib/studio/evidence-helpers';
import {
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';

const requestSchema = z.object({
  brandId: z.string().trim().min(1, 'brandId is required'),
  title: z.string().trim().optional(),
  fileName: z.string().trim().min(1, 'fileName is required'),
  storagePath: z.string().trim().min(1, 'storagePath is required'),
  bucket: z.string().trim().optional(),
});

function fallbackTitle(fileName: string, provided?: string) {
  const normalized = provided?.trim();
  if (normalized) return normalized;
  return fileName.replace(/\.pdf$/i, '').trim() || fileName.trim();
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const lowerName = body.fileName.toLowerCase();

    if (!lowerName.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, body.brandId, userId);

    const existsResult = await admin.storage
      .from(EVIDENCE_STORAGE_BUCKET)
      .exists(body.storagePath);

    if (existsResult.error) {
      throw new Error(existsResult.error.message || 'Failed to verify uploaded PDF');
    }

    if (!existsResult.data) {
      return NextResponse.json(
        { error: 'Uploaded PDF was not found in storage. Please retry the upload.' },
        { status: 400 }
      );
    }

    const titleValue = fallbackTitle(body.fileName, body.title);
    const insertResult = await insertEvidenceRow(admin, {
      brandId: body.brandId,
      userId,
      isPdf: true,
      title: titleValue,
      description: '',
      bucket: body.bucket?.trim() || 'chat',
      tags: [],
      storagePath: body.storagePath,
    });

    const inserted = insertResult.inserted;
    const signed = inserted
      ? await admin.storage.from(EVIDENCE_STORAGE_BUCKET).createSignedUrl(body.storagePath, 60 * 60)
      : { data: { signedUrl: null } };

    return NextResponse.json({
      evidence: {
        ...(inserted ?? {
          id: null,
          brand_id: body.brandId,
          type: 'pdf',
          title: titleValue,
          file_path: body.storagePath,
          created_at: new Date().toISOString(),
        }),
        signed_url: signed.data?.signedUrl || null,
      },
      compatibility_mode: insertResult.usedFallback ? 'legacy_no_evidence_assets_table' : null,
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
