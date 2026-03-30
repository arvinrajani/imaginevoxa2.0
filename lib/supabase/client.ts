import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, AuthSession } from "@supabase/supabase-js";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;
type BrowserSupabaseAuth = BrowserSupabaseClient["auth"] & {
  __staleSessionRecoveryPatched?: boolean;
  initializePromise?: Promise<unknown> | null;
};
type BrowserSupabaseGetSessionArgs = Parameters<BrowserSupabaseClient["auth"]["getSession"]>;
type BrowserSupabaseGetUserArgs = Parameters<BrowserSupabaseClient["auth"]["getUser"]>;
type BrowserSupabaseOnAuthStateChangeCallback = (
  event: AuthChangeEvent,
  session: AuthSession | null,
) => void | Promise<void>;
type BrowserSupabaseOnAuthStateChangeArgs = [BrowserSupabaseOnAuthStateChangeCallback];
type BrowserSupabaseOnAuthStateChangeCallbackArgs = Parameters<BrowserSupabaseOnAuthStateChangeCallback>;
type BrowserSupabaseSignOutArgs = Parameters<BrowserSupabaseClient["auth"]["signOut"]>;
type BrowserSupabaseSignOutOptions = BrowserSupabaseSignOutArgs[0];

let browserClient: BrowserSupabaseClient | null = null;
let pendingLocalRecovery: Promise<boolean> | null = null;
let staleSessionConsoleSuppressions = 0;
let originalConsoleError: typeof console.error | null = null;

function getErrorText(error: unknown): string {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return `${error.name} ${error.message}`.trim();
  }

  if (typeof error === "object") {
    const values = Object.values(error as Record<string, unknown>)
      .filter((value) => typeof value === "string")
      .join(" ");

    if (values) {
      return values;
    }
  }

  return String(error);
}

function isStaleRefreshTokenError(error: unknown): boolean {
  const errorText = getErrorText(error).toLowerCase();

  return (
    errorText.includes("refresh token") &&
    (
      errorText.includes("invalid") ||
      errorText.includes("not valid") ||
      errorText.includes("not found") ||
      errorText.includes("expired")
    )
  );
}

function beginStaleSessionConsoleSuppression() {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (staleSessionConsoleSuppressions === 0) {
    originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (args.some((arg) => isStaleRefreshTokenError(arg))) {
        return;
      }

      originalConsoleError?.(...args);
    };
  }

  staleSessionConsoleSuppressions += 1;

  let restored = false;

  return () => {
    if (restored) {
      return;
    }

    restored = true;
    staleSessionConsoleSuppressions = Math.max(0, staleSessionConsoleSuppressions - 1);

    if (staleSessionConsoleSuppressions === 0 && originalConsoleError) {
      console.error = originalConsoleError;
      originalConsoleError = null;
    }
  };
}

async function recoverBrowserSession(client: BrowserSupabaseClient): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  if (pendingLocalRecovery) {
    return pendingLocalRecovery;
  }

  pendingLocalRecovery = (async () => {
    const { error } = await client.auth.signOut({ scope: "local" });
    return !error || isStaleRefreshTokenError(error);
  })();

  try {
    return await pendingLocalRecovery;
  } finally {
    pendingLocalRecovery = null;
  }
}

function suppressInitialStaleSessionError(client: BrowserSupabaseClient) {
  const auth = client.auth as BrowserSupabaseAuth;
  const initializePromise = auth.initializePromise;
  const restore = beginStaleSessionConsoleSuppression();

  if (!initializePromise) {
    restore();
    return;
  }

  void initializePromise.finally(restore);
}

function patchBrowserAuth(client: BrowserSupabaseClient) {
  const auth = client.auth as BrowserSupabaseAuth;

  if (auth.__staleSessionRecoveryPatched) {
    return client;
  }

  auth.__staleSessionRecoveryPatched = true;

  const originalGetSession = auth.getSession.bind(auth);
  auth.getSession = async (...args: BrowserSupabaseGetSessionArgs) => {
    const result = await originalGetSession(...args);

    if (!result.error || !isStaleRefreshTokenError(result.error)) {
      return result;
    }

    const recovered = await recoverBrowserSession(client);
    return recovered ? originalGetSession(...args) : result;
  };

  const originalGetUser = auth.getUser.bind(auth);
  auth.getUser = async (...args: BrowserSupabaseGetUserArgs) => {
    const result = await originalGetUser(...args);

    if (!result.error || !isStaleRefreshTokenError(result.error)) {
      return result;
    }

    const recovered = await recoverBrowserSession(client);
    return recovered ? originalGetUser(...args) : result;
  };

  const originalOnAuthStateChange = auth.onAuthStateChange.bind(auth);
  auth.onAuthStateChange = (...args: BrowserSupabaseOnAuthStateChangeArgs) => {
    const restore = beginStaleSessionConsoleSuppression();
    const callback = args[0] as BrowserSupabaseOnAuthStateChangeCallback;
    const fallbackTimer = window.setTimeout(restore, 2000);

    const wrappedCallback: BrowserSupabaseOnAuthStateChangeCallback = async (
      ...callbackArgs: BrowserSupabaseOnAuthStateChangeCallbackArgs
    ) => {
      try {
        return await callback(...callbackArgs);
      } finally {
        if (callbackArgs[0] === "INITIAL_SESSION") {
          queueMicrotask(() => {
            window.clearTimeout(fallbackTimer);
            restore();
          });
        }
      }
    };

    const result = originalOnAuthStateChange(wrappedCallback);
    const originalUnsubscribe = result.data.subscription.unsubscribe.bind(result.data.subscription);

    result.data.subscription.unsubscribe = () => {
      window.clearTimeout(fallbackTimer);
      restore();
      originalUnsubscribe();
    };

    return result;
  };

  const originalSignOut = auth.signOut.bind(auth);
  auth.signOut = async (...args: BrowserSupabaseSignOutArgs) => {
    const result = await originalSignOut(...args);
    const options = args[0];
    const requestedLocalScope =
      typeof options === "object" &&
      options !== null &&
      "scope" in options &&
      options.scope === "local";

    if (
      !result.error ||
      requestedLocalScope ||
      !isStaleRefreshTokenError(result.error)
    ) {
      return result;
    }

    const localOptions: NonNullable<BrowserSupabaseSignOutOptions> = {
      ...(typeof options === "object" && options !== null ? options : {}),
      scope: "local",
    };

    return originalSignOut(localOptions);
  };

  return client;
}

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("Missing Supabase env vars.");
  }

  browserClient = patchBrowserAuth(createBrowserClient(url, anonKey));
  suppressInitialStaleSessionError(browserClient);

  return browserClient;
}
