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

## Addendum 2026-10-23 — Profile "Health details" and the estimate (planned, not built)
Mockup (example numbers): published as a private artifact in the session; source copy `docs/mockups/health-mockup.html` if the owner wants it kept.

### Profile > Health details (only me)
Stored in `userPrivate/{uid}.health` (same place as the private date of birth; only the owner can read it).
- `weightKg` (needed for calories), `heightCm` (optional), `sex` (optional: male / female / prefer not to say, tunes estimates only), `restHr` (optional), `maxHr` (optional override; default = 208 − 0.7 × age from the existing birth year), `notes` (free text, e.g. injuries), `weeklyGoal` (sessions or minutes).
- Never public. Share switch (off by default) shares totals only (sessions, minutes, kcal), never weight, height or heart rate. BMI is not shown by default.
- Wellness estimate, not medical advice (said on the card).

### Estimate model (when no watch is connected)
- Session length = booked duration. Warm-up 10 min. Game length = live-score minutes when saved, else 15 min per recreational doubles game. On court = games played × game length; rest = session − warm-up − on court.
- kcal = MET × kg × hours. Social badminton ≈ 5.5 MET, warm-up ≈ 4, resting ≈ 2 (activity compendium values; re-check before shipping). Example 70 kg, 3 h, 9 games: ≈ 994 kcal total, ≈ 784 above resting.
- Heart rate curve (illustration): warm-up ramps to ~125; each game settles near 75% of max (≈ 137 bpm at max 183); a close game (margin ≤ 2) adds up to +12 bpm and a late peak; a blowout (margin > 8) −4; rest decays toward ~105 bpm. With a watch connected, real readings replace the curve.
- Zones from max HR: Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 > 90%.

### Build order (after phase 1 of the plan above)
1. Health details page + private storage + rules (owner only, bounds on numbers).
2. Estimate card on the session result (duration, on court, kcal, curve marked "estimate").
3. Feed live-score minutes and final scores into the estimate.
4. Profile Health tab with period totals and trend (same All / month / 3m / 6m / 1y filters).

### Decisions from the owner's feedback (same day)
1. **Duration comes from the live score**, not a guess. Today `lsSaveGame` stores `minutes` per saved game as (save time − `live.startedAt`), and `startedAt` restarts when the previous game is saved. That number includes the wait before the first point of each game (rest, team change). To make it a correct measure, a later step stores `startAt` (first point) and `endAt` on each live match document (new fields; `matches` rules do not whitelist fields on create, the recorder can still fix until confirmed) and keeps `minutes = endAt − startAt`. Matches typed in by hand without minutes are left out of health totals instead of being guessed. Per player: on court = sum of the minutes of the matches they played; waiting = session span (first `startAt` to last `endAt`, else booked time) − on court.
2. **Heart rate zones are personal.** Zones are computed per user from their own resting and max heart rate (Karvonen: Zn = rest + share × (max − rest), shares 50 / 60 / 70 / 80 / 90 %). Max heart rate = the value the user entered, else 208 − 0.7 × age (Tanaka) from the stored birth year, else zones are hidden until age or max is known. Example: a 35-year-old resting at 62 has Z3 at 147–160; a 52-year-old resting at 74 has Z3 at 143–152. Zones are never one shared table. Watch-measured max (highest sustained reading) may later offer to replace the entered value.
3. **Estimated curve** is generated as a share of each player's own heart rate reserve, so two players on the same night get different bpm and different minutes in each zone.
