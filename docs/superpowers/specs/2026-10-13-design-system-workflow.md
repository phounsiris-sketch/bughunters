# Godsmash: design system and workflow (agreed with the group owner)

Prototype with every screen: the "Godsmash UI Prototype" canvas (private link held by the owner). This file is the written version. Not every screen is built yet: see Rollout.

## Rules (every screen)
1. **Picture before words.** A bar, ring, dot or icon says it first; text only adds a number.
2. **A person is always a photo and a name.** `personHtml(uid)` / `peopleHtml(uids)` / `teamHtml(team)`. A group shows 3 and "+N". Never a bare circle and never a bare name.
3. **One primary action per screen.** One gradient button; the rest are quiet.
4. **Stepper only where order is required** (create a vote/game/dinner, make a bill). Browsing uses tabs and a status tracker.
5. **One card family.** Same radius, border, shadow and title style. Same app look as today (teal-to-blue header, Montserrat + Noto Sans Lao, Solar icons).
6. **One colour language.** blue = vote, teal = playing, orange = to pay, green = done, red = cancelled/out, gray = guest/neutral.

## Components (`js/ui.js`, styles at the end of `css/styles.css`)
`personHtml`, `peopleHtml`, `teamHtml`, `pillHtml`, `voteBarHtml`, `trackerHtml`, `dateBlockHtml`, `iconStatHtml`. Home uses the gradient stat cards (`js/home.js`, `.hs-*`).

## Workflow
Home (my stats, shortcuts, create, next game) → **Create**: Vote / Game / Dinner, each its own 2-step flow → **Games** (votes and sessions in one list) → a game has a tracker **Plan → Play → Pay → Done** and tabs Overview, Players, Games, Bill → Live score, Add score and Make bill (4 steps, with a who-pays-whom preview) belong to Play and Pay.
Bottom bar: Games · Rankings · **Home** (middle) · Community · Me. The + button opens Create.

## Live score (decided)
One phone counts, saves at the end. Auto rules: first to 21, win by 2, cap 30 (30 wins), side swap at 11 in the last game. Left half of a team = minus, right half = plus. The team that scores serves (shuttle icon). Menu: Exit, Reset, Settings. Settings: current game, teams playing, theme colour (Classic, Sunset, Forest, Ocean, Night). Saves into the game record that exists today.

## Rollout (one branch per slice, merged when the owner says so)
| Slice | Content | Version |
|---|---|---|
| 0 | Home, Lao first run, invite link, sign-out confirm | v63 (live) |
| 1 | Shared components + photo-and-name rule on session cards, settle rows, poll voters, game rows, Home | v64 |
| 2 | Live score (setup, counter, menu, settings, final) | v65 |
| 3 | Games list (votes + sessions merged) and bottom bar | v66 |
| 4 | Game page: tracker + tabs + sticky action | v67 |
| 5 | Create Vote / Create Game (2 steps each) | v68 |
| 6 | Make bill steps + money fixes from the UX QA | v69 |
| 7 | Dinner as its own item (needs a data-model decision) | later |
