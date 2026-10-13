# Batch 5 (v82): fixes

1. **Icons gone** in the Spending tab's legend ("Per person"): my switch class `.sw` (v79 notifications) clashed with the existing legend swatch class `.sw`; the switch is now `.tgl`. All new CSS classes were checked against the older stylesheet: no other clash.
2. **Badges** card opens Profile. 3. **Rating** card opens Rankings > Progress.
4. **Live score names:** a centred column (max 70 % wide, ellipsis) in the counter; the setup screen is unchanged.
5. **Live score in progress** banner: cancel (x) with a confirm (`lsCancelSaved`), so a half-counted game can be dropped without opening it.
**Version:** v82 (stacked on v81).
