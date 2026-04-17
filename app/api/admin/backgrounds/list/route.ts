import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALL_INDUSTRIES = [
  'electrical',
  'manufacturing',
  'construction',
  'technology',
  'automotive',
  'healthcare',
  'general',
];

export async function GET() {
  try {
    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from('banner_backgrounds')
      .select('id, name, industry, storage_url, preview_url')
      .eq('is_active', true)
      .order('industry')
      .order('sort_order');

    if (error) {
      console.error('[bg-list] Query error:', error.message);
      return NextResponse.json({ error: 'Failed to load backgrounds' }, { status: 500 });
    }

    const grouped = (data || []).reduce<
      Record<string, Array<{ id: string; name: string; industry: string; storage_url: string; preview_url: string }>>
    >((acc, row) => {
      const key = row.industry.toLowerCase();
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    // Ensure all industries are present
    for (const industry of ALL_INDUSTRIES) {
      if (!grouped[industry]) grouped[industry] = [];
    }

    return NextResponse.json(grouped);
  } catch (error) {
    console.error(
      '[bg-list] Unhandled:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
