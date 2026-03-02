import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  cancelImageJobForOwner,
  getImageJobForOwner,
  retryImageJobForOwner,
} from '@/lib/studio/image-jobs';
import { createServerSupabase } from '@/lib/supabase/server';

const actionSchema = z.object({
  action: z.enum(['retry', 'cancel']),
});

async function resolveActingUserId() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const devUserId = process.env.DEV_USER_ID?.trim();
  const allowDevFallback = process.env.NODE_ENV !== 'production' && Boolean(devUserId);
  return user?.id || (allowDevFallback ? devUserId : undefined);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const actingUserId = await resolveActingUserId();
    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const job = getImageJobForOwner(jobId, actingUserId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const actingUserId = await resolveActingUserId();
    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const body = actionSchema.parse(await request.json());

    if (body.action === 'cancel') {
      const cancelled = cancelImageJobForOwner(jobId, actingUserId);
      if (!cancelled) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json({ job: cancelled });
    }

    const retried = retryImageJobForOwner(jobId, actingUserId);
    if (!retried) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (retried.status !== 'queued' && retried.status !== 'running') {
      return NextResponse.json(
        {
          error:
            retried.attempts >= retried.maxAttempts
              ? 'Retry limit reached'
              : 'Job is not retryable',
          job: retried,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ job: retried });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const actingUserId = await resolveActingUserId();
    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const cancelled = cancelImageJobForOwner(jobId, actingUserId);
    if (!cancelled) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({ job: cancelled });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
