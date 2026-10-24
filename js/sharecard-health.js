/* Health share cards: one finished workout ("that day") and the week / month / year overview, drawn like the profile card
   (same court backdrop, same themes) with a few extras that make the numbers fun: a heart-rate line coloured by zone with a
   heart on the peak, a donut of minutes per zone, a calorie flame with pizza slices, win / loss chips for every game, badges
   (Calorie burner, Clutch player, Marathon, Cardio hero, Unbeaten), and for the overview a bar chart with the best day
   crowned and a fire streak. All numbers come from health.js; this file only turns them into data and pictures. */

function _schFont(px, w) { return (w || 700) + " " + px + "px Montserrat, 'Noto Sans Lao', 'Noto Sans', sans-serif"; }
function _schZoneColors() { return typeof HEALTH_ZONE_COLORS !== "undefined" ? HEALTH_ZONE_COLORS : ["#38bdf8", "#4ade80", "#facc15", "#fb923c", "#ef4444"]; }
/** "on court 1:55 + rest 1:05" for a workout: the exact game minutes plus the (real or estimated) rest between them */
function _schSplit(w) { return t("healthOnCourtTile") + " " + _schHm(w.onCourt) + "  +  " + t("healthRestTile") + " " + _schHm(Math.max(0, w.totalMin - w.onCourt)); }
function _schRecord(w) { return w.wins + "\u2013" + (w.segs.length - w.wins); }
function _schHm(min) { return Math.floor(min / 60) + ":" + ("0" + Math.round(min % 60)).slice(-2); }

/* ───────────── data ───────────── */

/** One workout (an item of myWorkouts()) as plain data for the card */
function workoutShareData(w, dateLabel) {
  var d = w.d;
  return {
    wins: w.d.segs.filter(function (g) { return g.won; }).length, dateKey: w.date, date: dateLabel || w.date, time: w.time || "", totalMin: w.totalMin, timeMin: w.timeMin || w.totalMin, onCourt: w.onCourt, games: w.games, kcal: w.kcal, avg: w.avg, peak: w.peak,
    zoneMin: d.zoneMin || null, zones: d.zones || null, pts: d.pts || null, close: d.close || 0, restAssumed: !!d.restAssumed,
    segs: d.segs.map(function (g) { return { mine: g.mine, their: g.their, won: !!g.won, close: !!g.close, len: g.len, s: g.s, e: g.e }; })
  };
}

/** Up to three badges: [emoji, text key] */
function workoutBadges(x) {
  var out = [], hard = x.zoneMin ? x.zoneMin[2] + x.zoneMin[3] + x.zoneMin[4] : 0, won = x.segs.filter(function (g) { return g.won; }).length;
  if (x.kcal >= 800) out.push(["🔥", "wbBurner"]);
  if (x.close >= 3) out.push(["💪", "wbClutch"]);
  if (x.games >= 8) out.push(["🏸", "wbMarathon"]);
  if (hard >= 30) out.push(["❤️", "wbCardio"]);
  if (x.segs.length >= 3 && won === x.segs.length) out.push(["👑", "wbUnbeaten"]);
  if (!out.length) out.push(["✨", "wbFresh"]);
  return out.slice(0, 3);
}

/** The week / month / year summary (healthRangeSummary) as plain data. labelFn(bucket, index, kind) gives each bar its label. */
function overviewShareData(sum, range, title, labelFn) {
  var buckets = sum.buckets.map(function (b, i) { return { label: labelFn ? labelFn(b, i, range.kind) : "", min: b.min }; });
  var best = -1; buckets.forEach(function (b, i) { if (b.min > 0 && (best < 0 || b.min > buckets[best].min)) best = i; });
  return { kind: range.kind, title: title, totalMin: sum.totalMin, sessions: sum.sessions, games: sum.games, kcal: sum.hasKcal ? sum.kcal : null, avg: sum.avg,
    zoneMin: sum.hasZones ? sum.zoneMin : null, buckets: buckets, avgBucket: sum.avgBucket, best: best, active: buckets.filter(function (b) { return b.min > 0; }).length };
}
function overviewBadges(x) {
  var out = [];
  if (x.kcal >= 2000) out.push(["🔥", "wbBurner"]);
  if ((x.kind === "week" && x.sessions >= 3) || (x.kind === "month" && x.sessions >= 8) || (x.kind === "year" && x.sessions >= 60)) out.push(["📅", "wbConsistent"]);
  if (x.games >= (x.kind === "week" ? 20 : x.kind === "month" ? 60 : 500)) out.push(["🏸", "wbMarathon"]);
  var hard = x.zoneMin ? x.zoneMin[2] + x.zoneMin[3] + x.zoneMin[4] : 0; if (hard >= (x.kind === "week" ? 60 : x.kind === "month" ? 200 : 1500)) out.push(["❤️", "wbCardio"]);
  if (!out.length) out.push(["✨", "wbFresh"]);
  return out.slice(0, 3);
}

