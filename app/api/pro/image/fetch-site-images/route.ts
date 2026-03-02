import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

const inputSchema = z.object({
  url: z.string().url(),
});

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ALLOWED_PORTS = new Set(['80', '443', '']);

type CandidateImage = {
  url: string;
  source: 'og' | 'img';
  width: number | null;
  height: number | null;
  area: number;
};

const DISCOVERY_FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(lower)) return true;
  if (lower.endsWith('.local')) return true;
  if (lower.endsWith('.localhost') || lower.endsWith('.internal')) return true;
  if (lower.startsWith('10.') || lower.startsWith('192.168.') || lower.startsWith('169.254.')) return true;
  if (lower.startsWith('172.')) {
    const second = Number(lower.split('.')[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (isIP(lower) === 6) {
    return (
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    );
  }
  return false;
}

async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  try {
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    if (!Array.isArray(resolved) || resolved.length === 0) return true;
    return resolved.some((entry) => isPrivateHost(entry.address));
  } catch {
    return true;
  }
}

async function isBlockedUrl(url: URL): Promise<boolean> {
  if (!['http:', 'https:'].includes(url.protocol)) return true;
  if (!ALLOWED_PORTS.has(url.port)) return true;
  if (isPrivateHost(url.hostname)) return true;
  return resolvesToPrivateAddress(url.hostname);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attrRegex = /([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tag)) !== null) {
    const key = match[1].toLowerCase();
    const value = decodeEntities((match[3] || match[4] || match[5] || '').trim());
    if (value) attributes[key] = value;
  }
  return attributes;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[^\d]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function resolveCandidateUrl(src: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(src, baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!ALLOWED_PORTS.has(parsed.port)) return null;
    if (isPrivateHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function pickLargestFromSrcSet(srcset: string): string | null {
  const entries = srcset
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, descriptor] = entry.split(/\s+/);
      const widthMatch = descriptor?.match(/^(\d+)w$/i);
      const densityMatch = descriptor?.match(/^(\d+(?:\.\d+)?)x$/i);
      const score = widthMatch
        ? Number(widthMatch[1])
        : densityMatch
        ? Number(densityMatch[1]) * 1000
        : 0;
      return { url, score };
    })
    .filter((entry) => Boolean(entry.url));

  if (entries.length === 0) return null;
  entries.sort((a, b) => b.score - a.score);
  return entries[0].url;
}

function dedupeCandidates(candidates: CandidateImage[]): CandidateImage[] {
  const map = new Map<string, CandidateImage>();
  for (const candidate of candidates) {
    const key = candidate.url.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, candidate);
      continue;
    }

    // Prefer OG over IMG and prefer larger dimensions when duplicated.
    const keepCurrent =
      candidate.source === 'og' && existing.source !== 'og'
        ? true
        : candidate.source === existing.source && candidate.area > existing.area;

    if (keepCurrent) {
      map.set(key, candidate);
    }
  }
  return Array.from(map.values());
}

function isLikelyTrackingAsset(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('px.ads.linkedin.com/collect') ||
    lower.includes('/collect?') ||
    lower.includes('/pixel') ||
    lower.includes('doubleclick') ||
    lower.includes('googletagmanager') ||
    lower.includes('google-analytics') ||
    lower.includes('facebook.com/tr') ||
    lower.includes('tracking')
  );
}

function candidatePriorityScore(candidate: CandidateImage): number {
  const lower = candidate.url.toLowerCase();
  let score = candidate.source === 'og' ? 1200 : 800;
  score += Math.min(candidate.area / 4000, 900);

  if (candidate.width && candidate.height) {
    const minEdge = Math.min(candidate.width, candidate.height);
    if (minEdge >= 320) score += 180;
    else if (minEdge < 96) score -= 250;
  }

  if (isLikelyTrackingAsset(candidate.url)) score -= 2000;
  if (/(favicon|sprite|placeholder|spacer)/.test(lower)) score -= 500;
  if (/(hero|banner|cover|product|home)/.test(lower)) score += 150;

  return score;
}

function rankCandidates(candidates: CandidateImage[]): CandidateImage[] {
  return [...candidates].sort((a, b) => {
    return candidatePriorityScore(b) - candidatePriorityScore(a);
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = inputSchema.parse(body);

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

    const pageUrl = new URL(input.url);
    if (!['http:', 'https:'].includes(pageUrl.protocol)) {
      return NextResponse.json({ error: 'Only http/https URLs are allowed.' }, { status: 400 });
    }
    if (await isBlockedUrl(pageUrl)) {
      return NextResponse.json({ error: 'Private or local URLs are not allowed.' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(pageUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': DISCOVERY_FETCH_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    try {
      const resolvedUrl = new URL(response.url || pageUrl.toString());
      if (await isBlockedUrl(resolvedUrl)) {
        return NextResponse.json({ error: 'Resolved URL is not allowed.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Unable to validate resolved URL.' }, { status: 400 });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ error: 'URL must point to an HTML webpage.' }, { status: 400 });
    }

    const resolvedPageUrl = response.url || pageUrl.toString();
    const html = (await response.text()).slice(0, 500_000);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;

    const candidates: CandidateImage[] = [];

    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    for (const tag of metaTags) {
      const attrs = parseTagAttributes(tag);
      const key = (attrs.property || attrs.name || '').toLowerCase();
      const isOgImage = ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(
        key
      );
      if (!isOgImage) continue;

      const content = attrs.content || '';
      const resolved = resolveCandidateUrl(content, resolvedPageUrl);
      if (!resolved) continue;

      const width = parsePositiveInt(attrs['og:image:width']) || null;
      const height = parsePositiveInt(attrs['og:image:height']) || null;
      const area = width && height ? width * height : 0;

      candidates.push({
        url: resolved,
        source: 'og',
        width,
        height,
        area,
      });
    }

    const imgTags = html.match(/<img\b[^>]*>/gi) || [];
    for (const tag of imgTags) {
      const attrs = parseTagAttributes(tag);
      const srcsetCandidate = attrs.srcset ? pickLargestFromSrcSet(attrs.srcset) : null;
      const source =
        attrs.src ||
        attrs['data-src'] ||
        attrs['data-original'] ||
        attrs['data-lazy-src'] ||
        srcsetCandidate ||
        '';

      if (!source || source.startsWith('data:')) continue;
      const resolved = resolveCandidateUrl(source, resolvedPageUrl);
      if (!resolved) continue;

      const width = parsePositiveInt(attrs.width);
      const height = parsePositiveInt(attrs.height);
      const area = width && height ? width * height : 0;

      candidates.push({
        url: resolved,
        source: 'img',
        width,
        height,
        area,
      });
    }

    const ranked = rankCandidates(dedupeCandidates(candidates))
      .filter((candidate) => !isLikelyTrackingAsset(candidate.url))
      .slice(0, 20);

    if (ranked.length === 0) {
      return NextResponse.json({ error: 'No candidate images were found on that page.' }, { status: 404 });
    }

    return NextResponse.json({
      pageUrl: resolvedPageUrl,
      pageTitle,
      pageStatus: response.status,
      preferred: ranked[0]?.url || null,
      candidates: ranked.map((candidate) => ({
        url: candidate.url,
        source: candidate.source,
        width: candidate.width,
        height: candidate.height,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
