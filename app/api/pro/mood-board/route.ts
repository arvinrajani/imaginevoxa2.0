import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');

    if (!brandId) {
      return NextResponse.json({ error: 'Brand ID required' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('mood_boards')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ moodBoards: data });
  } catch (error: any) {
    console.error('Error fetching mood boards:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      brandId,
      name,
      description,
      paletteColors,
      typographyMood,
      imageDensity,
      compositionStyle,
      emotionalTone,
      derivedFromMarketingDnaId,
    } = body;

    if (!brandId || !name) {
      return NextResponse.json(
        { error: 'Brand ID and name are required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('mood_boards')
      .insert({
        brand_id: brandId,
        name,
        description,
        palette_colors: paletteColors || [],
        typography_mood: typographyMood,
        image_density: imageDensity,
        composition_style: compositionStyle,
        emotional_tone: emotionalTone,
        derived_from_marketing_dna_id: derivedFromMarketingDnaId,
        is_locked: false,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ moodBoard: data }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating mood board:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, isLocked, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Mood board ID required' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updateData: any = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.paletteColors) updateData.palette_colors = updates.paletteColors;
    if (updates.typographyMood) updateData.typography_mood = updates.typographyMood;
    if (updates.imageDensity) updateData.image_density = updates.imageDensity;
    if (updates.compositionStyle) updateData.composition_style = updates.compositionStyle;
    if (updates.emotionalTone) updateData.emotional_tone = updates.emotionalTone;

    if (isLocked !== undefined) {
      updateData.is_locked = isLocked;
      updateData.locked_by = isLocked ? user.id : null;
      updateData.locked_at = isLocked ? new Date().toISOString() : null;
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('mood_boards')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ moodBoard: data });
  } catch (error: any) {
    console.error('Error updating mood board:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
