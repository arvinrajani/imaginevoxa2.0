import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import { createServerSupabase } from '@/lib/supabase/server';

// Image Profile Templates - System-level layouts
const DEFAULT_PROFILES = [
  {
    name: 'LinkedIn Hero Post',
    description: 'Full-bleed hero image with text overlay and subtle logo',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'base_image', position: 'fill', opacity: 1 },
        { type: 'gradient_overlay', position: 'bottom', height: '40%', opacity: 0.8 },
        { type: 'headline', position: 'center', fontSize: 48, maxWidth: '80%', color: '#FFFFFF' },
        { type: 'logo', position: 'bottom-right', size: 60, margin: 30, opacity: 0.9 },
      ],
    },
    tags: ['hero', 'announcement', 'feature'],
  },
  {
    name: 'Stat Highlight',
    description: 'Large centered statistic with supporting text',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'base_image', position: 'fill', opacity: 0.3, blur: 10 },
        { type: 'solid_background', color: 'brand_primary', opacity: 0.95 },
        { type: 'stat_number', position: 'center-top', fontSize: 120, fontWeight: 'bold', color: '#FFFFFF' },
        { type: 'stat_label', position: 'center-bottom', fontSize: 32, color: 'brand_accent' },
        { type: 'logo', position: 'top-right', size: 50, margin: 30, opacity: 0.7 },
      ],
    },
    tags: ['stats', 'achievement', 'milestone'],
  },
  {
    name: 'Quote Card',
    description: 'Clean quote layout with attribution',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'solid_background', color: 'brand_primary', opacity: 1 },
        { type: 'quote_text', position: 'center', fontSize: 36, maxWidth: '70%', color: '#FFFFFF', fontStyle: 'italic' },
        { type: 'attribution', position: 'bottom-center', fontSize: 20, color: 'brand_accent', marginBottom: 60 },
        { type: 'decorative_marks', position: 'top-left', size: 80, color: 'brand_accent', opacity: 0.3 },
        { type: 'logo', position: 'bottom-right', size: 50, margin: 30 },
      ],
    },
    tags: ['quote', 'testimonial', 'thought'],
  },
  {
    name: 'Split Layout',
    description: 'Image on left, text on right',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'base_image', position: 'left', width: '50%', opacity: 1 },
        { type: 'solid_background', position: 'right', width: '50%', color: 'brand_primary' },
        { type: 'headline', position: 'right-center', fontSize: 40, maxWidth: '40%', color: '#FFFFFF' },
        { type: 'body_text', position: 'right-bottom', fontSize: 20, maxWidth: '40%', color: 'brand_accent', marginBottom: 100 },
        { type: 'logo', position: 'bottom-right', size: 50, margin: 30 },
      ],
    },
    tags: ['split', 'feature', 'product'],
  },
  {
    name: 'Minimal Text',
    description: 'Bold headline on solid background',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'solid_background', color: 'brand_primary', opacity: 1 },
        { type: 'headline', position: 'center', fontSize: 56, maxWidth: '80%', color: '#FFFFFF', fontWeight: 'bold', textAlign: 'center' },
        { type: 'accent_line', position: 'center-top', width: 120, height: 4, color: 'brand_accent', marginTop: -60 },
        { type: 'logo', position: 'bottom-center', size: 60, marginBottom: 50 },
      ],
    },
    tags: ['minimal', 'announcement', 'simple'],
  },
  {
    name: 'Story Card',
    description: 'Image with overlay and compelling text',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'base_image', position: 'fill', opacity: 1 },
        { type: 'gradient_overlay', position: 'fill', direction: 'bottom-to-top', opacity: 0.7 },
        { type: 'headline', position: 'bottom-left', fontSize: 42, maxWidth: '60%', color: '#FFFFFF', margin: 60 },
        { type: 'body_text', position: 'bottom-left', fontSize: 22, maxWidth: '60%', color: '#E5E5E5', marginLeft: 60, marginBottom: 140 },
        { type: 'logo', position: 'top-right', size: 50, margin: 40, opacity: 0.9 },
      ],
    },
    tags: ['story', 'narrative', 'case-study'],
  },
  {
    name: 'Branded Frame',
    description: 'Image with thick branded border',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'solid_background', color: 'brand_primary', opacity: 1 },
        { type: 'base_image', position: 'center', width: '85%', height: '75%', opacity: 1 },
        { type: 'headline', position: 'top-center', fontSize: 32, color: '#FFFFFF', marginTop: 30 },
        { type: 'logo', position: 'bottom-center', size: 50, marginBottom: 25 },
      ],
    },
    tags: ['framed', 'branded', 'showcase'],
  },
  {
    name: 'Comparison Layout',
    description: 'Side-by-side comparison or before/after',
    layout: {
      canvas: { width: 1200, height: 627 },
      layers: [
        { type: 'solid_background', color: 'brand_primary', opacity: 1 },
        { type: 'base_image', position: 'left', width: '48%', height: '70%', opacity: 1, marginLeft: '2%' },
        { type: 'secondary_image', position: 'right', width: '48%', height: '70%', opacity: 1, marginRight: '2%' },
        { type: 'label_left', position: 'top-left', fontSize: 24, color: '#FFFFFF', margin: 40 },
        { type: 'label_right', position: 'top-right', fontSize: 24, color: '#FFFFFF', margin: 40 },
        { type: 'logo', position: 'bottom-center', size: 50, marginBottom: 30 },
      ],
    },
    tags: ['comparison', 'before-after', 'vs'],
  },
];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    const tags = searchParams.get('tags')?.split(',');

    if (!brandId) {
      return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    }

    // Get custom profiles for this brand
    const { data: customProfiles, error: customError } = await supabase
      .from('image_profiles')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    if (customError) {
      console.error('Error fetching custom profiles:', customError);
    }

    // Filter default profiles by tags if provided
    let filteredDefaults = DEFAULT_PROFILES;
    if (tags && tags.length > 0) {
      filteredDefaults = DEFAULT_PROFILES.filter(profile =>
        profile.tags.some(tag => tags.includes(tag))
      );
    }

    // Combine default and custom profiles
    const allProfiles = [
      ...filteredDefaults.map(p => ({ ...p, type: 'system' })),
      ...(customProfiles || []).map(p => ({
        name: p.name,
        description: p.description,
        layout: p.layout_spec,
        tags: p.category ? [p.category] : [],
        category: p.category || null,
        type: 'custom',
        id: p.id,
      })),
    ];

    return NextResponse.json({ profiles: allProfiles });

  } catch (error) {
    console.error('Error fetching image profiles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { brandId, name, description, layout, tags } = body;

    if (!brandId || !name || !layout) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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

    // Create custom profile
    const { data: profile, error: profileError } = await supabase
      .from('image_profiles')
      .insert({
        brand_id: brandId,
        name,
        description: description || null,
        layout_spec: layout,
        category: Array.isArray(tags) && tags.length > 0 ? String(tags[0]) : null,
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profileId: profile.id,
      profile,
    });

  } catch (error) {
    console.error('Error creating image profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}