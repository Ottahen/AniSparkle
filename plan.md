# Ani Sparkle — implementation plan

## Product approach

Build a fast, responsive anime discovery and watchlist website inspired by the browse/search/watch flow of Ani-Cli. AniList supplies catalog metadata and posters; browser-local storage saves favorites and progress without accounts. Anime cards resolve an exact title match to a provider-owned watch page through a small, same-origin Node endpoint, then open that page on the provider. Miruro and HiAnime remain selectable/configurable sources. If a safe exact match cannot be established, open the provider’s title-search page instead. This does not embed provider pages or fetch/proxy/extract their video streams. A separate in-app player continues to accept user-provided direct HTTPS media URLs they are authorized to play: browser-native video and native or locally bundled hls.js playback.

## Project structure

- `index.html` — single-page application shell, semantic landmarks, CSP, discovery/collection/settings views, and direct-media Player view.
- `src/app.js` — AniList catalog queries, view routing, safe rendering, local watchlist/progress, provider-link click flow, and search fallback.
- `src/provider-resolver.js` — fetch only allowlisted public search/info HTML, find exact visible title links, and return a validated provider watch-page URL; never fetch media or player APIs.
- `src/media-player.js` — direct-media URL validation, lazy HLS runtime loading, `<video>` lifecycle, and player status/error reporting.
- `src/config.js` — editable provider hosts and search-route/query configuration.
- `server.mjs` — same-origin HTTP API (`/api/resolve`), health route, static `dist` serving, rate limit, and secure response handling.
- `scripts/build.mjs` — reproducibly assemble the static frontend, custom assets, and lazy HLS bundle in `dist`.
- `Dockerfile` — reproducible Node 22 runtime image that builds and serves the frontend and resolver together.
- `package.json` and `package-lock.json` — pinned hls.js dependency and check/test/build/start commands.
- `tests/` — unit and API tests for provider matching, URL allowlists, limits, redirects, and fallback behavior.
- `public/manus-routes.json`, artwork, and sparkle favicon — page route declaration and static assets.
- `app.config.ts` — platform logo metadata.
- `plan.md`, `TODO.md` — product and implementation decisions and outcomes.

The app has no account system, database, cookies, or stored user-media URLs. The resolver accepts only a provider enum and a bounded title string; it never accepts an arbitrary target URL. It contacts providers only after a user clicks a watch link, caches link results briefly, limits time, response size, concurrency, and request volume, sends no cookies/referrer, follows same-host redirects only, and validates that the returned target is a same-provider watch-page path. Cache misses or ambiguous matches fall back to the title-specific provider search page.

## Design

- **Design Movement:** Editorial anime-journal meets a refined midnight media lounge; expressive but disciplined rather than copying Ani-Cli or any source-site interface.
- **Core Principles:** Search first; beautiful large-format artwork; immediate local interactions; clear separation between Ani Sparkle and external playback.
- **Color Philosophy:** Deep ink surfaces keep focus on anime artwork. A distinctive electric-lilac glow gives the brand a memorable spark, balanced by warm paper-white text and muted slate labels.
- **Layout Paradigm:** Offset editorial composition: persistent slim side rail, wide featured story, compact continue-watching strip, then horizontally browsable seasonal collections. On mobile the rail becomes a compact bottom/navigation bar and cards remain horizontally scrollable.
- **Signature Elements:** A four-point sparkle mark; a fine lavender progress trace on in-progress titles; pill-shaped season and status labels.
- **Interaction Philosophy:** Every card action is explicit and keyboard accessible. Search has a short debounce and useful loading/empty/error states. Save/progress changes happen instantly and persist locally. Provider handoffs explain when they leave Ani Sparkle. An in-app direct player validates pasted HTTPS media URLs before loading them.
- **Animation:** Short opacity/translate transitions (160–240 ms) for focus/entry; no continuous motion; honor `prefers-reduced-motion`; never delay core interactions for animation.
- **Typography System:** System sans-serif stack for fast rendering; large editorial title with tight tracking, medium-weight headings, quiet metadata in compact uppercase labels; no external font fetch.
- **Brand Essence:** A quick, ad-free anime discovery desk for people who want a calm place to find shows, remember progress, and play an authorized direct stream in one workspace. **Personality:** vivid, calm, nimble.
- **Brand Voice:** Confident and concise; makes the destination and saved state obvious. Examples: “Your next episode is waiting.” “Paste a direct link you’re allowed to play.”
- **Wordmark & Logo:** Custom four-point spark glyph leading a lowercase “ani sparkle” wordmark, designed as a compact vector mark and shown in the rail/header.
- **Signature Brand Color:** Electric lilac (`#B79CFF`).

## Security and performance decisions

