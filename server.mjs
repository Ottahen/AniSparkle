import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STREAM_PROVIDERS } from "./src/config.js";
import { normalizeMatchTitle, resolveProviderWatchUrl } from "./src/provider-resolver.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIST = path.join(ROOT, "dist");
const MAX_REQUEST_URL_LENGTH = 4096;
const MAX_CACHE_ENTRIES = 300;
const POSITIVE_CACHE_TTL = 4 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL = 60 * 1000;
const LOOKUP_LIMIT_PER_MINUTE = 60;
const MAX_CONCURRENT_LOOKUPS = 4;
const MAX_PROVIDER_HTML_BYTES = 1_500_000;
const UPSTREAM_TIMEOUT_MS = 7000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
});

function addSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(response, status, payload) {
  addSecurityHeaders(response);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function validProviderPageRoute(url, providerKey, stage) {
  const provider = STREAM_PROVIDERS[providerKey];
  if (!provider || url.protocol !== "https:" || url.hostname !== provider.host || url.port || url.username || url.password || url.hash) return false;
  if (stage === "search") return url.pathname === provider.searchPath && url.search.length <= 512;
  if (stage === "info" && providerKey === "miruro") {
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length === 3 && parts[0] === "info" && parts.slice(1).every((part) => /^[A-Za-z0-9._~-]{1,180}$/.test(part)) && url.search.length <= 250;
  }
  return false;
}

async function readHtmlBounded(response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_HTML_BYTES) {
    await response.body?.cancel();
    throw new Error("The provider page exceeded the response limit.");
  }
  if (!response.body) throw new Error("The provider returned an empty page.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROVIDER_HTML_BYTES) {
        await reader.cancel();
        throw new Error("The provider page exceeded the response limit.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

async function fetchProviderHtml(urlValue, { providerKey, stage }) {
  let currentUrl = new URL(urlValue);
  if (!validProviderPageRoute(currentUrl, providerKey, stage)) throw new Error("The provider page is outside the allowlist.");
  let response;
  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    response = await fetch(currentUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.8",
        "User-Agent": "AniSparkle-LinkResolver/1.0 (+https://github.com/Ottahen)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!REDIRECT_STATUSES.has(response.status)) break;
    if (redirectCount === 2) throw new Error("The provider redirected too many times.");
    const location = response.headers.get("location");
    if (!location) throw new Error("The provider redirect was incomplete.");
    const nextUrl = new URL(location, currentUrl);
    if (!validProviderPageRoute(nextUrl, providerKey, stage) || nextUrl.origin !== currentUrl.origin) {
      throw new Error("The provider redirected outside the allowed public page route.");
    }
    currentUrl = nextUrl;
  }
  if (!response || response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.headers.get("content-type") || "")) {
    throw new Error("The provider search page is unavailable.");
  }
  return readHtmlBounded(response);
}

function parseRequestUrl(request) {
  if (typeof request.url !== "string" || request.url.length > MAX_REQUEST_URL_LENGTH || !request.url.startsWith("/") || request.url.startsWith("//") || request.url.includes("\\")) return null;
  try {
    return new URL(request.url, "http://localhost");
  } catch {
    return null;
  }
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function serveStatic(request, response, url, distRoot) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    sendJson(response, 400, { error: "invalid_path" });
    return;
  }
  if (decodedPath.includes("\0") || decodedPath.includes("\\")) {
    sendJson(response, 400, { error: "invalid_path" });
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(distRoot, relativePath);
  if (!filePath.startsWith(`${path.resolve(distRoot)}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  let stats;
  try { stats = statSync(filePath); } catch { stats = null; }
  if (!stats?.isFile()) {
    response.writeHead(404, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  addSecurityHeaders(response);
  response.writeHead(200, {
    "Cache-Control": filePath.endsWith(".html") ? "no-cache, no-store, must-revalidate" : "public, max-age=3600",
    "Content-Length": stats.size,
    "Content-Type": contentTypeFor(filePath),
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}

export function createAniSparkleServer({ distRoot = DEFAULT_DIST, fetchHtml = fetchProviderHtml } = {}) {
  const cache = new Map();
  const inflight = new Map();
  let rateWindowStart = Date.now();
  let rateWindowCount = 0;
  let activeLookups = 0;

  function allowNewLookup() {
    const now = Date.now();
    if (now - rateWindowStart >= 60_000) {
      rateWindowStart = now;
      rateWindowCount = 0;
    }
    if (rateWindowCount >= LOOKUP_LIMIT_PER_MINUTE || activeLookups >= MAX_CONCURRENT_LOOKUPS) return false;
    rateWindowCount += 1;
    return true;
  }

  function cachedResolve(providerKey, title) {
    const key = `${providerKey}:${normalizeMatchTitle(title)}`;
    const now = Date.now();
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now) return Promise.resolve(entry.url);
    if (entry) cache.delete(key);
    const existing = inflight.get(key);
    if (existing) return existing;
    if (!allowNewLookup()) return Promise.reject(new Error("resolver_busy"));

    activeLookups += 1;
    const lookup = resolveProviderWatchUrl(providerKey, title, fetchHtml)
      .then((url) => {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { url, expiresAt: Date.now() + (url ? POSITIVE_CACHE_TTL : NEGATIVE_CACHE_TTL) });
        return url;
      })
      .finally(() => {
        activeLookups -= 1;
        inflight.delete(key);
      });
    inflight.set(key, lookup);
    return lookup;
  }

  const server = createServer(async (request, response) => {
    const url = parseRequestUrl(request);
    if (!url) return sendJson(response, 400, { error: "invalid_request" });

    if (url.pathname === "/_healthz") {
      if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "method_not_allowed" });
      addSecurityHeaders(response);
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
      return response.end(request.method === "HEAD" ? undefined : JSON.stringify({ ok: true }));
    }

    if (url.pathname === "/api/resolve") {
      if (request.method !== "GET") return sendJson(response, 405, { error: "method_not_allowed" });
      const providers = url.searchParams.getAll("provider");
      const titles = url.searchParams.getAll("title");
      if (providers.length !== 1 || titles.length !== 1 || url.search.length > 1200) return sendJson(response, 400, { error: "invalid_request" });
      const [providerKey] = providers;
      const [title] = titles;
      if (!Object.hasOwn(STREAM_PROVIDERS, providerKey) || !title.trim() || title.length > 100 || /[\u0000-\u001f\u007f]/.test(title)) {
        return sendJson(response, 400, { error: "invalid_request" });
      }
      try {
        const watchUrl = await cachedResolve(providerKey, title.trim().replace(/\s+/g, " "));
        if (!watchUrl) return sendJson(response, 404, { error: "no_exact_match" });
        return sendJson(response, 200, { provider: providerKey, url: watchUrl });
      } catch (error) {
        if (error.message === "resolver_busy") return sendJson(response, 429, { error: "temporarily_busy" });
        return sendJson(response, 502, { error: "provider_unavailable" });
      }
    }

    if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "not_found" });
    if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "method_not_allowed" });
    return serveStatic(request, response, url, distRoot);
  });

  server.headersTimeout = 8000;
  server.requestTimeout = 12000;
  server.keepAliveTimeout = 5000;
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const requestedPort = Number(process.env.PORT || 3000);
  const port = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65535 ? requestedPort : 3000;
  const server = createAniSparkleServer();
  server.listen(port, "0.0.0.0", () => console.log(`Ani Sparkle listening on 0.0.0.0:${port}`));
  server.on("error", () => {
    console.error("Ani Sparkle server could not start.");
    process.exitCode = 1;
  });
}
