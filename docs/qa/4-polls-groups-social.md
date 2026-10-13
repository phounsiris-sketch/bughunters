# QA 4 — Polls, Groups, Social, Public zone (code-based UX review)

Files read in full: js/polls.js, js/groups.js, js/social.js, js/public.js; CSS rules for the classes they use; know-how sections 4 (and map). No screenshots, so all spacing and contrast findings need a visual check on a phone.

## Verdict: PARTLY good for users

- The core loop is sound: one plan per poll, Join/Skip radio, live vote count (n/min), a deadline banner, and a creator-only "Confirm" that makes a session. Safety design (18+ buddies, contact shown only after Accept, blocking, reports) is thoughtful.
- The weak spots are mobile ergonomics (small tap targets, no keyboard/ARIA on the vote control, one-tap destructive or social actions), a deadline rule that is confusing for evening games, and many silent or terse states.
- A new person can reach the vote in roughly 4 taps after the invite link, but the app drops them on the Dashboard, not on the poll they were invited to.

---

## 1. Poll list and poll card (js/polls.js)

### Works
- Active/History split, status + month filters, empty state with a "create first poll" button (polls.js:156-165).
- Card shows plan, deadline banner (amber when under 3h, grey when closed), n/min counter, joined avatars, and a clear "waiting for {name} to confirm" message when closed (polls.js:229-236).
- Answer labels are translated whatever language the poll was created in (polls.js:51-55).

### Problems

| # | Sev | Evidence | Why it hurts | Suggestion |
|---|-----|----------|--------------|------------|
| P1 | High | polls.js:246-247 vote row is a `div` with `role="radio"` and `onclick` only. No `tabindex`, no key handler, no `role="radiogroup"` wrapper, no label. CSS .poll-option has padding 10px and about 40px height (styles.css:1005-1015). | Screen-reader and keyboard users cannot vote at all. Row height is borderline for the 44px minimum. This is the main action of the app. | Use real `<button role="radio">` or `<input type=radio>` in a `<fieldset>` with a legend. `min-height:48px`. Add `:focus-visible` ring. |
| P2 | High | polls.js:305 tapping the same answer again clears the vote with no feedback. Hint is 11px muted text (polls.js:240). | An accidental double-tap, or a tap on the already selected answer, silently removes the user from the game. They think they are in. The creator sees n-1. | Make a selected answer non-toggling. Add a separate small "Clear my answer" link. Show a toast, "You joined" / "You skipped". Reinforce the state with a text tag ("Your answer"), not only colour and a dot. |
| P3 | High | polls.js:77-86, 94 deadline = midnight BEFORE game day; created within 1h of that or later = game start. Example: a poll made at 20:00 for tomorrow 18:00 closes in 4 hours. Banner shows "{left} · Fri 00:00". | Typical Lao/Thai groups decide on game day. Users see "closed" the morning of the game and cannot vote. Only the creator can proxy-vote (polls.js:267). "Fri 00:00" is also ambiguous (start or end of Friday?). | Let the creator pick the deadline in the create form (default: 2-3h before the game). Show "Closes Thu 23:59" or "Closes tonight at midnight". Offer a creator "Reopen voting" button. |
| P4 | Med | polls.js:266-281 for the creator: "+ Add votes for others", Confirm, and a red Cancel Poll button stacked in the card. Cancel uses native `confirm()` with the text "Cancel Poll?" (polls.js:489). Cancel button is `padding:8px;font-size:12px`. | The cancel button sits right under Confirm and is small. Native confirm is out of style, has no consequence text ("N players will be notified"), and cancelled polls cannot be undone. | Move Cancel into a "..." menu. Use a styled modal: "Cancel this poll? 6 people who answered will be notified." |
| P5 | Med | polls.js:268-273 and 437-485 Confirm has no confirmation or summary; it creates a session and jumps to the session page (polls.js:482). | A single mis-tap commits the roster from a still-open poll. The "Confirm" label does not say that a session and a bill are created. Voting closes for everyone immediately (know-how section 4). | Tap opens a sheet: "Confirm for Sat 18:00 with 6 players: A, B, C...? Voting will close." Then confirm. |
| P6 | Med | polls.js:376-384 the proxy-vote modal lists ALL members, each with 3 pills (padding 5px 10px, about 28px high, styles.css:1907-1914) in a 400px modal. | Pills far below 44px, easy to mis-tap on a long roster. No search, no "set all". Modal title is long in Lao. | Give the pills `min-height:44px`. Add search and a "show only unanswered" filter. Show a counter ("4 answered / 12"). |
| P7 | Med | polls.js:215 "created by" + name; polls.js:251 voter names as a comma-separated string, plus the "Joined players" chips (polls.js:260-263) repeat the same names. | Duplicate lists make the card tall on a phone. 20 names in a row of text is hard to read. | Show names only in the chip box, or collapse the long list with "+8 more". The Skip list can stay collapsed. |
| P8 | Med | polls.js:200-209, 253 the n/min counter shows `3/4` as small grey text at the right; the "counts as joining" tag is 10px muted (polls.js:250). | Not obvious why the first answer has "/4". A 10px muted label is below readable size and low contrast. 10px Lao glyphs are worse. | A progress bar, "3 of 4 needed", at the top of the card. Raise the tag to at least 12px with a normal contrast colour. |
| P9 | Low | polls.js:315-321 the vote is optimistic and the error toast is only shown on failure. No pending/"saved" feedback. | On a slow Lao connection the user sees an instant change and cannot tell whether it synced. | Show a small "Saving... / Saved" tick, or an offline hint. Needs a device test on 3G. |
| P10 | Low | polls.js:221 date line `fmtDate · time (hours)`; the court name + location on one line (polls.js:222-223). | Long Lao court names plus location and a map link wrap unpredictably. Visual check needed. | `overflow-wrap:anywhere`, put the map link on its own row. |
| P11 | Low | polls.js:152-154 the filter bar is shown even with 0 or 1 polls. | Extra noise for a first-time user. | Hide filters when fewer than about 4 polls. |

