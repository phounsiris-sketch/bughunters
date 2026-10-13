# Spending month chart stacked by cost type (v61)

**Request:** the monthly bar chart on the Spending tab should be a stacked chart, one segment per cost type.
**Design:** each column is a stack (bottom to top) court, shuttles, other, dinner. Segment height is its share of that month's total; bar height is still the month total relative to the biggest month. A legend with colour dots sits above the chart. Tapping a column lists the amount per type (only types above 0), then sessions and your share.
**Colours:** the same `--viz-court/shuttle/other/dinner` tokens as the per-person bars (v62; v61 used its own hexes), so one cost type has one colour, in light and dark theme.
**Data:** `_sumSessions` already returns `court/shuttle/other/dinner/grand`; no data change.
**Version:** v61.
