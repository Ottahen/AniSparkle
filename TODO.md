# Ani Sparkle — project outcomes

- [x] Create a new platform called “Ani Sparkle” with browse/search/watch flow inspired by Ani-Cli.
- [x] Provide a better user interface and user experience than a command-line interface, with no ads.
- [x] Keep the platform fast and responsive.
- [x] Include anime streaming functionality like Ani-Cli, using Miruro or `hianime.at` as editable providers. Provider playback is handed off to its own site.
- [x] Add an in-app player for user-provided authorized HTTPS direct video/HLS media URLs; play standard video with the browser's native player and HLS with native support or hls.js. Do not proxy, rehost, or bypass an embed policy.
- [x] Resolve an exact visible title match to its provider watch page and open that page; fall back to the provider's title-search page when no unambiguous match exists. Do not request or extract stream URLs.
- [x] Build a fully workable, powerful platform with strong security.
- [x] Show “Built by Ottahen” and link it to `GitHub.com/Ottahen`.
- [x] Do not add “made by AI” wording.

## Provider limitation

- **Blocked:** Play Miruro/HiAnime-hosted catalog video inside Ani Sparkle. Miruro's watch page sets `X-Frame-Options: SAMEORIGIN`, and no authorized player embed/API was found in the public documentation reviewed. Keep the provider watch page handoff and the separate direct-media player; do not scrape, proxy, or bypass provider controls.
