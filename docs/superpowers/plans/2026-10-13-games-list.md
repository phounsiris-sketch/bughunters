# Plan: Games list and bottom bar (v66)

1. `js/games.js` (`gameItems`, `sessionStep`, `myOweOn`, cards, `renderGames`, `showCreateSheet`).
2. `index.html`: `page-games`, new bottom bar, script; `sw.js` precache; `js/router.js` (page, nav highlight, + button); `js/app.js` (refresh, modal Save button restore); `js/notify.js` (Games badge).
3. i18n (en + la) and CSS block "Games list".
4. Checks: `node --check`; stub test of items/steps/owe (confirmed, cancelled and old votes hidden); keys present.
5. Branch only, stacked on v65.
