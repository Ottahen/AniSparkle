import { DEFAULT_PROVIDER, STREAM_PROVIDERS, buildSourceSearchUrl, providerKeyOrDefault, validatedProviderWatchUrl } from "./config.js";
import { initializeDirectPlayer, pauseDirectPlayer } from "./media-player.js";

const API = "https://graphql.anilist.co";
const LIBRARY_KEY = "ani-sparkle.library.v1";
const SETTINGS_KEY = "ani-sparkle.settings.v1";
const CACHE_KEY = "ani-sparkle.catalog.v1";
const MAX_LIBRARY_ITEMS = 80;
const CACHE_LIFETIME = 30 * 60 * 1000;
const POSTER_HOST = "s4.anilist.co";
const byId = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

let library = readLibrary();
let providerKey = readProvider();
let currentView = "discover";
let searchTimer = 0;
let activeSearchController;
let toastTimer = 0;
let trendingItems = [];
let seasonItems = [];

function readLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw || raw.length > 180_000) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const safe = {};
    for (const [key, value] of Object.entries(parsed).slice(0, MAX_LIBRARY_ITEMS)) {
      const id = Number(key);
      if (!Number.isSafeInteger(id) || id < 1 || !value || typeof value !== "object") continue;
      const title = typeof value.title === "string" ? value.title.trim().slice(0, 220) : "";
      if (!title) continue;
      const image = safePoster(value.poster);
      const totalEpisodes = boundedInteger(value.totalEpisodes, 0, 2000);
      const progress = boundedInteger(value.progress, 0, totalEpisodes || 2000);
      const state = value.state === "completed" ? "completed" : progress > 0 ? "watching" : "planned";
      safe[id] = { title, poster: image, totalEpisodes, progress, state, updatedAt: boundedInteger(value.updatedAt, 0, Date.now()) };
    }
    return safe;
  } catch {
    return {};
  }
}

function safePoster(value) {
  if (typeof value !== "string" || value.length > 1200) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === POSTER_HOST ? url.href : "";
  } catch {
    return "";
  }
}

function boundedInteger(value, min, max) {
  return Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.trunc(Number(value)))) : min;
}

function readProvider() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return providerKeyOrDefault(settings.provider);
  } catch {
    return DEFAULT_PROVIDER;
  }
}

function saveProvider(value) {
  providerKey = providerKeyOrDefault(value);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider: providerKey }));
  } catch {
    showToast("This browser could not save your preference.");
  }
  syncProviderLabels();
  rerenderAllCards();
}

function persistLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    showToast("Your browser storage is full. Remove a title and try again.");
  }
  updateCount();
  renderSavedPreview();
  if (currentView === "watchlist") renderCollection("watchlist");
  if (currentView === "history") renderCollection("history");
}

function mediaSnapshot(item) {
  return {
    title: String(item.title || "Untitled anime").slice(0, 220),
    poster: safePoster(item.poster || ""),
    totalEpisodes: boundedInteger(item.episodes, 0, 2000),
  };
}

function storeTitle(item) {
  const id = Number(item.id);
  if (!Number.isSafeInteger(id) || id < 1) return;
  if (!library[id] && Object.keys(library).length >= MAX_LIBRARY_ITEMS) {
    showToast("Your list is full. Remove a title before adding another.");
    return;
  }
  const snapshot = mediaSnapshot(item);
  if (library[id]) {
    delete library[id];
    showToast("Removed from your watchlist.");
  } else {
    library[id] = { ...snapshot, progress: 0, state: "planned", updatedAt: Date.now() };
    showToast("Saved for later.");
  }
  persistLibrary();
  rerenderAllCards();
}

function updateProgress(idValue) {
  const id = Number(idValue);
  const item = findMedia(id);
  const saved = library[id];
  if (!saved) return;
  const total = saved.totalEpisodes || boundedInteger(item?.episodes, 0, 2000);
  const progress = Math.min(total || 2000, saved.progress + 1);
  saved.totalEpisodes = total;
  saved.progress = progress;
  saved.state = total > 0 && progress >= total ? "completed" : "watching";
  saved.updatedAt = Date.now();
  persistLibrary();
  showToast(saved.state === "completed" ? "Marked complete. You did it." : `Progress saved · episode ${progress}.`);
  rerenderAllCards();
}

