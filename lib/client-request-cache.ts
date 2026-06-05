import {
  getServerDataVersion,
  serverDataStaleEvent,
} from "@/lib/client-cache-invalidation";

const defaultClientJsonCacheTtlMs = 2 * 60 * 1000;

type CacheEntry = {
  data: unknown;
  expiresAt: number;
  serverDataVersion: number;
};

type FetchJsonOptions = {
  signal?: AbortSignal;
  ttlMs?: number;
  cacheKey?: string;
  errorMessage?: string;
};

const jsonCache = new Map<string, CacheEntry>();
let cacheInvalidationListenerRegistered = false;

function registerCacheInvalidationListener() {
  if (cacheInvalidationListenerRegistered || typeof window === "undefined") {
    return;
  }

  cacheInvalidationListenerRegistered = true;
  window.addEventListener(serverDataStaleEvent, () => {
    jsonCache.clear();
  });
}

function cachedJson<T>(cacheKey: string) {
  const cached = jsonCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (
    cached.expiresAt <= Date.now() ||
    cached.serverDataVersion !== getServerDataVersion()
  ) {
    jsonCache.delete(cacheKey);
    return null;
  }

  return cached.data as T;
}

export async function fetchJsonWithClientCache<T>(
  url: string,
  {
    signal,
    ttlMs = defaultClientJsonCacheTtlMs,
    cacheKey = url,
    errorMessage = "Unable to load data.",
  }: FetchJsonOptions = {},
) {
  registerCacheInvalidationListener();

  const cached = cachedJson<T>(cacheKey);

  if (cached) {
    return cached;
  }

  const response = await fetch(url, { signal });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: unknown;
  };

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : errorMessage,
    );
  }

  jsonCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
    serverDataVersion: getServerDataVersion(),
  });

  return data;
}

export function writeClientJsonCache<T>(
  cacheKey: string,
  data: T,
  ttlMs = defaultClientJsonCacheTtlMs,
) {
  registerCacheInvalidationListener();

  jsonCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
    serverDataVersion: getServerDataVersion(),
  });
}
