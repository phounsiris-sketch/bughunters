# Restaurants + reviews — implementation record (v57)

Spec: `../specs/2026-10-13-restaurants-reviews-design.md`

- [x] `js/restaurants.js`: list helpers, validation, picker with search, new-item form with map pin, review box
- [x] `db.js` cache (`DB_CACHE.restaurants`, `.reviews`) with quiet error handler
- [x] `sessions.js`: edit-form row, save + copy `restaurantId/Name`, bill-card block
- [x] `firestore.rules`: `restaurants`, `restaurantReviews`
- [x] i18n en + la (Lao wording is mine — owner to review), CSS, `index.html` script tag
- [x] `docs/know-how.md`: §5 subsection, §12 rows, §13 bullet
- [x] Stub tests: validation (length, place, pin range, duplicate by name/no-pin/≤300 m, far chain allowed, self-edit), search filter, average 4.5 (2), review box only for diners
- [ ] **Publish `firestore.rules` in the Firebase console** (manual) before using restaurants
- [ ] Run the rules in the emulator (not available here)
- [ ] Visual check after merge
