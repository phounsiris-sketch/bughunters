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
| `tests/push-cheap-v250.test.js` | The two-phase push sender gives exactly the pushes of the old always-full sender (see v250) |
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

## Polls, Community, Dashboard clean-up (v148, from the CANVAS UX review)
- **Poll card:** one big choice row (`.vote-seg`, one button per answer with its count; the chosen one is highlighted) replaces the radio list; **Who voted** folds under it (`details.poll-who`); closed polls show the list read-only. The Plan/Play/Pay tracker is gone from poll cards (it stays on the session). Organiser buttons: **Confirm plan** stays visible when there are enough players; Add votes, Edit and Cancel live in a **Manage** menu (`details.poll-manage`). The dangerous Cancel is never open by default.
- **Community:** `#publicTabs` scrolls sideways instead of overflowing; the game card facts are two lines (court + distance, then price + level); a host sees Edit and a Manage menu (Cancel game, Delete); the city filter is a compact pill.
- **Dashboard:** the "no show" and "no vote" boards are folded under "More boards"; the sheen sweep on cards is off (rise, bars and count-up stay).
- Stacked on v147. Lao wording unreviewed.

## Restaurant master data + bill photos on every cost (v149)
- **Restaurants master data:** Settings > Configuration has a new tab **Restaurants** (`_renderRestaurantsTab` in restaurants.js): search, each restaurant with photo, address, map link, rating and "used in N bills"; **edit** (pen) for the person who added it, anyone with editConfig, or the super admin; **delete** (trash, bottom-sheet confirm) only for who added it or the super admin (the Firestore rule says the same; a group admin editing someone else's restaurant is allowed by the rule, deleting is not). New restaurants can be added there too.
- **Fix a wrong restaurant on a bill:** the dinner card of the bill editor has a pen next to **Change** (edit the restaurant itself), and the settled bill's restaurant block has a pen as well. Bills show the master record (`restaurantById`) first and only fall back to the name saved on the bill, so a correction shows on every bill that used it. `showRestaurantForm(prefill, editId, onDone)` now also edits (name, address, pin, photo; `createdBy` is kept).
- **Bill photos (evidence):** court payment (`courtReceipt`), shuttlecocks (`shuttleReceipt`) and every other cost (`otherCosts[i].receipt`, e.g. a drink bought by a player) can carry a photo, like the dinner receipt. Attach in the bill editor (camera button; also in the "add other cost" form), shown on the matching pay-by-type card of the settled bill (tap to enlarge). Photos are stored as `images/` documents and the session keeps the reference. **`firestore.rules` `billKeys()` gained `courtReceipt` and `shuttleReceipt`: publish the rules.** Only people who can edit the bill can attach photos.
- Tests: `tests/restaurants.test.js` (who sees edit / delete). Stacked on nothing (main is v148).

## Place search in the court and restaurant forms + public Restaurants map (v150)
- **Search like Google in the forms:** the map picker (`mapPickerHtml`, used by the court form and the restaurant form) has a search box. Type 3+ letters, pick a result: the pin moves there and an empty **name** and **address** are filled (`_PICK_FILL`: restPin -> mRestName / mRestLoc, courtPin -> mCourtName / mCourtLoc). A pasted Google Maps link or "lat, lng" works too.
- One search engine for everything: `geoSearch(q, near, signal)` in maps.js (Photon around me first, Nominatim fallback, nearest first, up to 8, no key). The Public courts map now calls it too (`_cmSearch`). `tests/geosearch.test.js` covers nearest-first, dropping nameless rows and the fallback.
- **Public › Restaurants:** a new tab on the Public page (after Courts) with the same map as Courts (`courtsmap.js` now takes a kind: court | rest): orange pins, pin-drop animation, "you are here", tap a pin for name, rating, address, Directions (and Edit for whoever may manage it), search to add, "Pin on map" for a restaurant with no pin, nearest-first list. The restaurant form opens with pin, name and address filled (`showRestaurantForm(prefill, editId, onDone, pin, prefillLoc)`). The restaurant list is the same shared master data as Settings > Restaurants and the dinner picker, which was already visible to every signed-in user.
- The Public page now redraws when courts or restaurants change (`refreshCurrentPage`).

## Security hardening (v151, from the security-code-audit review)
- **XSS guards (client):** `safeUrl(v)` (app.js) lets only image data URLs (jpeg/png/webp/gif), `img:<id>` references and http(s) addresses into `src="..."`; `jsq(id)` drops every character but letters, digits, `_` and `-` from ids placed inside `onclick="fn('...')"` (118 call sites wrapped by a one-off codemod). Sinks fixed: avatars (`avatarHtml`), `imgSrcAttrs`, QR images (payments, people, sessions, settings), public game photo, `openImage`. `askConfirm` now escapes title/big/body itself (callers pass plain text).
- **Rules (publish them):** `isVerified()` (email_verified) is now required to create courts, restaurants, open games and images (sign-up and reading are unchanged); client-chosen ids must be `[A-Za-z0-9_-]{1,80}` for groups, polls, sessions, courts, restaurants, open games, images; `avatarUrl`, restaurant/court `photo` must be an image data URL, `img:` ref or https address (`photoOk`); courts and restaurants must have valid name/location/lat/lng (`courtOk`, `restaurantOk`) on create **and** update; `images.data` must be a jpeg/png/webp data URL; a member can change only **their own** poll answer and vote-log line (`responses`, `voteLog`); member nick ≤ 40 and message ≤ 120 chars. Courts and restaurants stay wiki-style (anyone signed in can correct details) by design.
- **Not done (needs a data move, decide first):** phone/email in the readable `users` doc, payment QR and receipt images readable by any signed-in user, `settled` marks per person, a Content-Security-Policy (inline handlers need `unsafe-inline`), App Check, a custom domain. The rules could not be run in the emulator here: test with the console Rules Playground or the emulator before relying on them (long data-URL regexes are the thing to watch).
- Test: `tests/security.test.js` (guards + a scan that no raw value reaches `src="..."`).

## Money and bill-save fixes + static checks (v152, from the data-reconciliation review)
- **"Pay To" without a name (my v146 bug):** the hero used `payTo`, a key that already existed ("Pay To", short label) so the later one won. Hero now uses `payToName` ("Pay {name}").
- **One total everywhere:** the list card showed the stored `grandTotal`, the detail page the ledger. The list now uses `_grandOf(s)` (= `computeLedger(s).totals.grand`) and both save paths store the ledger's number (a dinner with nobody eating or a cost with no players is not charged, so it is not in the total).
- **Rounding is no longer silent:** every payment is rounded to `ROUND_TO`, so with odd totals the payer can get a little less (7 players: about 1,400 ₭). `ledgerRounding(s, L)` lists who gets less/more and the bill's "How this is calculated" shows it next to "Amounts are rounded to X".
- **Money formatting:** `fmtLAK` never prints "-0"; `fmtShort` never prints "1000K" (999,950 is "1M") and has a "B" tier.
- **Bill save:** the "payments will be cleared" question is the in-app sheet (`askConfirm`), not the browser popup. A payer was already required before saving (the review's no-payer case only comes from old/imported data).
- **Static checks** (`tools/check-static.js`, run by `release-guard.sh`): duplicate i18n keys inside one language, EN/LA key mismatch, a `<script>` that `sw.js` does not precache, a precached file that does not exist. `sw.js` ASSETS gained the 7 missing scripts (groups, maps, restaurants, public, stats, profile, social) and Leaflet.
- **Test:** `tests/ledger.test.js` (11 bills: shares add up, transfers net to zero, nobody pays themself, list total == ledger total, rounding reported, format edges).
- Not done: the other review items (negative other costs from old data, `parseMoney` with "1.234.567", per-currency cents).

## Release safety + contrast / accessibility (v153, from the UX audit and release review)
- **CI gate:** `.github/workflows/pages.yml` now runs `sh tools/release-guard.sh` (syntax, versions, i18n and offline-cache checks, all `tests/*.test.js`) before it builds and deploys; a red guard means nothing is published.
- **Contrast:** the WhatsApp share button (#128c4a), "costs" / "settled" badges, poll "open" badge and the pay banner use darker fills so white text passes 4.5:1; light-theme `--text-dim` is darker in all five light palettes; accent used as text on light themes goes through `--accent-text` (the palette accent mixed 32% darker); success / danger text use `--ok-text` / `--danger-text` per theme. Numbers come from the audit's contrast script.
- **Dialog and keyboard:** `#modal` is a real dialog (`role="dialog"`, `aria-modal`, `aria-labelledby`), focus goes to the first control and **back to the opener** on close; the receipt "attach" input is hidden visually (not `display:none`) so keyboard users can reach it; focus rings on the search boxes; small icon buttons have a 44 px hit area.
- **Labels and headings (runtime):** the existing keyboard shim in app.js also gives every `label.form-label` without `for` the next field's id, and marks `.card-title` / `.settings-section` (level 2) and `.me-title` / `.modal-title` (level 1) as headings.
- `<html lang>` is set from the saved language before first paint; Lao script gets no letter-spacing/uppercase on pills and labels.
- Not done: merging the duplicated CSS rules and the override layers, arrow-key navigation on the poll choice row, 200% zoom and 320 px checks on real screens.

## Speed and stacking (v154, from the frontend / infra reviews)
- **Scripts no longer block the first paint:** every local script except `splash.js` and all four Firebase scripts have `defer` (they still run in order, after the page is parsed). The 173 KB `i18n.js` and the other modules are unchanged; lazy-loading rarely used modules and splitting `i18n.js` per language are still open.
- **Service worker:** map tiles go to their own cache (`godsmash-tiles`, at most 250 tiles) instead of filling the app cache.
- **Image loader** only looks at the nodes that were just added (it used to scan the whole page on every change); image elements get `decoding="async"`.
- **Redraw bursts:** `refreshCurrentPage` runs the first call at once and folds the calls of the next 150 ms into one (each distinct reason still runs once). **`statsFor` is memoised** per player and scope until the games or the day change (the Rankings list used to scan all games once per row).
- **CSS:** toasts (3000 / 3001) sit above sheets (2500) and the image viewer (2600); the map is `isolation: isolate`; `dvh` for the login page, modal and sheets on iOS; live screen respects the side safe areas; only the first 8 Rankings / leader rows animate.
- **Not done (needs live numbers or a decision):** cutting the push worker's reads (`push/send.js`, 5 unfiltered collections every run, plus the double trigger), limiting what the app downloads on open (matches, users, restaurants, reviews), moving to the Blaze plan with a budget cap. Check real read counts in the Firebase usage page first.

## v155 — hardening follow-ups
- `parseMoney`: "1.234.567" and "1.234" read as thousands (kip has no decimals); minus sign dropped. Test: `tests/money-parse.test.js`.
- `_permError` now returns friendly text (offline, busy/quota, gone, sign in, generic) instead of raw Firebase messages. Keys `errOffline…errGeneric` (EN/LA, Lao unreviewed).
- Bill publish checks the live `billAt` first; if someone else published meanwhile, an in-app sheet asks before replacing.
- Photos dropped from a bill (receipts replaced/removed) are deleted from `images/` after a successful save (own photos only; rules allow creator/super admin).
- Home first-open card (`_homeStartCard`): 3 steps, hidden once a match exists or the user taps hide (`localStorage onbHidden`).
- Removed dead code: `momentsHtml`, `_homeName`, `makeRecap`, `_detailLine`, `_monthLabel`, `dbGetSession`, `.loc-actions` CSS.
- Join-request notice to admins already exists in `push/events.js` (review finding was stale).

## v156 — choices look tappable
- Bug: light theme inherited the dark `--poll-option-bg` (translucent navy), so vote buttons looked grey and disabled.
- New tokens `--control-border` (3:1 edge against the card) and `--choice-bg`. Resting choice = white/surface fill + visible edge; selected = solid fill + white text (+ check on votes).
- Same edge applied to `.chip`, `.period-btn`, `.seg-btn`, `.level-opt`, `.day-chip`.
- Poll shows "Tap your answer to vote" until the user votes (`voteTapHint`).

## v157 — contrast sweep
- `tools/contrast/` renders every button class in 10 themes and reports weak text contrast / flat edges (see its README).
- Fixed: accent text on light (pw-toggle, cal-toggle, nav active, crumb, paid link) now uses `--accent-text`; red text uses `--danger-text` (light #c81e1e); share button darker green; secondary/edit/nav/chip controls use `--control-border`; active bottom-nav tab gets a bar + bold; disabled buttons look disabled (`:disabled` opacity).

## v158 — poll plan padding
- An older rule (`.poll-card .poll-plan { padding: 0 }`) removed the box padding while dark mode still painted its background, so tags and the note touched the edge. Padding restored (12/14), tags and note spaced.

## v160 — Halloween style
- New dark style "Halloween" (`PALETTES` in app.js, Settings > Appearance > Dark style): indigo night sky, glowing moon (peeks through the header), stars, cobweb corner, haunted-house silhouette, orange accent (`#c2410c` so white text stays readable). All drawn with CSS background layers on `body`, no image files.
- `_hwBats()` adds three CSS-animated bats (`#hwBats`, pointer-events none, hidden under reduced motion); removed when another style is picked.
- Home shows a seasonal card Oct 20 – Nov 2 (`_hwCard`) with "Try it"; hidden after use or ✕ (`localStorage hwHidden`).
- `tools/contrast/audit.js` now includes the Halloween style. Lao wording unreviewed.
## v159 — our own confirm sheet (no browser popups)
- `askConfirm({title, body, detail, kind, type, yes, no, onNo}, onYes)` in `js/motion.js`: icon badge (trash/warning/question), title, optional name chip, optional typed-word lock (`type`), big action button on top, quiet Cancel below. Esc, tap outside and Cancel close it; focus is trapped and returns to the opener; danger kind focuses Cancel so a stray Enter never deletes.
- `askYes(msg, onYes, {danger, kind, yes, detail, type})` is the short form; `askCopy(title, text)` replaces the `prompt()` clipboard fallback.
- All 30 native `confirm()` / `prompt()` calls were converted (code after the confirm now runs in the callback). `tests/security.test.js` fails if any native `confirm/prompt/alert` comes back.
- Delete-group now asks for the group name inside the sheet (the Confirm button stays locked until it matches).

## v160b — special themes (separate from Dark/Light styles)
- Halloween moved out of the dark styles into a new **Settings > Special themes** card; four themes: Halloween, Christmas, Songkran / Pee Mai, Neon Arcade (`SPECIALS` in app.js, `setSpecial(id)`, saved as `special`; dark mode only, "Back to normal style" turns it off). Body gets `data-special`.
- Reaches every page: all `.card` / `.session-card` / `.cost-card` / `.pay-card` (dashboard, votes via `.poll-card`, sessions, payments) get a themed ornament (cobweb, snow cap, wave, neon line); home cards (`.hs-*`), `.home-next` and `.ls-bar` get themed gradients; the live score halves get ornaments and the team colours follow the theme (`LS_THEMES` entries 6-9, `LS_SPECIAL_IDX`; a colour set picked by hand in live-score settings wins).
- `#fxLayer` (z 410, above the live score) draws bats / snow / bubbles / sparks with CSS only; off for reduced motion. Home shows a seasonal "Try it" card inside each theme's date window (`_hwCard`; Halloween Oct 20-Nov 2, Christmas Dec 15-Jan 2, Songkran Apr 10-20, Arcade none).
- `tests/special-themes.test.js` checks CSS block, texts EN+LA and live-score colours for each theme. Lao text unreviewed.

## v161 — share my stats card
- `js/sharecard.js`: `openShareCard()` opens a sheet with a picture (canvas, 1080x1920 story or 1080x1350 square) of my rating, rank, level, win rate, games, streak, best partner (wins), rating trend and last 5 results for the chosen period (`statsScope`). Numbers come from `stats-core.js` via `shareCardData()` (plain data, tested).
- Look: "My theme" follows the active special theme (Halloween / Christmas / Songkran / Neon Arcade) or the normal style; chips let the user pick any other. Share uses the phone's share sheet with the PNG when possible, else downloads it.
- Entry points: Profile hero button and a share icon on the Stats "my card". Own card only. Avatar is drawn only from data URLs / stored images (a web link would taint the canvas); otherwise an initial.
- `tests/sharecard.test.js` covers the data, the theme palettes and the EN + LA texts. Lao wording unreviewed.
- Card design is badminton-first: a court seen from above (outer, singles and service lines, centre line, net mesh) behind everything, crossed rackets behind the photo, shuttlecocks beside the rating, "GODSMASH BADMINTON" header. "Normal" look is a court-green hall; each special theme keeps its own backdrop with the court lines on top. Drawn in `_scCourt`, `_scShuttle`, `_scRacket` (canvas, no image files).

## v162 — health (phase 1)
- **Live score time is now exact**: `lsGameWindow()` counts from the first point (`live.firstAt`) to the save, and the match stores `startAt`, `endAt` and `minutes`. Before, minutes ran from the previous save, so rest and team changes were counted inside the next game. Older matches keep their saved minutes. Games typed in without minutes are not used for health.
- `js/health.js`: pure functions (`healthZones`, `healthMaxHr`, `healthSegments`, `healthKcal`, `healthSeries`, `healthForSession`, `healthTotals`) plus the screens.
- **Personal zones**: Karvonen share (50/60/70/80/90 %) of (max − resting); max = entered, else 208 − 0.7 × age; without a resting rate, share of max; no max, no zones. Never one shared table.
- **Profile > Health details** (`pfSub = "health"`, stored in `userPrivate/{uid}.health`): weight, height, sex (optional), resting HR, max HR, weekly goal, notes; shows my zones and period totals (same scope chips as Stats). Rules: only the owner reads or writes; `healthOk()` bounds every number and caps notes at 300. **Publish `firestore.rules` and try it in the Rules Playground.**
- **Session Games tab**: "My workout" card for players with timed games: on court, active kcal, average / peak bpm (estimate), minutes in Z3+, chart with the player's own zone bands and close games shaded. Hidden if I have no timed games; asks for weight or age when needed.
- Estimate maths: MET x kg x hours (play 5.5, warm-up 4 for 10 min, rest 2; check the values against the activity compendium before relying on them); the heart rate curve is built from the player's own reserve; real watch data comes with the native app phase.
- `tests/health.test.js` covers zones for two different players, matches filtering, kcal reference numbers, close-game effect, live-score minutes, rules and EN + LA texts. Lao text unreviewed.

## v163 — Health & exercise pages (Samsung Health style)
- New pages `health` (overview) and `workout` (one session), files `js/health-ui.js` + pure helpers in `js/health.js` (`healthWorkouts`, `healthRangeBounds`, `healthRangeSummary`).
- **Overview**: Week / Month / Year, range arrows, big total time, kcal, average bpm, sessions, games, bar chart per day or month with a dotted average line, my own zones with coloured time bars (Z1 blue, Z2 green, Z3 yellow, Z4 orange, Z5 red), then the workouts list grouped by day (duration in cyan, kcal in purple, time on the right).
- **Workout detail**: green court hero with big duration and date, Samsung-like detail tiles (duration, active energy, total energy, average and max heart rate, on court), heart rate line coloured by zone with the games shaded (numbers on top), zone rows, games list (close games highlighted), share and "open the session".
- **Paths**: Home swipe card -> overview; Dashboard card (top of the Leaderboard tab) -> week, month, workouts, zones, health details, share card; overview -> a workout; the "My workout" card on a session -> workout detail; Profile > Health details -> overview.
- Fix found by test: the cool-down after the last game could push the estimated heart rate below resting; it now settles near 12% of the reserve. The test checks every point of every curve stays between resting and max.
- Lao wording unreviewed.

## v165 — Chinese New Year replaces Songkran
- The special theme id `songkran` is now `cny` ("Chinese New Year", `spCny*` texts). Red and gold palette, hanging lanterns at the top, a lion dance head and a dragon along the bottom (SVG data URIs, no files), a small lantern hanging on every card, floating lanterns rising (`fx-lanterns`), red/gold home cards and live-score colour set, red/gold share card with lanterns, lion and dragon drawn on the canvas (`_scLantern`, `_scLion`).
- Seasonal "Try it" card on Home from Jan 20 to Feb 25 (the date moves each year: 2026-02-17, 2027-02-06, 2028-01-26). A saved choice of `songkran` falls back to the normal style.
## v164 — bottom nav
- Removed the coloured strip on top of the active bottom-nav tab (added in v157). The active tab stays bold and in the accent colour.

## v166 — app bar
- The app bar (`.app-header`) now sits above the special-theme effects layer (`#fxLayer`, z 410): bar z-index 430. While the live score is open (`body.live-on`) it drops back to 100, because the live score covers the whole screen.
- The bar is 20% lower (vertical padding 12 -> 6 px, 58 -> 46 px plus the phone's top inset) and the blur behind it in the special themes is softer (6 -> 3 px).

## v167 — no blur behind the app bar
- Removed `backdrop-filter` from `.app-header` in all special themes (and forced `none`), so nothing blurs behind the bar on iOS. The confirm sheet backdrop keeps its light blur.

## v168 — living backgrounds for the special themes
- New `js/fx.js`: one canvas (`#fxCanvas`, **z-index -1**, behind every card and button, never over content) plays a loop at about 30 pictures a second. Scenes are plain functions of time in `FX_SCENES`: Halloween (flapping bats, drifting ghost, rising embers, pulsing moon glow), Christmas (twinkling garland and falling snow), Chinese New Year (swaying lanterns, a dragon swimming across the bottom chasing a pearl, a dancing lion), Neon Arcade (pulsing striped sun, moving grid, twinkles, shooting stars).
- **Dragon** (`fxDragon`): 38 body segments in a travelling wave, gold scales and dorsal fins, two walking legs, tail tuft, head with chewing jaw, teeth, blinking eye, flowing mane, waving whiskers and horns. **Lion** (`fxLion`): bouncing head, rippling mane, blinking eyes, moving brows and ears, chewing mouth, swaying beard and pom-pom, cloth body on hopping legs. **Lantern** (`fxLantern`): glow, swing and swinging tassels. The share card draws these same functions as still poses.
- Pauses when the screen is hidden or the live score is open; draws a single still frame when the phone asks for reduced motion. The old floating DOM particles and the static dragon, lion, lanterns and arcade sun in the CSS background are gone.
- `tests/special-themes.test.js` checks every special theme has a scene and that the canvas stays behind the app.

## v169 — Rankings card alignment, solid app bar
- Rankings "my card" top (`.mh-top`) is a grid: photo, name (one line, ellipsis, never breaks "MartinyBob" into two lines), share and help buttons on the right; level badge, rank and rank change on one row under the name; the rating gets its own row below with a thin divider. The three fact chips and the progress button share one even row.
- The app bar is opaque in every special theme (it was 55-75% see-through, so scrolled cards smeared through the title and buttons, which looked like blur on iOS).

## v170 — fierce dragon and lion (Chinese New Year)
- `fxDragon` redesigned: shaded cylinder body with ochre belly plates and overlapping scales, sharp swept-back ridge spikes (dark root to gold tip), clawed legs, a flame-mane streaming from nape and chin, antlered horns with tines, a heavy angled brow over a glowing slit-pupil eye, flared nostril with smoke, upper and lower fangs, and a jaw that drops wide on a roar (`roar = max(0, sin(0.9 t))^3`) while a flickering fire plume (`_fxFire`) shoots from the mouth and the pearl is pushed ahead.
- `fxLion` redesigned: three layers of spiked flame-mane whipping in the wind, furrowed forehead wrinkles, thick angled brows over glowing glaring eyes under half-lowered lids, a broad flared nose, a roar cycle (`pow(max(0, sin(1.1 t)), 2.2)`) that drops the jaw, shows upper and lower fangs and a tongue, and shakes the head, ragged beard and cheek fur; the cloth body has a gold scale pattern.
- Same API as before, so the share card keeps using them as still poses.

## v171 — classic cartoon dragon and lion dance head
- Redesigned to match the classic cartoon look: dragon with red scale rows, broad golden belly plates (rotated with the body), golden leaf-shaped fins, orange flame swirls at the bends, grey-gold branching antlers, a long tapered snout with a big round white eye under an angry lid, golden mane, beard and whiskers, red legs with golden claws; it still roars fire.
- Lion: white scalloped fur fringe, twin red crest horns, a gold flower with a blue-white centre, a spiral horn with a pom-pom, huge ringed eyes (black, white, yellow, red, pupil) that roll, fluffy white brows that tilt when it roars, golden nose, big white moustache over a fanged laughing mouth, swinging tassels with red balls, flapping ears, striped wavy cloth body with a white fur hem.

## v172 — anime-inspired special themes
- Four more special themes (Settings > Special themes): **Ninja** (Naruto style), **Dragon Orbs** (Dragon Ball style), **Pirate Seas** (One Piece style), **Soul Reaper** (Bleach style). Original art only: colours and generic motifs (shuriken, swirls, glowing orbs with stars, golden aura, ship, waves, crescent moon, butterflies, slashes). No characters, logos or marks from those series.
- Each has: token palette, solid app bar, themed cards with a small corner motif (shuriken, orb, anchor, crescent), home and live-score colours, live-score colour set (`LS_THEMES` 10-13), an animated background scene in `js/fx.js` (`FX_SCENES.ninja|orbs|pirate|reaper`), a share-card palette and a share-card backdrop (the same scene drawn as a still), and EN/LA texts. No seasonal "Try it" card (no date window).
- `tests/special-themes.test.js` now checks 8 themes; the contrast audit tool covers all of them.

## v173 — golden ninja, flying yellow clouds, battle ship
- **Dragon Orbs**: two golden-yellow clouds (`_fxGoldCloud`: swirled puffs, curl marks, shedding puffs) drift across the sky, bobbing, in front of and behind the orbs.
- **Ninja → Golden Ninja** (id `ninja`): yellow flash / golden chakra mode. Black, gold and amber palette with a golden halo; black-outlined golden chakra flames (cloak) rising along the bottom, rising sparks, a yellow lightning bolt every few seconds and yellow flash streaks that zip across the screen. Corner motif is a lightning bolt.
- **Pirate Seas** (id `pirate`): colours of the straw-hat outfit: red (primary), straw yellow (accent), blue (surfaces); card corner motif is a straw hat. The scene now has an aggressive battle ship (`fxShip`): raked dark hull with a ram spike and a snarling red figurehead, torn crimson sails with a skull and red pennants, gun ports firing in turn (flash, smoke, cannonball arc), spray at the bow, hard pitching; stormy sky with lightning flashes and a faster ship.

## v174 — decorations hang from the app bar, flat cartoon gold cloud
- The app bar is opaque, so anything drawn at the top edge of the screen was hidden behind it. `_syncHeaderVar()` publishes the bar's real height (it grows with the phone's top inset) as `--hdr-h`, and `js/fx.js` passes it to every scene as the 5th argument `top`. Lanterns (Chinese New Year) are tied to the bottom edge of the bar; the Christmas garland, the Halloween moon and bats, the orbs and clouds, the pirate sky, the reaper moon and butterflies, the ninja lightning and the arcade shooting star all start below it. The static CSS layers that sit at the top (Halloween moon, craters, glow and web; Christmas bulbs) use `var(--hdr-h)` too.
- `_fxGoldCloud` redrawn as a flat cartoon cloud: bumpy lobes with one clean outline, a light top and a darker crescent under each lobe, dark nicks where lobes meet, and a long curling tail that trails behind and sways.

## v175 — Golden Ninja redesigned with ninja gimmicks
- New in `js/fx.js` for the `ninja` scene: a ninja silhouette (`fxNinja`: forward lean, run cycle, swinging arms, flowing headband tails and red scarf, gold rim light, plain headband plate) that runs along the rooftops (`_fxRoofAt` follows the zigzag) and leaps; every ~9 s a **shadow-clone poof** (`_fxPoof`, cartoon smoke) makes two copies that fade out; a **kunai** (`fxKunai`) is thrown across the screen every 4 s with a trail.
- Also: a spinning **chakra sphere** (spiral arms, orbiting sparks, blue-white glow), a **leaf vortex**, drifting **paper tags**, a pale moon with a golden halo under the app bar, and the existing golden chakra flames, lightning and yellow flash streaks. All art is generic and original.

## v176 — jet-trail clouds, Namek village, ninja without the yellow motion
- **Gold cloud trail**: `_fxGoldCloud(c, x, y, s, t, trail)` takes the cloud's own past positions (`trail`, newest first) and draws a tapering golden ribbon with fading vapour puffs and a small curl at the end, so the tail follows the exact path (bobbing included) like a jet trail. The orbs scene samples the path function at `t - k*0.075`; the trail breaks where the cloud wraps around the screen.
- **Dragon Orbs**: the saiyan-style golden aura is gone. Namek-style village instead: blue-grass hills, three round white-teal dome houses with windows, a door and a pulsing antenna light (`fxNamekDome`), a banded tower with a ring and a glowing tip (`fxNamekTower`), three small suns, a green-teal sky (body gradient and share card). Orbs and clouds stay.
- **Golden Ninja**: the yellow motion (aura flames, lightning, flash streaks, sparks, halo) is removed. New gimmicks: a rival ninja in blue running the other way, with a white spark burst where the two blades clash; a big fireball jutsu every 10 s (orange flames with a trail); a cyan summoning circle with an unrolling ninja scroll every 14 s. Kept: runner, shadow clones, kunai, chakra sphere, leaf vortex, paper tags, moon. `fxNinja` now takes scarf/headband colours and a direction.

## v177 — icon styles for the Dashboard
- Settings > "Dashboard icons": four styles, saved in `localStorage iconTheme`: **Classic** (Solar duotone, default), **Outline** (same shapes drawn as lines), **Colour tiles** (white icon on a rounded coloured gradient tile, colour picked from the icon name), **Emoji** (matching emoji; controls such as arrows, plus/close, search, edit and settings stay plain icons).
- Only the Dashboard follows it: `icon()` in `js/icons.js` uses the chosen style only while `_iconCtx` is on, and `_renderDashboard()` (wrapper in `js/dashboard.js`) switches it on around the real render (`_renderDashboardInner`) and always off again. Every other page keeps the classic icons. `iconAs(style, name, size)` draws one icon in a given style (the Settings preview uses it).
- `tests/icons.test.js` checks the saved style, classic outside the dashboard, each style's markup, plain controls, that only the dashboard switches the context on, and the EN + LA texts.

## v178 — icon styles reach the nav bar and app bar, redesigned
- `applyChromeIcons(page)` (js/icons.js, called from `showPage`): while the **Dashboard** page is open, the bottom nav bar and the app bar icons (`fillStaticIcons`) are redrawn in the chosen style, and put back to classic on any other page. `body[data-icons]` marks the active style for CSS. No redraw when nothing changed.
- Redesigned styles: **Outline** is now duotone line art (main shapes a clean stroke, the soft second layer a lighter line); **Colour tiles** are glossy squircles (gradient, top highlight, inner edge, soft shadow) and shrink to 32 px in the nav bar with a ring on the active tab; **Emoji** sit on a soft round chip tinted with the accent colour (settings and dashboard emoji added, controls stay plain). The centre Home button keeps its round background in every style.
- `tests/icons.test.js` also covers the nav/app bar behaviour (dashboard only, no redundant redraw, always back to classic).

## v179 — Ninja Village (the stick ninjas are gone)
- Removed both silhouette ninjas, the clones, clash, fireball and summoning circle (and `fxNinja`, `_fxRoofAt`). The theme is orange and night blue again, closer to Naruto's colours. Scene: dusk glow and a big setting sun with turning rays behind two mountain layers; wooden rooftops with a red torii gate and a ramen stall (striped awning, swaying noren, two bowls with rising steam); two strings of paper lanterns that flicker; a chakra sphere; a gust of leaves with wind lines plus a leaf vortex; drifting paper tags; shadow-clone smoke pops over the rooftops; shuriken and a kunai flying through. Card corner motif is a swirl. All original, generic art.

## v180 — icon style fix: Home page too, picker layout
- Cause of "the icons do not change": the style was switched on only while the **Dashboard** page rendered, but the page most people open (and call the dashboard) is **Home**. `renderHome()` is now wrapped the same way (`_iconCtx` on around `_renderHomeInner()`, always off again) and `applyChromeIcons` treats `home` and `dashboard` alike for the nav bar and the app bar. Other pages stay classic. Texts say "Home and Dashboard pages".
- The Settings picker fits any phone: columns are `minmax(0, 1fr)`, the preview uses 16 px icons and wraps, nothing can push the page wider. Icons that already sit on their own coloured badge or card (home shortcuts, home swipe cards) do not get a second tile or chip behind them.
- `tests/icons.test.js` covers the Home wrapper and the nav/app bar on `home`.

## v181 — four real icon sets for Home and the Dashboard
- The filter tricks (CSS outlines, system emoji) are gone. `js/icons-sets.js` holds **Phosphor Icons** (MIT, licence in `js/vendor/phosphor/LICENSE`): the paths of Regular, Duotone and Fill for the 61 icon names the app uses (generated from `@phosphor-icons/core`; app name -> Phosphor name, e.g. court -> racquet, shuttle -> feather, bill -> receipt, dashboard -> house). To add an icon: add the name to the mapping, regenerate the set file, keep `tests/icons.test.js` green (it checks every icon used by the pages exists in all three sets).
- Styles in Settings > Icon style: **Classic** (Solar duotone, default), **Line** (Phosphor Regular), **Colour duotone** (Phosphor Duotone, one colour per icon; white on badges, cards and the app bar), **Colour tiles** (Phosphor Fill, white on a glossy gradient tile). Controls (arrows, plus, close, search, edit, share, trash, link) stay plain line icons in every non-classic style. A name missing from a set falls back to the classic icon. An old saved "emoji" choice becomes Colour duotone.
- Still only Home and the Dashboard (and the nav bar and app bar while they are open); every other page keeps classic. `sw.js` precaches `js/icons-sets.js`; it loads before `icons.js`.

## v182 — 3D box icons (Solar Bold on a candy box), now the default
- New icon style **3D box** (`box`, the default when nothing is saved; people who picked another style keep it): the **Solar Bold** glyph (`js/icons-solar-bold.js`, from the same Solar set the app already uses; Solar by 480 Design, CC BY 4.0, credit in `js/vendor/solar/ATTRIBUTION.txt`) in white on a rounded candy box: top gloss, soft gradient, thick darker bottom edge like a key cap. The box colour follows the meaning (`ICON_BOX`: green calendar, pin, check, polls; red clock, history, warning, no-show; teal people, court, globe; blue charts, rankings, dashboard; orange money, food, bags; purple QR, key, lock, camera; gold trophy, medal, crown; pink question).
- Where: every icon of 14 px or more on **Home and the Dashboard** (clickable or not, like the next-game card with calendar, clock, pin and players), and the **nav bar on every page** (33 px boxes, the active tab sits pressed with an accent ring, the others are slightly muted). Controls (arrows, plus, close, search, edit, share, trash, link) and tiny inline icons stay plain. Icons that already sit on their own badge (home shortcuts, home swipe cards, the app bar) are not boxed twice. The other four styles still apply to Home and the Dashboard only.
- `tests/icons.test.js`: box colour follows meaning, controls and tiny icons are plain, the nav bar is boxed on any page in box style, and every boxed icon has a Solar Bold glyph.

## v183 — Home shortcuts and create as glass tiles
- The two heavy cards on Home (find court / friends / market with a sub-line each, and the "Create" card with four long labels) are replaced by **seven see-through glass tiles** (`.hg-tile`): translucent fill (`--glass-bg`, `--glass-line`, `--glass-hi`; white veil on dark, frosted white on light), a thin edge, a soft top highlight and a light blur, so the page background and every special theme show through. Row 1: court, friends, market. A small "Create" heading with a plus, then row 2: poll, game, score, live. Each tile is the boxed icon plus **one short word** (new keys `homeShortCourt`, `homeShortFriends`, `homeShortScore`, `homeShortLive`; the long labels and sub-lines are no longer shown here).
- `icon(name, size, "bxN")` lets a caller pick the box colour (0 green, 1 red, 2 teal, 3 blue, 4 orange, 5 purple, 6 gold, 7 pink); the tiles use it so each action has its own colour. Removed `_homeShortcut` and `_homeCreateTile`. `tests/home-glass.test.js` guards the markup and texts.

## v184 — "My workout" card moved to the Dashboard
- The estimate card (time on court, kcal, average and peak bpm, minutes in Z3+, heart-rate chart) is no longer inside a session's Games tab. It shows on the **Dashboard** (Leaderboard tab, right under the Health & exercise card) for my **latest** workout, titled "Latest workout" with its date; the button opens the full workout page. Nothing is shown until I have a timed game. `healthWorkoutCardHtml(d, sid, dateLabel)` builds it (js/health.js); `healthLatestCardHtml()` (js/health-ui.js) picks `myWorkouts()[0]` and loads my private record first when it is not loaded yet.

## v185 — Home swipe cards slide by themselves
- The six swipe cards on Home (Play, Spending, Pay, Rating, Health, Badges) now advance on their own: **3 seconds on each card**, smooth scroll, then back to the first card after the last (`_homeSlideStart`, `_homeNextSlide`; the strip cannot scroll past its end, so "at the end" means go back to the start). A touch, wheel or key on the strip pauses it for 8 seconds so it never fights the user; it also waits while the app is in the background or another page is open, and stays still when the phone asks for reduced motion. The dots under the strip follow the existing scroll handler. Checked in a browser with the scroll made instant (headless Chrome does not animate smooth scrolling): the showing card went 0, 1, 2, 3, 4, then back to 0.

## v186 — two more icon styles: Soft (neumorphic) and Glass 80%
- **Soft (`neu`)**: the Solar Bold glyph in its meaning colour on a raised plate that has the same colour as the card, lit from the top left (dark shadow bottom right, light shadow top left; softer, bluish-grey shadows in light mode). The active nav tab is pressed in (inset shadows).
- **Glass 80% (`glass`)**: a tinted plate that is 80% see-through (fill alpha .2, a 1 px edge at .55, inner top highlight, light blur) with the glyph in a light tint of its colour (darker tint in light mode). The active nav tab gets a stronger tint and an accent ring.
- Both follow the same rules as the others: Home and the Dashboard (and the nav bar and app bar while those are open), colour by meaning with the `bxN` override (`ICON_BOX`), controls and icons under 14 px stay plain, icons that already sit on a badge or card are not plated twice. Settings > Icon style now offers seven styles.

## v187 — Home health card shows the month by weeks
- The Health & exercise swipe card on Home now shows **this month**: the month's total time as the big number, **one bar per week of the month** (`healthMonthWeeks`: blocks of 7 days, days 1-7 = W1 ... 29-end = W5; February has four) with a label under each bar, today's block drawn solid white and the others softer, then kcal and sessions for the month. Tapping it opens the Health overview on the Month tab. The Dashboard card still shows the current week.

## v188 — one splash, in the colours of the chosen theme, under one second
- The opening scene (gauntlet, shuttlecock, flash, shock ring, shards) is the only design. It no longer alternates red and blue at each launch: `pickPal()` in `js/splash.js` reads the saved choice (`special` first, in dark mode; otherwise `palette` or `paletteLight`) and uses that theme's glow, flash and stone colours; the page behind it gets the theme's dark colour. All 5 dark styles, 5 light styles and 8 special themes have a palette (`tests/splash.test.js` checks every id in app.js has one).
- Faster: `SPEED` 2.2 -> 3.3 (the hit lands at 0.3 s, the floor breaks at 0.5 s), the minimum time on screen is 700 ms (350 ms with reduced motion) plus a 0.25 s fade (was 1000 ms + 0.45 s), so it is under 1 s once the app is ready. A tap still skips it. If the app needs longer to start (sign-in check, slow network), the splash waits for it, as before.

## v189 — health share cards (workout day, overview) and the heart-rate chart on the overview
- **Share cards for health** (`js/sharecard-health.js`). `openShareCard('', 'workout', sessionId)` (the share button on a workout page) draws that day: date and time, the big duration, the **heart-rate line coloured by zone** with the games shaded (close games amber) and a **heart on the peak**, a **zone donut** with the average bpm in the middle, a **calorie flame** with the kcal and **pizza slices** (one per 285 kcal), tiles for peak bpm, games and on-court time, a strip with every game's score (won / lost, a flame on close games), and up to three **badges** (Calorie burner 800+ kcal, Clutch player 3+ close games, Marathon 8+ games, Cardio hero 30+ min in Z3+, Unbeaten). `openShareCard('', 'overview')` (the share paths on the Health page and the Dashboard card) draws the week / month / year on screen: total time, bars with the **best day crowned** and a dashed average line, tiles (sessions, games, kcal, average bpm), the zone mix as one stacked bar, a **fire streak** ("N active days / months") and badges. The profile card (`openShareCard()`) is unchanged. Same themes and story / square formats as the profile card; `shareWorkoutNow` / `shareOverviewNow` (health-ui.js) feed them.
- **Health overview page**: a new **Heart rate** card under the summary: my own zone bands (Z1 to Z5 with their bpm) always drawn, one point per workout in the period with its average bpm (solid line) and peak bpm (dotted line); "No workouts yet" over the bands when the period is empty (`healthTrendSvg`, `healthTrendPoints`). The zones list stays below.
- Tests: `tests/health.test.js` (trend points), `tests/sharecard.test.js` (data builders, badges, best day, texts).


## v190 - icon style on every page

- The style picked in Settings -> Icon style (3D box, Soft, Glass, Classic, Line, Colour duotone, Colour tiles) now draws every icon in the app. Before, only Home and Dashboard followed it (`_iconCtx` switch). The switch and the `_renderDashboardInner` / `_renderHomeInner` wrappers are gone: `icon()` always uses `currentIconTheme`.
- `applyChromeIcons()` (called from `showPage`) redraws the nav bar and app bar once per style change, on every page, and sets `body[data-icons]`.
- Icons that sit inside a button, chip, tab, badge or their own coloured tile (`.nav-row-ico`, `.nav-card-icon`, `.hl-ico`, `.empty-icon`, ...) get no second plate: CSS block at the end of styles.css ("v190") strips plate/shadow/size and keeps the plain glyph in the text colour. If a new container shows a plate inside a plate, add its class to that selector list.
- Controls (back, chevron, plus, close, search, ...) and icons under 14px stay plain in every style, as before.
- Not checked on real phones: how each style looks inside every small control. Look at Settings, Stats, Polls, Payments first.


## v191 - four more special themes

- New specials in `SPECIALS` (js/app.js): `kitty` (Kitty Pink), `doraemon` (Sky Pocket), `valentine` (date window 02-07..02-15, offered on Home), `jujutsu` (Cursed Night). Each has: CSS block at the end of styles.css, EN + LA texts (`spX`, `spXSub`, `spXTitle`), live-score colour set (`LS_THEMES` 14-17 + `LS_SPECIAL_IDX`), share-card palette (`SC_THEMES`, also the id list and the fx regexp), splash palette, Home card emoji, and an animated canvas scene in js/fx.js (`FX_SCENES.kitty/doraemon/valentine/jujutsu`).
- Art is original: generic bows, hearts, bells, propellers, a door, talismans, a torii gate, cursed-energy ribbons. No characters or logos; the franchise names only appear in the "X style" subtitle.
- New fx helpers: `fxHeart`, `fxBow`, `fxSparkle`, `fxBell`, `fxCopter`, `fxTalisman`.
- Not checked: contrast audit (`tools/contrast`) on the new palettes, animation speed on real phones, Lao wording.


## v192 - members can invite

- Any active member can open Settings -> "Invite friends" (group-settings page) and share the invite link / QR. Admins keep: reset code, and a checkbox "Members can invite friends with this link" (writes `groups/{gid}.adminOnlyInvite`; absent = members may invite).
- `firestore.rules` `groupSecrets` read: admin OR (active member AND group not `adminOnlyInvite`). Create/update stay admin only. **Rules must be published again by hand** (dry run first); until then members see the "admins only" note.
- Trade-off: the invite code is a secret shared by link; a member who leaks it needs an admin to reset the code (existing button).


## v193 - fewer icon styles, folded settings

- Icon styles "Line" and "Colour duotone" removed from `ICON_THEMES` (now box, neu, glass, classic, tiles). A saved line / duo / emoji choice falls back to the box style. The Phosphor line/duo sets stay in js/icons-sets.js: controls and tiles still use them. The EN/LA `icon_line` / `icon_duo` texts remain unused.
- Settings: Appearance (dark/light + palette), Icon style and Special themes are each one folded row (`_fold()` in settings.js, `<details class="set-fold">`) showing the current choice; tap to open. Open state is kept in `_setFold` so a redraw after picking does not close it.


## v194 - week share card, one game day at a time

- Share sheet of the Health overview (week / month / year) has a new row of chips: "Whole range" (the old overview card) and one chip per game day in that range. Picking a day draws `drawWeekSessionCard` (js/sharecard-health.js): big duration, calorie flame with pizza slices, the zone-coloured heart-rate line, avg / peak / on-court tiles, and the "my stats" gimmick: the range as bars with the picked day lit, "game day n of m", and a level bar (week: Warm-up, Rally 1 h, Smasher 3 h, Legend 6 h; a month needs 4x, a year 48x) with minutes to the next level.
- Data: `shareOverviewNow()` now returns `list` (game days oldest first, each with `workoutShareData`); `workoutShareData` carries `dateKey` to light the matching bar. `_sc.pick` holds the chosen session id.
- Test draws the card in both formats with a recording canvas (tests/sharecard.test.js). Looked at once in headless Chrome, not on a phone.


## v195 - "3D clay" dashboard icon pack

- Asked for the look of Iconscout's 3D badminton icons. The page returned 403 to us and its files may not be bundled in an app, so the pack is original: the Solar Bold glyphs get a puffy clay look from one SVG filter (`#clayF`: blurred bevel, specular light, soft shadow) and a light-to-dark gradient per colour class (`ico-clN`, same colour-by-meaning map as the box style). `CLAY_ART` holds hand-drawn shuttlecock (`shuttle`), racket (`court`) and `scoreboard`. The defs live in a hidden `#clayDefs` div created on first use.
- Dashboard only: `_renderDashboard()` wraps `_renderDashboardInner()` and sets `_dashCtx`; `icon()` uses clay while it is on and `currentDashPack === "clay"`. Every other page keeps the chosen icon style. Controls (chevron, plus, ...) and icons under 14px stay plain.
- Setting: Settings -> Icon style -> "Dashboard icons": 3D clay (default) or Same as above (localStorage `dashPack`).
- If a new Dashboard icon looks flat, add it to `SOLAR_BOLD` or hand-draw it in `CLAY_ART`.


## v196 - exact duration, themed profile-card graph

- Duration on every health card / page is now the exact live-score time: first game start to last game end (`playMin` from `healthSegments`; `healthWorkouts().totalMin` = that). The booked hours of the session are no longer used (a 3 h booking with 2 h 20 min of play showed 3:00). `timeMin` keeps the longer timeline (10 min warm-up + 3 min cool-down) that the heart-rate chart and kcal estimate use. Games without saved start/end times fall back to the sum of their minutes.
- Profile share card: the rating trend and the last-5 form now sit in theme panels (card colour + edge), the line is a pill-to-accent gradient with glow, soft area and an end dot; wins are filled pills in the theme colour, losses dashed outlines (no more fixed green / red).


## v197 - no square plate inside the round Home button

- Colour tiles style drew its rounded-square tile inside the round centre Home button of the nav bar. One rule at the end of styles.css (`.nav-center .nav-icon :is(.ico-bx, .ico-neu, .ico-gl, .ico-tile)`) now removes any plate there in every style, so the glyph sits directly on the circle. Rule of thumb: an icon that lives in a circle gets a plain glyph, never a plate.


## v198 - round icon holders show a plain glyph

- Achievement badges (and about 25 other round holders: floating buttons, chips, tags, remove / share buttons) showed the square icon plate half outside their circle. One block at the end of styles.css lists every round holder found by scanning `icon(` calls against `border-radius: 50%` rules and strips the plate there (glyph takes the holder's text colour). A new round holder needs its class added to that list; tools/uimatrix/driver.js reports `plate-in-circle` when one slips through.


## v199 - theme x icon-style x page matrix, and what it found

- New manual tool `tools/uimatrix` (see its README): 1,870 renders (every palette, light palette and special theme x 5 icon styles x 17 pages, phone width 390) with 200,000 elements checked. First clean run had about 3,000 findings, mostly test noise (previews and folded content, a window wider than 390). Real ones fixed here: icon plates inside `.view-btn`, `.hs-card`, `.home-sc-ico`, `.mh-ii`, `.app-header` in the light themes (a light-theme neumorphic rule out-ranked the neutralising rule), `.perm-badge.super` and `.danger-title` text under 3:1 in light themes. Last run: 0 layout problems; only the big empty-state icon on Groups (intentional).
- Blind spots: sheets, modals, share cards, real data, real devices.


## v200 - total duration = exact game minutes + rest

- A player's session duration is now the exact minutes of their games plus the rest between them: with saved clock times it is first game start to last game end (real rest); without them each gap is estimated at `HEALTH_REST_GAP_MIN` (4 min). Booked hours stay ignored. `healthSegments` returns `playMin`; the chart timeline still adds the 10 min warm-up and 3 min cool-down.
- Cards and the workout page show "on court 1:55 + rest 1:14" under the big duration. The old "On court" tile became "W-L" record (and the week card tile also names the games count).
- Test: tests/health.test.js (estimated and real-clock cases).


## v201 - rest between games on the heart-rate graph

- Bug: when the live score saved games back to back (clock times touching), the graph had no rest between them, so six games drew one flat high block. `healthSegments` now builds the timeline from each game's exact live-score minutes and puts a rest before every next game: the real gap when the clock times show one, never less than `HEALTH_REST_GAP_MIN` (4 min). Total (`playMin`) = game minutes + those rests; the heart rate dips between games again.
- Example (6 games x 13 min logged back to back): 78 min on court + 20 min rest = 1:38 (was 1:19 with a flat curve).


## v202 - share-card panels 90% transparent

- `_scPalette()` rewrites each theme's panel colour to alpha `SC_CARD_ALPHA` = 0.10 (90% see-through) for every share card (profile, workout, week, overview); the theme art shows through the panels, edges and text stay. Change the one constant to tune it.


## v203 - admins can edit and delete a poll in any state

- Bug: the poll "Manage" block (add votes, edit, cancel) only rendered for open polls and there was no delete at all, so an admin saw nothing on a completed (confirmed) or cancelled poll. Now it renders for anyone who may manage the poll (admin, owner, `createPoll` right, creator): edit for every state, cancel for open ones, and a new Delete (confirm sheet, goes to Recently deleted for 30 days with Undo). A session created from the poll is not touched. Rules already allowed it (`polls` delete: `canIn('createPoll')`), so nothing to republish. Test: tests/poll-manage.test.js.


## v204 - confirm before a poll becomes a session, more "are you sure", full names in live score

- Why a new poll could not be edited: with enough players the deadline auto-confirms it into a session (`confirmPoll(id, true)`), and the Manage block used to exist only for open polls (v203 fixed that for every state). The Manage block is now open by default and Edit also covers minimum players and the note.
- The "Confirm plan" button asks first (`askConfirmPoll`: players, date, court). Only the deadline auto-confirm calls `confirmPoll` directly.
- Audit of one-tap actions (script: every `onclick` function that writes and has no `askYes`/`askConfirm`): now asking first: approve member, cancel my join request, remove group logo, remove my photo, withdraw an invite, take a gear item off sale. Live score: changing teams, game type or session while a score is counted asks first (`_lsGuard`). Left as is on purpose: answering an invite / dinner (changeable), saving a finished game (the "over" screen), undo.
- Live score on a phone: player names wrap and show in full (`.ls-half .ls-chip`), the chip column is 74% wide instead of shrinking to the icon width; before it cut "Kone Vong...".


## v205 - take back a confirmed poll (remove its session)

- A confirmed poll now has "Remove session, reopen poll" in its Manage block: asks, moves the session to Recently deleted (30 days, Undo) and sets the poll back to `draft` with `sessionId` cleared and `noAuto: true`. `noAuto` stops `_autoConfirmPolls` from confirming it again at once (the deadline has usually passed); confirm by hand when ready.
- Deleting the session from its own page does the same for the poll it came from (no dangling "Open session" link). Games already saved in that session stay in the games list. Restoring the session from Recently deleted does not re-link the poll.


## v206 - a confirmed poll and its session are removed together

- Changed v205 (reopen) on request: deleting the session of a confirmed poll now removes that poll too (both to Recently deleted, 30 days; two Undo entries). The confirmed poll's Manage block button became "Delete session and poll" (`deleteSessionAndPoll`). Deleting only a poll still leaves its session alone. `noAuto` stays in `_autoConfirmPolls` for polls reopened by v205.


## v207 - edit / delete inside the poll card

- Poll cards show Edit (pen) and Delete (bin) as two small round buttons on the "created by" row, for anyone who may manage the poll and in every state. The folded "Manage" block under the card now holds only the rarer actions (add votes for others, cancel poll, delete session and poll) and is not drawn when a poll has none (cancelled).

## v208: four special themes removed

Christmas, Neon Arcade, Ninja Village and Kitty Pink are gone (owner request). Removed from `SPECIALS`, CSS blocks, `FX_SCENES`, share-card palettes and scenes, splash palettes, home emoji, `LS_SPECIAL_IDX` and EN/LA i18n. Kept: the four team-colour pairs in `LS_THEMES`, because saved live-score picks are positions in that list. A user who had one of the four selected falls back to no special theme (`_savedPalette` checks the id against the list). Eight specials remain.

## v209: Dashboard "Stickers" pack

Third choice in Settings, Dashboard icons (3D clay / Stickers / Same as above); clay stays the default. Original art, no download (the iconscout preview file was watermarked and not licensed). `STICKER_ART` in js/icons.js holds hand-drawn SVG illustrations (trophy, medal, calendar/sessions, clock/history, polls/vote, users, user, wallet, bill, card, dinner, chart, ranking, noshow, other, question, manual); shuttle, court and scoreboard reuse `CLAY_ART`. Any other icon falls back to a glossy colour tile with the white glyph (`.stk-g`). `#stkF` = white die-cut outline plus soft shadow. `icon()` uses `currentDashPack` when it is not "same", so adding a pack only needs an `iconAs` branch. Controls and icons under 14px stay plain. Lao name is unreviewed.

## v210: minimal splash with a badminton court

The canvas scene (gauntlet, shuttle, flash, shake, breaking floor) is gone. The splash is now plain CSS: a soft glow in the theme colour, the badminton court drawn as thin lines (doubles outline, singles lines, net, short and long service lines, centre lines; one SVG in index.html: nine line segments for the top half of the court, each oriented away from the top left corner; the group is repeated turned half a turn about the centre (`g.cb`), so the same happens from the bottom right corner and the strokes meet in the middle on the net. Every line uses the same motion as the ring round the logo: one smooth pass (1.5 s, cubic-bezier(.45, 0, .2, 1), starting together; the ring round the logo takes 0.5 s, the court is deliberately slower), bright first, then it settles to a quiet tone), the logo easing in with a line drawn round it, the name opening up. js/splash.js only picks the theme colours (`PALS`, `pickPal`) and sets `--deep`, `--hot`, `--hot2` on `#splash`. Settles in about 1.65 s (court 1.5 s + .15 s delay), so `SPLASH_MIN_MS` is 1700 (350 with reduced motion) plus the 0.25 s fade. Reduced motion shows a still frame. No requestAnimationFrame, no canvas (tests/splash.test.js checks both).

## v211: stored-XSS guards and tighter rules (from the full audit)

Root cause: `t(key)` returned the key itself when a translation was missing, and the app builds keys from stored data (`t("mode_" + doc.mode)`, `t("gearKind_" + g.kind)`), then puts the result in innerHTML. `t()` now escapes a missing key (a plain key reads the same). Other fixes: `cssId()` for class names built from data (`mode-` + x); `jsq()` on every user id put into an onclick (session players, report subjects, pickers); `escapeHtml()` on numbers printed raw (match minutes and scores, shuttle qty and cocks per tube, gear tension and shoe size); `_lsClean()` coerces another phone's live game to plain numbers, short id lists and the known words before it is drawn on Home or the watch screen; `new Function(action)` in notify.js and router.js is replaced by `runAction()` (app.js), which runs only calls of existing global functions with simple quoted or numeric arguments, plus the one allowed assignment (publicTab). tests/security-xss.test.js also fails if `eval` or `new Function` comes back.

Rules (published by hand, dry run first): `liveGames` need small ints and short lists (`liveOk`); `reports` need a known reason and zone, an id-shaped subject and group membership; `gear.kind`, `openGames` and new `polls` mode / gameType are whitelisted (`modeOk`); courts and restaurants can be changed only by a verified email; a user cannot create themself as `manual:true`. Not done yet (needs design): invite code stored in the member doc, payment `settled` writes by any member, legacy `votes` overwrite, privacy fields readable through `users`.

## v212: one shuttlecock in every icon style

The shuttlecock is the default (classic Solar) drawing in every style. Before, box / neu / glass used the bold glyph, tiles the Phosphor one, and the clay and sticker packs a hand-drawn one. Now `iconAs` draws `SOLAR.shuttle` for all of them; box, neu, glass and tiles still put it on their plate, and clay and sticker show it plain (nothing else in the Dashboard packs is changed). The hand-drawn `CLAY_ART.shuttle` stays in the file but is not used.

## v213: group pages moved into Group settings

The Settings page (Group section) keeps only the group switcher, one Group settings row (with the pending-requests badge for admins) and Reports for admins. Members, Courts and prices, Shuttlecocks, Players, Player QR (editConfig) and General are now one list at the top of the Group settings page (`_groupManageHtml()` in js/settings.js, used by `loadGroupSettings` for admins and for members). Members see the list too, plus the invite box when members may invite. Breadcrumbs of the config tabs and Members are now Settings > Group settings > page. Without a group, the old Configuration row stays. EN and LA key `groupHubHint` (Lao unreviewed).

Also in v213:
- **Splash plays in full.** The animations start on the first painted frame (js/splash.js adds `.go`; CSS holds them paused until then), and the splash leaves only when every finite animation has ended (`window.spDone`, set from `getAnimations().finished`; fallback 5 s). `hideSplash()` in js/router.js returns early until then and js/splash.js calls it again; a tap still skips. Checked in real Chrome over the debugging protocol: app ready at 0.1 s, the splash left at about 1.95 s (court 1.5 s + .15 s delay, dim to 1.8 s, plus 120 ms).
- **Share my card icon.** The four "Share my card" buttons (Settings profile, Stats card, Health) use the new `shareOut` icon (arrow up out of a tray) instead of `share` (three connected dots). `share` is still used by the card picture sheet and the court location button. Note: `js/icons.js` has two `"share"` keys in `SOLAR`; the later (nodes) one wins.

## v214: personal, badminton and health info as tabs

The profile list had four rows (Personal info, My gear, Health details, Payment QR). Now it has two: Personal info and Payment QR. The Personal info page has three tabs (`pfTab`): **Personal info** (story photos plus who I am: name, phone, gender, birth date, relationship), **Badminton info** (how I play: level, hand, position, home court, free days and times; then My gear) and **Health info** (the health page). The about form is still one form (`aboutForm`) shown in two parts (`aboutCardHtml("personal" | "badminton")`, remembered in `_aboutPart`), and one Save writes both; because the phone box exists only on the personal part, `saveAbout` takes the phone from the form state when the box is not on screen (otherwise it would have cleared it). `openPfSub("gear")` and `openPfSub("health")` still work and open the right tab. tools/uimatrix gained a `pre` option (a script run before the renders, e.g. `pfTab="badminton"`) and the pages profile and profile-sub. Lao tab names are unreviewed.

## v215: Find buddy calendar, like Public games

The Find buddy tab always shows the same calendar as Public games (before, it showed only when I had dated invites, and only filtered invites). Each day shows a dot or count: my invites that day plus the buddies free that weekday (next 120 days). Tapping a day filters the buddy list to people free that weekday, and my invites to that date; Clear removes it. A buddy sets the weekdays in Buddy settings (`buddy.days`, 0 = Sunday, new chips "Days free"); if none are set, the profile days are used when I may see them (`canSeeField`). Cards show the free weekdays as a tag. Helpers `_buddyDays`, `_buddyFreeOn`, `_buddyMatches` in js/social.js; tests/buddy-calendar.test.js. tools/uimatrix build.js now sets `window.spDone = true` where it removes splash.js (the v213 splash waits for it, so the splash never hid in the matrix). Lao texts `noBuddiesDay`, `buddyDaysHint` are unreviewed.

## v216: Live score and Add score as two buttons

The Games tab of a session had a wide Live score button and, below it, the whole Add score form always open. Now there are two equal buttons side by side, Live score first and Add score second (`.score-actions`; Live score is hidden once the session is completed, then Add score fills the row). The form (`#gameFormBox`) is closed until Add score is tapped (`_gfOpen`, `toggleGameForm`, `_gfSetOpen`); editing a game opens it, fixing a game closes it, saving a new game keeps it open for the next one, and a different session starts closed. Lao `addScore` ("ເພີ່ມຄະແນນ") is unreviewed.

## v218: faster start and group logos kept on the phone

**Why start was slow:** the service worker was network-first and sent `cache: 'no-cache'` for every own file, so each start made about 50 round trips (304 answers) before the app could draw. Now own files are cache first and updated in the background (`sw.js`); a new version installs fresh files (`cache: 'reload'`, so the 10 minute GitHub Pages copy is never precached), and the page reloads once when the new worker takes over. Only 200 answers are kept, never a URL with `oobCode`, and the tile cache survives a version bump. `index.html` preconnects to gstatic and firestore, and the Google Fonts stylesheet no longer blocks the first paint (font-display swap). The splash itself still plays its whole scene (about 1.95 s) on purpose; to shorten it, shorten the court draw in css (`sp-draw`, 1.5 s).

**Group icon always there:** images (`images/{id}` documents) are now also kept in IndexedDB (`godsmash-img`, newest 200). `_loadImg` reads this phone first, then Firestore. After login `prefetchGroupLogos()` downloads the logo of every group I am in and my own photo, remembers their ids (`imgKeep` in localStorage) and at the next start `warmAtStart` puts them in the memory cache before the pages are drawn. The header shows the last group (name and logo, `lastGroup` in localStorage, cleared at sign-out) as soon as I am signed in, before Firestore answers. An image id never changes its picture, so the copies never go stale.

## v219: Reports row moved

The admin-only Reports row (with its count badge) is no longer under the Group section of Settings. It sits in the "Notifications and data" card, between Notifications and Recently deleted.

## v220: Subscription first

The Subscription card is the first card of the Settings page, above the Group section (it was the first row under the App heading).

## v221: Settings look order

Under App: Language, Appearance, Special themes, then Icon style last (it was before Special themes).

## v222: market sort

The Market tab has a Sort box under the price range: Newest first (as listed, the default), Price low to high, Price high to low, Name A-Z (Lao collation in Lao). Items without a price ("ask") go last in both price orders. Prices are compared as listed: each seller's group currency, with no conversion, like the min and max filters. Clear resets the sort too. tests/market-sort.test.js. Lao labels are unreviewed.
## v217: correctness fixes

From a verified audit. Lao strings added (`confirmDeclineRequest`, `editMultiGame`) are unreviewed.
- **Weekly polls:** weeks 2..N now close the day before their own game (`defaultCloseAt(day, time, k ? 0 : Date.now())`, same rule as public games); comment above `defaultCloseAt` rewritten to match the code.
- **Merge manual player:** also rewrites matches (teamA, teamB, createdBy, updatedBy, confirmedBy), poll `voteLog`/`cancelledBy`, session `settledAt`/`dinnerPoll`; writes in batches of 400 (`mergeFieldUpdates`); the manual user goes to Recently deleted (`trashDoc`) instead of being deleted.
- **Double taps:** `askConfirm` runs onYes once and the fading sheet ignores taps; `lsSaveGame`, stats `saveGame` and `submitPoll` have in-flight flags (reset on failure); `lsSaveGame` toasts when the session is gone.
- **Vote for others:** writes only the `responses.<uid>` rows the organiser changed (dotted paths, `FieldValue.delete()`), so a vote that arrived meanwhile survives.
- **One Undo:** deleting a session with its confirmed poll shows one toast; `trashDoc(..., quiet)` and `undoLast("id1,id2")` restore both.
- **Edit poll:** a confirmed poll's edit also updates its session (date, time, duration, court, location; price only if not calculated) in one batch; `closesAt` is only rewritten while the poll is draft/open. Cancelled polls can still be edited (no session to follow).
- **Auto-confirm:** `_autoTried` is cleared when the auto `confirmPoll` fails, so the next minute retries. Dead `p.noAuto` removed.
- **settleTransfers:** status is computed inside a Firestore transaction from the fresh session.
- **Logout** clears `_myPrivate` and the health memo; `saveHealth` assigns a new `_myPrivate` object so workouts recompute; the save toast uses `save` (there was no `saved` key).
- **Breadcrumb:** `loadPolls`/`loadSessions` render only when `currentPage` is their own page (Home, Games and Dashboard also call them).
- **Live score:** minus removes that side's latest history entry (Undo cannot go below 0); change teams and reset clear `firstAt`.
- **Numbers:** an unrated player shows "–" (`ratingText`) on Home and the profile like the Rankings hero; win rate with no games uses `pct()`; Best score margin comes from the shown game; `_periodStart` clamps the day (Oct 31 minus 3 months); editing a match with several games is blocked with a toast (`editMultiGame`).
- **Health:** `healthTotals` now uses the same rule as `healthWorkouts` (sessions only, dated by the session); year share card highlights the month bucket; unused `real` removed.
- **Storage and dialogs:** top-level `localStorage` reads/writes in app.js, i18n.js, auth.js, push.js are in try/catch; the legacy email-link path uses `askConfirm({ input })` instead of `window.prompt` (new `input`/`inputType` options on `askConfirm`); declining a join request asks first.
- Tests: tests/correctness-v217.test.js; poll-manage test updated for the single-undo order.

## v223: the drawn shuttlecock and scoreboard everywhere

The default shuttle glyph looked like a baseball or tennis ball. `SOLAR.shuttle` is now the hand-drawn shuttlecock (white feathered cone with ribs, orange rim, orange cork, flat colours with a slate outline so it reads on light and dark), and `SOLAR.scoreboard` (Live score) is the blue scoreboard with digits. `ICON_FIXED = { shuttle, scoreboard }` makes `iconAs` draw exactly these in every style (box, neu, glass, classic, tiles, clay, stickers), never the bold or Phosphor variants. They keep their own colours; box, neu, glass and tiles still put them on their plate.

## v225: Share my card as an icon

On the profile card the wide "Share my card" button is now a round icon button (arrow out of a tray, `aria-label` and tooltip "Share my card") in the top right corner of the card (`.pf-share-ic`); the name column keeps room for it. It opens the same card sheet.

## v226: photo frames

A person picks a frame in Profile > Personal info > Photo frame (None, Gold, Court, Neon; saved at once as `users/{uid}.frame`). `avatarHtml(uid, size, frame)` in js/app.js wraps the photo in `.avf.f-<word>` when the person has a known frame word (`AVATAR_FRAMES`; any other value is ignored) and the photo is at least 22 px; the optional third argument previews a frame (chooser). Gold: gold ring, crown on photos of 56 px or more. Court: blue ring with a white inner line, four service-line marks and a shuttlecock badge (56 px or more). Neon: cyan-violet-pink ring that turns only on photos of 56 px or more and not with reduced motion (many small turning rings would cost battery). Ring thickness is 7.5% of the photo (`--r`), so the framed avatar is a little larger than the plain one. firestore.rules gets `frameOk` on the owner's create and update of `users/{uid}`; it is NOT published yet (needs the Firebase re-login, together with the v211 rules); until then the app still saves the frame because the old rules allow any field. Court dashes (B2) was drawn in the draft but not built. Lao names are unreviewed.

## v227: session tournament

One teal button on a session card (sessions list) runs a tournament for the session's 6 or 8 players. Lao strings (`tour*` keys) are unreviewed.
- **Flow:** `Random N players · G games` draws the rotation (8 players: 6 games, 6 players: 9). Everyone plays the same number of games with a new partner each time. Then `Random semifinal` (8) or `Random pairs` (6): best is paired with worst from the rotation table, the 4 pairs are drawn into 2 semis. 8 players: semis, one game for 3rd, final best of 3 (11 or 12 games in all). 6 players: round robin of the 3 pairs (12 games).
- **Schedule:** `TOUR_BASE` holds one fair shape per size (every pair of players meets, 8 players never partner twice, 6 players partner every pair). `tourPickShape` shuffles game order and players up to 40000 times and keeps one with short streaks (8: rest and play at most 2 in a row; 6: rest at most 1, play at most 3).
- **Table:** wins, point diff, points for, then a coin (`T.coin`, shuffled once at the start) so an exact tie is never decided by list order.
- **Corrections:** `tourImpact` says what a corrected score would throw away (pairs change after playoff games, a semi flips after 3rd place or the final exist, a final game changes the series); the screen then asks with `askConfirm` (warn). `tourApply` clears the draw when pairs change, trims or adds final games (`tourSync`). Reset asks with `askYes` (danger).
- **Data:** `sessions/{id}.tournament` = `{ v, n, ids:[uid], coin, games, po, drawn, semi }`. Games hold positions (0..n-1) in `ids`, not user ids, so no array sits directly in an array. Only people who may edit the session or its bill (`canEditSessionDetails || canEditBill`, same as the session rules) start, draw, enter or fix scores; everyone else watches. The existing session rules already allow that write, so no rules change was needed (no `tournamentOk` shape check yet).
- **Screen:** `js/tournament.js` draws an overlay (`#tnScreen`, `.tn-*` css) with the stage button, steps, bracket, games, who-meets-who, rest balance, table, pairs, playoff and podium. Sessions updates refresh it unless a score is being typed. The draw shuffle is skipped for reduced motion.
- **Not in v227:** writing tournament games to `matches` (rankings and Elo), a winner share card, a player dropping out mid-tournament.
- Tests: tests/tournament.test.js.

## v227 hotfix: tournament field renamed to `tourney`
- **Bug:** a session from the v48 round robin already had `tournament = { pairs, at, by }`. The v227 card read it as a new tournament, `tourComplete` threw on `po.length`, and the whole sessions list stopped drawing (cards vanished).
- **Fix:** the session field is now `tourney`; `tourOf(s)` returns it only if it has the right shape (v, games, po, ids). An old or half-saved value counts as no tournament, so a bad field can never break the list. The old `tournament` field is left alone.
- **No version bump:** same v227; sw.js has a comment bump so the service worker updates. Test added to tests/tournament.test.js.

## v228: tournament games count in stats, and a pair can go out

- **Stats:** the real games of every session tournament are now stats games. `tourMatches(session)` turns each played rotation and playoff game into a match-like record (`id "t:<sid>:<n>"`, `tid` = session id, `tstage`, `confirmed: true`, `createdBy ""`, one game each). `tourMergeMatches(saved, sessions)` joins them with the saved matches; a game that someone also typed in as a normal match for the same session (same two teams and score, either side order) is counted once and the typed-in match wins. `rebuildMatches()` in stats.js sets `lastMatches` from `_matchesReal` (matches/ only) and the sessions; `tourSessionsChanged()` (called from the sessions snapshot) rebuilds it only when a tournament changed. Every page still reads `lastMatches` / stats-core, so Rankings, Elo, pairs, health and Home agree. No new writes, no rules change.
- **Not counted:** walkovers (`g.wo`, written 21-0) and void games (`g.v`). Match rows from a tournament show a "Tournament" badge with the stage and have no edit or delete button (the tournament screen owns them).
- **Pair out:** after the pairs are drawn, the organiser taps "Mark pair out" on a pair, picks a reason (injury, left early, other) and an optional note (60 chars), and confirms (`askConfirm`). `T.out = [{ p, why, note }]` (`p` = pair number, seed - 1). `tourResolve` gives the opponent a walkover in every game still to play: semi, 3rd place, final games (so a final that has not started ends 2-0 by walkover; after one game it goes to game 3 by walkover), round-robin games for 6 players. A game whose two sides are both out is void (shown "Void", no winner; its winner and loser are both empty, so the next game is a walkover for the pair that is left). Games already played stay. "Out: injury (note)" shows on the pair card, bracket boxes, game rows, 6-player table and podium.
- **Bring back:** "Back in" asks first, clears the walkovers (and the games built on them: `tourUndoImpact` says how many real games that loses) and gives walkovers again for pairs that are still out.
- **Rotation stage:** nobody can be marked out before the pairs are drawn. The screen says so and offers Reset (it asks) so the tournament can be drawn again with the players who can play.
- **Corrections:** a walkover is not a score and cannot be corrected. A rotation correction that changes the pairs clears the draw, the playoff and the out marks (the warning counts them).
- **Session field:** everything reads the tournament through `tourOf(session)` (field `tourney`, shape-checked); a session with the old v48 `tournament` value or bad data is ignored by the stats loader, the card and the hall of fame. v227-hotfix is merged into this branch.
- Lao strings (`tourOut*`, `tourWhy_*`, `tourWO`, `tourBadge*`) are unreviewed.
- Tests: tests/tournament.test.js (walkover chain, final series, void games, 6-player round robin, undo, correction), tests/tournament-stats.test.js (stats records, dedupe, badge, one truth).

## v229: winner card and Hall of Fame

- **Winner card:** the podium on the tournament screen has "Share winner card" (and the Hall of fame list has a share icon per tournament). It opens the existing share sheet in a new mode, `openShareCard("", "tournament", sessionId)`: champion pair photos and names, final score (`2–1`), the games of the final, 2nd and 3rd, "Out: injury" when a pair went out, date and group. `drawTournamentCard` (js/hallfame.js) reuses the share-card palette, backdrop and court from sharecard.js, so every theme works; story (1080x1920) and square formats. Photos load through `_scLoadAvatar` (a missing photo shows the first letter).
- **Record:** when a tournament finishes (any `_tnPut` that leaves it complete) `hofSave` writes `groups/{gid}/hallOfFame/{sid}` = `{ v, sid, gid, date, n, champion:{uids,names}, runnerUp|null, third|null, finalScore, finalGames:[text], outs:[{uids,why}], createdBy, createdAt }`. It is written again only when the result changed. **Deleting a session or resetting a tournament never deletes the record** (names are stored with it, so it still reads if a player is removed). A tournament with no champion (nobody left) leaves no record.
- **Page:** Rankings > "Hall of fame" tab (`hofHtml`): champion teams (titles, runner-ups, last win; a pair counts the same in either order), champion players (titles, runner-ups), and the list of tournaments with the share icon. Remove (trash, `askYes` danger) is shown only to a group admin or the person who saved the record; it deletes the record only, never the session.
- **Rules not published:** `hofOk` and `match /hallOfFame/{sid}` (inside `groups/{gid}`) are in firestore.rules but UNPUBLISHED. Until they are, the app still works: `hofLoad` ignores a refused read (never the red error bar), `hofRecords()` merges saved records, records kept on this phone (`localStorage hof:<gid>`, up to 50, written when the database refuses a save, dropped when a save works) and finished tournaments still in the sessions (derived by `hofRecord`). A quiet note says some results are not saved for everyone yet. A session deleted before the rules are published keeps its record only on the phone that finished it.
- **Rules:** members of the group read and create (createdBy = themselves, shape and size checks: lists of at most 2 / 3 / 4, strings of at most 80 / 10 / 8 characters); update by whoever saved it or a session editor (createdBy cannot change); delete by a group admin, a session editor or whoever saved it.
- Lao strings (`hof*`) are unreviewed.
- Tests: tests/hallfame.test.js (record, 2-1 final, round robin, out pair, tamper-proof clean, merge and dedupe, kept without the session, aggregate, save and refused-write fallback, card draws in every shape, rules and wiring checks).

## v230: photo frame "Court dashes"

A fourth photo frame, `dash` (shown "Dashes" / Lao "ເສັ້ນປະ", unreviewed): a green ring with one white dashed line round the photo, like the dashed line on a court. `AVATAR_FRAMES` is now `["gold", "court", "neon", "dash"]`; css `.avf.f-dash` (no badge, no animation, so the same at every size from 22px); the chooser (`frameChooserHtml`) lists it between Court and Neon and its grid now wraps (`auto-fit, minmax(96px, 1fr)`) so five choices fit a phone. `frameOk` in firestore.rules accepts `dash` (**unpublished**: until the rules are published, saving the Dashes frame is refused by the database and the app shows the permission message; old frames are unaffected).
- Tests: tests/avatar-frame.test.js.

## v231: audit decisions (rules edited in the repo, NOT published)

All four changes are backward compatible: the app works with the rules published or not, and nothing is deleted before a private copy exists. Publish `firestore.rules` once (dry run first) to make the rules side take effect.
- **(a) Invite code in the member doc.** The invite code itself already lived only in `groupSecrets`. The leak was the copy the joiner sends in their member doc (`code`, needed by the create rule), readable by every member, even when an admin switched member invites off. `scrubMemberCodes` (groups.js) removes it: right after joining, from my own doc when my memberships load, and (admins) from the other members' docs when the roster loads; one try per doc per session. The member update rule now lets a member **remove** `code` (never add or change it). Lazy data move: old docs lose the field the next time that person (or an admin) opens the app *after the rules are published*; until then the update is refused and ignored.
- **(b) "Paid" writes.** `settleOk()`: the settled / settledAt / status branch of the session update rule is now limited to the session's players, its court and shuttle payers, and people who may edit sessions or bills (the creator already passes through `isCreator()`). It used to be every member of the group. `_canMarkTransfer` shows the button only to the same people (a player still marks a manual player's payment). Rules cannot test one payment key at a time, so a player can still mark another pair's payment: the limit is "someone in the session". An other-costs payer who is not a player and has no bill rights can no longer mark; ask a bill editor.
- **(c) Legacy poll `votes`.** Rules: `votes` can never be changed or added (it may be removed); members' answer branch is `responses`, `voteLog`, `reachedAt` only. Client: `legacyPollMigration` moves an old multi-option poll to the current shape in the same write as the organiser's change (answers Join/Skip, `responses` from the chosen option's votes, date / time / duration / court of that option, `votes` deleted); a plain member answering an old poll sees "This old poll can no longer be changed. Ask the organiser." Reading old polls (`normalizePoll`) still uses `votes`. Creating a poll with `votes` (restore from trash) is not blocked, so Undo of a deleted old poll still works.
- **(d) Private profile fields.** `users/{uid}` is readable by every signed-in user and "who sees it" only hid things on screen. A field whose choice is "only me" is now written to `userPrivate/{uid}.mine` (phone, first / last name, gender, hand, position, home court, days free, time range) and left out of `users/{uid}` (`profileSplitMine`). Date of birth, relationship and health were already private. `profileLoadMine` (sign-in) reads the private copy when something is "only me", **moves values an older version left in `users/{uid}`** (private copy first, then the public one is cleared) and `profileApplyMine` puts the fields back on my own profile in memory (also after every users list refresh and when health / social read the private doc), so my own screens look the same. `userPrivate` accepts only the known `mine` shape (`mineOk`).
- **Not done (needs a decision):** fields shared with "groups" are still in `users/{uid}`, readable by any signed-in user outside the group. Fixing that needs a group-only copy (for example `members/{gid}_{uid}.contact`, readable by the group's members) and every screen that shows phone / name / about reading from it. `selfLevel` also stays public (the app uses it for everyone).
- **After publishing the rules:** open the app once as each person (so the invite-code and private-field moves run); admins open Group > Members once to clean the others' member docs. Nothing else to do.
- Lao string `pollLegacyReadOnly` is unreviewed.
- Tests: tests/audit-v231.test.js (member code scrub, `_canMarkTransfer`, legacy poll migration, split / overlay / lazy move of private fields, rules text checks).

## v232: PWA fixes (offline QR, "Update ready" bar, database error bar)

- **QR offline:** `js/vendor/qrcode/qrcode.js` (loaded on demand by the invite page) is now in the service worker's `ASSETS`, so the invite QR draws with no network. The test checks that every precached file exists (one missing file would fail the whole worker install) and that none is listed twice.
- **Update bar:** the old code reloaded the page on every `controllerchange`. Now `swControllerChanged(hadController)`: the very first install reloads nothing (the page already came from the network); an update reloads once only when nothing is being edited (`_appBusy`: a field has focus, the modal or an ask / share / tournament sheet is open); otherwise a slim bar "Update ready · Tap to reload" (`#swUpdate`, dismissible) waits for the person.
- **Database error bar:** `dbOnError` shows one slim bar (`#dbErrBar`, `.db-err`, under the notch) for the first error: what happened and where, **Retry** (reloads the app so every listener starts again) and a dismiss ×. A network error clears itself when the phone comes back online; a permission error stays. Listeners with their own quiet handler (restaurants, hall of fame) never show it.
- Lao strings (`updateReady`, `updateReload`, `dbErr*`, `dbRetry`, `dbDismiss`) are unreviewed.
- Tests: tests/pwa-v232.test.js.

## v233: faster splash (measured first)

- **Measured** (headless Chrome over the DevTools protocol, the built app served on localhost, service worker active so own files come from the cache, 3 warm runs): time from navigation start to the first `hideSplash()` call (the app is ready to leave the splash) = **110 ms median** (100 / 110 / 125). The splash scene itself was the wait: the last intro animation ended at **1.99 s** median (`window.spDone`). This is the signed-out path (Firebase SDK from the CDN, auth answered); a signed-in start also reads the memberships and the group, which was not measured here (no account in the test). The splash still waits for the app if that is slower: `hideSplash` leaves only when both the scene and the app are ready, so a shorter scene can never cut the app off.
- **Changed:** the court draw `sp-draw` 1.5 s -> **1.0 s** (start .15 -> .1 s), the dim step .6 s at 1.2 s -> .4 s at .8 s, the logo ring .5 -> .35 s, logo pop, court fade-in, name and sub-line shortened in proportion; `SPLASH_MIN_MS` 1700 -> **1150** ms (reduced motion stays 350). Same motion and easing, only faster; the court is still drawn slower than the ring (1.0 s vs .35 s). Measured after: scene done at **1.39 s** median (was 1.99 s), so the app opens about 0.6 s sooner.
- Tests: tests/splash.test.js (court <= 1 s, every intro animation ends within 1.2 s, the minimum on screen covers the draw, still slower than the ring, spDone gating unchanged).

## v234: kept images are read back at start (bug since v218)

Found in the live console after the v228-v233 merge: `ReferenceError: jsq is not defined` at storage.js:123 on every start. `warmAtStart` ran while storage.js loaded, before app.js (where `jsq` lives, line 403 of index.html vs 366), so the images kept for the next start (`imgKeep`: group logos, photos) were never read back from IndexedDB into the memory cache. It now waits for DOMContentLoaded (all deferred scripts have run); if the page is already complete it runs at once. Nothing else changed.
- Tests: tests/fast-start.test.js (load order, no warm-up while storage.js loads, runs once jsq exists).

## v235: tournament button in the session's Games tab
- The teal tournament strip (`tourCardHtml`) moved from the sessions list card into `sessionGamesTabHtml` (js/stats.js), above Live score / Add score. Everyone sees it; only organisers can press the actions.
- `_tnRefreshHost()` redraws that strip when sessions change and when the tournament screen closes, so the label (Play game k of G, Random semifinal ...) stays current.

## v236: tournament flow (start on card and Games tab, live or typed score, summary then one bracket button)
- `tourCardHtml` is back on the sessions list card AND first in the Games tab. Start label: "Start tournament · random N players".
- Up-next game shows two buttons: Live score (`tourStartLive`) and Add score (the stepper editor).
- Live score with a tournament running starts on the up-next pair (`tourLivePreset`, called from `showLiveScore`), so nobody picks players. The game carries `live.tour = {sid, gi, a, b}`; `lsSaveGame` hands the score back via `tourFromLive`, which checks the teams still match (swapped sides are fine) and reopens the tournament screen. The live game is also saved to `matches` as before; v228 stats dedupe it.
- After the last rotation game: a summary card (top 3, W–L, diff) with one button "Random playoff bracket" (`_tnSummary`), scrolled into view once; the playoff card also holds the button.

## v237: tournament start asks first, cancel back to normal, step tabs, podium with levels
- Start asks first: `tourAskStart(s, open)` shows `askConfirm` ("Start tournament?", N games for N players, can cancel later). Only on yes does the screen open and the teams get drawn (`tourStartDraw(s, "teams")`). From the card nothing opens on No.
- Cancel: while a tournament runs (drawn, not finished) a dashed red "Cancel tournament · play normal" button sits under the main button (`data-act="reset"`, same `askYes` danger flow; text now says the session goes back to normal games). When finished, the old Reset button stays at the bottom of the Winner tab. The rotation hint card no longer has its own reset button.
- Order: only the up-next game has Live score / Add score; every later unplayed game says "Waiting" (`.tn-waiting`, also in the bracket boxes). After a save (typed or live) the screen scrolls to the new up-next game.
- Step tabs: `.tn-steps` are now `role="tab"` buttons (44 px). `_tnViewNow(T)` = the step going on now (Pairs moves to Playoff once the bracket is drawn, because the semis live there). `_tnTab` holds a past step being looked at (null = now); reset on open, save and draw. Later steps are disabled. `tourTabParts(T, view)` names the sections per tab: 0 rule, hint, rotation, meet, rest, standings; 1 summary (before draw), standings, pairs, draw hint; 2 bracket, playoff games (6 players: pair table); 3 winner, bracket. A "Back to now" button shows while looking at an older tab. Main button, cancel and toast stay above the tabs.
- Podium: 2nd left, 1st middle, 3rd right, names on top of blocks 72 / 96 / 52 px high (`.tn-plinth`), crown on the 1st block.
- Bracket overlaps at 400 px fixed: the box header wraps ("FINAL · BEST OF 3" / "CHAMPION"), long names ellipsize and the score keeps its own column.
- Lao text for the new keys is unreviewed.
- Tests: tests/tournament.test.js (start asks before drawing, cancel above tabs, tab map, Waiting count, one Live score button, podium order, tab switching).

## v238: tournament stand-in player (replace a hurt player)
- Data (all optional, older tournaments stay valid): `T.hurt = [{ i, why, note }]` players out for the games left; a game can carry `subs = [{ from, to, why, note }]` (player `to` plays in the place of `from`, positions in `ids`) and `woHurt` (walkover because nobody could stand in). `tourOn(g)` gives who is really on court.
- Who may step in (`tourEligible`): anyone in the session not on court in that game and not out (hurt, or in a pair marked out). In the playoff the hurt player's partner is on court, so never their own stand-in. The app picks (`tourAutoPick`) the one with the fewest games in the tournament (played and planned), then name A–Z; the user can change it.
- "This game only" adds a stand-in to that game. "All of X's games left" also puts X in `T.hurt`; `tourResolve` → `_tourHurtFill` gives every game still to play a stand-in, also playoff games built later. Nobody free: that game is a walkover (21–0, `wo` + `woHurt`), the team of the hurt player loses (win/loss in the table, no points, not a stats game).
- Counting (user decision 1b and 2): the stand-in gets the game in the tournament table (`tourStats` uses `tourOn`) and in Rankings/Elo (`tourMatches` uses `tourOn`). The hurt player keeps only the games played. The table can give a stand-in extra wins; that was chosen.
- Mid-game: live score menu → "↺ Replace player" (`tourLiveSub`) opens the same sheet, swaps the player in `live.a/b` and records `live.tour.subs` (user ids). The score goes on. On save `tourLiveApply` checks the teams = game players + those stand-ins (either side first), writes the stand-ins (tried on a copy first), then the score. The whole game counts for whoever finished it.
- UI: the up-next game has 3 buttons in one row (Live score, Add score, ↺ Replace player; `.tn-gbtns` nowrap, icons hidden under 370px). The sheet shows photos for "Who cannot play" and "Who steps in" (+ games played, "picked"), reason, note, This game only / All games left. Replace and Back in ask first (`askConfirm`). Game card: gold tag "↺ for Nith", resting line "Out: Nith (injury)", warning "Lich plays 3 in a row" (`tourRowRun`). "Out players" card under the progress bar with Back in (`tourBackIn`: clears stand-ins and walkovers of games not played; rotation walkovers stay once the playoff is drawn).
- Lao text for the new keys is not reviewed by a native speaker.

## v239: icons back to v212 (shuttle, Live score), Court shows a shuttlecock
- User decision: the icons look as they did in v212 (c8ba897). `SOLAR.shuttle` and `SOLAR.scoreboard` in js/icons.js are the v212 art again (classic: black hand-drawn shuttlecock, grey "7|7" scoreboard). The v223 orange shuttle and blue "10|2" board are gone.
- `ICON_FIXED` is back to `{ shuttle: 1 }` only (clay, sticker and tiles use the plain shuttle as in v212). Clay/sticker scoreboard and tiles scoreboard are the v212 ones (CLAY_ART scoreboard was not changed by v223).
- New `PLATE_GLYPH` in js/icons.js: in box, neu and glass the plate draws `court` with the shuttlecock glyph (it was a tennis/baseball-like ball from SOLAR_BOLD since v182) and `scoreboard` with the 7|7 line board (v212 showed a meaningless 3-dash list from SOLAR_BOLD). Both are white glyphs like the other plated icons. Classic Court stays the map pin, tiles/clay/sticker Court stays the racket.
- Nothing else changed: no glow/shadow, no other icons, v223+ features stay (e.g. shareOut).

## v240: Next game card, tight shadow on neu icon plates
- With icon style Neu the plates in the "Next game" card (`.home-next`) threw the big neumorphic shadow (5px/11px, white in the light theme) over the teal-blue gradient, a wide white halo. New rule at the end of css/styles.css: `body .home-next .ico-neu, body[data-theme="light"] .home-next .ico-neu` gets `2px 2px 4px rgba(0,0,0,.18), -1px -1px 2px rgba(255,255,255,.35)`. No `!important`: the selectors beat `body[data-theme="light"] .ico-neu` (one more class) in both themes.
- Only neu, only in that card. Neu plates elsewhere, box, glass and tiles are unchanged.

## v241: Delete a session removes everything of it; delete a poll removes only the poll
- **Session delete** (`deleteSessionById`, js/sessions.js): after askYes, in this order: the games in `matches/` with `sessionId == sid` (`trashSessionMatches`, 200 per trash entry, kind `matches`, field `items:[{id,data}]`), the Hall of Fame record `groups/{gid}/hallOfFame/{sid}` (`trashSessionHof`, kind `hof`; also drops the phone-local copy `hof:{gid}` and `_hofSaved[sid]`), the session (bill/ledger and `tourney` games live in it), then a confirmed linked poll. ONE Undo toast holds all ids (`cascadeUndoIds`: session first, then poll, record, games). If a step fails before the session is moved, the already moved parts are restored.
- Why games and record go BEFORE the session: the new rules function `sessionMgr(sid, gid)` needs the session to exist. Restore is the mirror: session first.
- `restoreTrash` knows `e.items` (writes every game back with its original fields, incl. createdBy/confirmed). Trash page: one row per entry ("{session} · N games", "Hall of Fame record"); restoring a games row alone works only while its session exists.
- **Poll delete** (`deleteSessionAndPoll` button in the confirmed poll card, and `deletePoll`): only the poll goes to the trash. The session keeps `pollId` pointing at nothing; nothing in sessions/dashboard needs the poll (dashboard checks `pollById[s.pollId]` for null). Strings `unconfirmPoll*` reworded.
- **Rules (need publishing, Pages does not deploy them):** `sessionMgr()` = member of the group, session exists in that group, and (editSession or session creator). Used for: `matches` delete + create (restore), `hallOfFame` delete + create (restore). Existing branches unchanged.
- Stats count from the live `matches` listener plus sessions' tournaments, so a deleted session's games stop counting at once and count again after Undo. Tests: tests/delete-cascade.test.js, tests/poll-manage.test.js.

## v242: Swapping a player in a session edit follows into the tournament and the poll
- **Bug:** `tourney.ids` is fixed at draw time and the session edit never touched it, so a replaced player stayed in every game; the linked poll kept the old answer too.
- **Hook** (js/sessions.js): `sessionPlayersGate(s, newPlayers, go)` runs in both edit paths (details modal `showSessionDetailsModal`, and `saveSessionCosts`, which now calls `_saveSessionCostsGo`). It compares the session's CURRENT tournament players (`tourCurIds`) with the new list (`tourPlayersChange`): none / swap (1 out, 1 in) / count (anything else). The tournament change is written in the SAME `dbUpdateSession` as the players (`sessionWriteEx`); the poll is updated after the save (`sessionAfterPlayers` -> `pollApplySwap`, best effort, toast `pollSwapFail`).
- **Count change or 2+ swaps with a running tournament:** `askConfirm`: "Cancel tournament" (writes `tourney` delete, players saved) or "Keep the old players" (players not changed; also Esc/back). Completed tournaments and sessions without one are not asked.
- **Engine** (js/tournament.js): positions never change. `T.swaps = [{ i, from, to, at, old? }]`. `tourUid(T, i, g)`: uid on position i in game g (object or index; no game = current player). A swap applies to game index >= `at` except indexes in `old` (games already played out of order, or a live game in progress). `tourSwap(T, from, to, keep)` sets `at` = first unplayed game; a hurt old player is cleared (`tourBackIn`) because the new one is fit. Swap back and repeated swaps work (later swap wins from its `at`). No `swaps` = old behaviour.
- **Credit:** `tourMatches` (Rankings, Elo) uses `tourUid` per game: played games stay with the old player. `tourStats`/pairs/playoff are per POSITION: the new player continues the slot's table row (the old player's games stay in that row). Pairs card, podium, Hall of Fame record use the CURRENT player. Live score: start and `tourLiveApply` use the game's own uids; a live game in progress at swap time keeps its lineup (`old`), the swap applies from the next game.
- **Poll:** `pollSwapFields` moves `responses[old]` to the new player, keeps the old `voteLog` time, sets `responseFor[new] = <first player>` (swapped back = note cleared). Poll card shows "↺ for MartinyBob" under the answer row (`_pollForNotes`, `.poll-for`). Counts unchanged. Old player had no answer: nothing moves.
- **Rules (needs publishing by paste):** polls update gets `canIn('editSession') && changed().hasOnly(['responses','voteLog','responseFor'])`. Poll creator / createPoll already could.
- **Sessions edited before v242:** open Edit session and save (nothing to change): the gate sees tournament players != session players and applies the swap then.
- Not changed: poll `confirmedPlayers` (only used for backups). Tests: tests/session-swap.test.js.

## v243: The OS dark mode never repaints the app
- Users pick their theme in Settings; the phone's dark mode must not change it. There is still no `prefers-color-scheme` anywhere (tests/no-os-dark.test.js fails if one appears).
- Forced darkening (Chrome Android Auto Dark, Samsung Internet, WebView force-dark) is opted out with `color-scheme: only light` / `only dark` (CSS) and `<meta name="color-scheme">` in index.html. `_syncColorScheme()` in applyTheme() keeps the meta and `<html data-theme>` in step on every palette, special and toggle change; a tiny inline script in index.html sets it before first paint for a saved light theme.
- Native controls, scrollbars and pickers still follow the chosen theme. No `forced-color-adjust` change (Windows high contrast untouched). iOS Safari never force-darkens pages.
- Samsung Internet (incl. the installed PWA) ignores a plain `color-scheme: light` but respects the `only` keyword, so BOTH the CSS and the meta use `only light` / `only dark`, never plain `light`/`dark`.
- User-side fallback if a Samsung phone still darkens the app: Samsung Internet > Settings > Labs > turn off "Use websites dark theme".

## v244: Icon pack "3D objects" (dashboard pack id `3d`)
- New pack beside clay / sticker, picked in Settings > Icon style > Dashboard icons (4 cards with a preview). Nobody's current pack changes: default stays `clay`; the pick is saved in localStorage `dashPack`.
- **Original art**, hand-drawn SVG (no download, no licence), 14 drawings on a 64x64 grid, in `ART_3D` (js/icons.js). Gradients and the shuttlecock sub-drawing live once in `G3D_DEFS`; every id is prefixed `g3d-`. One hidden `<svg id="g3dDefs">` (injected once, like clay/sticker) holds the defs plus one `<symbol id="g3d-i-NAME">` per drawing; each icon in the page is only `<svg><use href="#g3d-i-NAME"/></svg>` (small DOM). Total about 21 KB of path data.
- **Mapping** (`ICON_3D_MAP`, app icon name -> drawing): court->court, users/user->friends, market->market, polls/vote->poll, shuttle->game (3D shuttlecock), scoreboard->score (7|7 board), chart/ranking/dashboard->stats, calendar/sessions->calendar, clock/history->clock, training->training, trophy/medal/crown->trophy, health/heart->health, share/shareOut->share, wallet/bill/card->wallet. The app has no icon names market / health / training: tiles pass the drawing by key (`icon3(name, px, cls, key, fb)`), e.g. Home Market is the name `other` + key `market`. A name with no drawing falls back to the clay icon, exactly as clay does. Controls (ICON_PLAIN, incl. share/shareOut as plain buttons) and icons under 14px stay plain line icons.
- **Where it applies** (only when the pack is `3d`; other packs unchanged): the Dashboard page (`_dashCtx`, via `icon()`), Home shortcut row (Court/Friends/Market, 54px) and Create row (Poll/Game/Score/Live, 44px) without the glass card or plate (`.hg-grid.g3d`), Home stat-card titles and the Next game card/tag, Health page (title, the 4 path tiles) and the Dashboard health card (Week, Month, Workouts = training, Heart rate zones = health, Details = health, Share card = share). `icon3()` returns the normal icon (size `fb`) when the pack is off.
- v239 `ICON_FIXED` / `PLATE_GLYPH` rules are untouched (they serve box/neu/glass/classic/tiles; in the 3d pack shuttle = shuttlecock, scoreboard = 7|7 board, court = 3D court).
- Weak spots fixed in the art: training shuttle bigger and simplified (no ribs), health pulse line 5 wide with shadow, calendar 3x3 bigger cells with darker idle cells (reads at 18px), share trail solid + one clean lower fin.
- **How to add an icon:** draw a 64x64 symbol body using `url(#g3d-g-...)` gradients (add a gradient to `G3D_DEFS` with a `g3d-` id if needed), add it to `ART_3D`, map app names in `ICON_3D_MAP` (or call `icon3(name, px, cls, "key")`). tests/icons-3d.test.js checks references resolve and ids are unique.
- i18n: `dashPack3d` ("3D objects" / Lao "ວັດຖຸ 3D", not native-reviewed) and `dashPackHint` extended in EN and LA. uimatrix: icon entry `"box+3d"` = style box with pack 3d (in the default list). Tests: tests/icons-3d.test.js.

## v245: Flat bottom bar with a floating bubble, Games tab first, tournament stepper
- Bottom bar (`#bottomNav`, `.bottom-nav`): order Dashboard, Game, Rank, Community, Setting. The first item is today's Home page, label key `navDashboard`. Items are `<button>`s with the same ids; the active one gets `aria-current="page"` (set in `showPage`, js/router.js).
- Always plain glyphs: nav icons carry `data-plain`, so `fillStaticIcons` draws them with `iconAs("classic", ...)` whatever the icon style is. No plates in the bar.
- The bar shape is three moving pieces inside `.nav-bg`: left filler `.nb-l`, an SVG notch `.nb-notch` (cubic-bezier shoulders, 120x40 box) and right filler `.nb-r`, plus a static `.nb-base`. `positionNavNotch()` measures the active item (offsetLeft + half width) and only sets `transform: translateX()` on the three pieces, so 3 or 5 slots work. It runs on `showPage`, resize, orientationchange, load, a ResizeObserver on the nav, and when `updateGroupHeader` shows/hides Rank and Community. First paint and those re-measures use `.nav-snap` (no transition).
- The bubble is `.nav-icon::before` (52px, primary-to-blue gradient, same colors as the FAB so the white glyph keeps contrast on every palette). Active: glyph and bubble `translateY(-22px)` with `cubic-bezier(.34,1.56,.64,1)` 420ms. Reduced motion: no transitions.
- Sizes are CSS variables on `:root`: `--nav-h` 66px, `--nav-lift` 24px, `--nav-bar` (adds the safe-area inset). Body padding, FAB, undo toast, update toast and the session action bar all use them. Change the bar height in one place only, and keep the notch geometry in index.html (`.nb-base { top: 34px }`) in step.
- Session detail opens on the Games tab (Games first, Session/bill second). `showSessionDetail(id, "bill")` opens the bill: used by openSessionBill, the payments list, and the "bill ready" / "paid to you" notifications. Without groups there is no Games tab and the bill shows as before.
- Tournament step tabs are now a stepper (`_tnSteps` since v246, js/tournament.js): `ol.tn-steps`, each step a button with `data-act="tab"`. Done = tick, current = yellow ring + `aria-current="step"`, later = `disabled`. Labels use the new keys `tourStepRotL/PairsL/PlayoffL/WinnerL` (no numbers); the old numbered keys stay for any other use. 6 and 8 players use the same four steps.

## v246: Score editor fixed (two functions had the same name)
- v245 added the step stepper as `_tnStepper(now, view)`, but `_tnStepper(T, g, side, sc)` already existed: the -/+ score stepper of Add score / Correct score. All app scripts share one global scope, so the later function replaced the earlier one and the score editor drew broken markup.
- Fix: the step stepper is now `_tnSteps(now, view)`. The score stepper keeps `_tnStepper`.
- Guard: tests/no-dup-functions.test.js fails when two top-level `function` names repeat across js/*.js, and checks that the score editor draws its -/+ buttons. Before naming a new helper, grep js/ for the name.


## v247: Shorter Rankings tab, badges pop-up, All my matches
- Rankings tab (js/stats.js): Pair rank and Player rank show rows 1-3, a gap row ("· · · N more · · ·") and the last 3 (`rankSliceIdx(n, meIdx)`, pure). 7 rows or fewer show in full. My row in the hidden middle is shown between the gaps with its real rank number (for pairs: my best-ranked pair). "See all N" (only when the list is cut) calls `statsSeeAll(kind)`: Head-to-head tab with the full list at the top (`h2hAll`, `_h2hAllHtml`, same row markup, scope chips inside the card). Any tab click clears `h2hAll`.
- One change marker per row: `_rankTrend(now, start)` = rating change since the start of the month (a dash when none). The rank-change arrow and NEW tag are gone from the UI (`computeStats().rankChange` and the `newTag` / `rankChangeHint` keys are still there, unused).
- Faded provisional rows: class `prov` (pair < PAIR_MIN_MATCHES, player < RANK_MIN_MATCHES). Number, picture and name fade (.55-.72); the small line and the change marker keep full colour because faded small text falls under 3:1. One note under a list that has faded rows (`provFadedNote`). The hero rating keeps `_provTag`.
- Highlights card: only "Best score". Pair row tap: `statsPairGo(key)` sets `h2hPairA`, opens Head-to-head and scrolls to `#pvpCard`. Player row tap still goes to Progress.
- Badges: the card is gone from the Ranking tab and the Home "Badges" swipe card was removed (the Home strip now drops empty cards, so dots always match). The hero has a gold button (`_badgeBtnHtml`, class `badge-btn`) that opens `openBadgesSheet()`: a `.sheet-wrap` bottom sheet, role=dialog, focus on Close, Esc / backdrop / Close close it and focus goes back. Locked badges show progress through `badgeProgText` ("62/100", streaks "best 6"). Profile pages keep their own full badges card (`badgesHtml`).
- All my matches: new page id `matches-all` (js/matches-all.js, container `#page-matches-all`, `loadMatchesAll`, route in js/router.js, refresh in `_refreshCurrentPageNow`). Opened by `openMatchesAll('')` from the link next to the W/L strip; breadcrumb Rankings > All matches. State vars `maUser/maPeriod/maResult/maType/maPartner/maOpp/maDays/maOpenDays`. Pure helpers: `maPeriodFrom`, `maGames`, `maFilter`, `maSummary`, `maGroup`, `maTimeRange`, `maScoreText`. Days newest first, each a `<details>` (newest open), sessions inside (court, time range, Tournament tag when a game has `tid`), games with no session under "Other games". First 30 days, then "Show older".
- Rating change per game: `computeStats()` history entries now carry `d` (that game's change) and `mm` (the match). `maGames` pairs `history[i]` with `_myGames()[i]` (same order, same decided games) and checks `h.mm === g.m`.
- Type filter: Doubles = teams of 2 (tournament games included), Singles = teams of 1, Tournament = games with `tid`.
- UI matrix: `matches-all` added to PAGES; fake data now has games on more days, with no session, a tournament game and a singles game; the stub snapshot no longer empties `lastMatches` (so Rankings is drawn with data). New `lang` option ("en" | "la") for screenshots. Light-theme green/red change markers darkened (`.trend`, `.mh-tl em`).
- Tests: tests/rankings-v247.test.js (slicing, markup, badges, grouping, filters, rating sum, wiring, EN + LA keys).

## v248: All matches redesign, short lists in full
- Rankings: `RANK_FULL_MAX` = 10 (commit 8848a0c). A list of 10 rows or fewer shows in full; the top 3 + gap + last 3 cut starts at 11 rows (was 7). `rankSliceIdx` unchanged otherwise.
- All matches (js/matches-all.js, `.ma-*` in css/styles.css): each game = two lines, my team (viewed player first, bold) and the opponents (muted), with `avatarHtml(uid, 26)` overlapped (`.ma-avs`). Right column `_maScoreHtml`: one column per set, my side on top, the set winner in a green pill (`.ma-pt.won`), the loser grey; a draw leaves both plain. 4px left bar: green won, red lost. The W/L chip and the per-game rating change are gone from the row (day and session headers keep the totals).
- Tap: a game in a session still opens its Games tab; a game with no session toggles a small detail (`maToggleGame`, result + sets + rating change, `aria-expanded`).
- Filters: player picker full width with the avatar inside (`.ma-pick`); period (4 slots) and result (3 slots) are `.ma-seg` grids of buttons with `aria-pressed`; Type / Partner / Opponent = 3 equal selects with a caption (`.ma-sel`). New short labels: `maP30Short`, `maTypeCap`.
- Summary is one strip (`.ma-sum`) with dividers. `maGamesN(n)` gives "1 game" (`oneGame`) / "N games"; the summary cell uses `maGameOne` for 1.
- Session header never wraps: icon + `.ma-stt` (ellipsis) + Tournament tag + W-L in one nowrap flex line.
- Colours: `--ma-win`, `--ma-winbg`, `--ma-loss`, `--ma-bar-w/l` set on `#page-matches-all`, darker values under `body[data-theme="light"]` (pill text 4.57:1, red 6.5:1).
- Tests: tests/matches-all-v248.test.js. Lao strings for the new keys are not native-reviewed.

## v249: Tournament for any size, 4 to 20 players, one court
- Format 2 (`T.fmt === 2`, new tournaments) and format 1 (no `fmt`, saved before v249, 6 or 8 players). Old data keeps the old logic untouched: `tourFmt(T)`, `tourQ(T)` (players in the playoff; format 1 = everybody) and `tourKind(T)` ("final" | "rr" | "bracket") are the only switches. `tourNewV1` still builds the old shape (tests and fixtures only; the app starts `tourNew`). Format 2 T also carries `q`.
- Mix stage (`tourMixShape(n, rnd)`): k = 3 games each when n % 4 == 0, else 4 (`tourK`); games = n*k/4 (`tourMixGames`). Greedy start ("4 players with most games left, longest rested") then a seeded search (swap players between games, swap sides, swap / move games) on `tourMixCost`: a pair that partners twice = 1000, rest streak (L-1)^2*20, play streak (L-1)^2*30, opponent met again 3*(c-1)^2. Every seed gives EXACT equal games and zero repeated partners for all n 4..20 (tests/tournament-v249.test.js, 12 seeds per n). Streaks are minimised, not guaranteed: 4 players play 3 in a row, 5 players play up to 4 (forced); from 6 on nobody plays 3 in a row; rest streaks stay 1 up to 8 players and grow with n (9: 2 ... 20: 6, the test bound is ceil((n-4)/2.5)).
- Table: wins, point difference, points scored, then the coin (unchanged `tourStats`).
- Playoff by size (`tourPlayoffSize`): n 4-5 -> top 4, pairs 1+4 and 2+3 (seeded by combined diff as before), one final best of 3 (`po[0]` has `fin`). n 6-7 -> top 6, 3 pairs, round robin of 3 games (format 2 tie: wins, pair point diff, points scored, then the game between them). n 8-20 -> top 8, pairs 1+8, 2+7, 3+6, 4+5, semis P1 v P4 and P2 v P3 (`T.semi = [0,3,1,2]`, NOT drawn at random; format 1 still draws), then 3rd place best of 3 (`th: true`, labels T1..T3) and the final best of 3 (`fin: true`, F1..F3). Order of play: S1, S2, T1.., F1.. . Players below the line are done; their games still count in Rankings/Elo. `tourOrder` gives [1st, 2nd] for the top-4 final (no 3rd place) and [1st, 2nd, 3rd] otherwise.
- Series helpers: `_tourSer(T, key)`, `_tourSerWins`, `_tourSerDecided`, `_tourSerKeep`, `tourThirds`, `tourThirdWins`; `tourSync` trims/adds games of both series and keeps the order other games, 3rd place, final. When a game is inserted before a played one (a corrected 3rd place game needs game 3 after the final started), `_tourRemap` moves the v242 swap marks (`at`, `old`) with the games.
- Stand-ins (v238) and pair-out (v228) are unchanged in logic: eligible = not on court, not hurt, not in an out pair (players below the playoff line can step in). `tourMarkOut` accepts pair numbers 0..q/2-1. Verified for top-4 final, top-6 round robin, top-8 bracket and a 3rd place series. Session swap (v242) works in format 2.
- Estimate (pure): `tourEstimate(n, per)` with `TOUR_MIN_PER_GAME = 15` (js/tournament.js, the one constant to change). Playoff games: final 2-3, round robin 3, bracket 6-8 (2 semis + 2-3 + 2-3). `tourEstimateText` -> "3h45–4h15" (one value when min = max), `tourFmtDur(min, pad)`. Start label "Start · {n} players · ~{est}". Before drawing, `tourAskStart` compares `maxMin` with `tourBookedMin(s)` (= `s.duration` hours * 60) and puts "This takes about 4h15, longer than the 2h booked." in the confirm `detail` line (kind warn). No duration: no warning. Outside 4-20 the button is disabled with "Needs at least 4 players (now n)" / "Up to 20 players (now n)".
- Progress ("Game k of 12") and the progress bar use `tourTotals(T)` ({min,max}: format 1 = 12 / 11-12, format 2 = estimate games).
- Info sheet: round "i" button (`_tnInfoBtn`) in the tournament header and next to Start (screen and session card). `tourOpenInfo(sid, opener)` opens `#tnInfoSheet` (sheet-wrap, role dialog, aria-modal, focus into the sheet, Tab stays, Escape and tap outside close, focus returns to the opener). Text from `tourInfoModel(n, T)` (pure): format 2 personalised (games each, mix games, resting per game, table, playoff for this size, best of 3, estimate, hurt line); format 1 tournaments show their old rules. Lao strings are not native-reviewed.
- Hall of Fame: `hofRecord` writes a final for every size except the round robin; `hofClean` keeps n 4-20 (else 8); labels use `hofSizeN`. firestore.rules `hofOk`: `d.n in [6, 8]` became `d.n is int && d.n >= 4 && d.n <= 20` (finalGames <= 3 and outs <= 4 still hold for every shape). Rules are NOT deployed by the release: paste firestore.rules in the Firebase console. Until then a record of a 4, 5, 7 or 9-20 player tournament is refused by the old rules and kept on the phone (the existing fallback), 6 and 8 keep working.
- Stats: `tourMatches` / `tourMergeMatches` are format-agnostic (id `t:<sid>:<index>`, `tid`, `tstage` = "rot", S1, T1..T3, F1..F3). `tourLabText("T2")` = "3rd place · game 2". All matches page filter "Tournament" = games with `tid`, unchanged.
- Table screen: the playoff line is drawn in the standings (`tr.cut`, rows below dimmed), a note names who is done after the mix, the podium has 2 blocks for a top-4 final (`.tn-pod.two`). Rest map shows a game label every 5th when there are more than 10 games; the who-meets-who table uses 16px avatars from 11 players and scrolls.
- Tests: tests/tournament-v249.test.js (generator for n 4-20, estimate table, playoff by size, 3rd place best of 3 and corrections, format 1 fixtures for 6 and 8, stand-ins, pair-out, swap, HoF payload vs the rules text, stats records, info sheet). Existing tournament tests now call `tourNewV1` (they test format 1). Not verified on a real tournament: a long 16-20 player evening, many stand-ins plus a swap in one tournament.

## v250: Cheap push sender (two phases), idle runs read about 10 documents
No app change (version bump only) and **no rules change**. Only `push/` changed: `push/runner.js` (new, the whole run, no Firebase import), `push/send.js` (Firebase and FCM only: `adminStore`, `makeDeliver`, `sendTest`), `push/events.js` (unchanged messages; adds `watchInfo`, exports `ms`, `VOTE_SETTLE`). The old sender read users, pushTokens, members, groups, polls, sessions, openGames and invites on EVERY run (80 to 150 reads, 12k to 43k a day of the 50k Spark quota).
- **Phase 1 (cheap)**: five OR queries (`Filter.or`, one query per collection, billed by documents returned, minimum 1) plus the state document. **Phase 2 (full)** only when phase 1 finds something: `loadData` + `collectMessages` + sending, exactly as before v250. Messages are produced ONLY by `collectMessages`, so text, recipients, tags, links and timing cannot change; phase 1 decides "run it or not" with checks that are supersets of what `collectMessages` reacts to (an extra full run costs reads, a missed one would be a bug).
- Log per run: `phase1 reads 9 · nothing to do` or `phase1 reads 12 · full run (new poll, ...): read 93 docs (...) · events: 3, pushes sent: 5, failed: 0`. A failure inside phase 1 (for example a query Firestore refuses) falls back to the full run and says so (`phase 1 failed, running full`); `adminStore.query` also falls back from one OR query to one query per clause.
- **Event, trigger, phase 1 check** (`since` = `pushState/main.lastRun`, `isNew(t)` = `since < t <= now`):

| Event | Trigger in collectMessages | Phase 1 check |
|---|---|---|
| New poll | `createdAt` (server timestamp) new, status draft/open | polls: `createdAt > since` |
| Vote answers (settle 5 min) | open poll, `voteLog.<uid>.at <= now - 5 min` and differs from `voteSent` | open polls are read on every run (`status in [draft, open]`), same test on `voteLog`; a vote that is not settled yet is simply seen again on the next run, no extra state |
| Voting closes in 3 h / voting closed | `pollCloseMs(p)` crosses `-3 h` / `now` | the same open polls |
| Enough players | `reachedAt` new on an open poll | the same open polls |
| Poll confirmed / cancelled | `confirmedAt` / `cancelledAt` new | polls: `confirmedAt > since` OR `cancelledAt > since` |
| Bill ready | `billAt` new, `calculated` | sessions: `billAt > since` |
| Marked as paid | `settledAt.<from__to>` new | no top-level timestamp exists (see "Payments" below) |
| Daily payment reminder | local hour >= 9 and `lastReminder != today` | pure time check, no query: that run is a full run (once a day) |
| Game in 1 hour (sessions) | start within (now, now+1 h], not in `startSent` | sessions: `date in [today, tomorrow]` (tomorrow only counts when now+1 h is already tomorrow, Bangkok time) |
| Open games: joined / full / cancelled / in 1 hour | `log.<uid>.at`, `fullAt`, `cancelledAt`, start time | openGames: `status in [open, full]` OR `cancelledAt > since` |
| Join request / approved | members `joinedAt` (pending) / `approvedAt` (active) new | members: `joinedAt > since` OR `approvedAt > since` |
| Invite / invite accepted | invites `createdAt` (pending) / `respondedAt` (accepted) new | invites: `createdAt > since` OR `respondedAt > since` |
| Trash purge (30 days) | `trash.deletedAt < now - 30 d` | once a day (first run of each Bangkok day, `pushState.lastTrash`), so an old item is removed up to 24 h later than before; nothing else depends on it |

- **Payments** (`settledAt` is a map written inside the session, rules only allow non-creators to change `settled`, `settledAt`, `status`, so adding a top-level `updatedAt` would need a rules change; old installed apps would not write it either). Instead each full run stores in `pushState/main`: `watchKeys` = every payment key (`from__to`) of every calculated session in the 180-day window (queried as `settledAt.<key> > since`, 27 keys per query in the sessions query, 30 per extra query), and `watch` = ids of sessions with an unpaid transfer dated in the last 14 days (read by id on every idle run, 1 read each; this covers edits that make new keys without a new bill time, e.g. swapping a player). `watchInfo()` in `events.js` builds both from the ledger. The lists are rebuilt on every full run, so at least once a day (the 9:00 reminder run).
- `lastRun` moves to `now` on every run, idle or full (`now` is taken before the queries, exactly as before), so something written during a run (its time is after `now`) is picked up by the next one. State semantics are unchanged: `lastRun`, `lastReminder`, `startSent`, `voteSent` (plus `watch`, `watchKeys`, `lastTrash`). The first run after the update has no `watch` and does one full run to build it.
- **Reads**: an idle run = 1 (state) + open polls + today's sessions + open (not cancelled, not past-expired) public games + 1 for each of the other empty queries + 1 per 27 to 30 payment keys + up to 1 per recent unpaid session. Typical group: about 8 to 15 per run, so 200 runs/day = about 2k to 3k reads a day, plus about 100 for the daily full run and about 100 for each run with a real event. Before: 12k to 43k. The test simulation (small world, 91 docs in a full load) averages 8.6 reads per idle run against 95.8 before.
- Not covered by a query, accepted: a payment key that did not exist at the last full run on a session older than 14 days (swap on an old session followed by a payment inside the same day, until the next full run); un-paying and re-paying a payment on a session that is not in `watch` is covered by `watchKeys` (the key is already known). `voteSent` entries of polls that were deleted (not closed) are cleaned on the next full run instead of the next run.
- Tests: `tests/push-cheap-v250.test.js` (plain node, no firebase-admin; in-memory Firestore with the query forms the runner uses, including Timestamp vs number typing and `set merge` deep merge). Runs the OLD behaviour (`runOnce(..., {legacy: true})`: full load and trash purge every run) and the new sender side by side on the same world, 40 random timelines of 4 days (about 23k runs; polls, quick Yes/No/Yes taps, confirm, cancel, bills, paid / unpaid, player swaps, open games, invites, join requests, trash, session deletes, client clocks up to 90 s behind, writes just after `now`) plus scripted scenarios. Asserts the same messages (uid, title, body, link, tag) in the same run, same `voteSent` / `lastReminder` / `startSent`, only expired trash lingering, all 18 push kinds produced, and read counts down. Mutation-checked: removing a phase 1 trigger fails the test.
- Not run against real Firestore (by design). Things to watch in the first Actions logs: `phase1 reads` should be around 10 to 20; `OR query failed` or `phase 1 failed` lines mean the fallback is running (still correct, less saving). Firestore needs no new index: every query is a single-field range / `in` OR-ed per collection (automatic indexes).

## v251: Head-to-head tab is "Rivals & partners"
- The tab (`statsTab === "h2h"`, label key `headToHead`) shows one player (`h2hUser`, null = me) for one period. The period is `maPeriod`, the same state as All matches (month | 30d | 1y | all, default 30d), so the two pages stay in step; `h2hSetPeriod(p)` sets it and re-renders.
- `h2hAggregate(uid, period)` is the pure part: `{ n, partners, toughest, easiest, singles }`, rows `{ k, n, w, l, pts }`. Partners and pairs need `H2H_MIN` = 2 games. Order: win rate, then more games, then point difference (toughest: lowest rate, then most losses). Toughest = win rate under 50%, Easiest = over 50%; exactly 50% is in neither list, so a pair is never in both. Singles: every opponent, most games first (no minimum), card only when singles games exist.
- Cards show `H2H_TOP` = 3 rows; "See all N" / "Show less" (`h2hToggle(id)`, state `h2hOpen`) opens the rest in place. Each card has its own empty text.
- Rows are buttons: `h2hGo(kind, key)` -> `openMatchesAll(uid, opts)`: partner row = `{ partner }`, pair row = `{ oppPair }`, singles row = `{ opp, type: "singles" }`, plus the period. `openMatchesAll(uid, o)` now takes optional presets (period is kept when not given).
- All matches: new filter `maOppPair` (a pairKey; `maFilter` field `oppPair`, matches only games where the opposing team is exactly that pair). The opponent select shows "A + B" as an extra option while it is set (value `pair:<key>`); picking anyone else, changing the player or "clear" drops it.
- Ranking tab: "See all N" no longer jumps away. `rankExpand` {pairs, players} + `statsSeeAll(kind)` toggle the list in place (button reads "Show less" when open, key `seeLess`). A pair row (`statsPairGo`) opens All matches: player = first member, partner = second member, period = month / 1y when the Ranking scope is that, else all time.
- Removed: the "My record N games" total card, "with partners / against pairs" lists, the pair-vs-pair tool (`_pairVsPairHtml`, `h2hPairA/B`, `pvp-*` CSS), `_h2hAllHtml`, `h2hAll`, `_h2hRows`; i18n keys h2hPairVsPair, pvpNoOpponent, pvpNeverMet, h2hTheirs, h2hWithPartners, h2hMine, h2hVsPairs, h2hWithPartner, h2hVsSingles, allPairs, ptsShort. "pts" is now "point diff" (`h2hPtDiff`).
- Tests: tests/h2h-v251.test.js; tests/rankings-v247.test.js updated (See all in place, pair row -> All matches). UI matrix: set statsTab with `{"pre":"statsTab='h2h'","pages":["stats"]}` in the wrapper hash.

## v252: Friends and Live 3D icons in three variants
- New original drawings for Friends (Home ໝູ່, names users/user) and Live (Home Create row ສົດ, `homeShortLive`; before it wrongly used the stats bars). Three variants: `real` (default, Realistic), `clay`, `glossy`. Only when `currentDashPack === "3d"`; other packs unchanged.
- `ART_3D_VAR[name][variant]` in js/icons.js (names `friends`, `live`); symbol ids `g3d-i-<name>-<variant>`; gradients `g3d-v-*` in `G3D_VAR_DEFS`, injected with the rest of the 3D defs (once). `ART_3D` no longer has `friends` (13 fixed drawings). `ICON_3D_MAP.scoreboard` and `live` now point at `live`; Home "Score" keeps the `score` drawing by explicit key.
- Choice: `currentG3dVariant`, localStorage `g3dVariant`, `setG3dVariant(id)`; picker "Friends & Live style" with 3 preview cards in Settings > Icon style, shown only when the pack is 3d. `_svg3d(key, px, cls, variant)` takes an explicit variant for the previews.
- No `<text>`: LIVE and the 7s are paths (no font dependency). The pulsing dot has class `g3d-pulse` (CSS animation, off under prefers-reduced-motion).
- i18n (EN + LA, Lao not native-reviewed): g3dVariant, g3dVariantHint, g3dVar_real, g3dVar_clay, g3dVar_glossy.
- Tests: tests/g3d-variants-v252.test.js; tests/icons-3d.test.js updated. UI matrix with the 3d pack: `"icons":["classic+3d"]`, `"pre":"currentG3dVariant='clay'"`.
## v253: Names — Session / Match / Bill

User decision (names only, no logic/data/field renames, layout untouched):
- Play day -> EN **Session(s)**, LA **ນັດຫຼິ້ນ** (bottom bar, Create, cards, public/open games, reminders, push).
- One match -> EN **Match(es)**, LA **ແມັດ** (tab, Live score, All matches, stats counts, tournament matches, health). Applies to every scored record, including the games inside a Live-score series ("Best of 3 matches", "MATCH POINT"). Placeholder names such as `{game}` / `{games}` in code are unchanged.
- Money tab inside a session -> EN **Bill**, LA **ບິນ** (`sessionTabBill`; `totalSession` -> "Total bill" / ລວມບິນ).
- Old LA words ເກມ, ເຊດຊັນ, ເຊສຊັ່ນ and the old LA match word ນັດ (badges, All matches, Home, trash) are gone; ນັດ stays only in ນັດຫຼິ້ນ and ມາຕາມນັດ (show-up, other).
- Hardcoded: index.html nav fallback `Games` -> `Sessions`, `Everyone can see this game` -> `session`; push/events.js TEXT en/la (startT, gameJoin/gameFull/gameCancel) use session wording. tests/push-cheap-v250.test.js regexes updated. `tests/names-v253.test.js` guards the names, equal EN/LA key sets and no old word left.
- Not native-reviewed Lao. Strings in LA still using ການແຂ່ງ (tournament / competition) are intentionally unchanged.

Counts of changed keys by class: play-day 67, match 212, bill 2 (total 281 keys, EN and/or LA).

| key | old EN | old LA | new EN | new LA | class |
|---|---|---|---|---|---|
| `loginSubtitle` | Sign in to manage your badminton sessions | ເຂົ້າສູ່ລະບົບເພື່ອຈັດການເກມແບດມິນຕັນ | Sign in to manage your badminton sessions | ເຂົ້າສູ່ລະບົບເພື່ອຈັດການນັດຫຼິ້ນແບດມິນຕັນ | play-day |
| `defaultPayerHint` | Filled in automatically on new sessions, only when that person is playing. | ໃສ່ໃຫ້ອັດຕະໂນມັດໃນເຊສຊັ່ນໃໝ່, ສະເພາະເມື່ອຄົນນັ້ນມາຫຼິ້ນ. | Filled in automatically on new sessions, only when that person is playing. | ໃສ່ໃຫ້ອັດຕະໂນມັດໃນນັດຫຼິ້ນໃໝ່, ສະເພາະເມື່ອຄົນນັ້ນມາຫຼິ້ນ. | play-day |
| `mergeConfirm` | Move all sessions and polls of "{name}" to your account and remove "{name}"? | ຍ້າຍເຊສຊັ່ນ ແລະ ໂຫວດທັງໝົດຂອງ "{name}" ມາບັນຊີຂອງທ່ານ ແລະ ລຶບ "{name}"? | Move all sessions and polls of "{name}" to your account and remove "{name}"? | ຍ້າຍນັດຫຼິ້ນ ແລະ ໂຫວດທັງໝົດຂອງ "{name}" ມາບັນຊີຂອງທ່ານ ແລະ ລຶບ "{name}"? | play-day |
| `editSession` | Edit session | ແກ້ໄຂການຫຼິ້ນ | Edit session | ແກ້ໄຂນັດຫຼິ້ນ | play-day |
| `lbMostActive` | Most active (polls + games + dinner) | ເຄື່ອນໄຫວຫຼາຍສຸດ (ໂຫວດ + ຫຼິ້ນ + ອາຫານ) | Most active (polls + matches + dinner) | ເຄື່ອນໄຫວຫຼາຍສຸດ (ໂຫວດ + ຫຼິ້ນ + ອາຫານ) | match |
| `onbTitle` | Welcome! 3 steps to your first game | ຍິນດີຕ້ອນຮັບ! 3 ຂັ້ນຕອນສູ່ເກມທຳອິດ | Welcome! 3 steps to your first session | ຍິນດີຕ້ອນຮັບ! 3 ຂັ້ນຕອນສູ່ນັດຫຼິ້ນທຳອິດ | play-day |
| `permDesc_editBill` | Bill of anyone's session: court payer, cocks, other costs, dinner & receipt; mark any payment paid | ບິນຂອງທຸກເຊສຊັ່ນ: ຜູ້ຈ່າຍສະໜາມ, ລູກ, ຄ່າອື່ນ, ອາຫານ ແລະ ໃບບິນ; ໝາຍຈ່າຍແລ້ວ | Bill of anyone's session: court payer, cocks, other costs, dinner & receipt; mark any payment paid | ບິນຂອງທຸກນັດຫຼິ້ນ: ຜູ້ຈ່າຍສະໜາມ, ລູກ, ຄ່າອື່ນ, ອາຫານ ແລະ ໃບບິນ; ໝາຍຈ່າຍແລ້ວ | play-day |
| `permDesc_editSession` | Date, time, court and players of anyone's session; delete any session | ວັນທີ, ເວລາ, ສະໜາມ ແລະ ຜູ້ຫຼິ້ນຂອງທຸກເຊສຊັ່ນ; ລຶບເຊສຊັ່ນໃດກໍໄດ້ | Date, time, court and players of anyone's session; delete any session | ວັນທີ, ເວລາ, ສະໜາມ ແລະ ຜູ້ຫຼິ້ນຂອງທຸກນັດຫຼິ້ນ; ລຶບນັດຫຼິ້ນໃດກໍໄດ້ | play-day |
| `permIntro` | Everyone can create polls and sessions and fully manage their own, vote, pay and edit their own profile and QR. Extra permissions let someone manage other people's: | ທຸກຄົນສ້າງໂຫວດ ແລະ ເຊສຊັ່ນ ແລະ ຈັດການຂອງຕົນເອງໄດ້, ໂຫວດ, ຈ່າຍ ແລະ ແກ້ໄຂໂປຣໄຟລ໌/QR ຂອງຕົນ. ສິດເພີ່ມເຕີມເພື່ອຈັດການຂອງຄົນອື່ນ: | Everyone can create polls and sessions and fully manage their own, vote, pay and edit their own profile and QR. Extra permissions let someone manage other people's: | ທຸກຄົນສ້າງໂຫວດ ແລະ ນັດຫຼິ້ນ ແລະ ຈັດການຂອງຕົນເອງໄດ້, ໂຫວດ, ຈ່າຍ ແລະ ແກ້ໄຂໂປຣໄຟລ໌/QR ຂອງຕົນ. ສິດເພີ່ມເຕີມເພື່ອຈັດການຂອງຄົນອື່ນ: | play-day |
| `perm_editSession` | Edit all sessions | ແກ້ໄຂເຊສຊັ່ນທັງໝົດ | Edit all sessions | ແກ້ໄຂນັດຫຼິ້ນທັງໝົດ | play-day |
| `nothingOwed` | You owe nothing for this game | ເກມນີ້ທ່ານບໍ່ຕິດຫຍັງ | You owe nothing for this session | ນັດຫຼິ້ນນີ້ທ່ານບໍ່ຕິດຫຍັງ | play-day |
| `nGameSoon` | Game in 1 hour — {time} at {court}. Get ready! | ອີກ 1 ຊົ່ວໂມງຫຼິ້ນແລ້ວ — {time} ທີ່ {court}. ກຽມພ້ອມ! | Session in 1 hour — {time} at {court}. Get ready! | ອີກ 1 ຊົ່ວໂມງຫຼິ້ນແລ້ວ — {time} ທີ່ {court}. ກຽມພ້ອມ! | play-day |
| `resetButton` | Delete all polls & sessions | ລຶບໂຫວດ ແລະ ເຊສຊັ່ນທັງໝົດ | Delete all polls & sessions | ລຶບໂຫວດ ແລະ ນັດຫຼິ້ນທັງໝົດ | play-day |
| `resetConfirm` | This moves every poll and session to Recently deleted (restorable for 30 days). Continue? | ຈະຍ້າຍທຸກໂຫວດ ແລະ ເຊສຊັ່ນໄປ ລາຍການທີ່ລຶບ (ກູ້ຄືນໄດ້ພາຍໃນ 30 ມື້). ສືບຕໍ່ບໍ? | This moves every poll and session to Recently deleted (restorable for 30 days). Continue? | ຈະຍ້າຍທຸກໂຫວດ ແລະ ນັດຫຼິ້ນໄປ ລາຍການທີ່ລຶບ (ກູ້ຄືນໄດ້ພາຍໃນ 30 ມື້). ສືບຕໍ່ບໍ? | play-day |
| `resetHint` | Before launching, remove all test polls and sessions. Players, courts, cocks, QR codes and settings are kept. This cannot be undone. | ກ່ອນເປີດໃຊ້ຈິງ, ລຶບໂຫວດ ແລະ ເຊສຊັ່ນທົດລອງທັງໝົດ. ຜູ້ຫຼິ້ນ, ສະໜາມ, ລູກ, QR ແລະ ການຕັ້ງຄ່າ ຍັງຢູ່. ກູ້ຄືນບໍ່ໄດ້. | Before launching, remove all test polls and sessions. Players, courts, cocks, QR codes and settings are kept. This cannot be undone. | ກ່ອນເປີດໃຊ້ຈິງ, ລຶບໂຫວດ ແລະ ນັດຫຼິ້ນທົດລອງທັງໝົດ. ຜູ້ຫຼິ້ນ, ສະໜາມ, ລູກ, QR ແລະ ການຕັ້ງຄ່າ ຍັງຢູ່. ກູ້ຄືນບໍ່ໄດ້. | play-day |
| `statPlayed` | Sessions | ເຊສຊັ່ນ | Sessions | ນັດຫຼິ້ນ | play-day |
| `balanceHint` | Unpaid amounts from all sessions, netted between each pair. | ຍອດທີ່ຍັງບໍ່ໄດ້ຈ່າຍຈາກທຸກເຊສຊັ່ນ, ຫັກລົບລະຫວ່າງແຕ່ລະຄູ່. | Unpaid amounts from all sessions, netted between each pair. | ຍອດທີ່ຍັງບໍ່ໄດ້ຈ່າຍຈາກທຸກນັດຫຼິ້ນ, ຫັກລົບລະຫວ່າງແຕ່ລະຄູ່. | play-day |
| `insLineStart` | Play {n} more games to see your trend. | ຫຼິ້ນອີກ {n} ເກມ ເພື່ອເບິ່ງແນວໂນ້ມ. | Play {n} more matches to see your trend. | ຫຼິ້ນອີກ {n} ແມັດ ເພື່ອເບິ່ງແນວໂນ້ມ. | match |
| `insLineStreak` | {n} wins in a row. Keep the same routine. | ຊະນະຕິດ {n} ເກມ. ຮັກສາທຳນຽມເດີມ. | {n} wins in a row. Keep the same routine. | ຊະນະຕິດ {n} ແມັດ. ຮັກສາທຳນຽມເດີມ. | match |
| `insLineTough` | Only {pct} with {name}. Talk about positions before the game. | ຊະນະພຽງ {pct} ກັບ {name}. ລົມກັນເລື່ອງຕຳແໜ່ງກ່ອນເກມ. | Only {pct} with {name}. Talk about positions before the match. | ຊະນະພຽງ {pct} ກັບ {name}. ລົມກັນເລື່ອງຕຳແໜ່ງກ່ອນແມັດ. | match |
| `addGameScore` | Add game score | ເພີ່ມຄະແນນເກມ | Add match score | ເພີ່ມຄະແນນແມັດ | match |
| `insNeedMore` | Play at least {n} games with the same partner to see your best and toughest pair. | ຫຼິ້ນກັບຄູ່ດຽວກັນຢ່າງໜ້ອຍ {n} ເກມ ເພື່ອເບິ່ງຄູ່ທີ່ດີສຸດ ແລະ ຍາກສຸດ. | Play at least {n} matches with the same partner to see your best and toughest pair. | ຫຼິ້ນກັບຄູ່ດຽວກັນຢ່າງໜ້ອຍ {n} ແມັດ ເພື່ອເບິ່ງຄູ່ທີ່ດີສຸດ ແລະ ຍາກສຸດ. | match |
| `tip_best_1` | You and {name} click. Keep this pair for the games that matter. | ທ່ານກັບ {name} ເຂົ້າກັນດີ. ຮັກສາຄູ່ນີ້ໄວ້ສຳລັບເກມສຳຄັນ. | You and {name} click. Keep this pair for the matches that matter. | ທ່ານກັບ {name} ເຂົ້າກັນດີ. ຮັກສາຄູ່ນີ້ໄວ້ສຳລັບແມັດສຳຄັນ. | match |
| `tip_best_3` | You two read each other well. Try a full match together when the stakes are higher. | ສອງທ່ານອ່ານເກມກັນໄດ້ດີ. ລອງຫຼິ້ນເຕັມແມັດນຳກັນເມື່ອເກມສຳຄັນ. | You two read each other well. Try a full match together when the stakes are higher. | ສອງທ່ານອ່ານການຫຼິ້ນກັນໄດ້ດີ. ລອງຫຼິ້ນເຕັມແມັດນຳກັນເມື່ອແມັດສຳຄັນ. | match |
| `tip_worst_1` | Playing with {name} has been hard so far. No pressure: a relaxed practice game, agree who covers front and back, and talk between points. | ການຫຼິ້ນກັບ {name} ຍັງຍາກຢູ່. ບໍ່ຕ້ອງກົດດັນ: ລອງຊ້ອມແບບສະບາຍໆ, ຕົກລົງວ່າໃຜຢູ່ໜ້າ ໃຜຢູ່ຫຼັງ, ແລະ ລົມກັນລະຫວ່າງແຕ່ລະຄະແນນ. | Playing with {name} has been hard so far. No pressure: a relaxed practice match, agree who covers front and back, and talk between points. | ການຫຼິ້ນກັບ {name} ຍັງຍາກຢູ່. ບໍ່ຕ້ອງກົດດັນ: ລອງຊ້ອມແບບສະບາຍໆ, ຕົກລົງວ່າໃຜຢູ່ໜ້າ ໃຜຢູ່ຫຼັງ, ແລະ ລົມກັນລະຫວ່າງແຕ່ລະຄະແນນ. | match |
| `tip_worst_2` | Give the pair with {name} a fresh start: pick one simple plan, like one covers the back and one the front, and keep it for a few games. | ເລີ່ມໃໝ່ກັບ {name}: ເລືອກແຜນງ່າຍໆອັນດຽວ ເຊັ່ນ ຄົນໜຶ່ງຢູ່ຫຼັງ ຄົນໜຶ່ງຢູ່ໜ້າ ແລະ ໃຊ້ມັນສອງສາມເກມ. | Give the pair with {name} a fresh start: pick one simple plan, like one covers the back and one the front, and keep it for a few matches. | ເລີ່ມໃໝ່ກັບ {name}: ເລືອກແຜນງ່າຍໆອັນດຽວ ເຊັ່ນ ຄົນໜຶ່ງຢູ່ຫຼັງ ຄົນໜຶ່ງຢູ່ໜ້າ ແລະ ໃຊ້ມັນສອງສາມແມັດ. | match |
| `tip_worst_4` | Warm up together with {name} for five minutes before the game. Small steps build a pair. | ວອມອັບນຳ {name} ຫ້ານາທີກ່ອນເກມ; ກ້າວນ້ອຍໆສ້າງຄູ່ທີ່ດີ. | Warm up together with {name} for five minutes before the match. Small steps build a pair. | ວອມອັບນຳ {name} ຫ້ານາທີກ່ອນແມັດ; ກ້າວນ້ອຍໆສ້າງຄູ່ທີ່ດີ. | match |
| `tip_both_1` | {name} has been tricky, as a partner and as an opponent. Watch their rhythm and try one new thing each game. | {name} ເປັນຄົນທີ່ຍາກ ທັງເປັນຄູ່ ແລະ ເປັນຄູ່ແຂ່ງ. ເບິ່ງຈັງຫວະຂອງເຂົາ ແລະ ລອງສິ່ງໃໝ່ພຽງຢ່າງດຽວໃນແຕ່ລະເກມ. | {name} has been tricky, as a partner and as an opponent. Watch their rhythm and try one new thing each match. | {name} ເປັນຄົນທີ່ຍາກ ທັງເປັນຄູ່ ແລະ ເປັນຄູ່ແຂ່ງ. ເບິ່ງຈັງຫວະຂອງເຂົາ ແລະ ລອງສິ່ງໃໝ່ພຽງຢ່າງດຽວໃນແຕ່ລະແມັດ. | match |
| `tip_both_2` | Games with {name} are your toughest. Practise together first, then play against them: you will learn their style fast. | ເກມກັບ {name} ຍາກສຸດສຳລັບທ່ານ. ຊ້ອມນຳກັນກ່ອນ ແລ້ວຄ່ອຍແຂ່ງ: ຈະຮູ້ສະໄຕເຂົາໄວ. | Matches with {name} are your toughest. Practise together first, then play against them: you will learn their style fast. | ແມັດກັບ {name} ຍາກສຸດສຳລັບທ່ານ. ຊ້ອມນຳກັນກ່ອນ ແລ້ວຄ່ອຍແຂ່ງ: ຈະຮູ້ສະໄຕເຂົາໄວ. | match |
| `tip_rival_1` | {name} is tough for you. Watch how they play and try just one new thing each game. | {name} ເປັນຄູ່ແຂ່ງທີ່ຍາກ. ເບິ່ງວິທີຫຼິ້ນຂອງເຂົາ ແລະ ລອງສິ່ງໃໝ່ພຽງຢ່າງດຽວໃນແຕ່ລະເກມ. | {name} is tough for you. Watch how they play and try just one new thing each match. | {name} ເປັນຄູ່ແຂ່ງທີ່ຍາກ. ເບິ່ງວິທີຫຼິ້ນຂອງເຂົາ ແລະ ລອງສິ່ງໃໝ່ພຽງຢ່າງດຽວໃນແຕ່ລະແມັດ. | match |
| `tip_rival_4` | Take a note after playing {name}: what worked once? Repeat only that. | ຈົດບັນທຶກຫຼັງເກມກັບ {name}: ອັນໃດໄດ້ຜົນ? ເຮັດຊ້ຳສະເພາະອັນນັ້ນ. | Take a note after playing {name}: what worked once? Repeat only that. | ຈົດບັນທຶກຫຼັງແມັດກັບ {name}: ອັນໃດໄດ້ຜົນ? ເຮັດຊ້ຳສະເພາະອັນນັ້ນ. | match |
| `tip_easy_1` | You are comfortable against {name}. Ask for a harder game: play to 25, or swap partners. | ທ່ານສະບາຍຕອນແຂ່ງກັບ {name}. ຂໍເກມທີ່ຍາກຂຶ້ນ: ຫຼິ້ນຮອດ 25 ຫຼື ສະຫຼັບຄູ່. | You are comfortable against {name}. Ask for a harder match: play to 25, or swap partners. | ທ່ານສະບາຍຕອນແຂ່ງກັບ {name}. ຂໍແມັດທີ່ຍາກຂຶ້ນ: ຫຼິ້ນຮອດ 25 ຫຼື ສະຫຼັບຄູ່. | match |
| `tip_easy_2` | You often beat {name}. Use those games to try new shots you are not sure about yet. | ທ່ານຊະນະ {name} ເລື້ອຍໆ. ໃຊ້ເກມເຫຼົ່ານັ້ນລອງລູກຕີໃໝ່ທີ່ຍັງບໍ່ໝັ້ນໃຈ. | You often beat {name}. Use those matches to try new shots you are not sure about yet. | ທ່ານຊະນະ {name} ເລື້ອຍໆ. ໃຊ້ແມັດເຫຼົ່ານັ້ນລອງລູກຕີໃໝ່ທີ່ຍັງບໍ່ໝັ້ນໃຈ. | match |
| `tip_easy_3` | Against {name} you are ahead. Share a tip with them: teaching sharpens your own game. | ກັບ {name} ທ່ານນຳຢູ່. ແບ່ງປັນເຄັດລັບໃຫ້ເຂົາ, ການສອນຊ່ວຍໃຫ້ເກມຂອງທ່ານແໜ້ນຂຶ້ນ. | Against {name} you are ahead. Share a tip with them: teaching sharpens your own play. | ກັບ {name} ທ່ານນຳຢູ່. ແບ່ງປັນເຄັດລັບໃຫ້ເຂົາ, ການສອນຊ່ວຍໃຫ້ການຫຼິ້ນຂອງທ່ານແໜ້ນຂຶ້ນ. | match |
| `tip_close_1` | Many of your games are close. Practise the end of a game (18–20): stay calm, serve safe, keep the shuttle low. | ຫຼາຍເກມຂອງທ່ານສູ້ກັນໃກ້ຊິດ. ຝຶກຕອນທ້າຍເກມ (18–20): ໃຈເຢັນ, ເສີບໃຫ້ປອດໄພ, ຮັກສາລູກໃຫ້ຕ່ຳ. | Many of your matches are close. Practise the end of a match (18–20): stay calm, serve safe, keep the shuttle low. | ຫຼາຍແມັດຂອງທ່ານສູ້ກັນໃກ້ຊິດ. ຝຶກຕອນທ້າຍແມັດ (18–20): ໃຈເຢັນ, ເສີບໃຫ້ປອດໄພ, ຮັກສາລູກໃຫ້ຕ່ຳ. | match |
| `tip_close_2` | Close games decide a lot. At 18 all, take a breath, slow down between points and play your safest shot. | ເກມໃກ້ຊິດຕັດສິນຫຼາຍຢ່າງ. ຕອນ 18 ເທົ່າ ຫາຍໃຈເຂົ້າເລິກໆ, ຊ້າລົງລະຫວ່າງຄະແນນ, ແລະ ຕີລູກທີ່ປອດໄພທີ່ສຸດ. | Close matches decide a lot. At 18 all, take a breath, slow down between points and play your safest shot. | ແມັດໃກ້ຊິດຕັດສິນຫຼາຍຢ່າງ. ຕອນ 18 ເທົ່າ ຫາຍໃຈເຂົ້າເລິກໆ, ຊ້າລົງລະຫວ່າງຄະແນນ, ແລະ ຕີລູກທີ່ປອດໄພທີ່ສຸດ. | match |
| `tip_close_3` | Your games are tight; one extra point per game changes the result. Work on a steady serve and return. | ເກມຂອງທ່ານສູ້ກັນໃກ້ຊິດ; ເພີ່ມອີກໜຶ່ງຄະແນນຕໍ່ເກມກໍປ່ຽນຜົນ. ຝຶກເສີບ ແລະ ຮັບເສີບໃຫ້ສະໝ່ຳສະເໝີ. | Your matches are tight; one extra point per match changes the result. Work on a steady serve and return. | ແມັດຂອງທ່ານສູ້ກັນໃກ້ຊິດ; ເພີ່ມອີກໜຶ່ງຄະແນນຕໍ່ແມັດກໍປ່ຽນຜົນ. ຝຶກເສີບ ແລະ ຮັບເສີບໃຫ້ສະໝ່ຳສະເໝີ. | match |
| `tip_blowout_1` | Some games get away early. Start fast: warm up well and be ready for the first rally. | ບາງເກມຫຼຸດໄວຕັ້ງແຕ່ຕົ້ນ. ເລີ່ມໃຫ້ໄວ: ວອມອັບໃຫ້ດີ ແລະ ພ້ອມຕັ້ງແຕ່ເສັ້ນທຳອິດ. | Some matches get away early. Start fast: warm up well and be ready for the first rally. | ບາງແມັດຫຼຸດໄວຕັ້ງແຕ່ຕົ້ນ. ເລີ່ມໃຫ້ໄວ: ວອມອັບໃຫ້ດີ ແລະ ພ້ອມຕັ້ງແຕ່ເສັ້ນທຳອິດ. | match |
| `tip_rest_1` | A short losing run happens to everyone. Rest, drink water, warm up well; the next game is a fresh start. | ແພ້ຕິດກັນສັ້ນໆເກີດກັບທຸກຄົນ. ພັກ, ດື່ມນ້ຳ, ວອມອັບໃຫ້ດີ; ເກມຕໍ່ໄປເລີ່ມໃໝ່. | A short losing run happens to everyone. Rest, drink water, warm up well; the next match is a fresh start. | ແພ້ຕິດກັນສັ້ນໆເກີດກັບທຸກຄົນ. ພັກ, ດື່ມນ້ຳ, ວອມອັບໃຫ້ດີ; ແມັດຕໍ່ໄປເລີ່ມໃໝ່. | match |
| `tip_rest_2` | Two losses in a row: take a longer break, stretch, and change one small thing in the next game. | ແພ້ສອງເກມຕິດ: ພັກດົນຂຶ້ນ, ຍືດເສັ້ນ, ແລະ ປ່ຽນສິ່ງນ້ອຍໆອັນໜຶ່ງໃນເກມຕໍ່ໄປ. | Two losses in a row: take a longer break, stretch, and change one small thing in the next match. | ແພ້ສອງແມັດຕິດ: ພັກດົນຂຶ້ນ, ຍືດເສັ້ນ, ແລະ ປ່ຽນສິ່ງນ້ອຍໆອັນໜຶ່ງໃນແມັດຕໍ່ໄປ. | match |
| `tip_rest_3` | Do not chase the loss. Sit one game out, then come back relaxed. | ຢ່າໄລ່ຕາມເກມທີ່ແພ້. ນັ່ງພັກໜຶ່ງເກມ ແລ້ວກັບມາຢ່າງສະບາຍ. | Do not chase the loss. Sit one match out, then come back relaxed. | ຢ່າໄລ່ຕາມແມັດທີ່ແພ້. ນັ່ງພັກໜຶ່ງແມັດ ແລ້ວກັບມາຢ່າງສະບາຍ. | match |
| `tip_great_2` | You win most of your games. Challenge yourself: play with the weaker side now and then to grow your skills. | ທ່ານຊະນະສ່ວນໃຫຍ່. ທ້າທາຍຕົນເອງ: ບາງເທື່ອຫຼິ້ນກັບຝ່າຍທີ່ອ່ອນກວ່າເພື່ອພັດທະນາທັກສະ. | You win most of your matches. Challenge yourself: play with the weaker side now and then to grow your skills. | ທ່ານຊະນະສ່ວນໃຫຍ່. ທ້າທາຍຕົນເອງ: ບາງເທື່ອຫຼິ້ນກັບຝ່າຍທີ່ອ່ອນກວ່າເພື່ອພັດທະນາທັກສະ. | match |
| `tip_few_1` | Play a few more games and the tips here will get sharper. | ຫຼິ້ນອີກຈັກເກມ ຄຳແນະນຳຢູ່ນີ້ຈະແມ່ນຍຳຂຶ້ນ. | Play a few more matches and the tips here will get sharper. | ຫຼິ້ນອີກຈັກແມັດ ຄຳແນະນຳຢູ່ນີ້ຈະແມ່ນຍຳຂຶ້ນ. | match |
| `tip_few_2` | Only a few games so far. Try different partners to see what works. | ມີບໍ່ຫຼາຍເກມເທື່ອ. ລອງຫຼິ້ນກັບຄູ່ຕ່າງໆເພື່ອເບິ່ງວ່າແບບໃດໄດ້ຜົນ. | Only a few matches so far. Try different partners to see what works. | ມີບໍ່ຫຼາຍແມັດເທື່ອ. ລອງຫຼິ້ນກັບຄູ່ຕ່າງໆເພື່ອເບິ່ງວ່າແບບໃດໄດ້ຜົນ. | match |
| `tip_mix_1` | Try a few games with different partners to find who suits your style. | ລອງຫຼິ້ນກັບຄູ່ຫຼາຍຄົນ ເພື່ອຊອກຫາຄົນທີ່ເຂົ້າກັບສະໄຕຂອງທ່ານ. | Try a few matches with different partners to find who suits your style. | ລອງຫຼິ້ນກັບຄູ່ຫຼາຍຄົນ ເພື່ອຊອກຫາຄົນທີ່ເຂົ້າກັບສະໄຕຂອງທ່ານ. | match |
| `tip_mix_2` | Not enough games with the same partner yet. Rotate partners and see who you enjoy most. | ຍັງມີເກມກັບຄູ່ດຽວກັນບໍ່ພໍ. ສະຫຼັບຄູ່ ແລະ ເບິ່ງວ່າຫຼິ້ນກັບໃຜມ່ວນທີ່ສຸດ. | Not enough matches with the same partner yet. Rotate partners and see who you enjoy most. | ຍັງມີແມັດກັບຄູ່ດຽວກັນບໍ່ພໍ. ສະຫຼັບຄູ່ ແລະ ເບິ່ງວ່າຫຼິ້ນກັບໃຜມ່ວນທີ່ສຸດ. | match |
| `tip_mix_3` | Mix partners for a while; your best pair shows up with more games. | ສະຫຼັບຄູ່ໄປກ່ອນ; ຄູ່ທີ່ດີທີ່ສຸດຈະປາກົດເມື່ອມີເກມຫຼາຍຂຶ້ນ. | Mix partners for a while; your best pair shows up with more matches. | ສະຫຼັບຄູ່ໄປກ່ອນ; ຄູ່ທີ່ດີທີ່ສຸດຈະປາກົດເມື່ອມີແມັດຫຼາຍຂຶ້ນ. | match |
| `tip_gen_3` | Drink water every game, not only when you are thirsty. | ດື່ມນ້ຳທຸກເກມ ບໍ່ແມ່ນລໍຖ້າຫິວ. | Drink water every match, not only when you are thirsty. | ດື່ມນ້ຳທຸກແມັດ ບໍ່ແມ່ນລໍຖ້າຫິວ. | match |
| `tip_gen_6` | After the game, stretch your legs for two minutes. It helps the next game. | ຫຼັງເກມ ຍືດຂາສອງນາທີ. ຊ່ວຍໃຫ້ເກມຕໍ່ໄປດີຂຶ້ນ. | After the match, stretch your legs for two minutes. It helps the next match. | ຫຼັງແມັດ ຍືດຂາສອງນາທີ. ຊ່ວຍໃຫ້ແມັດຕໍ່ໄປດີຂຶ້ນ. | match |
| `gamesDots` | {n} games (one dot each) | {n} ເກມ (ຈຸດລະເກມ) | {n} matches (one dot each) | {n} ແມັດ (ຈຸດລະແມັດ) | match |
| `editMultiGame` | This match has several games and cannot be edited here. Delete it and add the games again. | ການແຂ່ງຂັນນີ້ມີຫຼາຍເກມ ແກ້ໄຂບ່ອນນີ້ບໍ່ໄດ້. ລຶບແລ້ວເພີ່ມເກມໃໝ່. | This entry has several matches and cannot be edited here. Delete it and add the matches again. | ລາຍການນີ້ມີຫຼາຍແມັດ ແກ້ໄຂບ່ອນນີ້ບໍ່ໄດ້. ລຶບແລ້ວເພີ່ມແມັດໃໝ່. | match |
| `newSession` | New session | ເຊສຊັ່ນໃໝ່ | New session | ນັດຫຼິ້ນໃໝ່ | play-day |
| `openSession` | Open session | ເປີດເຊສຊັ່ນ | Open session | ເປີດນັດຫຼິ້ນ | play-day |
| `pollNotePlaceholder` | e.g. Friday game, bring your own racket | ເຊັ່ນ: ເກມວັນສຸກ, ເອົາໄມ້ມາເອງ | e.g. Friday session, bring your own racket | ເຊັ່ນ: ນັດຫຼິ້ນວັນສຸກ, ເອົາໄມ້ມາເອງ | play-day |
| `sessionNotFound` | Session not found | ບໍ່ພົບເຊສຊັ່ນ | Session not found | ບໍ່ພົບນັດຫຼິ້ນ | play-day |
| `sessionsWord` | Sessions | ເຊສຊັ່ນ | Sessions | ນັດຫຼິ້ນ | play-day |
| `unpaidSessions` | Sessions with unpaid amounts | ເຊສຊັ່ນທີ່ຍັງຄ້າງຈ່າຍ | Sessions with unpaid amounts | ນັດຫຼິ້ນທີ່ຍັງຄ້າງຈ່າຍ | play-day |
| `lsTestAgain` | New practice game | ເກມລອງໃໝ່ | New practice match | ແມັດລອງໃໝ່ | match |
| `subF1` | Votes, games and sessions for your group | ໂຫວດ, ເກມ ແລະ ເຊດຊັນ ສຳລັບກຸ່ມຂອງທ່ານ | Votes, matches and sessions for your group | ໂຫວດ, ແມັດ ແລະ ນັດຫຼິ້ນ ສຳລັບກຸ່ມຂອງທ່ານ | match |
| `subF5` | Public games, friends and market | ເກມສາທາລະນະ, ໝູ່ ແລະ ຕະຫຼາດ | Public sessions, friends and market | ນັດຫຼິ້ນສາທາລະນະ, ໝູ່ ແລະ ຕະຫຼາດ | play-day |
| `tourStartBody` | The app draws {g} mix games for {n} players now. Everyone plays {k} games. About {est}. You can cancel it later and play normal games. | ແອັບຈະຈັດ {g} ເກມປະສົມ ສຳລັບ {n} ຄົນ ດຽວນີ້. ທຸກຄົນຫຼິ້ນ {k} ເກມ. ປະມານ {est}. ຍົກເລີກໄດ້ພາຍຫຼັງ ແລ້ວຫຼິ້ນແບບປົກກະຕິ. | The app draws {g} mix matches for {n} players now. Everyone plays {k} matches. About {est}. You can cancel it later and play normal matches. | ແອັບຈະຈັດ {g} ແມັດປະສົມ ສຳລັບ {n} ຄົນ ດຽວນີ້. ທຸກຄົນຫຼິ້ນ {k} ແມັດ. ປະມານ {est}. ຍົກເລີກໄດ້ພາຍຫຼັງ ແລ້ວຫຼິ້ນແບບປົກກະຕິ. | match |
| `tourBtnPlay` | Play game {k} of {g} | ຫຼິ້ນເກມທີ {k} ຈາກ {g} | Play match {k} of {g} | ຫຼິ້ນແມັດທີ {k} ຈາກ {g} | match |
| `tourSumTitle` | Rotation done: {g} games | ຈົບຮອບໝູນວຽນ: {g} ເກມ | Rotation done: {g} matches | ຈົບຮອບໝູນວຽນ: {g} ແມັດ | match |
| `tourDrawingTeams` | Drawing players and games… | ກຳລັງສຸ່ມຜູ້ຫຼິ້ນ ແລະ ເກມ… | Drawing players and matches… | ກຳລັງສຸ່ມຜູ້ຫຼິ້ນ ແລະ ແມັດ… | match |
| `tourTeamsDrawn` | Teams drawn. {g} rotation games are ready. | ສຸ່ມແລ້ວ. ມີ {g} ເກມໝູນວຽນພ້ອມແລ້ວ. | Teams drawn. {g} rotation matches are ready. | ສຸ່ມແລ້ວ. ມີ {g} ແມັດໝູນວຽນພ້ອມແລ້ວ. | match |
| `tourLineRot` | Rotation · {k} of {g} games | ໝູນວຽນ · {k} ຈາກ {g} ເກມ | Rotation · {k} of {g} matches | ໝູນວຽນ · {k} ຈາກ {g} ແມັດ | match |
| `tourLinePlay` | Playoff · {k} games played | ຮອບຕັດສິນ · ຫຼິ້ນແລ້ວ {k} ເກມ | Playoff · {k} matches played | ຮອບຕັດສິນ · ຫຼິ້ນແລ້ວ {k} ແມັດ | match |
| `tourLineDone` | Tournament · done, {k} games | ການແຂ່ງຂັນ · ຈົບແລ້ວ, {k} ເກມ | Tournament · done, {k} matches | ການແຂ່ງຂັນ · ຈົບແລ້ວ, {k} ແມັດ | match |
| `tourFinalG` | Final · game {n} | ຮອບຊິງ · ເກມ {n} | Final · match {n} | ຮອບຊິງ · ແມັດ {n} | match |
| `tourGame` | Game {k} | ເກມທີ {k} | Match {k} | ແມັດທີ {k} | match |
| `tourWarnPairs` | This changes the pairs to {pairs}. {k} playoff games will be cleared and replayed. | ນີ້ຈະປ່ຽນຄູ່ເປັນ {pairs}. ເກມຮອບຕັດສິນ {k} ເກມຈະຖືກລ້າງ ແລະ ຫຼິ້ນໃໝ່. | This changes the pairs to {pairs}. {k} playoff matches will be cleared and replayed. | ນີ້ຈະປ່ຽນຄູ່ເປັນ {pairs}. ແມັດຮອບຕັດສິນ {k} ແມັດຈະຖືກລ້າງ ແລະ ຫຼິ້ນໃໝ່. | match |
| `tourWarnFinal` | This changes the final series. Later final games will be cleared and replayed. | ນີ້ປ່ຽນຜົນຮອບຊິງ. ເກມຮອບຊິງທີ່ຕາມມາຈະຖືກລ້າງ ແລະ ຫຼິ້ນໃໝ່. | This changes the final series. Later final matches will be cleared and replayed. | ນີ້ປ່ຽນຜົນຮອບຊິງ. ແມັດຮອບຊິງທີ່ຕາມມາຈະຖືກລ້າງ ແລະ ຫຼິ້ນໃໝ່. | match |
| `tourWarnThird` | This changes the 3rd place series. Later 3rd place games and the final will be cleared and replayed. | ນີ້ປ່ຽນຜົນຊິງອັນດັບ 3. ເກມຊິງອັນດັບ 3 ທີ່ຫຼິ້ນພາຍຫຼັງ ແລະ ຮອບຊິງ ຈະຖືກລຶບ ແລະ ຫຼິ້ນໃໝ່. | This changes the 3rd place series. Later 3rd place matches and the final will be cleared and replayed. | ນີ້ປ່ຽນຜົນຊິງອັນດັບ 3. ແມັດຊິງອັນດັບ 3 ທີ່ຫຼິ້ນພາຍຫຼັງ ແລະ ຮອບຊິງ ຈະຖືກລຶບ ແລະ ຫຼິ້ນໃໝ່. | match |
| `tourRotTitle` | 1 · Rotation, random partners (games {a}–{b}) | 1 · ໝູນວຽນ, ຄູ່ສຸ່ມ (ເກມ {a}–{b}) | 1 · Rotation, random partners (matches {a}–{b}) | 1 · ໝູນວຽນ, ຄູ່ສຸ່ມ (ແມັດ {a}–{b}) | match |
| `tourRestHint` | Filled = plays, empty = rests. Everyone plays {p} games and rests {r}. Nobody rests more than {mr} in a row or plays more than {mp} in a row. | ສີເຕັມ = ຫຼິ້ນ, ວ່າງ = ພັກ. ທຸກຄົນຫຼິ້ນ {p} ເກມ ແລະ ພັກ {r} ເກມ. ບໍ່ມີໃຜພັກຕິດກັນເກີນ {mr} ເກມ ຫຼື ຫຼິ້ນຕິດກັນເກີນ {mp} ເກມ. | Filled = plays, empty = rests. Everyone plays {p} matches and rests {r}. Nobody rests more than {mr} in a row or plays more than {mp} in a row. | ສີເຕັມ = ຫຼິ້ນ, ວ່າງ = ພັກ. ທຸກຄົນຫຼິ້ນ {p} ແມັດ ແລະ ພັກ {r} ແມັດ. ບໍ່ມີໃຜພັກຕິດກັນເກີນ {mr} ແມັດ ຫຼື ຫຼິ້ນຕິດກັນເກີນ {mp} ແມັດ. | match |
| `tourFinalBo3` | Final · best of 3 | ຮອບຊິງ · ດີທີ່ສຸດ 3 ເກມ | Final · best of 3 | ຮອບຊິງ · ດີທີ່ສຸດ 3 ແມັດ | match |
| `tourFirstTo2` | first to 2 wins | ໄດ້ 2 ເກມກ່ອນຊະນະ | first to 2 wins | ໄດ້ 2 ແມັດກ່ອນຊະນະ | match |
| `tourThirdTitle` | 3rd place · 1 game | ອັນດັບ 3 · 1 ເກມ | 3rd place · 1 match | ອັນດັບ 3 · 1 ແມັດ | match |
| `tourPlayoffGames` | 3 · Playoff (games {a}–{b}) | 3 · ຮອບຕັດສິນ (ເກມ {a}–{b}) | 3 · Playoff (matches {a}–{b}) | 3 · ຮອບຕັດສິນ (ແມັດ {a}–{b}) | match |
| `tourHow8` | The four pairs are drawn into two semis. Losers play one game for 3rd. Winners play the final, best of 3: the first pair to 2 wins is champion. A 2–0 final saves a game. | ສີ່ຄູ່ຖືກສຸ່ມເຂົ້າສອງຮອບຮອງ. ຜູ້ແພ້ຫຼິ້ນ 1 ເກມເພື່ອອັນດັບ 3. ຜູ້ຊະນະຫຼິ້ນຮອບຊິງ ດີທີ່ສຸດ 3 ເກມ: ຄູ່ທີ່ໄດ້ 2 ເກມກ່ອນເປັນແຊ້ມ. ຖ້າຊະນະ 2–0 ຈະປະຢັດ 1 ເກມ. | The four pairs are drawn into two semis. Losers play one match for 3rd. Winners play the final, best of 3: the first pair to 2 wins is champion. A 2–0 final saves a match. | ສີ່ຄູ່ຖືກສຸ່ມເຂົ້າສອງຮອບຮອງ. ຜູ້ແພ້ຫຼິ້ນ 1 ແມັດເພື່ອອັນດັບ 3. ຜູ້ຊະນະຫຼິ້ນຮອບຊິງ ດີທີ່ສຸດ 3 ແມັດ: ຄູ່ທີ່ໄດ້ 2 ແມັດກ່ອນເປັນແຊ້ມ. ຖ້າຊະນະ 2–0 ຈະປະຢັດ 1 ແມັດ. | match |
| `tourHowRR` | Round robin. Each pair plays the other 2 pairs. Most wins is champion. A tie goes by point diff, then the game between them. | ແຂ່ງໝູນວຽນ. ແຕ່ລະຄູ່ຫຼິ້ນກັບອີກ 2 ຄູ່. ຊະນະຫຼາຍສຸດເປັນແຊ້ມ. ຖ້າເທົ່າກັນ ໃຊ້ຄະແນນຕ່າງ, ແລ້ວເກມທີ່ພົບກັນ. | Round robin. Each pair plays the other 2 pairs. Most wins is champion. A tie goes by point diff, then the match between them. | ແຂ່ງໝູນວຽນ. ແຕ່ລະຄູ່ຫຼິ້ນກັບອີກ 2 ຄູ່. ຊະນະຫຼາຍສຸດເປັນແຊ້ມ. ຖ້າເທົ່າກັນ ໃຊ້ຄະແນນຕ່າງ, ແລ້ວແມັດທີ່ພົບກັນ. | match |
| `tourOutBody` | {pair} leaves the tournament. Their opponents win every game still to play by walkover (W/O, 21–0). Games already played stay. | {pair} ອອກຈາກການແຂ່ງຂັນ. ຄູ່ແຂ່ງຊະນະທຸກເກມທີ່ເຫຼືອໂດຍບໍ່ຕ້ອງແຂ່ງ (W/O, 21–0). ເກມທີ່ແຂ່ງແລ້ວຍັງຢູ່. | {pair} leaves the tournament. Their opponents win every match still to play by walkover (W/O, 21–0). Matches already played stay. | {pair} ອອກຈາກການແຂ່ງຂັນ. ຄູ່ແຂ່ງຊະນະທຸກແມັດທີ່ເຫຼືອໂດຍບໍ່ຕ້ອງແຂ່ງ (W/O, 21–0). ແມັດທີ່ແຂ່ງແລ້ວຍັງຢູ່. | match |
| `tourOutUndoBody` | The walkovers given because of {pair} are cleared and those games are open again. | W/O ທີ່ໃຫ້ເພາະ {pair} ຈະຖືກລຶບ ແລະ ເກມເຫຼົ່ານັ້ນເປີດໃໝ່. | The walkovers given because of {pair} are cleared and those matches are open again. | W/O ທີ່ໃຫ້ເພາະ {pair} ຈະຖືກລຶບ ແລະ ແມັດເຫຼົ່ານັ້ນເປີດໃໝ່. | match |
| `tourOutUndoLoses` | {k} game(s) played after them are cleared too. | ເກມທີ່ແຂ່ງຫຼັງຈາກນັ້ນ {k} ເກມ ຖືກລຶບນຳ. | {k} match(es) played after them are cleared too. | ແມັດທີ່ແຂ່ງຫຼັງຈາກນັ້ນ {k} ແມັດ ຖືກລຶບນຳ. | match |
| `tourSubNone` | Nobody is free to step in. This game becomes a walkover (W/O). | ບໍ່ມີໃຜວ່າງຫຼິ້ນແທນ. ເກມນີ້ເປັນ W/O. | Nobody is free to step in. This match becomes a walkover (W/O). | ບໍ່ມີໃຜວ່າງຫຼິ້ນແທນ. ແມັດນີ້ເປັນ W/O. | match |
| `tourSubOne` | This game only | ເກມນີ້ເທົ່ານັ້ນ | This match only | ແມັດນີ້ເທົ່ານັ້ນ | match |
| `tourSubAll` | All of {name}'s games left | ທຸກເກມທີ່ເຫຼືອຂອງ {name} | All of {name}'s matches left | ທຸກແມັດທີ່ເຫຼືອຂອງ {name} | match |
| `tourSubAskAll` | {from} is out ({why}). {to} plays this game, and the app picks a stand-in for {from}'s other games ({k} in all). These games count for whoever plays them, in the tournament table, Rankings and Elo. | {from} ອອກ ({why}). {to} ຫຼິ້ນເກມນີ້, ແອັບເລືອກຄົນແທນໃນເກມອື່ນຂອງ {from} ({k} ເກມ). ເກມເຫຼົ່ານີ້ນັບໃຫ້ຄົນທີ່ຫຼິ້ນ ໃນຕາຕະລາງ, ອັນດັບ ແລະ Elo. | {from} is out ({why}). {to} plays this match, and the app picks a stand-in for {from}'s other matches ({k} in all). These matches count for whoever plays them, in the tournament table, Rankings and Elo. | {from} ອອກ ({why}). {to} ຫຼິ້ນແມັດນີ້, ແອັບເລືອກຄົນແທນໃນແມັດອື່ນຂອງ {from} ({k} ແມັດ). ແມັດເຫຼົ່ານີ້ນັບໃຫ້ຄົນທີ່ຫຼິ້ນ ໃນຕາຕະລາງ, ອັນດັບ ແລະ Elo. | match |
| `tourSubAskOne` | {to} plays this game for {from}. It counts for {to} in the tournament table, Rankings and Elo. | {to} ຫຼິ້ນເກມນີ້ແທນ {from}. ນັບໃຫ້ {to} ໃນຕາຕະລາງ, ອັນດັບ ແລະ Elo. | {to} plays this match for {from}. It counts for {to} in the tournament table, Rankings and Elo. | {to} ຫຼິ້ນແມັດນີ້ແທນ {from}. ນັບໃຫ້ {to} ໃນຕາຕະລາງ, ອັນດັບ ແລະ Elo. | match |
| `tourSubAskWoT` | Walkover for {from}'s game? | W/O ສຳລັບເກມຂອງ {from} ບໍ? | Walkover for {from}'s match? | W/O ສຳລັບແມັດຂອງ {from} ບໍ? | match |
| `tourSubAskWo` | {from} is out ({why}) and nobody is free to step in. The other team wins this game by walkover (W/O, 21–0). | {from} ອອກ ({why}) ແລະ ບໍ່ມີໃຜວ່າງຫຼິ້ນແທນ. ອີກທີມຊະນະເກມນີ້ໂດຍ W/O (21–0). | {from} is out ({why}) and nobody is free to step in. The other team wins this match by walkover (W/O, 21–0). | {from} ອອກ ({why}) ແລະ ບໍ່ມີໃຜວ່າງຫຼິ້ນແທນ. ອີກທີມຊະນະແມັດນີ້ໂດຍ W/O (21–0). | match |
| `tourSubFail` | This player cannot be replaced now. The game may have changed. | ປ່ຽນຜູ້ຫຼິ້ນນີ້ຕອນນີ້ບໍ່ໄດ້. ເກມອາດປ່ຽນແລ້ວ. | This player cannot be replaced now. The match may have changed. | ປ່ຽນຜູ້ຫຼິ້ນນີ້ຕອນນີ້ບໍ່ໄດ້. ແມັດອາດປ່ຽນແລ້ວ. | match |
| `pollSwapFail` | The session was saved, but the poll could not be updated. | ບັນທຶກເຊດຊັນແລ້ວ, ແຕ່ອັບເດດໂພລບໍ່ໄດ້. | The session was saved, but the poll could not be updated. | ບັນທຶກນັດຫຼິ້ນແລ້ວ, ແຕ່ອັບເດດໂພລບໍ່ໄດ້. | play-day |
| `tourSwapDone` | {to} takes {from}'s place in the games still to play. | {to} ເຂົ້າແທນ {from} ໃນເກມທີ່ຍັງບໍ່ໄດ້ຫຼິ້ນ. | {to} takes {from}'s place in the matches still to play. | {to} ເຂົ້າແທນ {from} ໃນແມັດທີ່ຍັງບໍ່ໄດ້ຫຼິ້ນ. | match |
| `tourPlayersBody` | This session has a tournament running, and more than one player changed (or the number of players changed). The tournament needs the same players in every game. Cancel the tournament and play normal games, or keep the old player list. | ເຊດຊັນນີ້ມີການແຂ່ງຂັນຢູ່ ແລະ ມີຜູ້ຫຼິ້ນປ່ຽນຫຼາຍກວ່າໜຶ່ງຄົນ (ຫຼື ຈຳນວນຜູ້ຫຼິ້ນປ່ຽນ). ການແຂ່ງຂັນຕ້ອງໃຊ້ຜູ້ຫຼິ້ນຄືເກົ່າທຸກເກມ. ຍົກເລີກການແຂ່ງຂັນແລ້ວຫຼິ້ນປົກກະຕິ, ຫຼື ຮັກສາລາຍຊື່ຜູ້ຫຼິ້ນເກົ່າ. | This session has a tournament running, and more than one player changed (or the number of players changed). The tournament needs the same players in every match. Cancel the tournament and play normal matches, or keep the old player list. | ນັດຫຼິ້ນນີ້ມີການແຂ່ງຂັນຢູ່ ແລະ ມີຜູ້ຫຼິ້ນປ່ຽນຫຼາຍກວ່າໜຶ່ງຄົນ (ຫຼື ຈຳນວນຜູ້ຫຼິ້ນປ່ຽນ). ການແຂ່ງຂັນຕ້ອງໃຊ້ຜູ້ຫຼິ້ນຄືເກົ່າທຸກແມັດ. ຍົກເລີກການແຂ່ງຂັນແລ້ວຫຼິ້ນປົກກະຕິ, ຫຼື ຮັກສາລາຍຊື່ຜູ້ຫຼິ້ນເກົ່າ. | match |
| `tourSubRow` | {name} plays {k} in a row | {name} ຫຼິ້ນຕິດກັນ {k} ເກມ | {name} plays {k} in a row | {name} ຫຼິ້ນຕິດກັນ {k} ແມັດ | match |
| `tourBackInBody` | {name} plays the games not played yet. The stand-ins and walkovers of those games are cleared. | {name} ຫຼິ້ນເກມທີ່ຍັງບໍ່ໄດ້ຫຼິ້ນ. ຄົນແທນ ແລະ W/O ຂອງເກມເຫຼົ່ານັ້ນຈະຖືກລຶບ. | {name} plays the matches not played yet. The stand-ins and walkovers of those matches are cleared. | {name} ຫຼິ້ນແມັດທີ່ຍັງບໍ່ໄດ້ຫຼິ້ນ. ຄົນແທນ ແລະ W/O ຂອງແມັດເຫຼົ່ານັ້ນຈະຖືກລຶບ. | match |
| `hofEmpty` | No champions yet. When a tournament in a session is finished, the winners are kept here, even if the session is deleted later. | ຍັງບໍ່ມີແຊ໊ມ. ເມື່ອການແຂ່ງຂັນໃນເຊດຊັນຈົບ ຜູ້ຊະນະຈະຖືກເກັບໄວ້ທີ່ນີ້ ເຖິງແມ່ນເຊດຊັນຖືກລຶບພາຍຫຼັງ. | No champions yet. When a tournament in a session is finished, the winners are kept here, even if the session is deleted later. | ຍັງບໍ່ມີແຊ໊ມ. ເມື່ອການແຂ່ງຂັນໃນນັດຫຼິ້ນຈົບ ຜູ້ຊະນະຈະຖືກເກັບໄວ້ທີ່ນີ້ ເຖິງແມ່ນນັດຫຼິ້ນຖືກລຶບພາຍຫຼັງ. | play-day |
| `hofRemoveBody` | The champions are no longer listed here. The session is not changed. | ແຊ໊ມຈະບໍ່ຖືກສະແດງຢູ່ນີ້ອີກ. ເຊດຊັນບໍ່ປ່ຽນ. | The champions are no longer listed here. The session is not changed. | ແຊ໊ມຈະບໍ່ຖືກສະແດງຢູ່ນີ້ອີກ. ນັດຫຼິ້ນບໍ່ປ່ຽນ. | play-day |
| `hofLocalNote` | Some results are shown from your sessions or from this phone. They are kept in the Hall of fame for everyone once they are saved. | ບາງຜົນສະແດງຈາກເຊດຊັນຂອງທ່ານ ຫຼື ຈາກໂທລະສັບເຄື່ອງນີ້. ຈະຖືກເກັບໃນຫໍກຽດຕິຍົດໃຫ້ທຸກຄົນເມື່ອບັນທຶກສຳເລັດ. | Some results are shown from your sessions or from this phone. They are kept in the Hall of fame for everyone once they are saved. | ບາງຜົນສະແດງຈາກນັດຫຼິ້ນຂອງທ່ານ ຫຼື ຈາກໂທລະສັບເຄື່ອງນີ້. ຈະຖືກເກັບໃນຫໍກຽດຕິຍົດໃຫ້ທຸກຄົນເມື່ອບັນທຶກສຳເລັດ. | play-day |
| `tourResetBody` | The drawn games and all tournament scores are deleted. The session goes back to normal games, and you can start a tournament again later. | ເກມທີ່ສຸ່ມ ແລະ ຄະແນນການແຂ່ງຂັນທັງໝົດຈະຖືກລຶບ. ເຊດຊັນກັບໄປເປັນເກມປົກກະຕິ ແລະ ເລີ່ມການແຂ່ງຂັນໃໝ່ໄດ້ພາຍຫຼັງ. | The drawn matches and all tournament scores are deleted. The session goes back to normal matches, and you can start a tournament again later. | ແມັດທີ່ສຸ່ມ ແລະ ຄະແນນການແຂ່ງຂັນທັງໝົດຈະຖືກລຶບ. ນັດຫຼິ້ນກັບໄປເປັນແມັດປົກກະຕິ ແລະ ເລີ່ມການແຂ່ງຂັນໃໝ່ໄດ້ພາຍຫຼັງ. | match |
| `tourHow2` | 2. Play the rotation games and type each score. | 2. ຫຼິ້ນເກມໝູນວຽນ ແລະ ໃສ່ຄະແນນແຕ່ລະເກມ. | 2. Play the rotation matches and type each score. | 2. ຫຼິ້ນແມັດໝູນວຽນ ແລະ ໃສ່ຄະແນນແຕ່ລະແມັດ. | match |
| `tourProgress` | Game {k} of {m} | ເກມທີ {k} ຈາກ {m} | Match {k} of {m} | ແມັດທີ {k} ຈາກ {m} | match |
| `tourRule8` | 8 players: 6 rotation games (each plays 3, rests 3), then 2 semis, 1 game for 3rd, and a final best of 3. 11 to 12 games in all. | 8 ຄົນ: 6 ເກມໝູນວຽນ (ຫຼິ້ນ 3 ພັກ 3), ແລ້ວ 2 ຮອບຮອງ, 1 ເກມອັນດັບ 3, ແລະ ຮອບຊິງ ດີທີ່ສຸດ 3 ເກມ. ລວມ 11 ຫາ 12 ເກມ. | 8 players: 6 rotation matches (each plays 3, rests 3), then 2 semis, 1 match for 3rd, and a final best of 3. 11 to 12 matches in all. | 8 ຄົນ: 6 ແມັດໝູນວຽນ (ຫຼິ້ນ 3 ພັກ 3), ແລ້ວ 2 ຮອບຮອງ, 1 ແມັດອັນດັບ 3, ແລະ ຮອບຊິງ ດີທີ່ສຸດ 3 ແມັດ. ລວມ 11 ຫາ 12 ແມັດ. | match |
| `tourRule6` | 6 players: 9 rotation games (each plays 6, rests 3), then a round robin of 3 pairs. 12 games in all. | 6 ຄົນ: 9 ເກມໝູນວຽນ (ຫຼິ້ນ 6 ພັກ 3), ແລ້ວແຂ່ງໝູນວຽນ 3 ຄູ່. ລວມ 12 ເກມ. | 6 players: 9 rotation matches (each plays 6, rests 3), then a round robin of 3 pairs. 12 matches in all. | 6 ຄົນ: 9 ແມັດໝູນວຽນ (ຫຼິ້ນ 6 ພັກ 3), ແລ້ວແຂ່ງໝູນວຽນ 3 ຄູ່. ລວມ 12 ແມັດ. | match |
| `tourThirdG` | 3rd place · game {n} | ອັນດັບ 3 · ເກມ {n} | 3rd place · match {n} | ອັນດັບ 3 · ແມັດ {n} | match |
| `tourThirdBo3` | 3rd place · best of 3 | ອັນດັບ 3 · ດີທີ່ສຸດ 3 ເກມ | 3rd place · best of 3 | ອັນດັບ 3 · ດີທີ່ສຸດ 3 ແມັດ | match |
| `tourThirdTitle3` | 3rd place · best of 3 | ອັນດັບ 3 · ດີທີ່ສຸດ 3 ເກມ | 3rd place · best of 3 | ອັນດັບ 3 · ດີທີ່ສຸດ 3 ແມັດ | match |
| `tourBelowLine` | Done after the mix games: {names}. Their games still count in Rankings. | ຈົບຫຼັງເກມປະສົມ: {names}. ເກມຂອງເຂົາເຈົ້າຍັງນັບໃນອັນດັບ. | Done after the mix matches: {names}. Their matches still count in Rankings. | ຈົບຫຼັງແມັດປະສົມ: {names}. ແມັດຂອງເຂົາເຈົ້າຍັງນັບໃນອັນດັບ. | match |
| `tourSumNext4` | Best is paired with worst. Make the pairs: the top 4 play the final, best of 3. | ເກັ່ງສຸດຄູ່ກັບອ່ອນສຸດ. ຈັດຄູ່: 4 ຄົນທຳອິດຫຼິ້ນຮອບຊິງ ດີທີ່ສຸດ 3 ເກມ. | Best is paired with worst. Make the pairs: the top 4 play the final, best of 3. | ເກັ່ງສຸດຄູ່ກັບອ່ອນສຸດ. ຈັດຄູ່: 4 ຄົນທຳອິດຫຼິ້ນຮອບຊິງ ດີທີ່ສຸດ 3 ແມັດ. | match |
| `tourSumNext8b` | Best is paired with worst. Make the pairs: 2 semis, then 3rd place and the final, both best of 3. | ເກັ່ງສຸດຄູ່ກັບອ່ອນສຸດ. ຈັດຄູ່: 2 ຮອບຮອງ, ແລ້ວຊິງອັນດັບ 3 ແລະ ຮອບຊິງ, ທັງສອງດີທີ່ສຸດ 3 ເກມ. | Best is paired with worst. Make the pairs: 2 semis, then 3rd place and the final, both best of 3. | ເກັ່ງສຸດຄູ່ກັບອ່ອນສຸດ. ຈັດຄູ່: 2 ຮອບຮອງ, ແລ້ວຊິງອັນດັບ 3 ແລະ ຮອບຊິງ, ທັງສອງດີທີ່ສຸດ 3 ແມັດ. | match |
| `tourHowFinal` | The top 4 play as 2 pairs: #1 with #4 against #2 with #3. Best of 3: the first pair to 2 wins is champion. A 2–0 final saves a game. | 4 ຄົນທຳອິດຫຼິ້ນເປັນ 2 ຄູ່: #1 ກັບ #4 ພົບ #2 ກັບ #3. ດີທີ່ສຸດ 3 ເກມ: ຄູ່ທີ່ໄດ້ 2 ເກມກ່ອນເປັນແຊ້ມ. ຖ້າຊະນະ 2–0 ຈະປະຢັດ 1 ເກມ. | The top 4 play as 2 pairs: #1 with #4 against #2 with #3. Best of 3: the first pair to 2 wins is champion. A 2–0 final saves a match. | 4 ຄົນທຳອິດຫຼິ້ນເປັນ 2 ຄູ່: #1 ກັບ #4 ພົບ #2 ກັບ #3. ດີທີ່ສຸດ 3 ແມັດ: ຄູ່ທີ່ໄດ້ 2 ແມັດກ່ອນເປັນແຊ້ມ. ຖ້າຊະນະ 2–0 ຈະປະຢັດ 1 ແມັດ. | match |
| `tourHow8b` | The pairs play 2 semis: pair 1 against pair 4, pair 2 against pair 3. Losers play 3rd place, winners play the final. Both are best of 3: the first pair to 2 wins. | ສີ່ຄູ່ຫຼິ້ນ 2 ຮອບຮອງ: ຄູ່ 1 ພົບຄູ່ 4, ຄູ່ 2 ພົບຄູ່ 3. ຜູ້ແພ້ຫຼິ້ນຊິງອັນດັບ 3, ຜູ້ຊະນະຫຼິ້ນຮອບຊິງ. ທັງສອງດີທີ່ສຸດ 3 ເກມ: ຄູ່ທີ່ໄດ້ 2 ເກມກ່ອນຊະນະ. | The pairs play 2 semis: pair 1 against pair 4, pair 2 against pair 3. Losers play 3rd place, winners play the final. Both are best of 3: the first pair to 2 wins. | ສີ່ຄູ່ຫຼິ້ນ 2 ຮອບຮອງ: ຄູ່ 1 ພົບຄູ່ 4, ຄູ່ 2 ພົບຄູ່ 3. ຜູ້ແພ້ຫຼິ້ນຊິງອັນດັບ 3, ຜູ້ຊະນະຫຼິ້ນຮອບຊິງ. ທັງສອງດີທີ່ສຸດ 3 ແມັດ: ຄູ່ທີ່ໄດ້ 2 ແມັດກ່ອນຊະນະ. | match |
| `tourRuleF2` | {n} players: {g} mix games (everyone plays {k}). Then {po}. About {games} games in all. | {n} ຄົນ: {g} ເກມປະສົມ (ທຸກຄົນຫຼິ້ນ {k} ເກມ). ແລ້ວ {po}. ລວມປະມານ {games} ເກມ. | {n} players: {g} mix matches (everyone plays {k}). Then {po}. About {games} matches in all. | {n} ຄົນ: {g} ແມັດປະສົມ (ທຸກຄົນຫຼິ້ນ {k} ແມັດ). ແລ້ວ {po}. ລວມປະມານ {games} ແມັດ. | match |
| `tourPoShort4` | the top 4 play the final, best of 3 | 4 ຄົນທຳອິດຫຼິ້ນຮອບຊິງ ດີທີ່ສຸດ 3 ເກມ | the top 4 play the final, best of 3 | 4 ຄົນທຳອິດຫຼິ້ນຮອບຊິງ ດີທີ່ສຸດ 3 ແມັດ | match |
| `tourInfoH1` | Mix games | ເກມປະສົມ | Mix matches | ແມັດປະສົມ | match |
| `tourInfoMix` | Doubles. Partners change every game. Everyone plays {k} games. {g} mix games in all. | ຄູ່. ຄູ່ຫຼິ້ນປ່ຽນທຸກເກມ. ທຸກຄົນຫຼິ້ນ {k} ເກມ. ລວມ {g} ເກມປະສົມ. | Doubles. Partners change every match. Everyone plays {k} matches. {g} mix matches in all. | ຄູ່. ຄູ່ຫຼິ້ນປ່ຽນທຸກແມັດ. ທຸກຄົນຫຼິ້ນ {k} ແມັດ. ລວມ {g} ແມັດປະສົມ. | match |
| `tourInfoRest` | Players resting in each game: {r}. | ຈຳນວນຄົນພັກໃນແຕ່ລະເກມ: {r}. | Players resting in each match: {r}. | ຈຳນວນຄົນພັກໃນແຕ່ລະແມັດ: {r}. | match |
| `tourInfoPoRR` | The 3 pairs play each other once (3 games). Most wins is champion. A tie goes by point difference, then points scored. | 3 ຄູ່ຫຼິ້ນພົບກັນຄົນລະເທື່ອ (3 ເກມ). ຊະນະຫຼາຍສຸດເປັນແຊ້ມ. ຖ້າເທົ່າກັນ ໃຊ້ຄະແນນຕ່າງ, ແລ້ວຄະແນນໄດ້. | The 3 pairs play each other once (3 matches). Most wins is champion. A tie goes by point difference, then points scored. | 3 ຄູ່ຫຼິ້ນພົບກັນຄົນລະເທື່ອ (3 ແມັດ). ຊະນະຫຼາຍສຸດເປັນແຊ້ມ. ຖ້າເທົ່າກັນ ໃຊ້ຄະແນນຕ່າງ, ແລ້ວຄະແນນໄດ້. | match |
| `tourInfoPoBracket` | Semis, one game each: pair 1 against pair 4, pair 2 against pair 3. Then 3rd place and the final. | ຮອບຮອງ ຄູ່ລະ 1 ເກມ: ຄູ່ 1 ພົບຄູ່ 4, ຄູ່ 2 ພົບຄູ່ 3. ແລ້ວຊິງອັນດັບ 3 ແລະ ຮອບຊິງ. | Semis, one match each: pair 1 against pair 4, pair 2 against pair 3. Then 3rd place and the final. | ຮອບຮອງ ຄູ່ລະ 1 ແມັດ: ຄູ່ 1 ພົບຄູ່ 4, ຄູ່ 2 ພົບຄູ່ 3. ແລ້ວຊິງອັນດັບ 3 ແລະ ຮອບຊິງ. | match |
| `tourInfoBo3` | Best of 3: the first pair to 2 wins. Game 3 is played only if it is 1–1. | ດີທີ່ສຸດ 3 ເກມ: ຄູ່ທີ່ໄດ້ 2 ເກມກ່ອນຊະນະ. ເກມທີ 3 ຫຼິ້ນສະເພາະເມື່ອ 1–1. | Best of 3: the first pair to 2 wins. Match 3 is played only if it is 1–1. | ດີທີ່ສຸດ 3 ແມັດ: ຄູ່ທີ່ໄດ້ 2 ແມັດກ່ອນຊະນະ. ແມັດທີ 3 ຫຼິ້ນສະເພາະເມື່ອ 1–1. | match |
| `tourInfoBelow` | Players below the line are done after the mix games. Their games still count in Rankings. | ຄົນທີ່ຢູ່ລຸ່ມເສັ້ນຈົບຫຼັງເກມປະສົມ. ເກມຂອງເຂົາເຈົ້າຍັງນັບໃນອັນດັບ. | Players below the line are done after the mix matches. Their matches still count in Rankings. | ຄົນທີ່ຢູ່ລຸ່ມເສັ້ນຈົບຫຼັງແມັດປະສົມ. ແມັດຂອງເຂົາເຈົ້າຍັງນັບໃນອັນດັບ. | match |
| `tourInfoEst` | About {est} in all ({games} games, {per} minutes each, one at a time). | ລວມປະມານ {est} ({games} ເກມ, ເກມລະ {per} ນາທີ, ຫຼິ້ນເທື່ອລະເກມ). | About {est} in all ({games} matches, {per} minutes each, one at a time). | ລວມປະມານ {est} ({games} ແມັດ, ແມັດລະ {per} ນາທີ, ຫຼິ້ນເທື່ອລະແມັດ). | match |
| `tourInfoHurt` | Tap Replace player on the game. Someone who is not on court steps in. If nobody is free, the game is a walkover. | ກົດ ປ່ຽນຜູ້ຫຼິ້ນ ໃນເກມ. ຄົນທີ່ບໍ່ໄດ້ຢູ່ໃນສະໜາມເຂົ້າແທນ. ຖ້າບໍ່ມີໃຜວ່າງ ເກມນັ້ນເປັນການຊະນະໂດຍບໍ່ຕ້ອງຫຼິ້ນ. | Tap Replace player on the match. Someone who is not on court steps in. If nobody is free, the match is a walkover. | ກົດ ປ່ຽນຜູ້ຫຼິ້ນ ໃນແມັດ. ຄົນທີ່ບໍ່ໄດ້ຢູ່ໃນສະໜາມເຂົ້າແທນ. ຖ້າບໍ່ມີໃຜວ່າງ ແມັດນັ້ນເປັນການຊະນະໂດຍບໍ່ຕ້ອງຫຼິ້ນ. | match |
| `lsPickGame` | Which game is this for? | ຄະແນນນີ້ສຳລັບເກມໃດ? | Which session is this for? | ຄະແນນນີ້ສຳລັບນັດຫຼິ້ນໃດ? | play-day |
| `lsPickGameHint` | Choose the session. Scores are saved into it. | ເລືອກເຊດຊັນ. ຄະແນນຈະຖືກບັນທຶກໃສ່ເຊດຊັນນັ້ນ. | Choose the session. Scores are saved into it. | ເລືອກນັດຫຼິ້ນ. ຄະແນນຈະຖືກບັນທຶກໃສ່ນັດຫຼິ້ນນັ້ນ. | play-day |
| `lsNewGame` | New game | ເກມໃໝ່ | New match | ແມັດໃໝ່ | match |
| `navGames` | Games | ເກມ | Sessions | ນັດຫຼິ້ນ | play-day |
| `gamesNone` | No games here yet. | ຍັງບໍ່ມີເກມ. | No sessions here yet. | ຍັງບໍ່ມີນັດຫຼິ້ນ. | play-day |
| `gamesAllSessions` | All sessions | ເຊດຊັນທັງໝົດ | All sessions | ນັດຫຼິ້ນທັງໝົດ | play-day |
| `lsFormat` | Match format | ຮູບແບບການແຂ່ງ | Match format | ຮູບແບບແມັດ | match |
| `lsGamesWon` | Games won: {n} | ຊະນະແລ້ວ: {n} ເກມ | Matches won: {n} | ຊະນະແລ້ວ: {n} ແມັດ | match |
| `lsGamesWonCap` | Games won | ເກມທີ່ຊະນະ | Matches won | ແມັດທີ່ຊະນະ | match |
| `lsMatchDraw` | Match drawn {a}–{b} | ການແຂ່ງສະເໝີ {a}–{b} | Match drawn {a}–{b} | ແມັດສະເໝີ {a}–{b} | match |
| `lsSaveDrawConfirm` | Save the match result? Draw {a}–{b}. | ບັນທຶກຜົນການແຂ່ງ? ສະເໝີ {a}–{b}. | Save the match result? Draw {a}–{b}. | ບັນທຶກຜົນແມັດ? ສະເໝີ {a}–{b}. | match |
| `lsGameShort` | G{n} | ເກມ {n} | M{n} | ແມັດ {n} | match |
| `lsGameResult` | Game {n} result | ຜົນເກມທີ {n} | Match {n} result | ຜົນແມັດທີ {n} | match |
| `lsMatchScore` | Match score {a}–{b} | ຄະແນນການແຂ່ງ {a}–{b} | Match score {a}–{b} | ຄະແນນແມັດ {a}–{b} | match |
| `lsSaveMatchConfirm` | Save the match result? {team} wins {a}–{b}. | ບັນທຶກຜົນການແຂ່ງ? {team} ຊະນະ {a}–{b}. | Save the match result? {team} wins {a}–{b}. | ບັນທຶກຜົນແມັດ? {team} ຊະນະ {a}–{b}. | match |
| `lsSingleGame` | Single game | ເກມດຽວ | Single match | ແມັດດຽວ | match |
| `lsTabSingle` | Single | ເກມດຽວ | Single | ແມັດດຽວ | match |
| `lsConfirmMatch` | Check and confirm the match result | ກວດ ແລະ ຢືນຢັນຜົນການແຂ່ງ | Check and confirm the match result | ກວດ ແລະ ຢືນຢັນຜົນແມັດ | match |
| `lsMatchScoreShort` | Match | ການແຂ່ງ | Match | ແມັດ | match |
| `lsTabBo3` | Best of 3 | ໃຜຊະນະ 3 ເກມ | Best of 3 | ໃຜຊະນະ 3 ແມັດ | match |
| `lsBestOf` | Best of {n} | ໃຜຊະນະໃນ {n} ເກມ | Best of {n} | ໃຜຊະນະໃນ {n} ແມັດ | match |
| `lsMatchWins` | {team} wins the match {a}–{b} | {team} ຊະນະການແຂ່ງ {a}–{b} | {team} wins the match {a}–{b} | {team} ຊະນະແມັດ {a}–{b} | match |
| `lsEnded` | The game has ended | ເກມຈົບແລ້ວ | The match has ended | ແມັດຈົບແລ້ວ | match |
| `lsGameN` | Game {n} | ເກມທີ {n} | Match {n} | ແມັດທີ {n} | match |
| `lsGamePoint` | GAME POINT | ແຕ້ມຕັດສິນເກມ | MATCH POINT | ແຕ້ມຕັດສິນແມັດ | match |
| `lsExitTestConfirm` | Leave the practice game? | ອອກຈາກເກມທົດລອງບໍ? | Leave the practice match? | ອອກຈາກແມັດທົດລອງບໍ? | match |
| `lsSaveNext` | Save and next game | ບັນທຶກ ແລະ ເກມຕໍ່ໄປ | Save and next match | ບັນທຶກ ແລະ ແມັດຕໍ່ໄປ | match |
| `lsNoMore` | No more players in this game. | ບໍ່ມີຜູ້ຫຼິ້ນເພີ່ມອີກ. | No more players in this match. | ບໍ່ມີຜູ້ຫຼິ້ນເພີ່ມອີກ. | match |
| `lsCurrentGame` | Current game | ເກມປັດຈຸບັນ | Current match | ແມັດປັດຈຸບັນ | match |
| `lsResetConfirm` | Set the score and the match count back to 0 – 0? | ຕັ້ງຄະແນນ ແລະ ຈຳນວນເກມທີ່ຊະນະ ກັບເປັນ 0 – 0 ບໍ? | Set the score and the match count back to 0 – 0? | ຕັ້ງຄະແນນ ແລະ ຈຳນວນແມັດທີ່ຊະນະ ກັບເປັນ 0 – 0 ບໍ? | match |
| `homeGamesMonth` | games this month | ເກມເດືອນນີ້ | matches this month | ແມັດເດືອນນີ້ | match |
| `homeFindFriendsSub` | Join a game or dinner | ເຂົ້າເກມ ຫຼື ກິນເຂົ້າ | Join a session or dinner | ເຂົ້ານັດຫຼິ້ນ ຫຼື ກິນເຂົ້າ | play-day |
| `homeGame` | Game | ເກມ | Session | ນັດຫຼິ້ນ | play-day |
| `homeAddScore` | Add score | ເພີ່ມຄະແນນເກມ | Add score | ເພີ່ມຄະແນນແມັດ | match |
| `homeNextGame` | Next game | ເກມຕໍ່ໄປ | Next session | ນັດຫຼິ້ນຕໍ່ໄປ | play-day |
| `homeNoNext` | No game planned yet | ຍັງບໍ່ມີເກມທີ່ວາງແຜນ | No session planned yet | ຍັງບໍ່ມີນັດຫຼິ້ນທີ່ວາງແຜນ | play-day |
| `homeNoSession` | No running session. Start a game first. | ບໍ່ມີເຊດຊັນທີ່ກຳລັງຫຼິ້ນ. ເລີ່ມເກມກ່ອນ. | No running session. Start a session first. | ບໍ່ມີນັດຫຼິ້ນທີ່ກຳລັງຫຼິ້ນ. ເລີ່ມນັດຫຼິ້ນກ່ອນ. | play-day |
| `suggestedGame` | Which game | ເກມໃດ | Which session | ນັດຫຼິ້ນໃດ | play-day |
| `blockConfirm` | Block {name}? You won't see each other's games, invites or buddy cards. | ບລັອກ {name}? ທ່ານຈະບໍ່ເຫັນເກມ, ຄຳຊວນ ຫຼື ບັດໝູ່ຫຼິ້ນຂອງກັນ ແລະ ກັນ. | Block {name}? You won't see each other's sessions, invites or buddy cards. | ບລັອກ {name}? ທ່ານຈະບໍ່ເຫັນນັດຫຼິ້ນ, ຄຳຊວນ ຫຼື ບັດໝູ່ຫຼິ້ນຂອງກັນ ແລະ ກັນ. | play-day |
| `badge_first` | First match | ນັດທຳອິດ | First match | ແມັດທຳອິດ | match |
| `badge_m50` | 50 matches | 50 ນັດ | 50 matches | 50 ແມັດ | match |
| `badge_m100` | 100 matches | 100 ນັດ | 100 matches | 100 ແມັດ | match |
| `badge_streak5` | 5 wins in a row | ຊະນະ 5 ນັດຕິດ | 5 wins in a row | ຊະນະ 5 ແມັດຕິດ | match |
| `badge_streak10` | 10 wins in a row | ຊະນະ 10 ນັດຕິດ | 10 wins in a row | ຊະນະ 10 ແມັດຕິດ | match |
| `badgeDesc_first` | Play your first match | ຫຼິ້ນນັດທຳອິດ | Play your first match | ຫຼິ້ນແມັດທຳອິດ | match |
| `badgeDesc_m50` | Play 50 matches | ຫຼິ້ນ 50 ນັດ | Play 50 matches | ຫຼິ້ນ 50 ແມັດ | match |
| `badgeDesc_m100` | Play 100 matches | ຫຼິ້ນ 100 ນັດ | Play 100 matches | ຫຼິ້ນ 100 ແມັດ | match |
| `badgeDesc_streak5` | Win 5 matches in a row | ຊະນະ 5 ນັດຕິດ | Win 5 matches in a row | ຊະນະ 5 ແມັດຕິດ | match |
| `badgeDesc_streak10` | Win 10 matches in a row | ຊະນະ 10 ນັດຕິດ | Win 10 matches in a row | ຊະນະ 10 ແມັດຕິດ | match |
| `badgeDesc_scorer` | Add the score of 50 games (Live score or typed in) | ບັນທຶກຄະແນນ 50 ເກມ (Live score ຫຼື ປ້ອນເອງ) | Add the score of 50 matches (Live score or typed in) | ບັນທຶກຄະແນນ 50 ແມັດ (Live score ຫຼື ປ້ອນເອງ) | match |
| `notRankedYet` | No games yet | ຍັງບໍ່ມີເກມ | No matches yet | ຍັງບໍ່ມີແມັດ | match |
| `matchesThisMonth` | games this month | ເກມເດືອນນີ້ | matches this month | ແມັດເດືອນນີ້ | match |
| `bestPartnerHint` | Highest win rate with someone you played at least {n} games with | ອັດຕາຊະນະສູງສຸດກັບຄົນທີ່ຫຼິ້ນນຳກັນຢ່າງໜ້ອຍ {n} ເກມ | Highest win rate with someone you played at least {n} matches with | ອັດຕາຊະນະສູງສຸດກັບຄົນທີ່ຫຼິ້ນນຳກັນຢ່າງໜ້ອຍ {n} ແມັດ | match |
| `bestPartnerNone` | No winning partner yet: needs {n}+ games together and more wins than losses. | ຍັງບໍ່ມີຄູ່ທີ່ຊະນະ: ຕ້ອງຫຼິ້ນນຳກັນ {n}+ ເກມ ແລະ ຊະນະຫຼາຍກວ່າແພ້. | No winning partner yet: needs {n}+ matches together and more wins than losses. | ຍັງບໍ່ມີຄູ່ທີ່ຊະນະ: ຕ້ອງຫຼິ້ນນຳກັນ {n}+ ແມັດ ແລະ ຊະນະຫຼາຍກວ່າແພ້. | match |
| `pairRatingTip` | Games won–lost together · rating of this pair | ຊະນະ–ແພ້ ຮ່ວມກັນ · ເລດຕິ້ງຂອງຄູ່ນີ້ | Matches won–lost together · rating of this pair | ຊະນະ–ແພ້ ຮ່ວມກັນ · ເລດຕິ້ງຂອງຄູ່ນີ້ | match |
| `partnersNone` | Play a game with a partner to see your record together. | ຫຼິ້ນກັບຄູ່ຫຼິ້ນສັກເກມ ເພື່ອເບິ່ງສະຖິຕິຮ່ວມກັນ. | Play a match with a partner to see your record together. | ຫຼິ້ນກັບຄູ່ຫຼິ້ນສັກແມັດ ເພື່ອເບິ່ງສະຖິຕິຮ່ວມກັນ. | match |
| `topPairNone` | Needs {n}+ games as a pair | ຕ້ອງການ {n}+ ເກມເປັນຄູ່ | Needs {n}+ matches as a pair | ຕ້ອງການ {n}+ ແມັດເປັນຄູ່ | match |
| `noPairsYet` | No games yet — add scores in a session's Games tab. | ຍັງບໍ່ມີເກມ — ໃສ່ຄະແນນໃນແຖບ ເກມ ຂອງເຊດຊັນ. | No matches yet — add scores in a session's Matches tab. | ຍັງບໍ່ມີແມັດ — ໃສ່ຄະແນນໃນແຖບ ແມັດ ຂອງນັດຫຼິ້ນ. | match |
| `noRankYet` | No games yet — add scores in a session's Games tab. | ຍັງບໍ່ມີເກມ — ໃສ່ຄະແນນໃນແຖບ ເກມ ຂອງເຊດຊັນ. | No matches yet — add scores in a session's Matches tab. | ຍັງບໍ່ມີແມັດ — ໃສ່ຄະແນນໃນແຖບ ແມັດ ຂອງນັດຫຼິ້ນ. | match |
| `lastN` | last {n}: | {n} ນັດຫຼ້າສຸດ: | last {n}: | {n} ແມັດຫຼ້າສຸດ: | match |
| `noMatchesYet` | No matches recorded yet | ຍັງບໍ່ມີນັດທີ່ບັນທຶກ | No matches recorded yet | ຍັງບໍ່ມີແມັດທີ່ບັນທຶກ | match |
| `matchesWord` | matches | ນັດ | matches | ແມັດ | match |
| `ptsPerGame` | pts / game | ຄະແນນ / ເກມ | pts / match | ຄະແນນ / ແມັດ | match |
| `needMoreMonths` | The rating line appears after a game in this period. | ເສັ້ນຄະແນນຈະສະແດງຫຼັງມີເກມໃນຊ່ວງນີ້. | The rating line appears after a match in this period. | ເສັ້ນຄະແນນຈະສະແດງຫຼັງມີແມັດໃນຊ່ວງນີ້. | match |
| `matches` | Matches | ນັດຫຼິ້ນ | Matches | ແມັດ | match |
| `recordMatch` | Record a match | ບັນທຶກນັດ | Record a match | ບັນທຶກແມັດ | match |
| `deleteMatchConfirm` | Delete this match? | ລຶບນັດນີ້? | Delete this match? | ລຶບແມັດນີ້? | match |
| `nextMatch` | Next match | ນັດຕໍ່ໄປ | Next match | ແມັດຕໍ່ໄປ | match |
| `matchType` | Match type | ປະເພດນັດ | Match type | ປະເພດແມັດ | match |
| `oneGame` | 1 game | 1 ເກມ | 1 match | 1 ແມັດ | match |
| `gameN` | Game {n} | ເກມ {n} | Match {n} | ແມັດ {n} | match |
| `confirmHintComp` | Someone on the other team confirms it (or it counts after 24 h). Every saved game changes ratings. | ຄົນໃນທີມກົງກັນຂ້າມຢືນຢັນ (ຫຼື ນັບເອງຫຼັງ 24 ຊມ). ທຸກນັດທີ່ບັນທຶກປ່ຽນຄະແນນ. | Someone on the other team confirms it (or it counts after 24 h). Every saved match changes ratings. | ຄົນໃນທີມກົງກັນຂ້າມຢືນຢັນ (ຫຼື ນັບເອງຫຼັງ 24 ຊມ). ທຸກແມັດທີ່ບັນທຶກປ່ຽນຄະແນນ. | match |
| `confirmHintFun` | Counts for matches and minutes played. Score is optional. | ນັບເປັນນັດ ແລະ ນາທີທີ່ຫຼິ້ນ. ບໍ່ຈຳເປັນຕ້ອງໃສ່ຄະແນນ. | Counts for matches and minutes played. Score is optional. | ນັບເປັນແມັດ ແລະ ນາທີທີ່ຫຼິ້ນ. ບໍ່ຈຳເປັນຕ້ອງໃສ່ຄະແນນ. | match |
| `countsForPlayed` | counts for matches played | ນັບເປັນນັດທີ່ຫຼິ້ນ | counts for matches played | ນັບເປັນແມັດທີ່ຫຼິ້ນ | match |
| `scoreNeeded` | Enter the score of the games won | ໃສ່ຄະແນນຂອງເກມທີ່ຊະນະ | Enter the score of the matches won | ໃສ່ຄະແນນຂອງແມັດທີ່ຊະນະ | match |
| `matchSaved` | Match saved | ບັນທຶກນັດແລ້ວ | Match saved | ບັນທຶກແມັດແລ້ວ | match |
| `selfLevelHint` | Used in public games. Your group ranking stays inside the group. | ໃຊ້ໃນເກມສາທາລະນະ. ອັນດັບຂອງກຸ່ມຢູ່ພາຍໃນກຸ່ມ. | Used in public sessions. Your group ranking stays inside the group. | ໃຊ້ໃນນັດຫຼິ້ນສາທາລະນະ. ອັນດັບຂອງກຸ່ມຢູ່ພາຍໃນກຸ່ມ. | play-day |
| `publicGameBanner` | Everyone can see this game | ທຸກຄົນເຫັນເກມນີ້ໄດ້ | Everyone can see this session | ທຸກຄົນເຫັນນັດຫຼິ້ນນີ້ໄດ້ | play-day |
| `sessionTabBill` | Session | ເຊດຊັນ | Bill | ບິນ | bill |
| `recapGamesN` | {n} games this month | {n} ເກມ ເດືອນນີ້ | {n} matches this month | {n} ແມັດ ເດືອນນີ້ | match |
| `lastNGames` | Last {n} games | {n} ເກມລ່າສຸດ | Last {n} matches | {n} ແມັດລ່າສຸດ | match |
| `rankHelpHtml` | <p><b>A game</b> — first to 21; after 20-all the winner must lead by 2; {cap} is the most (the official badminton rule, BWF Laws of Badminton, stops at 30).</p><p><b>Rating (Elo)</b> — everyone starts at <b>{start}</b>. When you win, you take points from the losers; how many depends on how strong they were: beating a higher-rated team gives more, beating a weaker one gives less (K = {k}). A bigger point difference adds a little more. Doubles uses the average of the two players. It is the same idea as the Elo rating used in chess (FIDE) and the World Football Elo Ratings.</p><p><b>Every saved game</b> with a score changes ratings. Fun, Exercise and Competition are only a label that tells the players how the game was meant; they all count.</p><p><b>Ranking</b> — players and pairs are ordered by rating. Until you have {min} games (a pair: {pmin}), your rating is still settling: it is tagged x/{min} games; players who are still settling are listed after the others, pairs stay in rating order. <b>Best pair</b> is the pair with the highest rating; <b>Best score</b> is the game with the biggest winning margin.</p><p><b>Why not BWF World Tour points?</b> The BWF World Ranking gives points for how far you get in a tournament (e.g. Super 1000 winner 12,000 points) and keeps your best 10 results of the last 52 weeks. That needs tournaments and draws; for weekly club games, Elo is fairer because every single game counts and wins against strong players count more.</p><p><b>Levels</b> (BG … B&A) are set by people, not by the rating.</p> | <p><b>ໜຶ່ງເກມ</b> — ໃຜຮອດ 21 ກ່ອນຊະນະ; ຫຼັງ 20-20 ຕ້ອງນຳ 2; ສູງສຸດ {cap} (ກົດທາງການຂອງ BWF ສູງສຸດ 30).</p><p><b>ຄະແນນ (Elo)</b> — ທຸກຄົນເລີ່ມ <b>{start}</b>. ເມື່ອຊະນະ ທ່ານໄດ້ຄະແນນຈາກຝ່າຍແພ້; ໄດ້ຫຼາຍ ຫຼື ໜ້ອຍ ຂຶ້ນກັບຄວາມເກັ່ງຂອງຄູ່ແຂ່ງ: ຊະນະທີມທີ່ຄະແນນສູງກວ່າໄດ້ຫຼາຍ, ຊະນະທີມທີ່ອ່ອນກວ່າໄດ້ໜ້ອຍ (K = {k}). ຊະນະຫ່າງຫຼາຍໄດ້ເພີ່ມອີກໜ້ອຍໜຶ່ງ. ປະເພດຄູ່ໃຊ້ຄ່າສະເລ່ຍຂອງສອງຄົນ. ແນວຄິດດຽວກັບ Elo ຂອງໝາກຮຸກ (FIDE) ແລະ World Football Elo Ratings.</p><p><b>ທຸກເກມທີ່ບັນທຶກຄະແນນ</b> ປ່ຽນຄະແນນ. ມ່ວນ, ອອກກຳລັງ ແລະ ແຂ່ງຂັນ ເປັນພຽງປ້າຍບອກຜູ້ຫຼິ້ນ; ທຸກເກມນັບ.</p><p><b>ອັນດັບ</b> — ຄົນ ແລະ ຄູ່ ຮຽງຕາມຄະແນນ. ຖ້າຍັງບໍ່ຮອດ {min} ເກມ (ຄູ່: {pmin}) ຄະແນນຍັງບໍ່ຄົງທີ່ ແລະ ມີປ້າຍ x/{min} ເກມ; ຄົນທີ່ຍັງບໍ່ຄົງທີ່ຈະຢູ່ຫຼັງຄົນອື່ນ, ຄູ່ຍັງຮຽງຕາມຄະແນນ. <b>ຄູ່ທີ່ດີທີ່ສຸດ</b> = ຄູ່ທີ່ມີຄະແນນສູງສຸດ; <b>ຄະແນນດີທີ່ສຸດ</b> = ເກມທີ່ຊະນະຫຼາຍທີ່ສຸດ.</p><p><b>ເປັນຫຍັງບໍ່ໃຊ້ຄະແນນ BWF World Tour?</b> BWF World Ranking ໃຫ້ຄະແນນຕາມຮອບທີ່ໄປຮອດໃນການແຂ່ງ (ເຊັ່ນ ແຊ້ມ Super 1000 ໄດ້ 12,000 ຄະແນນ) ແລະ ນັບ 10 ຜົນງານດີສຸດໃນ 52 ອາທິດ. ຕ້ອງມີການແຂ່ງຂັນ; ສຳລັບເກມກຸ່ມປະຈຳອາທິດ Elo ຍຸຕິທຳກວ່າ ເພາະທຸກເກມນັບ ແລະ ຊະນະຄົນເກັ່ງນັບຫຼາຍກວ່າ.</p><p><b>ລະດັບ</b> (BG … B&A) ຄົນເປັນຜູ້ຕັ້ງ, ບໍ່ແມ່ນຈາກຄະແນນ.</p> | <p><b>A match</b> — first to 21; after 20-all the winner must lead by 2; {cap} is the most (the official badminton rule, BWF Laws of Badminton, stops at 30).</p><p><b>Rating (Elo)</b> — everyone starts at <b>{start}</b>. When you win, you take points from the losers; how many depends on how strong they were: beating a higher-rated team gives more, beating a weaker one gives less (K = {k}). A bigger point difference adds a little more. Doubles uses the average of the two players. It is the same idea as the Elo rating used in chess (FIDE) and the World Football Elo Ratings.</p><p><b>Every saved match</b> with a score changes ratings. Fun, Exercise and Competition are only a label that tells the players how the match was meant; they all count.</p><p><b>Ranking</b> — players and pairs are ordered by rating. Until you have {min} matches (a pair: {pmin}), your rating is still settling: it is tagged x/{min} matches; players who are still settling are listed after the others, pairs stay in rating order. <b>Best pair</b> is the pair with the highest rating; <b>Best score</b> is the match with the biggest winning margin.</p><p><b>Why not BWF World Tour points?</b> The BWF World Ranking gives points for how far you get in a tournament (e.g. Super 1000 winner 12,000 points) and keeps your best 10 results of the last 52 weeks. That needs tournaments and draws; for weekly club matches, Elo is fairer because every single match counts and wins against strong players count more.</p><p><b>Levels</b> (BG … B&A) are set by people, not by the rating.</p> | <p><b>ໜຶ່ງແມັດ</b> — ໃຜຮອດ 21 ກ່ອນຊະນະ; ຫຼັງ 20-20 ຕ້ອງນຳ 2; ສູງສຸດ {cap} (ກົດທາງການຂອງ BWF ສູງສຸດ 30).</p><p><b>ຄະແນນ (Elo)</b> — ທຸກຄົນເລີ່ມ <b>{start}</b>. ເມື່ອຊະນະ ທ່ານໄດ້ຄະແນນຈາກຝ່າຍແພ້; ໄດ້ຫຼາຍ ຫຼື ໜ້ອຍ ຂຶ້ນກັບຄວາມເກັ່ງຂອງຄູ່ແຂ່ງ: ຊະນະທີມທີ່ຄະແນນສູງກວ່າໄດ້ຫຼາຍ, ຊະນະທີມທີ່ອ່ອນກວ່າໄດ້ໜ້ອຍ (K = {k}). ຊະນະຫ່າງຫຼາຍໄດ້ເພີ່ມອີກໜ້ອຍໜຶ່ງ. ປະເພດຄູ່ໃຊ້ຄ່າສະເລ່ຍຂອງສອງຄົນ. ແນວຄິດດຽວກັບ Elo ຂອງໝາກຮຸກ (FIDE) ແລະ World Football Elo Ratings.</p><p><b>ທຸກແມັດທີ່ບັນທຶກຄະແນນ</b> ປ່ຽນຄະແນນ. ມ່ວນ, ອອກກຳລັງ ແລະ ແຂ່ງຂັນ ເປັນພຽງປ້າຍບອກຜູ້ຫຼິ້ນ; ທຸກແມັດນັບ.</p><p><b>ອັນດັບ</b> — ຄົນ ແລະ ຄູ່ ຮຽງຕາມຄະແນນ. ຖ້າຍັງບໍ່ຮອດ {min} ແມັດ (ຄູ່: {pmin}) ຄະແນນຍັງບໍ່ຄົງທີ່ ແລະ ມີປ້າຍ x/{min} ແມັດ; ຄົນທີ່ຍັງບໍ່ຄົງທີ່ຈະຢູ່ຫຼັງຄົນອື່ນ, ຄູ່ຍັງຮຽງຕາມຄະແນນ. <b>ຄູ່ທີ່ດີທີ່ສຸດ</b> = ຄູ່ທີ່ມີຄະແນນສູງສຸດ; <b>ຄະແນນດີທີ່ສຸດ</b> = ແມັດທີ່ຊະນະຫຼາຍທີ່ສຸດ.</p><p><b>ເປັນຫຍັງບໍ່ໃຊ້ຄະແນນ BWF World Tour?</b> BWF World Ranking ໃຫ້ຄະແນນຕາມຮອບທີ່ໄປຮອດໃນການແຂ່ງ (ເຊັ່ນ ແຊ້ມ Super 1000 ໄດ້ 12,000 ຄະແນນ) ແລະ ນັບ 10 ຜົນງານດີສຸດໃນ 52 ອາທິດ. ຕ້ອງມີການແຂ່ງຂັນ; ສຳລັບແມັດກຸ່ມປະຈຳອາທິດ Elo ຍຸຕິທຳກວ່າ ເພາະທຸກແມັດນັບ ແລະ ຊະນະຄົນເກັ່ງນັບຫຼາຍກວ່າ.</p><p><b>ລະດັບ</b> (BG … B&A) ຄົນເປັນຜູ້ຕັ້ງ, ບໍ່ແມ່ນຈາກຄະແນນ.</p> | match |
| `manualPlayersHint` | People without the app, for bills and games | ຄົນທີ່ບໍ່ມີແອັບ, ສຳລັບບິນ ແລະ ເກມ | People without the app, for bills and matches | ຄົນທີ່ບໍ່ມີແອັບ, ສຳລັບບິນ ແລະ ແມັດ | match |
| `deleteGroupHint` | Deletes the group for everyone: its polls, sessions, bills, games and stats, cock brands and manual players. Members stay in the app. This cannot be undone. | ລຶບກຸ່ມສຳລັບທຸກຄົນ: ໂພລ, ເຊດຊັນ, ບິນ, ເກມ ແລະ ສະຖິຕິ, ຍີ່ຫໍ້ລູກ ແລະ ຜູ້ຫຼິ້ນທີ່ເພີ່ມເອງ. ສະມາຊິກຍັງຢູ່ໃນແອັບ. ກູ້ຄືນບໍ່ໄດ້. | Deletes the group for everyone: its polls, sessions, bills, matches and stats, cock brands and manual players. Members stay in the app. This cannot be undone. | ລຶບກຸ່ມສຳລັບທຸກຄົນ: ໂພລ, ນັດຫຼິ້ນ, ບິນ, ແມັດ ແລະ ສະຖິຕິ, ຍີ່ຫໍ້ລູກ ແລະ ຜູ້ຫຼິ້ນທີ່ເພີ່ມເອງ. ສະມາຊິກຍັງຢູ່ໃນແອັບ. ກູ້ຄືນບໍ່ໄດ້. | match |
| `storyHint` | Add up to {n} photos — your game, your team, your court. | ເພີ່ມຮູບໄດ້ສູງສຸດ {n} ຮູບ — ເກມ, ທີມ, ເດີ່ນຂອງທ່ານ. | Add up to {n} photos — your session, your team, your court. | ເພີ່ມຮູບໄດ້ສູງສຸດ {n} ຮູບ — ນັດຫຼິ້ນ, ທີມ, ເດີ່ນຂອງທ່ານ. | play-day |
| `h2hNone` | No games yet | ຍັງບໍ່ມີເກມ | No matches yet | ຍັງບໍ່ມີແມັດ | match |
| `gamesWord` | games | ເກມ | matches | ແມັດ | match |
| `noGamesInPeriod` | No games in this period. | ບໍ່ມີເກມໃນຊ່ວງນີ້. | No matches in this period. | ບໍ່ມີແມັດໃນຊ່ວງນີ້. | match |
| `sessionTabGames` | Games | ເກມ | Matches | ແມັດ | match |
| `editGame` | Edit game | ແກ້ໄຂເກມ | Edit match | ແກ້ໄຂແມັດ | match |
| `saveGame` | Save game | ບັນທຶກເກມ | Save match | ບັນທຶກແມັດ | match |
| `gameSaved` | Game saved | ບັນທຶກເກມແລ້ວ | Match saved | ບັນທຶກແມັດແລ້ວ | match |
| `provisionalN` | {n}/{min} games | {n}/{min} ເກມ | {n}/{min} matches | {n}/{min} ແມັດ | match |
| `provisionalHint` | Still settling — the rating gets steadier with more games | ຍັງບໍ່ຄົງທີ່ — ຫຼິ້ນຫຼາຍເກມຄະແນນຈະແນ່ນອນຂຶ້ນ | Still settling — the rating gets steadier with more matches | ຍັງບໍ່ຄົງທີ່ — ຫຼິ້ນຫຼາຍແມັດຄະແນນຈະແນ່ນອນຂຶ້ນ | match |
| `provFadedNote` | Faded = fewer than {min} games, rating still settling. | ຈາງ = ຫຼິ້ນໜ້ອຍກວ່າ {min} ເກມ, ຄະແນນຍັງບໍ່ຄົງທີ່. | Faded = fewer than {min} matches, rating still settling. | ຈາງ = ຫຼິ້ນໜ້ອຍກວ່າ {min} ແມັດ, ຄະແນນຍັງບໍ່ຄົງທີ່. | match |
| `h2hNoGames` | No games in this period | ບໍ່ມີເກມໃນໄລຍະນີ້ | No matches in this period | ບໍ່ມີແມັດໃນໄລຍະນີ້ | match |
| `h2hEmptyPartners` | No partner with 2 or more games together in this period. | ບໍ່ມີຄູ່ຫູທີ່ຫຼິ້ນນຳກັນ 2 ເກມຂຶ້ນໄປໃນໄລຍະນີ້. | No partner with 2 or more matches together in this period. | ບໍ່ມີຄູ່ຫູທີ່ຫຼິ້ນນຳກັນ 2 ແມັດຂຶ້ນໄປໃນໄລຍະນີ້. | match |
| `h2hEmptyToughest` | No pair with a losing record yet (2 or more games). | ຍັງບໍ່ມີຄູ່ທີ່ເຮົາແພ້ຫຼາຍກວ່າຊະນະ (ຕັ້ງແຕ່ 2 ເກມ). | No pair with a losing record yet (2 or more matches). | ຍັງບໍ່ມີຄູ່ທີ່ເຮົາແພ້ຫຼາຍກວ່າຊະນະ (ຕັ້ງແຕ່ 2 ແມັດ). | match |
| `h2hEmptyEasiest` | No pair with a winning record yet (2 or more games). | ຍັງບໍ່ມີຄູ່ທີ່ເຮົາຊະນະຫຼາຍກວ່າແພ້ (ຕັ້ງແຕ່ 2 ເກມ). | No pair with a winning record yet (2 or more matches). | ຍັງບໍ່ມີຄູ່ທີ່ເຮົາຊະນະຫຼາຍກວ່າແພ້ (ຕັ້ງແຕ່ 2 ແມັດ). | match |
| `allMyMatches` | All my matches | ນັດທັງໝົດຂອງຂ້ອຍ | All my matches | ແມັດທັງໝົດຂອງຂ້ອຍ | match |
| `maCrumb` | All matches | ນັດທັງໝົດ | All matches | ແມັດທັງໝົດ | match |
| `maGameOne` | game | ເກມ | match | ແມັດ | match |
| `maOther` | Other games | ເກມອື່ນໆ | Other matches | ແມັດອື່ນໆ | match |
| `maNoMatch` | No games match these filters. | ບໍ່ມີເກມທີ່ກົງກັບຕົວກອງນີ້. | No matches fit these filters. | ບໍ່ມີແມັດທີ່ກົງກັບຕົວກອງນີ້. | match |
| `maSummary` | Summary of the games shown | ສະຫຼຸບເກມທີ່ສະແດງ | Summary of the matches shown | ສະຫຼຸບແມັດທີ່ສະແດງ | match |
| `maxPointsLabel` | Highest score in a game | ຄະແນນສູງສຸດໃນໜຶ່ງເກມ | Highest score in a match | ຄະແນນສູງສຸດໃນໜຶ່ງແມັດ | match |
| `gamesTitle` | Games | ເກມ | Matches | ແມັດ | match |
| `gamesEmpty` | No games recorded yet. | ຍັງບໍ່ມີເກມ. | No matches recorded yet. | ຍັງບໍ່ມີແມັດ. | match |
| `gamesEmptyPlayer` | Played a game? Add it — pick the pairs and who won. | ຫຼິ້ນແລ້ວບໍ? ເພີ່ມເກມ — ເລືອກຄູ່ ແລະ ຝ່າຍທີ່ຊະນະ. | Played a match? Add it — pick the pairs and who won. | ຫຼິ້ນແລ້ວບໍ? ເພີ່ມແມັດ — ເລືອກຄູ່ ແລະ ຝ່າຍທີ່ຊະນະ. | match |
| `addGame` | Add game | ເພີ່ມເກມ | Add match | ເພີ່ມແມັດ | match |
| `allGamesMaker` | Match maker & all games | ຈັດຄູ່ ແລະ ເກມທັງໝົດ | Match maker & all matches | ຈັດຄູ່ ແລະ ແມັດທັງໝົດ | match |
| `allGamesN` | All {n} games & match maker | ເກມທັງໝົດ {n} ເກມ ແລະ ຈັດຄູ່ | All {n} matches & match maker | ແມັດທັງໝົດ {n} ແມັດ ແລະ ຈັດຄູ່ | match |
| `pickWinnerN` | Game {n}: pick who won | ເກມ {n}: ເລືອກຝ່າຍທີ່ຊະນະ | Match {n}: pick who won | ແມັດ {n}: ເລືອກຝ່າຍທີ່ຊະນະ | match |
| `loserPointsN` | Game {n}: enter the loser's points | ເກມ {n}: ໃສ່ຄະແນນຝ່າຍແພ້ | Match {n}: enter the loser's points | ແມັດ {n}: ໃສ່ຄະແນນຝ່າຍແພ້ | match |
| `lvDesc_S` | Good social player. Smooth games and right positions, but may lack a strong smash or a steady backhand. | ຫຼິ້ນເປັນ, ເກມລື່ນໄຫຼ ແລະ ຢືນຕຳແໜ່ງຖືກ, ແຕ່ອາດຍັງຂາດລູກຕົບແຮງ ຫຼື ລູກຫຼັງມືທີ່ໝັ້ນຄົງ. | Good social player. Smooth play and right positions, but may lack a strong smash or a steady backhand. | ຫຼິ້ນເປັນ, ຫຼິ້ນລື່ນໄຫຼ ແລະ ຢືນຕຳແໜ່ງຖືກ, ແຕ່ອາດຍັງຂາດລູກຕົບແຮງ ຫຼື ລູກຫຼັງມືທີ່ໝັ້ນຄົງ. | match |
| `startingLevelHint` | A = strongest, D = beginner. Your group rating replaces it after 10 matches. | A = ເກັ່ງສຸດ, D = ມືໃໝ່. ຄະແນນຂອງກຸ່ມຈະແທນທີ່ຫຼັງ 10 ນັດ. | A = strongest, D = beginner. Your group rating replaces it after 10 matches. | A = ເກັ່ງສຸດ, D = ມືໃໝ່. ຄະແນນຂອງກຸ່ມຈະແທນທີ່ຫຼັງ 10 ແມັດ. | match |
| `leaveGroupConfirm` | Leave {name}? Your past games and payments stay in the group. | ອອກຈາກ {name}? ເກມ ແລະ ການຈ່າຍເງິນທີ່ຜ່ານມາຍັງຢູ່ໃນກຸ່ມ. | Leave {name}? Your past sessions and payments stay in the group. | ອອກຈາກ {name}? ນັດຫຼິ້ນ ແລະ ການຈ່າຍເງິນທີ່ຜ່ານມາຍັງຢູ່ໃນກຸ່ມ. | play-day |
| `openGames` | Open games | ເກມເປີດ | Open sessions | ນັດຫຼິ້ນເປີດ | play-day |
| `newPublicGame` | Host a public game | ເປີດເກມສາທາລະນະ | Host a public session | ເປີດນັດຫຼິ້ນສາທາລະນະ | play-day |
| `noOpenGames` | No open games yet in this city. Host one and fill the court! | ຍັງບໍ່ມີເກມເປີດໃນເມືອງນີ້. ເປີດເກມ ແລະ ຫາຄົນໃຫ້ເຕັມເດີ່ນ! | No open sessions yet in this city. Host one and fill the court! | ຍັງບໍ່ມີນັດຫຼິ້ນເປີດໃນເມືອງນີ້. ເປີດນັດຫຼິ້ນ ແລະ ຫາຄົນໃຫ້ເຕັມເດີ່ນ! | play-day |
| `cancelGame` | Cancel game | ຍົກເລີກເກມ | Cancel session | ຍົກເລີກນັດຫຼິ້ນ | play-day |
| `cancelGameConfirm` | Cancel this game? Everyone who joined is told. | ຍົກເລີກເກມນີ້? ທຸກຄົນທີ່ເຂົ້າຮ່ວມຈະໄດ້ຮັບແຈ້ງ. | Cancel this session? Everyone who joined is told. | ຍົກເລີກນັດຫຼິ້ນນີ້? ທຸກຄົນທີ່ເຂົ້າຮ່ວມຈະໄດ້ຮັບແຈ້ງ. | play-day |
| `deleteGameConfirm` | Delete this card for good? Nobody is told. Use Cancel game to tell the players. | ລຶບບັດນີ້ຖາວອນ? ຈະບໍ່ແຈ້ງໃຜ. ໃຫ້ກົດຍົກເລີກເກມ ຖ້າຕ້ອງການແຈ້ງຜູ້ຫຼິ້ນ. | Delete this card for good? Nobody is told. Use Cancel session to tell the players. | ລຶບບັດນີ້ຖາວອນ? ຈະບໍ່ແຈ້ງໃຜ. ໃຫ້ກົດຍົກເລີກນັດຫຼິ້ນ ຖ້າຕ້ອງການແຈ້ງຜູ້ຫຼິ້ນ. | play-day |
| `gameCancelled` | This game was cancelled | ເກມນີ້ຖືກຍົກເລີກແລ້ວ | This session was cancelled | ນັດຫຼິ້ນນີ້ຖືກຍົກເລີກແລ້ວ | play-day |
| `gameType` | Game type | ປະເພດເກມ | Session type | ປະເພດນັດຫຼິ້ນ | play-day |
| `modeHint_exercise` | Most court time: everyone plays the same number of games. | ຫຼິ້ນໄດ້ຫຼາຍສຸດ: ທຸກຄົນຫຼິ້ນຈຳນວນເກມເທົ່າກັນ. | Most court time: everyone plays the same number of matches. | ຫຼິ້ນໄດ້ຫຼາຍສຸດ: ທຸກຄົນຫຼິ້ນຈຳນວນແມັດເທົ່າກັນ. | match |
| `modeHint_competition` | Serious games: even teams. | ຈິງຈັງ: ທີມສົມດຸນ. | Serious matches: even teams. | ຈິງຈັງ: ທີມສົມດຸນ. | match |
| `publicNoRating` | Public games never change a group's ranking. | ເກມສາທາລະນະບໍ່ປ່ຽນອັນດັບຂອງກຸ່ມ. | Public sessions never change a group's ranking. | ນັດຫຼິ້ນສາທາລະນະບໍ່ປ່ຽນອັນດັບຂອງກຸ່ມ. | play-day |
| `gamePosted` | Game posted | ໂພສເກມແລ້ວ | Session posted | ໂພສນັດຫຼິ້ນແລ້ວ | play-day |
| `upcomingGamesN` | {n} open game(s) | {n} ເກມເປີດ | {n} open session(s) | {n} ນັດຫຼິ້ນເປີດ | play-day |
| `seeActivityHint` | Votes, games, dinners and spending by period | ໂຫວດ, ຫຼິ້ນ, ກິນເຂົ້າ ແລະ ລາຍຈ່າຍ ຕາມໄລຍະ | Votes, sessions, dinners and spending by period | ໂຫວດ, ຫຼິ້ນ, ກິນເຂົ້າ ແລະ ລາຍຈ່າຍ ຕາມໄລຍະ | play-day |
| `trashKind_session` | Session | ເຊສຊັ່ນ | Session | ນັດຫຼິ້ນ | play-day |
| `trashKind_matches` | Games of a session | ເກມຂອງເຊສຊັ່ນ | Matches of a session | ແມັດຂອງນັດຫຼິ້ນ | match |
| `trashGamesLabel` | {name} · {n} games | {name} · {n} ເກມ | {name} · {n} matches | {name} · {n} ແມັດ | match |
| `createSession` | Create session | ສ້າງເຊສຊັ່ນ | Create session | ສ້າງນັດຫຼິ້ນ | play-day |
| `sessionCreated` | Session created | ສ້າງເຊສຊັ່ນແລ້ວ | Session created | ສ້າງນັດຫຼິ້ນແລ້ວ | play-day |
| `playedWord` | Sessions | ເຊສຊັ່ນ | Sessions | ນັດຫຼິ້ນ | play-day |
| `showUpHint` | Show-up = games played ÷ Join votes | ມາຕາມນັດ = ຈຳນວນທີ່ຫຼິ້ນແທ້ ÷ ຈຳນວນທີ່ໂຫວດມາ | Show-up = matches played ÷ Join votes | ມາຕາມນັດ = ຈຳນວນທີ່ຫຼິ້ນແທ້ ÷ ຈຳນວນທີ່ໂຫວດມາ | match |
| `scSessionOf` | Game day {n} of {m} | ມື້ຫຼິ້ນ {n} ຈາກ {m} | Session {n} of {m} | ນັດຫຼິ້ນ {n} ຈາກ {m} | play-day |
| `healthDisclaimer` | Wellness estimate for fun and motivation. Not medical advice. Game minutes come from the live score; games typed in without minutes are not counted. | ການຄາດຄະເນເພື່ອຄວາມມ່ວນ ແລະ ກຳລັງໃຈ. ບໍ່ແມ່ນຄຳແນະນຳທາງການແພດ. ນາທີເກມມາຈາກຄະແນນສົດ; ເກມທີ່ພິມເອງໂດຍບໍ່ມີນາທີຈະບໍ່ຖືກນັບ. | Wellness estimate for fun and motivation. Not medical advice. Match minutes come from the live score; matches typed in without minutes are not counted. | ການຄາດຄະເນເພື່ອຄວາມມ່ວນ ແລະ ກຳລັງໃຈ. ບໍ່ແມ່ນຄຳແນະນຳທາງການແພດ. ນາທີແມັດມາຈາກຄະແນນສົດ; ແມັດທີ່ພິມເອງໂດຍບໍ່ມີນາທີຈະບໍ່ຖືກນັບ. | match |
| `healthOnCourt` | On court, {n} games | ໃນສະໜາມ, {n} ເກມ | On court, {n} matches | ໃນສະໜາມ, {n} ແມັດ | match |
| `healthChartAria` | Heart rate through the session with your zones and games | ອັດຕາຫົວໃຈຕະຫຼອດຄັ້ງ ພ້ອມໂຊນ ແລະ ເກມ | Heart rate through the session with your zones and matches | ອັດຕາຫົວໃຈຕະຫຼອດຄັ້ງ ພ້ອມໂຊນ ແລະ ແມັດ | match |
| `healthLegendGame` | Game | ເກມ | Match | ແມັດ | match |
| `healthLegendClose` | Close game (2 points or less) | ເກມສູສີ (ຕ່າງ 2 ແຕ້ມ ຫຼື ໜ້ອຍກວ່າ) | Close match (2 points or less) | ແມັດສູສີ (ຕ່າງ 2 ແຕ້ມ ຫຼື ໜ້ອຍກວ່າ) | match |
| `healthEmpty` | No timed games in this period. Play with the live score and your workouts show up here. | ບໍ່ມີເກມທີ່ຈັບເວລາໃນໄລຍະນີ້. ຫຼິ້ນດ້ວຍຄະແນນສົດ ແລ້ວການອອກກຳລັງຈະມາປາກົດທີ່ນີ້. | No timed matches in this period. Play with the live score and your workouts show up here. | ບໍ່ມີແມັດທີ່ຈັບເວລາໃນໄລຍະນີ້. ຫຼິ້ນດ້ວຍຄະແນນສົດ ແລ້ວການອອກກຳລັງຈະມາປາກົດທີ່ນີ້. | match |
| `healthChartLegend` | Heart rate, coloured by your zones. Numbers on top are the games. | ອັດຕາຫົວໃຈ ແຍກສີຕາມໂຊນຂອງທ່ານ. ຕົວເລກດ້ານເທິງແມ່ນເກມ. | Heart rate, coloured by your zones. Numbers on top are the matches. | ອັດຕາຫົວໃຈ ແຍກສີຕາມໂຊນຂອງທ່ານ. ຕົວເລກດ້ານເທິງແມ່ນແມັດ. | match |
| `healthGamesIn` | Games in this workout | ເກມໃນການອອກກຳລັງນີ້ | Matches in this workout | ແມັດໃນການອອກກຳລັງນີ້ | match |
| `healthOpenSession` | Open the session | ເປີດຄັ້ງຫຼິ້ນ | Open the session | ເປີດນັດຫຼິ້ນ | play-day |
| `unconfirmPollAsk` | Delete only the poll ({name})? The session, its bill and games stay. The poll goes to Recently deleted for 30 days. | ລຶບສະເພາະໂຫວດ ({name})? ເຊສຊັ່ນ, ບິນ ແລະ ເກມຍັງຢູ່. ໂຫວດຈະຢູ່ໃນ "ລຶບຫຼ້າສຸດ" 30 ວັນ. | Delete only the poll ({name})? The session, its bill and matches stay. The poll goes to Recently deleted for 30 days. | ລຶບສະເພາະໂຫວດ ({name})? ນັດຫຼິ້ນ, ບິນ ແລະ ແມັດຍັງຢູ່. ໂຫວດຈະຢູ່ໃນ "ລຶບຫຼ້າສຸດ" 30 ວັນ. | match |
| `confirmPlanAsk` | Confirm this plan with {n} players ({when}) and create the session? | ຢືນຢັນແຜນນີ້ກັບ {n} ຄົນ ({when}) ແລະ ສ້າງເຊສຊັ່ນ? | Confirm this plan with {n} players ({when}) and create the session? | ຢືນຢັນແຜນນີ້ກັບ {n} ຄົນ ({when}) ແລະ ສ້າງນັດຫຼິ້ນ? | play-day |
| `sessionDetail` | Session Detail | ລາຍລະອຽດເຊສຊັ່ນ | Session Detail | ລາຍລະອຽດນັດຫຼິ້ນ | play-day |
| `totalSession` | Total Session | ລວມເຊສຊັ່ນ | Total bill | ລວມບິນ | bill |
| `deleteSession` | Delete Session | ລຶບເຊສຊັ່ນ | Delete Session | ລຶບນັດຫຼິ້ນ | play-day |
| `deleteConfirm` | Delete this session? Its games, Hall of Fame record and poll are deleted too. You can undo for 30 days. | ລຶບເຊສຊັ່ນນີ້? ເກມ, ປະຫວັດແຊມ ແລະ ໂຫວດຂອງມັນຈະຖືກລຶບນຳ. ກູ້ຄືນໄດ້ພາຍໃນ 30 ວັນ. | Delete this session? Its matches, Hall of Fame record and poll are deleted too. You can undo for 30 days. | ລຶບນັດຫຼິ້ນນີ້? ແມັດ, ປະຫວັດແຊມ ແລະ ໂຫວດຂອງມັນຈະຖືກລຶບນຳ. ກູ້ຄືນໄດ້ພາຍໃນ 30 ວັນ. | match |
| `sessionsAttended` | Sessions Attended | ເຊສຊັ່ນທີ່ເຂົ້າຮ່ວມ | Sessions Attended | ນັດຫຼິ້ນທີ່ເຂົ້າຮ່ວມ | play-day |
| `noSessions` | No sessions yet | ຍັງບໍ່ມີເຊສຊັ່ນ | No sessions yet | ຍັງບໍ່ມີນັດຫຼິ້ນ | play-day |
| `createFirst` | Confirm a poll, or start a session here | ຢືນຢັນໂຫວດ ຫຼື ເລີ່ມເຊສຊັ່ນຢູ່ນີ້ | Confirm a poll, or start a session here | ຢືນຢັນໂຫວດ ຫຼື ເລີ່ມນັດຫຼິ້ນຢູ່ນີ້ | play-day |
| push `startT/startB..gameCancelT` (en) | Game in 1 hour / joined your game / Game full / Game cancelled | | Session in 1 hour / joined your session / Session full / Session cancelled | | play-day |
| push `gameJoinT/gameFullT/gameCancelT` (la) | | ເຂົ້າຮ່ວມເກມຂອງທ່ານ / ເກມເຕັມແລ້ວ / ເກມຖືກຍົກເລີກ | | ເຂົ້າຮ່ວມນັດຫຼິ້ນຂອງທ່ານ / ນັດຫຼິ້ນເຕັມແລ້ວ / ນັດຫຼິ້ນຖືກຍົກເລີກ | play-day |
| index.html `navGames`, `publicGameBanner` fallback | Games / Everyone can see this game | | Sessions / Everyone can see this session | | play-day |

## v254: Bottom bar "Session", Create shortcut "Play"
- User named them: bottom bar `navGames` = "Session" / "ເຊດຊັນ" (also the breadcrumb root); the Create tile that starts a session now (Home Create row and the create sheet) uses the new key `homeShortPlay` = "Play" / "ຫຼິ້ນ".
- `homeGame` keeps "Session" / "ນັດຫຼິ້ນ" for the other places (public game detail breadcrumb). Matches stay "Match / ແມັດ", the money tab stays "Bill / ບິນ".

## v255: 3D Market icon is a market stall
- `ART_3D.market` (js/icons.js) redrawn: red striped awning on two posts, wooden counter, a teal shuttle tube and a racket. Original art, existing `g3d-` gradients only (no new defs). Same drawing for all three Friends/Live variants.

## v256: Bottom bar with a bulge, floating rounded bar, light circle
- Shape: `.nb-bar` is a rounded rectangle (radius 26px) inset `--nav-inset` 12px from the sides and `--nav-gap` 10px + safe area from the bottom, soft shadow. One SVG `.nb-hump` (88x26: cubic S-curve, flat tails, 24px rise, flat top) sits above the bar's top edge, centred exactly on the active item, and moves with `translateX` only (spring .4s, instant for reduced motion). Its fill overlaps the bar by 1.5px (no seam); its stroke is shifted .5px to line up with the bar's 1px top border.
- `positionNavHump()` (js/router.js, was `positionNavNotch`) measures the active item. No clamp: when the hump would reach a rounded bar end, that top corner's inline radius shrinks to the room left (`min(26, cx - half)`, 0 at most), so both shoulders always show on the first and last slot. The radius transitions with the hump. Nav has 34px side padding.
- Circle: `.nav-icon::before` 52px, centre on the hump's top (lift 46px). `--nav-dot`: #fff on light, #f8fafc on dark and all specials. Glyph `--nav-ico` = `--primary` mixed 62% with #0b1220 (>= 7:1 on the circle in every theme), and the duotone half of the glyph (`[opacity]`) is raised to .88 so the icon is strong. Ring 3px in `--surface`, inner 1px accent hairline, glow `0 6px 18px rgba(var(--accent-rgb), .35)`. Active label stays `--accent-text` bold (>= 4.8:1 on the bar).
- Vars: `--nav-h` 66px, `--nav-gap` 10px, `--nav-inset` 12px, `--nav-lift` 54px (clearance above the bar for FAB/toast), `--nav-bar` = `--nav-h` + `--nav-gap` + safe area (single source for page padding, action bars, toasts).
- uimatrix: the harness shows the 5-slot bar, checks `nav-icon-contrast` (>=3) and `nav-label-contrast` (>=4.5) (colours from `color-mix()` are normalised through a canvas), and the wrapper hash accepts `"act":"nav-stats"` to show another slot as active for screenshots.
