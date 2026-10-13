# Godsmash cross-cutting QA (design system, i18n, PWA, a11y)

Repo: pm-hub-it-addon/projects/bughunters (app v61). Read-only review. No screenshots, so every visual item below needs a device check (flagged "VISUAL").

## Verdict
- Foundations are good. Theme tokens are used (591 `var(--` uses), en/la have identical key sets (1050 each, no placeholder mismatches), and the SW is network-first with a Firestore offline cache.
- The weak spots are accessibility basics (zoom disabled, no reduced-motion, thin focus styles, no dialog semantics), tiny text and touch targets, and a PWA update that silently reloads the page.
- The first-run default language is English for a Lao-first audience.

## (a) Design system / CSS

**A1 [High] Tiny text.** 78 `font-size` declarations are 9-11px (56x 11px, 20x 10px, 1x 9px). Example: the bottom-nav label is 10px (styles.css:783). Others at 166, 628, 797, 1057, 1441. For Lao script (tall marks) and for older or outdoor users this is hard to read. Suggest a 12px floor, with 13px for body-like labels. Add `--fs-xs/sm/md` tokens, because 14 distinct sizes are in use (13px x70, 12px x60, 11px x56, 14px x51).

**A2 [High] Touch targets below 44px.** About 40 fixed sizes of 20-40px sit on interactive controls:
- `.qty-controls button` 28px (309)
- `.remove-btn` 28px (345)
- `.bell-btn` 36x34 (3166)
- `.image-viewer-close` 40px (2095)
- `.stepper button` 40px (4214)
- `.score-counter button` 38x44 (4291)
- `.trash-icon` 36px (4030)
- `.avatar-more` 24px (1564)
- `.tab-count` and the `.wl` 20px badges (4372, 4270) are probably display-only, which is fine.

The remove button, stepper and score counter are the high-frequency, mistake-prone ones (mid-game on a phone). Suggest a `min-height/min-width: 44px` rule on `button`, or a padded `::after` hit area where the visual must stay small. VISUAL: check the 360px layout after the change.

**A3 [Med] Low-contrast `--text-dim`.** Used 19 times (e.g. 1238, 1297, 2767, 3068, 3841). Estimated, not measured: light `#8495aa` on `#fff` is about 3:1, and dark `#5f7088` on card `#18304f` is about 2.7:1. Both fail AA 4.5:1 for small text. Suggest `--text-dim` is for decoration only, or darken it (light `#66778c`, dark `#8a9bb2`). Run a contrast tool to confirm.

**A4 [Med] Focus states are nearly absent.** There is 1 `:focus-visible` rule (`.cs-trigger`, 1728). `outline:none` is set on `.form-input` (193), `.form-select` (234) and `.cs-option` (1773). Inputs get only a border-colour change (197), which is weak. Buttons, `.dash-tab`, nav items and chips have no custom focus ring. Suggest one global rule: `:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`.

**A5 [Med] Hardcoded colours, 190 hex/rgba values outside `--` declarations.** Most dark-mode wiring is done properly through `[data-theme=light]` overrides and `--poll-card-*` tokens. Remaining fragile spots:
- Dark/light overrides are spread across the file: `body:not([data-theme="light"])` (2949-2974) and `[data-theme="light"] .x` blocks (1803, 2316, 3114, 4198, 4436-4538) in ~45 places. Every new component must remember both.
- `!important` is used to win theme fights (`.level-opt` 4239, 4425-4438; 4482 forces `--primary` on many selectors).
- Status colours are repeated hex values: `#f59e0b` x10, `#16a34a` x9, `#dc2626` x8, `#2563eb` x8, alongside `--orange/--red/--blue` tokens (lines 6-8). The tokens are not used for them.
- Toast is `background: var(--accent)` with `color:#0a1628` (815). That is fine in dark but needs a VISUAL check on light.
- Suggest semantic tokens (`--success`, `--warn`, `--danger`, `--info`, each with light/dark values), and replace the repeated hex.

