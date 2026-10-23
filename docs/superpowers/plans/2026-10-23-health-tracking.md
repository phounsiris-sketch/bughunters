# Health tracking (badminton, Apple Watch + Galaxy Watch) — PLAN ONLY, not started

Status: planned 2026-10-23, waiting for the owner to say go. Nothing below is built.

## Goal
After a session, each player can see their own workout: duration, calories, average / max heart rate. Profile shows trends. Apple Watch and Galaxy Watch both supported; manual entry works for everyone.

## Feasibility (researched 2026-10-23, not yet tested on devices)
- A PWA cannot read Apple Health or Android Health Connect. Only a native app can.
- Apple Watch -> iPhone Health (HealthKit). Has a badminton workout type.
- Galaxy Watch -> Samsung Health -> Health Connect (Android only, needs an Android phone). Health Connect has a badminton session type. Only heart rate recorded during an exercise reaches Health Connect.
- One Capacitor health plugin covers both (candidates: `@capacitor/health-fitness`, Capawesome Health, `@capgo/capacitor-health`). NOT verified: that a plugin returns workout type + duration + calories + HR together; pick by a spike (phase 3).
- Costs/gates for phase 3: Apple Developer account (~99 USD/yr), App Store review, privacy policy, Health permission text; Google Play health-data declaration (check current rules before submitting).

## Data model (new, private by default)
`healthLogs/{uid}_{sessionId}` (one per player per session or match day)
- `uid`, `sessionId|null`, `date` (ISO), `startAt`, `endAt`, `minutes`, `kcal`, `avgHr`, `maxHr`, `source` ("manual" | "file" | "applehealth" | "healthconnect"), `createdAt`.
- Optional `shareWithGroup: false` (default). Only when true can group members read it.
Rules: owner read/write; group read only if `shareWithGroup`; numeric bounds (minutes 1–600, kcal 0–5000, hr 30–230); verified email; no other users' writes.

## Phase 1 — PWA, no watch needed (build first)
1. `js/health-core.js` (like `stats-core.js`, one source): `healthFor(uid, scope)` -> sessions, minutes, kcal, avgHr, trend; `healthOfSession(uid, sessionId)`; scopes reuse `STATS_SCOPES`. Tested in `tests/health-core.test.js`.
2. Health card on session result: "Add my workout" -> sheet with minutes (prefilled from session length), kcal, avg HR, max HR (all optional). Shows saved numbers as three chips.
3. Profile > "Health" tab: totals for the chosen period, kcal and HR trend (reuse `_sparkline`), last 5 workouts, link to the session.
4. Privacy: opt-in screen the first time ("Only you see this. Share with group: off"), delete-all-my-health-data button (uses `askConfirm`).
5. i18n EN + LA, `firestore.rules` block (owner publishes by hand), `docs/know-how.md` section, release guard test.

## Phase 2 — import without a store app (optional)
- Import a workout file (GPX/TCX; Apple Health export XML is too large, skip) in the Health sheet, parse in the browser, prefill the sheet.
- iOS Shortcut option: reads the last badminton workout and opens `…/#health=<json>` to prefill the sheet. Verify Shortcuts actions before promising.

## Phase 3 — native wrapper spike (only after phase 1 is used)
1. Capacitor shell around the existing web build (same code, same Firebase). Keep PWA as is.
2. Install the chosen health plugin, request read permission for Workouts, Heart Rate, Active Energy (same list as the tbad screenshot).
3. "Sync from watch" button: reads the last 7 days of badminton workouts, matches them to sessions by date/time, fills `healthLogs` with `source: applehealth|healthconnect`; user confirms before saving.
4. Test on a real Apple Watch + iPhone and a real Galaxy Watch + Android phone. Decide go / no-go from the results.
5. Store submission work: privacy policy, App Store / Play listings, review notes.

## Open decisions for the owner
- Share health with the group at all, or strictly private? (plan: private, opt-in share)
- Phase 3 budget: Apple Developer account and store submission, yes/no?
- Keep manual entry forever as the fallback? (plan: yes)

## Risks
- Health data is sensitive: rules must be tested in the Rules Playground; privacy policy needed before any store build.
- Plugin may not expose all fields on both platforms; spike decides.
- Lao text unreviewed.