/* ───────────── drawing pieces ───────────── */

function _schPanel(c, P, x, y, w, h) { c.fillStyle = P.card; _scRound(c, x, y, w, h, 34); c.fill(); c.strokeStyle = P.edge; c.lineWidth = 3; c.stroke(); }
function _schHeart(c, x, y, s, col) {
  c.save(); c.translate(x, y); c.scale(s / 24, s / 24); c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 18;
  c.beginPath(); c.moveTo(0, 9); c.bezierCurveTo(-18, -4, -9, -16, 0, -6); c.bezierCurveTo(9, -16, 18, -4, 0, 9); c.fill(); c.restore();
}
function _schFlame(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s / 100, s / 100);
  var g = c.createLinearGradient(0, -60, 0, 50); g.addColorStop(0, "#fde047"); g.addColorStop(.5, "#fb923c"); g.addColorStop(1, "#dc2626");
  c.fillStyle = g; c.shadowColor = "#fb923c"; c.shadowBlur = 24;
  c.beginPath(); c.moveTo(0, -60); c.bezierCurveTo(10, -34, 40, -20, 38, 14); c.bezierCurveTo(36, 40, 16, 52, 0, 52); c.bezierCurveTo(-16, 52, -38, 40, -38, 12); c.bezierCurveTo(-38, -4, -26, -14, -22, -30); c.bezierCurveTo(-12, -22, -6, -14, -6, 0); c.bezierCurveTo(10, -14, -4, -40, 0, -60); c.closePath(); c.fill();
  c.shadowBlur = 0; c.fillStyle = "rgba(255,247,200,.9)"; c.beginPath(); c.moveTo(0, 6); c.bezierCurveTo(14, 18, 14, 36, 0, 42); c.bezierCurveTo(-14, 36, -14, 18, 0, 6); c.fill(); c.restore();
}

/** Heart rate line coloured by zone with the games shaded behind it and a heart on the peak */
function _schChart(c, P, x, y, w, h, x0) {
  var Z = _schZoneColors(), pts = x0.pts, segs = x0.segs, total = x0.timeMin || x0.totalMin;
  var vals = pts.map(function (p) { return p[1]; }), lo = Math.floor((Math.min.apply(null, vals) - 4) / 10) * 10, hi = Math.ceil((x0.peak + 8) / 10) * 10;
  var px = x + 34, pw = w - 68, py = y + 56, ph = h - 96;
  var X = function (m) { return px + pw * m / total; }, Y = function (v) { return py + ph * (1 - (v - lo) / (hi - lo)); };
  segs.forEach(function (g) { c.fillStyle = g.close ? "rgba(245,158,11,.2)" : "rgba(255,255,255,.07)"; c.fillRect(X(g.s), py, Math.max(2, X(g.e) - X(g.s)), ph); });
  c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 2; [0, 1, 2].forEach(function (k) { var yy = py + ph * k / 2; c.beginPath(); c.moveTo(px, yy); c.lineTo(px + pw, yy); c.stroke(); });
  var colour = function (v) { var col = "#9ca3af"; if (x0.zones) x0.zones.forEach(function (z, k) { if (v >= z.lo) col = Z[k]; }); return col; };
  c.lineWidth = 7; c.lineJoin = "round"; c.lineCap = "round";
  for (var i = 1; i < pts.length; i++) { c.strokeStyle = colour((pts[i][1] + pts[i - 1][1]) / 2); c.beginPath(); c.moveTo(X(pts[i - 1][0]), Y(pts[i - 1][1])); c.lineTo(X(pts[i][0]), Y(pts[i][1])); c.stroke(); }
  var pk = pts.reduce(function (a, p) { return p[1] > a[1] ? p : a; }, pts[0]);
  _schHeart(c, X(pk[0]), Y(pk[1]) - 6, 46, "#ef4444");
  c.fillStyle = P.text; c.font = _schFont(30, 800); c.textAlign = "center"; c.fillText(String(Math.round(pk[1])), Math.min(px + pw - 30, Math.max(px + 30, X(pk[0]))), Y(pk[1]) - 40);
  c.fillStyle = P.dim; c.font = _schFont(24, 600); c.textAlign = "left"; c.fillText(String(lo), x + 18, py + ph + 4); c.textAlign = "right"; c.fillText("bpm", x + w - 18, y + 38); c.textAlign = "left"; c.fillText(String(hi), x + 18, py + 10);
  c.textAlign = "center"; c.fillText("0:00", px + 10, y + h - 14); c.fillText(_schHm(total), px + pw - 10, y + h - 14);
}

