# Godsmash — Know-how

How the app works, how to use each feature, where its data lives and how to
run it. App version at the time of writing: **v88**.

- App: https://phounsiris-sketch.github.io/bughunters/
- Backend: Firebase project `godsmash-badminton` (Firestore + Auth, free Spark plan)
- Code: plain JavaScript PWA, with no build step. `index.html` loads `js/*.js` in order.
- Architecture and design decisions: [system-design.md](system-design.md)

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Getting started](#2-getting-started)
3. [Groups](#3-groups)
4. [Polls: planning a game](#4-polls-planning-a-game)
5. [Sessions and splitting the bill](#5-sessions-and-splitting-the-bill)
6. [Courts and map pins](#6-courts-and-map-pins)
7. [Matches, stats and rankings](#7-matches-stats-and-rankings)
8. [Profile, privacy and gear](#8-profile-privacy-and-gear)
9. [The public zone](#9-the-public-zone)
10. [Play buddies and safety](#10-play-buddies-and-safety)
11. [Notifications](#11-notifications)
12. [Data model](#12-data-model)
13. [Security rules](#13-security-rules)
14. [Admin how-tos (GitHub Actions)](#14-admin-how-tos-github-actions)
15. [Turning on groups (one-time activation)](#15-turning-on-groups-one-time-activation)
16. [Releasing a new version](#16-releasing-a-new-version)
17. [Testing](#17-testing)
18. [Staying free](#18-staying-free)
19. [Troubleshooting](#19-troubleshooting)
20. [Known limits](#20-known-limits)

---

## 1. The big picture

Godsmash is for badminton groups in Laos and Thailand. People plan a game in a
**poll**. The confirmed poll becomes a **session**, and after playing the
session's **bill** is split fairly. The app also tracks who paid whom.

The app has two zones, kept visually apart so nobody confuses them:

| Zone | Header colour | Who sees it | What's in it |
|---|---|---|---|
| **Private (my group)** | Your theme colour | Only members of the group | Polls, sessions, bills, matches, stats, members |
| **Public** | Pink/purple with a "Public — everyone can see this" banner | Every signed-in user | Open games, play buddies, the gear Market, public groups, the court directory |

**Bottom bar:** **Games** · Rankings · **Home** (middle) · Community · **Settings**.
Rankings and Community show once groups are on. The floating **+** on Games opens
*Create*: Vote, Game, Live score, Add score.

**Games** is one list of votes and sessions: *Upcoming* (open votes, games being
played), *Past* (to pay, done) and *All*. Each card has a date block, the court,
icons (people, time, what you owe), a status pill (Vote blue, Playing teal, To pay
orange, Done green), a Plan-Play-Pay-Done bar, a vote bar (for votes) and the
people with photo and name. A confirmed vote shows as its session, not twice. The
old Polls and Sessions pages are still there (links at the bottom of Games). Code:
`js/games.js`.

**Back and breadcrumbs (v75).** Every step you open (a poll, a session, a bill, Settings, a
sub-page) is one browser-history step, so the **browser's back button goes back one
step**, the same as the arrow in the header. A window that is open (or the Live score
screen) takes the back press first. Pages you drill into show a **breadcrumb** under the
header (Games > Votes, Games > a session, Home > Dashboard, Settings > Members ...).
On Games the *All votes* and *All sessions* links now sit **above** the first card.

**Inside a game** (the session page) a **Plan · Play · Pay · Done** tracker sits at
the top. A bar fixed above the bottom bar shows the next thing to do: while playing,
*Live score* and *Add game score*; when you owe money, *Pay* with the amount. It is
hidden while you edit the bill, on the Games tab (the form is right there) and when
there is nothing to do.

**Creating a vote or a game** is two steps with a progress bar: *When and where*
(a strip of the next 7 days to tap, the date, time, court, hours) then *Vote options*
(play mode, note, answers) for a vote, or *Who plays* (tap people, photo + name)
for a game. A small row with date, time and court stays on step 2. Dinner as its own
thing is not built yet.

**Bill safety (v69).** When you save a bill, a *Check before publishing* window shows
the total and **who pays whom** (photo + name) with the rounding note; *Publish bill*
saves it. If you edit a bill that people have already paid, payments whose amount did
not change **stay marked paid**; the others are cleared, and you are told how many
before anything is saved. *Mark as not paid* asks first. Marking paid now writes only
that payment, so two people marking at the same time no longer overwrite each other.

**Home** is where the app opens. Top to bottom:

- **My stats**, five cards you swipe sideways (dots below): **Play** (games this
  month, last 8 results as W/L dots, rating, win rate), **Spending** (this year's
  total, a small bar per month, your share), **Payments** (what you owe, what
  others owe you), **Badges** (earned of total) and **Rating** (number, trend
  line). Tap a card to open the full page (Stats, Dashboard > Spending, My payments).
- **Shortcuts:** *Find court* (Public > Games, to join an open game or vote),
  *Find friends* (Public > Buddies), *Market* (Public > Market). Only when groups
  are on.
- **Create:** *Vote* (new poll), *Game* (new session), *Add score* (opens the
  Games tab of your latest running session) and *Pay* (My payments).
- **Next game:** the soonest open vote or upcoming session, with the vote bar for
  a poll. With nothing planned it offers *Vote*.

**Rule used everywhere:** a person always shows a round photo and a name together

**Rule used everywhere (v97): confirm before anything that cannot be taken back by accident.** Reset, quit/exit and cancel always ask first ("Are you sure?"), whatever the score, because those buttons sit next to the ones tapped all game. In the live score: Reset all, Quit (button, menu and the phone's back press) and cancel of a half-counted game. Practice games ask too. Watching a board (iPad) does not ask: leaving it loses nothing. Any new destructive button must follow this rule.
(session cards, who-pays-whom rows, poll voters, game rows, Home). A group shows
three people and "+N". The small shared pieces (person chip, status pill, vote bar,
Plan/Play/Pay/Done tracker, date block) live in `js/ui.js`.

The old Dashboard (Activity, Spending, Leaderboard) is still there: tap the
Spending card, or open it from Stats. The code is `js/home.js`.
Stats and Public only show once groups are turned on (see section 15).

**Header:** the group name with ▾ (tap it to switch group), the 🔔
notifications button and **your picture**. They are two separate pages:

- **My profile** (your picture in the header): one hero card (photo, name, level,
  permissions and three number tiles: rating, games, win rate), your badges, then a
  list of rows: **Personal info** (story, details, who can see), **My gear**,
  **Payment QR**. Each row opens **its own page** (breadcrumb *My profile > Personal info*;
  the browser back button returns to the profile), not a drop-down. *Share my month recap*
  at the bottom.
- **Settings** (the last button of the bottom bar), grouped like a list of icon rows:
  - **Group:** switch group, group settings, members, courts & prices, cocks,
    players without the app, players' QR, general (minimum players, default
    payers), reports.
  - **App:** language, then appearance (dark/light, 5 colours each).
  - **Notifications & data:** push notifications, recently deleted, admin tools.
  - **Sign out** (asks first).

---

## 2. Getting started

1. Open the app link. The app opens in **Lao** the first time (the globe button switches
   to English). **Register** with your email and a password (use *Show* to check
   what you typed), confirm the email, then sign in. If you came from an **invite
   link**, it is remembered through sign-up and the email check and joins you to
   the group once you are in.
2. **Install it** (optional, but needed for push on iPhone):
   - Android/Chrome: menu → *Install app*.
   - iPhone/Safari: Share → *Add to Home Screen*.
3. **Join a group.** Choose whichever is easiest:
   - Open the **invite link** an admin sent you (`…/#join=<group>:<code>`).
   - Scan the group's **QR code**.
   - Settings → Groups → *Join with a code*. You can paste either the code or the whole link.
   - From Public → Groups, join a public group (*Join*, or *Ask to join*).
4. Or **create your own group**: Settings → Groups → *Create group*. You become its owner.
5. **Turn on notifications** in Settings → Profile. On iPhone this only works after
   the app is installed to the Home Screen.

If you belong to several groups, tap the group name in the header to switch.
Everything you see (polls, sessions, courts, prices, stats) then belongs to that group.

---

## 3. Groups

### Group settings (owner/admin)

Settings → Group:

| Field | Meaning |
|---|---|
| Name, city | Shown in the header and the public list |
| Type | **Private** (invite only) or **Public** (listed in the public zone) |
| Who can join | Private: *invite*. Public: *ask to join* (an admin approves) or *open* (anyone joins) |
| Currency | LAK ₭ (rounded to 1,000), THB ฿ or USD $ (rounded to 1) |
| Language | The group's main language, for information. Each person's app and pushes use their own language |
| Min players | How many "Join" answers a poll needs before it can be confirmed (default 4) |
| Highest score in a game | 31 (default) or 30 (official BWF rule) |
| Default payers | Who usually pays the court and the shuttles, prefilled on new bills |
| Usual days / time | When the group usually plays (a from–to time range), shown to people looking for a group |
| Court prices | The group's own price per hour for each court it uses |

The **invite link and QR code** are shown only to admins. *Reset code*
makes old links stop working.

### Roles and permissions

| Role | Can do |
|---|---|
| **Owner** | Everything in the group, including making admins. Can't be removed and can't leave |
| **Admin** | Everything except owner-only actions; approves join requests |
| **Member** | Vote, answer, record matches, see stats. Plus any extra permissions an admin gives them |

Extra permissions for a member (Settings → Members → tap a person):

| Permission | Allows |
|---|---|
| `createPoll` | Manage everyone's polls. Anyone may create and manage their **own** polls without it |
| `editSession` | Edit or delete the details of any session |
| `editBill` | Costs, payers, dinner and payments of any session |
| `editConfig` | Courts, shuttlecocks, manual players and group settings |

The **Super Admin** is the app owner. They sign in with a verified email that is
set in `js/perms.js` and `firestore.rules`, and can do everything in every group.

**Manual players** are people without the app, such as a friend's guest. An admin
adds them in Settings → Players. They belong to one group and can be put on bills
and in matches. They can't get pushes.

**Leaving a group:** Settings → Group → *Leave*. The owner can't leave their own
group.

**Deleting a group (owner only):** Settings → Group → *Danger zone* → **Delete
group**, then type the group's name to confirm.

- It deletes the group for everyone: its polls, sessions and bills, games and
  stats, cock brands, manual players, every membership and the invite code.
- The members keep their accounts and any other groups.
- It can't be undone. Weekly backups (section 14) are the only way back.
- It needs the **v52 (or newer) security rules**: publish the current `firestore.rules`
  in the Firebase console first.

---

## 4. Polls: planning a game

1. Polls → **+**. Fill in the date, time, court and duration. Optionally:
   - set the **mode**: *Fun*, *Exercise* or *Competition*. The mode is only a label to tell players how the game was meant; every game counts for ratings and rankings.
   - set the **game type**: men's doubles, women's doubles, mixed or singles.
   - change the answers. The default is **Join / Skip**.
   **A poll card** (v74) reads top to bottom: a date block, the court (with the map
   link), the time and how many have joined, a status pill; who made it (photo and
   name); a Plan-Play-Pay-Done bar; **one bar** showing how many are in, how many are
   out and how many more are needed; the deadline; the answers with the people who
   chose each one (photo and name); then the buttons (Confirm, add votes for others,
   cancel).
2. Everyone picks one answer, like a radio button. Any answer other than "Skip"
   counts as joining.
3. Once at least **min players** have joined, the creator (or someone with
   `createPoll`) taps **Confirm**. This creates a **session** with those players.
   The mode and game type are copied to it.

### Voting deadline

- **Usual case:** voting closes automatically at **midnight at the start of the game day**
  (Vientiane/Bangkok time, UTC+7).
- **Same-day game:** if the poll was created after that midnight, voting closes
  at game time instead.
- **Closing early:** voting also closes the moment the poll is **confirmed or
  cancelled**, even before the deadline. When a poll is cancelled, everyone who
  answered gets a "cancelled" notice.

---

## 5. Sessions and splitting the bill

Open a session from Sessions. Before the bill is done, people who can edit it
see the **bill form**; others see "waiting for the bill".

### Bill form

| Section | What to enter |
|---|---|
| Details | Date, time, duration, court. The price per hour comes from the group's court price |
| Players | Who played. These people share the court and shuttle cost |
| Court | Who paid the court |
| Shuttlecocks | Brand, quantity and price (saved brands prefill this), and who paid |
| Other costs | A description, an amount, who paid, and optionally *only for* one person |
| Dinner | Total bill, who paid, who ate, an optional photo of the receipt, and an optional restaurant (see below) |

Tap **Calculate split** to save it. The app then shows:

- each person's share, rounded to the group's rounding unit;
- **who pays whom**, using as few transfers as possible;
- a **Messenger/WhatsApp text** to copy into the group chat.

When a transfer has been paid, mark it **paid**. Unpaid transfers trigger a daily
reminder push each morning until they are marked paid.

### Dinner after the game

From 30 minutes before the game ends until 12 hours after, players see a
**"Dinner after?"** card with **Join** and **Skip**. When someone adds the dinner
bill, the people who answered Join are already ticked as diners.

### Restaurant and reviews (optional)

When you add the dinner bill you can pick a **Restaurant** (optional) from a
shared **master list**:

- **Search** by name or place while choosing; no match → add it as new.
- **New restaurant**: a name (2–60 characters), **a location text or a map pin**
  (at least one; both is best) and an optional **photo** (shown in the list, the
  chosen row and the bill card; stored like receipts, compressed). It is **checked before saving**: the same name
  (ignoring case, spaces and punctuation) with no pin, or a pin within 300 m, is
  refused as a duplicate with a button to **use the existing one**. The same
  name far away (a chain) is allowed.
- The list is shared by all groups, like the courts directory. Anyone signed in
  can add one; its creator or the app owner can delete it.
- The bill card then shows the name, the location, **Open in Google Maps**, and
  the **average stars**. People in that dinner's diner list can leave **one
  review** each (1–5 stars + an optional comment up to 200 characters) and change
  it later. The latest 5 reviews are listed.

New collections `restaurants` and `restaurantReviews` need the updated
`firestore.rules` published first (section 13); until then the app works as
before and the restaurant list stays empty.

### Matches button

In a session (groups only), the **Matches** button shows the mode badge and
opens that session's matches (see section 7).

**Deleting** a session or poll moves it to **Recently deleted** (Settings), where
it can be restored for **30 days**.

### Home, calendar and group logo (v81)

- **Group logo:** Settings > Group settings > *Group logo* (admins; saved at once, 256 px).
  It shows in the header next to the group name, in the group list and in the switcher;
  without a logo the group's first letter is shown as before.
- **Home** is tighter so the Next game card shows in full: the greeting is small and on the
  right, the stat cards, shortcuts and Create block are smaller, and the last stat card no
  longer touches the screen edge.
- **Rating card** on Home: area under the line, a dot per game, the latest one ringed, a
  dashed line at the starting rating, and pills (best, games, start).
- **Calendars** (Open games, Play buddies) show **this week**; *Show the month* opens the
  full month, *Show this week* closes it; the arrows move a week (or a month when open).
- **Home cards open the right page:** *Badges* opens your Profile (where the badges are),
  *Rating* opens Rankings > Progress. A **Live score in progress** banner on Home has a
  Continue button and a **cancel (x)** that asks first and drops the half-counted game.
- On the Live score counter the player names are a **centred column**, narrow enough to
  stay clear of the screen edges and the middle line.
- The **Dashboard** page no longer repeats your rating card (it is on Rankings and Home) and
  shows the gear-for-sale card only on the Leaderboard tab. The **Monthly recap** buttons
  are removed from Profile and from the badges card.

### Recurring (v80)

**Repeat weekly** (2 to 12 weeks) is available for: a **public game**, a **vote**, a
**game** (session; the same players are added every week) and a **buddy invite**. A vote,
game or public game creates one item per week, all tagged with the same series. A buddy
invite stays **one invite that repeats**: it shows the next date and "Repeats weekly ×N",
and every week shows on the Play buddies calendar.

### Subscription step (demo, v79)

A **new account** (just finished registering) sees *Start with Godsmash* before the app
opens: Monthly 30,000 ₭ or Yearly 300,000 ₭, what is included, a payment method
(OnePay, card, bank transfer) and **Pay**. **This is a mock: nothing is charged.** *Pay*
marks the account as subscribed on this phone (`localStorage`) and opens Home. Accounts
that already existed are not asked. Settings > App shows *Subscription* with the plan.
The code is `js/subscription.js`; replace `subPayMock()` with a real payment provider
(and store the subscription on the server, not on the phone) before charging anyone.

### Public games: calendar, photo, repeat, auto-cancel (v78)

*Community > Open games* starts with a **month calendar**: days with games show dots,
tap a day to see only that day (tap again to clear), arrows change the month. Tap *Join*
to reserve a place. The **Play buddies** tab has the same calendar for your invites. A
game has an optional **photo** (a thumbnail on the card, good for an ad or the venue) and
can **repeat weekly** (2 to 12 weeks; one game is posted for each week, tagged "Repeats
weekly"). **A game is confirmed when at least 4 players have joined** (or every place, when it has fewer
than 4). **A game that is not confirmed 24 hours after it was posted is removed** (cleared):
everyone stops seeing it, and its host's phone deletes it and says so (`PUBLIC_GAME_TTL_H`,
`PUBLIC_GAME_MIN_PLAYERS` in `js/public.js`). The card is compact: host and players (photo + name), tags
and one button.

Live score also has **Try it first** on its first screen: it counts points with no game and no
players, shows a *Practice: not saved* badge, and nothing is saved or kept. The Home header no
longer shows the "Badminton Club" line or the "Hi, name" greeting; the rating card has no
"Start" pill; calendar days with events show clear dots (one per event, up to three).

**Accessibility rules (v87, from the UI audit).**
- **Contrast:** text on a brand fill is white only when the fill is at least 4.5:1 (the base teal is `#0f766e`;
  the stat-card gradients, notification badge and every colour style were adjusted). `--text-muted` and
  `--text-dim` pass 4.5:1 on cards in every light and dark style. Light-theme status pills use darker text.
- **Keyboard:** a script in `js/app.js` makes every element that has an inline `onclick` but is not a real control
  (a `div`, `span`, `img`) focusable, announced as a button, and pressable with Enter or Space. Opt out with
  `data-nokb`. There is one visible focus ring (white on gradient surfaces). The toast is a polite live region.
- **Size:** small controls get an invisible 44 px hit area; chips, calendar days and period buttons are 44 px
  high; no text is below 11 px and the bottom bar labels are 12 px. In Lao mode the line height is 1.55.
- **Motion:** `prefers-reduced-motion` turns off smooth scroll, the switch and chevron movement and the
  loading bar, and shows the finished splash; state changes still happen.
- **Speed:** the unused Chart.js library is gone, fonts load from `<link>` tags in the page head (in parallel)
  instead of a CSS `@import`, and `transition: all` is replaced by named properties.
When you add a clickable element prefer `<button>`; when you add a colour that carries white text check it is
at least 4.5:1.

**Splash screen (v88): Mars and the breaking earth.** The app logo never moves. Mars, a dark silhouette with a
crested helmet and a rim light, rises at the top left (0.2 s), swings a racket (0.7 s) and drives the shuttlecock
into the middle of the logo (contact 0.93 s, impact 1.15 s: flash, ring, sparks, a small shake of the ground). Glowing
cracks run out from the logo across the whole screen, the ground breaks into seven shards that fly away (1.95 s) and
the app appears (about 2.7 s). **Each launch switches between a red (lava) and a blue (ice and lightning) version.**
**Tap the splash to skip** the rest. With reduced motion you get the logo, the name and the ground, nothing moving
(0.6 s). It is one inline SVG plus CSS (`#splash` in `index.html`, `.sp2-*` in `css/styles.css`); the logo is
`icons/icon-512.png`. Open `docs/splash-preview.html` in a browser to see it: *Replay red / blue*, or add
`?t=1200&theme=blue` to freeze it at 1.2 s. To change the colours edit the `--bgc / --bge / --hot / --hot2 / --cape`
variables of `.sp-red` and `.sp-blue`.

**E-mail limits (v85).** *Forgot password?* and *Resend email* can be used **once a minute** per phone:
the link shows a countdown ("Forgot password? (45s)") and a second press says how long to wait. The
countdown survives a reload.

### Live score

Home > Create > **Live score** (or the button on a session's Games tab). Pick the
teams (photo + name), then count: **left half of a team = minus, right half =
plus**. The team that scores serves (shuttle icon). A game ends at 21 with a
2-point lead, or at the cap (30 or 31, the group's setting). **Save and next game**
stores the game exactly like *Add game score* and starts the next one with the
same teams. The score stays on your phone if you leave or refresh; Home shows
*Live score in progress*. Menu: Exit, Reset, Settings (current game, teams, theme
colour). **Live score always starts by asking which game (session) the score is for**
(today's or the latest one is first and marked); you can change it later from the
setup screen. An **Exit** button is at the top left of the counter: it
asks first, then clears the live game (nothing counted is kept). Live score is only offered
for games that are not completed, and it never creates a game: pick an existing one. In the
counter the **left half of each team is darker (minus, small button) and the right half is
plain (plus)**. After *Save and next game* you land on the team setup with the **same
players marked**: change them or tap Start. The icon is a scoreboard. Code: `js/livescore.js`.

### Spending tab (Dashboard)

Pick a period (month, quarter, year, all time). The tab shows, top to bottom:

- **Totals** for the period: grand total, your share, and court / shuttles /
  other / dinner.
- **Top spenders**: a podium of the **3 players with the biggest share** of the
  period's spending (2nd · 1st · 3rd). It is the **same podium design as the
  Activity leaderboards** (round photo with a medal, amount, rank block; tap a
  player to open their activity). With fewer than 3 players it shows only those.
- **By month** (or **by year** in *All time*): a **vertical bar chart**, one
  column per month, amount above the bar. Months run left to right up to the
  current one; scroll sideways on a small screen. Each bar is **stacked by cost
  type** (bottom to top: court, shuttles, other, dinner) with a colour legend
  above it. **Tap a column** to see that month's amount per type, its sessions
  and your share.
- **Per person**: stacked bars by cost type.

---

## 6. Courts and map pins

There are two kinds of court records, and they never change each other:

| | Public court directory | A group's own courts |
|---|---|---|
| Where | Public → Courts (`courts/{id}`) | Settings → Courts & prices (`groupCourts/{id}`) |
| Who edits | Anyone signed in (to fix a map or name) | The group's admins / *editConfig* |
| Price | None | The group's price per hour |
| Used by | Open games, finding courts | The group's polls, sessions and bills |

- **Group courts start as a copy.** The first time an admin opens the app after
  v53, the courts the group had priced are **copied** from the directory into the
  group, with their price. From then on, changing the group's copy (name, pin,
  price, number of courts…) never changes the directory, and the other way round.
  Old sessions and polls still find their court: they're matched to the copy.
- **Add a court:** Settings → Courts & prices.
  - **Add court** makes a new court for the group only. Tick *Also add it to the
    public court directory* to share it; other groups don't see your price.
  - **Add from the court directory** copies a public court into the group.
- The form shows the **name**, the **price per hour** and **how many courts** the
  hall has, named **1, 2, 3…** or **A, B, C…**.
- Everything else is in the folded **Map & details (optional)** section: map pin,
  address, phone to book, opening hours (from–to) and air conditioning. If you
  save without opening it, the court keeps its existing pin.
- **Booked courts:** in a session's bill form, tap the courts you booked (e.g.
  **C** and **D**). The session shows "Courts C, D" under the date, along with who
  created it and when.
- **Pin the location:** open *Map & details*, then do one of these:
  - tap the map;
  - tap **Use my location**;
  - paste a **Google Maps link**. Both `@lat,lng` and `?q=lat,lng` forms work, as
    do plain `lat, lng` numbers.
- Once a court has a pin, polls and open games show a **Directions** link, and the
  session list shows a **Map** link. Public → Courts lists courts by distance from you.
- Inside a session there are two buttons under the date:
  - **Open location** opens Google Maps.
  - **Share location** uses the phone's share sheet, or copies the link.
- If the court has no pin yet, admins (and people with *editConfig*) see **Pin
  the court location**. It opens the court with its map ready.

The map uses Leaflet (bundled in `js/vendor/leaflet/`) with free OpenStreetMap
tiles, so it needs no API key and costs nothing.

---

## 7. Matches, stats and rankings

Stats are **private to each group**. They are never shown in the public zone or
compared across groups.

### Recording games (the session's Games tab)

A session has two tabs: **Session** (players, bill, who pays) and **Games** (scores). On the Session tab, players (and admins) also see an **Add game score** shortcut button under the tabs; it opens the Games tab and scrolls to the add-game form.
They're kept separate, and switching tabs keeps whatever you were typing in the bill.

On the **Games** tab, **every player of the session** (and any group admin) gets
the add-game form straight away. Others see the games but can't add any. You
record **one game at a time**:

1. Pick the game type (men's doubles is the default) and choose **Team A** and
   **Team B** by hand. There is no random or suggested team.
2. Type both scores. The team names sit above their score box. The boxes start
   empty, and the **− / +** buttons beside each box nudge it by one (+ on an
   empty box starts at 21).
3. The line under the score checks it as you type:
   - one team must reach **21**; 21 wins only if the other has 19 or less;
   - after **20-all** the winner must lead by **2** (22–20, 25–23…);
   - **31** is the most a team can score (at 30-all the next point wins, 31–30).
     A group can switch to the official **30** in Settings → Group →
     *Highest score in a game*.
4. Optionally type the minutes played, then **Save game**. The form clears for
   the next game, and the list below updates for everyone at once.

Above the list, a **Summary** card shows the total games of the session and
how many games each player played (bar + number, most games first). Both teams
count, in any game type. It updates live and is hidden until the first game.

A game **counts in Stats as soon as it's saved**; nobody needs to confirm it. If a
score is wrong, the person who saved it (or an admin) taps ✎ to fix it or 🗑 to
delete it. Each game shows **who added it** and, if it was changed, **who edited
it last** and when (stored as `createdBy` / `updatedBy`, `updatedAt`).

### Stats tab

| Tab | Shows |
|---|---|
| **Ranking** | A **highlights card** (**Best pair** = highest pair rating; **Best score** = the game with the biggest winning margin), then the **pair ranking**, then the individual ranking. This month or all time. Each row ends with a **rank arrow** (▲ up / ▼ down / – same, with how many places since the start of this month; **NEW** if it had no game before this month) and under it the **rating change** since the start of the month. Pair and team names are shown **A→Z** in every shared view (pair lists and dropdowns, game rows; personal views — My last games and the Progress best/worst partner card — put the player first; so "Nith & JusT John" is never also "JusT John & Nith"). Pairs are ordered by **rating**; a pair or player with too few games carries an `x/5` (pairs) or `x/10` (players) tag. Players still settling are listed after the others, pairs are not pushed down |
| **Head to head** | One player's summary (you by default; pick anyone from the list): total W–L, then the record **against each pair** (doubles), **with each partner**, and **against each player** (singles). It counts every game, in any mode |
| **Head to head → Pair vs pair** | At the bottom of the tab: pick **two pairs** (the first defaults to the chosen player's most-played pair, the second to the pair it has met most; the second list only offers pairs with different players). It shows the **score between the two pairs** (wins each), the points difference and every game they played against each other, newest first. Pair names are A→Z |
| **Progress** | Pick a player and a period: **1 month, Quarter (default), 6 months or 1 year**. It shows the rating then and now with its line (the **hollow dot is the Start** rating when the period began; every filled dot is one game, so 7 games = 8 dots), W–L and win rate, games, minutes and points per game, and a breakdown **by week** (1 month) or **by month** |
| **Progress → Best and toughest pair** | For the chosen player and period: the **best pair** (partner with the highest win rate) and the **toughest pair** (lowest win rate). A partner needs at least **2 games** together to count; the toughest pair is hidden if everyone is equal. Under it, up to 4 **gentle tips** worked out from the numbers (keep the best pair for big games, a relaxed practice with the toughest one, a tough opponent, close games, a short losing run, great form, or "try other partners"). They are simple rules on your results, not AI, and always worded kindly |

How the numbers are worked out:

- **Ratings** are Elo-style. Everyone starts at 1500 (K = 32). Beating stronger
  players earns more, and a bigger point difference earns a little more. Pairs
  have their own rating.
- **Every saved game with a score** changes ratings, from the moment it's saved.
  The mode (Fun / Exercise / Competition) is only a label for the players.
- Everyone with a game appears in the rankings straight away. Until
  a player has **10** games (a pair **5**), their rating is still settling: they
  show a small "3/10 games" tag and are listed after the settled players.
- **Levels** are the scale used in Lao badminton. They are set by people, not
  calculated from the rating:

  | Level | Name | What it means |
  |---|---|---|
  | **BG** | Beginner | Can hit the shuttle but struggles with consistency, serving and court position |
  | **N** | Novice | Keeps a friendly rally, knows the rules, returns basic clears and drops |
  | **S** | Starter / Standard | Good social player; may lack a strong smash or steady backhand |
  | **P** | Practicer / Pre-Pro | Advanced club player, often coached; strong footwork, smashes and rotation |
  | **C** | Club / Competitive | High-level amateur or junior competitor; local tournament level |
  | **B&A** | National & International Pro | Provincial, national and international professionals |

  - You pick your own level in your profile. A group admin can set your level for
    the group (Settings → Members → tap a person), and that one wins.
  - Tap **What do the levels mean?** anywhere a level is picked to see this table.
  - Stored codes: `BG N S P CL BA`. "C" is stored as `CL` because the first
    version used A–D, so old values are read as A→P, B→S, C→N, D→BG.
- **Badges:** first match, 50 and 100 matches, 5 and 10 wins in a row, 5 courts,
  1,000 minutes, and pair of the month.
- **Monthly recap:** the button makes a shareable picture of your month:
  - your win-rate ring, W–L and your last 5 results;
  - three tiles: rating change, best win streak and points per game;
  - your best partner (and your record together) and the rival pair you met most.

  On phones it opens the share sheet; on computers it downloads.
- **Your first box** (Ranking tab, also on Home) shows your level and rating, a
  **form strip** of your last 5 results (W/L). Tap the strip to unfold your
  **last 5 games**: won or lost, your team with **your name highlighted**, and the
  rivals. It starts folded.
- Tap **?** in that box for **How is this counted?**: the game rule, how the Elo
  rating works, and why it isn't BWF World Tour points.

---

## 8. Profile, privacy and gear

Tap **your picture** in the header (or Settings → Profile).

### Story

Up to **5 photos** under your profile picture: your game, your team, your court.

- Tap **+** to add a photo and **×** to delete one.
- Choose who sees them: *Everyone*, *My groups* (default) or *Only me*.
- Others see them on your profile and tap a photo to open it big.

### Personal info

Everything about you is in **one card with one Save button**:

- **Who I am:**
  - name and surname (with who can see them), nickname, and display name;
  - phone, email (read-only), gender, date of birth and relationship status.
  - The **display name** is what everyone sees in the app. The nickname is
    separate and only shows on your profile.
  - The date of birth uses three lists (**day / month / year**, starting from this year), so the year is
    one tap away.
- **How I play:** your level (6 buttons, see section 7), hand, position (front, back or both), home
  court, the days you're usually free, and the **time** you usually play (from–to).

Only the name is required.

Each field has a **visibility** setting: *Everyone*, *My groups* or *Only me*.
The defaults are:

- **Everyone:** level, hand, position.
- **My groups:** gender, age, home court, free days, phone.
- **Only me:** relationship status.

Two fields are private by design:

- **Date of birth** is stored in `userPrivate/{uid}`, which only you can read.
  Other people see the birth year (as an age) only if age visibility isn't
  "Only me".
- **Relationship status** is stored privately whenever its visibility is "Only me".

### Gear

Add **rackets, shoes and bags & other gear** (grip, shirt…). They're listed in
that order: rackets, then shoes, then bags & other.

- Each item has a name, a photo, a brand and details: weight, string and tension
  for rackets; size for shoes.
- For the photo, tap the big **Add a photo** box to take or choose a picture.
- Mark **one main item per type**; it shows on your profile.

Tick **For sale** to sell an item:

- set a price (in your group's currency) and the province;
- choose **who can see it**:
  - **My groups** (default): it's on **Home → Gear for sale** for your groups.
  - **Everyone (Market)**: it's also on **Public → Market**.

Buyers on the Market see the photo, price, province and seller. They get a
**WhatsApp** button if you show your phone to everyone; otherwise they can open
your profile.

- You can have **at most 3 items for sale** at a time. The gear card shows
  "selling 2/3".
- Each item for sale has **Mark sold** and **Remove from sale** buttons (in My gear,
  and on your own Market cards).
  - Mark sold takes it off the market and tags it *Sold*.
  - Remove just takes it off sale.
  - Either one frees a slot straight away.
- The Market shows the newest listings first.

---

## 9. The public zone

Choose your **province** at the top. The choice is remembered on your device.
All **18 provinces of Laos** are listed, from Vientiane Capital to Attapeu, plus
*Other*. Older entries saved as "Pakse" or "Thakhek" show under Champasak and
Khammouane.

### Open games

Anyone can host a game: date, time, court, slots, level and price per person.

- Players tap **Join**. When all slots are filled, the game is **full** and
  later players go on the **waitlist**.
- If someone leaves, the first person on the waitlist moves up automatically.
- The host can **cancel** the game, and everyone who joined is told.
- Pushes: the host hears who joins; everyone hears when the game is full;
  players get a reminder 1 hour before.

### Public groups

A list of public groups in your city, with **Join** (open groups) or **Ask to
join** (an admin approves, and you get a push when they do).

### Market

Gear people sell to **everyone**, filtered by province, each item in its own
currency. Items sold only to a group stay on that group's Home page.

### Courts

The shared directory, sorted by distance, with Directions links.

---

## 10. Play buddies and safety

This is a way to find new people to play with, or to have dinner with after a
game. It is opt-in and has safety built in.

- **Adults only (18+).** You must enter your date of birth in your profile first.
- **Off by default.** Public → Play buddies → **Switch on**, then choose:
  - what you're looking for: doubles partner, mixed, singles, dinner after;
  - **who may invite you**: *people in my groups*, *people I've played with*, or *anyone*;
  - your province, the time you are usually free (from–to) and a short intro.
- **Inviting someone:**
  - The invite includes a date, time, court and a short message.
  - Links and phone numbers in the message are refused.
  - You can have at most **5 open invites** at once.
- **Answering:**
  - The other person taps **Accept** or **Ignore**.
  - Only after **Accept** do the WhatsApp and Call buttons appear for both of you.
  - The sender is **never told** about Ignore.
- **Blocking:** open someone's profile → ⋯ → **Block**. You stop seeing each
  other in buddies, open games and invites, and they can't invite you.
- **Reporting:** ⋯ → **Report**, with a reason and details (up to 300 characters).

**Where it all goes:**

| Action | Stored in | Who sees it | What happens |
|---|---|---|---|
| Block | the blocker's own profile (`users/{uid}.blocked`) | Only the blocker (the other person isn't told) | You stop seeing each other in buddies, open games, invites and their pushes |
| Unblock | same list | — | Everything shows again |
| Report in a group | `reports/{id}` with the group | The group's **admins**: Settings → **Reports** (with a count) | They read it, open the person's profile (and can remove them in Members), then **Mark handled**, which deletes the report |
| Report in the public zone | `reports/{id}` (zone: public) | The **app owner** (same Reports page) | Same as above |
| Ignore an invite | the invite (status "ignored") | Only you | The sender is never told |

The person reported is never told who reported them.

There is **no in-app chat**. Once an invite is accepted, people talk on WhatsApp.

---

## 11. Notifications

**In-app notices (🔔)** cover polls that need your vote, bills, payments owed to
you or by you, join requests (for admins) and invites.

**Push notifications** are sent by the GitHub Action `push.yml`, triggered every
5 minutes by cron-job.org:

| Event | Who gets it |
|---|---|
| New poll answers (combined; a vote waits 5 minutes to settle) | Group members |
| Voting closes in 3 hours | Members who haven't answered |
| Voting closed, enough players, poll confirmed or cancelled | Creator and those who answered |
| Bill is ready, with what you owe | Players of the session |
| Marked as paid | The person who was paid |
| Daily payment reminder (morning) | Anyone with unpaid transfers |
| Game in 1 hour | Players of the session or open game |
| Open game: someone joined / full / cancelled | Host / everyone in it / everyone who had joined, including the waitlist |
| Join request / approval | Group admins / the person |
| Invite received / accepted | The invitee (unless blocked) / the sender |

Amounts use each group's currency and rounding. Messages use each person's language.

---

## 12. Data model

Firestore collections. Every private item carries a `groupId`.

| Collection | Main fields | Notes |
|---|---|---|
| `groups/{gid}` | name, type, joinMode, city, currency, lang, minPlayers, payers, courtPrices, ownerId, usualDays, usualTime | |
| `groupSecrets/{gid}` | inviteCode | Admins only |
| `members/{gid}_{uid}` | gid, uid, role, perms, status active/pending, level, message, joinedAt, approvedAt | |
| `users/{uid}` | displayName, photoURL, phone, lang, about, vis, buddy, blocked; manual players: `manual`, `groupId` | |
| `userPrivate/{uid}` | dob, relationship | Owner only |
| `polls/{id}` | groupId, date, time, courtId, duration, options, votes, mode, gameType, status, closesAt, confirmedOption | |
| `sessions/{id}` | groupId, date, time, duration, courtId, players, costs, payers, dinner, settled, calculated, mode, gameType, dinnerPoll, tournament | |
| `matches/{id}` | groupId, sessionId, date, type, mode, teamA, teamB, games `[{a,b}]` (one game per record), minutes, createdBy | Firestore has no nested arrays, so games are `{a,b}` objects |
| `courts/{id}` | name, address, phone, courtsCount, courtLabels, lat, lng, createdBy | Public directory; **no price** |
| `groupCourts/{id}` | groupId, sourceId (directory court it was copied from), name, address, phone, courtsCount, courtLabels (number/letter), lat, lng, hours, price | The group's own courts; members read, *editConfig* writes |
| `restaurants/{id}` | name, location, lat, lng, createdBy, createdAt | Shared master list for dinner bills |
| `restaurantReviews/{restaurantId}_{uid}` | restaurantId, uid, stars 1–5, comment, sessionId, gid, updatedAt | One per person per restaurant; only people in that dinner |
| `shuttlecocks/{id}` | groupId, brand, price, cocksPerTube | |
| `gear/{id}` | uid, kind, name, brand, photo, main, forSale, salePrice, saleCurrency, saleScope (groups/public), saleCity, sellerName | Any signed-in user can read gear (the Market) |
| `openGames/{id}` | hostId, city, date, time, courtId, slots, level, price, players, waitlist, log, status | Public |
| `invites/{id}` | from, to, date, time, courtId, message, status | |
| `reports/{id}` | from, about, reason, details, groupId or none | |
| `images/{id}` | data (compressed JPEG data URL), kind | Referenced as `img:<id>` and loaded lazily |
| `pushTokens/{id}` | uid, token, lang | |
| `trash/{id}` | kind, data, deletedAt | Purged after 30 days |
| `settings/app` | legacy global settings | Super Admin only |

Lists are sorted in the browser, so **no composite indexes** are needed.

---

## 13. Security rules

The rules live in `firestore.rules` and are published by hand in the Firebase
console (Firestore → Rules). Main ideas:

- **Members only.** A group's polls, sessions, matches and shuttlecocks can be
  read or written only by its members (`isMember(gid)`), and `groupId` must be
  set. Nobody can list another group's data.
- **Rights.**
  - Owner and admin can do everything in their group.
  - A member can do what their `perms` allow.
  - Anyone can manage their own polls, their own vote, their own dinner answer and
    their own matches.
- **Joining** needs one of: the right invite code (private group), an open group,
  or a *pending* request that an admin approves.
- **Privacy.** `userPrivate` is owner-only. `groupSecrets` are admin-only.
  `settings` are Super Admin only.
- **Open games.** People can only add or remove **themselves** from players or the
  waitlist. Only the host can cancel.
- **Invites.** Only the sender creates an invite, and only the receiver answers it.
- **Restaurants.** Any signed-in user can add or correct one (name 2–60 characters, a location text or a pin); only the creator or the Super Admin deletes it. A **review** is one per person per restaurant, 1–5 stars, comment ≤ 200, and only if you are in the diner list of a session that used that restaurant.
- **Courts.** Any signed-in user can correct a court's shared details, like a map.
  Only its creator or the Super Admin can delete it. Prices live in each group's doc.

The rules tests are in the scratchpad suite (`rules2.test.mjs`, 157 checks). Run them
against the Firestore emulator before publishing changed rules.

---

## 14. Admin how-tos (GitHub Actions)

GitHub → **Actions** tab → choose a workflow → **Run workflow**. All of them use the
repo secret `FIREBASE_SERVICE_ACCOUNT`.

> 🔒 Never paste the service-account JSON, the GitHub token or the backup
> password into a chat, an issue or the code. They belong only in GitHub
> **Settings → Secrets and variables → Actions** (and the token only in
> cron-job.org).

| Workflow | When | Inputs |
|---|---|---|
| **Send push notifications** (`push.yml`) | Every 5 minutes, started by cron-job.org (GitHub's own cron is a backup) | `test`: sends a test push to every device |
| **Backup (weekly)** (`backup.yml`) | Mondays 03:17 Vientiane time, or by hand | Saves an encrypted `.json.gz.enc` artifact, kept 60 days. Needs the secret `BACKUP_PASSWORD` |
| **Restore backup** (`restore-backup.yml`) | After data loss | `run_id` (from the backup run's URL), `collections` (`all` or e.g. `sessions,polls`), `apply` (off = dry run) |
| **Merge players** (`merge-players.yml`) | One person has two accounts, or a manual player later joins | `from`, `into` (name or user id), `apply` |
| **Migrate to groups** (`migrate-groups.yml`) | Once (see section 15) | `target_group` (existing group, by name or id), `group_name` (only for a new group), `apply` |
| **Deploy to GitHub Pages** (`pages.yml`) | Automatically on every push to `main` | — |

**Always run a dry run first** (leave *apply* off), read the log, then run again
with *apply* on.

To read a backup locally, run:

```
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in backup.json.gz.enc -out backup.json.gz
```

Enter the backup password when asked, then run `gunzip backup.json.gz`.

---

## 15. Turning on groups (one-time activation)

Until this is done the app runs in **legacy mode**: one group, no Stats tab and
no Public tab. That mode is safe and works exactly as before.

1. **Actions → Migrate to groups → Run workflow.**
   - Enter your group name, and leave *apply* off for a dry run.
   - Check the log: it lists how many polls, sessions and so on will get a `groupId`.
2. Run it again with **apply on**. This creates the group, makes the Super Admin
   the owner, adds every registered player as a member (old permissions move onto
   their membership), moves court prices into the group, and moves receipt
   photos into `images`.
3. **Right away**, publish the new rules. In the Firebase console go to
   Firestore → Rules, paste the contents of `firestore.rules`, and click **Publish**.
4. If anyone created a poll or session between steps 2 and 3, **run the migration
   again**. It is safe to repeat; it only fills in what's missing.
5. Add the repo secret **`BACKUP_PASSWORD`** (a long random phrase you keep
   somewhere safe). Without it the weekly backup fails.
6. **Reopen the app.** It detects the new rules and switches on groups by itself.
   Stats, Public, the group switcher and invites appear.

### Rules published first and a group already made in the app?

Then the old data seems "gone": it has no `groupId`, so the rules hide it. It is
not deleted. Run **Migrate to groups** with **`target_group`** set to that
group's name (or id), first as a dry run and then with *apply* on. The script
does the following:

- It tags the old polls, sessions, shuttlecocks, deleted items and manual players
  with that group.
- It adds every registered player as a member, keeping their old rights. The
  group's owner stays the owner.
- It adds court prices the group doesn't have yet and never changes the prices
  it already set.

If `target_group` is empty and there is exactly **one** group, the job uses
that group. With several groups and no `target_group`, it refuses and lists them
(id, name, member count), so the data never lands in the wrong group. The log never shows people's names or the invite code.

---

## 16. Releasing a new version

**Before every release commit run `sh tools/release-guard.sh`.** It stops an emptied file (a bad
script once emptied `sw.js` and `app.js`), app and service-worker versions out of step,
and a JavaScript syntax error.

1. Change the code.
2. Bump **both** version strings together:
   - `APP_VERSION` in `js/app.js`;
   - `CACHE_NAME` in `sw.js`.
3. Commit, then push to the working branch **and** to `main`. GitHub Pages
   deploys `main` within a minute or two.
4. The service worker loads from the network first, so users get the new
   version the next time they open the app. Settings shows the version.

If you add a new JS file, add a `<script>` tag for it in `index.html`. The service
worker caches files as they are fetched, so there is no file list to update.

---

## 17. Testing

These suites live in the session scratchpad, not in the repo:

| Suite | What it covers |
|---|---|
| `e2e/run9.js … run25.js` | Playwright against a fake Firebase (`fakefb.js`), at a 390 px phone width. One script per feature area; `run25` is Phase 4 |
| `rules/rules2.test.mjs` | Every security rule, run on the Firestore emulator (`npx firebase emulators:exec --only firestore --project demo-godsmash "node rules2.test.mjs <path>/firestore.rules"`) |
| `events.test.js` | Push messages produced by `push/events.js` |
| send / backup / migrate | The admin scripts, run against the emulator |

To serve the app locally for e2e: `python3 -m http.server 8765` in the repo root.

---

## 18. Staying free

Everything runs on free tiers:

| Piece | Free because |
|---|---|
| Firebase Spark | Reads are kept low: lists are limited by group and date, and the push job reads only recent data (open polls, the last 45 days of polls, the last 180 days of sessions) |
| Photos | Compressed and stored in Firestore (`images`), not Firebase Storage |
| Maps | OpenStreetMap + Leaflet; no Google Maps API key |
| Pushes, backups, admin jobs | GitHub Actions (free minutes) + cron-job.org (free) |
| Hosting | GitHub Pages |

There are **no Cloud Functions or Cloud Scheduler**, because both need the paid
Blaze plan. Anything server-side runs as a GitHub Action instead.

---

## 19. Troubleshooting

| Problem | Fix |
|---|---|
| On iPhone (home-screen app) the bell and profile picture can not be tapped | The page draws under the iOS clock (translucent status bar). The header, toast, notification panel, sign-in and Live score bars add `env(safe-area-inset-top)` padding and the viewport has `viewport-fit=cover` (v84). If a new full-width bar is added at the top, give it the same padding. |
| A red bar "Database blocked this request (permission-denied) [name]" | The name in brackets (v85) is the request that was refused: `sessions`, `polls`, `matches`, `members`, `groups`, `openGames`, `users`, `courts`, `shuttlecocks` or `settings`. It means this person's account is not allowed to read that data: a join request still waiting for approval, a group they were just removed from, or rules not yet published. Check their membership first, then the rules (section 13). Open the browser console for the full error. |
| No Stats or Public tab | Groups aren't active yet. Do section 15, then reopen the app |
| "Missing or insufficient permissions" | The rules weren't published, or the person lacks the right. Check their role and permissions in Settings → Members |
| Something new was created but others can't see it | It has no `groupId` (it was made between the migration and the rules publish). Rerun *Migrate to groups* |
| Invite link does nothing | Make sure the person is signed in. If the code was reset, ask an admin for the new link |
| No push notifications | iPhone: install to the Home Screen first. Check notifications are on in Settings → Profile. Check that the last `push.yml` run succeeded and that the cron-job.org job is active |
| Pushes stopped entirely | The GitHub token in cron-job.org may have expired. Make a new one and paste it **only** into cron-job.org |
| Old version still showing | Close the app fully and reopen it. Settings shows the version number |
| Weekly backup failed | The `BACKUP_PASSWORD` secret is missing |
| Two accounts for one person | Run *Merge players* (dry run first) |
| Not in the ranking | Every saved game with a score changes ratings; the mode doesn't matter. Check the game has a winner (both scores filled) and that the player is in the game's teams |
| A score is refused | First to 21; after 20-all the winner leads by 2; the group's top score (31 or 30) is the most |
| Map doesn't load | It needs internet for the map tiles. You can still paste coordinates |

---

## 20. Known limits

- **Who may invite you** (*my groups* / *played with*) is checked by the app,
  not by the security rules. Blocking is enforced in both.
- **Stats and ratings are calculated in the browser** from the group's matches.
  That is fine for one group's history, but very large groups would load more data.
- **Public reports go to the app owner**, since the public zone has no group admins.
- **No in-app chat.** People talk on WhatsApp after an invite is accepted.
- **Pushes can be up to about 5 minutes late**, because the job is started on a
  schedule rather than by events.
- **Time zone:** all dates and times are Vientiane/Bangkok time (UTC+7).


## Splash screen v89 (cinematic)
- `js/splash.js` draws the whole scene on one canvas (`#sp3fx`); every frame is a pure function of time, so `spSeek(ms)` freezes it. Logo + name are plain HTML above the canvas: they never move.
- Beats: loom (shadow) 0.26 s, gauntlet swing, shuttle hit at 1.0 s, 130 ms slow motion, white flash, shock ring (split colour), debris + dust, decaying camera shake, fractures grow, floor breaks into shards at 1.65 s over the glow, embers. About 2.4 s (`SPLASH_MIN_MS`).
- Red/blue alternates by `localStorage godsmash_splash`. Cracks and shards are random every launch (`?seed=7` fixes them in `docs/splash-preview.html?theme=red&t=<ms>`).
- Reduced motion: one still frame (broken floor + glow), 600 ms.

## v90 batch
- Public game: host card now has Edit (same form, `newGame._editId`, saves with `update`), Cancel game (tells players) and Delete (removes the card, rules already allow host delete).
- Home strip: Rating card now before Badges. Live score: 6th colour theme "Royal"; landscape layout (teams side by side, controls along the bottom, big numbers) for tablets; menu has Full screen when the browser supports it.
- Settings notification test: centred tile with a visible "Send test" button.

## Live score: watch from another device (v91)
- The counting phone publishes `liveGames/{its uid}` (score, teams, serve, theme) through `lsShare()` (250 ms debounce; practice games never). Removed on exit/finish/cancel (`lsUnshare`). Counting never fails if sharing fails.
- Other group members get a "Live now · Watch" banner on Home (`liveWatchStart`, listener scoped to the group, boards stale after 6 h ignored) and open `lsWatch(uid)`: read-only, same landscape layout, follows the score, closes itself when the game ends.
- **Needs the Firestore rule `match /liveGames/{uid}` in `firestore.rules` published by hand**, else sharing silently does nothing and the banner never appears.

## Practice games are watchable (v92)
Practice ("Try it") games publish to `liveGames` with `test: true` (never saved on the phone), so the iPad watch screen can be tried without a session. Banner and watch screen show the Practice badge.

## Same account on two devices (v93)
The Home "Live now" list hides only boards published by this same device (`dev` id in localStorage `godsmash_dev`), not every board of the same user. An iPad logged in with the phone's account now sees the phone's board. Boards are keyed by uid, so one account counts one live board at a time.

## Watch screen: big serve shuttle (v94)
The watch screen shows who serves as a large shuttle above the team name (up to ~190 px in landscape), pulsing, and hides it when the game is over. Layout keeps a fixed slot so both halves line up. Planned next (not built): match count such as best of 3 and "same pairs" for the next game; the `liveGames` document already carries `saved` (games finished) and `a`/`b` (the pairs).

## Match format: best of 3 / 5 and same pairs (v95)
- `live.bo` (1, 3, 5) and `live.sw` ({A,B} games won in this match). Chosen in setup and in Settings. Each game is still saved as its own match document as before; the series is only tracked on the live board.
- After "Save and next game" the same pairs play on straight away (count screen, winner serves). Settings → change teams swaps players. When a side reaches the needed wins the over card says "wins the match 2-1" and the button becomes "rematch with the same pairs" (series back to 0-0).
- The count pill shows Game n · to 21 · Best of 3 (1-0). The shared board carries `bo` and `sw`; the watch screen draws a pip per game needed (filled when won), "Best of 3" in the pill and the match winner line. Tests: /tmp/series_test.js.

## Reset all, and ended games drop their live board (v96)
- Menu "Reset all" (trash icon, so it is not mistaken for Undo) sets score, games won in the match and serve back to 0; the pairs stay.
- A board (and the phone's own "continue counting" banner) disappears when its game is completed or cancelled (`_liveEnded`); the Home list re-renders when sessions change; `lsUnshare` always sends the delete (after a reload the page forgets it shared). Boards untouched for 3 h are ignored. Tests: /tmp/end_test.js.


## Confirm on reset and quit (v97)
Live score: "Reset all" and "Quit" now always show a confirmation, also at 0 - 0 and in practice games (`lsReset`, `lsExit`; texts `lsResetConfirm`, `lsExitConfirm`, `lsExitTestConfirm`). Before, they asked only when points had been counted.

## Live score sizes (v98)
Score font +10% (portrait, landscape, short landscape); the watch screen's serve shuttle -10%; watch halves have equal padding so the whole stack (shuttle, team, pips, names, score) is centred.

## Match score as small text (v99)
The games won in a best-of match show as a small line under each team's big score ("Games won: 1") on the count screen and the watch screen, replacing the pips on the watch screen. The pill still shows Best of N.

## Flip-card match score (v100)
Best-of matches show a folding-scoreboard strip under each team's score (`flipBoardHtml`): a dark card with the games won in yellow, then a small card per finished game with that team's points (yellow when it won that game). `live.gl` keeps the finished games' scores of the running match ([{a,b}]), cleared on a decided match, Reset all and format change; shared to the watch screen as `gl`. Replaces the "Games won" text of v99.

## Faster splash (v101)
The splash scene plays 1.6x faster (`SPEED` in js/splash.js) and `SPLASH_MIN_MS` is 1500 (was 2400): about 1.5 s. While the splash is up it takes the taps, so a first tap on the login form only skips the splash; the shorter time makes that rarer.

## Login never fails silently (v102)
iPad: Log in button greys out then returns, nothing opens. Sign-in itself worked, the step after it (profile / groups / opening the app) threw or hung with no message. `_enterApp` now catches errors and shows "Sign-in stopped (step): message"; a 12 s watchdog warns if the app never opened. Use the message to find the real cause.

## Match score as small text again (v103)
Flip cards dropped (user: a small number is enough). Under the score: "Games won N" then each finished game's points as small numbers, the game that team won in bold. Same data (`sw`, `gl`), only `flipBoardHtml` and its CSS changed.

## Phones hide the match count (v104)
Match score line (`.ls-flip`) is iPad/wide-screen only: hidden at width <= 767px or height <= 500px (phones, also landscape). Data still tracked; match-win title and Rematch on the game-over screen are unchanged.

## Minimal phone score screen (v105)
Phones (width <= 767px or height <= 500px) show only: player names, big score, serve shuttle, Undo / "Game N" / Settings. Hidden: "Team A/B" text, "to 21 · best of 3 (1–0)" part of the pill, top-left Exit (Exit is in the Settings menu), match-count line. Watch screen keeps its Exit button. iPad/wide unchanged.

## No zoom on fast taps (v106)
Spamming + / - zoomed the page (iOS double-tap zoom). `.live-screen` and children get `touch-action: manipulation` (no double-tap zoom, taps still all fire) plus no text selection; `gesturestart/gesturechange` are blocked while `body.live-on`. Deliberately NOT cancelling the 2nd touchend: that would swallow the tap and lose points.

## Games won as a card, points small below (v107)
Match score: a dark flip card with the games won (yellow, big), and under it each finished game's points as small text (game this team won in bold). Replaces the text-only line of v103. Still hidden on phones (v104/v105).

## iPad keeps asking to sign in (v108)
Symptom: iPad shows the password autofill sheet every time, sign-in "fails" or the session is gone on next open. Likely cause: iOS Safari IndexedDB (Firestore offline cache + auth storage) hanging or being wiped; Safari also purges site data of tabs not opened for 7 days (home-screen apps are exempt). Fix: `auth.setPersistence(LOCAL)` explicitly, and no Firestore `enablePersistence` on iOS (`IS_IOS` in firebase-config.js). Tip: install to Home Screen (Share, Add to Home Screen). Unconfirmed on a real iPad: if it still happens, read the "Sign-in stopped (step)" message from v102.

## Best of 3 only, clearer result numbers (v109)
- Best of 5 removed (single game or best of 3). An old saved best-of-5 is read as best of 3.
- When a best of 3 is decided, Save asks first: "Save the match result? Team A wins 2–1" plus every game ("Game 1 21–18 · ...").
- Number labels: game-over screen says "Game N result" above the points and "Match score 2–1 · Best of 3" under it; the flip card is captioned "Games won", points below read "Game 1 21" per finished game.

## Rematch (2 games) and celebration (v110)
- New format "Rematch (2 games)" (`bo: 2`): both games always played with the same pairs; 2–0 wins, 1–1 is a draw ("Match drawn 1–1", confirm "Save the match result? Draw 1–1"). `lsMatchDecided`: someone reached `lsNeed` OR all `bo` games played. `_boLabel(n)` names the formats.
- "Games won" caption removed: the card number is enough. The card of the side leading the match gets a gold ring (`.fc.won.lead`).
- Game over: the winning half glows, the score pops, confetti falls (`.ls-winner`, `_lsConfetti`); the other half fades (`.ls-loser`). Also on the iPad watch screen. Reduced motion: no animation.
- Save and finish clears the live state (`live = null`, `liveMode = "count"`), so the next open starts from the game picker.

## Medal = game winner, card = match (v111)
The side that wins a GAME shows a gold medal above its score (also on the iPad watch screen); the number card stays the MATCH count. Finished games in the small points row get a small medal when that team won them. The score counter resets to 0–0 on Save and next / Rematch.

## Format tabs (v112)
Match format is one tab row, equal width, no wrapping: Single · Rematch · Best of 3 (Lao: ເກມດຽວ · ແຂ່ງແກ້ມື · ໃຜຊະນະ 3 ເກມ). The full name ("Rematch (2 games)") shows as a small hint under the tabs.

## Rematch label (v113)
No "(2 games)" anywhere: the format is just "Rematch" / ແຂ່ງແກ້ມື, and the hint under the tabs is gone.

## Trophy for the match, medal for a game or a draw (v114)
`_lsEnd(st)` says what just ended: `game` (match goes on: medal + glow + confetti, as before), `match` (single game, or the deciding game of best of 3 / rematch 2–0: gold trophy, bigger, same celebration), `draw` (rematch 1–1: medal on both sides, nobody fades, no confetti). Trophy icon is new in icons.js (`trophy`). Same on the iPad watch screen.

## Bigger medal/trophy and the match summary page (v115)
- Medal and trophy are twice as big (portrait: the winner's score shrinks a little to make room).
- When a best of 3 is decided or a rematch finished, the confirm is a summary page (not a native popup): every game as a table (Team A / Team B, winner in gold), the match score, then "Save, rematch" / "Save and finish". Phones: centred card. iPad / wide: card sits at the bottom so the trophy stays visible until the counter confirms; saving resets everything to 0–0 (the watch screen follows).
- Single games keep the normal game-over card.

## Scorekeeper in stats + badge (v116)
- Game rows (stats / session Games tab): games counted with Live score (`live: true`) read "Score counted by [photo] name"; other games keep "Added by name".
- Badge "Pair of the month" replaced by "Scorekeeper" (`scorer`): count the score of 10 games with Live score (`_gamesCounted(uid)` = matches with `live && createdBy === uid`). Lao: ຜູ້ນັບຄະແນນ. Old `_isPairOfMonth` removed (the Best pair card is unchanged).

## Trophy / medal centred behind the score (v117)
The big medal/trophy used to sit above the score in the layout, so the score shrank and dropped when a game ended. Now `.ls-crown` is absolutely centred behind the score (opacity .55, gold glow), the score keeps its size and place, no layout shift, nothing touches the screen edge. The v115 portrait score-shrink rule is gone. Same on the watch screen.

## Serve shuttle does not shift the score (v118)
The team row (`.ls-team`) holds the serve shuttle on the counting screen; with no shuttle (and the "Team A" text hidden on phones) the row was empty, so the score jumped each time the serve changed. The row now always has `min-height: 34px`. The watch screen already had a fixed `.ls-serve-slot`.

## Games count updates when the game ends + pulsing medal/trophy (v119)
The games-won card and the small points row used the saved state, so a finished game only counted after Save (a drawn rematch still showed 0–0 under the celebration). `_lsShown(st)` now counts the game that just ended (1–1 right away, its points in the row) on the counting and watch screens. Medal and trophy keep a slow zoom in/out (`ls-crown-pulse`, off for reduced motion).

## Smoother splash, Scorekeeper = 50 games added (v120)
- Splash: canvas kept under ~1.6 megapixels (iPad was drawing ~4 MP a frame at DPR 2), softer hit-stop (0.4 over 150 ms instead of 0.16 over 130 ms: it read as a stutter), 3 motion-blur ghost arms instead of 5, own compositor layer. Timeline unchanged (about 1.5 s).
- Scorekeeper badge now counts every game the player created (`createdBy`, Live score or typed in, old games included) and needs 50 (was 10 Live-score games). `_gamesCounted(uid)`.

## Faster splash again, Home follows the games (v121)
Splash plays 2.2x (about 1 s) and the minimum is 1 s (0.5 s with reduced motion): the app felt slow to open. The Home page now refreshes when the games load, so its badge count is not stale. Scorekeeper still counts every game the player created (50 needed); the live site had v120 (50) when checked, an old open app shows the old badge until it is opened twice.

## Edit session first, edit poll, poll auto-confirm (v122)
- Session before the bill: the organiser no longer lands straight in the bill editor. The page shows the players plus two buttons, "Edit session" (date, time, court, duration, players) and "Enter bill". Nothing is published until the bill is saved. The Details modal now also edits players (`sessionDetailKeys` already allows `players`).
- Poll "Edit poll" (organiser, while not confirmed or cancelled, also after the cut-off): date, time, court, duration; `closesAt` is recomputed with `defaultCloseAt`, so a new later date reopens voting.
- Poll auto-confirm: when `closesAt` has passed and enough players said Join, the organiser's own device creates the session (`confirmPoll(id, true)`, silent, no jump to the session). Checked on every poll snapshot and every 60 s. Not enough players: the poll stays open for the organiser. Needs the app open on the organiser's (or a manager's) device; the transaction stops double confirm.

## Poll closes one day after it is made (v123)
`defaultCloseAt(date, time, createdMs)`: voting closes 24 h after the poll is created, but never later than the session start time. (Before: start of the play day.) Edit poll recomputes it from the edit time. Recurring public games: first one uses the new rule, later weeks close at the start of their play day. Polls that already have `closesAt` keep it. Auto-confirm (v122) fires at this new cut-off.

## Team names stay level and still (v124)
- Side by side (landscape) only the first team half got the safe-area top padding (`.live-screen > .ls-half:first-of-type`), so on an iPad Home Screen app Team A's names sat lower than Team B's. Both halves now share `padding-top: 20px + safe-area` there (measured in headless Chrome: both names at the same y).
- The points row (`.ls-pts`) is always drawn in Best of 3 / Rematch and keeps a minimum height, so the names no longer move when the first game's points appear.

## Court price by time + bill discount (v125)
- **Price periods** (court window, optional, group's own courts): rows `from – to + price` stored as `court.priceBands = [{from,to,price}]`. Hours outside any period use the court's normal price. `courtCostFor(court, time, duration)` (sessions.js) splits the booking at the period edges (handles a period that crosses midnight) and returns `{cost, parts}`; e.g. 13–18 at 100K, else 120K: 17:00 for 2 h = 100K + 120K = 220K. The session stores `courtParts` only when the price really changes inside the booking; the bill shows "17:00–18:00 × 100,000 + 18:00–19:00 × 120,000". Courts without periods behave as before (hours × price). Directory courts copied into a group have no periods (price override stays flat).
- **Discount** (bill form, optional card before the total): None / LAK / %. Stored as `session.discount {type,value}` + `discountAmount`; `grandTotal` is the net. `computeLedger` lowers every cost (court, shuttles, other, dinner) by the same factor `(gross - discount) / gross`, so each person's part drops in proportion and all dashboards/payments follow without changes; `totals.gross` and `totals.discount` are new. The bill result shows "Discount −X (gross → net)". Editing the court/time/duration later recomputes court cost, parts and the discount.
- `firestore.rules` `billKeys()` now lists `discount`, `discountAmount`, `courtParts` — publish the rules (the organiser can save without it, other editBill roles cannot).
- New icon `percent`.

## Live score sync you can trust (v126)
Problem: the iPad watch screen could show an old score (slow or buffered connection) and nothing said so.
- **Transport** (`firebase-config.js`): on iPad/iPhone Firestore uses `experimentalForceLongPolling` (Safari can buffer the streaming connection, so updates arrived late or in bursts); other devices use `experimentalAutoDetectLongPolling`. Set before any other Firestore call. App-wide, so watch for side effects on iOS.
- **Phone sends faster** (`lsShare` / `_lsSend`): the first tap writes at once; fast taps right after are bundled into one write 250 ms later (was always +250 ms).
- **Heartbeat**: while counting, the phone writes `hb` every 15 s (screen visible only) and pushes the score again when the page comes back to the front.
- **Badge** (`#lsSync`, `lsSyncUpdate`): counting phone shows a red "Not synced" only when a write is stuck more than 3 s, failed, or the phone is offline. The watching screen shows green "Live", amber "Delayed N s" (nothing arrived from the server for 40 s; the iPad's own arrival time is used, so clock differences do not matter) or red "Offline".
- **Order**: the watcher ignores an update older than the one it shows (`updatedAt`), and heartbeat-only changes do not redraw the board (no animation restart).
- Not done on purpose: iPad as the score owner, and the watch remote (next step, own branch).

## Watch remote prototype (v127)
Count from a smart watch (Apple Watch, Wear OS) or Bluetooth earbuds / clicker, no native app. Live score menu → "Watch remote" (green when on; remembered). The app plays 10 s of looping silence and registers Media Session handlers: **previous track = point Team A (left)**, **next track = point Team B (right)**, **play/pause = undo** (500 ms debounce; the audio always resumes). The title on the watch shows `A 12 – 10 B` (`lsRemoteMeta`). Only while counting (not on the watch screen, not after a game ends: the summary needs the screen). iOS needs a tap to start audio: toggling the button is that tap, and any score tap restarts it. Prototype: unproven on real watches (iOS may stop the silent audio when the phone locks; keep the screen awake — Live score already holds a wake lock). Stops when Live score closes.

## Watch screen: names on one line, bigger score (v128)
Landscape screens 560 px and wider: the two players of a team now sit on one line (chips in a row, wrapping only if the names are very long) instead of one under the other. On a tablet the watch screen shows a bigger score (`min(80vh, 38vw, 560px)` instead of 360 px max), larger name chips and a smaller serve shuttle slot to make room. Phones in portrait are unchanged.
- (v128, second pass) Team name and the players share one line on wide landscape screens (`.ls-head` wraps `.ls-team` + `.ls-chips`; wraps to two lines only for long names). Watch screen on a tablet: score by digit count (`data-d` on `.ls-score`): 1 digit up to `min(59vh, 57vw, 640px)`, 2 digits `min(59vh, 31vw, 440px)` (Montserrat's two-digit scores are about 1.5 em wide, so 31 vw is the widest that fits half the screen). The score box has one fixed height, so the names do not move when 9 becomes 10. Games row (card + points) is one compact line there.

## Watch screen: team name, players under it, bigger serve shuttle (v129)
Order is Team name first, the players under it on one line (reverts the same-line idea of v128). The serve shuttle on the tablet watch screen is twice as big (`clamp(96px, 16vh, 160px)`). To keep room the half's top/bottom padding is smaller (8 / 70 px). One and two digit scores share ONE size, `min(50vh, 32vw, 460px)`, and one box height (two digits get `letter-spacing: -.03em`), so they look balanced and the names never move when 9 becomes 10. 32 vw is the widest a two-digit score fits in half the screen.

## "Payments to settle" is one summary card (v130, simplified in v131)
v130 put a row with I paid / Received buttons per person on Home and Dashboard; that was too much. Now it is one card (same look as the Live now banner) at the top of Home and Dashboard: "Payments to settle — You owe X · Owed to you Y — Open". One tap opens the Payments page, where each person is marked paid / received (`markGroupPaid`). No card when nothing is open. `payBoxHtml()` in payments.js, from `myPaymentSummary()`.

- (v131) Payments page: every payment has its own **I paid** / **Received** button and its own confirmation (amount, name, date, court). `markPaymentOne(side, uid, sessionId, key)` settles exactly that one session's transfer. The old "mark all" buttons per person are gone, so a tap can never confirm several payments at once.

## Payment notice that is noticed (v132)
The Home / Dashboard card (`payBoxHtml`, class `.paynote`) now reads as "you still have a payment": warm orange card, a pulsing ring and a red count badge on the icon, "You still have N to pay", the total in big type, "to Bob, Amy +1 · owed to you 30K", and a solid "Pay now ›" button. When you only have money coming in (nothing to pay) it is a calmer green card "Waiting for payment … Check ›". Dark theme: bright fills with dark text; light theme (`[data-theme="light"]`): deeper fills with white text for contrast. One tap opens the Payments page (payments are confirmed one by one there). Ring animation is off with reduced motion.

## Improvement tips: a script per case, no duplicates (v133)
The "Tips to improve" list under Best / Hardest pair (My stats) used one fixed sentence per case and repeated what the two cards above already show (the best pair's 100%, the worst pair's 1–2, then the same person again as "hard rival").
- **46 scripts, 13 cases** (`TIP_COUNT` in stats.js; i18n keys `tip_<case>_<n>`, EN + Lao): best partner, worst partner, same person worst partner AND hardest rival (`both`, one combined tip), hard rival, easy rival, close games, heavy losses (`blowout`), losing run, winning run (`streak`), great form, few games, no clear partner (`mix`), and a pool of 8 general tips (`gen`).
- **Several wordings per case.** The wording is picked from a seed made of the player, the number of games and the last game, so it changes as games are added but stays the same on every reload while nothing changes. Different cases use different offsets.
- **No duplicates:** one tip per case, one per person, the same sentence never twice, at most 4, most useful first (worst/both, losing run → hard rival → best → blowout/close …). Fewer than 3 tips: topped up from the general pool.
- **No numbers in the tips** (W–L, %): the cards above already show them. Old keys `tipBest/tipWorst/tipRival/tipClose/tipRest/tipGreat/tipMix` removed.
- Lao wording is unreviewed.

## Dashboard no longer shows the gear-for-sale card (v133)
The "Gear for sale in your group" card at the top of the Dashboard (Rankings tab) is removed (`gearBoardCardHtml` and its `gearForSale` text deleted). Gear for sale is shown only on the Market page.

## Home / Dashboard feel live: "Playing now" card + Moments (v134)
- **Playing now** (Home): `_sesPhase(s)` = "soon" before the start, "live" from the start until start + duration (Bangkok time, like the poll deadlines; 2 h if no duration; a session with no time is "soon" all day), or "live" while someone counts a score for it; "over" after the end, when completed or cancelled. A live session goes to the top of Home as a red-ringed card: pulsing **LIVE** badge with the elapsed time, the live score and teams (mine from this phone, or another phone's board via `liveNow`), buttons Watch / Continue and Add score (or Live score when nobody is counting). **A finished session is no longer "Next game"** (it used to stay until midnight); after it ends the card shows the next game or "no next game".
- **Moments** (Home under the stat cards, and Dashboard under the payments card): last 7 days from existing data, newest first: games saved ("A & B beat C & D 21–15"), payments marked paid, bills ready, votes joined, new votes. Shows 3, "Show more" opens 10. Events from the last 10 min glow, times read "just now / 5 min ago" and tick, and new events slide in. No new collections or rules. `_moments()`, `momentsHtml()` in home.js.
- **Live refresh:** `_homePulse` runs every 20 s on Home and Dashboard: updates the elapsed minutes and the "ago" times, and redraws Home when a game starts or ends. Polls snapshots now also redraw Home (new votes appear). Reduced motion turns the pulse and slide off.

## Dashboard motion instead of Moments (v135)
- **Moments card removed from the Dashboard** (still on Home). The Dashboard now has motion on its cards instead.
- `_dashMotion(container)` in dashboard.js adds `.dash-anim` when the view really changed (tab, period or person; key `_dashMotionKey`), never on a data refresh, so nothing flickers while Firestore updates. Effects: cards rise one after another (stagger via `--i`), podium rises and its blocks grow, leader/stat/spend rows follow (`--j`), progress bars and monthly bars grow, numbers count up (`_countUp`, ease-out 0.7 s, skips values under 3 and tiles with markup). Press feedback on rows/tabs, hover lift on desktop.
- Reduced motion: no animation and no count-up.
- Technical words: micro-interactions, motion design, staggered reveal (entrance animation), count-up (number tweening).

## Moments card removed from Home too (v136)
User did not want the Moments card anywhere. `renderHome` no longer calls `momentsHtml()`. The "Playing now" live card and its 20 s elapsed-time pulse stay. `_moments()` / `momentsHtml()` are kept in home.js but unused.

## Compact session location (v137)
The two wide buttons "Open map" / "Share location" under the session header are replaced by two small round icon buttons on the same line as time and court (`.sess-where`, `.loc-mini`, `.loc-ic`): **directions** (new icon `route`, opens Google Maps turn-by-turn via new `mapsDirUrl(lat,lng)` in maps.js) and **share** (new icon `share`, `shareLocation()` unchanged: native share sheet, else copy). Labels stay as `title`/`aria-label`. A court without a pin shows one small pin button for admins (`pinSessionCourt`), nothing for others. Saves about 60 px of height. `.loc-actions` CSS kept but unused.

## Wow motion on Dashboard, Rankings and Public (v138)
- New `js/motion.js` (in index.html before dashboard.js, in the sw.js precache): `uiMotion(container, key)` adds `.dash-anim` once per view (key = tab/period/person...), `uiMotionReset()` is called from `showPage` when the page changes, so every visit plays again but a Firestore refresh never replays. Count-up (`_countUp`) now also runs on `.rank-text small` (the rating). Moved out of dashboard.js.
- Used by `_renderDashboard`, `renderStats` (key statsTab|statsPeriod|progressUser) and `renderPublic` (key publicTab|picked day|month).
- Effects added in the "Wow layer" CSS block: light sheen sweeping over each card, medals pop in with a spin, round glow pulse on the #1 avatar (3 times), rank rows slide in from the left with their numbers popping, my own row flashes green once, public game cards flip up in 3D, highlight/insight rows slide in.
- Reduced motion: all off, no count-up.

## My rating card with less text (v139)
`_myStatsCard()` (Rankings and Home): removed the grey "everyone starts at 1500" sentence (the ? button already explains it), the "see my progress" text link and the text labels. Now: name + badge, `#rank ▲change`, big rating, ? button; one row of icon+number chips (win rate, matches this month, best partner avatar) with a round chart button at the right (opens My progress; Home rewrites its onclick as before); last 5 games as W/L chips only, tap opens the list. Old wording kept as tooltips/aria-labels. CSS: `.mh-chip`, `.mh-go` at the end of styles.css. `.mh-explain`, `.mh-best`, `.my-stats-more` CSS now unused. Stacked on v138 (not merged yet).

## Public › Courts is now a real map (v140)
- New `js/courtsmap.js` (index.html, sw.js precache). The Courts tab shows a Leaflet / OpenStreetMap map (already vendored, no key): red pin per court with a pin-drop animation, blue pulsing "you are here" dot (`_here`), the view fits me + the 3 nearest courts. Tap a pin: it turns green and bounces, and a card shows name, distance, hours, upcoming games, **Directions** (`mapsDirUrl`) and **Details** (court modal). Round buttons on the map: find me (`cmLocate`) and **+** (add court).
- **Add / pin from here:** **+** → tap the map (draggable pin, adjust) → "Add court here" opens the court form with the pin already set (`showCourtModal(null, cb, {directoryOnly:true, pin})`; new `opts.pin` presets the map picker and opens the section). Courts with no pin show "Pin on map" in the list: tap the map, "Pin court here" opens that court's edit form with the new pin.
- The list below the map is nearest first, one compact row each, with a directions icon.
- The map is rebuilt on each Public re-render but keeps its last centre and zoom (`_cm.view`). Session/settings pin pickers are unchanged.
- New icon `target`; i18n keys `cm*` (Lao unreviewed). Stacked on nothing (main at v139).

## Search places on the courts map (v141)
- Search box on top of the Public › Courts map (`cmSearchInput`, `_cmSearch` in courtsmap.js): type 3+ letters (450 ms debounce), results list under the box, tap one: pin drops there (draggable), map flies in, bar offers "Add court here" (or "Pin court here" for a court with no pin). The court form then opens with **pin, name and address already filled** (`showCourtModal` opts `{pin, fill:{name, location}}`; for an existing court only an empty address is filled).
- Engines, free, no key: **Photon** (photon.komoot.io, biased to my position / map centre) first, **Nominatim** (OSM) as fallback when Photon fails or finds nothing. Both return Lao names. A pasted Google Maps link or "lat, lng" is recognised (`parseLatLng`) and offered as "Pasted location". Small courts only appear if they exist in OpenStreetMap; otherwise search the street/area or tap the map.
- sw.js: the two geocoder hosts are skipped by the service worker (never cached). Public re-render is skipped while typing in the search box so snapshots do not wipe it.
- New icon `search`, i18n `cmSearchPh/cmNoResult/cmSearchErr/cmCoords` (Lao unreviewed). Photon/Nominatim fair use: debounce, abort of the previous request, no bulk calls.

## Court search: nearest first when location is on (v142)
With `_here` known, `_cmSearch` asks Photon inside a box of about 55 km around me first (`bbox`, plus `location_bias_scale`); only if nothing is there does it search everywhere, then Nominatim (with a `viewbox` around me). Results (up to 15 fetched) are sorted by distance, the nearest 8 shown, each with a distance tag. Without location the order is the engine's own. Results without a name are dropped. Photon's own bias alone was too weak (generic names like "badminton" returned other countries).

## One source for player stats: stats-core.js (v143)
Problem: Rankings said John was the best pair while Progress/Profile said Ton. Five places computed "best partner" with different rules (period, minimum games, win rate vs wins vs rating), four places counted "games" differently, and the `#N` in the hero card differed from the Rankings list.
- New `js/stats-core.js` (before stats.js in index.html, in the sw.js precache). Everyone reads from it: `statsFor(uid, scope)` (played, decided, wins, losses, winRate, streakNow, streakBest), `partnerList`, `bestPartnerOf` (highest win rate, **at least 5 games together** `MIN_PARTNER_GAMES`, tie: more games, more wins, name A–Z), `worstPartnerOf`, `topPairOf` (my pair with the highest pair Elo, 5+ games), `topPairInGroup`, `rankedFor`/`rankOf` (the same ordered list for the hero `#N` and the Rankings rows), `pairRecordsFor`, `formStrip`, `pct` (— when no games), `fmtWL` ("5–3" everywhere), `scopeFrom`/`scopeLabel`.
- **Scope** (`statsScope`, saved in localStorage, default **All time**): All time | This month | Quarter | 6 months | 1 year. One row of chips (`scopeChipsHtml`) on the Rankings card and the Progress tab, and the same scope drives the Rankings lists. Cards say which period they show.
- Two clearly named answers on the Rankings card: **Best partner (wins)** (win rate, 5+ games) and **Top pair (rating)** (pair Elo). The group-wide one is **Top pair in group (rating)**. Progress shows the same best partner as the card, plus the toughest partner under the same rule; tips use these too.
- Home play card is "this month" for both games and win rate; Home rating card "Peak" is the real peak; Profile tiles use `statsFor(me,"all")`. Session counts are called "Sessions" (not "Played"). `ratingWord` in Lao no longer equals the points word.
- Removed dead `_bestPartner`, `homeLevelCardHtml`, `statsPeriod`/`progressPeriod`.
- **Test:** `tests/stats-core.test.js` (node, no deps) builds games where John is 3–0 long ago and Ton 9–3 recently and checks every page names Ton, the hero rank equals the list row, and month/all change together. `tools/release-guard.sh` now runs every `tests/*.test.js`.
- Not done on purpose: the old share-card `makeRecap` (dead code) still has its own best partner; Lao wording is unreviewed.

## Rankings card: Partners list instead of two pair lines (v144)
The two lines "Best partner (wins)" and "Top pair (rating)" showed a partner with a losing record (2–3) and a pair rating under 1500, which means nothing alone. Replaced by a **Partners** list on the Rankings card (`partnersView` in stats-core.js): each partner with a win bar, win %, W–L and the pair's own rating (tooltip explains), most games first, 3 shown + "All partners". ★ = best partner, **! = toughest** (`bestPartnerOf` now also needs more wins than losses; `worstPartnerOf` only a partner under 50%). Same rule feeds Progress and the tips. The scope chips filter the list. Test extended: a 2–3 partner is never starred and is the toughest.

## Rankings card: one smart line + rating trend (v145)
The Partners list (v144) is removed from the Rankings card (the `.mh-partners` CSS is left unused; partner detail is in Progress and Head-to-head). In its place: **one sentence** from `insightFor(uid, scope)` (stats-core.js), first match wins: fewer than 3 games → "Play N more games"; winning streak of 3+; a toughest partner under 40% ("Only X% with Name, talk about positions"); a best partner ("You win X% with Name, play together more"); rating up / down in the period; else steady win rate. Under it a **rating trend** line for the chosen period (`ratingTrend`: start, peak, now, change) drawn with the existing `_sparkline`. Both follow the scope chips. Test extended (smart line names Ton, toughest partner beats best, trend has one point per game, new player gets the "play more" line). Lao wording unreviewed.

## Bill result: "Your part" first (v146, from the CANVAS UX review)
- `_renderSplitResult` now opens with `_yourPartHtml`: my amount (big), the split into court / shuttle / other / dinner, one row per person I pay (with a **Mark paid** button where `_canMarkTransfer`) or who owes me, "Paid" tick when settled, and "You owe nothing" / "All paid. Thank you!". The group total is one small line. The cost cards, settlement table and per-person list moved into **How this is calculated** (`details.how-calc`, closed for players, open for organisers). Pay-by-type cards (the QR codes) stay visible. The Messenger text preview is folded (`details.msg-prev`); the copy button stays.
- `askConfirm({title,big,body,yes,danger}, onYes)` in motion.js: bottom-sheet confirm. Used by `markPaymentOne` (no more browser `confirm()` there; the other 28 `confirm()` calls are unchanged). QR strips show a shimmer skeleton and a retry button when loading fails; `.pay-item-btn` is 44 px high.
- Stacked on v145. Lao wording unreviewed.

## Design system layer (v147, from the CANVAS UX review)
- **Tokens** in `:root` (end of styles.css): spacing `--s1..s5`, radius `--r-sm/md/lg/pill`, type `--t-xs..xl`, shadows, easing/duration. Used by the normalised components; older rules migrate gradually (`.card` uses `--r-lg` now).
- **Buttons:** primary / secondary / danger / share / next share one radius and a 46 px minimum height; `.edit-btn` / `.delete-btn` / `.period-btn` have a 40 px minimum (plus the 44 px hit area); one focus ring for keyboard users. Flat accent buttons I added earlier (`.yp-btn`, `.mh-go`, `.mh-ii`, `.cm-fab.add`) now use `--primary` (white text on the light accent was low contrast).
- **Text size floor 12 px:** all `font-size: 11px` in styles.css and `font-size:11px` in js/*.js became 12 px. Check tight chips and Lao on a phone.
- **Light theme:** the base light block now sets `--accent: #0d9488` and `--orange: #b45309` so accent text on white passes contrast; the palette rules (higher specificity) still win.
- **Rankings chips** show a visible word under each number (win rate, games, streak) and the scope chips are 36 px high.
- Not done: the duplicated old rules (`.back-btn`, `.fab-btn`, `.period-btn`, `.btn-share` defined twice) and the many radius / padding values are not merged yet; the Audit/Batch/Wow override layers still exist. Stacked on v146.
