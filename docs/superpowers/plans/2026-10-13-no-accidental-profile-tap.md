# Plan: no accidental profile tap (v60)

1. `js/sessions.js` and `js/polls.js`: remove `role="button"` and `onclick="showUserProfile(...)"` from the creator line.
2. `css/styles.css`: remove the `cursor: pointer` rule for `.poll-author, .session-by`.
3. Bump `APP_VERSION`/`CACHE_NAME` to v60; know-how version line.
4. Check: `node --check` on both files.
