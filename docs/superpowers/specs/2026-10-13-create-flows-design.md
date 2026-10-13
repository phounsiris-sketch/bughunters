# Create a vote / a game in two steps (v68)

Vote: 1 When and where (day strip, date, time, court, hours) · 2 Vote options (play mode, note, answers). Game (session): 1 When and where (+ play mode) · 2 Who plays (photo + name chips) with Create. Step bar on top (`wizBarHtml`), a 7-day strip (`dayStripHtml`), a summary row on step 2, Back / Next buttons. Same fields and same save code as before: only the screen is split (`step` lives in `newPoll` / `newSes` and is not saved).
Not done: Dinner as its own flow (needs a data-model decision), the "Who votes" and deadline tiles from the prototype (those fields do not exist yet), copy-from-last.
**Version:** v68.
