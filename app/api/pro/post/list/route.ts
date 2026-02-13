import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    const status = searchParams.get('status') || 'draft';

    if (!brandId) {
      return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    }

    // Verify brand ownership
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, owner_user_id')
      .eq('id', brandId)
      .eq('owner_user_id', user.id)
      .single();

    if (brandError || !brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Get posts with compliance data
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select(`
        *,
        compliance_checks (
          id,
          check_type,
          status,
          score,
          details
        ),
        post_approvals (
          id,
          status,
          reviewer_id,
          notes,
          created_at
        )
      `)
      .eq('brand_id', brandId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (postsError) {
      console.error('Error fetching posts:', postsError);
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }

    return NextResponse.json({ posts: posts || [] });

  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');

    if (!postId) {
      return NextResponse.json({ error: 'postId required' }, { status: 400 });
    }

    // Verify post ownership through brand
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, brand_id, brands(owner_user_id)')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Delete post and related records (cascade should handle compliance_checks)
    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (deleteError) {
      console.error('Error deleting post:', deleteError);
      return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
