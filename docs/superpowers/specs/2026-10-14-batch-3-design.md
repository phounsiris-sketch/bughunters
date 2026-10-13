# Batch 3 (v76-v79): live score polish, profile pages, market, public games, subscription

## v76 Live score and Home
- Create block order: Add score, then Live score; the Create block on Home is compact (two columns, small tiles). New **scoreboard** icon for Live score everywhere (the pin icon was not related).
- Live score never creates a game or session; only sessions that are not completed are offered; completed sessions show no Live score button.
- Counter: − and + are small (38 / 50 px); the left half of a team is a darker, transparent overlay (minus), the right half plain (plus).
- Exit always asks, then clears the live game. After *Save and next game* the setup opens with the same players marked ("Same players?").
- Games: *All votes* / *All sessions* are light buttons.

## v77 Profile pages, sold items, Market
- Profile rows (Personal info, My gear, Payment QR) open their own pages (`profile-sub`) with a breadcrumb; no drop-down.
- **Sold = gone**: *Mark sold* deletes the gear item (off the market and off My gear); items already flagged sold in old data are hidden everywhere.
- **Market**: each card shows when it was posted (date and time); search (name, brand, note), type chips (racket, shoes, other) and a price range (from / to); the list updates as you type.

## v78 Public games
- Month calendar (dots per day, tap to filter, month arrows) above Open games and above the invites on Play buddies (`calendarHtml` in `js/ui.js`).
- Optional photo (thumbnail on the card), stored like restaurant photos. Weekly repeat: N games, one per week, same `seriesId`.
- Unconfirmed games (not full) are dropped 24 h after posting; the host's phone sets `status: cancelled, cancelReason: unconfirmed`. No rules change (the host may already update their own game). This is client-side, so a game also disappears for others only while at least their own phones apply the same rule; a host who never opens the app leaves a cancelled-in-view but still "open" record until they do.
- Compact card (host and players as photo + name, one button).

## v79 Subscription (mock)
New accounts see a paywall after registration (plan, features, method, Pay). Pay is a mock: it writes `godsmash_sub_<uid>` and clears `godsmash_needsub_<uid>` in `localStorage`, then opens the app. Existing accounts are not asked. Settings > App shows the plan. Not secure and not shared across devices by design (demo). Real billing needs a server-side subscription record and a payment provider.

## Notes on how requests were read
- "Make this design more compact": applied to the Home Create block and the public game card.
- "Kill the session in 1 day if not confirmed": read as a public (open) game that is not full 24 h after posting.
- "Public game and friend as a calendar for reserve or recurring": a month calendar on both tabs; "reserve" is the existing Join; recurring = weekly repeat when posting a game (friends: the calendar shows invites; there is no recurring invite).

## v80 Corrections and recurring
- **Confirmed = 4 players** (not "full"): a public game with fewer than 4 players (or fewer than its places when it has under 4) 24 h after posting is **deleted** by its host's phone and hidden for everyone else. Replaces the v78 "cancelled when not full" rule.
- **Recurring** for vote, game (session) and buddy invite (`repeatFieldHtml` in `js/ui.js`): one document per week with a shared `seriesId` for votes, games and public games; buddy invites keep one document with `repeatWeeks` and show every occurrence on the calendar.
