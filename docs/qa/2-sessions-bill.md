# QA 2: Sessions, bill, restaurants, payments, trash, pickers

Code-based review (no screenshots). Files: js/sessions.js, restaurants.js, payments.js, trash.js, datepicker.js, select.js, maps.js, css/styles.css, docs/know-how.md s4-6. Paths below are relative to projects/bughunters.

## Verdict
**Partly good.** The flow is well thought out: bill form with live totals, per-cost "pay card" with the payer's QR, one Messenger text, "My payments" with QR, trash with Undo.
The weak point is trust in the money flow: the same debt is shown as different numbers, editing a paid bill silently wipes the "paid" marks, and two people marking at the same time can overwrite each other.
Secondary: many small touch targets (28-34px), clickable `div`s with no keyboard or screen-reader role, and native `confirm()` dialogs for destructive actions.

---

## 1. Sessions list (js/sessions.js:184-326)

**Works:** status pill (upcoming / needs costs / waiting N / settled), 30-day window plus History, status and month filters, "You owe / Owed to you" banner at top, empty state with a create button, avatar stack, map link.

**Problems**
- **High, two different numbers for one debt.** The card shows `~grandTotal / players` as "each" (sessions.js:311). Dinner is shared only by diners, and "other costs for one person" go to one person. So "each" is wrong for most real sessions and disagrees with the person's real share. Suggest: drop it, or show "my share" (from `computeLedger`) for the logged-in user.
- **Med, accidental delete.** The trash icon sits in the same row as Edit buttons (sessions.js:319, `.session-actions .delete-btn` is about 28px high, no aria-label). The only guard is a native `confirm()` (sessions.js:1399), which is ugly on a phone and in Lao. Trash and Undo do exist, which softens it. Suggest: remove delete from the list and keep it inside the detail page, with a themed confirm dialog that names the session.
- **Med, flash of "No sessions".** `lastSessions=[]` renders the empty state with "+ New session" before the first snapshot arrives (sessions.js:195, 276-282). On a slow connection a user sees "no sessions" and may create a duplicate. There is no loading or error state for the list. Suggest: a `null` state that shows a skeleton or "Loading".
- **Med, card is a `div onclick`** (sessions.js:293). It has no role, tabindex or keyboard handler, and the court name and time can overflow.
- **Low, status filter is kept** across Recent/History (sessions.js:206), so a user can land on an empty list "No match" without knowing a filter is on. Suggest: show an active-filter chip with "clear".
- **Low, 10px uppercase status pills** (styles.css:2301-2304). Lao has no case, and 10px Lao script is hard to read. Needs a visual check.

## 2. Create session (js/sessions.js:398-500)

**Works:** nothing is saved until "Create session". Today, 18:00, 2 hours and the first court are prefilled. Minimum-player toast. Button is disabled during save.

**Problems**
- **Med, players start empty** (sessions.js:403). The creator is not preselected, although the comment at :397 says "me as the first player". The form requires picking players, but the hint is only an 11px gray line. Suggest: preselect me, and offer "select all group members" and "recent players".
- **Med, many players.** `_newSesChips` lists every user in one wrapped chip cloud (sessions.js:457). With 30+ people there is no search, no sort by recent, and chips are about 32px high (styles.css:265, padding 6px). Suggest: a search field and larger tap targets.
- **Low, duration** `parseFloat(this.value)||2` (sessions.js:438) silently turns a cleared field into 2, with no min check on the typed value.
- **Low, court select** reloads the whole form after 300ms (`sesPickCourt`, sessions.js:454), which can lose focus and the scroll position.

## 3. Session detail and edit form: the bill (sessions.js:880-1363)

**Works:** live totals (`_updateEditTotals`), a clear permission note (bill-only or details-only), defaults for payers from settings, the "Dinner after?" poll prefills diners, validation of payers before saving, a receipt photo.

