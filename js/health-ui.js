/* Health & exercise pages (Samsung Health style): overview by week / month / year, one workout in detail,
   plus the cards on Dashboard and Home that lead here. Numbers come from health.js (pure functions).
   Paths:  Home card / Dashboard card -> Health overview -> a workout -> Share card, Health details
           Session Games tab "My workout" -> the same workout page. */

var _hk = "week", _hoff = 0, _wkSid = null;
var _hwMemo = { m: null, s: null, p: null, list: [] };

/** My workouts, memoised until the games, sessions or my health details change */
function myWorkouts() {
  if (!currentUser) return [];
  var m = typeof lastMatches !== "undefined" ? lastMatches : [], s = typeof lastSessions !== "undefined" ? lastSessions : [], p = typeof _myPrivate !== "undefined" ? _myPrivate : null;
  if (_hwMemo.m !== m || _hwMemo.s !== s || _hwMemo.p !== p) _hwMemo = { m: m, s: s, p: p, list: healthWorkouts(myHealth(), _healthAge(), currentUser.uid, m, s) };
  return _hwMemo.list;
}

function loadHealthPage() { if (typeof loadSessions === "function") loadSessions(); if (typeof loadMatches === "function") loadMatches(); loadMyHealth(renderHealthPage); renderHealthPage(); }
function loadWorkoutPage() { if (typeof loadSessions === "function") loadSessions(); if (typeof loadMatches === "function") loadMatches(); loadMyHealth(renderWorkoutPage); renderWorkoutPage(); }

