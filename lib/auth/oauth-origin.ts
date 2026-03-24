const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function normalizeOrigin(origin: string) {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
}

function isLocalOrigin(origin: string) {
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function getRequestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.trim() ||
    request.headers.get("host")?.trim();

  if (forwardedHost) {
    url.host = forwardedHost;
  }

  if (forwardedProto) {
    url.protocol = `${forwardedProto}:`;
  }

  return url.origin;
}

export function resolveOAuthBaseUrl(
  request: Request,
  configuredBaseUrl?: string | null
) {
  const requestOrigin = normalizeOrigin(getRequestOrigin(request));
  const candidate = configuredBaseUrl?.trim()
    ? normalizeOrigin(configuredBaseUrl)
    : null;

  if (!candidate) return requestOrigin;

  const runningProduction =
    process.env.NODE_ENV === "production" && !isLocalOrigin(requestOrigin);

  if (runningProduction && isLocalOrigin(candidate)) {
    return requestOrigin;
  }

  return candidate;
}

export function resolveOAuthRedirectUri(
  request: Request,
  options: {
    fallbackPath?: string | null;
    configuredRedirectUri?: string | null;
    storedRedirectUri?: string | null;
    configuredBaseUrl?: string | null;
  }
) {
  const baseUrl = resolveOAuthBaseUrl(request, options.configuredBaseUrl);
  const fallbackPath = options.fallbackPath?.trim() || "";
  const fallback =
    !fallbackPath || fallbackPath === "/"
      ? baseUrl
      : `${baseUrl}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;
  const candidate =
    options.storedRedirectUri?.trim() || options.configuredRedirectUri?.trim();

  if (!candidate) return fallback;

  try {
    const parsed = new URL(candidate);
    const runningProduction =
      process.env.NODE_ENV === "production" && !isLocalOrigin(baseUrl);

    if (runningProduction && LOCAL_HOSTS.has(parsed.hostname)) {
      return fallback;
    }

    return parsed.toString();
  } catch {
    return fallback;
  }
}
