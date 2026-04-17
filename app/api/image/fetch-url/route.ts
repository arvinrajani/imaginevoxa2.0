import { NextResponse } from 'next/server';

export const maxDuration = 15;

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const TIMEOUT_MS = 10_000;

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

  // Security: only allow HTTPS
  if (!url.startsWith('https://')) {
    return NextResponse.json(
      { error: 'Only HTTPS URLs are allowed' },
      { status: 400 },
    );
  }

  // Validate URL format
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Block private/local IPs (SSRF protection)
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
        'User-Agent': 'Mozilla/5.0 (compatible; ImageFetcher/1.0)',
        Accept: 'image/*',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: HTTP ${response.status}` },
        { status: 400 },
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'URL does not point to an image' },
        { status: 400 },
      );
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Image exceeds 8MB limit' },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Image exceeds 8MB limit' },
        { status: 413 },
      );
    }

    // Determine mime type from content-type header
    const mime = contentType.split(';')[0].trim() || 'image/png';
    const base64 = buffer.toString('base64');
    const dataUri = `data:${mime};base64,${base64}`;

    return NextResponse.json({ dataUri });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'URL took too long to load' },
        { status: 408 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch image' },
      { status: 500 },
    );
  }
}