**Problems**
- **High, editing silently erases "paid".** `saveSessionCosts` sets `data.settled = {}` (sessions.js:1343). Fixing a typo in the court duration after people already paid resets every paid mark and re-triggers the daily reminder push. There is no warning. Suggest: if any transfer is settled, show a confirm "N payments are already marked paid. Editing will reset them" and offer to keep marks for transfers whose amount did not change (compare by key plus amount).
- **High, the details modal changes money but keeps paid marks.** `showSessionDetailsModal` (sessions.js:371-374) rewrites `courtCost` and `grandTotal` when the court or duration changes on a calculated session, and leaves `settled` untouched. A "paid" mark can then sit on a different amount. It is the opposite behaviour of the full form and inconsistent. Suggest: use the same rule in both places (see above).
- **High (accessibility), the payer dropdown only lists players.** `_payerOptions(edit.courtPayer, edit.players)` (sessions.js:987, 1021). If the person who paid for the court did not play, they must first be added as a player (the "+ Add new" path calls `_editAddAndPick`, sessions.js:1162), which makes them share the cost. This is a hidden side effect. Suggest: allow a non-playing payer, which the ledger already supports (the "not playing" label at :755).
- **Med, other costs cannot be edited**, only removed with a 28px x button and no confirm (sessions.js:1033). A typo in an amount means delete and re-add. Same for shuttle rows (:1016). Suggest: tap a row to edit, and undo on remove.
- **Med, removing a player is silent.** `editTogglePlayer` (sessions.js:1186) clears the court/shuttle payer, but the player stays in the dinner diners, in "only for" other costs and as dinner payer. The bill can then charge someone who is no longer listed. Suggest: warn or clean up the related fields.
- **Med, form re-renders on every tap** (`renderEditForm` on every chip, qty or payer change, sessions.js:1197, 1230). With 20+ players the form flickers and loses focus; typed values in text fields are kept only because they write to `edit` on input. A visual check on a low-end phone is needed.
- **Med, "Calculate split" is a vague button label** (sessions.js:1066). It saves and publishes the bill to everyone (and triggers a "bill ready" notification, :1342). Suggest: "Save and publish bill" plus a short preview of "who pays whom" before publishing.
- **Med, structure bug in the form markup.** Fieldsets are opened and closed out of order (sessions.js:985-993, 1004, 1062: `</fieldset>` plus a new lock fieldset inside an open card). Browsers repair this, but the "locked" (disabled) areas may not cover the fields intended. A user with only bill rights could possibly edit details or the reverse. Needs a DOM check.
- **Med, dinner diners chips have no avatars and no select-all/none** (sessions.js:1050-1053), unlike the player chips.
- **Low, receipt upload is a bare file input** (sessions.js:1057). No camera hint and no progress; only a "Loading" toast.
- **Low, a dinner with total 0 is silently dropped** (`_editToSessionData`, sessions.js:1100). The user sees the dinner card, saves, and the dinner disappears.
- **Low, the shuttle quantity input is inline-styled** (sessions.js:1013), with no label and no visible focus. It is about 44px wide.
- **Low, the save buttons are at the very bottom** after a long form. A sticky save bar with the running total would help.

## 4. Bill splitting, rounding and the money flow (sessions.js:30-142, 659-776)

**Works:** per-cost cards with who paid, QR and each person's part; per-pair netting with a breakdown (`🏟️ 42,857 − …`); a Messenger text with check marks for paid.