**A6 [Low] Near-duplicate variants.**
- `.btn-share` is defined twice (472 and 1680).
- `:root{color-scheme}` is duplicated (1697-1700).
- `border-radius` has 10 values (12px x40, 10px x39, 8px x17, 6px x11, 14, 9, 20, 4, 3).
- Buttons are `.btn-primary/secondary/danger/cancel/share`, but many ad-hoc buttons (`.seg-btn`, `.stepper button`, `.bell-btn`, `.level-opt`) are separate classes with their own padding and size.
- Suggest radius tokens (`--r-sm 8 / --r-md 12 / --r-lg 20`) and one `.btn` base with size modifiers.

**A7 [Med] Safe area / viewport.**
- `viewport` has no `viewport-fit=cover` (index.html:5), so `env(safe-area-inset-bottom)` in the bottom bar (styles.css:773) always resolves to 0. In an installed iPhone PWA the bar can sit tight to the home indicator. Adding `viewport-fit=cover` then also requires `env(safe-area-inset-top)` on the header (not used anywhere) and on the toast (`top:20px`, 811). Status bar style is `black-translucent` (index.html:11), so VISUAL check on a notched iPhone is required.
- `min-height:100vh` (1 use, `dvh` 0 uses): on mobile browsers the address bar makes 100vh taller than the visible area. `.modal-card max-height:80vh` and `.lg-sheet 85vh` have the same issue.
- Only one `@media` query exists (max-width 380px, line 3800, a palette tweak). 320-360px is not specifically handled. Risks:
  - `.toast` is `white-space:nowrap` with `padding:12px 24px` (817-819), so a long Lao message will be clipped or overflow.
  - 33 `text-transform/letter-spacing` and 45 `nowrap` rules, but only 30 `text-overflow`.
  - `body{overflow-x:hidden}` (64) hides overflow rather than fixing it.
- VISUAL check at 320px: bottom nav (5 items, 10px labels), the stats tables, and the session cost table (`td.num`, sessions.js:734).

**A8 [Low] Z-index.** The scale is ad hoc: 50 (fab), 100 (nav/header), 200 (modal), 250, 300, 320, 400, 1000 (toast and splash), 1001 (undo toast). It works today but is not documented. The toast (1000) can show over the modal, which is OK. Move to tokens (`--z-nav/--z-modal/--z-toast`).

**A9 [Low] Fonts.** `@import` of Google Fonts at the top of styles.css (line 1) is render-blocking and not precached by the SW. The font stack is `Montserrat, Noto Sans Lao` (57), so Lao text depends on the Noto download, and Lao-first users should have Noto first. Offline on first use, Lao falls back to the system font. Several elements set `line-height: 1/1.1` (603, 793, 1521, 1667), and Lao stacked vowel marks can clip at those values. VISUAL check with Lao text.

## (b) i18n

**B1 [High] Default language is English.** `currentLang = localStorage.getItem("lang") || "en"` (i18n.js:4); there is no `navigator.language` check. A first-time Lao user lands on an English login screen, with a small "ລາວ" toggle at the top right. Suggest defaulting to `la` when `navigator.language` starts with `lo`, or `la` for everyone (the main audience), and keeping the toggle on the login page.

**B2 [Low] Completeness is good.** en = 1050 keys, la = 1050, none missing, no placeholder (`{x}`/`%s`) mismatches. Four la values are identical to en: `superAdmin`, `pushLocalTitle`, `nVoted`, `headerTitle` (probably intentional for the brand name; check `superAdmin` and `nVoted`). 295 en keys have no static `t("...")`/data-i18n use, but many are built dynamically (`role_`, `perm_`, `badge_` ...), so they are not provably dead.

**B3 [Low] Hardcoded English outside `t()`.** The scan found very little:
- `aria-label="Close"` (sessions.js:871), with no `data-i18n-aria`.
- `aria-label="Create poll"` on the FAB (index.html:262), with no `data-i18n-aria`. Note that `applyI18n` only swaps aria-labels that have `data-i18n-aria`, so these two stay English for screen-reader users.
- The static HTML fallback text in the splash ("Badminton Club") and header-sub ("Book & split in seconds") is overwritten by applyI18n once it runs. Brief flash only.
- Error toasts may show raw Firebase `err.message` (not exhaustively checked).