function findMedia(id) {
  return [...trendingItems, ...seasonItems].find((item) => Number(item.id) === Number(id));
}

function updateCount() {
  byId("watchlist-count").textContent = String(Object.keys(library).length);
}

function syncProviderLabels() {
  const provider = STREAM_PROVIDERS[providerKey];
  byId("source-label").textContent = provider.label;
  const select = byId("provider-select");
  if (select) select.value = providerKey;
}

function configureProviderLink(link, title, label) {
  link.href = buildSourceSearchUrl(title, providerKey);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.dataset.providerResolve = "true";
  link.dataset.provider = providerKey;
  link.dataset.providerTitle = String(title).slice(0, 100);
  link.setAttribute("aria-label", label);
}

async function resolveProviderLink(link) {
  const key = providerKeyOrDefault(link.dataset.provider);
  const title = String(link.dataset.providerTitle || "").trim().slice(0, 100);
  const provider = STREAM_PROVIDERS[key];
  const fallbackUrl = buildSourceSearchUrl(title, key);
  const tab = window.open("about:blank", "_blank");
  if (!tab) {
    showToast("The browser blocked a new tab; opening the source search here.");
    window.location.assign(fallbackUrl);
    return;
  }
  try {
    tab.opener = null;
    tab.document.title = `Finding ${provider.label} watch page`;
    tab.document.body.textContent = `Looking for an exact watch page for “${title}”…`;
  } catch {
    // Keep the loading tab; navigation below still works if its document is unavailable.
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const query = new URLSearchParams({ provider: key, title });
    const response = await fetch(`/api/resolve?${query}`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const result = await response.json();
    const watchUrl = response.ok && result.provider === key ? validatedProviderWatchUrl(result.url, key) : null;
    if (!watchUrl) throw new Error("No verified watch page was returned.");
    if (!tab.closed) tab.location.replace(watchUrl);
    showToast(`${provider.label} watch page opened.`);
  } catch {
    if (!tab.closed) tab.location.replace(fallbackUrl);
    showToast(`No exact watch page was confirmed; opened ${provider.label} search instead.`);
  } finally {
    window.clearTimeout(timeout);
  }
}

function handleProviderLinkClick(event) {
  const link = event.target.closest("a[data-provider-resolve]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  void resolveProviderLink(link);
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function getSeason(date = new Date()) {
  const month = date.getMonth();
  const season = month < 3 ? "WINTER" : month < 6 ? "SPRING" : month < 9 ? "SUMMER" : "FALL";
  return { season, year: date.getFullYear(), label: season[0] + season.slice(1).toLowerCase() };
}

const MEDIA_FIELDS = `id title { romaji english } description(asHtml: false) coverImage { large extraLarge } bannerImage seasonYear episodes format averageScore popularity genres status`;
const DISCOVERY_QUERY = `query Discovery($page: Int, $season: MediaSeason, $year: Int) { Page(page: $page, perPage: 12) { media(type: ANIME, isAdult: false, sort: TRENDING_DESC, season: $season, seasonYear: $year) { ${MEDIA_FIELDS} } } }`;
const TRENDING_QUERY = `query Trending($page: Int) { Page(page: $page, perPage: 12) { media(type: ANIME, isAdult: false, sort: TRENDING_DESC) { ${MEDIA_FIELDS} } } }`;
const SEARCH_QUERY = `query TitleSearch($search: String) { Page(page: 1, perPage: 18) { media(type: ANIME, isAdult: false, search: $search, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } } }`;

function mediaFromApi(raw) {
  const id = Number(raw?.id);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const title = String(raw.title?.english || raw.title?.romaji || "Untitled anime").trim().slice(0, 220);
  if (!title) return null;
  return {
    id,
    title,
    description: String(raw.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600),
    poster: safePoster(raw.coverImage?.extraLarge || raw.coverImage?.large || ""),
    banner: safePoster(raw.bannerImage || ""),
    episodes: boundedInteger(raw.episodes, 0, 2000),
    seasonYear: boundedInteger(raw.seasonYear, 0, 2200),
    format: String(raw.format || "ANIME").replaceAll("_", " ").slice(0, 30),
    score: boundedInteger(raw.averageScore, 0, 100),
    popularity: boundedInteger(raw.popularity, 0, 2_000_000),
    genres: Array.isArray(raw.genres) ? raw.genres.filter((x) => typeof x === "string").slice(0, 3) : [],
    status: String(raw.status || "").slice(0, 30),
  };
}

async function fetchAniList(query, variables = {}, signal) {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error("AniList could not complete that request.");
  const media = payload?.data?.Page?.media;
  if (!Array.isArray(media)) throw new Error("The catalog returned an unexpected response.");
  return media.map(mediaFromApi).filter(Boolean);
}

async function fetchWithDeadline(query, variables = {}, signal) {
  const deadline = new AbortController();
  const timeoutId = window.setTimeout(() => deadline.abort(), 9500);
  const abortFromCaller = () => deadline.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    return await fetchAniList(query, variables, deadline.signal);
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function readCatalogCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw || raw.length > 240_000) return null;
    const cache = JSON.parse(raw);
    if (!cache || Date.now() - Number(cache.savedAt) > CACHE_LIFETIME) return null;
    const normalize = (rows) => Array.isArray(rows) ? rows.slice(0, 12).map((row) => mediaFromApi({
      id: row.id,
      title: { english: row.title, romaji: row.title },
      coverImage: { extraLarge: row.poster },
      episodes: row.episodes,
      seasonYear: row.seasonYear,
      format: row.format,
      averageScore: row.score,
      popularity: row.popularity,
      genres: row.genres,
    })).filter(Boolean) : [];
    return { trending: normalize(cache.trending), seasonal: normalize(cache.seasonal) };
  } catch {
    return null;
  }
}

function writeCatalogCache() {
  const compact = (rows) => rows.slice(0, 12).map(({ id, title, poster, episodes, seasonYear, format, score, popularity, genres }) => ({ id, title, poster, episodes, seasonYear, format, score, popularity, genres }));
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), trending: compact(trendingItems), seasonal: compact(seasonItems) }));
  } catch {
    // A full or private-mode storage area must never prevent live discovery.
  }
}

