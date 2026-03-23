const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export function getClientAuthRedirectOrigin() {
  const localFallback =
    process.env.NEXT_PUBLIC_LOCAL_APP_URL?.trim() || 'http://localhost:3000';

  if (typeof window === 'undefined') {
    return localFallback;
  }

  try {
    const current = new URL(window.location.origin);
    if (LOCAL_HOSTS.has(current.hostname)) {
      return localFallback;
    }
    return current.origin;
  } catch {
    return localFallback;
  }
}
