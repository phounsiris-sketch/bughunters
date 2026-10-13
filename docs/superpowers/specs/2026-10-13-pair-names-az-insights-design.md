# Pair names A→Z in best/worst partner card (v59)

**Problem:** the Progress tab best/worst partner card showed "me & partner", so the same pair read differently from the A→Z names used elsewhere.
**Change:** `_pairInsightsHtml` row now uses `byNameAZ([uid, x.uid])`. Audit of `js/*.js` found no other unsorted pair or team name (the Progress recap image uses `pairUids`, already A→Z).
**Version:** v59 (`APP_VERSION`, `CACHE_NAME`).
