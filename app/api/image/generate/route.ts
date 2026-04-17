import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractPostContent } from '@/lib/extract-post-content';
import { generateBanner } from '@/lib/compositor';

export const maxDuration = 120;

const BANNER_STORAGE_BUCKET = 'banner-assets';
const BANNER_WIDTH = 1536;
const BANNER_HEIGHT = 1024;
const STORAGE_UPLOAD_RETRY_DELAYS_MS = [350, 1000];

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        fileBody: Buffer,
        options: { contentType: string; upsert: boolean }
      ) => Promise<{ error: { message?: string; statusCode?: number } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

type StorageUploadResult = {
  publicUrl: string | null;
  storagePath: string | null;
  storageBucket: string | null;
  warnings: string[];
  errorMessage: string | null;
};

type ResolvedBrand = {
  id: string;
  name: string | null;
  logo_url?: string | null;
  industry_icons?: string[] | null;
  company_id?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStorageErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  return 'Unknown storage error';
}

function getStorageErrorStatusCode(error: unknown) {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number') {
      return statusCode;
    }
  }

  const message = getStorageErrorMessage(error);
  const match = message.match(/\b(\d{3})\b/);
  return match ? Number(match[1]) : null;
}

function isRetryableStorageError(error: unknown) {
  const statusCode = getStorageErrorStatusCode(error);
  if (statusCode === 408 || statusCode === 429 || (statusCode !== null && statusCode >= 500)) {
    return true;
  }

  const message = getStorageErrorMessage(error).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted') ||
    message.includes('temporar') ||
    message.includes('network') ||
    message.includes('fetch failed')
  );
}

function getBannerUploadBuckets() {
  return Array.from(
    new Set(
      [BANNER_STORAGE_BUCKET, process.env.SUPABASE_STORAGE_BUCKET?.trim()]
        .filter((value): value is string => Boolean(value))
    )
  );
}

