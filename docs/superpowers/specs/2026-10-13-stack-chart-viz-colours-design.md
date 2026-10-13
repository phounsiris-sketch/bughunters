# Stacked chart uses the shared cost-type colours (v62)

**Problem (found in UX QA):** v61 month chart used its own hex colours; the per-person bars use `--viz-court/shuttle/other/dinner`. One cost type showed two colours on one page.
**Change:** `.t-court/.t-shuttle/.t-other/.t-dinner` now use the `--viz-*` tokens (also correct in light/dark theme).
**Version:** v62.
