# Plan: Live score (v65)

1. `js/livescore.js`: pure rules (`lsOver`, `lsGamePoint`, `lsApply`, `lsUndoLast`), storage, render (setup, count, menu, settings, game over), actions, save.
2. `index.html`: `#liveScreen` layer + script; `sw.js` precache; `js/icons.js`: `plus`, `minus`.
3. Entry points: Home Create tile + resume banner (`js/home.js`), button on the session Games tab (`js/stats.js`).
4. i18n `ls*` keys (en + la; Lao unreviewed). CSS block "Live score".
5. Checks: `node --check`; rules test (`/tmp/ls_test.js` style: 20+ cases and 2,000 random games all valid under `scoreProblem`); every `t()` key present in en and la.
6. Branch only (stacked on v64); merge in order when the owner says so.
