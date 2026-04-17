import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Seed banner_backgrounds with 14 curated Unsplash images (2 per industry).
 * Uses upsert so it is safe to call multiple times.
 */

const SEED_BACKGROUNDS = [
  // Electrical
  {
    name: 'Electrical 1',
    industry: 'electrical',
    url: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=1536&q=80',
  },
  {
    name: 'Electrical 2',
    industry: 'electrical',
    url: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1536&q=80',
  },
  // Manufacturing
  {
    name: 'Manufacturing 1',
    industry: 'manufacturing',
    url: 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=1536&q=80',
  },
  {
    name: 'Manufacturing 2',
    industry: 'manufacturing',
    url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1536&q=80',
  },
  // Construction
  {
    name: 'Construction 1',
    industry: 'construction',
    url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1536&q=80',
  },
  {
    name: 'Construction 2',
    industry: 'construction',
    url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1536&q=80',
  },
  // Technology
  {
    name: 'Technology 1',
    industry: 'technology',
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1536&q=80',
  },
  {
    name: 'Technology 2',
    industry: 'technology',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1536&q=80',
  },
  // Automotive
  {
    name: 'Automotive 1',
    industry: 'automotive',
    url: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1536&q=80',
  },
  {
    name: 'Automotive 2',
    industry: 'automotive',
    url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1536&q=80',
  },
  // Healthcare
  {
    name: 'Healthcare 1',
    industry: 'healthcare',
    url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1536&q=80',
  },
  {
    name: 'Healthcare 2',
    industry: 'healthcare',
    url: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1536&q=80',
  },
  // General
  {
    name: 'General 1',
    industry: 'general',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1536&q=80',
  },
  {
    name: 'General 2',
    industry: 'general',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1536&q=80',
  },
];

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== process.env.ADMIN_USER_ID) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = createAdminClient();

    const rows = SEED_BACKGROUNDS.map((bg) => ({
      name: bg.name,
      industry: bg.industry,
      storage_url: bg.url,
      preview_url: bg.url,
      is_active: true,
    }));

    const { data, error } = await admin
      .from('banner_backgrounds')
      .upsert(rows, { onConflict: 'name' })
      .select();

    if (error) {
      console.error('[seed] upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: data?.length ?? 0 });
  } catch (err) {
    console.error('[seed] unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Seed failed' },
      { status: 500 },
    );
  }
}
