# Spending tab — vertical month chart + top-3 podium (v57)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/spending-chart-podium`

## Goal
1. The "By month <year>" list (Dashboard → Spending) becomes a **vertical bar chart**.
2. Add a **podium** for the top 3 players who spent the most.

## Behaviour
- Vertical chart: one column per month of the current year, up to the current
  month (empty months show an empty column). In *All time* the columns are years
  (oldest left). Amount (short form) above each bar, bars scaled to the largest
  column, horizontally scrollable on narrow screens and scrolled to the latest
  column. Tapping a column shows that month's total, sessions and *your share*
  (the info the old list showed under each row).
- Podium: the 3 largest per-player totals of the **selected period**
  (`_playerSpend`, i.e. each player's share of court + shuttles + other + dinner),
  shown 2nd · 1st · 3rd with avatar, name, amount, medal. Fewer than 3 players:
  only those. No players: card hidden.
- Podium sits under the totals card, above the month chart.

## Data
No new fields, no rule changes. Reuses `computeLedger` / `_playerSpend`.

## Files
- `js/dashboard.js` — `_renderPeriodTable` (vertical chart), `showVbarDetail`, `_podiumHtml`
- `js/i18n.js` — `topSpenders` (en, la)
- `css/styles.css` — `.vbar-*`, `.podium`, `.pod-*`
- `js/app.js`, `sw.js` — v56 → v57
