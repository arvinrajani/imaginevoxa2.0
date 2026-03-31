import { NextResponse } from 'next/server';

export const maxDuration = 60;
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(request: Request) {
    try {
        const body = await request.json();
        const { brand_id, evidence_asset_id, source_file } = body as {
            brand_id?: string;
            evidence_asset_id?: string;
            source_file?: string;
        };

        const normalizedSourceFile = typeof source_file === 'string' ? source_file.trim() : '';

        if (!brand_id || (!evidence_asset_id && !normalizedSourceFile)) {
            return NextResponse.json(
                { error: 'brand_id and either evidence_asset_id or source_file are required' },
                { status: 400 }
            );
        }

        // Authenticate
        const supabase = await createServerSupabase();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Validate brand ownership
        const { data: brand } = await supabase
            .from('brands')
            .select('id')
            .eq('id', brand_id)
            .eq('owner_user_id', user.id)
            .maybeSingle();

        if (!brand) {
            return NextResponse.json({ error: 'Brand not found or access denied' }, { status: 403 });
        }

        // Delete chunks
        const admin = createAdminClient();
        let deleteQuery = admin
            .from('brand_knowledge_chunks')
            .delete()
            .eq('brand_id', brand_id);

        if (evidence_asset_id) {
            deleteQuery = deleteQuery.filter('metadata->>evidence_asset_id', 'eq', evidence_asset_id);
        } else {
            deleteQuery = deleteQuery.eq('source_file', normalizedSourceFile);
        }

        const { data: deletedRows, error: deleteError } = await deleteQuery.select('id');

        if (deleteError) {
            return NextResponse.json(
                { error: `Failed to delete chunks: ${deleteError.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            chunks_deleted: deletedRows?.length ?? 0,
        });
    } catch (err) {
        console.error('[api/chatbot/delete-knowledge] failed:', err);
        const message = err instanceof Error ? err.message : 'Unexpected error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}