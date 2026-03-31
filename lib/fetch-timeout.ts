/**
 * Fetch wrapper with timeout to prevent hanging on external APIs.
 * Default timeout: 25 seconds (leaves headroom within Vercel's 60s maxDuration).
 */
export function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit,
  timeoutMs = 25000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

/**
 * Safely parse a Response as JSON, returning null on parse failure
 * instead of throwing a SyntaxError.
 */
export async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    console.warn(`[safeJson] Failed to parse JSON from ${response.url} (status ${response.status})`);
    return null;
  }
}
