# Head to head — pair vs pair (v57)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/spending-chart-podium`

## Goal
The Head to head tab shows one player against pairs and partners. Add a section
where any two pairs are compared directly.

## Behaviour
- Section "Pair vs pair" at the bottom of Head to head, below the singles block.
- Two selects: pair 1 (all pairs that played a doubles game with a winner) and
  pair 2 (only pairs with no player in common with pair 1). Defaults: the chosen
  player's most-played pair, then the pair it met most.
- Shows wins each (e.g. 2 – 1), games and points difference, and the list of
  those games (date, score from pair 1's side, green/red).
- No games between them: "have not played each other yet". Fewer than two
  possible pairs: "No other pair to compare with yet".
- Counts every saved doubles game with a winner (any mode). Pair names A→Z.

## Data
No new data or rules. Built from `lastMatches` (`teamA`, `teamB`, `games`).

## Files
`js/stats.js` (`_pairVsPairHtml`, `h2hPairA/B`, `_plainPair`, `_disjoint`),
`js/i18n.js` (`h2hPairVsPair`, `pvpNoOpponent`, `pvpNeverMet`; en + la),
`css/styles.css` (`.pvp-*`).
