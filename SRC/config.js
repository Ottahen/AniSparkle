// Streaming handoff is intentionally configured in one place.
// Miruro is the default. Update a provider's host/searchPath/queryKey here if its public route changes.
export const STREAM_PROVIDERS = Object.freeze({
  miruro: Object.freeze({
    label: "Miruro",
    host: "barelystarted.miruro.tv",
    searchPath: "/search",
    queryKey: "q",
  }),
  hianime: Object.freeze({
    label: "HiAnime",
    host: "hianime.at",
    searchPath: "/search",
    queryKey: "keyword",
  }),
});

export const DEFAULT_PROVIDER = "miruro";
export const ALLOWED_PROVIDER_HOSTS = new Set(
  Object.values(STREAM_PROVIDERS).map((provider) => provider.host),
);

export function providerKeyOrDefault(value) {
  return Object.hasOwn(STREAM_PROVIDERS, value) ? value : DEFAULT_PROVIDER;
}

export function buildSourceSearchUrl(title, providerKey = DEFAULT_PROVIDER) {
  const provider = STREAM_PROVIDERS[providerKeyOrDefault(providerKey)];
  const url = new URL(provider.searchPath, `https://${provider.host}`);
  url.searchParams.set(provider.queryKey, String(title).slice(0, 100));
  if (url.protocol !== "https:" || !ALLOWED_PROVIDER_HOSTS.has(url.hostname)) {
    throw new TypeError("The configured streaming source is not allowed.");
  }
  return url.href;
}

export function validatedProviderWatchUrl(value, providerKey) {
  if (!Object.hasOwn(STREAM_PROVIDERS, providerKey) || typeof value !== "string" || value.length > 2400) return null;
  const provider = STREAM_PROVIDERS[providerKey];
  try {
    const url = new URL(value, `https://${provider.host}`);
    if (url.protocol !== "https:" || url.hostname !== provider.host || url.port || url.username || url.password || url.hash || url.search.length > 500) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "watch" || parts.length < 2 || parts.length > 3) return null;
    if (!parts.every((part) => /^[A-Za-z0-9._~-]{1,180}$/.test(part))) return null;
    return url.href;
  } catch {
    return null;
  }
}