/** Donut: minutes in each zone, average bpm in the middle */
function _schDonut(c, P, cx, cy, r, zoneMin, avg) {
  var Z = _schZoneColors(), sum = zoneMin.reduce(function (a, b) { return a + b; }, 0) || 1, a0 = -Math.PI / 2;
  c.lineCap = "butt"; c.lineWidth = 44;
  c.strokeStyle = "rgba(255,255,255,.1)"; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke();
  zoneMin.forEach(function (m, k) { if (!m) return; var a1 = a0 + m / sum * Math.PI * 2; c.strokeStyle = Z[k]; c.beginPath(); c.arc(cx, cy, r, a0 + .02, Math.max(a0 + .03, a1 - .02)); c.stroke(); a0 = a1; });
  c.textAlign = "center"; c.fillStyle = P.text; c.font = _schFont(70, 800); c.fillText(avg ? String(avg) : "–", cx, cy + 14); c.fillStyle = P.dim; c.font = _schFont(26, 600); c.fillText(t("healthAvgBpm"), cx, cy + 52);
}

function _schBadges(c, P, y, list, W) {
  c.font = _schFont(32, 800);
  var items = list.map(function (b) { var text = b[0] + "  " + t(b[1]); return { text: text, w: c.measureText(text).width + 64 }; }), total = items.reduce(function (s, i) { return s + i.w; }, 0) + (items.length - 1) * 16, x = (W - total) / 2;
  items.forEach(function (i) { c.fillStyle = P.pill; _scRound(c, x, y, i.w, 68, 34); c.fill(); c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(i.text, x + i.w / 2, y + 46); x += i.w + 16; });
}

function _schHead(c, P, W, top, title, sub) {
  c.textAlign = "center"; c.fillStyle = P.accent; c.font = _schFont(36, 800); c.fillText("GODSMASH  BADMINTON", W / 2, top);
  _scShuttle(c, 150, top - 12, 46, -35, P.text, .95); _scShuttle(c, W - 150, top - 12, 46, 35, P.text, .95);
  c.fillStyle = P.text; c.font = _schFont(40, 800); c.fillText(title, W / 2, top + 62); c.fillStyle = P.dim; c.font = _schFont(28, 600); c.fillText(sub, W / 2, top + 106);
}
function _schFoot(c, P, W, H, sq) { c.fillStyle = P.dim; c.font = _schFont(26, 600); c.textAlign = "center"; c.fillText("phounsiris-sketch.github.io/bughunters", W / 2, H - (sq ? 36 : 64)); }

/* ───────────── the two cards ───────────── */