async function uploadGeneratedBanner(params: {
  clients: Array<{ label: string; client: StorageClient }>;
  storagePath: string;
  buffer: Buffer;
}) {
  const warnings: string[] = [];
  let lastErrorMessage: string | null = null;
  const buckets = getBannerUploadBuckets();

  for (const bucket of buckets) {
    for (const { label, client } of params.clients) {
      for (let attempt = 0; attempt <= STORAGE_UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
        const { error } = await client.storage.from(bucket).upload(params.storagePath, params.buffer, {
          contentType: 'image/png',
          upsert: true,
        });

        if (!error) {
          const {
            data: { publicUrl },
          } = client.storage.from(bucket).getPublicUrl(params.storagePath);

          return {
            publicUrl,
            storagePath: params.storagePath,
            storageBucket: bucket,
            warnings,
            errorMessage: null,
          } satisfies StorageUploadResult;
        }

        lastErrorMessage = getStorageErrorMessage(error);
        warnings.push(
          `${label}:${bucket}: attempt ${attempt + 1} failed with ${lastErrorMessage}`
        );

        const hasRetryLeft = attempt < STORAGE_UPLOAD_RETRY_DELAYS_MS.length;
        if (!hasRetryLeft || !isRetryableStorageError(error)) {
          break;
        }

        await sleep(STORAGE_UPLOAD_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  return {
    publicUrl: null,
    storagePath: null,
    storageBucket: null,
    warnings,
    errorMessage: lastErrorMessage,
  } satisfies StorageUploadResult;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // 1. Parse and validate body
    const body = (await req.json()) as {
      brandId?: string;
      postText?: string;
      productImageUrl?: string | null;
      backgroundId?: string | null;
      footerWebsite?: string;
      footerEmail?: string;
      isAiGuided?: boolean;
      aiGuidedPrompt?: string;
    };

    const {
      brandId,
      postText,
      productImageUrl,
      backgroundId,
      footerWebsite,
      footerEmail,
      isAiGuided,
      aiGuidedPrompt,
    } = body;

    if (!brandId || typeof brandId !== 'string') {
      return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }
    if (!postText || typeof postText !== 'string' || postText.trim().length < 20) {
      return NextResponse.json(
        { error: 'postText is required and must be at least 20 characters' },
        { status: 400 }
      );
    }
    if (!isAiGuided && (!backgroundId || typeof backgroundId !== 'string')) {
      return NextResponse.json(
        { error: 'backgroundId is required in standard mode' },
        { status: 400 }
      );
    }
    if (isAiGuided && (!aiGuidedPrompt || aiGuidedPrompt.trim().length < 10)) {
      return NextResponse.json(
        { error: 'AI guided prompt must be at least 10 characters' },
        { status: 400 }
      );
    }

    // 2. Auth check
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Brand ownership check — includes company_id for company lookup
    let brand: ResolvedBrand | null = null;
    {
      const fullQuery = await supabase
        .from('brands')
        .select('id, name, logo_url, industry_icons, company_id, primary_color, secondary_color')
        .eq('id', brandId)
        .eq('owner_user_id', user.id)
        .single();

      if (fullQuery.data) {
        brand = fullQuery.data;
      } else {
        // Retry with core + banner columns — primary_color/secondary_color may not exist
        const midQuery = await supabase
          .from('brands')
          .select('id, name, logo_url, industry_icons, company_id')
          .eq('id', brandId)
          .eq('owner_user_id', user.id)
          .single();

        if (midQuery.data) {
          brand = midQuery.data;
        } else {
          // Final fallback with only base schema columns
          const coreQuery = await supabase
            .from('brands')
            .select('id, name, company_id')
            .eq('id', brandId)
            .eq('owner_user_id', user.id)
            .single();

          if (coreQuery.data) {
            brand = coreQuery.data;
          }
        }
      }
    }

    if (!brand) {
      return NextResponse.json(
        { error: 'You do not have access to this brand' },
        { status: 403 }
      );
    }

    // 4. Load company data
    const { data: company } = brand.company_id
      ? await supabase
          .from('companies')
          .select('name, logo_url, website, email, industry')
          .eq('id', brand.company_id)
          .single()
      : { data: null };

    // 4b. Resolve brand logo from brand_assets → image_assets (preferred)
    let resolvedBrandLogoUrl: string | null = brand.logo_url || null;
    if (!resolvedBrandLogoUrl) {
      try {
        const { data: brandAsset } = await supabase
          .from('brand_assets')
          .select('image_asset_id')
          .eq('brand_id', brandId)
          .eq('kind', 'logo')
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();
        if (brandAsset?.image_asset_id) {
          const { data: imgAsset } = await supabase
            .from('image_assets')
            .select('file_url')
            .eq('id', brandAsset.image_asset_id)
            .maybeSingle();
          if (imgAsset?.file_url) {
            resolvedBrandLogoUrl = imgAsset.file_url;
          }
        }
      } catch (e) {
        console.warn('[generate] Failed to resolve brand logo from brand_assets:', e);
      }
    }

    // 5. Load colors from marketing_dna analysis
    const { data: dna } = await supabase
      .from('marketing_dna')
      .select('primary_colors, accent_colors, evidence')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const primaryColor =
      (dna?.primary_colors as string[] | null)?.[0] ||
      ((dna?.evidence as Record<string, unknown>)?.primary_colors as string[] | undefined)?.[0] ||
      brand.primary_color ||
      '#0a1628';

    const secondaryColor =
      (dna?.accent_colors as string[] | null)?.[0] ||
      (dna?.primary_colors as string[] | null)?.[1] ||
      ((dna?.evidence as Record<string, unknown>)?.accent_colors as string[] | undefined)?.[0] ||
      brand.secondary_color ||
      '#f5a623';

    // Resolve footer fields — body overrides company defaults
    const website =
      typeof footerWebsite === 'string' && footerWebsite.trim()
        ? footerWebsite.trim()
        : company?.website || '';
    const email =
      typeof footerEmail === 'string' && footerEmail.trim()
        ? footerEmail.trim()
        : company?.email || '';

    // 6. Extract post content (needed for both modes)
    const postContent = await extractPostContent(postText.trim());

    // 7. Resolve background URL for standard mode
    let backgroundStorageUrl: string | null = null;
    if (!isAiGuided) {
      const { data: background, error: bgError } = await supabase
        .from('banner_backgrounds')
        .select('id, storage_url')
        .eq('id', backgroundId!)
        .eq('is_active', true)
        .single();

      if (bgError || !background) {
        return NextResponse.json(
          { error: 'Background not found. Please select a background.' },
          { status: 400 }
        );
      }
      backgroundStorageUrl = background.storage_url;
    }

    // 8. Generate banner via gpt-image-1.5 (same pipeline for both modes)
    const generatedBanner = await generateBanner({
      headline: postContent.headline,
      tagline: postContent.tagline,
      bullets: postContent.bullets,
      website,
      email,
      companyLogoUrl: company?.logo_url || null,
      brandLogoUrl: resolvedBrandLogoUrl,
      productImageUrl: productImageUrl || null,
      primaryColor,
      secondaryColor,
      industryIcons: brand.industry_icons || [],
      mode: isAiGuided ? 'ai-guided' : 'standard',
      backgroundStorageUrl,
      aiGuidedPrompt: aiGuidedPrompt?.trim() || '',
      brandName: brand.name || '',
      companyName: company?.name || '',
      partnerTagline: '',
    });

    const finalBuffer = Buffer.isBuffer(generatedBanner)
      ? generatedBanner
      : Buffer.from(generatedBanner);

    // 9. Upload to Supabase storage
    const fileName = `banner-${Date.now()}.png`;
    const storagePath = `${brandId}/${fileName}`;

    const uploadClients: Array<{ label: string; client: StorageClient }> = [
      { label: 'session', client: supabase as unknown as StorageClient },
    ];

    try {
      uploadClients.push({
        label: 'admin',
        client: createAdminClient() as unknown as StorageClient,
      });
    } catch (error) {
      console.warn(
        '[image/generate] Admin client unavailable for upload fallback:',
        error instanceof Error ? error.message : error
      );
    }

    const uploadResult = await uploadGeneratedBanner({
      clients: uploadClients,
      storagePath,
      buffer: finalBuffer,
    });

    const publicUrl =
      uploadResult.publicUrl || `data:image/png;base64,${finalBuffer.toString('base64')}`;

    if (!uploadResult.publicUrl) {
      console.warn(
        '[image/generate] Storage upload failed, returning data URL fallback:',
        uploadResult.errorMessage,
        uploadResult.warnings
      );
    }

    // 10. Save to image_assets table
    let assetId: string | null = null;
    if (uploadResult.publicUrl) {
      const { data: asset, error: assetError } = await supabase
        .from('image_assets')
        .insert({
          brand_id: brandId,
          created_by: user.id,
          asset_type: 'composed',
          source: 'ai',
          file_url: publicUrl,
          width: BANNER_WIDTH,
          height: BANNER_HEIGHT,
          metadata: {
            headline: postContent.headline,
            tagline: postContent.tagline,
            bullets: postContent.bullets,
            backgroundId: backgroundId || null,
            postText: postText.slice(0, 500),
            isAiGuided: !!isAiGuided,
            aiGuidedPrompt: isAiGuided ? aiGuidedPrompt?.slice(0, 500) : undefined,
            storage_path: uploadResult.storagePath,
            storage_bucket: uploadResult.storageBucket,
            requested_type: 'banner',
            upload_warnings: uploadResult.warnings.length > 0 ? uploadResult.warnings : undefined,
          },
        })
        .select('id')
        .single();

      if (assetError) {
        console.error('[image/generate] Asset save error:', assetError.message);
      } else {
        assetId = asset?.id || null;
      }
    }

    // 11. Return response
    return NextResponse.json({
      url: publicUrl,
      headline: postContent.headline,
      tagline: postContent.tagline,
      bullets: postContent.bullets,
      assetId,
    });
  } catch (error) {
    console.error(
      '[image/generate] Unhandled error:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
