Contrast audit (manual, needs Google Chrome on macOS; not part of release-guard).
Renders every button-like class from index.html + js/*.js in 10 theme/palette combos (dark, light, 4 light palettes, 4 dark palettes), resting and selected, and measures text contrast and edge visibility.

    node tools/contrast/audit.js /tmp/contrast && node tools/contrast/report.js /tmp/contrast

(create the output folder first). Known false positives: header/overlay icon buttons (white on a coloured bar), live-score screens, and card-like rows that rely on a shadow. Treat the rest as real.
