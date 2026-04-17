import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export const maxDuration = 15;

const TIMEOUT_MS = 10_000;

interface FoundImage {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
}

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  if (!url.startsWith('https://')) {
    return NextResponse.json(
      { error: 'Only HTTPS URLs are allowed' },
      { status: 400 },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // SSRF protection
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    return NextResponse.json(
      { error: 'Only HTTPS URLs are allowed' },
      { status: 400 },
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch page: HTTP ${response.status}` },
        { status: 400 },
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const candidates: FoundImage[] = [];

    // Priority 1: og:image meta tag
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      const abs = resolveUrl(ogImage, url);
      if (abs && !seen.has(abs)) {
        seen.add(abs);
        candidates.push({ url: abs, width: null, height: null, alt: 'og:image' });
      }
    }

    // Priority 2: twitter:image
    const twImage =
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[property="twitter:image"]').attr('content');
    if (twImage) {
      const abs = resolveUrl(twImage, url);
      if (abs && !seen.has(abs)) {
        seen.add(abs);
        candidates.push({ url: abs, width: null, height: null, alt: 'twitter:image' });
      }
    }

    // Priority 3: product/hero class imgs
    const productSelectors = [
      'img[class*="product"]',
      'img[class*="hero"]',
      'img[class*="feature"]',
      'img[class*="main"]',
      'img[class*="primary"]',
      'img[class*="banner"]',
      'img[id*="product"]',
      'img[id*="hero"]',
    ];
    for (const sel of productSelectors) {
      $(sel).each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (!src) return;
        const abs = resolveUrl(src, url);
        if (!abs || seen.has(abs)) return;
        if (shouldSkip(abs)) return;
        seen.add(abs);
        candidates.push({
          url: abs,
          width: parseIntOrNull($(el).attr('width')),
          height: parseIntOrNull($(el).attr('height')),
          alt: $(el).attr('alt') || '',
        });
      });
    }

    // Priority 4: all other img tags
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (!src) return;
      const abs = resolveUrl(src, url);
      if (!abs || seen.has(abs)) return;
      if (shouldSkip(abs)) return;

      const w = parseIntOrNull($(el).attr('width'));
      // Skip tiny images (tracking pixels, icons)
      if (w !== null && w < 100) return;

      seen.add(abs);
      candidates.push({
        url: abs,
        width: w,
        height: parseIntOrNull($(el).attr('height')),
        alt: $(el).attr('alt') || '',
      });
    });

    // Sort: images with known large width first
    candidates.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

    // Verify first 8 candidates with HEAD requests
    const verified: FoundImage[] = [];
    const toCheck = candidates.slice(0, 12);
    const results = await Promise.allSettled(
      toCheck.map(async (img) => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 4000);
          const head = await fetch(img.url, {
            method: 'HEAD',
            signal: ctrl.signal,
            redirect: 'follow',
          });
          clearTimeout(t);
          const ct = head.headers.get('content-type') || '';
          if (head.ok && ct.startsWith('image/')) {
            return img;
          }
          return null;
        } catch {
          return null;
        }
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        verified.push(r.value);
        if (verified.length >= 8) break;
      }
    }

    return NextResponse.json({ images: verified });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Page took too long to load' },
        { status: 408 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to extract images from page' },
      { status: 500 },
    );
  }
}

function resolveUrl(src: string, base: string): string | null {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return null;
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

function shouldSkip(url: string): boolean {
  const lower = url.toLowerCase();
  // Skip SVGs, GIFs, tracking pixels, tiny icons
  if (lower.endsWith('.svg') || lower.endsWith('.gif')) return true;
  if (lower.includes('pixel') || lower.includes('tracking')) return true;
  if (lower.includes('favicon')) return true;
  if (lower.includes('1x1') || lower.includes('spacer')) return true;
  return false;
}

function parseIntOrNull(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
}
