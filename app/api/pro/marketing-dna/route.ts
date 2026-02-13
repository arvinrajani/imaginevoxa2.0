import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY.');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
}

type AnalysisType = 'linkedin' | 'manual';

type JsonObject = Record<string, unknown>;

type BrandProfileAnalysis = {
  tone: string;
  primary_colors: string[];
  accent_colors: string[];
  image_style: string;
  post_types: string[];
  content_pillars: string[];
  products: string[];
  business_focus: string | null;
  target_audience: string | null;
  key_offerings: string[];
  industry: string | null;
  company_size: string | null;
  brand_name: string | null;
  brand_description: string | null;
  tagline: string | null;
  website: string | null;
  cta_style: string;
  visual_density: string;
  cadence: {
    frequency: string | null;
    best_days: string[];
    best_times: string[];
  };
  consistency_score: number;
  evidence: JsonObject;
};

type BrandContextInput = {
  name: string | null;
  description: string | null;
  industry: string | null;
  website: string | null;
  products: string[];
  offerings: string[];
  targetAudience: string | null;
};

type BrandRow = {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  website: string | null;
  owner_user_id: string;
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) return null;
  return `#${match[1].toUpperCase()}`;
}

function normalizeColorList(values: unknown, fallback: string[]): string[] {
  const colors = asStringArray(values)
    .map((value) => normalizeHex(value))
    .filter((value): value is string => Boolean(value));

  if (colors.length === 0) return fallback;
  return Array.from(new Set(colors)).slice(0, 5);
}

function toTitleCaseFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

const SAFE_COMPANY_SUFFIXES = [
  'solutions',
  'solution',
  'services',
  'service',
  'technologies',
  'technology',
  'systems',
  'system',
  'consulting',
];

function normalizeCompact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function looksLikeSafeSuffix(value: string): boolean {
  const compact = normalizeCompact(value);
  return SAFE_COMPANY_SUFFIXES.includes(compact);
}

function trimSafeCompanySuffix(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized) return normalized;

  // Case 1: spaced suffix e.g. "Acme Solutions"
  const suffixPattern = new RegExp(
    `\\b(${SAFE_COMPANY_SUFFIXES.join('|')})\\.?$`,
    'i'
  );
  if (suffixPattern.test(normalized)) {
    const withoutSuffix = normalized.replace(suffixPattern, '').trim();
    if (withoutSuffix.length >= 4) {
      return withoutSuffix;
    }
  }

  // Case 2: compact slug suffix e.g. "zaincomsolutions"
  const compact = normalizeCompact(normalized);
  for (const suffix of SAFE_COMPANY_SUFFIXES.sort((a, b) => b.length - a.length)) {
    if (compact.endsWith(suffix) && compact.length - suffix.length >= 4) {
      const base = compact.slice(0, -suffix.length);
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
  }

  return normalized;
}

