# All game modes change ratings (v57)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/spending-chart-podium`

## Decision
Fun, Exercise and Competition are only a **label** that tells the players how a
game was meant. Every saved game with a winner changes ratings, pair ratings,
win/loss, streaks and the Progress line, whatever its mode.

## Before
`computeStats()` skipped rating updates when `m.mode` was not `competition`
(Fun / Exercise only counted as games and minutes played). That is why a player
could have more games than rating-line dots.

## Change
- `js/stats.js`: removed the mode filter in `computeStats()`; header comment updated.
- `js/i18n.js`: en + la texts that said "only Competition" (help, empty states,
  confirm hint, streak badges, starting-level hint, competition mode hint).
- `docs/know-how.md`: §5 mode bullet, §7 ratings bullets, troubleshooting row.

## Effect on history
Ratings are recomputed from the saved matches every time, so **past Fun /
Exercise games now count too**. Everyone's rating, pair rating and ranking can
shift. No data is written or migrated.

## Progress chart dots
Dots = 1 start point + 1 per game with a winner in the period (games played = dots − 1).
The first dot is **hollow** and a legend under the chart reads "Start <rating>"
(the rating when the period began, 1500 for a new player) and "<n> games (one dot
each)". `_sparkline(vals, opts)` in `js/stats.js`; CSS `.sparkline circle.start`,
`.spark-legend`; i18n `startWord`, `gamesDots`.