**Problems**
- **High, three different amounts for the same debt.** The pay card shows exact shares (`fmtLAK` rounds to 1 kip, e.g. 42,857), "Per person" shows exact totals, but the settlement transfer is rounded to the nearest 1,000 per pair (sessions.js:125) and a net under 500 is dropped (:119). The user sees "42,857" on one card and "43,000" on the settlement and may pay either. The sum of rounded transfers also no longer equals what the payer paid, and no remainder is shown. Suggest: show one number per person ("you pay X to Y") as the main item, put the exact figures in a collapsed "details", and show a small "rounding difference" line.
- **High, "who pays whom using as few transfers as possible" is not what the code does.** The doc says it (know-how s5), but the code nets per pair of people only (sessions.js:102-132). With 3 payers (court, shuttle, dinner) one player can owe three people. That is easier to follow but more transfers and more QR scans. Either change the docs or add a "fewer transfers" option. Product decision.
- **High, anyone can mark the transfer paid and nothing records who.** `_canMarkTransfer` (sessions.js:780-787) lets the payer, the receiver or the session editor mark it; for a manual (non-login) player, anyone. The payer can claim "paid" without the receiver agreeing, and `settledAt` stores only time. Suggest: record `settledBy`, show "marked by X on date", and optionally a "payer says paid / receiver confirms" two-step.
- **High, lost update on simultaneous marking.** `settleTransfers` writes the whole `settled` map (sessions.js:1384-1391, `update(data)` at db.js:190) from a possibly stale snapshot. Two people marking different transfers in the same session within a few seconds can undo each other. `markGroupPaid` fires several of these in parallel (payments.js:125). Suggest: write field paths (`settled.<key>`) with dotted update or a transaction.
- **Med, the paid button is also the undo button.** When done, the button reads "Paid ✓" and a tap unmarks it, with no confirm (sessions.js:725). A wrong tap resets a real payment. Suggest: a separate small "Undo" link and a confirm.
- **Med, "Mark paid" has no confirm** in the session view (sessions.js:728) while "My payments" does ask (payments.js:120). Inconsistent.
- **Med, other costs use the dinner QR** (`"dinner"` type at sessions.js:698). Labelled "Dinner and other" in payments.js:103, but the pay card for drinks shows "scan to pay" with the dinner QR, which may be a different account from the court QR. Fine if intended; says nothing to the user.
- **Med, the bill page is very long.** Cost cards, pay cards (with large QR per cost), settlement, per person, messenger text. A first-time user has to scroll past big QR codes to find "what do I pay". Suggest: put a "You pay X to Y" summary for the logged-in user at the top, and collapse the rest.
- **Low, `fmtShort`** (930K, 1.25M) is used for totals (sessions.js:667, 310), so cards show rounded totals that do not match the exact figures below (1.25M vs 1,248,571). Use full numbers where money is owed.
- **Low, the Messenger text** is built with Thai/Lao-incompatible emoji alignment (`⬜`, spaces for indentation, sessions.js:1473-1480). Visual check in Messenger/WhatsApp.

## 5. Dinner and restaurants (js/restaurants.js)

**Works:** optional picker with search, duplicate check with "use existing", photo, map pin, one review per person (editable), review only for diners.

**Problems**
- **Med, the new-restaurant form is heavy inside a modal** (restaurants.js:147-165): name, location, a Leaflet map, a paste field, a file input, in one scrolling modal. A map inside a scrolling modal fights touch scrolling (pan vs scroll). Needs a visual check on a phone. Suggest: a full page or a step "name, then place".
- **Med, the duplicate message shows only after pressing Save** (restaurants.js:188-193), as a block under the form and possibly off-screen. Suggest: check while typing the name, and scroll to the warning.
- **Med, rest-item rows are `div onclick`** (restaurants.js:133), no role, no keyboard. Search `type="search"` is fine.
- **Med, review box:** star buttons are about 34px wide (styles.css:4636, `padding:0 2px`, `font-size:30px`). The review stars are announced only as "1".."5" with no group label (restaurants.js:238). Saving does not show the saved state on the form, only a toast.
- **Low, the review draft** is in memory (`_revDraft`), and a real-time snapshot re-render (`renderSessionDetail`) rebuilds the box from the draft; fine, but the draft survives a delete only partly.
- **Low, a restaurant cannot be edited or deleted from the UI** here (the doc says creator or owner can delete; not in this file). A typo in the name is permanent for everyone (shared across groups). Check where delete lives.
- **Low, `deleteMyReview` uses native `confirm(t("delete") + "?")`** (restaurants.js:275), which reads "Delete?" with no object.

## 6. My payments (js/payments.js)

**Works:** the best screen in the area. One total per person, QR strip, items with breakdown, "I received" for money owed to me, confirm before bulk-marking.

