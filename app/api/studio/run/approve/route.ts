import { NextResponse } from 'next/server';
import {
  requireOwnedBrand,
  requireOwnedRun,
  requireStudioAuth,
  studioErrorResponse,
} from '@/lib/studio/server-auth';

function normalizeAction(input: unknown): 'request' | 'approve' | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (value === 'request' || value === 'request_approval' || value === 'in_review') {
    return 'request';
  }
  if (value === 'approve' || value === 'approved') {
    return 'approve';
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      runId?: string;
      action?: string;
      notes?: string;
    };

    const runId = String(body.runId || '').trim();
    const action = normalizeAction(body.action);
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: 'action must be request or approve' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    const run = await requireOwnedRun(admin, runId, userId);
    await requireOwnedBrand(admin, run.brand_id, userId);

    const payload: Record<string, unknown> = {
      approval_notes: notes || null,
    };

    if (action === 'request') {
      payload.status = 'IN_REVIEW';
    }

    if (action === 'approve') {
      payload.status = 'APPROVED';
      payload.approved_at = new Date().toISOString();
      payload.approved_by = userId;
    }

    const { data, error } = await admin
      .from('studio_runs')
      .update(payload)
      .eq('id', runId)
      .eq('owner_user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to update run approval');
    }

    return NextResponse.json({ run: data });
  } catch (error) {
    return studioErrorResponse(error);
  }
}
