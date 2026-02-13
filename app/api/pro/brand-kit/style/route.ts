import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const styleProfileSchema = z.object({
  colorScheme: z.object({
    primary: z.array(z.string()).default([]),
    secondary: z.array(z.string()).default([]),
    accent: z.array(z.string()).default([]),
  }),
  typography: z
    .object({
      fontMood: z.string().optional().nullable(),
      headingStyle: z.string().optional().nullable(),
      bodyStyle: z.string().optional().nullable(),
    })
    .default({}),
  imagery: z
    .object({
      style: z.array(z.string()).default([]),
      mood: z.string().optional().nullable(),
      complexity: z.string().optional().nullable(),
    })
    .default({ style: [] }),
  tone: z
    .object({
      voice: z.array(z.string()).default([]),
      formality: z.string().optional().nullable(),
    })
    .default({ voice: [] }),
  layout: z
    .object({
      preference: z.string().optional().nullable(),
      density: z.string().optional().nullable(),
    })
    .default({}),
});

const inputSchema = z.object({
  brandId: z.string().uuid(),
  styleProfile: styleProfileSchema,
});

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export async function POST(request: Request) {
  try {
    const payload = inputSchema.parse(await request.json());

    const supabase = await createServerSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: brand, error: brandError } = await admin
      .from('brands')
      .select('id, name, owner_user_id')
      .eq('id', payload.brandId)
      .eq('owner_user_id', user.id)
      .maybeSingle();

    if (brandError) throw brandError;
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found or access denied' }, { status: 403 });
    }

    const profile = payload.styleProfile;
    const now = new Date().toISOString();
    const brandName = brand.name || 'Brand';

    const toneGuidelines = uniqueStrings([
      ...(profile.tone.voice || []),
      profile.tone.formality ? `Formality: ${profile.tone.formality}` : null,
      profile.layout.preference ? `Layout preference: ${profile.layout.preference}` : null,
      profile.layout.density ? `Content density: ${profile.layout.density}` : null,
    ]);

    const allowedStyles = uniqueStrings([...(profile.imagery.style || [])]);

    const { data: existingKit, error: existingKitError } = await admin
      .from('brand_kits')
      .select('id')
      .eq('brand_id', payload.brandId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingKitError) throw existingKitError;

    let brandKit;
    if (existingKit?.id) {
      const { data, error } = await admin
        .from('brand_kits')
        .update({
          primary_colors: profile.colorScheme.primary || [],
          secondary_colors: profile.colorScheme.secondary || [],
          accent_colors: profile.colorScheme.accent || [],
          font_personality: profile.typography.fontMood || null,
          tone_guidelines: toneGuidelines,
          allowed_image_styles: allowedStyles,
          updated_at: now,
        })
        .eq('id', existingKit.id)
        .select('*')
        .single();
      if (error) throw error;
      brandKit = data;
    } else {
      const { data, error } = await admin
        .from('brand_kits')
        .insert({
          brand_id: payload.brandId,
          name: `${brandName} Style Kit`,
          brand_name: brandName,
          logo_assets: [],
          primary_colors: profile.colorScheme.primary || [],
          secondary_colors: profile.colorScheme.secondary || [],
          accent_colors: profile.colorScheme.accent || [],
          font_personality: profile.typography.fontMood || null,
          tone_guidelines: toneGuidelines,
          allowed_image_styles: allowedStyles,
          is_locked: false,
        })
        .select('*')
        .single();
      if (error) throw error;
      brandKit = data;
    }

    const paletteColors = uniqueStrings([
      ...(profile.colorScheme.primary || []),
      ...(profile.colorScheme.secondary || []),
      ...(profile.colorScheme.accent || []),
    ]);

    const { data: existingMoodBoard, error: moodLookupError } = await admin
      .from('mood_boards')
      .select('id')
      .eq('brand_id', payload.brandId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (moodLookupError) throw moodLookupError;

    const moodBoardPayload = {
      name: `${brandName} Visual Style`,
      description: 'Auto-synced from style wizard',
      palette_colors: paletteColors,
      typography_mood: profile.typography.fontMood || null,
      image_density: profile.imagery.complexity || profile.layout.density || null,
      composition_style: profile.layout.preference || null,
      emotional_tone: profile.imagery.mood || null,
      updated_at: now,
    };

    let moodBoard;
    if (existingMoodBoard?.id) {
      const { data, error } = await admin
        .from('mood_boards')
        .update(moodBoardPayload)
        .eq('id', existingMoodBoard.id)
        .select('*')
        .single();
      if (error) throw error;
      moodBoard = data;
    } else {
      const { data, error } = await admin
        .from('mood_boards')
        .insert({
          brand_id: payload.brandId,
          ...moodBoardPayload,
          is_locked: false,
        })
        .select('*')
        .single();
      if (error) throw error;
      moodBoard = data;
    }

    return NextResponse.json({
      success: true,
      brandKitId: brandKit.id,
      moodBoardId: moodBoard.id,
      brandKit,
      moodBoard,
    });
  } catch (error: any) {
    console.error('Error saving style profile:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save style profile' },
      { status: 500 }
    );
  }
}
