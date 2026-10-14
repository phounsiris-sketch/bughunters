# UI audit fixes (v87)

From the Impeccable audit (13/20). Done here: P1 contrast (tokens in all 9 colour styles + gradient ends + badge + light pills), P1 keyboard and screen-reader access (`js/app.js` enhancer, focus ring, toast live region), P1 hit areas (44 px), P1 type floor (11 px, nav 12 px) and Lao line height, P2 dead Chart.js removed, fonts via `<link>`, `transition: all` removed, reduced-motion fallback. The purple Spending card and tiles moved to blue/cyan.
Detector findings 30 to 16 (contrast 8 to 0, undersized text 5 to 0). The rest are advisory style flags (gradient text on the splash, glow, bounce easing, one violet colour style, a notification accent bar) and 5 false-positive "broken image" flags (photos waiting on a blank placeholder).
Not done (needs a decision or a bigger change): PRODUCT.md / DESIGN.md (`/impeccable init`, `document`), bundling and deferring the 33 scripts, a photo cache that survives sessions, a tablet/desktop layout.
**Version:** v87.
