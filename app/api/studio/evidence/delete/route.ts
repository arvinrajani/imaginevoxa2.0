import { NextResponse } from 'next/server';
import {
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';
import { deleteChatbotKnowledgeForEvidenceIds } from '@/lib/chatbot/pdf-knowledge';

const EVIDENCE_STORAGE_BUCKET =
  process.env.STUDIO_EVIDENCE_BUCKET?.trim() || 'brand-evidence';

type DeletePayload = {
  brandId?: string;
  evidenceIds?: string[];
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as DeletePayload;
    const brandId = String(payload.brandId || '').trim();
    const evidenceIds = Array.isArray(payload.evidenceIds)
      ? Array.from(new Set(payload.evidenceIds.map((id) => String(id || '').trim()).filter(Boolean)))
      : [];

    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }
    if (evidenceIds.length === 0) {
      return NextResponse.json({ error: 'evidenceIds is required' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, brandId, userId);

    const { data: rows, error: loadError } = await admin
      .from('evidence_assets')
      .select('id, file_path, type')
      .eq('brand_id', brandId)
      .eq('owner_user_id', userId)
      .in('id', evidenceIds);

    if (loadError) {
      throw new Error(loadError.message || 'Failed to load evidence rows');
    }

    const matchedIds = (rows || []).map((row) => row.id).filter((id): id is string => typeof id === 'string');
    if (matchedIds.length === 0) {
      return NextResponse.json({ deletedCount: 0 });
    }

    const storagePaths = (rows || [])
      .map((row) => (typeof row.file_path === 'string' ? row.file_path : null))
      .filter((path): path is string => typeof path === 'string' && !path.startsWith('indexed-only/'));

    const { error: deleteError } = await admin
      .from('evidence_assets')
      .delete()
      .eq('brand_id', brandId)
      .eq('owner_user_id', userId)
      .in('id', matchedIds);

    if (deleteError) {
      throw new Error(deleteError.message || 'Failed to delete evidence rows');
    }

    if (storagePaths.length > 0) {
      await admin.storage.from(EVIDENCE_STORAGE_BUCKET).remove(storagePaths);
    }

    // Also clean up indexed knowledge rows that were linked to deleted evidence IDs.
    await deleteChatbotKnowledgeForEvidenceIds(admin, {
      brandId,
      evidenceIds: matchedIds,
    });

    const sourceUrls = matchedIds.map((id) => `evidence://pdf/${id}`);
    await admin
      .from('content_sources')
      .delete()
      .eq('brand_id', brandId)
      .in('source_url', sourceUrls);

    return NextResponse.json({ deletedCount: matchedIds.length });
  } catch (error) {
    return studioErrorResponse(error);
  }
}
