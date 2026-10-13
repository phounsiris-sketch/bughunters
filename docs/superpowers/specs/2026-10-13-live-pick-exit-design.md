# Live score: choose the game first, Exit button; last-games order (v73)

- **Choose the game first:** opening Live score without a game now shows "Which game is this for?": today's or the latest session first (marked), the others below, and *New game*. Picking one goes to the team setup; the setup screen shows the current game with *Change*. A game already being counted resumes straight to the counter.
- **Exit** button at the top left of the counter (asks first if points were counted; the score stays on the phone).
- **My last 5 games** (Rankings > My stats): the W/L strip and the list below it now run the same way, newest first (the strip used to run oldest first, so the red loss sat at the left while the list had it at the bottom).
- v72 (profile rows) is included. `tools/release-guard.sh` added after v72's `app.js` was committed empty by a bad version-bump script (caught before merge).
**Version:** v73.