### Create poll (polls.js:502-609)
- Works: sensible defaults (today, 18:00, first court, Join/Skip), empty state when no courts exist with a button to Settings, toast on success.
- Problems:
  - Med: native `date`/`time` inputs, default date is TODAY (polls.js:505). Most polls are for a future day, and a same-day poll then closes at game time. Default to the next usual day from the group's settings (usualDays/usualTime exist, groups.js:397). A past date or time is not validated (submitPoll polls.js:581). Low.
  - Med: answers are free text with a "×" remove button of 28px (styles.css:344-349). Below 44px. Adding answers beyond Join/Skip is an advanced feature shown in the main flow, and "first answer counts as joining" is only a muted 11px hint (polls.js:564). Hide custom answers behind "More options".
  - Low: duration is a number input with `step=0.5` (polls.js:547); `parseFloat(this.value)||2` silently resets a bad value to 2. A stepper (as used in public.js:272) is friendlier.
  - Low: validation uses a generic toast "fill all fields" (polls.js:581-582), with no field highlighting and no `aria-invalid`.
  - Low: after create the user lands in the list, with no "Share to LINE/WhatsApp" prompt. Members only learn of the poll through notifications. A "Share/Notify the group" action is the most natural next step.

---

## 2. Groups (js/groups.js)

### Works
- Welcome card for zero groups plus three clear nav cards: create / join with link / find public group (groups.js:367-388).
- Join modal shows the group description and city, asks the starting level (optional) and, for ask-to-join, a message to admins (groups.js:543-550).
- Pending-request state is visible in the switcher and group list, with a Cancel (groups.js:343-347, 379).
- Owner delete requires typing the group name (groups.js:586-588). Good. Leave and remove-member use confirm. Reset invite code has confirm (groups.js:682).
- Invite box offers QR, link and Share (native share sheet) (groups.js:663-671).