function inferBrandNameFromLinkedInUrl(linkedinUrl: string): string | null {
  try {
    const raw = linkedinUrl.trim();
    if (!raw) return null;
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const scope = parts[0].toLowerCase();
    const slug = decodeURIComponent(parts[1] || '').trim();
    if (!slug) return null;

    if (scope === 'company' || scope === 'in' || scope === 'school') {
      return toTitleCaseFromSlug(slug);
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeWebsite(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;

  const candidate = text.startsWith('http://') || text.startsWith('https://') ? text : `https://${text}`;

  try {
    const url = new URL(candidate);
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeScore(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) return 80;

  const maybePercent = raw <= 1 ? raw * 100 : raw;
  const clamped = Math.max(0, Math.min(100, maybePercent));
  return Math.round(clamped);
}

function normalizeAnalysis(
  raw: unknown,
  opts: {
    analysisType: AnalysisType;
    linkedinUrl?: string;
    existingBrandName?: string;
    brandContext?: BrandContextInput;
  }
): BrandProfileAnalysis {
  const source = isRecord(raw) ? raw : {};
  const cadenceRaw = isRecord(source.cadence) ? source.cadence : {};

  const inferredName = opts.analysisType === 'linkedin' && opts.linkedinUrl
    ? inferBrandNameFromLinkedInUrl(opts.linkedinUrl)
    : null;

  const aiExtractedName = asString(source.brand_name) || asString(source.company_name);
  const inferredTrimmed = inferredName ? trimSafeCompanySuffix(inferredName) : null;
  const contextName = opts.brandContext?.name && opts.brandContext.name !== 'My Brand'
    ? opts.brandContext.name
    : null;
  const existingBrandName =
    opts.existingBrandName && opts.existingBrandName !== 'My Brand'
      ? opts.existingBrandName
      : contextName;

  // For LinkedIn analyses, prefer precise display-like naming:
  // 1) if AI extracted a shorter clean name and URL slug just appends a safe suffix,
  //    use AI name (e.g. "Zaincom" vs "zaincomsolutions")
  // 2) otherwise use trimmed slug name first, then AI, then existing.
  const extractedName =
    opts.analysisType === 'linkedin'
      ? (() => {
          if (aiExtractedName && inferredName) {
            const aiCompact = normalizeCompact(aiExtractedName);
            const inferredCompact = normalizeCompact(inferredName);
            if (
              aiCompact.length >= 4 &&
              inferredCompact.startsWith(aiCompact) &&
              looksLikeSafeSuffix(inferredCompact.slice(aiCompact.length))
            ) {
              return aiExtractedName;
            }
          }
          return inferredTrimmed || aiExtractedName || existingBrandName;
        })()
      : aiExtractedName || inferredTrimmed || existingBrandName;

  return {
    tone: asString(source.tone) || 'professional',
    primary_colors: normalizeColorList(source.primary_colors, ['#0A66C2', '#0F172A', '#22D3EE']),
    accent_colors: normalizeColorList(source.accent_colors, ['#22D3EE', '#38BDF8']),
    image_style: asString(source.image_style) || 'clean-minimal',
    post_types: asStringArray(source.post_types).slice(0, 8),
    content_pillars: asStringArray(source.content_pillars).slice(0, 8),
    products:
      asStringArray(source.products).slice(0, 10).length > 0
        ? asStringArray(source.products).slice(0, 10)
        : (opts.brandContext?.products || []).slice(0, 10),
    business_focus: asString(source.business_focus),
    target_audience: asString(source.target_audience) || opts.brandContext?.targetAudience || null,
    key_offerings:
      asStringArray(source.key_offerings).slice(0, 10).length > 0
        ? asStringArray(source.key_offerings).slice(0, 10)
        : (opts.brandContext?.offerings || []).slice(0, 10),
    industry: asString(source.industry) || opts.brandContext?.industry || null,
    company_size: asString(source.company_size),
    brand_name: extractedName,
    brand_description:
      asString(source.brand_description) ||
      asString(source.description) ||
      opts.brandContext?.description ||
      null,
    tagline: asString(source.tagline),
    website: normalizeWebsite(source.website) || opts.brandContext?.website || null,
    cta_style: asString(source.cta_style) || 'soft',
    visual_density: asString(source.visual_density) || 'medium',
    cadence: {
      frequency: asString(cadenceRaw.frequency),
      best_days: asStringArray(cadenceRaw.best_days).slice(0, 7),
      best_times: asStringArray(cadenceRaw.best_times).slice(0, 8),
    },
    consistency_score: normalizeScore(source.consistency_score),
    evidence: isRecord(source.evidence) ? source.evidence : {},
  };
}

async function syncBrandProfile(
  brandId: string,
  brand: BrandRow,
  analysis: BrandProfileAnalysis
): Promise<{ brandUpdated: boolean; brandKitUpdated: boolean }> {
  const admin = createAdminClient();
  const updateData: Record<string, string> = {};

  if (analysis.brand_name && analysis.brand_name !== brand.name) {
    updateData.name = analysis.brand_name;
  }

  if (analysis.brand_description && analysis.brand_description !== (brand.description || '')) {
    updateData.description = analysis.brand_description;
  }

  if (analysis.industry && analysis.industry !== (brand.industry || '')) {
    updateData.industry = analysis.industry;
  }

  if (analysis.website && analysis.website !== (brand.website || '')) {
    updateData.website = analysis.website;
  }

  let brandUpdated = false;
  if (Object.keys(updateData).length > 0) {
    const { error: updateBrandError } = await admin
      .from('brands')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', brandId);

    if (updateBrandError) {
      console.error('Failed to sync extracted brand profile:', updateBrandError);
    } else {
      brandUpdated = true;
    }
  }

  let brandKitUpdated = false;
  if (analysis.brand_name) {
    const { error: updateKitError } = await admin
      .from('brand_kits')
      .update({ brand_name: analysis.brand_name, updated_at: new Date().toISOString() })
      .eq('brand_id', brandId);

    if (updateKitError) {
      console.error('Failed to sync brand name into brand kit:', updateKitError);
    } else {
      brandKitUpdated = true;
    }
  }

  return { brandUpdated, brandKitUpdated };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const brandId = typeof body.brandId === 'string' ? body.brandId : '';
    const linkedinUrl = typeof body.linkedinUrl === 'string' ? body.linkedinUrl : '';
    const manualBrief = typeof body.manualBrief === 'string' ? body.manualBrief : '';
    const analysisType = body.analysisType === 'linkedin' ? 'linkedin' : body.analysisType === 'manual' ? 'manual' : null;
    const rawBrandContext = isRecord(body.brandContext) ? body.brandContext : {};
    const brandContext: BrandContextInput = {
      name: asString(rawBrandContext.name),
      description: asString(rawBrandContext.description),
      industry: asString(rawBrandContext.industry),
      website: normalizeWebsite(rawBrandContext.website),
      products: asStringArray(rawBrandContext.products).slice(0, 12),
      offerings: asStringArray(rawBrandContext.offerings).slice(0, 12),
      targetAudience: asString(rawBrandContext.targetAudience),
    };

    if (!brandId) {
      return NextResponse.json({ error: 'Brand ID required' }, { status: 400 });
    }

    if (!analysisType) {
      return NextResponse.json({ error: 'Invalid analysis type' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const devUserId = process.env.DEV_USER_ID?.trim();
    const allowDevFallback = process.env.NODE_ENV !== 'production' && Boolean(devUserId);
    const actingUserId = user?.id || (allowDevFallback ? devUserId : undefined);

    if (!actingUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: brand, error: brandError } = await admin
      .from('brands')
      .select('id, name, description, industry, website, owner_user_id')
      .eq('id', brandId)
      .eq('owner_user_id', actingUserId)
      .maybeSingle<BrandRow>();

    if (brandError) throw brandError;

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found or access denied' }, { status: 403 });
    }

    let rawAnalysis: unknown;

    if (analysisType === 'linkedin') {
      if (!linkedinUrl) {
        return NextResponse.json({ error: 'LinkedIn URL is required' }, { status: 400 });
      }
      rawAnalysis = await analyzeLinkedInProfile(linkedinUrl, brandContext);
    } else {
      if (!manualBrief) {
        return NextResponse.json({ error: 'Brand brief is required' }, { status: 400 });
      }
      rawAnalysis = await analyzeManualBrief(manualBrief, brandContext);
    }

    const analysis = normalizeAnalysis(rawAnalysis, {
      analysisType,
      linkedinUrl,
      existingBrandName: brand.name,
      brandContext,
    });

    const { data: marketingDna, error: dnaError } = await admin
      .from('marketing_dna')
      .insert({
        brand_id: brandId,
        source: analysisType === 'linkedin' ? 'linkedin' : 'manual',
        tone: analysis.tone,
        primary_colors: analysis.primary_colors,
        accent_colors: analysis.accent_colors,
        image_style: analysis.image_style,
        post_types: analysis.post_types,
        cta_style: analysis.cta_style,
        visual_density: analysis.visual_density,
        cadence: analysis.cadence,
        consistency_score: analysis.consistency_score,
        evidence: {
          ...analysis.evidence,
          brand_name: analysis.brand_name,
          brand_description: analysis.brand_description,
          tagline: analysis.tagline,
          website: analysis.website,
          products: analysis.products,
          business_focus: analysis.business_focus,
          target_audience: analysis.target_audience,
          key_offerings: analysis.key_offerings,
          industry: analysis.industry,
          company_size: analysis.company_size,
          content_pillars: analysis.content_pillars,
        },
        created_by: actingUserId,
      })
      .select()
      .single();

    if (dnaError) throw dnaError;

    const profileSync = await syncBrandProfile(brandId, brand, analysis);

    return NextResponse.json({
      marketingDna,
      analysis,
      profileSync,
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error analyzing marketing DNA:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function analyzeLinkedInProfile(linkedinUrl: string, brandContext: BrandContextInput): Promise<JsonObject> {
  const contextHint = [
    brandContext.name ? `Known brand name: ${brandContext.name}` : null,
    brandContext.description ? `Known description: ${brandContext.description}` : null,
    brandContext.industry ? `Known industry: ${brandContext.industry}` : null,
    brandContext.targetAudience ? `Known target audience: ${brandContext.targetAudience}` : null,
    brandContext.products.length ? `Known products: ${brandContext.products.join(', ')}` : null,
    brandContext.offerings.length ? `Known offerings: ${brandContext.offerings.join(', ')}` : null,
    brandContext.website ? `Known website: ${brandContext.website}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an elite LinkedIn brand strategist and marketing analyst with 15+ years of experience.

Your job is to analyze a LinkedIn profile or company page URL and extract a comprehensive brand DNA profile. Even if you cannot access the actual page content, use the URL structure (company slug, industry indicators) combined with your training data to provide the BEST POSSIBLE analysis.

For company pages: Infer products, audience, industry, and typical content strategy.
For personal profiles: Infer their professional focus, thought leadership style, and content patterns.
Brand-name precision rule:
- Prefer the public display name of the profile/company when known.
- Use URL slug only as a fallback hint, not as a hard source of truth.
- Never invent or append suffixes (Solutions, Inc, Group, Company, etc.) unless clearly present in the actual display name.
- If slug appears to be a packed token with a generic suffix (e.g. "...solutions"), extract the clean base name.

Be specific and actionable — not generic. Every field should be tailored to THIS specific brand/person.

Return ONLY a JSON object with this structure:
{
  "brand_name": "Official brand or person name",
  "brand_description": "Concise 1-2 sentence summary of what they do and their value proposition",
  "tagline": "A compelling brand tagline (create one if not obvious)",
  "website": "https://example.com or null",
  "tone": "professional-founder" | "corporate" | "casual" | "sales-oriented" | "thought-leader" | "educational",
  "primary_colors": ["#hex1", "#hex2", "#hex3"],
  "accent_colors": ["#hex1", "#hex2"],
  "image_style": "clean-minimal" | "bold-colorful" | "professional-corporate" | "tech-modern" | "warm-human",
  "post_types": ["thought_leadership", "hiring", "product", "announcement", "personal", "case_study", "tips"],
  "content_pillars": ["topic 1", "topic 2", "topic 3", "topic 4"],
  "products": ["Product/Service 1", "Product/Service 2"],
  "business_focus": "Primary business focus in 1 sentence",
  "target_audience": "Specific audience description",
  "key_offerings": ["Offering 1", "Offering 2", "Offering 3"],
  "industry": "Specific industry name",
  "company_size": "Size estimate",
  "cta_style": "soft" | "direct" | "none",
  "visual_density": "low" | "medium" | "high",
  "cadence": { "frequency": "daily|weekly|biweekly", "best_days": ["Tuesday", "Thursday"], "best_times": ["9am", "12pm"] },
  "consistency_score": 85,
  "evidence": { "analysis_confidence": "high|medium|low", "source": "linkedin_url" }
}`,
      },
      {
        role: 'user',
        content: `Analyze this LinkedIn presence: ${linkedinUrl}

Known context to use when available:
${contextHint || 'No additional context provided.'}

Provide a thorough, specific brand DNA extraction. Be as detailed and accurate as possible. If it's a company, analyze their business model, products, and market positioning. If it's a person, analyze their expertise, thought leadership topics, and professional brand.`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0].message.content || '{}') as unknown;
  return isRecord(parsed) ? parsed : {};
}

async function analyzeManualBrief(brief: string, brandContext: BrandContextInput): Promise<JsonObject> {
  const contextHint = [
    brandContext.name ? `Known brand name: ${brandContext.name}` : null,
    brandContext.description ? `Known description: ${brandContext.description}` : null,
    brandContext.industry ? `Known industry: ${brandContext.industry}` : null,
    brandContext.targetAudience ? `Known target audience: ${brandContext.targetAudience}` : null,
    brandContext.products.length ? `Known products: ${brandContext.products.join(', ')}` : null,
    brandContext.offerings.length ? `Known offerings: ${brandContext.offerings.join(', ')}` : null,
    brandContext.website ? `Known website: ${brandContext.website}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a brand strategist and growth marketer.

Return ONLY a JSON object with this structure:
{
  "brand_name": "Brand name",
  "brand_description": "One to two sentence summary",
  "tagline": "Optional short tagline",
  "website": "https://example.com or null",
  "tone": "professional-founder" | "corporate" | "casual" | "sales-oriented",
  "primary_colors": ["#1E40AF", "#3B82F6", "#60A5FA"],
  "accent_colors": ["#F59E0B", "#10B981"],
  "image_style": "clean-minimal" | "bold-colorful" | "professional-corporate",
  "post_types": ["thought_leadership", "hiring", "product", "announcement", "personal"],
  "content_pillars": ["topic 1", "topic 2", "topic 3"],
  "products": ["Main Product 1", "Main Product 2"],
  "business_focus": "Primary business focus",
  "target_audience": "Target customer profile",
  "key_offerings": ["Service 1", "Service 2", "Service 3"],
  "industry": "Industry name",
  "company_size": "Estimated size",
  "cta_style": "soft" | "direct" | "none",
  "visual_density": "low" | "medium" | "high",
  "cadence": { "frequency": "weekly", "best_days": ["Tuesday"], "best_times": ["10am"] },
  "consistency_score": 90,
  "evidence": { "source": "brand_brief" }
}`,
      },
      {
        role: 'user',
        content: `Extract a complete brand profile from this brief:

${brief}

Known context:
${contextHint || 'No additional context provided.'}

Must include: brand name, description, positioning, products/services, audience, industry, and LinkedIn content DNA.`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0].message.content || '{}') as unknown;
  return isRecord(parsed) ? parsed : {};
}

