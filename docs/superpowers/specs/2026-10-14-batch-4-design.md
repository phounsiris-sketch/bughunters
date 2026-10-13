# Batch 4 (v81): logo, Home tightening, calendar week, cleanups

1. **Group logo** (`groups.logo`, an image reference like restaurant photos): `groupLogoHtml(group, size)` in the header, switcher and group list; admins change it in Group settings. The groups rule already lets admins update their group, so no rules change.
2. **Edge touching:** the stat strip has `scroll-padding` and a trailing spacer.
3. **Home size:** small right-aligned greeting; stat cards 150 px high; smaller shortcuts, Create block and Next game card.
4. **Recap buttons** removed (Profile and badges header). `makeRecap()` stays in the code.
5. **Calendar:** a week by default (`calendarHtml` gets `anchor`, `expanded`, `toggle`); week arrows move 7 days, month arrows when open.
6. **Rating card** graphic: area, dots, ringed last dot, dashed start line, pills.
7. **Dashboard:** the rating hero is removed; the gear board only on the Leaderboard tab.
**Version:** v81 (stacked on v80).
