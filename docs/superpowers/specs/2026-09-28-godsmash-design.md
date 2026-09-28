# Godsmash — Badminton Booking & Cost Splitting PWA v2

## Overview

Multi-user PWA for scheduling badminton sessions via poll-style voting, splitting court/shuttlecock/dinner costs, and tracking financial stats. Replaces localStorage-only v1 with Firebase backend for real-time multi-user sync.

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | Single-page PWA (vanilla JS) | Keep simple, no build step |
| Auth | Firebase Authentication (Email OTP/Link) | Secure identity, no passwords |
| Database | Cloud Firestore | Aggregation queries for dashboard |
| Storage | Firebase Storage | Bill photos, QR code images |
| Hosting | GitLab Pages (gitlab.com/phounsiri.s/godsmash) | Already deployed |
| Icons | Solar Icon Set (SVG) | Consistent, modern icon system |

## Authentication

- Firebase Email Link (passwordless OTP) sign-in
- First login: enter email, receive OTP/magic link, verify
- Profile setup after first auth: display name, phone number (optional)
- Session persists via Firebase SDK (auto-refresh tokens)
- No password — email OTP only

## Data Model

### Firestore Collections

```
users/{uid}
  email: string
  displayName: string
  phone: string | null
  avatarUrl: string | null
  createdAt: timestamp

polls/{pollId}
  createdBy: uid
  status: "draft" | "open" | "confirmed" | "cancelled"
  options: [{
    date: string (YYYY-MM-DD)
    time: string (HH:mm)
    courtId: string
  }]
  minPlayers: 4 (fixed)
  votes: {
    "0": [uid, uid, ...],  // option index -> voter UIDs
    "1": [uid, uid, ...]
  }
  confirmedOption: number | null
  sessionId: string | null  // linked after confirmation
  createdAt: timestamp

sessions/{sessionId}
  pollId: string
  date: string
  time: string
  courtId: string
  courtName: string
  status: "active" | "completed"
  players: [uid, ...]
  courtPayer: uid
  shuttlePayer: uid
  shuttlecocks: [{
    brandId: string
    name: string
    qty: number          // cocks used
    pricePerTube: number
    cocksPerTube: 12
  }]
  otherCosts: [{ label: string, amount: number }]
  splits: {
    [uid]: {
      court: number
      shuttle: number
      dinner: number
      total: number
      paid: boolean
    }
  }
  createdAt: timestamp

sessions/{sessionId}/dinner (subcollection, single doc "info")
  totalBill: number
  receiptUrl: string        // Firebase Storage path
  diners: [uid, ...]
  splitPerPerson: number
  paidBy: uid

settings/qrCodes (single doc)
  courtPayer: {
    name: string
    qrUrl: string           // Firebase Storage path
  }
  shuttlePayer: {
    name: string
    qrUrl: string           // Firebase Storage path
  }

courts/{courtId}
  name: string
  location: string
  pricePerHour: number

shuttlecocks/{brandId}
  name: string
  pricePerTube: number
  cocksPerTube: 12
```

### Firestore Security Rules

- Authenticated users can read all collections
- Users can only update their own `users/{uid}` doc
- Any authenticated user can create/update polls, sessions
- Admin (first registered user or configurable) can manage settings, courts, shuttlecocks

## Core Flows

### 1. Poll → Session

1. Organizer creates poll with 2-5 date/time/court options
2. Poll status set to "open"
3. Players open app, see active polls, vote on preferred options
4. Each player can vote on multiple options (not just one)
5. When any option reaches 4+ votes → auto-confirm:
   - Poll status → "confirmed"
   - `confirmedOption` set to winning index
   - Session document created with voters as players
6. Organizer can manually cancel poll

### 2. Session → Cost Split

1. After play, organizer opens session
2. Enters: shuttlecocks used (qty in cocks, auto-converts to tubes for pricing)
3. Selects court payer and shuttle payer from player list
4. App calculates per-person split:
   - Court cost = court price / number of players
   - Shuttle cost = (cocks used / cocksPerTube) * pricePerTube / number of players
   - Other costs split equally
5. Payment section shows 2 static QR codes:
   - Court payer QR + name
   - Shuttle payer QR + name
6. Each player can mark themselves as "paid"
7. Session status → "completed" when all paid

### 3. Dinner Split

1. After session, organizer taps "Add Dinner"
2. Enters total bill amount
3. Uploads receipt photo (camera or gallery)
4. Selects diners (default: all session players, can deselect)
5. Equal split: totalBill / number of diners
6. Dinner cost added to each diner's session split
7. Receipt viewable by all players

### 4. Dashboard

**Balance Tab:**
- Running balance: who owes who across all sessions
- Net debt calculation (A owes B 50k, B owes A 30k → A owes B 20k)
- Settle up button (marks debts as cleared)

**Spending Tab:**
- Per-player total spending (court + shuttle + dinner)
- Bar chart: monthly/quarterly/yearly toggle
- Breakdown: court vs shuttle vs dinner

**Activity Tab:**
- Most active players: ranked by sessions attended
- Monthly/quarterly/yearly filter
- Attendance rate: sessions attended / total sessions

## Pages & Navigation

Bottom tab bar (4 tabs):

### Tab 1: Polls (Solar: `calendar-bold`)
- Active polls with voting status
- Create new poll FAB button
- Poll detail: vote, see who voted, countdown

### Tab 2: Sessions (Solar: `clipboard-list-bold`)
- Upcoming confirmed sessions
- Past sessions (completed)
- Tap → Session Detail page

### Tab 3: Dashboard (Solar: `chart-square-bold`)
- Balance / Spending / Activity tabs
- Charts and stats

### Tab 4: Settings (Solar: `settings-bold`)
- Profile (name, phone)
- QR code management (upload 2 QR images)
- Courts management (CRUD)
- Shuttlecock brands (CRUD)
- Player list

### Session Detail Page (push view, not tab)
- Session info: date, time, court
- Player list with attendance
- Cost breakdown table
- Court payer QR + Shuttle payer QR
- Dinner section (bill, receipt photo, split)
- Payment status per player

## UI Design

- Dark/Light theme toggle (existing)
- Lao/English language toggle (existing)
- Solar Icon Set (SVG) for all icons
- Mobile-first, max-width 480px
- Card-based layout (existing style)
- Teal/blue gradient header (existing)
- Green accent for CTAs
- Fonts: Montserrat (English), Noto Sans Lao (Lao) — loaded via Google Fonts

## Firebase Project Setup

- Project name: `godsmash-badminton`
- Enable: Authentication (Phone), Firestore, Storage
- Firebase SDK via CDN (no build step needed)
- Email link auth (no reCAPTCHA needed)

## Offline Support

- Service worker caches app shell
- Firestore offline persistence enabled
- Polls/sessions readable offline
- Writes queued and synced when online
- Dashboard data cached locally

## i18n

- English and Lao (existing system)
- All new strings added to both languages
- Date/time formatting locale-aware

## Out of Scope (v2)

- Push notifications (can add in v3)
- Player matchmaking / skill rating
- Tournament brackets
- Chat / messaging
- Bank API integration for dynamic QR