### Problems

| # | Sev | Evidence | Why it hurts | Suggestion |
|---|-----|----------|--------------|------------|
| G1 | High | groups.js:538-541 after joining via link: `switchGroup(gid)` goes to `showPage("dashboard")` (groups.js:316). The invite flow does not land on the open poll. | A first-time user is told "join Friday badminton" and arrives on a Dashboard they have never seen. The 60-second goal (join, vote) takes extra hunting for the Polls tab. | After joining, route to Polls if an open poll exists (else Dashboard). Show a one-time banner: "You are in. Vote on Friday's game". |
| G2 | High | groups.js:508-513, 502-504 "Join with link" is a paste field with a placeholder `https://…#join=…`. `parseInviteText` accepts the link or `gid.CODE` but gives only a generic toast "invite link isn't valid" (groups.js:514). | Users who copy only part of a LINE message, or whose link got a trailing character, get a dead end. The most common error ("expired code after admin reset") looks the same as a typo. | Differentiate: "Link is incomplete" vs "This code was reset: ask the admin for a new one" (groups.js:541 shows invalid for any write error). Add a Paste button. Offer scan QR. |
| G3 | Med | groups.js:341-357 a pending group is a `disabled` row; the switcher gives no way to cancel from there. The three actions below are stacked `btn-secondary` buttons. | OK, but the three actions are visually equal; "create group" is not what 90% want. | Put "Join with link" first. Move "Create" lower. |
| G4 | Med | groups.js:417-447 the create form puts type, join mode, city, currency, min players, max points (31/30), description, language in one long card, with only usual days/time under "More details". | A non-technical organiser meets 9 decisions before creating. "Max points 31/30" and "min players" are not needed at creation. Joining mode for `private` collapses to a single "invite" button (groups.js:414) which looks like a choice but is not. | Create with name + city + private/public only. Everything else lives in group settings, with defaults. Hide the "who can join" row for private groups, or show it as text. |
| G5 | Med | groups.js:441, styles.css:265-275 usual-day chips: `padding:6px 14px; font-size:13px` gives about 32px height; the chips are `div` elements with onclick (not buttons, no focus, no `aria-pressed`). Same pattern for buddy "looking for" chips (social.js:173) and the poll create answers. | Touch target under 44px, not keyboard-operable, state conveyed only by colour. | Make chips `button` with `aria-pressed` and `min-height:44px`. |
| G6 | Med | groups.js:726-729 member row: the name area is a `role=button` div, but has no tabindex. The "Permissions" button is `edit-btn` (padding 6px 10px, 12px font, about 28px high; styles.css:1631-1640). | Admins managing 20+ members on a phone tap the tiny button. Row tap opens the profile, button opens permissions: two competing targets. | Make the whole row open a member sheet (role, level, perms, remove). 44px min height. |
| G7 | Med | groups.js:759-784 permission modal: the Remove button is inside the same modal as Save (groups.js:773), red, directly below a list of checkboxes. Confirm only via native `confirm`. Role segment `admin` has hint text only. | A scroll-and-tap on a phone can land on Remove. Making someone admin has no summary of what they can do. | Move Remove to the end behind a divider, or into a separate "..." action. Add a short checklist per role. |
| G8 | Med | groups.js:712-720 join requests: Approve and "Decline" (delete-btn) side by side, 12px, about 28px high, no confirmation; the decline silently deletes. The applicant is never told (groups.js:755 just deletes). | Wrong tap = lost applicant with no way back. Applicant sees their request vanish without an explanation. | Larger buttons, undo toast, and notify the applicant ("Request not accepted"). |
| G9 | Low | groups.js:676-678 `shareInvite`: on desktop it copies; if the clipboard is unavailable it shows the link inside a toast (that disappears). Invite input is readonly and selectable. | On older Android WebViews the link in a toast cannot be copied. | Fall back to selecting the input and a "Copy" button. |
| G10 | Low | groups.js:198 removal from a group shows only a toast "left group" and silently switches group. | The user may not understand why their polls disappeared. | Persistent dialog: "You were removed from {group}". |
| G11 | Low | groups.js:325 header title is a button with the group name plus a "▾" caret; no `aria-label`/`aria-haspopup`. Long Lao names are not truncated explicitly. | Truncation in the header is not guaranteed. Visual check needed. | `max-width` + ellipsis, `aria-haspopup=dialog`. |

