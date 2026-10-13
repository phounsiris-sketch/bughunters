# Plan: Settings and Profile (v71)
1. `js/settings.js`: `_navRow`, grouped rows, `_meTitleHtml`, profile tiles + badges, remove `_meTabsHtml`.
2. `index.html` nav item Settings; `js/router.js` nav highlight (settings pages) and header avatar highlight (profile only). CSS block. v71 (read-then-write on `sw.js`).
3. Checks: `node --check` all JS; stub render of both pages (rows, sections, tiles, badges); `sw.js` not empty.