**Problems**
- **Med, QR codes small.** Thumbnails in `qr-strip` open full screen on tap (payments.js:106). Good, but there is no "save QR" or "copy account", so a user must screenshot. Suggest: a "Save image" button in the viewer.
- **Med, big primary "Mark all paid to X" sits right under the item list** (payments.js:65). It is the main button on the page, and users may press it after paying only one of several sessions. The confirm shows the total, which helps. Suggest: allow checking individual sessions before bulk-marking.
- **Med, no loading state.** `renderPayments` shows "You owe 0" and "All paid up" until the session snapshot arrives (payments.js:34-45), which can wrongly tell someone they owe nothing on a slow connection.
- **Low, `pay-item` is a `div onclick`** (payments.js:91).
- **Low, a paid bill is not visible here** (open transfers only, sessions.js:174). No history of "what I paid", which would help in disputes.

## 7. Trash and restore (js/trash.js)

**Works:** moves to trash in a batch, an Undo toast, 30-day countdown, restore and delete-forever with confirm.

**Problems**
- **Med, the Undo toast lasts 8 seconds** (trash.js:104). A slow connection or Lao reading speed may miss it. Suggest: 12-15 seconds, and keep the trash entry visible in Settings.
- **Med, non-admin users see only what they deleted** (trash.js:122). If the group admin deleted a session by accident, the creator cannot restore it, and vice versa. The hint text should say so.
- **Med, restore overwrites with `batch.set(ref, e.data)`** (trash.js:74) with no check that a document with that id exists. For sessions this is safe (new ids), but a restored session also restores old `settled` marks and reminders as they were. Acceptable; note it.
- **Low, `deleteTrashForever` icon button** is 28-30px and sits next to Restore (trash.js:146-147); no confirm text names the item.
- **Low, errors in the trash page** show the raw message in an empty-state box with no retry.

## 8. Date and time picker (js/datepicker.js)

**Works:** replaces the OS picker with a themed popover, keeps `.value` ISO, week starts Monday, "Today" button, opens above if no room.

**Problems**
- **Med, touch targets.** Calendar cells are `aspect-ratio:1` in a 300px popover, about 36px (styles.css:2873, datepicker.js:87). `dp-nav` is 34px (styles.css:2848). Below the 44px target. Use a wider popover or bigger cells on mobile.
- **Med, accessibility.** The trigger is a `button` with no `aria-haspopup`, no `aria-expanded`, and the popover has no `role="dialog"` or focus move (datepicker.js:23-35, 69-74). The real `<label>` is not linked to the new button, so screen readers do not hear "Date". Focus is not returned on close.
- **Med, time picker steps by 5 minutes** (datepicker.js:162). A game at 18:50 is fine, but 18:45 is OK and 19:10 OK; a start at 18:07 cannot be set. Existing minutes not on a 5-step are rounded in the highlight only (`mmNear`), but kept in the label, which is confusing.
- **Low, no way to type a date**, and past dates are not blocked for new sessions. Probably fine.
- **Low, a month change with year wrap** looks correct (`Math.floor(m/12)`).
- **Low, `resize` closes the popover** (datepicker.js:203). On Android, opening the keyboard or the address bar changes the size and can close it unexpectedly.

## 9. Custom select (js/select.js)

**Works:** keyboard (arrows, Enter, Escape), `role=listbox/option`, opens up when little space, "+ Add new" inline for admins, edit pencil per row.

**Problems**
- **Med, the menu closes on any page scroll** (select.js:217-219). On a phone, a slight finger drift or the keyboard opening closes it. Combined with the 320px max height, a long player list is hard to use. Suggest: no close on scroll, plus a search box when there are more than 10 options.
- **Med, the edit pencil is 30px** (styles.css:2634) and sits next to the option. A mis-tap opens the court editor instead of selecting it. Admin only.
- **Low, the trigger has `aria-expanded` but no accessible name** (no `aria-labelledby` to the form label, select.js:46-50) and the option `aria-selected` is missing (select.js:98).
- **Low, `aria-label="Edit"` is hard-coded English** (select.js:110), not translated.
- **Low, on a native select the OS picker is much better for Lao on small phones.** A custom one adds work; keep it, but test with a long Lao court name (the option text is not truncated, check wrap).

## 10. Map picker (js/maps.js)

**Works:** free OSM, "use my location", paste a Google link, draggable marker, status line with an open-map link, clear button, a hint to use full links for short links.