---

## 3. Public zone: games, groups, courts (js/public.js)

### Works
- Open games: clear status chip ("You're in", "n slots left", "Full · waitlist n"), avatars + empty slot dots, price each, level range, directions link. Waitlist auto-promotion is explained by the flow (public.js:132-166, 174-213).
- Host game form: stepper for slots and duration, price estimate from court price, a live summary, "game too soon" guard (2h) (public.js:312).
- City filter, location-based sorting only if the user allows it; falls back silently (public.js:34-40).
- Empty states with a primary action for games and groups (public.js:123-127, 338-339).

### Problems

| # | Sev | Evidence | Why it hurts | Suggestion |
|---|-----|----------|--------------|------------|
| U1 | High | public.js:157-161, 174-213 "Join game" and "Leave game" are one tap, no confirm. Leaving promotes the first waitlister, so a mis-tap on "Leave" lets someone else take the slot. Joining a game means you are on the hook for paying (price shown on card). | Accidental taps cause real social cost (no-shows, lost slot). Joining commits a stranger-meeting with no read of the rules (price, level, location). | Joining: bottom sheet "Join Sat 18:00, 40,000 ₭ each, level P–CL?" with Join / Cancel. Leaving: confirm + "Your slot goes to the waitlist". Add Undo toast. |
| U2 | High | public.js:106-109 `_visibleGames` filters by city, so a user whose city setting differs sees an empty list; the toggle is a `select` at top. Default city comes from the group (public.js:18-22). | The first visit may show "No open games" because of an invisible filter, not because there are none. | Show the active filter in the empty state: "No games in Vientiane. Show all cities". |
| U3 | Med | public.js:46-47 five tabs in one row: `dash-tab` buttons (Open games, Play buddies, Market, Public groups, Courts). Lao labels are long. | Probable horizontal overflow/truncation on a 360px phone. Visual check needed. | Horizontally scrollable tab strip with snap and a visible fade, or a 2-row grid. Consider moving Market and Buddies under "More". |
| U4 | Med | public.js:152 player avatars (26px) are the only tap target to open a profile; `span` + onclick, no label. Name only in `title` tooltip (hover, no touch). | Touch users cannot see who is in. 26px target. Names are invisible. | List first names under avatars or show a "Players (3)" expandable. |
| U5 | Med | public.js:155-156 host's only action is "Cancel game", no confirmation of consequences (cancelGame uses native confirm, public.js:216). No way to remove a player, edit, or message players. | Hosts with a no-show or a troublemaker have no tools. Cancelling does not say whom it notifies. | Host sheet: edit time/court, remove a player, cancel with a reason. |
| U6 | Med | public.js:259-262 the court select has an inline "+ Add court" link button (`link-btn`, text only) which writes to the SHARED public directory (directoryOnly:true). | Users may add duplicates or typos into the shared directory. | Search/suggest before add; label "Adds to public directory". |
| U7 | Med | public.js:312 `gameTooSoon` toast only. Price field can be 0 (`price>=0`), and `date` defaults to tomorrow (UTC based `toISOString`, public.js:229) — around midnight Bangkok time this can give the wrong date, because the date is computed in UTC. | Edge-case wrong default date on evenings (UTC vs UTC+7: after 17:00 UTC the UTC date is already the next day, so "tomorrow" = day after). Hosts may post the wrong day. Compare polls.js:496-499, which fixes this with a local date. | Use a local-date helper (`_todayIso()` + 1). |
| U8 | Low | public.js:164 closed games show a hint, and the join button is `disabled` with no `aria-disabled` reason and low-contrast style (visual check). | The user cannot tell why Join is greyed out. | Replace the button with text "Joining closed at 00:00". |
| U9 | Low | public.js:365-370 whole court card is clickable and opens a modal (`onclick` on div, `cursor:pointer`), and inner phone link uses `stopPropagation`. | No keyboard access; nested interactive elements. | Make the title a button. |
| U10 | Low | public.js:115-117 `updatePublicBadge` always hides the badge (`display:none`) but still computes it. | Dead code or an intentionally disabled badge; users get no signal about waitlist movement. | Clarify, or wire to real notifications. |

