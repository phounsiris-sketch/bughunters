# Spending chart + podium — implementation record (v57)

Spec: `../specs/2026-10-13-spending-chart-podium-design.md`

- [x] Replace row list in `_renderPeriodTable` with vertical bars; tap detail
- [x] Add `_podiumHtml` and render it in `_renderSpendingTab`
- [x] i18n `topSpenders` (en "Top spenders", la "ຜູ້ໃຊ້ຈ່າຍສູງສຸດ" — Lao wording to confirm)
- [x] CSS for chart and podium
- [x] Bump to v57 (`js/app.js`, `sw.js`)
- [x] `node --check`; stub test of podium order (2,1,3), 1-player, empty, bar scaling
- [x] Update `docs/know-how.md` (new "Spending tab" subsection, version line)
- [ ] Visual check on the live app after merge (not yet done)
