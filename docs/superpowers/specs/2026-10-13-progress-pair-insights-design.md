# Progress tab — best / toughest pair + comfortable tips (v57)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/spending-chart-podium`

## Goal
On Stats → Progress (chosen player + period) show the player's best pair and
worst ("toughest") pair, and suggestions to improve in a comfortable, kind tone.

## Behaviour
- Partners are counted from the player's games in the period (`_myGames`): games
  and wins together per partner.
- **Best pair**: highest win rate, ties by more games. **Toughest pair**: lowest
  win rate; needs ≥ `INSIGHT_MIN_GAMES` (2) games together; hidden if equal to
  the best rate or only one partner qualifies.
- Not enough games with any partner → short hint + a "try other partners" tip.
- **Tips** (max 4, rule-based, not AI): keep best pair for important games;
  relaxed practice with the toughest pair (roles front/back, talk between
  points); a tough opponent (win rate < 50 %, ≥ 2 games); close games (avg
  points/game < 0, ≥ 3 games); short losing run (last ≥ 2 lost); great form
  (≥ 70 % win rate, ≥ 5 games). Wording is encouraging ("no pressure", "small steps").
- Card sits under the facts row, above the weekly/monthly breakdown.

## Files
`js/stats.js` (`_pairInsightsHtml`), `js/i18n.js` (`bestWorstPair`, `worstPair`,
`insNeedMore`, `insTipsTitle`, `tip*`; en + la), `css/styles.css` (`.ins-*`).
No data or rules changes.