- The Node endpoint is same-origin, with no wildcard CORS and no credentials. Its provider enum maps only to fixed HTTPS hosts/search paths. Query inputs are length-limited and encoded by `URLSearchParams`.
- Limit resolution to two public HTML pages per click (HiAnime search page; Miruro search page and its matched info page), one matching result, bounded response bytes, a deadline, bounded concurrency, a per-minute request cap, and a small TTL cache. Reject cross-host redirects, malformed paths, ambiguous titles, and any target not shaped as an approved provider `/watch/` route. Fallback is the regular title-search handoff.
- Parse only visible title and link metadata. Never request provider `/api` endpoints, player scripts, `.m3u8`, `.mp4`, segments, DRM keys, or hidden stream URLs. No iframe, proxy, stream relay, or media-source rewriting.
- Miruro uses the public route `/search?q=…`, exposes `/info/{id}/{slug}` results, then a visible watch link. HiAnime uses `/search?keyword=…` and exposes a title-specific `/watch/{slug-id}` link. Exact normalized title matching prevents automatically selecting similarly named sequels.
- The source pages lack CORS response headers, so the browser cannot fetch their HTML directly; the same-origin Node resolver handles only these bounded public-page requests. Direct media/HLS playback stays in the browser and uses HTTPS, `credentials: omit`, and `no-referrer`.
- Preserve the existing CSP rules for scripts, styles, workers, and media. Do not add X-Frame-Options or `frame-ancestors 'self'`, which would break Cloud Preview's cross-site iframe.
- hls.js remains lazy-loaded only when the user loads an HLS link. Direct MP4/WebM uses native `<video>` with metadata-only preload and no autoplay.
- No external page values are injected as HTML; catalog and parser output is normalized and validated before use.

## Streaming behavior and limitations

The source resolver takes a title from AniList and maps it to an exact provider watch page when the public result is unambiguous. The provider page opens in a new tab and owns its player, episode selection, availability, and ads/policies. It does not guarantee auto-starting a specific episode. When title matching fails, Ani Sparkle opens that title's provider search page. The separate Player view is for user-provided direct media links only (`.mp4`, `.webm`, `.m4v`, `.ogv`, or `.m3u8`, with an explicit format option for extensionless direct endpoints); it is not a converter for Miruro or HiAnime page URLs.

## Build and serving

Preview and the container run `server.mjs` on the configured port (`PORT` or 3000) and serve the generated `dist` output. Hybrid publication routes `/api/*` and `/_healthz` to the server and the remaining site paths to the built static output. The existing separate static build remains available. Auto-publish stays off; this change prepares the project but does not publish it.

## Brand requirements

Show “Built by Ottahen” with a link to `https://github.com/Ottahen`. Do not include any “made by AI” wording.

## Visual asset

The hero uses a dusk anime-landscape image selected from a web image search and copied into project assets. The preview serves it from `/images/hero.jpg`; a managed-storage copy is retained for future hosted deployments. The small sparkle favicon/logo is served locally and project logo metadata points to its uploaded durable HTTPS URL.

## Provider page-link investigation — checked 2026-10-12

- [Miruro public search](https://barelystarted.miruro.tv/search?q=Attack%20on%20Titan) rendered title results with visible `/info/{id}/{slug}` links. [Miruro robots.txt](https://barelystarted.miruro.tv/robots.txt) allows `/search`, `/info/`, and `/watch/`, and disallows `/api/`.
- [HiAnime public search](https://hianime.at/search?keyword=Attack%20on%20Titan) rendered matching title results and a visible `/watch/attack-on-titan-240` link. [HiAnime robots.txt](https://hianime.at/robots.txt) allows `/`.
- Requests to both public search pages returned HTML without `Access-Control-Allow-Origin`, so browser-side cross-origin fetching is unavailable. Ani Sparkle uses the user-approved, same-origin server endpoint and does not call hidden provider APIs.
- A HEAD request to the [Miruro watch example](https://www.miruro.tv/watch/eUX_tyNiuGGBLkTiE8Jd176Ca0lnd9vR/im-dating-a-dark-summoner?ep=1) returned HTTP 403 with `X-Frame-Options: SAMEORIGIN`. The provider page itself must remain top-level in its own tab. See [MDN X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options) and [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

## Implementation verification — 2026-10-13

- The managed Preview and local server returned HTTP 200 for the app, route manifest, health check, client assets, and same-origin resolver API. The public API returned a validated exact-title route for both Miruro and HiAnime for “Attack on Titan.”
- Browser interaction from an Ani Sparkle Watch link reached Miruro's title-specific `/watch/{id}/{slug}` route in a new tab, not the provider homepage/search route. Miruro then displayed its own Cloudflare verification interstitial; Ani Sparkle does not attempt to bypass it.
- The user-provided `kanata-kara?ep=2` example passed only local route-shape validation. Its page/player/media was not fetched. This build therefore fixes title-to-watch routing, but it does **not** play Miruro/HiAnime video inside Ani Sparkle. The existing Ani Sparkle Player accepts authorized direct HTTPS MP4/WebM/HLS URLs; in-app playback of provider-hosted catalog content remains blocked until a provider offers an authorized embeddable player or API.
- Resolver tests cover strict title matching, provider-host validation, same-host routing, no-match fallback, response bounds, caching, and API constraints. Full check and test suite passed before the managed browser click-through.
