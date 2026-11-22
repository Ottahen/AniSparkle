import { STREAM_PROVIDERS, buildSourceSearchUrl, validatedProviderWatchUrl } from "./config.js";

const MAX_TITLE_LENGTH = 100;
const MAX_HTML_LENGTH = 1_500_000;
const MAX_ANCHORS = 400;

function decodeHtmlEntities(value) {
  return String(value).replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "quot") return '"';
    if (lower === "apos" || lower === "#39") return "'";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "nbsp") return " ";
    const codePoint = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
  });
}

export function normalizeMatchTitle(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/^\s*watch(?:\s|:|—|-)+/i, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseAttributes(attributeText) {
  const attributes = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of attributeText.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function plainText(markup) {
  return decodeHtmlEntities(String(markup)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseProviderAnchors(html) {
  if (typeof html !== "string" || html.length > MAX_HTML_LENGTH) return [];
  const anchors = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const attributes = parseAttributes(match[1]);
    const body = match[2].slice(0, 5000);
    const imageAlt = [...body.matchAll(/<img\b([^>]*)>/gi)]
      .slice(0, 3)
      .map((image) => parseAttributes(image[1]).alt)
      .find(Boolean);
    const href = attributes.href;
    if (typeof href !== "string" || !href || href.length > 2048) continue;
    const label = attributes["aria-label"] || attributes.title || imageAlt || plainText(body);
    anchors.push({ href, label: String(label).slice(0, 300) });
    if (anchors.length >= MAX_ANCHORS) break;
  }
  return anchors;
}

function matchesExactTitle(label, normalizedTitle) {
  return Boolean(normalizedTitle) && normalizeMatchTitle(label) === normalizedTitle;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function matchingWatchLinks(anchors, providerKey, normalizedTitle) {
  return unique(anchors
    .filter((anchor) => matchesExactTitle(anchor.label, normalizedTitle))
    .map((anchor) => validatedProviderWatchUrl(anchor.href, providerKey)));
}

function matchingMiruroInfoLinks(anchors, normalizedTitle) {
  const infoLinks = [];
  const provider = STREAM_PROVIDERS.miruro;
  const origin = `https://${provider.host}`;
  for (const anchor of anchors) {
    if (!matchesExactTitle(anchor.label, normalizedTitle)) continue;
    try {
      const url = new URL(anchor.href, origin);
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.protocol !== "https:" || url.origin !== origin || url.search.length > 250 || url.hash) continue;
      if (parts.length !== 3 || parts[0] !== "info" || !parts.slice(1).every((part) => /^[A-Za-z0-9._~-]{1,180}$/.test(part))) continue;
      infoLinks.push(url.href);
    } catch {
      // Ignore malformed or off-provider anchors.
    }
  }
  return unique(infoLinks);
}

function miruroWatchPathForInfo(infoUrl) {
  const provider = STREAM_PROVIDERS.miruro;
  const origin = `https://${provider.host}`;
  const url = new URL(infoUrl);
  const [, id, slug] = url.pathname.split("/").filter(Boolean);
  return `${origin}/watch/${id}/${slug}`;
}

export async function resolveProviderWatchUrl(providerKey, rawTitle, fetchHtml) {
  if (!Object.hasOwn(STREAM_PROVIDERS, providerKey)) throw new TypeError("Choose a supported streaming source.");
  if (typeof fetchHtml !== "function") throw new TypeError("A provider page reader is required.");
  const title = typeof rawTitle === "string" ? rawTitle.trim().replace(/\s+/g, " ") : "";
  if (!title || title.length > MAX_TITLE_LENGTH || /[\u0000-\u001f\u007f]/.test(title)) {
    throw new TypeError("Enter a valid anime title.");
  }
  const normalizedTitle = normalizeMatchTitle(title);
  if (!normalizedTitle) throw new TypeError("Enter a valid anime title.");

  const searchUrl = buildSourceSearchUrl(title, providerKey);
  const searchHtml = await fetchHtml(searchUrl, { providerKey, stage: "search" });
  if (typeof searchHtml !== "string" || searchHtml.length > MAX_HTML_LENGTH) throw new Error("Provider search page could not be read safely.");

  const searchAnchors = parseProviderAnchors(searchHtml);
  const watchLinks = matchingWatchLinks(searchAnchors, providerKey, normalizedTitle);
  if (watchLinks.length === 1) return watchLinks[0];
  if (watchLinks.length > 1 || providerKey !== "miruro") return null;

  const infoLinks = matchingMiruroInfoLinks(searchAnchors, normalizedTitle);
  if (infoLinks.length !== 1) return null;

  const infoUrl = infoLinks[0];
  const infoHtml = await fetchHtml(infoUrl, { providerKey, stage: "info" });
  if (typeof infoHtml !== "string" || infoHtml.length > MAX_HTML_LENGTH) throw new Error("Provider title page could not be read safely.");

  const expected = miruroWatchPathForInfo(infoUrl);
  const infoWatchLinks = unique(parseProviderAnchors(infoHtml)
    .map((anchor) => validatedProviderWatchUrl(anchor.href, providerKey))
    .filter((url) => url && new URL(url).pathname === new URL(expected).pathname));
  return infoWatchLinks.length === 1 ? infoWatchLinks[0] : null;
}
