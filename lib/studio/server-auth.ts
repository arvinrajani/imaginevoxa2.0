import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';

export class StudioApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type StudioAuthContext = {
  userId: string;
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  admin: ReturnType<typeof createAdminClient>;
};

type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function getPostgrestErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as PostgrestErrorLike).code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

function getPostgrestErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const candidate = error as PostgrestErrorLike;
  return [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

export function isMissingTableOrRelationError(error: unknown, relationName?: string) {
  const code = getPostgrestErrorCode(error);
  const text = getPostgrestErrorText(error);
  const normalizedRelation = relationName?.toLowerCase();

  if (code === '42P01' || code === 'PGRST205') {
    if (!normalizedRelation) return true;
    return text.includes(normalizedRelation);
  }

  if (normalizedRelation) {
    return (
      text.includes(`relation`) &&
      text.includes(normalizedRelation) &&
      (text.includes('does not exist') || text.includes('could not find'))
    );
  }

  return text.includes('relation') && text.includes('does not exist');
}

export function isMissingColumnError(error: unknown, columnNames?: string[]) {
  const code = getPostgrestErrorCode(error);
  const text = getPostgrestErrorText(error);

  const mentionsColumn = !columnNames?.length
    ? text.includes('column') && (text.includes('does not exist') || text.includes('could not find'))
    : columnNames.some((column) => text.includes(column.toLowerCase()));

  if (!mentionsColumn) return false;

  return code === '42703' || code === 'PGRST204' || text.includes('column');
}

export async function requireStudioAuth(): Promise<StudioAuthContext> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    throw new StudioApiError(401, 'Unauthorized');
  }

  return {
    userId: user.id,
    supabase,
    admin: createAdminClient(),
  };
}

export async function requireOwnedBrand(
  admin: ReturnType<typeof createAdminClient>,
  brandId: string,
  userId: string
) {
  let { data: brand, error } = await admin
    .from('brands')
    .select('id, owner_user_id, approval_required, default_channels')
    .eq('id', brandId)
    .maybeSingle<{
      id: string;
      owner_user_id: string;
      approval_required?: boolean | null;
      default_channels?: string[] | null;
    }>();

  // Backward compatibility: older databases may not have the studio brand settings columns yet.
  if (error && isMissingColumnError(error, ['approval_required', 'default_channels'])) {
    const fallback = await admin
      .from('brands')
      .select('id, owner_user_id')
      .eq('id', brandId)
      .maybeSingle<{ id: string; owner_user_id: string }>();

    error = fallback.error;
    brand = fallback.data
      ? {
          ...fallback.data,
          approval_required: false,
          default_channels: ['linkedin'],
        }
      : null;
  }

  if (error) {
    throw new StudioApiError(500, error.message || 'Failed to load brand');
  }

  if (!brand || brand.owner_user_id !== userId) {
    throw new StudioApiError(403, 'Brand not found or access denied');
  }

  return brand;
}

export async function requireOwnedRun(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  userId: string
) {
  const { data: run, error } = await admin
    .from('studio_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();

  if (error) {
    throw new StudioApiError(500, error.message || 'Failed to load run');
  }

  if (!run || run.owner_user_id !== userId) {
    throw new StudioApiError(404, 'Run not found');
  }

  return run;
}

export function studioErrorResponse(error: unknown) {
  if (error instanceof StudioApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  return NextResponse.json({ error: message }, { status: 500 });
}
