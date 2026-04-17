import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 300; // 5 minutes for all 7 industries

const INDUSTRIES = [
  'electrical',
  'manufacturing',
  'construction',
  'technology',
  'automotive',
  'healthcare',
  'general',
];

/**
 * Calls /api/admin/backgrounds/generate for each industry sequentially.
 * Takes ~2 minutes total. Requires admin auth.
 */
export async function POST(req: Request) {
  try {
    // Auth check
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== process.env.ADMIN_USER_ID) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Forward cookies so each sub-request is authenticated
    const cookie = req.headers.get('cookie') || '';
    const origin = req.headers.get('origin') || new URL(req.url).origin;

    const results: { industry: string; status: string; count?: number; error?: string }[] = [];

    for (const industry of INDUSTRIES) {
      try {
        const res = await fetch(`${origin}/api/admin/backgrounds/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
          },
          body: JSON.stringify({ industry }),
        });

        if (res.ok) {
          const data = await res.json();
          results.push({ industry, status: 'ok', count: Array.isArray(data) ? data.length : 1 });
        } else {
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          results.push({ industry, status: 'error', error: errData.error || res.statusText });
        }
      } catch (err) {
        results.push({
          industry,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const succeeded = results.filter((r) => r.status === 'ok').length;
    return NextResponse.json({
      message: `Generated backgrounds for ${succeeded}/${INDUSTRIES.length} industries`,
      results,
    });
  } catch (err) {
    console.error('[generate-all]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
