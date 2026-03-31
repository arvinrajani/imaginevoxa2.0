import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

function normalizeLogoAssets(
  raw: unknown
): Array<{ url: string; name?: string }> {
  if (!Array.isArray(raw)) return [];

  const normalized = raw
    .map((item): { url: string; name?: string } | null => {
      if (typeof item === 'string') {
        const url = item.trim();
        return url ? { url } : null;
      }

      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      const url =
        (typeof candidate.url === 'string' && candidate.url.trim()) ||
        (typeof candidate.file_url === 'string' && candidate.file_url.trim()) ||
        (typeof candidate.publicUrl === 'string' && candidate.publicUrl.trim()) ||
        '';
      if (!url) return null;
      const name =
        typeof candidate.name === 'string' && candidate.name.trim()
          ? candidate.name.trim()
          : undefined;
      return { url, name };
    })
    .filter((item): item is { url: string; name?: string } => Boolean(item));

  return normalized;
}

export async function GET(request: NextRequest) {
  try {
    const brandId = request.nextUrl.searchParams.get('brandId');
    if (!brandId) {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const devUserId = process.env.DEV_USER_ID?.trim();
    const allowDevFallback = process.env.NODE_ENV !== 'production' && Boolean(devUserId);
    const actingUserId = user?.id || (allowDevFallback ? devUserId : undefined);

    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify ownership
    const { data: brand } = await admin
      .from('brands')
      .select('id, name')
      .eq('id', brandId)
      .eq('owner_user_id', actingUserId)
      .single();

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Return the FULL brand kit â€” colors, style, tone, imagery, content strategy
    const { data: kit } = await admin
      .from('brand_kits')
      .select('*')
      .eq('brand_id', brandId)
      .limit(1)
      .maybeSingle();

    const logoAssets = normalizeLogoAssets(kit?.logo_assets);
    const brandNameFromBrand =
      typeof brand?.name === 'string' && brand.name.trim()
        ? brand.name.trim()
        : '';
    const brandNameFromKit =
      typeof kit?.brand_name === 'string' && kit.brand_name.trim()
        ? kit.brand_name.trim()
        : '';

    const resolvedBrandName =
      brandNameFromBrand && brandNameFromBrand !== 'My Brand'
        ? brandNameFromBrand
        : brandNameFromKit || brandNameFromBrand;

    return NextResponse.json({
      setupComplete: !!kit,
      brandName: resolvedBrandName,
      primaryColors: kit?.primary_colors || null,
      secondaryColors: kit?.secondary_colors || null,
      accentColors: kit?.accent_colors || null,
      logoAssets,
      fontPersonality: kit?.font_personality || null,
      toneGuidelines: kit?.tone_guidelines || null,
      allowedImageStyles: kit?.allowed_image_styles || null,
    });
  } catch (error: unknown) {
    console.error('Brand kit status error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}