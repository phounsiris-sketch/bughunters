# QA 1 — App shell, sign-in/onboarding, settings, profile, people, notifications, perms

Method: code-only review (no screenshots; login required). Paths are relative to `projects/bughunters`. Items marked **[visual check]** need a real phone to confirm.

## Verdict: partly good for users

- The structure is sound: 5-tab bottom bar, breadcrumb + back arrow, undo/trash instead of hard deletes, privacy per field, and good push-state messages (iOS needs Home Screen, blocked, unsupported).
- The weak point is the first 5 minutes. A Lao, non-technical newcomer hits an English sign-in, email + password + email verification, then an empty "no group" state. Onboarding is where people drop.
- Several small but real issues: pinch-zoom disabled, tiny touch targets (22–24px delete buttons, 10px nav labels), modals that close and lose input on an outside tap, and error toasts that show raw Firebase text or just a field name.

---

## 1. App shell and navigation (index.html, js/app.js, js/router.js)

**Works:** Splash with an 8s safety timeout (app.js:430); global back arrow + breadcrumb (router.js:178-207); group pages redirect to "groups" when there is no group (router.js:28); the Public zone changes the header colour (router.js:65); the FAB's label and action change per page (router.js:67-77); aria-labels on the bell/back/me buttons (index.html:101,107,110); the SW update reloads once (app.js:386-393); focus moves into the first modal input (app.js:105).

**Problems**
1. **High — zoom is disabled.** `maximum-scale=1, user-scalable=no` (index.html:5). Lao script is small and complex; low-vision and older users cannot enlarge it. Fails WCAG 1.4.4. Fix: remove `maximum-scale`/`user-scalable`. If iOS input-zoom is the worry, set inputs to 16px (they are 14px, styles.css:190, 235).
2. **Med — bottom-nav items are `div` + `onclick`, not buttons** (index.html:239-258). They are not keyboard- or screen-reader-reachable, with no role and no `aria-current`. Labels are 10px (styles.css:783), which is hard to read for Lao glyphs with vowel/tone marks. The overall height is OK (~56px), but the text is tiny. Fix: use `<button>` or `<a>`, set `aria-current="page"`, and use 11–12px labels with a 2-line allowance.
3. **Med — modal behaviour.** The overlay closes on any outside tap (index.html:274) and `closeModal` only clears the callback (app.js:109-113). The gear form, player form, and court form are all modals, so a stray tap or a scroll-end tap on the dimmed area **loses the typed data with no warning**. There is no Escape handler, no `role="dialog"`/`aria-modal`, and focus does not return to the trigger. The modal card has `max-height:80vh` (styles.css:870), so on a phone with the keyboard open the Save button can be pushed off-screen. Fix: do not close on an overlay tap when the modal has inputs (or ask to discard); add `role="dialog"` + Escape; sticky action row.
4. **Med — toasts vanish after a fixed 2s** (app.js:90-92) and every error is a toast. Long Lao error text (e.g. pushBlocked, i18n.js:1279) can't be read in 2s, and a screen reader isn't told (the toast has no `aria-live`, index.html:270; only `undoToast` has role=status). Fix: duration scaled to text length (~4s min for errors), `role="status"/"alert"`, inline errors on forms.
5. **Low — `crumbGo` uses `new Function(c.action)` and `openNotif` too** (router.js:200, notify.js:258). Not a UX issue today, but it breaks under a stricter CSP and is fragile. Replace with function references.
6. **Low — FAB `bottom:80px; right:20px`, 56px** (styles.css:1068-1073) can cover the last row's action button (e.g. a card's right-aligned edit/delete) on short lists. **[visual check]**
7. **Low — no offline/slow banner.** There is no `navigator.onLine` handling anywhere (grep is empty). Firestore persistence helps, but a user on a poor Lao mobile connection sees stale data or an endless "loading" with no cue. Fix: a small "offline" strip at the top.
8. **Low — the focus ring is removed on inputs** (`outline:none`, styles.css:193,234) and only `.cs-trigger` has `:focus-visible` (styles.css:1728). Buttons, tabs, nav items and chips have no visible keyboard focus. Fix: a global `:focus-visible` outline.

