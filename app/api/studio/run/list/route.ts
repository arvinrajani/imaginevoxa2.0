import { NextResponse } from 'next/server';

export const maxDuration = 60;
import {
  isMissingTableOrRelationError,
  requireOwnedBrand,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';

export const dynamic = 'force-dynamic';

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
      .from('studio_runs')
      .select('*')
      .eq('brand_id', brandId)
      .eq('owner_user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      if (isMissingTableOrRelationError(error, 'studio_runs')) {
        return NextResponse.json({ runs: [] });
      }
      throw new Error(error.message || 'Failed to load runs');
    }

    return NextResponse.json({ runs: data || [] });
  } catch (error) {
    return studioErrorResponse(error);
  }
}