function drawWorkoutCard(canvas, x0, id, fmt) {
  var sq = fmt === "square", W = 1080, H = sq ? 1350 : 1920, P = _scPalette(id), c = canvas.getContext("2d"), Z = _schZoneColors();
  canvas.width = W; canvas.height = H; _scBackdrop(c, W, H, id, P); _scCourt(c, W, H, P);
  var top = sq ? 66 : 140; _schHead(c, P, W, top, t("healthBadminton"), x0.date + (x0.time ? "  ·  " + x0.time : ""));
  var y = top + (sq ? 150 : 190);
  c.textAlign = "center"; c.fillStyle = P.dim; c.font = _schFont(28, 700); c.fillText(t("healthDuration").toUpperCase(), W / 2, y);
  c.save(); c.shadowColor = P.accent; c.shadowBlur = 36; c.fillStyle = P.text; c.font = _schFont(sq ? 170 : 220, 800); c.fillText(_schHm(x0.totalMin), W / 2, y + (sq ? 150 : 200)); c.restore();
  _scShuttle(c, 140, y + (sq ? 70 : 100), sq ? 100 : 130, -28, P.text, .96); _scShuttle(c, W - 140, y + (sq ? 60 : 90), sq ? 80 : 100, 24, P.accent, .96);
  c.fillStyle = P.dim; c.font = _schFont(28, 600); c.textAlign = "center"; c.fillText(_schSplit(x0), W / 2, y + (sq ? 150 : 200) + 52);
  y += sq ? 210 : 270;
  if (x0.pts) { var ch = sq ? 250 : 340; _schPanel(c, P, 70, y, W - 140, ch); _schChart(c, P, 70, y, W - 140, ch, x0); y += ch + 24; }
  // donut + calories
  var ph = sq ? 270 : 340, half = (W - 140 - 24) / 2;
  if (x0.zoneMin) { _schPanel(c, P, 70, y, half, ph); _schDonut(c, P, 70 + half / 2, y + ph / 2 - (sq ? 6 : 10), sq ? 86 : 108, x0.zoneMin, x0.avg);
    var lx = 70 + 34; Z.forEach(function (col, k) { c.fillStyle = col; c.fillRect(lx + k * (half - 68) / 5, y + ph - 30, (half - 68) / 5 - 6, 8); }); }
  var rx = 70 + half + 24; _schPanel(c, P, rx, y, half, ph);
  if (x0.kcal != null) { _schFlame(c, rx + half / 2, y + (sq ? 74 : 92), sq ? 100 : 130); c.textAlign = "center"; c.fillStyle = P.text; c.font = _schFont(sq ? 78 : 96, 800); c.fillText(String(x0.kcal), rx + half / 2, y + (sq ? 186 : 236)); c.fillStyle = P.dim; c.font = _schFont(26, 600); c.fillText(t("healthKcal"), rx + half / 2, y + (sq ? 222 : 276));
    var slices = Math.max(1, Math.round(x0.kcal / 285)), shown = Math.min(slices, 8); c.font = _schFont(sq ? 28 : 34, 400); c.fillText("🍕".repeat(shown) + (slices > 8 ? "+" + (slices - 8) : ""), rx + half / 2, y + ph - (sq ? 16 : 22)); }
  else { c.textAlign = "center"; c.fillStyle = P.dim; c.font = _schFont(30, 600); c.fillText(t("healthAddDetails"), rx + half / 2, y + ph / 2); }
  y += ph + 24;
  // three tiles
  var bw = (W - 140 - 48) / 3, th = sq ? 130 : 160;
  [[String(x0.peak || "–"), t("healthPeakBpm")], [String(x0.games), t("gamesWord")], [_schRecord(x0), t("healthRecordTile")]].forEach(function (f, k) { var xx = 70 + k * (bw + 24); _schPanel(c, P, xx, y, bw, th); c.textAlign = "center"; c.fillStyle = P.text; c.font = _schFont(sq ? 62 : 76, 800); c.fillText(f[0], xx + bw / 2, y + (sq ? 80 : 98)); c.fillStyle = P.dim; c.font = _schFont(24, 600); c.fillText(f[1], xx + bw / 2, y + th - 24); });
  y += th + 22;
  // games strip
  if (!sq && x0.segs.length) { var n = x0.segs.length, cw = Math.min(100, (W - 140 - (n - 1) * 10) / n), sx = (W - (n * cw + (n - 1) * 10)) / 2;
    x0.segs.forEach(function (g, k) { var xx = sx + k * (cw + 10); c.fillStyle = g.won ? "#16a34a" : "#dc2626"; _scRound(c, xx, y, cw, 84, 18); c.fill(); if (g.close) { c.strokeStyle = "#fbbf24"; c.lineWidth = 5; c.stroke(); } c.fillStyle = "#fff"; c.textAlign = "center"; c.font = _schFont(26, 800); c.fillText(g.mine + "-" + g.their, xx + cw / 2, y + 40); c.font = _schFont(22, 600); c.fillText((g.close ? "🔥" : "") + (g.won ? t("winShort") : t("lossShort")), xx + cw / 2, y + 70); });
    y += 84 + 26; }
  _schBadges(c, P, y, workoutBadges(x0), W);
  _schFoot(c, P, W, H, sq);
}

