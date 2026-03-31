import { NextResponse } from 'next/server';

export const maxDuration = 60;
import { requireOwnedRun, requireStudioAuth, studioErrorResponse } from '@/lib/studio/server-auth';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      runId?: string;
      scheduled_at?: string | null;
    };

    const runId = String(body.runId || '').trim();
    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    }

    const { userId, admin } = await requireStudioAuth();
    const run = await requireOwnedRun(admin, runId, userId);

    if (run.approval_required && run.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Run must be APPROVED before queueing publish' },
        { status: 400 }
      );
    }

    let scheduledAt: string | null = null;
    if (typeof body.scheduled_at === 'string' && body.scheduled_at.trim()) {
      const parsed = new Date(body.scheduled_at);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'scheduled_at must be a valid datetime' }, { status: 400 });
      }
      scheduledAt = parsed.toISOString();
    }

    const { data, error } = await admin
      .from('studio_publish_queue')
      .insert({
        run_id: run.id,
        brand_id: run.brand_id,
        owner_user_id: userId,
        scheduled_at: scheduledAt,
        status: 'queued',
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message || 'Failed to queue publish');
    }

    return NextResponse.json({ queue: data }, { status: 201 });
  } catch (error) {
    return studioErrorResponse(error);
  }
}