**Problems**
- **Med, offline or slow tiles:** only the script load has a fallback (maps.js:26, 118). If tiles do not load the map is a grey box with no message, and a user may think pinning is broken. The paste or "use my location" paths still work, so say so.
- **Med, a tap on the map sets the pin**, but with a scrolling modal a pan gesture may place a pin by accident; there is no "confirm location" step, and the lat/lng line shows raw numbers (maps.js:147). Needs a visual check.
- **Low, geolocation errors** show one generic "noGps" toast for denied permission, timeout and unsupported (maps.js:153-157). Tell the user to allow location.
- **Low, the `map-paste` input has no label**, only a placeholder (maps.js:96).
- **Low, `maps.app.goo.gl` short links** are not expanded; the hint says so but only after typing.

---

## Workflow gaps (summary)
- Entering a bill takes about 6 sections; no "copy last session" (same players, same payers, same court). Biggest time saver for a weekly group.
- No preview of the final "who pays whom" before publishing the bill.
- No edit history or audit line on a bill ("changed by X, was 120,000").
- No "I paid" notification to the receiver; the only reminder is the daily push.
- Native `confirm()` for delete session / review (sessions.js:1399, restaurants.js:275, trash.js:90, payments.js:120): replace with one themed dialog that names the item and amount.
- Empty / loading / error: loading is missing on the list and on "My payments"; errors show only as toasts (`_permError`), and no retry.

## Accessibility summary
- Touch targets under 44px: qty buttons 28 (styles.css:308), remove-btn 28 (:344), edit-btn / delete-btn about 30 (:1632-1660), chips about 32 (:265), cs-edit 30, dp-nav 34, dp-day about 36, image-viewer-close 40, rev-star about 34. Only `.session-tab` (min-height 44) meets the target.
- Clickable `div`s without role/tabindex: session card, chips (sessions.js:460, 998, 1052), rest-item, pay-item, QR images.
- Icon-only buttons without labels: list delete (sessions.js:319), remove-btn (:1016, 1033), image close has one (:871).
- Text sizes 10-11px for hints, pills and breakdowns; Lao script needs more size and line height. Visual check needed.
- Contrast: text-muted on card looks acceptable on both themes by value (dark #8293a8 on #18304f, light #56677d on white). Status pill colours need a measured check at 10px.

## Where a visual check is still needed
Bill form fieldset nesting and lock behaviour; modal with map on touch; date popover size on a 360px screen; Lao text wrap in chips, pills, cost cards and the Messenger text; status pill contrast.

---

## Top 10 (priority order)
1. **Editing a calculated bill wipes all paid marks without warning** (sessions.js:1343), and the details modal does the opposite (:371). Warn, and keep marks for unchanged transfers.
2. **One debt, three numbers**: exact on the pay card, exact in "Per person", rounded to 1,000 in the settlement (sessions.js:125). Show one main number, the rest as details, plus a rounding line.
3. **Lost update on marking paid**: the whole `settled` map is overwritten (sessions.js:1384, db.js:190). Use field-path updates or a transaction.
4. **Who marked paid is not recorded and the payer can mark themselves** (sessions.js:780). Store `settledBy`, show it, consider receiver confirmation.
5. **"Paid ✓" button also unmarks, with no confirm** (sessions.js:725). Separate undo, add confirm; add confirm for "Mark paid" for consistency.
6. **Payer must be a player** (sessions.js:987): paying for the court forces sharing it. Allow a non-playing payer.
7. **Loading states missing** on the sessions list and My payments: "No sessions" and "All paid up" show before data arrives (sessions.js:195, payments.js:55).
8. **Touch targets and keyboard/screen-reader roles** across qty, remove, chips, cards, date popover and select menu (see accessibility summary).
9. **Native `confirm()` for destructive actions** and delete icon in the list row (sessions.js:319, 1399). Use one themed dialog, move delete into the detail page, lengthen the Undo toast to 12-15s.
10. **Bill entry is long and re-renders on every tap**: add "copy last session", preselect me and add search for players, a sticky total/save bar, and a preview of who-pays-whom before publishing.