function drawOverviewCard(canvas, x0, id, fmt) {
  var sq = fmt === "square", W = 1080, H = sq ? 1350 : 1920, P = _scPalette(id), c = canvas.getContext("2d"), Z = _schZoneColors();
  canvas.width = W; canvas.height = H; _scBackdrop(c, W, H, id, P); _scCourt(c, W, H, P);
  var top = sq ? 66 : 140; _schHead(c, P, W, top, t("healthTitle"), x0.title);
  var y = top + (sq ? 150 : 190);
  c.textAlign = "center"; c.save(); c.shadowColor = P.accent; c.shadowBlur = 36; c.fillStyle = P.text; c.font = _schFont(sq ? 170 : 220, 800); c.fillText(_schHm(x0.totalMin), W / 2, y + (sq ? 120 : 170)); c.restore();
  _scShuttle(c, 140, y + (sq ? 40 : 70), sq ? 100 : 130, -28, P.text, .96); _scShuttle(c, W - 140, y + (sq ? 30 : 60), sq ? 80 : 100, 24, P.accent, .96);
  y += sq ? 170 : 230;
  // bars with the average line and a crown on the best bar
  var ch = sq ? 300 : 430; _schPanel(c, P, 70, y, W - 140, ch);
  var n = x0.buckets.length, px = 100, pw = W - 200, py = y + 70, ph = ch - 130, slot = pw / n, bw = Math.min(54, slot * .62), top2 = Math.max.apply(null, x0.buckets.map(function (b) { return b.min; }).concat([60]));
  x0.buckets.forEach(function (b, k) { var bh = b.min ? Math.max(10, ph * b.min / top2) : 0, xx = px + k * slot + (slot - bw) / 2;
    if (b.min) { var g = c.createLinearGradient(0, py + ph - bh, 0, py + ph); g.addColorStop(0, P.accent); g.addColorStop(1, P.pill); c.fillStyle = g; _scRound(c, xx, py + ph - bh, bw, bh, Math.min(14, bw / 2)); c.fill(); }
    else { c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(xx, py + ph - 6, bw, 6); }
    if (b.label) { c.fillStyle = P.dim; c.font = _schFont(n > 12 ? 22 : 26, 600); c.textAlign = "center"; c.fillText(b.label, xx + bw / 2, py + ph + 40); }
    if (k === x0.best) { c.font = _schFont(40, 400); c.textAlign = "center"; c.fillText("👑", xx + bw / 2, py + ph - bh - 12); } });
  if (x0.avgBucket > 0) { var ay = py + ph - ph * x0.avgBucket / top2; c.setLineDash([10, 12]); c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 3; c.beginPath(); c.moveTo(px, ay); c.lineTo(px + pw, ay); c.stroke(); c.setLineDash([]); }
  y += ch + 24;
  // tiles
  var tiles = [[String(x0.sessions), t("healthSessions")], [String(x0.games), t("gamesWord")], [x0.kcal != null ? x0.kcal.toLocaleString("en-US") : "–", t("healthKcal")], [x0.avg ? String(x0.avg) : "–", t("healthAvgBpm")]], bw2 = (W - 140 - 3 * 18) / 4, th = sq ? 130 : 160;
  tiles.forEach(function (f, k) { var xx = 70 + k * (bw2 + 18); _schPanel(c, P, xx, y, bw2, th); c.textAlign = "center"; c.fillStyle = P.text; c.font = _schFont(sq ? 50 : 60, 800); c.fillText(f[0], xx + bw2 / 2, y + (sq ? 76 : 94)); c.fillStyle = P.dim; c.font = _schFont(22, 600); c.fillText(f[1], xx + bw2 / 2, y + th - 24); });
  y += th + 24;
  // zones as one stacked bar, and the streak
  if (x0.zoneMin) { var sum = x0.zoneMin.reduce(function (a, b) { return a + b; }, 0) || 1, zx = 70, zw = W - 140; _schPanel(c, P, 70, y, zw, sq ? 120 : 150);
    var xx2 = 100, tw = zw - 60; x0.zoneMin.forEach(function (m, k) { var w2 = tw * m / sum; if (w2 < 1) return; c.fillStyle = Z[k]; c.fillRect(xx2, y + 40, w2, 34); xx2 += w2; });
    c.fillStyle = P.dim; c.font = _schFont(24, 600); c.textAlign = "left"; c.fillText(t("healthZonesTitle"), 100, y + 36); c.textAlign = "right"; c.fillText(x0.zoneMin.map(function (m, k) { return k > 1 && m ? "Z" + (k + 1) + " " + m : ""; }).filter(Boolean).join("   ") || "", zx + zw - 30, y + 36);
    y += (sq ? 120 : 150) + 22; }
  c.textAlign = "center"; c.fillStyle = P.text; c.font = _schFont(sq ? 44 : 54, 800); c.fillText("🔥 " + x0.active + " " + t(x0.kind === "year" ? "scActiveMonths" : "scActiveDays"), W / 2, y + 40); y += sq ? 64 : 90;
  _schBadges(c, P, y, overviewBadges(x0), W);
  _schFoot(c, P, W, H, sq);
}