function renderCard(item) {
  const saved = library[item.id];
  const article = make("article", "anime-card");
  const posterLink = make("a", "poster-link");
  configureProviderLink(posterLink, item.title, `Open ${STREAM_PROVIDERS[providerKey].label} page for ${item.title} in a new tab`);
  const poster = make("img", "poster-image");
  poster.loading = "lazy";
  poster.decoding = "async";
  poster.alt = `${item.title} cover art`;
  poster.referrerPolicy = "no-referrer";
  poster.src = safePoster(item.poster) || "/sparkle.svg";
  poster.addEventListener("error", () => { poster.src = "/sparkle.svg"; poster.classList.add("poster-fallback"); }, { once: true });
  posterLink.append(poster);
  if (saved?.progress > 0 && saved.totalEpisodes > 0) {
    const progress = make("span", "poster-progress");
    const bucket = Math.min(100, Math.round(saved.progress / saved.totalEpisodes * 10) * 10);
    const fill = make("span", `progress-fill progress-${bucket}`);
    progress.append(fill);
    posterLink.append(progress);
  }
  article.append(posterLink);

  const copy = make("div", "card-copy");
  const meta = make("div", "card-meta");
  const kind = make("span", "kind-label", item.format || "ANIME");
  meta.append(kind);
  if (item.seasonYear) meta.append(make("span", "meta-dot", "·"), make("span", "year-label", String(item.seasonYear)));
  if (item.score) meta.append(make("span", "score-label", `✦ ${Math.round(item.score / 10 * 10) / 10}`));
  const title = make("h3", "card-title", item.title);
  const detail = make("p", "card-detail");
  const detailText = [item.episodes ? `${item.episodes} eps` : "Episode count varies", item.genres?.[0]].filter(Boolean).join(" · ");
  detail.textContent = detailText;
  copy.append(meta, title, detail);

  if (saved) {
    const status = make("span", `list-status ${saved.state}`, saved.state === "completed" ? "Complete" : saved.progress ? `Episode ${saved.progress}` : "Saved");
    copy.append(status);
  }
  const actions = make("div", "card-actions");
  const watch = make("a", "card-watch", "Watch on source ↗");
  configureProviderLink(watch, item.title, `Open ${STREAM_PROVIDERS[providerKey].label} watch page for ${item.title} in a new tab`);
  actions.append(watch);
  const save = make("button", "card-save", saved ? "Saved ✓" : "+ Save");
  save.type = "button";
  save.dataset.action = "save";
  save.dataset.id = String(item.id);
  save.setAttribute("aria-label", saved ? `Remove ${item.title} from watchlist` : `Save ${item.title} to watchlist`);
  actions.append(save);
  if (saved && currentView === "history") {
    const progress = make("button", "progress-button", "+1 episode");
    progress.type = "button";
    progress.dataset.action = "progress";
    progress.dataset.id = String(item.id);
    actions.append(progress);
  }
  copy.append(actions);
  article.append(copy);
  return article;
}

