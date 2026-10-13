# QA 3 — Dashboard and Stats (code-based UX review)

Scope: js/dashboard.js, js/stats.js, matching css/styles.css, js/i18n.js. Read-only. No screenshots; items marked [VISUAL] need a phone check.

## Verdict: partly good for users

- The feature set is solid and mostly kindly worded (provisional tags, folded last-5 games, gentle tips, podium, drill-down on rows). Empty states exist almost everywhere.
- The weak spots are meaning and density: "rating" (1500, Elo) and two arrows per row are never explained at the point of use; Lao uses one word (ຄະແນນ) for rating, game points and "best score"; the Ranking page and the Dashboard stack too many cards.
- Cross-tab consistency is broken in a few visible places (the same four cost types use two colour palettes on one tab, "activity" is counted two ways, people lists are not A→Z).

Legend: file:line refer to the current repo state.

---

## 1. Dashboard shell (tabs, period filter, cards above tabs)

Works: three tabs plus a period pill row; the month chart auto-scrolls to the current month (dashboard.js:97); the breadcrumb on a player's activity page (dashboard.js:449-454).

Problems
- **Med — Default first impression is often empty.** dashPeriod starts "monthly" and dashTab "leaders" (dashboard.js:10-11). Early in a month, five leaderboard cards each say "No data" (dashboard.js:170-172). A newcomer sees five empty boxes. Suggest: if the month has no data, fall back to the previous period automatically with a small "Showing Quarter" note, or collapse all-empty cards into one line.
- **Med — Tap targets under 44px.** .dash-tab padding 8px + 13px font ≈ 34px (styles.css:1164-1170); .period-btn 6px/12px padding ≈ 32px (styles.css:1195, 1499-1501). The Stats tabs are fine (min-height 44, styles.css:4370). Suggest: min-height 44px on both; copy the .session-tab rule.
- **Low — Dashboard has two top cards before the tabs** (homeLevelCardHtml, gearBoardCardHtml, dashboard.js:70-71) so the leaderboard starts below the fold on a phone. [VISUAL] Consider making the level card a one-line summary here and keep the full card only on Stats.
- **Low — Naming collision.** Dashboard tab "Leaderboard" and Stats tab "Ranking" are both "ອັນດັບ" in Lao (i18n.js:1204, 1506). Users cannot tell which "ranking" they are on. Suggest "ອັນດັບກິດຈະກຳ" vs "ອັນດັບການຫຼິ້ນ" (or similar).

## 2. Dashboard > Leaderboard tab

Works: podium design is friendly, rows are tappable with drill-down (dashboard.js:167), ties share rank, "warn" cards deliberately have no podium (dashboard.js:175).

Problems
- **Med — Five podium cards in a row = long scroll** (dashboard.js:147-152). Each podium is ~180px+ with avatar, medal, value and rank block. Suggest: show "Most active" and "Played most" first, put the other three under "More" or horizontal swipe.
- **Med — Negative boards are public shaming.** "Voted Join but didn't come" and "Came without voting" are listed by name (dashboard.js:151-152, i18n.js:1199-1200). In a friendly Lao group this can cause friction. Suggest: owner/admin setting, or show only to admins, or reword as neutral ("Joined late"). Product decision, flag for MartinyBob.
- **Med — "Most active" icons with bare numbers.** Sub line shows three tiny icons (12px) and numbers with no labels (dashboard.js:139-144). Casual users will not know polls/shuttle/dinner order. Suggest a one-time legend under the card title or the words in the row (e.g. "5 votes · 8 games · 2 dinners").
- **Low — "Paid most for the group" mixes data sets.** Paid counts only calculated sessions (dashboard.js:121-124) while "Played" counts all sessions (dashboard.js:119). Numbers will not reconcile for a person looking at both. Add "(calculated sessions only)" or include a footnote.
- **Low — "+N" overflow is dead text** (dashboard.js:204): not tappable, no way to see the rest. Suggest "Show all" expanding the list.
- **Low — Hint text 11px muted** (dashboard.js:154). Contrast of --text-muted on card in dark theme #8293a8 on #18304f is roughly 4:1 [VISUAL/contrast tool]; below 4.5:1 for small text.

