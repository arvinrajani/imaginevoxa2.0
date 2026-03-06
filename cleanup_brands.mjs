// cleanup_brands.mjs - run with: node --env-file=.env.local cleanup_brands.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
    process.exit(1);
}

const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

async function run() {
    // Fetch all "My Brand" entries
    const { data: rows, error } = await supabase
        .from('brands')
        .select('id, owner_user_id, name, created_at')
        .eq('name', 'My Brand')
        .order('created_at', { ascending: true });

    if (error) { console.error('Error fetching:', error); process.exit(1); }

    console.log(`Found ${rows.length} "My Brand" entries:`, rows.map(r => `${r.id} (${r.owner_user_id}) created: ${r.created_at}`));

    // Group by owner_user_id
    const byOwner = {};
    for (const row of rows) {
        if (!byOwner[row.owner_user_id]) byOwner[row.owner_user_id] = [];
        byOwner[row.owner_user_id].push(row);
    }

    let totalDeleted = 0;
    for (const [ownerId, ownerRows] of Object.entries(byOwner)) {
        if (ownerRows.length <= 1) {
            console.log(`Owner ${ownerId}: only 1 entry, skipping.`);
            continue;
        }
        const toDelete = ownerRows.slice(1).map(r => r.id); // keep oldest, delete rest
        console.log(`Owner ${ownerId}: keeping ${ownerRows[0].id}, deleting [${toDelete.join(', ')}]`);
        const { error: delError } = await supabase.from('brands').delete().in('id', toDelete);
        if (delError) { console.error('Error deleting:', delError); }
        else { console.log(`Deleted ${toDelete.length} duplicate(s).`); totalDeleted += toDelete.length; }
    }

    console.log(`\nDone! Deleted ${totalDeleted} duplicate brand(s).`);
}

run();
