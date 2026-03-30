import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Edge Runtime-compatible constant-time string comparison (no Node.js crypto needed)
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Public routes — no auth required
// ---------------------------------------------------------------------------
const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/pricing',
  '/demo',
  '/terms',
  '/privacy',
  '/cookies',
  '/refund',
  '/acceptable-use',
  '/data-protection',
  '/disclaimer',
]);

const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/linkedin/callback',
  '/api/meta/callback',
  '/api/cron/',
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// In-memory rate limiter (per IP + route)
// ---------------------------------------------------------------------------
type RateBucket = { count: number; resetAt: number };
const rateLimitStore = new Map<string, RateBucket>();

let lastCleanup = Date.now();
function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, bucket] of rateLimitStore) {
    if (bucket.resetAt < now) rateLimitStore.delete(key);
  }
}

const RATE_LIMITS: Record<string, [number, number]> = {
  '/api/pro/image/create': [60_000, 6],
  '/api/pro/image/base': [60_000, 8],
  '/api/pro/image/generate-base': [60_000, 8],
  '/api/pro/image/multi-variant': [60_000, 3],
  '/api/pro/image/edit': [60_000, 6],
  '/api/pro/image/edit-direct': [60_000, 6],
  '/api/pro/image/remove-background': [60_000, 10],
  '/api/pro/image/asset/generate': [60_000, 10],
  '/api/generate': [60_000, 10],
  '/api/generate-options': [60_000, 10],
  '/api/pro/post-options': [60_000, 10],
  '/api/pro/marketing-dna': [60_000, 5],
  '/api/pro/brand-intake': [60_000, 5],
  '/api/pro/carousel': [60_000, 5],
  '/api/pro/repurpose': [60_000, 10],
  '/api/pro/ab-test': [60_000, 5],
  '/api/chatbot/chat': [60_000, 20],
};

function findRateLimit(pathname: string): [number, number] | null {
  if (RATE_LIMITS[pathname]) return RATE_LIMITS[pathname];
  for (const [route, limit] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(route + '/')) return limit;
  }
  return null;
}

function checkRateLimit(request: NextRequest, pathname: string): NextResponse | null {
  const limit = findRateLimit(pathname);
  if (!limit) return null;

  cleanupStaleEntries();

  const [windowMs, maxRequests] = limit;
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const key = `${ip}:${pathname}`;
  const now = Date.now();

  const bucket = rateLimitStore.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count++;
  if (bucket.count > maxRequests) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.', retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(bucket.resetAt / 1000)),
        },
      }
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main proxy handler
// ---------------------------------------------------------------------------
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Only protect /app/* and /api/* routes
  const isProtected = pathname.startsWith('/app') || pathname.startsWith('/api/');
  if (!isProtected) {
    return NextResponse.next();
  }

  // Rate limiting for expensive API routes
  if (pathname.startsWith('/api/')) {
    const rateLimitResult = checkRateLimit(request, pathname);
    if (rateLimitResult) return rateLimitResult;
  }

  // Auth check via Supabase session cookie
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // API routes return 401 (allow cron with secret header)
    if (pathname.startsWith('/api/')) {
      const cronSecret = process.env.CRON_SECRET?.trim();
      const cronHeader = request.headers.get('x-cron-secret')?.trim();
      if (cronSecret && cronHeader && timingSafeStringEqual(cronHeader, cronSecret)) {
        return response;
      }
      return NextResponse.json(
        { error: 'Unauthorized. Sign in to continue.' },
        { status: 401 }
      );
    }

    // Dashboard routes redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
