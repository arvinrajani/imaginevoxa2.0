/**
 * Lightweight evidence helpers that do NOT import sharp or pdf-parse.
 * Chatbot routes should import from here instead of pdf-extraction.ts.
 */
import {
  isMissingColumnError,
  isMissingTableOrRelationError,
  requireStudioAuth,
} from '@/lib/studio/server-auth';

export const EVIDENCE_STORAGE_BUCKET =
  process.env.STUDIO_EVIDENCE_BUCKET?.trim() || 'brand-evidence';

export function dedupeTags(tags: string[]) {
  const normalized = tags.map((tag) => tag.trim()).filter(Boolean);
  return Array.from(new Set(normalized));
}

export async function insertEvidenceRow(
  admin: Awaited<ReturnType<typeof requireStudioAuth>>['admin'],
  params: {
    brandId: string;
    userId: string;
    isPdf: boolean;
    title: string;
    description: string;
    bucket: string;
    tags: string[];
    storagePath: string | null;
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
