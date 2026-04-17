import sharp from 'sharp';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 10_000;

const ALLOWED_MIME_PREFIXES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

function truncateUrl(url: string, max = 80): string {
  return url.length > max ? url.slice(0, max) + '…' : url;
}

/**
 * Fetch an image from a URL or decode from a data URI. Returns a raw Buffer or null.
 */
export async function fetchImageBuffer(
  source: string | null | undefined
): Promise<Buffer | null> {
  if (!source || typeof source !== 'string' || !source.trim()) return null;

  try {
    // --- Data URI ---
    if (source.startsWith('data:')) {
      const commaIndex = source.indexOf(',');
      if (commaIndex === -1) {
        console.warn(`[fetch-image] Invalid data URI (no comma): ${truncateUrl(source)}`);
        return null;
      }

      const header = source.slice(0, commaIndex).toLowerCase();
      const isValidMime = ALLOWED_MIME_PREFIXES.some((prefix) => header.includes(prefix));
      if (!isValidMime) {
        console.warn(`[fetch-image] Rejected data URI mime: ${header}`);
        return null;
      }

      const base64 = source.slice(commaIndex + 1);
      const buffer = Buffer.from(base64, 'base64');

      if (buffer.length > MAX_IMAGE_BYTES) {
        console.warn(`[fetch-image] Data URI too large: ${buffer.length} bytes`);
        return null;
      }

      return buffer;
    }

    // --- HTTPS URL ---
    if (source.startsWith('https://')) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(source, {
          signal: controller.signal,
          redirect: 'follow',
        });
        clearTimeout(timer);

        if (!response.ok) {
          console.warn(
            `[fetch-image] HTTP ${response.status} for ${truncateUrl(source)}`
          );
          return null;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          console.warn(
            `[fetch-image] Non-image content-type "${contentType}" for ${truncateUrl(source)}`
          );
          return null;
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
          console.warn(
            `[fetch-image] Content-length ${contentLength} exceeds limit for ${truncateUrl(source)}`
          );
          return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length > MAX_IMAGE_BYTES) {
          console.warn(`[fetch-image] Downloaded ${buffer.length} bytes exceeds limit`);
          return null;
        }

        return buffer;
      } finally {
        clearTimeout(timer);
      }
    }

    console.warn(`[fetch-image] Unsupported source scheme: ${truncateUrl(source)}`);
    return null;
  } catch (error) {
    console.error(
      `[fetch-image] Failed for ${truncateUrl(source)}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Fetch an image and resize it to the specified dimensions with Sharp.
 */
export async function fetchAndResizeBuffer(
  source: string | null | undefined,
  width: number,
  height: number,
  fit: 'contain' | 'cover' | 'inside' = 'contain'
): Promise<Buffer | null> {
  const raw = await fetchImageBuffer(source);
  if (!raw) return null;

  try {
    const w = Math.round(width);
    const h = Math.round(height);

    const resizeOptions: sharp.ResizeOptions = {
      width: w,
      height: h,
      fit,
    };

    if (fit === 'contain') {
      resizeOptions.background = { r: 0, g: 0, b: 0, alpha: 0 };
    }

    if (fit === 'inside') {
      resizeOptions.withoutEnlargement = true;
    }

    return await sharp(raw).resize(resizeOptions).png().toBuffer();
  } catch (error) {
    console.error(
      `[fetch-image] Resize failed for ${truncateUrl(source || '')}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
