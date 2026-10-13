# Games list and new bottom bar (v66)

## Bottom bar
Games · Rankings · **Home** (middle) · Community · Me. (Was Polls · Sessions · Home · Stats · Public.) Rankings/Community keep the "groups on" rule. Me opens the profile. The Games badge = votes to answer + payments to make.

## Games (`js/games.js`, page `games`)
Votes and sessions in one list, same card: date block, court, icon stats, status pill, 4-segment bar (Plan, Play, Pay, Done), vote bar for a vote, people (photo + name), call to action. Steps: vote = 0; session: not calculated = 1 (Play), calculated with open payments = 2 (Pay), completed or all paid = 3 (Done). Filters: Upcoming (steps 0-1), Past (2-3), All. A confirmed vote is hidden (its session is shown); cancelled votes and old open votes are hidden. The floating + opens the Create sheet (Vote, Game, Live score, Add score).

## Data and rules
No data change, no rules change. Polls and sessions stay separate; the old pages stay reachable (links under the list).

## Not in this slice
Dinner as its own item; the Game page tracker and tabs (next slice).
**Version:** v66.
