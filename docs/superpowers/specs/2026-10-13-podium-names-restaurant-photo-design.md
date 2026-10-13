# Podium match, names A→Z everywhere, restaurant photo (v58)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/podium-names-restaurant-photo`

## 1. Top-spenders podium = the dashboard podium
The Spending tab podium I added (v57) had its own markup and CSS, and its
generic class names (`.podium`, `.pod-name`, …) collided with the existing
Activity leaderboard podium. Fix: `_podiumHtml` now calls the existing
`_topCard` (same markup: round photo + medal, value, rank block, tap to open the
activity) with only the top 3, and the duplicate CSS is removed.

## 2. Names A→Z everywhere
Pairs and teams read alphabetically (e.g. "Lich & MartinyBob"), as in the pair
dropdown the owner approved. New helper `byNameAZ(team)` in `js/stats.js`; used by
`_teamName` (game rows, game form, Team A/B), "my last games" (both sides; the
player's own name is still highlighted) and the best-score line. Pair lists,
Head to head and pair dropdowns already used `pairUids`.

## 3. Restaurant photo (optional)
New-restaurant form: optional photo (resized to 800 px, stored as `images/{id}`
with kind `restaurant`; the restaurant keeps `photo: "img:<id>"`). Shown as a
round thumbnail in the picker list and the chosen row, and as a banner on the
dinner bill card (tap to enlarge). No photo → a plate icon. No rules change:
`images` already allows signed-in users to create (< 900 KB), and `restaurants`
ignores extra fields.

## Files
`js/dashboard.js`, `js/stats.js`, `js/restaurants.js`, `js/i18n.js` (`restPhoto`),
`css/styles.css`, `js/app.js` + `sw.js` (v58).
