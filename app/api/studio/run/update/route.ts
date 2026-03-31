import { NextResponse } from 'next/server';

export const maxDuration = 60;
import { requireOwnedRun, requireStudioAuth, studioErrorResponse } from '@/lib/studio/server-auth';
import { StudioChannel, StudioRunPatch } from '@/lib/studio/types';

const ALLOWED_CHANNELS: StudioChannel[] = ['linkedin', 'facebook', 'instagram'];

function normalizeChannels(input: unknown): StudioChannel[] {
  if (!Array.isArray(input)) return [];
  const filtered = input.filter(
    (value): value is StudioChannel =>
      typeof value === 'string' && ALLOWED_CHANNELS.includes(value as StudioChannel)
  );
  return Array.from(new Set(filtered));
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
      runId?: string;
      patch?: StudioRunPatch;
    };

    const runId = String(body.runId || '').trim();
    const patch = body.patch;

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    if (!patch || typeof patch !== 'object') {
      return NextResponse.json({ error: 'patch is required' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    const existing = await requireOwnedRun(admin, runId, userId);

    const updatePayload: Record<string, unknown> = {};

    if (typeof patch.primary_channel === 'string' && ALLOWED_CHANNELS.includes(patch.primary_channel)) {
      updatePayload.primary_channel = patch.primary_channel;
    }

    if (Array.isArray(patch.selected_channels)) {
      const channels = normalizeChannels(patch.selected_channels);
      if (channels.length > 0) {
        updatePayload.selected_channels = channels;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'confirmed_post')) {
      updatePayload.confirmed_post = patch.confirmed_post ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'channel_variants')) {
      updatePayload.channel_variants = patch.channel_variants ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'confirmed_images')) {
      updatePayload.confirmed_images = patch.confirmed_images ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'template_id')) {
      updatePayload.template_id = patch.template_id ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'editor_state')) {
      updatePayload.editor_state = patch.editor_state ?? null;
    }

    if (Array.isArray(patch.evidence_ids)) {
      const evidenceIds = normalizeUuidArray(patch.evidence_ids);
      updatePayload.evidence_ids = evidenceIds;

      if (evidenceIds.length > 0) {
        const { data: evidenceRows, error: evidenceError } = await admin
          .from('evidence_assets')
          .select('id')
          .eq('brand_id', existing.brand_id)
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
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'approval_notes')) {
      const notes = typeof patch.approval_notes === 'string' ? patch.approval_notes.trim() : '';
      updatePayload.approval_notes = notes || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('studio_runs')
      .update(updatePayload)
      .eq('id', runId)
      .eq('owner_user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to update run');
    }

    return NextResponse.json({ run: data });
  } catch (error) {
    return studioErrorResponse(error);
  }
}