## 3. Dashboard > Activity tab

Works: totals strip (polls/sessions/dinners), per-person bars with n/total, tap a name for a detail page with tiles, a poll-answers bar and a session list.

Problems
- **High — "Activity" is counted two different ways.** Leaderboard "Most active" = all poll answers + games + dinners (dashboard.js:134-138); Activity tab rank = games + Join votes + dinners + polls created (dashboard.js:477). Same word, different numbers and different ordering; the rank number on the Activity tab will not match the podium. Pick one definition and reuse one function.
- **Med — "Show-up %" is misleading.** rate = min(played, voted Join)/voted Join (dashboard.js:498), where played includes games without a Join vote. A player who always plays but votes rarely gets 100% on 1 vote, and one who votes Join 10 times and plays 5 gets 50% regardless of which polls. It is also explained only by a tooltip (title, not available on touch) and an 11px footer line (dashboard.js:503, 510). Suggest computing per poll (voted Join AND played ÷ voted Join), and showing the explanation inline under the first row.
- **Med — Rows for everyone, including zero-activity, with a rank number** (dashboard.js:473-476, 501). All users in DB_CACHE.users get a numbered row, so ranks 12..40 are all 0/0 rows. Long scroll, little value. Suggest hiding zero-activity rows behind "N players with no activity".
- **Med — Player filter list is unsorted** (dashboard.js:444). Shared view should be A→Z by the rule; this iterates DB_CACHE.users in storage order. Sort with the same name sort used elsewhere.
- **Low — Colour-only bands for show-up** (good/mid/low colours, styles.css:3910-3913). The number is shown so meaning is not lost, but "—" for none is dim (--text-dim, light theme #8495aa ≈ 2.9:1 on white, fails AA).
- **Low — Per-player page shows money (Share, Paid out) to every member** (dashboard.js:551-552). Probably intended in an in-group app; flag as a privacy decision.

## 4. Dashboard > Spending tab

Works: clear order (total, top spenders, by month, per person); amounts in short form with full amount in tooltip; stacked bars on one scale with written amounts under each (dashboard.js:261-271) — the best-designed component here; chart scrolls and starts at the current month; empty state exists (dashboard.js:247).

Problems
- **High — Two palettes for the same four cost types on one screen.** Month chart uses .t-court blue #2563eb, shuttle amber #f59e0b, other violet #8b5cf6, dinner green #10b981 (styles.css:4566-4569). Per-person bars and legend use --viz-* : court blue, shuttle ORANGE, other GREEN, dinner AMBER (styles.css:4509-4512). So "green" means dinner in one chart and "other" in the other, amber = shuttle vs dinner. Users will misread. Suggest: use --viz-* in both (and in the dead Chart.js code, see below). Note the --viz set looks designed for colour-blind separation; keep it.
- **Med — Meaning carried by colour only in both charts.** Segments have only a title tooltip (dashboard.js:266) and no pattern/label; with 4 types and tiny segments (min-width 3px, styles.css:4522; a 2% segment in the month stack is a sliver) users on phones cannot tap them. Detail for the month column is shown on tap (good) but per-person amounts are written (good). Suggest keeping the written amounts for the month detail visible by default for the selected (latest) month so the chart is never "colour only".
- **Med — No hint to tap a column and detail box is empty at load** (dashboard.js:331, styles.css:4575). Auto-select the current month on render and call showVbarDetail; add "Tap a month". [VISUAL]
- **Med — Period pills do not affect the month chart** (dashboard.js:245 uses allSessions; chart always shows the year). Tapping "Quarterly" changes totals, top spenders and per-person but not the chart; mildly confusing. Add a subtitle "This year" (already "By month 2026") or highlight the bars that fall in the selected period.
- **Med — "Top spenders" podium rewards spending most** (dashboard.js:359-365). The value is a person's cost share, which mostly follows attendance. Gold medal for biggest bill share is odd, and the wording "Top spenders" may read as "who paid" (that is the leaderboard "Paid most"). Rename "Biggest share" or drop the podium and rely on the per-person list.
- **Low — Only calculated sessions count** (dashboard.js:88, 94) but the card says "N sessions" with no note; an open session's cost is missing from totals. Add "(settled sessions only)".
- **Low — Dead code**: _createSpendingChart (dashboard.js:384-419) looks for #spendingChart which is never rendered, and uses a third palette (teal court). Remove, or it will bring back a third colour set.
- **Low — vbar-col aria-label is the month only** (dashboard.js:326); the amount is only in title. Screen reader users get no value. Include amount in aria-label; add aria-live to #vbarDetail.
- **Low — Sideways scroll without any affordance** (styles.css:4558); Jan..Sep hidden after auto-scroll. [VISUAL] a fade edge or "◀ Jan" cue.

## 5. Stats > Ranking tab

Works: "my" card with level badge, form strip of W/L, folded last-5 games (stats.js:249-261); provisional "x/10" tag and settled-first ordering (stats.js:157); pair names A→Z in shared lists, me-first in personal list (stats.js:255); good empty text "add scores in a session's Games tab" (i18n.js:440); highlights card (best pair / best score).

Problems
- **High — Rating number has no label at the point of use.** Rows show "1532 · 60% · 6ຊ – 4ພ" (stats.js:335, 350) and the card shows a bare number under "My level" (stats.js:238). A casual player does not know "1532" is a rating, why everyone starts near 1500, or how it differs from their Level (BG/N/S/P). Two competing scales (level set by people, rating computed) sit in the same card. Suggest: label once ("Rating 1532"), show level chip and rating as separate items, and in the Lao UI call the rating "ຄະແນນສະສົມ"/"ເລດຕິ້ງ" (decision) so it is not confused with game points.
- **High — Lao word collision: ຄະແນນ means rating, game points and "best score".** ptsShort "ຄະແນນ" (i18n.js:1523), ptsPerGame (1530), ratingWord "ຄະແນນ" (1483), recapRating "ຄະແນນ" (1692), bestScore "ຄະແນນດີທີ່ສຸດ" (1342), help text uses it for rating (1699). A row like "+8 ຄະແນນ" next to "1532 ຄະແນນ" cannot be read. Pick distinct words: rating vs points.
- **High — Two arrows per row with the same shape and different meanings.** Rank arrow ▲3 (places) and rating arrow ▲12 (rating points) are stacked in the right column (stats.js:220-224, styles.css:4588-4592). The only explanation is title="..." (not shown on touch). Suggest one arrow by default (rank movement) and rating delta only on the "me" card/progress; or add tiny captions ("places", "pts"), and a one-line legend under the period toggle ("▲ places gained since the 1st").
- **Med — "This month" mixes scopes.** In month mode, W-L and win % are the month's, but the rating and the order are all-time (stats.js:341-350, 325-336); rank arrows always mean "since the start of the month" even when "All time" is selected (stats.js:170-172, 221). A player 1st all-time with a 0-3 month still sits at rank 1. State it ("Ordered by overall rating") or compute month rating.
- **Med — Ranking page is long: my card, badges grid (8 tiles, all locked for new players, stats.js:319, 906-922), period, highlights, pair list, player list, no limit.** The rankings the page is named for start far down. Suggest moving badges to Progress or collapsing them ("2/8 badges"), and showing top 10 with "Show all"; pin "me" row at the top of each list if outside the top 10.
- **Med — Tapping a pair row goes to Head-to-head but does not select that pair** (stats.js:333): the user lands on their own record. Preselect h2hPairA/h2hPairB and scroll to Pair vs pair; otherwise the tap looks broken.
- **Med — Help (?) is too heavy** (stats.js:267-275, i18n.js:1699). It explains Elo, K = 32, FIDE, World Football Elo, BWF World Tour 12,000 points and "52 weeks". A casual player needs three lines: "Everyone starts at 1500. Beat stronger opponents = gain more. Fewer than 10 games = still settling." Move the BWF/FIDE comparison under a "More" toggle. Also the button is 28px (styles.css:4489); make it 44px hit area.
- **Low — Provisional tag `3/10 games`** (stats.js:228) is good but does not say "ranking not final"; hint is a title only. Use text like "3/10 — still settling" once, then the short tag.
- **Low — Row text may wrap** with pair name + "x/5" tag on 360px wide phones (stats.js:335, styles.css:4259-4260 no ellipsis). [VISUAL]
- **Low — NEW tag blue #2563eb 10px** (styles.css:4591) small; contrast on dark card low. [VISUAL]
- **Low — Up/down colours** #22c55e on white (styles.css:4251) is about 2.3:1; .rk-chg uses #16a34a. Unify to the darker green; arrows give a non-colour cue, which is good.

## 6. Stats > Head to head (including Pair vs pair)

Works: me-first default and A→Z person list (stats.js:388); three clear groupings (vs pairs, with partner, vs singles); pair vs pair defaults are sensible and only offers valid opponents (stats.js:435-443).

Problems
- **Med — Rows look tappable but are not**: .rank-row has cursor:pointer (styles.css:4253) and h2h rows reuse it (stats.js:374). Add a non-clickable modifier, or make them drill into the list of games.
- **Med — Pair vs pair is the most interesting part and is at the very bottom of three unbounded lists** (stats.js:408-411). Add anchor link at the top ("Pair vs pair ↓") or move it above "with each partner".
- **Low — "W–L 9–4, +38 pts" without explaining "+38"** (stats.js:407). "pts" is the point difference; label it "points difference".
- **Low — Selects are native `<select>` with long "Name & Name" labels** (stats.js:444). OK on mobile; names are plain text and A→Z. Fine.
- **Low — Pair vs pair shows only avatars, not names, in the score row** (stats.js:460). Add names under avatars; avatar-only identity is hard when avatars are default initials.

## 7. Stats > Progress

Works: period choice (1m/Quarter/6m/1y), hollow Start dot legend (stats.js:597), best/toughest pair with kindly wording, tips capped at 4.

Problems
- **Med — Sparkline has no values or dates** (stats.js:591-599): preserveAspectRatio="none" stretches dots into ovals, no min/max labels, no x-labels; with 30+ games it is 30 dots. Add the start and end values and highest/lowest rating as text; draw dots only when ≤ 12 games.
- **Med — Player picker is unsorted and not me-first** (stats.js:495-500): order is Object.keys(players) plus unshift if missing; H2H has me first then A→Z, Progress does not. Use the same sorter.
- **Low — "Streak" in a period card is the all-time current streak** (stats.js:523 uses p.streak), not the streak in the chosen period. Label it "Current streak" or compute for the period.
- **Low — Tips are fine, but "Toughest pair" label names a partner not a pair** (stats.js:564-571, i18n:1329). It is a partner you play with, not an opposing pair; "Toughest partner" avoids confusion with "toughest opponent" tip.
- **Low — Empty state** only says "no games in this period" (stats.js:508); suggest a button "Show 6 months".

## 8. Monthly recap image

Works: share sheet on phones, download on desktop, simple tiles; localized via t().

Problems
- **Med — Text can overflow the canvas.** Name at 84px with no max width (stats.js:965); partner at 38px and rival pair names at 34px starting x=560 (stats.js:1003-1006) have only ~440px; long Lao or Latin names/pairs will run off the right edge. Use measureText and scale or wrap.
- **Med — Lao font may not be ready when drawn**: font set to "Montserrat, 'Noto Sans Lao'" (stats.js:958) with no document.fonts.load before drawing, so Lao may render with a fallback on first use. Await document.fonts.ready.
- **Low — No preview or confirm before opening the share sheet**; on desktop it both downloads and opens a viewer (stats.js:1016-1019). With zero games the image shows a 0% empty ring (stats.js:976); disable the button or show "No games this month".
- **Low — Emoji in canvas header** (stats.js:963) renders differently per device. [VISUAL]
- **Low — Recap button is small text 12px in the badges header** (styles.css:4336); make it a clear primary call on the my-stats card.

## 9. Cross-tab consistency and accessibility summary

- Colour: two palettes for cost types (see Spending). Leaderboard/ranking use accent teal, spending uses blue/amber/violet; win/loss green/red repeated (#16a34a/#dc2626) consistently. OK.
- Card styles: leaderboard cards use .leader-card, Activity uses .act-row inside one .card, Stats uses .rank-list; three row patterns for "person + number". Acceptable, but row heights/avatar sizes differ (30 / 30 / 32). Low.
- Names order: shared views A→Z holds in pairs (stats.js:70-75) and h2h; broken in Activity player filter (dashboard.js:444) and Progress picker (stats.js:495). Leaderboards and ranking are ordered by value, which is correct for ranking.
- Escaping: getUserName already returns escaped HTML (polls.js:61), so unescaped use in dashboard.js:184,199,502 is safe but inconsistent with escapeHtml(getUserName()) elsewhere (dashboard.js:263); double escaping risk if someone "fixes" it. Low.
- Touch targets under 44px: .dash-tab, .period-btn, .how-btn (28px), .recap-btn (12px font), badge tiles, .delete/.edit buttons in game rows (not in scope). 
- Contrast risks: --text-muted on dark cards (~4:1), --text-dim in light theme (~2.9:1) on "—" and small hints. Needs a contrast tool check.
- Tooltips as the only explanation (title attributes) at dashboard.js:326, 503; stats.js:224, 228, 916 — not available on touch or to many screen readers.
- Chart accessibility: chart buttons lack values in aria-label; #vbarDetail is not aria-live.

## Top 10 (prioritised)

1. **High** Lao uses ຄະແນນ for rating, game points and best score; split the vocabulary (i18n.js:1483, 1523, 1530, 1342, 1692, 1699).
2. **High** Rating number is unlabelled and competes with Level; label it and explain in one line on the card (stats.js:238, 335, 350).
3. **High** Two same-looking arrows (rank places and rating points) per row, explained only by a tooltip (stats.js:220-224).
4. **High** Spending: month chart and per-person bars use different colours for the same four cost types (styles.css:4566-4569 vs 4509-4512).
5. **High** "Activity" counted two ways (Leaderboard vs Activity tab) so ranks do not match (dashboard.js:134-138 vs 477).
6. **Med** Show-up % definition is loose and its explanation is a tooltip (dashboard.js:498-503).
7. **Med** Ranking page is long (badges + highlights + two unbounded lists); add collapse, top-10 and pinned "me" row (stats.js:319-352).
8. **Med** Month vs all-time scope mixed in Ranking (rating/order all-time, W-L month, arrows always month) (stats.js:341-350, 170-172).
9. **Med** Touch targets (<44px) for dash tabs, period pills and the "?" button; add min-height 44 (styles.css:1164, 1195, 4489).
10. **Med** Dashboard empty first impression at month start and public "no-show" boards; auto-fallback period and make negative boards optional (dashboard.js:10, 151-152).

Next best: pair row tap should preselect the pair in H2H (stats.js:333); recap text overflow and font loading (stats.js:958-1006); sparkline needs numbers (stats.js:591-599); unsorted pickers (dashboard.js:444, stats.js:495); remove dead _createSpendingChart (dashboard.js:384-419).

Visual checks still needed: leaderboard length on a 360px phone, pair-row wrapping with the x/5 tag, month chart scroll affordance and sliver segments, contrast values, recap image with long Lao names.
