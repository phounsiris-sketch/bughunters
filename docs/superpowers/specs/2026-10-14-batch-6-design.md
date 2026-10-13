# Batch 6 (v84)

1. **iPhone top edge:** v83 removed `viewport-fit=cover` but the bell and profile were still under the clock (iOS draws the page under the translucent status bar). v84 restores `viewport-fit=cover` and pads the header, toast, notification panel, sign-in screen, Live score bars and the Exit button with `env(safe-area-inset-top)`.
2. Removed: the "Hi, name" line on Home and the "Start 1500" pill on the rating card.
3. **Live score practice** (`lsTry`): no game needed, no players, a practice badge, never stored or saved; game over offers "New practice game" and Exit.
4. Removed the "Badminton Club" line under the group name in the header.
5. Calendar: days with events show real dots (6 px, up to 3) and a light tint.
**Version:** v84.
