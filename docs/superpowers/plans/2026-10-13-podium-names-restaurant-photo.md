# Podium, names, restaurant photo — implementation record (v58)

Spec: `../specs/2026-10-13-podium-names-restaurant-photo-design.md`

- [x] `_podiumHtml` reuses `_topCard`; removed colliding `.podium` / `.pod-*` CSS
- [x] `byNameAZ()` and its use in `_teamName`, last games, best score
- [x] Restaurant photo: form field + preview, `dbSaveImage`, thumbnail, bill banner
- [x] i18n `restPhoto` (Lao to confirm), `know-how.md`, version v58
- [x] Stub tests: podium markup (pod r2/r1/r3, top 3 only), names sorted (case-insensitive), thumbnail vs placeholder
- [ ] Visual check of the podium against the Activity one, after merge
