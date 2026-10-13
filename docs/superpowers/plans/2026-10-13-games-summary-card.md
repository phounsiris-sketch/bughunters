# Games summary card — implementation record (v56)

Spec: `../specs/2026-10-13-games-summary-card-design.md`

- [x] Add `_gamesSummaryHtml(list)` in `js/stats.js`; prepend to `_gamesListHtml(s)`
- [x] Add `gamesSummary` to `js/i18n.js` (en: "Summary", la: "ສະຫຼຸບ" — Lao wording to be confirmed by the owner)
- [x] Add `.games-summary` CSS
- [x] Bump `APP_VERSION` (`js/app.js`) and `CACHE_NAME` (`sw.js`) to v56
- [x] `node --check` on changed JS
- [x] Update `docs/know-how.md` (§7, version line)
- [ ] Visual check on the live app after Pages deploy (not yet done)

## Standing rule
Every feature update also updates `docs/superpowers/` (a dated spec + plan record
like this one) and the relevant section of `docs/know-how.md`.