**B4 [Med] Number, date and currency formatting.**
- All amounts use `toLocaleString("en-US")` (app.js:149, 173, 182; groups.js:117; public.js:170; sessions.js:165, 734, 735, 1433). Lao users read the same comma format and currency symbol, so this is acceptable, but it is duplicated 9 times in 4 files. Suggest one `fmtNum()`.
- Currency symbol is appended after the number ("50,000 ₭"). That is OK for LAK; check the THB/USD convention.
- `fmtDate` (app.js:213) is custom and Lao-aware (good). It prints day-month-year with a short month, and uses no Buddhist-era year (fine for Laos, check for Thai groups).
- Only profile.js:133 uses `lo-LA`. Time formatting was not verified here.

**B5 [Med] Text expansion.** Lao strings are about 2-3x longer than English for short labels (examples: `hShort` 3x, `anyLevel` 2.3x, `joinGame` 2.25x, `moreActions` 2.25x). Lao has no spaces between words, so wrapping happens only at phrase breaks the browser guesses, and `white-space:nowrap` rules (45) plus fixed-width chips are the risk. Chips, bottom-nav labels (10px), tabs (`.dash-tab`, `.seg-btn`) and the toast are the places to check. VISUAL check in `la` at 320-360px.

## (c) PWA

**C1 [High] Update flow is silent and can interrupt the user.**
- sw.js `install` calls `skipWaiting()` and `activate` calls `clients.claim()`. app.js:385-392 then runs `window.location.reload()` on `controllerchange`.
- A user who is typing a bill or a score when a new version lands will have the page reloaded under them. This is a data-loss risk. There is no "update available" prompt.
- Positive: it checks `reg.update()` on load and on every visibility change (app.js:399-404), and assets are network-first (sw.js:77-93), so new versions arrive fast.
- Suggest showing an "Update available. Refresh" toast and reloading only on tap or when no modal or form is open.
- Manual bump needed: `CACHE_NAME` (sw.js:31) and `APP_VERSION` (app.js:383) must be edited together, otherwise the old cache is never evicted.

**C2 [Med] Precache list is incomplete.** `ASSETS` (sw.js:32-58) omits `groups.js, maps.js, restaurants.js, public.js, stats.js, profile.js, social.js`, all of which index.html loads (lines 302-318), plus the leaflet and qrcode vendor files, the css `@import` fonts and the CDN scripts (Firebase, Chart.js). Runtime caching on first fetch covers returning users, but a first install that goes offline before visiting those screens fails. Also `cache.addAll` fails the whole install if any one URL 404s. Icons `icon-512` and `icon-maskable-512` are not listed either. Suggest generating the list from index.html.

**C3 [Med] Offline behaviour.**
- The app shell loads offline (navigate fallback to index.html, sw.js:90).
- Firestore has `enablePersistence({synchronizeTabs:true})` (firebase-config.js:32), so reads and queued writes work.
- There is no offline indicator: `navigator.onLine`/`offline` events are used nowhere. A user may think a payment was saved when it is only queued.
- Non-Firebase requests that fail return `Response.error()`. No offline page copy is shown.
- Suggest a thin "Offline, changes will sync" banner.

**C4 [Low] Manifest.**
- `start_url` is `./index.html` (OK), `display: standalone`, `orientation: portrait` (locks landscape; fine for phones, but tablets and accessibility users might rotate).
- Missing `id`, `scope`, `lang` (`lo`/`en`) and `categories`.
- `description` is English only.
- `purpose:"any"` plus a separate maskable icon is correct.
- `theme_color` is the same in manifest and meta (`#0d9488`). It does not follow the user's light/dark theme or the public-zone colour.

**C5 [Low] No install prompt.** No `beforeinstallprompt` or `appinstalled` handler exists. The guide tells users to install manually (know-how s2), and on iPhone it is required for push. Suggest an in-app "Install" card in Settings (Android: `beforeinstallprompt`; iOS: a short Share > Add to Home Screen hint, in Lao).

