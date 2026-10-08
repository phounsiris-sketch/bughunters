# Godsmash — Know-how

How the app works, how to use each feature, where its data lives and how to
run it. App version at the time of writing: **v48**.

- App: https://phounsiris-sketch.github.io/bughunters/
- Backend: Firebase project `godsmash-badminton` (Firestore + Auth, free Spark plan)
- Code: plain JavaScript PWA, with no build step. `index.html` loads `js/*.js` in order.

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
| **Public** | Pink/purple with a "Public — everyone can see this" banner | Every signed-in user | Open games, play buddies, public groups, the court directory |

**Bottom bar:** Polls · Sessions · **Home** (middle) · Stats · Public.
Stats and Public only show once groups are turned on (see section 15).

**Header:** the group name with ▾ (tap it to switch group), the 🔔
notifications button, and the ⚙ Settings button.

**Settings (⚙):** profile, appearance (dark/light, 5 colours each), language
(English / Lao), group settings, members, courts, shuttlecocks, players,
recently deleted, and admin tools.

---

## 2. Getting started

1. Open the app link and **sign in with Google**.
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
| Default payers | Who usually pays the court and the shuttles, prefilled on new bills |
| Usual days / time | When the group usually plays, shown to people looking for a group |
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

---

## 4. Polls: planning a game

1. Polls → **+**. Fill in the date, time, court and duration. Optionally:
   - set the **mode**: *Fun*, *Exercise* or *Competition*. Only Competition matches count for rankings.
   - set the **game type**: men's doubles, women's doubles, mixed or singles.
   - change the answers. The default is **Join / Skip**.
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
| Dinner | Total bill, who paid, who ate, and an optional photo of the receipt |

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

### Matches button

In a session (groups only), the **Matches** button shows the mode badge and
opens that session's matches (see section 7).

**Deleting** a session or poll moves it to **Recently deleted** (Settings), where
it can be restored for **30 days**.

---

## 6. Courts and map pins

All groups share **one court directory**: name, address, phone, number of courts,
and a map pin. **Prices are not shared.** Each group sets its own price per hour.

- **Add a court to your group:** Settings → Courts → *Add* → choose one from the
  directory, or create a new one. Then enter your group's price.
- **Pin the location:** in the court form, open the map, then do one of these:
  - tap the map;
  - tap **Use my location**;
  - paste a **Google Maps link**. Both `@lat,lng` and `?q=lat,lng` forms work, as
    do plain `lat, lng` numbers.
- Once a court has a pin, sessions, polls and open games show a **Directions**
  link that opens Google Maps. Public → Courts lists courts by distance from you.

The map uses Leaflet (bundled in `js/vendor/leaflet/`) with free OpenStreetMap
tiles, so it needs no API key and costs nothing.

---

## 7. Matches, stats and rankings

Stats are **private to each group**. They are never shown in the public zone or
compared across groups.

### Recording a match

1. Open the session → **Matches** → **+ Record a match**. Or tap **Start → record
   score** on the match-maker suggestion.
2. Pick the two teams. Men's doubles is the usual case.
3. Enter the game scores, for example 21–15 and 18–21. A **third game** box
   appears only when the games are 1–1. Invalid badminton scores are refused
   (21 points, win by 2, maximum 30).
4. Optionally enter the **minutes played**. You type the number; there is no running clock.

A match **counts** once someone on the other team taps **Confirm**, or
automatically **24 hours** after it was recorded. Until it is confirmed, the person
who recorded it can fix or delete it. Admins can always delete a match.

### Match maker and round robin

- **Next match** suggests even teams from the session's players. Those who have
  played least go first, then those who have waited longest. **Shuffle** gives another suggestion.
- **Start a round robin** makes even pairs (strongest player with weakest). Every
  pair plays every other pair, and the table shows wins, losses and point difference.

### Stats tab

| Tab | Shows |
|---|---|
| **Ranking** | **Pair ranking first**, then the individual ranking. This month or all time |
| **Head to head** | Pick two players or two pairs to see their record against each other |
| **Progress** | Rating over time (sparkline), matches and minutes per month, win rate, longest win streak |

How the numbers are worked out:

- **Ratings** are Elo-style. Everyone starts at 1500 (K = 32). Beating stronger
  players earns more, and a bigger point difference earns a little more. Pairs
  have their own rating.
- Only **confirmed Competition** matches with a score change ratings. Fun and
  Exercise matches still count toward matches and minutes played.
- You appear in the individual ranking after **10** competition matches. A pair
  appears after **5** matches together.
- **Levels A–D** come from where you stand in the group (by percentile). Players
  with the same rating share a level. Before you are ranked, the level shown is
  the one an admin set or your self-rating.
- **Badges:** first match, 50 and 100 matches, 5 and 10 wins in a row, 5 courts,
  1,000 minutes, and pair of the month.
- **Monthly recap:** the button makes a shareable PNG of your month. On phones it
  opens the share sheet; on computers it downloads.

---

## 8. Profile, privacy and gear

Settings → Profile.

### About me

All fields are optional: gender, level (self-rated), hand, position, home court,
free days, date of birth (shown as age) and relationship status.

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

Add rackets and shoes, each with a name, brand, photo and details (weight,
string and tension, or shoe size). Mark **one racket and one pair of shoes as
your main item**; it shows on your profile.

Tick **For sale** and set a price, and the item appears on **Home → Gear for
sale** for members of your groups.

---

## 9. The public zone

Choose your **city** at the top. The choice is remembered on your device.

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
  - your city, free times and a short intro.
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
- **Reporting:** ⋯ → **Report**, with a reason and details.
  - A report made inside a group goes to that group's admins.
  - A report made from the public zone goes to the app owner.
  - Details are limited to 300 characters.

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
| `matches/{id}` | groupId, sessionId, date, type, mode, teamA, teamB, games `[{a,b}]`, minutes, confirmed | Firestore has no nested arrays, so games are `{a,b}` objects |
| `courts/{id}` | name, address, phone, courts, lat, lng, createdBy | Shared; **no price** |
| `shuttlecocks/{id}` | groupId, brand, price, cocksPerTube | |
| `gear/{id}` | uid, kind, name, brand, photo, main, forSale, salePrice | |
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
| No Stats or Public tab | Groups aren't active yet. Do section 15, then reopen the app |
| "Missing or insufficient permissions" | The rules weren't published, or the person lacks the right. Check their role and permissions in Settings → Members |
| Something new was created but others can't see it | It has no `groupId` (it was made between the migration and the rules publish). Rerun *Migrate to groups* |
| Invite link does nothing | Make sure the person is signed in. If the code was reset, ask an admin for the new link |
| No push notifications | iPhone: install to the Home Screen first. Check notifications are on in Settings → Profile. Check that the last `push.yml` run succeeded and that the cron-job.org job is active |
| Pushes stopped entirely | The GitHub token in cron-job.org may have expired. Make a new one and paste it **only** into cron-job.org |
| Old version still showing | Close the app fully and reopen it. Settings shows the version number |
| Weekly backup failed | The `BACKUP_PASSWORD` secret is missing |
| Two accounts for one person | Run *Merge players* (dry run first) |
| Not in the ranking | You need 10 confirmed Competition matches (pairs need 5) |
| A match doesn't count | The other team hasn't confirmed it yet. It counts automatically after 24 h |
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
