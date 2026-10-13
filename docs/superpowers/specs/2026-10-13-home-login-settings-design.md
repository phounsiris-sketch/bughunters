# Home page, sign-in fixes, sign-out confirm (v63)

Origin: UX QA (docs/qa/) and the prototype agreed with the group owner. First slice of the restructure; polls and sessions are not merged yet.

## Sign-in
- First run opens in **Lao** (was English). The saved choice still wins.
- Password has a **Show / Hide** button; a short hint says an invite link joins you after sign-in.
- **Invite link survives sign-up and the email check:** a `#join=` hash is saved in `localStorage` (`pendingJoin`) and replayed by `joinFromHash()`; it is cleared once used.
- **Pinch-zoom is allowed** again (viewport no longer has `maximum-scale=1, user-scalable=no`); `viewport-fit=cover` added.

## Settings
- **Sign out asks first** (`confirmSignOut`).

## Home (`js/home.js`, new page `home`, the middle nav button, landing after sign-in)
Order: greeting; swipeable **stat cards** (Play, Spending, Payments, Badges, Rating); shortcuts (**Find court** = Public > Games, **Find friends** = Public > Buddies, **Market**); **Create** (Vote, Game, Add score, Pay); **Next game** (soonest open vote or upcoming session).
- No new data and no rules change: everything is read from `computeStats`, `_sumSessions`, `myPaymentSummary`, `badgesFor`, `lastPolls`, `lastSessions`.
- The old Dashboard page stays (Spending card opens its Spending tab).
- Add score opens the Games tab of the latest running session; with none it says so.

## Not in this slice
Games (polls + sessions merged), standalone Dinner, Live score, Create wizards, bill steps.
**Version:** v63.
