import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';

// Allowed admin user IDs (set ADMIN_USER_IDS env var as comma-separated UUIDs)
function getAdminIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((id) => id.trim()).filter(Boolean));
}

// One-time cleanup route: GET /api/admin/cleanup-brands
// Deletes duplicate 'My Brand' entries for ALL users, keeping the oldest per user.
export async function GET() {
    try {
        // Auth check — must be a signed-in admin user
        const supabase = await createServerSupabase();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const adminIds = getAdminIds();
        if (adminIds.size > 0 && !adminIds.has(user.id)) {
            return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
        }

        const admin = createAdminClient();

        // Fetch all brands named 'My Brand'
        const { data: rows, error } = await admin
            .from('brands')
            .select('id, owner_user_id, name, created_at')
            .eq('name', 'My Brand')
            .order('created_at', { ascending: true });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        if (!rows || rows.length === 0) {
            return NextResponse.json({ message: 'No My Brand entries found', deleted: [] });
        }

        // Group by owner_user_id, keep first, delete rest
        const byOwner: Record<string, typeof rows> = {};
        for (const row of rows) {
            if (!byOwner[row.owner_user_id]) byOwner[row.owner_user_id] = [];
            byOwner[row.owner_user_id].push(row);
        }

        const toDelete: string[] = [];
        for (const ownerRows of Object.values(byOwner)) {
            if (ownerRows.length > 1) {
                toDelete.push(...ownerRows.slice(1).map((r) => r.id));
            }
        }

        if (toDelete.length === 0) {
            return NextResponse.json({ message: 'No duplicates found', deleted: [] });
        }

        const { error: delError } = await admin
            .from('brands')
            .delete()
            .in('id', toDelete);

        if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

        return NextResponse.json({
            message: `Deleted ${toDelete.length} duplicate brand(s)`,
            deleted: toDelete,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