**C6 [Low] Loading states.** `#splash` (index.html:20) with `aria-live="polite"` is shown until auth is known, with a CSS spinner. There are no skeleton placeholders for the polls/sessions lists and no `<noscript>` message. The splash text is English until `applyI18n` runs. If Firebase CDN scripts fail (blocked network in Laos), the splash may sit indefinitely. Check whether there is a timeout fallback.

## (d) Accessibility

**D1 [High] Zoom is disabled.** `maximum-scale=1, user-scalable=no` (index.html:5) fails WCAG 1.4.4 (Resize text) and blocks low-vision users from pinching. Suggest removing both. If iOS input zoom is the reason, set input `font-size:16px` instead (current `.form-input` is 14px, line 192).

**D2 [Med] No reduced-motion support.** `prefers-reduced-motion`: 0 matches in styles.css, though there are many transitions, a spinner and toast fades. Add a global `@media (prefers-reduced-motion: reduce)` reset.

**D3 [Med] Modal is not a dialog.** `#modal` (index.html:274) has no `role="dialog"`, `aria-modal`, or `aria-labelledby="modalTitle"`. `openModal()` (app.js:102) focuses the first input only (nothing when there is no input), has no focus trap, doesn't restore focus on close, and has no Escape handler for it (Escape appears only 4 times in js, so check which components). Overlay tap closes it (index.html:274). The toast (`#toast`, 270) has no `role="status"`/`aria-live`, so screen readers never hear confirmations or errors.

**D4 [Med] Clickable non-buttons.** 28 `<div>`, 11 `<img>`, 6 `<span>` and 2 `<input>` elements carry `onclick` (static count in js and index.html). Only 6 `role="button"` and 3 `tabindex` exist, so about 5 of the 28 divs have a role or tabindex. Example: receipt image `onclick=openImage` (sessions.js:1056). Keyboard and screen-reader users cannot reach these. Suggest `<button>` for actions, and `role=button tabindex=0` + Enter/Space handling where a div must stay.

**D5 [Low] Labels.**
- `.form-label` elements in index.html have no `for=` (e.g. login email and password, lines 40-50), so tapping the label does not focus the input and screen readers do not associate them.
- aria-label coverage is decent (34 in js, 5 in html). `aria-expanded` appears only 3 times (group switcher, dropdowns).
- `aria-live` only on the splash.

**D6 [Low] Alt text.** 18 `<img>` in js, 16 with `alt=`; the 2 without are receipt thumbnails (sessions.js:1056). Avatars use `alt=""` (app.js:224), which is right when the name sits beside them. Receipt, QR and map images should have meaningful alt text.

**D7 [Low] Lang attribute.** `<html lang="en">` is static and is set to `lo`/`en` by `applyI18n` (i18n.js:2232). Good. It is wrong only in the first moments before JS runs.

## Prioritised top 10
1. B1 default to Lao (or by `navigator.language`) on first run (High, tiny change).
2. D1 remove `user-scalable=no/maximum-scale=1`, set inputs to 16px (High).
3. C1 replace the silent auto-reload with an "Update available" prompt, reload only when idle (High, data-loss risk).
4. A2 raise controls to 44px: qty, remove, stepper, score counter, bell, viewer close (High).
5. A1 lift the 10-11px text to 12px+, starting with the bottom nav and chips (High).
6. D3 modal dialog semantics, focus trap and return, `role=status` toast (Med).
7. A4 + D2 global `:focus-visible` ring and `prefers-reduced-motion` (Med).
8. A3 fix `--text-dim` contrast in both themes (Med).
9. C2 + C3 complete the SW precache (generate it) and add an offline banner (Med).
10. A7 `viewport-fit=cover` + safe-area top/bottom, `dvh`, toast wrapping, and a 320px visual pass in Lao (Med, needs device check).

Needs visual check: A2, A5 (toast on light), A7, A9, B5, and C6 (splash timeout).
