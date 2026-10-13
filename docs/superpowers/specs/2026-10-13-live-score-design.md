# Live score (v65)

Count a game point by point on one phone, then save it as a normal game.

## Screens (one full-screen layer, `#liveScreen`, code in `js/livescore.js`)
- **Setup:** game type (MD/WD/XD/singles), Team A and Team B (photo + name chips), pool of the session's players, the rules list, Start.
- **Count:** two halves in the theme colours. Left half of a team = minus, right half = plus (the circles show it). Big score, team players (photo + name), shuttle icon next to the team that serves, centre pill "Game N · to 21", GAME POINT badge, Undo and Menu buttons. Keeps the screen awake and vibrates on a point where the phone allows.
- **Menu:** Exit, Reset, Settings. **Settings:** current game (session), teams playing, theme colour (Classic, Sunset, Forest, Ocean, Night).
- **Game over:** "Team X wins", the score, the winners (photo + name), Save and next game / Save and finish / Undo.

## Rules (decided with the owner)
First to 21 with a 2-point lead; if it stays close it ends at the cap. The cap is the **group's setting** (`maxPoints()`: 30 or 31); with 30, 30–29 wins. The team that scores serves next. Every saved score passes the same `scoreProblem()` as "Add game score" (checked on 2,000 random games).

## Data
No new collection. Each finished game is one document in `matches`, the same fields as "Add game score" (`type, teamA, teamB, games:[{a,b}], minutes, sessionId, date, mode, createdBy, confirmed:false`) plus `live: true`. Ratings and rankings are unchanged. The running score is kept in `localStorage` (`godsmash_live_v1`) until saved; theme in `godsmash_live_theme`.

## Differences from the prototype
No "best of 3" series (the app counts every game on its own, so "Save and next game" does it). The swap-sides-at-11 reminder and the extra settings (tap zones, sounds) are not in this version.

## Entry points
Home > Create > Live score; the Games tab of a session; Home banner "Live score in progress" while a game is half counted.
