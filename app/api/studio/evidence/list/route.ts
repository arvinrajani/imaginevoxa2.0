import { NextResponse } from 'next/server';
import {
  isMissingTableOrRelationError,
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';

export const dynamic = 'force-dynamic';
const EVIDENCE_STORAGE_BUCKET =
  process.env.STUDIO_EVIDENCE_BUCKET?.trim() || 'brand-evidence';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId')?.trim();

    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    await requireOwnedBrand(admin, brandId, userId);

    const { data, error } = await admin
      .from('evidence_assets')
      .select('*')
      .eq('brand_id', brandId)
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTableOrRelationError(error, 'evidence_assets')) {
        return NextResponse.json({ evidence: [] });
      }
      throw new Error(error.message || 'Failed to load evidence');
    }

    const rows = await Promise.all(
      (data || []).map(async (item) => {
        if (!item.file_path) {
          return { ...item, signed_url: null };
        }

        const indexedOnly =
          Array.isArray(item.tags) && item.tags.includes('indexed-only');
        if (indexedOnly) {
          return { ...item, signed_url: null };
        }

        const signed = await admin.storage
          .from(EVIDENCE_STORAGE_BUCKET)
          .createSignedUrl(item.file_path, 60 * 60);

        return {
          ...item,
          signed_url: signed.error ? null : signed.data?.signedUrl || null,
        };
      })
    );

    return NextResponse.json({ evidence: rows });
  } catch (error) {
    return studioErrorResponse(error);
  }
}
