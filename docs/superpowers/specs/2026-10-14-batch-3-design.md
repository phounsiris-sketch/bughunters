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
(v79 is added below as it is built.)
