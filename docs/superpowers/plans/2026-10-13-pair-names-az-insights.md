# Plan: pair names A→Z in best/worst partner card

1. In `js/stats.js` `_pairInsightsHtml`, replace the fixed "me & partner" label with `byNameAZ([uid, x.uid])` joined by ` &amp; `.
2. Bump `APP_VERSION` in `js/app.js` and `CACHE_NAME` in `sw.js` to v59; update the version line in `docs/know-how.md`.
3. Check: `node --check js/stats.js`; grep for other `getUserName` joins (none unsorted).