function renderList(containerId, items, emptyText) {
  const container = byId(containerId);
  container.replaceChildren();
  if (!items.length) {
    container.append(make("p", "empty-inline", emptyText));
    return;
  }
  for (const item of items) container.append(renderCard(item));
}

function savedAsMedia([id, item]) {
  const base = findMedia(Number(id));
  return {
    id: Number(id),
    title: item.title,
    poster: safePoster(item.poster),
    episodes: item.totalEpisodes || base?.episodes || 0,
    seasonYear: base?.seasonYear || 0,
    format: base?.format || "ANIME",
    score: base?.score || 0,
    genres: base?.genres || [],
  };
}

function renderSavedPreview() {
  const items = Object.entries(library).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 5).map(savedAsMedia);
  renderList("saved-preview-list", items, "Nothing saved just yet. Add a title and we’ll keep it close.");
}

function renderCollection(view) {
  const rows = Object.entries(library).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const filtered = view === "history" ? rows.filter(([, item]) => item.progress > 0 || item.state === "completed") : rows;
  const items = filtered.map(savedAsMedia);
  renderList(view === "history" ? "history-list" : "watchlist-list", items, view === "history" ? "Nothing in progress yet. Save a title, then update your episode count here." : "Your list is waiting for its first title. Head to Discover and save one.");
}

function rerenderAllCards() {
  renderList("trending-list", trendingItems, "Nothing here yet.");
  renderList("season-list", seasonItems, "Nothing here yet.");
  renderSavedPreview();
  if (currentView === "watchlist" || currentView === "history") renderCollection(currentView);
  if (!byId("results-view").hidden && window.lastSearchItems) renderList("results-list", window.lastSearchItems, "Try another title.");
}

async function loadDiscovery(forceRefresh = false) {
  const cached = !forceRefresh ? readCatalogCache() : null;
  if (cached?.trending.length) {
    trendingItems = cached.trending;
    seasonItems = cached.seasonal;
    renderList("trending-list", trendingItems, "No trending titles found.");
    renderList("season-list", seasonItems, "No seasonal titles found.");
  }
  const season = getSeason();
  byId("season-stamp").textContent = `${season.label.toUpperCase()} ${season.year}`;
  const settled = await Promise.allSettled([
    fetchWithDeadline(TRENDING_QUERY, { page: 1 }),
    fetchWithDeadline(DISCOVERY_QUERY, { page: 1, season: season.season, year: season.year }),
  ]);
  const [trendingResult, seasonResult] = settled;
  if (trendingResult.status === "fulfilled") {
    trendingItems = trendingResult.value;
    renderList("trending-list", trendingItems, "No trending titles found.");
  }
  else if (!trendingItems.length) setListFailure("trending-list", "Couldn’t reach the anime catalog. Check your connection and retry.");
  if (seasonResult.status === "fulfilled") {
    seasonItems = seasonResult.value;
    renderList("season-list", seasonItems, "No seasonal titles found.");
  }
  else if (!seasonItems.length) setListFailure("season-list", "Seasonal picks are unavailable right now. Try again in a moment.");
  writeCatalogCache();
}

function setListFailure(id, message) {
  const container = byId(id);
  const text = make("p", "empty-inline", message);
  const retry = make("button", "button-quiet retry-button", "Try again");
  retry.type = "button";
  retry.addEventListener("click", () => loadDiscovery(true), { once: true });
  container.replaceChildren(text, retry);
}

function setView(view) {
  currentView = view;
  if (view !== "player") pauseDirectPlayer();
  const views = {
    discover: byId("discover-view"),
    watchlist: byId("watchlist-view"),
    history: byId("history-view"),
    player: byId("player-view"),
    settings: byId("settings-view"),
  };
  byId("results-view").hidden = true;
  for (const [name, element] of Object.entries(views)) element.hidden = name !== view;
  document.querySelectorAll("[data-nav]").forEach((button) => {
    if (button.classList.contains("nav-item")) {
      const active = button.dataset.nav === view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    }
  });
  if (view === "watchlist" || view === "history") renderCollection(view);
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  if (view !== "discover") byId("anime-search").blur();
}

