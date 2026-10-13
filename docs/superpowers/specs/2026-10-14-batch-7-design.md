# Batch 7 (v85)

1. **Which request was blocked:** `dbOnError(err, where)`; every Firestore listener names itself, so the red bar and the console say e.g. `[sessions]`. Without a label a permission error could not be traced to a collection. The rules were re-read against everything added since the last publish (restaurants, photos, logos, repeats, live matches, gear delete, group logo): no rule needs to change.
2. **Mail spam guard:** one *forgot password* and one *resend verification* request per minute per phone (`localStorage`), counted from the press (so failed requests are limited too), with a visible countdown and a toast; the clocks are separate. A phone limit only slows casual spam: the real limit lives at Firebase Auth.
**Version:** v85.
