import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      brandId,
      name,
      brandName,
      logoAssets,
      primaryColors,
      secondaryColors,
      accentColors,
      fontPersonality,
      toneGuidelines,
      allowedImageStyles,
    } = body;

    if (!brandId || !name) {
      return NextResponse.json(
        { error: 'Brand ID and name are required' },
        { status: 400 }
      );
    }

    // Authenticate the user
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client to bypass RLS (avoids infinite recursion on brand_members policies)
    const admin = createAdminClient();

    // Verify user owns this brand
    const { data: brand } = await admin
      .from('brands')
      .select('id')
      .eq('id', brandId)
      .eq('owner_user_id', user.id)
      .single();

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found or access denied' }, { status: 403 });
    }

    // Check if a brand kit already exists for this brand — update instead of insert
    const { data: existing } = await admin
      .from('brand_kits')
      .select('id')
      .eq('brand_id', brandId)
      .limit(1)
      .maybeSingle();

    let data;
    let error;

    if (existing) {
      // Update existing brand kit
      const result = await admin
        .from('brand_kits')
        .update({
          name,
          brand_name: brandName,
          logo_assets: logoAssets || [],
          primary_colors: primaryColors || [],
          secondary_colors: secondaryColors || [],
          accent_colors: accentColors || [],
          font_personality: fontPersonality,
          tone_guidelines: toneGuidelines || [],
          allowed_image_styles: allowedImageStyles || [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert new brand kit
      const result = await admin
        .from('brand_kits')
        .insert({
          brand_id: brandId,
          name,
          brand_name: brandName,
          logo_assets: logoAssets || [],
          primary_colors: primaryColors || [],
          secondary_colors: secondaryColors || [],
          accent_colors: accentColors || [],
          font_personality: fontPersonality,
          tone_guidelines: toneGuidelines || [],
          allowed_image_styles: allowedImageStyles || [],
          is_locked: false,
        })
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) throw error;

    return NextResponse.json({ brandKit: data }, { status: existing ? 200 : 201 });
  } catch (error: any) {
    console.error('Error saving brand kit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, isLocked, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Brand kit ID required' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: existingKit, error: existingKitError } = await admin
      .from('brand_kits')
      .select('id, brand_id')
      .eq('id', id)
      .maybeSingle();

    if (existingKitError) throw existingKitError;
    if (!existingKit) {
      return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 });
    }

    const { data: ownedBrand, error: brandError } = await admin
      .from('brands')
      .select('id')
      .eq('id', existingKit.brand_id)
      .eq('owner_user_id', user.id)
      .maybeSingle();

    if (brandError) throw brandError;
    if (!ownedBrand) {
      return NextResponse.json({ error: 'Brand not found or access denied' }, { status: 403 });
    }

    const updateData: any = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.brandName !== undefined) updateData.brand_name = updates.brandName;
    if (updates.logoAssets) updateData.logo_assets = updates.logoAssets;
    if (updates.primaryColors) updateData.primary_colors = updates.primaryColors;
    if (updates.secondaryColors) updateData.secondary_colors = updates.secondaryColors;
    if (updates.accentColors) updateData.accent_colors = updates.accentColors;
    if (updates.fontPersonality) updateData.font_personality = updates.fontPersonality;
    if (updates.toneGuidelines) updateData.tone_guidelines = updates.toneGuidelines;
    if (updates.allowedImageStyles) updateData.allowed_image_styles = updates.allowedImageStyles;

    if (isLocked !== undefined) {
      updateData.is_locked = isLocked;
      updateData.locked_by = isLocked ? user.id : null;
      updateData.locked_at = isLocked ? new Date().toISOString() : null;
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from('brand_kits')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ brandKit: data });
  } catch (error: any) {
    console.error('Error updating brand kit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