## 2. Sign-in / onboarding (index.html:28-92, js/auth.js)

**Works:** One form, two modes (Sign in/Register); 8-digit phone field with fixed +856 20 prefix and digits-only filter (index.html:50); `autocomplete`/`inputmode` set; "Forgot password" is present; the register name is kept in localStorage until the email is verified so it isn't lost (auth.js:83,185); the verify screen has resend and "use another account"; error codes map to translated messages (auth.js:38-53); the submit button is disabled while the request is in flight (auth.js:63).

**Problems**
1. **High — the first screen is English.** `currentLang` defaults to `"en"` (i18n.js:5), even though the audience is Lao. The only switch is a small "ລາວ" pill at the top right (index.html:30-31). Fix: default to Lao when `navigator.language` starts with `lo` (or `th`), or show both languages side by side on the first screen.
2. **High — the sign-up path is long for non-technical users.** The steps are: name, phone, email, password, confirm password, wait for the email, open the mail app, tap the link, return to the app, tap "I've confirmed". Many Lao users share or have no regular email, and the email link opens a browser page rather than the installed PWA. Phone is asked at sign-up and again in the profile. Suggestions: (a) add "Continue with Google" (the know-how doc §2 already says the app uses Google sign-in, but the code is email + password only, so **docs and code disagree**); (b) drop the confirm-password field and offer a show/hide eye; (c) let the user into the app while unverified (limited), instead of a hard block.
3. **High — the invite link is lost during registration.** `joinFromHash` runs only after `_enterApp` (auth.js:213), and the verification link's continue URL is `origin + pathname` without the hash (auth.js:11-13). A person who taps an invite link, registers and verifies ends up in the app with no group and has to find "Join with a code". This is the main way people get in. Fix: save the `#join=` hash to localStorage before sign-in and replay it after `_enterApp`.
4. **Med — raw/unclear error messages.** A missing name shows the toast "Display Name" (auth.js:79, 157) rather than "Please enter your name". Unknown Firebase errors fall back to the raw English `error.message` (auth.js:52, 178, 336). Fix: field-level inline errors (red text under the input) and a generic translated fallback.
5. **Med — no password show/hide**, min length 6 only (index.html:59), and `minlength` is on the input but the form posts via JS so the browser hint never shows. On a phone with Lao keyboard switching, typos are common. Fix: eye toggle.
6. **Med — "I've confirmed" depends on the user pressing it** (auth.js:117-124). It could poll `reload()` when the app regains visibility so that returning from the mail app continues automatically. The "not confirmed yet" toast is also 2s.
7. **Low — "Use another account" / "Forgot password?" are `link-btn`** with 6px padding and 13px text (styles.css:1835-1842): about 30px tall. Raise to ≥44px.
8. **Low — Profile-setup fallback screen** (index.html:80-91) only appears for users who signed in without a profile; it pre-fills the display name from the email prefix (auth.js:332), which is fine.
9. **Low — `window.prompt` for the old email-link flow** (auth.js:132) is a legacy path; leave it but expect it to look odd.

## 3. Groups empty state after sign-in (js/groups.js:362-390; part of onboarding)

**Works:** A welcome card plus three clear cards (Create, Join with link, Find a public group).
**Problems:** **Med** — no inline code-entry field; "Join with link" opens another step. The most common case is "someone sent me a link or code" and it could be one input on this page. **Low** — the admin-only invite QR is only visible to admins, so the newcomer can't scan from this screen. Fix: paste box + "Scan QR" on the welcome card.

## 4. Settings (js/settings.js:156-211)

**Works:** Clear order (Group, App, Notifications & data, Sign out); nav cards with titles + hints; language is the first item in "App"; destructive actions use `confirm()` or typed confirmation (delete group, reset: groups.js:586, settings.js:853); deleted rows go to Recently deleted.