---

## 4. Play buddies and invites (js/social.js:76-302)

### Works
- Off by default, 18+ via date of birth, who-may-invite policy (groups / played / anyone), max 5 open invites, no links or 6+ digit numbers in messages, contact only after Accept, the sender is never told about Ignore (social.js:1-9, 213-221, 257, 285-289).
- The invite modal states a safety hint (social.js:253).

### Problems

| # | Sev | Evidence | Why it hurts | Suggestion |
|---|-----|----------|--------------|------------|
| B1 | High | social.js:97, 167-170 if no date of birth is on the profile the feature is a locked card pointing to Profile ("buddyNeedDob"). The date of birth lives in private data (`_myPrivate`) that is loaded asynchronously (social.js:100-102), and the first render happens before it arrives. | A user who HAS a DOB may briefly see "add your birth date" (flash/false negative). A user without one gets a dead-end card that never says why DOB is needed. | Show a loading state until `_myPrivate` is loaded. Explain: "Needed to confirm you are 18+. Only your age is used." |
| B2 | Med | social.js:285-286 Accept / Ignore, 12-14px buttons in `game-actions`; Accept reveals your phone number to a stranger with NO confirmation text and no preview of what is shared (social.js:279-281). | One tap shares a phone number. Phone visibility already depends on the privacy settings, but this button does not say so. | Add one line under the buttons: "Accepting shares your WhatsApp number with {name}". Link to privacy. |
| B3 | Med | social.js:285-287 incoming invite: no Report/Block entry on the invite card; only through profile tap (buddy-head onclick) then "...". | The abuse flow is two screens away from where harassment happens. | Add a "..." menu (Block / Report) on each invite and buddy card. |
| B4 | Med | social.js:289 sender sees "Sent" forever (by design, Ignore is hidden), but invites older than the game date vanish via `_inviteUpcoming` with no message. | Users wait for an answer that will never come, with no expiry or "No reply yet" copy. | Show "Sent 2 days ago — no reply yet" and auto-expire. Keep the privacy of Ignore. |
| B5 | Med | social.js:238-246 invite modal: the game dropdown mixes the user's own public games with "Pick date & court"; when none exist the custom fields show (display toggled in JS). Message input is `maxlength=120`. Errors are toasts (`noLinksInMessage`) with no field-level hint. | The `select` first option is a real game, so "custom date" is hidden behind a dropdown choice. Message rejection for digits >=6 may confuse ("why can't I write a time like 190000?" mostly fine; but court phone numbers cannot be shared) — fine, but unexplained. | Explain the rule inline: "No links or phone numbers: contact opens after accept." |
| B6 | Low | social.js:140-144 filters (looking for / level) are two selects at 50% width, with Lao level labels `levelShort · levelName` long. Visual check. | Possible truncation in the select text. | Test with Lao; allow wrap or shorten. |
| B7 | Low | social.js:187 `editBuddy()` resets the form then calls renderPublic, while setup form is shown with no Cancel button (social.js:182-183). | After tapping the edit pencil there is no "Cancel", only "Save"/"Turn off". Navigating away loses edits silently. | Add Cancel. |

