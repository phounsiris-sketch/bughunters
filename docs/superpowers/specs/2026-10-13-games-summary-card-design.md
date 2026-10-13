# Games tab — summary card (v56)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/games-summary-card`

## Goal
On a session's **Games** tab, show one card that summarises the session: how many
games were played in total, and how many games each player played.

## Behaviour
- Card titled **Summary** sits above the "Games (n)" list.
- Header line: `<total games> games · <distinct players> players`.
- One row per player: name, proportional bar, games played. Sorted by games
  played (most first), then by name. A game counts for every player on Team A
  and Team B, in any game type.
- Hidden when the session has no games yet.
- Updates live with the list (rendered inside `_gamesListHtml`, which
  `refreshSessionGames()` re-renders when another player saves a game).

## Out of scope
Wins/losses, minutes and points per player (already in Stats → Progress / Head to head).

## Data
No new fields or collections, no rule changes. Computed in the browser from
`sessionMatches(session.id)` (`teamA`, `teamB` of each match).

## Files
- `js/stats.js` — `_gamesSummaryHtml(list)`, called from `_gamesListHtml(s)`
- `js/i18n.js` — `gamesSummary` (en, la); reuses `gamesWord`, `playersWord`
- `css/styles.css` — `.games-summary` block
- `js/app.js`, `sw.js` — version v55 → v56
