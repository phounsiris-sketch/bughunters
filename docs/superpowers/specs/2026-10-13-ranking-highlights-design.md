# Ranking tab — best pair, best score, pairs by rating (v57)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/spending-chart-podium` (same release)

## Goal
Make the Ranking tab show the best pair and the best score, and rank pairs by rating.

## Why
A pair with 5 games (2W–3L, rating 1477) sat at #1 above pairs rated 1517–1520,
because pairs with at least `PAIR_MIN_MATCHES` (5) games were listed before all
others. That looked wrong.

## Behaviour
- **Highlights card** above the pair list, for the selected period (this month / all time):
  - **Best pair** — highest pair rating in the list: names, rating, W–L.
  - **Best score** — the saved game with the biggest winning margin: winners,
    score, losers, margin, date. Counts the same games as ratings (competition,
    scored).
- **Pair list** is sorted by rating (then by games played). Pairs below 5 games keep their
  `x/5 games` tag but are no longer pushed down.
- Player list ordering is **unchanged** (settled players first, `RANK_MIN_MATCHES` = 10).
- Help text (`rankHelpHtml`, en + la) updated.

## Pair names in A→Z order
A pair always reads the same way: the two names are ordered alphabetically
(case-insensitive) wherever a pair is shown (pair ranking, best pair, Head to head
"vs pairs", monthly recap rival), so "Nith & JusT John" and "JusT John & Nith" can
no longer look like two pairs. `pairKey()` already sorted by player ID, so the
data was always one pair; only the displayed order changed. New helper
`pairUids(key)` in `js/stats.js`.

## Still open
If the same person has two accounts (e.g. a manual player and a joined account),
their games still count as two players: the *Merge players* job does not rewrite
`matches`. Waiting for an example from the owner.

## Files
`js/stats.js` (`_highlightsHtml`, `_renderRanking`), `js/i18n.js` (`bestPair`,
`bestScore`, help text), `css/styles.css` (`.hl-*`).