**Problems**
1. **Med — the Group section is long and duplicated.** Up to 9 cards (settings.js:167-175). "Members", "Players" (manual) and "Players' QR" are three different people lists; the config page also has a Players tab with a full roster (settings.js:245-293) that duplicates Members. A new admin doesn't know where to add a person. Fix: collapse to Group settings / Members (incl. non-app players) / Courts & prices / Shuttlecocks / Payments QR; leave "General" inside Group settings.
2. **Med — "Sign out" is one tap with no confirm** (settings.js:208), full-width red, right under the app version line. A user who is not tech-savvy may then not remember the password (email+password only). Fix: confirm dialog, and smaller visual weight.
3. **Med — native `confirm()`/`prompt()` for destructive actions** (settings.js:355, 531, 538, 602, 720; groups.js:586). They show the browser origin ("phounsiris-sketch.github.io says…"), the text is in a system font, and the buttons are English "OK/Cancel" on some phones, so Lao users can't tell which is which. Fix: a single in-app confirm modal, with a red confirm button labelled with the action ("Delete player").
4. **Med — `deleteManualPlayer` asks "Delete <name>?"** (settings.js:355) without saying that the player's bills/matches stay or break. It does go to the trash (settings.js:356), but the dialog does not tell the user so. Add "You can restore it for 30 days".
5. **Med — settings auto-save with only a 2s toast, and General saves on `onchange`** (settings.js:742-747). Min players changes with no save button; a mistaken number input saves silently. The `gMinPlayers` page also stops re-rendering while focused (settings.js:81). Acceptable, but a visible "Saved" tick next to the field is better.
6. **Low — setLanguage/setThemeMode re-render the whole page** (settings.js:127-128), so the scroll position jumps to the top. **[visual check]**
7. **Low — the palette grid has 5 swatches with 10.5px names** on small screens (styles.css:3801); this is more choice than most users need. Consider hiding it under "More".
8. **Low — Config tabs are 12px with 8px/4px padding** (settings.js:73), so ~34px tall; scrollable, and the active tab scrolls into view (good).
9. **Low — the Players list shows every user in `DB_CACHE.users`** (settings.js:246-249). With groups on, confirm this is the group's members only, otherwise it exposes everyone's phone numbers. **[needs a data check]**
10. **Low — the QR upload "delete" asks "Delete?"** (settings.js:720) without saying which QR.

## 5. Profile (js/profile.js, js/settings.js:94-118)

**Works:** Single card with one Save button; visibility per field with sensible defaults; DOB as three selects (the year is one tap away); the form is kept in memory (`aboutForm`) so re-renders don't wipe typing (settings.js:51, profile.js:48); only the display name is required; gear modal has smart defaults (first racket = main) and folds optional fields under "More details" (profile.js:347); sell limit explained (3 listings).

**Problems**
1. **High — a long form with many rows, each with its own visibility dropdown** (profile.js:68-77, 85-109). 8–9 small `vis-select` dropdowns at 11px/3px padding (styles.css:4301) are well under 44px and hard to tap on a phone. For a non-technical user, "who can see" ×9 is noise. Fix: a single "Privacy" preset (Everyone / My groups / Only me) with an "advanced" expander; keep the defaults.
2. **Med — unsaved changes are lost silently.** `aboutForm` is reset on every visit (settings.js:28) and nothing warns on navigating away with edits. Also the Save button is at the very bottom of a long page. Fix: sticky Save bar that shows when the form is dirty, plus a "discard changes?" prompt.
3. **Med — the display name hint is a toast only.** `saveAbout` shows `t("displayName") + " *"` as a toast (profile.js:153) rather than highlighting the empty field.
4. **Med — the photo "remove" and the story × buttons are small.** `story-del` is 22×22 (styles.css:4479) and it sits in the tile corner next to the image the user taps to open. On a 5-column strip (styles.css:4474) tiles are ~60px wide, so an accidental delete is likely; it does have a `confirm()` (profile.js:234). `removeAvatar` has **no confirmation** (settings.js:226-230). Fix: ≥40px target + confirm; "Remove photo" is in red text-link style directly beside "Change photo" (settings.js:105-106).
5. **Med — photos upload with only a "Loading/Uploading" 2s toast** (settings.js:216, profile.js:220). On a slow connection the user sees nothing for several seconds and may tap again (duplicate story photos). Fix: disable the control + a spinner in the tile.
6. **Low — day chips are `div` with onclick** (profile.js:106), so they are not keyboard-operable and have no `aria-pressed`; 6px/14px padding gives ~32px height. Same for the nav. Use `<button aria-pressed>`.
7. **Low — gear row is `div` with onclick** (profile.js:280); no keyboard access.
8. **Low — the `me` tabs use `role="tablist"` but the buttons lack `aria-selected`** (settings.js:144-146).
9. **Low — email field is disabled with no explanation**; add "to change your email contact admin" or hide it.

