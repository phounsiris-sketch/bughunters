/* Health: my workout estimate for a session, personal heart rate zones, and the private "Health details" page.
   Stored in userPrivate/{uid}.health (only the owner can read or write it):
     { weightKg, heightCm, sex, restHr, maxHr, notes, weeklyGoal }
   Game minutes come from the live score (matches[].minutes, measured from the first point to the save).
   Everything here is a wellness ESTIMATE: calories from MET x weight x hours, a heart rate curve built from each
   player's own heart rate reserve. Real watch readings will replace the curve later. Pure functions first, screens below. */

var HEALTH_WARMUP_MIN = 10;
var HEALTH_MET = { play: 5.5, warm: 4, rest: 2 };   // activity compendium values for social badminton, warm-up and standing rest
var HEALTH_ZONES = [["Z1", .5, .6], ["Z2", .6, .7], ["Z3", .7, .8], ["Z4", .8, .9], ["Z5", .9, 1]];
var _myHealthLoaded = false;

/** Max heart rate: the one the player entered, else 208 - 0.7 x age (Tanaka), else null */
function healthMaxHr(h, age) {
  if (h && h.maxHr > 0) return Math.round(h.maxHr);
  return age > 0 ? Math.round(208 - 0.7 * age) : null;
}

/** This player's own zones: share of the heart rate reserve above resting (Karvonen); without a resting rate, share of max. null when max is unknown */
function healthZones(h, age) {
  var max = healthMaxHr(h, age); if (!max) return null;
  var rest = h && h.restHr > 0 ? Math.round(h.restHr) : 0;
  return HEALTH_ZONES.map(function (z) {
    var lo = rest ? rest + z[1] * (max - rest) : z[1] * max, hi = rest ? rest + z[2] * (max - rest) : z[2] * max;
    return { id: z[0], lo: Math.round(lo), hi: Math.round(hi) };
  });
}

/** Closeness of a played match from my side: margin of the points (average over its games) */
function healthMatchMargin(m) {
  var gs = (m.games || []).filter(function (g) { return g && g.a != null && g.b != null; });
  if (!gs.length) return null;
  return Math.round(gs.reduce(function (s, g) { return s + Math.abs(g.a - g.b); }, 0) / gs.length);
}

/** The matches of one session that this player took part in AND that have live-score minutes, oldest first, placed on a minute timeline.
    Real start/end times are used when the live score saved them, else the games follow each other with the rest spread evenly. */
function healthSegments(uid, matches, session) {
  var mine = matches.filter(function (m) { return m.minutes > 0 && ((m.teamA || []).indexOf(uid) >= 0 || (m.teamB || []).indexOf(uid) >= 0); })
    .sort(function (a, b) { return (a.startAt || a.createdAt || 0) - (b.startAt || b.createdAt || 0); });
  if (!mine.length) return { segs: [], onCourt: 0, totalMin: 0 };
  var sumMin = mine.reduce(function (s, m) { return s + m.minutes; }, 0);
  var booked = session && session.duration > 0 ? Math.round(session.duration * 60) : 0;
  var real = mine.every(function (m) { return m.startAt && m.endAt; });
  var segs = [], t0, totalMin;
  if (real) {
    t0 = mine[0].startAt - HEALTH_WARMUP_MIN * 60000;
    totalMin = Math.max(booked, Math.round((mine[mine.length - 1].endAt - t0) / 60000) + 3);
    mine.forEach(function (m, i) { segs.push({ s: (m.startAt - t0) / 60000, e: (m.endAt - t0) / 60000, len: m.minutes, m: m }); });
  } else {
    totalMin = Math.max(booked, HEALTH_WARMUP_MIN + sumMin + 3);
    var gap = mine.length > 1 ? (totalMin - HEALTH_WARMUP_MIN - sumMin - 3) / (mine.length - 1) : 0, t = HEALTH_WARMUP_MIN;
    mine.forEach(function (m) { segs.push({ s: t, e: t + m.minutes, len: m.minutes, m: m }); t += m.minutes + Math.max(0, gap); });
  }
  segs.forEach(function (g) {
    var mm = g.m, onA = (mm.teamA || []).indexOf(uid) >= 0, gs = mm.games || [];
    g.margin = healthMatchMargin(mm); g.close = g.margin != null && g.margin <= 2;
    var a = gs.reduce(function (s, x) { return s + (x.a || 0); }, 0), b = gs.reduce(function (s, x) { return s + (x.b || 0); }, 0);
    g.mine = onA ? a : b; g.their = onA ? b : a; g.won = g.mine > g.their;
  });
  return { segs: segs, onCourt: sumMin, totalMin: totalMin };
}

