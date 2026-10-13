# Ranking highlights — implementation record (v57)

Spec: `../specs/2026-10-13-ranking-highlights-design.md`

- [x] `_highlightsHtml(st, pairs, month)` in `js/stats.js`; called from `_renderRanking`
- [x] Pair sort by rating (provisional pairs keep tag)
- [x] i18n `bestPair`, `bestScore`; help text en + la (Lao wording to confirm)
- [x] CSS `.hl-*`
- [x] `node --check`; stub test (month filter, all-time, margin, empty)
- [x] `docs/know-how.md` Ranking row updated
- [ ] Name-swap issue: needs an example from the owner; check *Merge players* vs `matches`
- [ ] Visual check on the live app after merge