---

## 5. Market and gear board (js/social.js:397-462)

### Works
- Public market with city filter, price in the seller's currency, photo, seller tap-through, and WhatsApp with a prefilled "ask about {item}" text. Blocked users hidden. Seller can Mark sold / Remove from sale.

### Problems
- Med (social.js:426, 434-436): WhatsApp appears only if the seller's phone is visible (`canSeeField`). If hidden the buyer only gets "View seller" and nothing explains how to contact the seller. Add "Seller hasn't shared a phone: ask in your group" or an in-app message.
- Med (social.js:428): the photo is an `img` with `alt=""` and an onclick to enlarge, not keyboard-accessible. Add alt = item name.
- Med (social.js:433): "Mark sold" is one tap, no confirm, probably deletes/flags the listing. Add confirm or Undo.
- Low (social.js:413): no price shows "Ask for price" (fine). No listed-date or "sold" history. A listing never expires (listedAt exists, social.js:406). Add "Listed 3 weeks ago" and auto-hide after 60 days.
- Low (social.js:403): the market loads ALL gear with `forSale==true` across all groups and filters on the client; fine for now, a performance concern later. `_gearBoard` is overwritten from the same list (social.js:408), so a public listing set loaded here may leak into the group board filter (`dbFindById(DB_CACHE.users, g.uid)` protects it). Low risk.
- Low (social.js:459-460): gear board rows are `div` with onclick, no price emphasis. Fine.
- No report option for a listing (scam risk); only via seller profile. Add "Report listing".

---

## 6. Reports and safety (js/social.js:20-74, 338-395)

### Works
- Block has confirm and an explanation (`blockHint`); report has reason + details and tells the user whether it goes to group admins or the owner (social.js:64). Reports inbox for admins with Mark handled + confirm. The reported person is never told who reported.

### Problems
- High (social.js:70-71): after "Report sent" nothing else happens; the user is not offered to block. Also no limit/duplicate protection visible (spam reports). Suggest "Report sent. Also block this person?".
- Med (social.js:377-381, 388-394): the admin sees the REPORTER's name (`reportedBy`) and marking handled DELETES the report; there is no notes/status, no history, and no way to ask the reporter more. Two admins can both act. Suggest status (new/handled), a note, and keep for audit. Also state in the reporter's modal that group admins can see who reported: that contradicts the privacy expectation of "never told" (only the reported person is protected). Low-to-Med; make the wording explicit.
- Med (social.js:45-55): the "..." menu opens a modal with a "Block" button (secondary style) and a red "Report" button of equal weight. Fine, but there is no "Report" inside the poll / game card where trouble occurs. Add a "Report a problem" link to game and poll cards.
- Low (social.js:50-52): blocking hides a user in lists (isBlockedPair) but a blocked person still counts in a shared group poll or session roster; users may expect a block to remove them from voting lists. Clarify in `blockHint` that shared groups are unaffected. Needs product decision.
- Low: `repDetails` has no counter; `maxlength=300`. Minor.

---

## 7. Cross-cutting

