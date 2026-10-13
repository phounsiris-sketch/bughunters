# Plan: shared components and the photo-and-name rule (v64)

1. `js/ui.js` with the component functions; script tag after `dashboard.js`; precache in `sw.js`.
2. CSS block "Shared components" at the end of `css/styles.css` (person chip, people row, team column, pill, vote bar, tracker, date block, icon stat).
3. Apply: session card (`peopleHtml`), settle rows (`personHtml` both sides), poll voters (`peopleHtml`), game rows (`teamHtml`), Home next-game card (`voteBarHtml` + `peopleHtml`).
4. i18n: `pollNeed`, `trkPlan/Play/Pay/Done` (en + la).
5. Checks: `node --check`; stub test of the component functions and Home cards; every `t("...")` key exists.
6. Not in this slice: text-only names in notifications and sentences ("Mee started a poll"), dropdown lists, and the stats leaderboards (already photo + name).