function showSearchResults(items, query) {
  pauseDirectPlayer();
  currentView = "search";
  byId("discover-view").hidden = true;
  byId("watchlist-view").hidden = true;
  byId("history-view").hidden = true;
  byId("player-view").hidden = true;
  byId("settings-view").hidden = true;
  byId("results-view").hidden = false;
  byId("results-title").textContent = `Results for “${query}”`;
  byId("results-note").textContent = "Matched from the AniList anime catalog.";
  byId("results-status").textContent = items.length ? `${items.length} titles to explore` : "No matches yet. Try a shorter or alternate title.";
  window.lastSearchItems = items;
  renderList("results-list", items, "Try another title or check the spelling.");
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}

function openSearchLoading(query) {
  pauseDirectPlayer();
  byId("discover-view").hidden = true;
  byId("watchlist-view").hidden = true;
  byId("history-view").hidden = true;
  byId("player-view").hidden = true;
  byId("settings-view").hidden = true;
  byId("results-view").hidden = false;
  byId("results-title").textContent = `Finding “${query}”`;
  byId("results-note").textContent = "Checking the catalog for your next favorite.";
  byId("results-status").textContent = "Searching…";
  byId("results-list").replaceChildren(make("div", "loading-state", "Searching the catalog…"));
}

async function runSearch(rawQuery) {
  const query = String(rawQuery || "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (!query) { setView("discover"); return; }
  if (activeSearchController) activeSearchController.abort();
  activeSearchController = new AbortController();
  const controller = activeSearchController;
  openSearchLoading(query);
  try {
    const items = await fetchWithDeadline(SEARCH_QUERY, { search: query }, controller.signal);
    if (controller.signal.aborted) return;
    showSearchResults(items, query);
  } catch (error) {
    if (controller.signal.aborted) return;
    byId("results-status").textContent = error.name === "AbortError" ? "Search timed out. Try again." : "Search is temporarily unavailable. Please retry in a moment.";
    byId("results-list").replaceChildren();
    const retry = make("button", "button-quiet retry-button", "Retry search");
    retry.type = "button";
    retry.addEventListener("click", () => runSearch(query), { once: true });
    byId("results-list").append(retry);
  }
}

function handleDelegatedClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "save") {
    const media = findMedia(Number(button.dataset.id)) || Object.values(window.lastSearchItems || []).find((item) => Number(item.id) === Number(button.dataset.id));
    if (!media) {
      const saved = library[button.dataset.id];
      if (saved) {
        delete library[button.dataset.id];
        persistLibrary();
        rerenderAllCards();
        showToast("Removed from your watchlist.");
      }
      return;
    }
    storeTitle(media);
  }
  if (button.dataset.action === "progress") updateProgress(button.dataset.id);
}

function setupEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    setView(button.dataset.nav);
  }));
  document.getElementById("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    runSearch(byId("anime-search").value);
  });
  byId("clear-search").addEventListener("click", () => {
    byId("anime-search").value = "";
    setView("discover");
  });
  document.body.addEventListener("click", handleProviderLinkClick);
  document.body.addEventListener("click", handleDelegatedClick);
  byId("provider-select").addEventListener("change", (event) => {
    saveProvider(event.target.value);
    showToast(`${STREAM_PROVIDERS[providerKey].label} set as your source.`);
  });
  byId("clear-data").addEventListener("click", () => byId("confirm-dialog").showModal());
  byId("confirm-clear").addEventListener("click", (event) => {
    event.preventDefault();
    library = {};
    try { localStorage.removeItem(LIBRARY_KEY); } catch { /* ignore storage denial */ }
    persistLibrary();
    byId("confirm-dialog").close();
    showToast("Your local list has been cleared.");
    rerenderAllCards();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      byId("anime-search").focus();
    }
    if (event.key === "Escape" && !byId("confirm-dialog").open) byId("anime-search").blur();
  });
  initializeDirectPlayer();
  syncProviderLabels();
  updateCount();
}

setupEvents();
renderSavedPreview();
void loadDiscovery();
