# Bill safety: preview, paid marks, no lost updates (v69)

From the UX QA (money flow). 1) **Check before publishing:** modal with the total and who pays whom (`personHtml`), the rounding note, *Publish bill*. 2) **Paid marks survive an edit** when the same payment (from + to) keeps the same amount (`_keepPaidMarks`); if marks would be cleared the organiser is asked first (`billDropMarks`). 3) **Unmark asks first.** 4) **Marking paid writes field paths** (`settled.<key>`, `settledAt.<key>`, `status`) instead of the whole map, so simultaneous marks do not overwrite. The Firestore rule already allows exactly `settled, settledAt, status` for members, so **no rules change**.
Not done (needs a rules change or more design): who marked a payment (`settledBy`), the payer not being a player, one number per debt on every card, the 4-step bill screen from the prototype (the bill form stays one page; the preview is the last step).
**Version:** v69.
