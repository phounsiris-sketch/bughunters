# Session tab — "Add game score" shortcut (v57)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/spending-chart-podium`

## Goal
From the session's bill page (Session tab) jump straight to adding a game score.

## Behaviour
- A full-width primary button **Add game score** sits under the Session / Games
  tabs, on the **Session tab only**, and only for people who can add games
  (players of the session and group admins, `_canAddGames`). Groups only (the
  tabs exist only where `_hasGamesTab()`).
- Tap → `quickAddGame()`: switches to the Games tab (`setSessionTab("games")`,
  which keeps any bill edit in progress) and scrolls to `#gameFormBox`.
- Hidden on the Games tab (the form is already there).

## Files
`js/sessions.js` (`_sessionTabsHtml`), `js/stats.js` (`quickAddGame`),
`js/i18n.js` (`addGameScore`; en + la), `css/styles.css` (`.quick-game-btn`).