## 6. People (js/people.js)

**Works:** One read-only profile for everyone (own uid → own profile, people.js:12); blocked state is stated (line 46); phone/WhatsApp only if the field's visibility allows (line 49); the QR section has a loading state and an empty message (lines 74, 97); links straight to their activity.

**Problems**
1. **Med — the "⋯" menu (Block / Report) is a 36px button in the card corner** (styles.css:4318-4320), the only route to safety features, and it is just an ellipsis with an aria-label. Discoverability for reporting is low. Consider a visible "Report / Block" row at the bottom for the Buddies flow.
2. **Med — stats are numbers with terse labels** (people.js:62-68), e.g. "paid for group / total spent" show another person's money amounts to any group member. Confirm this is intended (it is derived from sessions, not covered by the per-field privacy). **[product decision]**
3. **Low — `tel:` and WhatsApp links are 'edit-btn' (small, ~30px)** (people.js:50-51); make them 44px primary-style actions since this is the main purpose of the page.
4. **Low — QR images `alt="QR"` and open via `onclick` on an `img`** (people.js:96); not keyboard accessible, and the alt text doesn't say whose or what type.
5. **Low — `userLink` is `span role="button"` without tabindex** (people.js:107), so it can't be focused.

## 7. Notifications and push (js/notify.js, js/push.js)

**Works:** Derived in-app list (no server); reminders and notices are separated with filters and counts; unread highlighting; individual dismiss and "Clear all"; the bell badge; tab badges on Polls/Sessions show what is waiting; push settings handle on / off / blocked / iOS-needs-Home-Screen / unsupported with plain messages (push.js:17-24, 95); a "send test" local button.

**Problems**
1. **High — notification onboarding is buried.** Push is enabled only by finding Settings → Notifications & data → "Turn on" (push.js:81-98; know-how §2 step 5). Nothing prompts a new user after joining a group, and the app depends on push for poll reminders and payment reminders. Fix: a dismissible banner on Home after the first poll/session ("Turn on reminders"), then the browser permission prompt on tap.
2. **High — the enable-push flow prints a technical log to the user.** On click a `<pre>` log appears with lines like "Device: other, browser tab", "Got device token", "Error: no-token — Firebase returned no token" (push.js:27-31, 37-62, 93). The errors are English and developer-oriented; a failure shows only that log and no translated "what to do". Fix: show the log only behind a "Details" toggle, and show a single friendly message ("Couldn't turn on. Check your connection and try again") on failure.
3. **Med — `enablePush` has no loading state or double-tap guard** (push.js:33-63): permission prompt + token + Firestore write can take seconds, the button remains tappable, and `renderSettings` is called after 1.5s (line 59).
4. **Med — opening the bell marks everything as read at once** (notify.js:224-225), including items below the fold, and the list is capped at 100 (line 180). The unread highlight disappears the moment the panel opens, so the user can't tell what was new. Fix: keep the highlight until the panel closes, or mark read on close.
5. **Med — "Clear all" has no confirmation and no undo** (notify.js:245-253, 270). Dismissals are stored per device only (line 27) so they come back on another phone. Make the button less prominent or add undo.
6. **Med — touch targets and structure.** The per-item dismiss `×` is 24×24 (styles.css:3347-3351) and is nested inside a `role="button"` item (notify.js:277-281), which is invalid for assistive tech and easy to hit by accident when tapping the row's right edge. The item has `tabindex=0` but no Enter/Space handler, so keyboard users can't open it. Filter chips are 12px/5px padding (styles.css:3255-3263), ~28px tall.
7. **Med — the panel is `position:fixed; top:64px` and closes on any outside click** (notify.js:296-299), with no focus trap, no Escape, and no `role`/`aria-label`. **[visual check]** the panel height on small phones with a Lao two-line header.
8. **Low — vote activity from every member creates an item per vote** (notify.js:71-83) with "everyone sees vote activity (engagement period)". In a 20-person group this floods the list with items that pushes cap at 100; consider grouping ("5 people joined Sat").
9. **Low — `_timeAgo` uses `minAgo/hAgo/dAgo`** (notify.js:287-294); check the Lao strings carry spacing/grammar correctly. **[visual check]**
10. **Low — `openFromHash` for `#settings` goes to group-members for push links** (push.js:123), which may surprise users who expected Settings.

