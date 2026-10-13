# Plan: stacked spending chart (v61)

1. `js/dashboard.js`: add `_spendTypes()`; `_renderPeriodTable` draws a `.vbar-stack` of per-type segments plus a legend; `showVbarDetail` lists per-type amounts.
2. `css/styles.css`: `.vbar-stack`, `.t-*` colours, `.vbar-legend`, `.vbar-dot`, `.vbar-part`; drop the old single-gradient `.vbar-plot i` rule.
3. Bump `APP_VERSION`/`CACHE_NAME` to v61; update know-how.
4. Check: `node --check js/dashboard.js`.
