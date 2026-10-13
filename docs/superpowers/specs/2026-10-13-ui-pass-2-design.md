# UI pass 2 (v75)

1. **Longer people line** on the Games card, the Home next-game card and poll voters: up to 6 people (photo + name) before "+N" (was 3 / 4).
2. **Games links**: *All votes* and *All sessions* (the old lists) move above the first card.
3. **Back and breadcrumbs**: each `showPage` step adds a browser-history entry (`{n}`); `popstate` goes back one step (modal and Live score screen first); `goBack()` uses `history.back()`. Default breadcrumbs for pages that set none; the parent of drill-down pages is now Games (not the old Sessions/Polls lists); Dashboard has Home > Dashboard. The first page no longer leaves a phantom "dashboard" step.
4. **Settings notifications** in the new look: one icon row with a switch, a "send a test" row, and the recently-deleted row in the same grouped card (no long text block).
5. **Rankings page**: title + the app's tab style; my card is a hero (photo, name, level, place with change, rating as the one big number, one-line explanation, win rate and games as icons, best partner as a person); last 5 games: the strip and the list run the same way (newest first) and every player is photo + name.
No data or rules change. **Version:** v75.
