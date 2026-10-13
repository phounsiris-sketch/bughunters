# No accidental profile open from list cards (v60)

**Problem:** tapping the "by <name>" line on a session card or a poll opened the person's profile by accident while scrolling the list.
**Change:** the creator line on session cards (`.session-by`) and polls (`.poll-author`) is plain text, no tap action, no pointer cursor. Profiles still open from the People tab, participant chips on the session page, group/member lists and buddy cards.
**Version:** v60 (`APP_VERSION`, `CACHE_NAME`).
