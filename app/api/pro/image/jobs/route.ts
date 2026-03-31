import { NextResponse } from 'next/server';

export const maxDuration = 60;
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createImageJob, listImageJobsForOwner } from '@/lib/studio/image-jobs';

const createJobSchema = z.object({
  kind: z.enum(['create', 'edit']),
  payload: z.record(z.string(), z.unknown()),
  maxAttempts: z.number().int().min(1).max(5).optional(),
});

function resolveOrigin(request: Request) {
  const originHeader = request.headers.get('origin');
  if (originHeader) return originHeader;

  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'http://localhost:3000';
  }
}

async function resolveActingUserId() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const devUserId = process.env.DEV_USER_ID?.trim();
  const allowDevFallback = process.env.NODE_ENV !== 'production' && Boolean(devUserId);
  return user?.id || (allowDevFallback ? devUserId : undefined);
}

export async function POST(request: Request) {
  try {
    const actingUserId = await resolveActingUserId();
    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = createJobSchema.parse(await request.json());
    const job = createImageJob({
      ownerUserId: actingUserId,
      kind: body.kind,
      payload: body.payload,
      maxAttempts: body.maxAttempts,
      origin: resolveOrigin(request),
      cookieHeader: request.headers.get('cookie'),
    });

    return NextResponse.json({ job }, { status: 202 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to create image job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const actingUserId = await resolveActingUserId();
    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || '20');
    const jobs = listImageJobsForOwner(actingUserId, Number.isFinite(limit) ? limit : 20);
    return NextResponse.json({ jobs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list jobs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}