# Restaurant master list + 5-star dinner reviews (v57)

Date: 2026-10-13 · Requested by: MartinyBob · Branch: `feat/spending-chart-podium`
Owner's extra requirements: location pin, search, validation of a new item.

## Goal
A session's dinner can optionally name a restaurant from a shared master list,
and the people who joined that dinner can review it with 5 stars.

## Design (defaults accepted by the owner)
- `restaurants/{id}`: name, location, lat, lng, createdBy, createdAt. **Shared
  across groups**, like the courts directory; reviews readable by everyone signed in.
- `restaurantReviews/{restaurantId}_{uid}`: restaurantId, uid, stars 1–5,
  comment ≤ 200 (optional), sessionId, gid, updatedAt. One per person per
  restaurant, editable.
- `sessions.dinner.restaurantId` + `restaurantName` (denormalised), only when chosen.

## Behaviour
- Edit form, dinner card: optional **Restaurant** row → picker modal.
- **Search**: live filter on name and location (case, spacing, punctuation ignored).
- **New restaurant**: name, location text, map pin (existing Leaflet picker:
  tap, my location, paste a Google Maps link).
- **Validation** (`validateRestaurant`): name 2–60; location ≤ 120; at least a
  location text or a pin; pin in range; **duplicate** = same normalised name and
  (no pin on either side, or within 300 m) → blocked with "use the existing one".
- Bill card: name, location, Open in Google Maps, average stars (n), review box
  for diners (stars + comment + save/delete), latest 5 reviews.

## Rules (`firestore.rules`) — must be published by hand BEFORE/with the merge
`restaurants`: read signed-in; create/update need `restaurantOk` (name, location
or pin) and createdBy; delete creator or Super. `restaurantReviews`: read
signed-in; create/update need `reviewOk` (own uid, doc id `restaurantId_uid`,
int 1–5, comment ≤ 200, and `dinedAt` = the uid is in the session's
`dinner.diners` and `dinner.restaurantId` matches); delete own or Super.
The cache subscriptions use a quiet error handler, so the app still works before
the rules are published.

## Not done
No management page for the list yet (add / pick only), no place-name search on
the map (search is over the saved list), rules not run in the emulator.

## Files
`js/restaurants.js` (new), `js/db.js` (cache), `js/sessions.js` (edit card, save,
bill card), `js/app.js` (refresh keys), `js/i18n.js` (en + la), `css/styles.css`,
`index.html` (script tag), `firestore.rules`.