/** Level of the whole range by minutes played (a week: 1 h Rally, 3 h Smasher, 6 h Legend; a month x4, a year x48) */
function _schLevel(x) {
  var k = x.kind === "year" ? 48 : x.kind === "month" ? 4 : 1, steps = [0, 60 * k, 180 * k, 360 * k], lv = 0;
  steps.forEach(function (s, i) { if (x.totalMin >= s) lv = i; });
  var next = lv < 3 ? steps[lv + 1] : null;
  return { lv: lv, emoji: ["\uD83C\uDF31", "\uD83C\uDFF8", "\uD83D\uDCA5", "\uD83D\uDC51"][lv], next: next, left: next ? Math.ceil(next - x.totalMin) : 0, pct: next ? (x.totalMin - steps[lv]) / (next - steps[lv]) : 1 };
}

/** One game day picked from the week (duration, calories, heart-rate line) plus a "my week" gimmick: the days as bars with this day lit, and a level bar */
function drawWeekSessionCard(canvas, w, x0, idx, id, fmt) {
  var sq = fmt === "square", W = 1080, H = sq ? 1350 : 1920, P = _scPalette(id), c = canvas.getContext("2d"), Z = _schZoneColors();
  canvas.width = W; canvas.height = H; _scBackdrop(c, W, H, id, P); _scCourt(c, W, H, P);
  var top = sq ? 66 : 140; _schHead(c, P, W, top, t("healthBadminton"), w.date + (w.time ? "  \u00b7  " + w.time : ""));
  var y = top + (sq ? 140 : 180), half = (W - 140 - 24) / 2, ph = sq ? 230 : 310;
  // duration | calories
  _schPanel(c, P, 70, y, half, ph); c.textAlign = "center"; c.fillStyle = P.dim; c.font = _schFont(26, 700); c.fillText(t("healthDuration").toUpperCase(), 70 + half / 2, y + 52);
  c.save(); c.shadowColor = P.accent; c.shadowBlur = 30; c.fillStyle = P.text; c.font = _schFont(sq ? 110 : 128, 800); c.fillText(_schHm(w.totalMin), 70 + half / 2, y + ph / 2 + (sq ? 38 : 44)); c.restore();
  c.fillStyle = P.dim; c.font = _schFont(26, 600); c.font = _schFont(23, 600); c.fillText(t("healthOnCourtTile") + " " + _schHm(w.onCourt) + "  +  " + t("healthRestTile") + " " + _schHm(Math.max(0, w.totalMin - w.onCourt)), 70 + half / 2, y + ph - 28);
  var rx = 70 + half + 24; _schPanel(c, P, rx, y, half, ph);
  if (w.kcal != null) { _schFlame(c, rx + half / 2, y + (sq ? 66 : 84), sq ? 86 : 110); c.textAlign = "center"; c.fillStyle = P.text; c.font = _schFont(sq ? 76 : 92, 800); c.fillText(String(w.kcal), rx + half / 2, y + (sq ? 168 : 222)); c.fillStyle = P.dim; c.font = _schFont(26, 600); c.fillText(t("healthKcal") + (w.kcal >= 285 ? "  \u00b7  " + "\uD83C\uDF55".repeat(Math.min(5, Math.round(w.kcal / 285))) : ""), rx + half / 2, y + ph - 26); }
  else { c.textAlign = "center"; c.fillStyle = P.dim; c.font = _schFont(28, 600); c.fillText(t("healthAddDetails"), rx + half / 2, y + ph / 2); }
  y += ph + 24;
  // heart-rate line
  var ch = sq ? 260 : 360; _schPanel(c, P, 70, y, W - 140, ch);
  if (w.pts) _schChart(c, P, 70, y, W - 140, ch, w); else { c.textAlign = "center"; c.fillStyle = P.dim; c.font = _schFont(30, 600); c.fillText(t("healthAddDetails"), W / 2, y + ch / 2); }
  y += ch + 24;
  // avg / peak / on court
  var bw = (W - 140 - 48) / 3, th = sq ? 110 : 140;
  [[String(w.avg || "\u2013"), t("healthAvgBpm")], [String(w.peak || "\u2013"), t("healthPeakBpm")], [_schRecord(w), t("healthRecordTile") + " \u00b7 " + w.games + " " + t("gamesWord")]].forEach(function (f, k) { var xx = 70 + k * (bw + 24); _schPanel(c, P, xx, y, bw, th); c.textAlign = "center"; c.fillStyle = P.text; c.font = _schFont(sq ? 54 : 66, 800); c.fillText(f[0], xx + bw / 2, y + (sq ? 66 : 82)); c.fillStyle = P.dim; c.font = _schFont(22, 600); c.fillText(f[1], xx + bw / 2, y + th - 20); });
  y += th + 24;
  // my week gimmick
  var gh = sq ? 300 : 410, lvl = _schLevel(x0); _schPanel(c, P, 70, y, W - 140, gh);
  c.textAlign = "left"; c.fillStyle = P.accent; c.font = _schFont(28, 800); c.fillText(t("scMyRange").toUpperCase() + "  \u00b7  " + x0.title, 104, y + 48);
  c.textAlign = "right"; c.fillStyle = P.dim; c.font = _schFont(26, 700); c.fillText(t("scSessionOf").replace("{n}", idx + 1).replace("{m}", x0.list.length), W - 104, y + 48);
  var n = x0.buckets.length, px = 104, pw = W - 208, py = y + 78, bh0 = gh - (sq ? 190 : 230), slot = pw / n, bwid = Math.min(46, slot * .62), mx = Math.max.apply(null, x0.buckets.map(function (b) { return b.min; }).concat([60]));
  var mine = x0.buckets.map(function (b) { return w.dateKey && b.key === w.dateKey; });
  x0.buckets.forEach(function (b, k) { var bh = b.min ? Math.max(10, bh0 * b.min / mx) : 0, xx = px + k * slot + (slot - bwid) / 2, lit = !!mine[k];
    if (b.min) { var g = c.createLinearGradient(0, py + bh0 - bh, 0, py + bh0); g.addColorStop(0, lit ? P.accent : "rgba(255,255,255,.5)"); g.addColorStop(1, lit ? P.pill : "rgba(255,255,255,.18)"); c.save(); if (lit) { c.shadowColor = P.accent; c.shadowBlur = 26; } c.fillStyle = g; _scRound(c, xx, py + bh0 - bh, bwid, bh, Math.min(12, bwid / 2)); c.fill(); c.restore(); }
    else { c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(xx, py + bh0 - 5, bwid, 5); }
    if (b.label) { c.fillStyle = lit ? P.text : P.dim; c.font = _schFont(n > 12 ? 20 : 24, lit ? 800 : 600); c.textAlign = "center"; c.fillText(b.label, xx + bwid / 2, py + bh0 + 34); }
    if (lit) { c.font = _schFont(34, 400); c.textAlign = "center"; c.fillText("\uD83C\uDFF8", xx + bwid / 2, py + bh0 - bh - 10); } });
  // level bar
  var ly = y + gh - (sq ? 66 : 82); c.fillStyle = "rgba(255,255,255,.14)"; _scRound(c, 104, ly, W - 208, 24, 12); c.fill();
  var lg = c.createLinearGradient(104, 0, W - 104, 0); lg.addColorStop(0, P.pill); lg.addColorStop(1, P.accent); c.fillStyle = lg; _scRound(c, 104, ly, Math.max(24, (W - 208) * lvl.pct), 24, 12); c.fill();
  c.textAlign = "left"; c.fillStyle = P.text; c.font = _schFont(28, 800); c.fillText(lvl.emoji + "  " + t("scLv" + lvl.lv), 104, ly + 58);
  c.textAlign = "right"; c.fillStyle = P.dim; c.font = _schFont(24, 600); c.fillText(lvl.next ? t("scToNext").replace("{min}", lvl.left).replace("{name}", t("scLv" + (lvl.lv + 1))) : t("scMaxLevel"), W - 104, ly + 58);
  y += gh + 22;
  _schBadges(c, P, y, workoutBadges(w), W);
  _schFoot(c, P, W, H, sq);
}