## 8. Permissions (js/perms.js)

**Works:** `can()` mirrors the server rules; owner/admin get everything; creators always manage their own items (perms.js:55-68); rights come from the current group membership; the UI hides what the user can't do and the General tab shows a locked note (settings.js:739).

**Problems**
1. **Med — the Super Admin email is hard-coded in client JS** (perms.js:7). It also means the admin identity is public in the source. This is a security/ops point, not UX; the rules are the real guard.
2. **Med — permission names are developer-style (`createPoll`, `editSession`, `editBill`, `editConfig`)**. The labels in the modal come from i18n (`perm_*`, settings.js:303); make sure the Lao text says what the person can do ("can manage everyone's polls"). `createPoll` is actually "manage everyone's polls" (perms.js:11), which is easy to misread as "may create polls" (everyone can).
3. **Low — hidden vs disabled.** Where a button is hidden (e.g. Players' QR for non-editors, settings.js:173) the user gets no hint of who can do it. A one-line "ask an admin" on the empty/locked state would help.

---

## Workflow gaps (summary)

- Newcomer path: language -> register -> verify email -> (invite link lost) -> join group -> turn on push. Remove or automate steps 2-6.
- No in-app confirm modal, so 7+ native `confirm()` dialogs behave differently on each phone.
- No dirty-form protection anywhere (modal outside-tap, profile navigation).
- Errors are toasts only, 2 seconds, sometimes raw English.
- No offline indicator.

## Prioritised top 10

1. **(High) Default to Lao / offer language on the very first screen** — i18n.js:5, index.html:30.
2. **(High) Preserve the invite link through register + email verification and replay it** — auth.js:11-13, 213.
3. **(High) Shorten sign-up**: Google sign-in (docs already claim it), no confirm-password, show/hide eye, auto-continue after verification — auth.js:56-124.
4. **(High) Re-enable pinch-zoom** — index.html:5.
5. **(High) Prompt for notifications at the right moment and hide the developer log / show a friendly error** — push.js:27-93.
6. **(High) Collapse the profile's 9 visibility dropdowns into one privacy choice; sticky Save + dirty warning** — profile.js:68-110.
7. **(Med) Modals: don't close on outside tap when there is input; add role=dialog, Escape, sticky actions** — index.html:274, app.js:102-121.
8. **(Med) Replace native `confirm()/prompt()` with one in-app confirm** (clear verbs; mention the 30-day restore) and add confirms to Sign out, Remove avatar, Clear all notifications.
9. **(Med) Touch targets and semantics**: notif dismiss 24px, story-del 22px, vis-select, chips, link-btn; nav/chips/gear rows as real buttons; global `:focus-visible`; nav labels 10px.
10. **(Med) Settings > Group: merge the overlapping Members / Players / Players' QR cards and keep errors inline (not 2s toasts)** — settings.js:167-175, app.js:90.