- Native `confirm()`/`prompt()` is used for: cancel poll, leave group, remove member, reset code, cancel game, delete group, resolve report (polls.js:489, groups.js:586/624/682, public.js:216, social.js:34/389). On some in-app browsers (LINE/Facebook WebView) these are blocked or unstyled and the text is not Lao-aware. Replace with one reusable styled confirm sheet showing consequence text.
- Toast-only error handling (many `showToast(e.message)`: polls.js:299, 424, 484; public.js:212): raw Firebase `e.message` can be shown in English to a Lao user. Map to translated messages.
- Touch targets: `.edit-btn`/`.delete-btn` (about 28px), `.remove-btn` 28px, `.proxy-pill` (about 28px), `.chip` (about 32px), `.view-btn` (9px padding, about 36px), `.seg-btn` (about 34px) are all under 44px (styles.css:265, 344, 1631, 1907, 2245, 3819). `.level-opt` is the only one set to 44px (styles.css:4237). A global `min-height:44px` for these classes is the fastest accessibility win.
- Focus: only `.cs-trigger` has `:focus-visible` (styles.css:1728). Chips, poll rows, seg buttons have no visible focus.
- Contrast: `.poll-deadline.soon` amber text `#f59e0b` on a light tint (styles.css:4109) is likely below 4.5:1 in the light theme. Muted 10-11px grey labels (polls.js:240, 250, 272) are likely below AA. Verify with a contrast tool on both themes. Visual check needed.
- Lao text length: the card headers (`poll-header` with author + status) and tab strips use fixed single-line flex; check wrapping with Lao strings, in particular `votingClosesIn`, `countsAsJoining`, and the button "ຢືນຢັນແຜນ (n ຄົນ)".
- Many views show only `t("loading")` text without a skeleton and no timeout/retry on failed loads (`_publicGroups`, `_market`, `_buddies` all fall back to an empty list on error, so an offline user sees "no groups" instead of "cannot load. Retry"; public.js:64, social.js:104, 410).

---

## Workflow gaps: first 60 seconds for a newcomer

1. Open invite link, sign in/register (hash survives? Needs a device test: auth.js:213 only runs `joinFromHash` after login if GROUPS_ON).
2. Join modal: level picker (optional) then "Join" (fine, 1 tap). 
3. App lands on Dashboard (groups.js:316), not on the poll. Newcomer must find Polls, open the card, tap Join. Target: 2 taps after join. Fix G1.
4. No first-run hint on the vote control ("tap Join to say you are coming; you can change it until {deadline}").
5. No share or reminder from the app; the creator must paste the link into chat manually.

Steps that could be removed: level picker at join (make it later), most create-group fields (G4), custom poll answers (create form), mode/game-type selection for a simple poll (GROUPS_ON adds two more segmented controls via `playModeFieldsHtml`, polls.js:550).

Dead ends: invalid link (G2), buddies locked without DOB (B1), unreachable market seller with hidden phone, "Join" disabled on closed games with no explanation (U8), pending request that is deleted silently when declined (G8).

---

## Prioritised top 10

1. P1 + G5 + touch targets: make vote rows, chips, pills and small buttons real buttons with ARIA/focus and at least 44px (polls.js:246, styles.css:265/344/1631/1907).
2. P2: stop the tap-again-to-clear toggle on the vote; add explicit feedback and "Clear" action (polls.js:305).
3. P3: replace the midnight-before deadline with a creator-chosen deadline and clear wording; add Reopen (polls.js:77-86).
4. G1: after joining by link, land on the open poll with a "vote now" banner (groups.js:316, 538-541).
5. U1: confirmation sheet for join and leave of public games, with consequence text and Undo (public.js:157-161, 174-213).
6. P5 + P4: Confirm and Cancel poll as styled sheets with roster/notification summary; move Cancel away from Confirm (polls.js:266-281, 489).
7. B2 + B3: tell the user that Accept shares the phone number; add Block/Report on invite and game cards (social.js:285, 226).
8. G2 + G8: specific invite-link errors, notify declined applicants, and add undo on decline/approve (groups.js:514, 718-719, 755).
9. G4: slim the create-group form to name + city + type; move the rest to settings (groups.js:417-447).
10. Cross-cutting: one translated, styled confirm component replacing native `confirm/prompt`, and translated error messages and retry states for offline loads (see Section 7).

## Needs a visual/device check
- Five-tab public strip and group header with Lao text on 360px width.
- Real height of poll rows, chips, pills (rendered, not computed from CSS).
- Contrast of amber deadline banner, 10-11px muted text, in both themes.
- Whether the `#join=` hash survives the login/registration redirect.
- Behaviour of native `confirm()` inside LINE/Facebook in-app browsers.
