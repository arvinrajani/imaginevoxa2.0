import { NextResponse } from 'next/server';

export const maxDuration = 60;
import { requireOwnedBrand, requireStudioAuth, studioErrorResponse } from '@/lib/studio/server-auth';
import { StudioChannel } from '@/lib/studio/types';

const ALLOWED_CHANNELS: StudioChannel[] = ['linkedin', 'facebook', 'instagram'];

function normalizeChannels(input: unknown): StudioChannel[] {
  if (!Array.isArray(input)) return [];
  const filtered = input.filter(
    (value): value is StudioChannel =>
      typeof value === 'string' && ALLOWED_CHANNELS.includes(value as StudioChannel)
  );
  return Array.from(new Set(filtered));
}

function normalizePrimaryChannel(input: unknown, fallback: StudioChannel): StudioChannel {
  if (typeof input === 'string' && ALLOWED_CHANNELS.includes(input as StudioChannel)) {
    return input as StudioChannel;
  }
  return fallback;
}

function normalizeUuidArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((value) => String(value || '').trim())
        .filter((value) => /^[0-9a-fA-F-]{36}$/.test(value))
    )
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      brandId?: string;
      selectedChannels?: unknown;
      primaryChannel?: unknown;
      evidenceIds?: unknown;
    };

    const brandId = String(body.brandId || '').trim();
    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    const brand = await requireOwnedBrand(admin, brandId, userId);

    const selectedChannels = normalizeChannels(body.selectedChannels);
    const defaultChannels = normalizeChannels(brand.default_channels || ['linkedin']);
    const resolvedChannels: StudioChannel[] =
      selectedChannels.length > 0
        ? selectedChannels
        : defaultChannels.length > 0
        ? defaultChannels
        : ['linkedin'];

    const primaryChannel = normalizePrimaryChannel(body.primaryChannel, resolvedChannels[0]);
    if (!resolvedChannels.includes(primaryChannel)) {
      resolvedChannels.unshift(primaryChannel);
    }

    const evidenceIds = normalizeUuidArray(body.evidenceIds);
    if (evidenceIds.length > 0) {
      const { data: evidenceRows, error: evidenceError } = await admin
        .from('evidence_assets')
        .select('id')
        .eq('brand_id', brandId)
        .eq('owner_user_id', userId)
        .in('id', evidenceIds);

      if (evidenceError) {
        throw new Error(evidenceError.message || 'Failed to validate evidence');
      }

      const matched = new Set((evidenceRows || []).map((row) => String(row.id)));
      const missing = evidenceIds.filter((id) => !matched.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: 'Some evidence items do not belong to this brand', missing },
          { status: 400 }
        );
      }
    }

    const { data, error } = await admin
      .from('studio_runs')
      .insert({
        brand_id: brandId,
        owner_user_id: userId,
        status: 'DRAFT',
        approval_required: Boolean(brand.approval_required),
        primary_channel: primaryChannel,
        selected_channels: resolvedChannels,
        evidence_ids: evidenceIds,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to create run');
    }

    return NextResponse.json({ run: data }, { status: 201 });
  } catch (error) {
    return studioErrorResponse(error);
  }
}