/** Open the overview (kind week|month|year) and optionally scroll to a block */
function openHealth(kind, anchor) {
  _hk = kind || _hk || "week"; _hoff = 0; showPage("health");
  if (anchor) setTimeout(function () { var el = document.getElementById(anchor); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 120);
}
function openWorkout(sid) { _wkSid = sid; showPage("workout"); }
function healthSetKind(k) { _hk = k; _hoff = 0; renderHealthPage(); }
function healthMove(d) { _hoff += d; renderHealthPage(); }

function _locale() { return typeof currentLang !== "undefined" && currentLang === "la" ? "lo" : "en"; }
function _fmtD(d, o) { try { return d.toLocaleDateString(_locale(), o); } catch (e) { return d.toLocaleDateString("en", o); } }
function _dur(min) { return '<span class="hl-dur">' + _hmm(min) + '</span>'; }
function _kc(k) { return k == null ? '' : '<span class="hl-kcal">' + k.toLocaleString("en-US") + ' ' + t("healthKcalUnit") + '</span>'; }

/** Bar chart for one range: minutes per bucket, dotted line at the average of the active buckets */
function healthBarsSvg(sum, range) {
  var W = 720, H = 250, L = 8, R = 8, T = 18, B = 34, n = sum.buckets.length, max = Math.max(60, Math.max.apply(null, sum.buckets.map(function (b) { return b.min; })));
  max = Math.ceil(max / 60) * 60;
  var slot = (W - L - R) / n, bw = Math.min(46, slot * .62), Y = function (m) { return T + (H - T - B) * (1 - m / max); };
  var s = '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" class="hc-gl"/>';
  sum.buckets.forEach(function (b, i) {
    var x = L + i * slot + (slot - bw) / 2, h = Y(0) - Y(b.min);
    if (b.min > 0) s += '<rect x="' + x + '" y="' + Y(b.min) + '" width="' + bw + '" height="' + h + '" rx="' + Math.min(6, bw / 2) + '" class="hb"/>';
    var label = range.kind === "week" ? _fmtD(b.date, { weekday: "short" }).slice(0, 3) : range.kind === "year" ? _fmtD(b.date, { month: "short" }).slice(0, 3) : ((i + 1) % 7 === 1 || i === n - 1 ? String(i + 1) : "");
    if (label) s += '<text x="' + (x + bw / 2) + '" y="' + (H - 10) + '" text-anchor="middle" class="hc-t">' + escapeHtml(label) + '</text>';
  });
  if (sum.avgBucket > 0) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(sum.avgBucket) + '" y2="' + Y(sum.avgBucket) + '" class="hb-avg"/><text x="' + (W - R) + '" y="' + (Y(sum.avgBucket) - 6) + '" text-anchor="end" class="hc-t hc-b">' + t("healthAvgLine") + ' ' + _hmm(sum.avgBucket) + '</text>';
  s += '<text x="' + L + '" y="' + (T - 4) + '" class="hc-t">' + _hmm(max) + ' ' + t("hShort").trim() + '</text>';
  return '<svg class="hc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(t("healthBarsAria")) + '">' + s + '</svg>';
}

function _zoneName(i) { return t("healthZone" + (i + 1)); }

/** Zone rows like Samsung: number, name, a coloured bar as long as the time spent there, my own bpm range */
function healthZoneRowsHtml(zones, zoneMin, totalMin) {
  var top = Math.max(1, Math.max.apply(null, zoneMin));
  return '<div class="hz-rows">' + zones.slice().reverse().map(function (z) {
    var i = Number(z.id.slice(1)) - 1, m = zoneMin[i];
    return '<div class="hz-line"><b>' + (i + 1) + '</b><span class="hz-name">' + _zoneName(i) + '</span><span class="hz-bar"><i style="width:' + Math.max(m ? 6 : 0, Math.round(m / top * 100)) + '%;background:' + HEALTH_ZONE_COLORS[i] + '"></i></span>' +
      '<span class="hz-min">' + (m ? m + ' ' + t("minShort") : '') + '</span><span class="hz-bpm">' + z.lo + '-' + z.hi + ' bpm</span></div>';
  }).join("") + '</div>';
}

/** Heart rate line coloured by zone, games shaded, time axis */
function healthZoneChartSvg(d) {
  var W = 720, H = 320, L = 14, R = 12, T = 22, B = 44, total = d.totalMin;
  var vals = d.pts.map(function (p) { return p[1]; }), lo = Math.floor((Math.min.apply(null, vals) - 4) / 10) * 10, hi = Math.ceil((d.peak + 6) / 10) * 10;
  var X = function (m) { return L + (W - L - R) * m / total; }, Y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
  var colour = function (v) { var c = HEALTH_BELOW; d.zones.forEach(function (z, k) { if (v >= z.lo) c = HEALTH_ZONE_COLORS[k]; }); return c; };
  var s = '';
  d.segs.forEach(function (g, i) {
    s += '<rect x="' + X(g.s) + '" y="' + T + '" width="' + Math.max(1, X(g.e) - X(g.s)) + '" height="' + (H - T - B) + '" class="' + (g.close ? 'hg-close' : 'hg') + '"/>';
    s += '<text x="' + (X(g.s) + X(g.e)) / 2 + '" y="' + (T - 6) + '" text-anchor="middle" class="hc-t' + (g.close ? ' hc-b' : '') + '">' + (i + 1) + '</text>';
  });
  var run = [], cur = null, paths = '';
  var flush = function () { if (run.length > 1) paths += '<path d="' + run.map(function (p, k) { return (k ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ") + '" stroke="' + cur + '" class="hz-path"/>'; };
  d.pts.forEach(function (p, k) {
    var c = colour((p[1] + (d.pts[k + 1] ? d.pts[k + 1][1] : p[1])) / 2);
    if (c !== cur) { flush(); run = run.length ? [run[run.length - 1]] : []; cur = c; }
    run.push(p);
  });
  flush();
  s += paths + '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" class="hc-gl"/>';
  for (var m = 0; m <= total; m += total > 150 ? 45 : 30) s += '<text x="' + Math.min(W - R - 18, Math.max(L + 14, X(m))) + '" y="' + (H - 14) + '" text-anchor="middle" class="hc-t">' + _hmm(m) + '</text>';
  return '<svg class="hc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(t("healthChartAria")) + '">' + s + '</svg>';
}

function _seg3(active, items, fn) {
  return '<div class="seg" role="tablist">' + items.map(function (x) { return '<button type="button" role="tab" aria-selected="' + (x[0] === active) + '" class="seg-btn' + (x[0] === active ? ' active' : '') + '" onclick="' + fn + '(\'' + x[0] + '\')">' + x[1] + '</button>'; }).join("") + '</div>';
}

function renderHealthPage() {
  var box = document.getElementById("healthContent"); if (!box || !currentUser) return;
  setBreadcrumb([{ label: t("navHome"), action: "showPage('home')" }, { label: t("navDashboard"), action: "showPage('dashboard')" }, { label: t("healthTitle") }]);
  var h = myHealth(), age = _healthAge(), ws = myWorkouts();
  var range = healthRangeBounds(_hk, _hoff, new Date()), sum = healthRangeSummary(ws, range);
  var label = _hk === "week" ? _fmtD(range.fromDate, { day: "numeric", month: "short" }) + " – " + _fmtD(range.toDate, { day: "numeric", month: "short" }) : _hk === "month" ? _fmtD(range.fromDate, { month: "long", year: "numeric" }) : String(range.fromDate.getFullYear());
  var html = '<div class="me-title">' + icon("chart", 22) + ' ' + t("healthTitle") + '</div>' + _seg3(_hk, [["week", t("healthWeek")], ["month", t("healthMonth")], ["year", t("healthYear")]], "healthSetKind");
  html += '<div class="card hv-sum"><div class="hv-range"><button type="button" class="hv-nav" aria-label="' + t("healthPrev") + '" onclick="healthMove(-1)">' + icon("prev", 18) + '</button><b>' + escapeHtml(label) + '</b><button type="button" class="hv-nav" aria-label="' + t("healthNext") + '" onclick="healthMove(1)"' + (_hoff >= 0 ? ' disabled' : '') + '>' + icon("next", 18) + '</button></div>' +
    '<div class="hv-big">' + _hmm(sum.totalMin) + ' <small>' + t("hShort").trim() + '</small></div>' +
    '<div class="hv-facts"><div><small>' + t("healthKcal") + '</small><b class="hl-kcal">' + (sum.hasKcal ? sum.kcal.toLocaleString("en-US") : '–') + '</b></div><div><small>' + t("healthAvgBpm") + '</small><b class="hl-hr">' + (sum.avg || '–') + '</b></div>' +
    '<div><small>' + t("healthSessions") + '</small><b>' + sum.sessions + '</b></div><div><small>' + t("gamesWord") + '</small><b>' + sum.games + '</b></div></div>' +
    healthBarsSvg(sum, range) + '</div>';
  // paths
  html += '<div class="hv-paths"><button type="button" class="hv-path" onclick="document.getElementById(\'hvZones\').scrollIntoView({behavior:\'smooth\'})">' + icon("chart", 18) + '<span>' + t("healthZonesTitle") + '</span></button>' +
    '<button type="button" class="hv-path" onclick="document.getElementById(\'hvList\').scrollIntoView({behavior:\'smooth\'})">' + icon("history", 18) + '<span>' + t("healthWorkouts") + '</span></button>' +
    '<button type="button" class="hv-path" onclick="openPfSub(\'health\')">' + icon("user", 18) + '<span>' + t("healthDetails") + '</span></button>' +
    '<button type="button" class="hv-path" onclick="openShareCard()">' + icon("share", 18) + '<span>' + t("shareMyCard") + '</span></button></div>';
  // zones for the range
  var zones = healthZones(h, age);
  html += '<div class="card" id="hvZones"><div class="card-title">' + icon("chart", 14) + ' ' + t("healthZonesTitle") + '</div>' +
    (zones ? (sum.hasZones ? healthZoneRowsHtml(zones, sum.zoneMin) : '<div class="form-hint">' + t("healthNoWorkouts") + '</div>' + healthZoneRowsHtml(zones, [0, 0, 0, 0, 0]))
      : '<div class="form-hint">' + t("healthNoZones") + '</div><button type="button" class="btn-secondary" onclick="openPfSub(\'health\')">' + icon("user", 16) + ' ' + t("healthAddDetails") + '</button>') + '</div>';
  // list, newest first, grouped by day
  html += '<div id="hvList" class="hv-list">';
  if (!sum.items.length) html += '<div class="empty-state"><div class="empty-icon">' + icon("scoreboard", 44) + '</div><div>' + t("healthEmpty") + '</div></div>';
  var lastDate = "";
  sum.items.forEach(function (w) {
    if (w.date !== lastDate) {
      var day = ws.filter(function (x) { return x.date === w.date; }), tot = day.reduce(function (s, x) { return s + x.totalMin; }, 0), kc = day.reduce(function (s, x) { return s + (x.kcal || 0); }, 0);
      html += '<div class="hv-day"><b>' + escapeHtml(_fmtD(new Date(w.date + "T00:00:00"), { weekday: "short", day: "numeric", month: "short", year: "numeric" })) + '</b><span>' + _dur(tot) + (kc ? ' ' + _kc(kc) : '') + '</span></div>';
      lastDate = w.date;
    }
    html += '<button type="button" class="hv-row" onclick="openWorkout(\'' + jsq(w.sid) + '\')"><span class="hv-ico">' + icon("shuttle", 26) + '</span><span class="hv-main"><b>' + t("healthBadminton") + '</b><small>' + _dur(w.totalMin) + (w.kcal != null ? ' ' + _kc(w.kcal) : '') + '</small></span><span class="hv-time">' + escapeHtml(w.time || '') + '</span></button>';
  });
  box.innerHTML = html + '</div><div class="hc-note">' + t("healthSource") + '</div>';
}

function renderWorkoutPage() {
  var box = document.getElementById("workoutContent"); if (!box || !currentUser) return;
  var w = myWorkouts().filter(function (x) { return x.sid === _wkSid; })[0];
  if (!w) { box.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icon("scoreboard", 44) + '</div><div>' + t("healthNoWorkouts") + '</div></div>'; setBreadcrumb([{ label: t("healthTitle"), action: "showPage('health')" }]); return; }
  setBreadcrumb([{ label: t("navDashboard"), action: "showPage('dashboard')" }, { label: t("healthTitle"), action: "showPage('health')" }, { label: fmtDate(w.date) }]);
  var d = w.d, h = myHealth();
  var tile = function (cls, label, val, unit) { return '<div class="wk-tile"><small class="' + cls + '">' + label + '</small><b>' + val + (unit ? ' <em>' + unit + '</em>' : '') + '</b></div>'; };
  var date = new Date(w.date + "T00:00:00");
  var html = '<div class="wk-hero"><button type="button" class="wk-share" aria-label="' + t("shareMyCard") + '" onclick="openShareCard()">' + icon("share", 20) + '</button>' +
    '<svg class="wk-shuttle" viewBox="0 0 100 100" aria-hidden="true"><path d="M30 55 L12 8 Q50 -6 88 8 L70 55Z" fill="rgba(255,255,255,.9)"/><path d="M26 40 L74 40 M34 25 L66 25 M40 55 L28 14 M50 55 L50 6 M60 55 L72 14" stroke="rgba(0,0,0,.18)" stroke-width="2" fill="none"/><circle cx="50" cy="68" r="15" fill="#f5deb3"/></svg>' +
    '<div class="wk-title">' + t("healthBadminton") + '</div><div class="wk-dur">' + _hmm(w.totalMin) + '</div><div class="wk-date">' + escapeHtml(_fmtD(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) + (w.time ? " " + w.time : "")) + '</div></div>';
  html += '<div class="card wk-card"><div class="card-title">' + t("healthWorkoutDetails") + '</div><div class="wk-tiles">' +
    tile("hl-dur", t("healthDuration"), _hmm(w.totalMin), "") + tile("hl-kcal", t("healthActiveEnergy"), w.kcal != null ? w.kcal.toLocaleString("en-US") : "–", t("healthKcalUnit")) +
    tile("hl-kcal", t("healthTotalEnergy"), d.kcal ? d.kcal.total.toLocaleString("en-US") : "–", t("healthKcalUnit")) + tile("hl-hr", t("healthAvgHr"), d.avg || "–", "bpm") + tile("hl-hr", t("healthMaxHrTile"), d.peak || "–", "bpm") +
    tile("hl-dur", t("healthOnCourtTile"), _hmm(w.onCourt), "") + '</div>' + (!d.kcal ? '<button type="button" class="btn-secondary" onclick="openPfSub(\'health\')">' + icon("user", 16) + ' ' + t("healthAddDetails") + '</button>' : '') + '</div>';
  if (d.pts) html += '<div class="card"><div class="card-title">' + t("healthChartTitle") + '</div><div class="hc-legend"><span class="hc-lgz"></span>' + t("healthChartLegend") + '</div>' + healthZoneChartSvg(d) + '</div>' +
    '<div class="card" id="wkZones"><div class="card-title" onclick="openPfSub(\'health\')" style="cursor:pointer;display:flex;justify-content:space-between">' + t("healthZonesTitle") + ' ' + icon("chevron", 16) + '</div>' + healthZoneRowsHtml(d.zones, d.zoneMin) + '</div>';
  html += '<div class="card"><div class="card-title">' + t("healthGamesIn") + '</div><div class="wk-games">' + d.segs.map(function (g, i) {
    return '<div class="wk-game' + (g.close ? ' close' : '') + '"><b>' + (i + 1) + '</b><span class="wk-score">' + g.mine + ' - ' + g.their + (g.won ? ' ✔' : '') + '</span><span>' + g.len + ' ' + t("minShort") + '</span><span>' + (g.avg ? g.avg + ' bpm' : '') + '</span></div>'; }).join("") + '</div></div>';
  html += '<button type="button" class="btn-secondary" onclick="showSessionDetail(\'' + jsq(w.sid) + '\',\'games\')">' + icon("sessions", 16) + ' ' + t("healthOpenSession") + '</button><div class="hc-note">' + t("healthSource") + '</div>';
  box.innerHTML = html;
}

/* ── Cards that lead here ── */

/** Dashboard: this week at a glance with paths to the week / month summaries, the workout list, the zones and my details */
function healthDashCardHtml() {
  if (!currentUser) return "";
  var ws = myWorkouts(), range = healthRangeBounds("week", 0, new Date()), sum = healthRangeSummary(ws, range);
  var bars = sum.buckets.map(function (b) { var m = Math.max.apply(null, sum.buckets.map(function (x) { return x.min; })) || 1; return '<i style="height:' + Math.max(b.min ? 12 : 4, Math.round(b.min / m * 100)) + '%"' + (b.min ? ' class="on"' : '') + '></i>'; }).join("");
  var path = function (iconName, label, click) { return '<button type="button" class="hd-path" onclick="' + click + '">' + icon(iconName, 16) + '<span>' + label + '</span>' + icon("chevron", 14) + '</button>'; };
  return '<div class="card hd-card"><button type="button" class="hd-head" onclick="openHealth(\'week\')"><span class="card-title" style="margin:0">' + icon("chart", 14) + ' ' + t("healthTitle") + '</span>' + icon("chevron", 16) + '</button>' +
    '<div class="hd-body"><div class="hd-num"><small>' + t("healthThisWeek") + '</small><b>' + _hmm(sum.totalMin) + ' <em>' + t("hShort").trim() + '</em></b>' +
    '<span>' + (sum.hasKcal ? '<span class="hl-kcal">' + sum.kcal.toLocaleString("en-US") + ' ' + t("healthKcalUnit") + '</span> · ' : '') + sum.sessions + ' ' + t("healthSessions") + (sum.avg ? ' · <span class="hl-hr">' + sum.avg + ' bpm</span>' : '') + '</span></div><div class="hd-bars" aria-hidden="true">' + bars + '</div></div>' +
    '<div class="hd-paths">' + path("calendar", t("healthWeek"), "openHealth('week')") + path("history", t("healthMonth"), "openHealth('month')") + path("scoreboard", t("healthWorkouts"), "openHealth('week','hvList')") +
    path("chart", t("healthZonesTitle"), "openHealth('week','hvZones')") + path("user", t("healthDetails"), "openPfSub('health')") + path("share", t("shareMyCard"), "openShareCard()") + '</div></div>';
}

/** Home swipe card: this month, one bar per week of the month (W1 to W4/W5), the current week brightest */
function homeHealthCardHtml() {
  var ws = myWorkouts(), today = new Date(), sum = healthRangeSummary(ws, healthRangeBounds("month", 0, today)), weeks = healthMonthWeeks(ws, today), top = Math.max.apply(null, weeks.map(function (x) { return x.min; })) || 1;
  var bars = weeks.map(function (x) { return '<span class="hw' + (x.now ? ' now' : '') + '"><i style="height:' + Math.max(x.min ? 8 : 4, Math.round(x.min / top * 42)) + 'px"></i><small>' + t("healthWeekShort").replace("{n}", x.n) + '</small></span>'; }).join("");
  return '<button type="button" class="hs-card hs-health" onclick="openHealth(\'month\')"><div class="hs-title">' + icon("chart", 16) + ' ' + t("healthTitle") + '</div>' +
    '<div class="hs-big">' + _hmm(sum.totalMin) + ' <small>' + t("healthThisMonth") + '</small></div><div class="hs-health-bars" aria-hidden="true">' + bars + '</div>' +
    '<div class="hs-sub">' + (sum.hasKcal ? sum.kcal.toLocaleString("en-US") + ' ' + t("healthKcalUnit") + ' \u00B7 ' : '') + sum.sessions + ' ' + t("healthSessions") + '</div></button>';
}

/** Dashboard: my most recent workout (the same estimate card that used to sit in a session); nothing until I have a timed game */
function healthLatestCardHtml() {
  if (!currentUser) return "";
  if (typeof _myPrivate !== "undefined" && _myPrivate === null) {   // my private record is not loaded yet: load it once, then redraw the Dashboard
    loadMyHealth(function () { if (typeof currentPage !== "undefined" && currentPage === "dashboard" && typeof _renderDashboard === "function") _renderDashboard(); });
    return "";
  }
  var w = myWorkouts()[0];
  if (!w) return "";
  return healthWorkoutCardHtml(w.d, w.sid, _fmtD(new Date(w.date + "T00:00:00"), { weekday: "short", day: "numeric", month: "short" }));
}