/** Calories (estimate): MET x kg x hours for play, warm-up and the rest of the session; "active" removes the 1 MET the body burns anyway */
function healthKcal(kg, onCourt, totalMin) {
  var rest = Math.max(0, totalMin - HEALTH_WARMUP_MIN - onCourt);
  var total = HEALTH_MET.play * kg * onCourt / 60 + HEALTH_MET.warm * kg * HEALTH_WARMUP_MIN / 60 + HEALTH_MET.rest * kg * rest / 60;
  return { total: Math.round(total), active: Math.round(total - kg * totalMin / 60) };
}

/** Heart rate every 30 s as a share of THIS player's reserve: warm-up ramp, games near 60% (closer score = higher and a late peak, a blowout = lower), rest decays */
function healthSeries(rest, max, segs, totalMin) {
  var hrr = max - rest, pts = [], f = .22, noise = function (i) { var x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  var endPlay = segs.length ? segs[segs.length - 1].e : HEALTH_WARMUP_MIN;
  for (var m = 0; m <= totalMin; m += 0.5) {
    var seg = null; for (var i = 0; i < segs.length; i++) if (m >= segs[i].s && m < segs[i].e) { seg = segs[i]; break; }
    var target;
    if (m < HEALTH_WARMUP_MIN && (!segs.length || m < segs[0].s)) target = .22 + Math.min(1, m / Math.max(1, segs.length ? segs[0].s : HEALTH_WARMUP_MIN)) * .34;
    else if (seg) {
      var into = (m - seg.s) / seg.len, margin = seg.margin == null ? 5 : seg.margin, c = Math.max(0, 1 - margin / 10);
      target = .60 + .10 * c - (margin > 8 ? .03 : 0) + (seg.close ? .07 * Math.pow(into, 3) : 0) + Math.sin(m * 2.3) * .03 + (noise(m * 2) - .5) * .05;
      target = Math.min(target, f + .06 * (into < .2 ? 2 : 1) + .05);
    } else if (m >= endPlay) target = .08 - (m - endPlay) * .02;
    else target = .30 + Math.sin(m) * .015;
    f += (target - f) * (seg ? .35 : .22);
    pts.push([m, rest + f * hrr]);
  }
  return pts;
}

/** Everything the session card shows, or null when this player has no timed games in the session */
function healthForSession(h, age, uid, matches, session) {
  var sg = healthSegments(uid, matches, session);
  if (!sg.segs.length) return null;
  var out = { segs: sg.segs, onCourt: sg.onCourt, totalMin: sg.totalMin, close: sg.segs.filter(function (g) { return g.close; }).length };
  out.kcal = h && h.weightKg > 0 ? healthKcal(h.weightKg, sg.onCourt, sg.totalMin) : null;
  var max = healthMaxHr(h, age), zones = healthZones(h, age);
  out.max = max; out.zones = zones;
  if (max) {
    var rest = h && h.restHr > 0 ? h.restHr : 65;
    out.restAssumed = !(h && h.restHr > 0);
    out.pts = healthSeries(rest, max, sg.segs, sg.totalMin);
    out.avg = Math.round(out.pts.reduce(function (s, p) { return s + p[1]; }, 0) / out.pts.length);
    out.peak = Math.round(Math.max.apply(null, out.pts.map(function (p) { return p[1]; })));
    out.zoneMin = zones.map(function (z, k) { return Math.round(out.pts.filter(function (p) { return p[1] >= z.lo && (k === 4 || p[1] < z.hi); }).length / 2); });
    sg.segs.forEach(function (g) {
      var inside = out.pts.filter(function (p) { return p[0] >= g.s && p[0] < g.e; }).map(function (p) { return p[1]; });
      g.avg = inside.length ? Math.round(inside.reduce(function (s, v) { return s + v; }, 0) / inside.length) : null;
    });
  }
  return out;
}

/** Totals for a scope: timed games I played, minutes on court, estimated kcal (from the matches of each session, or on court only when the session is unknown) */
function healthTotals(h, uid, matches, sessions, scope) {
  var from = typeof scopeFrom === "function" ? scopeFrom(scope) : "";
  var bySes = {};
  matches.forEach(function (m) { if (m.minutes > 0 && (!from || String(m.date || "") >= from)) (bySes[m.sessionId || "_"] = bySes[m.sessionId || "_"] || []).push(m); });
  var out = { sessions: 0, games: 0, minutes: 0, kcal: 0, hasKcal: !!(h && h.weightKg > 0) };
  Object.keys(bySes).forEach(function (sid) {
    var ses = (sessions || []).filter(function (s) { return s.id === sid; })[0], sg = healthSegments(uid, bySes[sid], ses);
    if (!sg.segs.length) return;
    out.sessions++; out.games += sg.segs.length; out.minutes += sg.onCourt;
    if (out.hasKcal) out.kcal += healthKcal(h.weightKg, sg.onCourt, sg.totalMin).active;
  });
  return out;
}

/* ───────────────────────── screens ───────────────────────── */

function myHealth() { return (typeof _myPrivate !== "undefined" && _myPrivate && _myPrivate.health) || {}; }
function _healthAge() {
  var u = typeof findUser === "function" && currentUser ? findUser(currentUser.uid) : null;
  var by = u && u.about && u.about.birthYear;
  if (typeof _myAge === "function" && _myAge()) return _myAge();
  return by ? new Date().getFullYear() - by : null;
}

/** Make sure my private record is loaded, then run cb */
function loadMyHealth(cb) {
  if (typeof _myPrivate !== "undefined" && _myPrivate !== null) { cb(); return; }
  if (!currentUser) return;
  fsdb.collection("userPrivate").doc(currentUser.uid).get().then(function (doc) { _myPrivate = doc.exists ? doc.data() : {}; cb(); }).catch(function () { _myPrivate = {}; cb(); });
}

/** The estimate card on a session's Games tab (mine only) */
function healthCardHtml(s) {
  if (!currentUser || !(s.players || []).length) return "";
  if (typeof _myPrivate !== "undefined" && _myPrivate === null) {   // my private record is not loaded yet: load it once, then redraw the Games tab
    loadMyHealth(function () { if (typeof currentPage !== "undefined" && currentPage === "session-detail" && typeof renderSessionGamesTab === "function" && sessionTab === "games") renderSessionGamesTab(); });
    return "";
  }
  var h = myHealth(), me = currentUser.uid, age = _healthAge();
  var d = healthForSession(h, age, me, sessionMatches(s.id), s);
  if (!d) return "";
  var fmtM = function (m) { return Math.floor(m / 60) ? Math.floor(m / 60) + " " + t("hShort") + " " + (m % 60) + " " + t("minShort") : m + " " + t("minShort"); };
  var tile = function (v, l, hot) { return '<div class="hc-tile' + (hot ? ' hot' : '') + '"><b>' + v + '</b><small>' + l + '</small></div>'; };
  var html = '<div class="card health-card"><div class="card-title">' + icon("chart", 14) + ' ' + t("healthMyWorkout") + ' <span class="hc-est">' + t("healthEstimate") + '</span></div><div class="hc-tiles">' +
    tile(fmtM(d.onCourt), t("healthOnCourt").replace("{n}", d.segs.length)) +
    (d.kcal ? tile(d.kcal.active, t("healthKcal")) : '') + (d.pts ? tile(d.avg, t("healthAvgBpm")) + tile(d.peak, t("healthPeakBpm"), true) : '') +
    (d.zones ? tile(d.zoneMin[2] + d.zoneMin[3] + d.zoneMin[4] + " " + t("minShort"), t("healthZ3Up")) : '') + '</div>';
  if (d.pts) html += healthChartSvg(d) + '<div class="hc-note">' + (d.restAssumed ? t("healthRestAssumed") + ' ' : '') + t("healthNote") + '</div>';
  if (!d.kcal || !d.zones) html += '<button type="button" class="btn-secondary" onclick="openPfSub(\'health\')">' + icon("user", 16) + ' ' + t("healthAddDetails") + '</button>';
  return html + '</div>';
}

/** Heart rate through the session: zone bands in this player's own bpm, games shaded (amber when close), the curve */
function healthChartSvg(d) {
  var W = 720, H = 330, L = 46, R = 10, T = 12, B = 66, total = d.totalMin;
  var lo = Math.floor((Math.min.apply(null, d.pts.map(function (p) { return p[1]; })) - 5) / 20) * 20, hi = Math.ceil((d.peak + 8) / 20) * 20;
  var X = function (m) { return L + (W - L - R) * m / total; }, Y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
  var s = '';
  d.zones.forEach(function (z, k) {
    var a = Math.max(lo, z.lo), b = Math.min(hi, z.hi);
    if (k > 0 && b > a) s += '<rect x="' + L + '" y="' + Y(b) + '" width="' + (W - L - R) + '" height="' + (Y(a) - Y(b)) + '" class="hz hz' + (k + 1) + '"/><text x="' + (W - R - 4) + '" y="' + (Y(b) + 11) + '" text-anchor="end" class="hc-t">' + z.id + ' ' + z.lo + '-' + z.hi + '</text>';
  });
  for (var v = lo; v <= hi; v += 20) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="hc-gl"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" class="hc-t">' + v + '</text>';
  d.segs.forEach(function (g, i) {
    s += '<rect x="' + X(g.s) + '" y="' + T + '" width="' + Math.max(1, X(g.e) - X(g.s)) + '" height="' + (H - T - B) + '" class="' + (g.close ? 'hg-close' : 'hg') + '"/>';
    var cx = (X(g.s) + X(g.e)) / 2;
    s += '<text x="' + cx + '" y="' + (H - B + 20) + '" text-anchor="middle" class="hc-t hc-b">G' + (i + 1) + '</text><text x="' + cx + '" y="' + (H - B + 40) + '" text-anchor="middle" class="hc-t' + (g.close ? ' hc-b' : '') + '">' + g.mine + '-' + g.their + '</text>';
  });
  var path = d.pts.map(function (p, k) { return (k ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
  s += '<path class="hc-fill" d="' + path + ' L' + X(total) + " " + Y(lo) + " L" + X(0) + " " + Y(lo) + ' Z"/><path class="hc-line" d="' + path + '"/>';
  return '<svg class="hc-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(t("healthChartAria")) + '">' + s + '</svg>' +
    '<div class="hc-legend"><span class="hc-lg1"></span>' + t("healthLegendGame") + ' <span class="hc-lg2"></span>' + t("healthLegendClose") + '</div>';
}

/** Profile > Health details */
function healthPageHtml() {
  var h = myHealth(), age = _healthAge(), me = currentUser.uid;
  var zones = healthZones(h, age), max = healthMaxHr(h, age);
  var num = function (id, label, val, ph, hint) {
    return '<div class="form-group"><label class="form-label" for="' + id + '">' + label + '</label><input type="text" inputmode="decimal" class="form-input" id="' + id + '" value="' + escapeHtml(val == null ? "" : String(val)) + '" placeholder="' + ph + '" maxlength="5">' +
      (hint ? '<div class="form-hint">' + hint + '</div>' : '') + '</div>';
  };
  var html = '<div class="card"><div class="lock-note">' + icon("lock", 14) + ' ' + t("healthPrivate") + '</div>' +
    num("hWeight", t("healthWeight") + ' (kg)', h.weightKg, "70", t("healthWeightHint")) +
    num("hHeight", t("healthHeight") + ' (cm)', h.heightCm, "172", "") +
    '<div class="form-group"><label class="form-label">' + t("healthSex") + '</label><div class="seg seg-wrap" role="radiogroup">' +
    [["", "healthSexNone"], ["m", "healthSexM"], ["f", "healthSexF"]].map(function (x) { return '<button type="button" class="seg-btn' + ((h.sex || "") === x[0] ? ' active' : '') + '" role="radio" aria-checked="' + ((h.sex || "") === x[0]) + '" onclick="healthPickSex(\'' + x[0] + '\')">' + t(x[1]) + '</button>'; }).join("") + '</div></div>' +
    num("hRest", t("healthRest") + ' (bpm)', h.restHr, "62", t("healthRestHint")) +
    num("hMax", t("healthMax") + ' (bpm)', h.maxHr, max ? String(max) : "184", max && !h.maxHr ? t("healthMaxAuto").replace("{n}", max) : t("healthMaxHint")) +
    num("hGoal", t("healthGoal"), h.weeklyGoal, "2", t("healthGoalHint")) +
    '<div class="form-group"><label class="form-label" for="hNotes">' + t("healthNotes") + '</label><textarea class="form-input" id="hNotes" rows="2" maxlength="300" placeholder="' + escapeHtml(t("healthNotesHint")) + '">' + escapeHtml(h.notes || "") + '</textarea></div>' +
    '<button type="button" class="btn-primary" onclick="saveHealth()">' + t("save") + '</button></div>';
  if (zones) {
    html += '<div class="card"><div class="card-title">' + icon("chart", 14) + ' ' + t("healthMyZones") + '</div><div class="hz-list">' + zones.map(function (z) {
      return '<div class="hz-row"><b>' + z.id + '</b><span>' + z.lo + ' – ' + z.hi + ' bpm</span></div>'; }).join("") + '</div><div class="form-hint">' + t(h.restHr ? "healthZonesKarvonen" : "healthZonesPct") + '</div></div>';
  } else html += '<div class="card"><div class="form-hint">' + t("healthNoZones") + '</div></div>';
  var tot = healthTotals(h, me, typeof lastMatches !== "undefined" ? lastMatches : [], typeof lastSessions !== "undefined" ? lastSessions : [], statsScope);
  html += '<div class="card"><div class="card-title">' + icon("history", 14) + ' ' + t("healthTotals") + '</div>' + scopeChipsHtml() +
    '<div class="hc-tiles"><div class="hc-tile"><b>' + tot.sessions + '</b><small>' + t("healthSessions") + '</small></div><div class="hc-tile"><b>' + tot.games + '</b><small>' + t("gamesWord") + '</small></div>' +
    '<div class="hc-tile"><b>' + tot.minutes + '</b><small>' + t("healthMinOnCourt") + '</small></div>' + (tot.hasKcal ? '<div class="hc-tile"><b>' + tot.kcal + '</b><small>' + t("healthKcal") + '</small></div>' : '') + '</div>' +
    '<div class="form-hint">' + t("healthDisclaimer") + '</div></div>';
  return html;
}

var _hSex = null;
function healthPickSex(v) { _hSex = v; [].forEach.call(document.querySelectorAll('[role=radio][onclick^="healthPickSex"]'), function (b) { var on = b.getAttribute("onclick").indexOf("'" + v + "'") >= 0; b.classList.toggle("active", on); b.setAttribute("aria-checked", on); }); }

function saveHealth() {
  var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
  var n = function (id, lo, hi) { var raw = g(id).replace(",", "."); if (!raw) return null; var v = parseFloat(raw); return isNaN(v) || v < lo || v > hi ? NaN : v; };
  var w = n("hWeight", 20, 300), ht = n("hHeight", 80, 250), rest = n("hRest", 30, 120), mx = n("hMax", 120, 230), goal = n("hGoal", 0, 14);
  if ([w, ht, rest, mx, goal].some(function (v) { return v !== null && isNaN(v); })) { showToast(t("healthRange")); return; }
  if (rest && mx && mx <= rest + 20) { showToast(t("healthRange")); return; }
  var cur = myHealth(), h = { weightKg: w, heightCm: ht, sex: _hSex != null ? _hSex : (cur.sex || ""), restHr: rest, maxHr: mx, weeklyGoal: goal, notes: g("hNotes").slice(0, 300) };
  _hSex = null;
  fsdb.collection("userPrivate").doc(currentUser.uid).set({ health: h }, { merge: true }).then(function () {
    if (_myPrivate) _myPrivate.health = h; else _myPrivate = { health: h };
    showToast(t("saved") + " ✔");
    if (typeof refreshCurrentPage === "function") refreshCurrentPage("health");
  }).catch(function (e) { showToast(_permError(e)); });
}
