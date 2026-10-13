# Plan: create flows in two steps (v68)
1. `js/ui.js`: `wizBarHtml`, `dayStripHtml`. 2. `js/polls.js` `renderPollCreateForm` and `js/sessions.js` `renderSessionCreateForm` split into steps (`pollStep`, `sesStep`, day pick). 3. i18n `wz*`, CSS block. 4. Checks: `node --check`; helper tests; keys present. 5. Branch only, stacked on v67.
