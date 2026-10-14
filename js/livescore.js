/* ============================================================
   livescore.js — count a game live, then save it as a normal game
   One phone counts. Rules (shuttle rally scoring): a game ends at 21 with a
   2-point lead; if it stays close it ends when a team reaches the cap
   (maxPoints(): 30 or 31 — the group's setting). The team that scores serves.
   Left half of a team = minus, right half = plus.
   The score lives on this phone (localStorage) until the game is saved, so
   a refresh or a phone call does not lose it. A saved game is exactly what
   "Add game score" saves (one document in `matches`).
   Depends on: stats.js (maxPoints, scoreProblem, _canAddGames, byNameAZ,
               withGroup), ui.js (personHtml), sessions.js (lastSessions)
   ============================================================ */

var LS_KEY = "godsmash_live_v1";
var LS_THEME_KEY = "godsmash_live_theme";
/** name, team A (from, to), team B (from, to) */
var LS_THEMES = [
  ["Classic", "#e2554f", "#ef7a73", "#4f86f0", "#7aa2f5"],
  ["Sunset", "#f97316", "#fb923c", "#7c3aed", "#a78bfa"],
  ["Forest", "#16a34a", "#4ade80", "#0f766e", "#2dd4bf"],
  ["Ocean", "#0891b2", "#22d3ee", "#4338ca", "#818cf8"],
  ["Night", "#db2777", "#f472b6", "#1e293b", "#475569"],
  ["Royal", "#ca8a04", "#facc15", "#1e3a8a", "#3b82f6"]
];
var LS_START_POINTS = 21;

var live = null;          // the running game, or null
var liveMode = "count";   // setup | count | settings | menu
var _wakeLock = null;

/* ---------- Rules (pure; tested without a screen) ---------- */

/** Is the game over? { done, winner: "A"|"B"|null } */
function lsOver(a, b, cap) {
  var hi = Math.max(a, b), lo = Math.min(a, b);
  var done = (hi >= LS_START_POINTS && hi - lo >= 2) || hi >= cap;
  return { done: done, winner: done ? (a > b ? "A" : "B") : null };
}

/** Which team is one point from winning ("A", "B", or null) */
function lsGamePoint(a, b, cap) {
  if (lsOver(a, b, cap).done) return null;
  if (lsOver(a + 1, b, cap).done && a >= b) return "A";
  if (lsOver(a, b + 1, cap).done && b >= a) return "B";
  return null;
}

/** Add (delta +1) or take away (-1) a point for a side. Returns a new state. */
function lsApply(st, side, delta, cap) {
  var n = JSON.parse(JSON.stringify(st));
  if (n.over) return n;
  var k = side === "A" ? "sa" : "sb";
  if (delta > 0) {
    n.hist.push({ s: side, serve: n.serve });
    n[k] += 1;
    n.serve = side;
    var r = lsOver(n.sa, n.sb, cap);
    if (r.done) n.over = r.winner;
  } else if (n[k] > 0) {
    var last = n.hist[n.hist.length - 1];
    if (last && last.s === side) { n.hist.pop(); n.serve = last.serve; }
    n[k] -= 1;
  }
  return n;
}

/** Undo the last point of either team */
function lsUndoLast(st) {
  var n = JSON.parse(JSON.stringify(st));
  var last = n.hist.pop();
  if (!last) return n;
  n[last.s === "A" ? "sa" : "sb"] -= 1;
  n.serve = last.serve;
  n.over = null;
  return n;
}

/* ---------- Storage ---------- */

function lsSave() {
  if (live && live.test) { lsShare(); return; }   /* a practice game is never kept on the phone, but it is shared so the watch screen can be tried */
  try { if (live) localStorage.setItem(LS_KEY, JSON.stringify(live)); else localStorage.removeItem(LS_KEY); } catch (e) {}
  if (live) lsShare(); else lsUnshare();
}
function lsLoad() { try { var s = JSON.parse(localStorage.getItem(LS_KEY) || "null"); return s && s.sid ? s : null; } catch (e) { return null; } }
function lsThemeIdx() { var i = 0; try { i = parseInt(localStorage.getItem(LS_THEME_KEY), 10) || 0; } catch (e) {} return i >= 0 && i < LS_THEMES.length ? i : 0; }

function _lsSessions() {
  var today = _todayIso();
  return lastSessions.filter(function (s) { return s.status !== "cancelled" && s.status !== "completed" && _canAddGames(s) && (s.date || "") <= today && sessionStep(s) < 3; })
    .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
}
function _lsSession(id) {
  for (var i = 0; i < lastSessions.length; i++) if (lastSessions[i].id === id) return lastSessions[i];
  return null;
}
function _lsBlank(sid, type) {
  return { sid: sid, type: type || "md", a: [], b: [], sa: 0, sb: 0, serve: "A", hist: [], over: null, startedAt: Date.now(), saved: 0, bo: 1, sw: { A: 0, B: 0 }, gl: [] };
}

/* ---------- Match format: single game, best of 3, best of 5 (the same pairs play on) ---------- */

function lsNeed(st) { return Math.ceil(((st || live).bo || 1) / 2); }
/** Games won so far in this match, counting the game that just finished */
function lsSeriesAfter(st, winner) {
  var sw = st.sw || { A: 0, B: 0 }, n = { A: sw.A || 0, B: sw.B || 0 };
  n[winner] += 1;
  return n;
}
function lsMatchDecided(st, winner) { return (st.bo || 1) > 1 && lsSeriesAfter(st, winner)[winner] >= lsNeed(st); }
function lsBo(n) {
  if (!live) return;
  live.bo = n; live.sw = { A: 0, B: 0 }; live.gl = [];
  lsSave(); lsRender();
}
function _boSegHtml() {
  var cur = live.bo || 1;
  return '<div class="seg seg-wrap">' + [1, 3, 5].map(function (n) {
    return '<button type="button" class="seg-btn' + (cur === n ? ' active' : '') + '" onclick="lsBo(' + n + ')">' + (n === 1 ? t("lsSingleGame") : t("lsBestOf").replace("{n}", n)) + '</button>';
  }).join("") + '</div>';
}

/** Match score as small text under the score: games won, then this team's points in each finished game (the game it won in bold) */
function flipBoardHtml(side, sw, gl) {
  var o = side === "A" ? "B" : "A", k = side.toLowerCase(), q = o.toLowerCase();
  var html = '<div class="ls-flip" aria-label="' + t("lsGamesWon").replace("{n}", sw[side]) + '"><span class="ls-won-n">' + t("lsGamesWon").replace("{n}", sw[side]) + '</span>';
  (gl || []).forEach(function (g) { html += '<span class="ls-pt' + (g[k] > g[q] ? ' win' : '') + '">' + g[k] + '</span>'; });
  return html + '</div>';
}

/* ---------- Open / close ---------- */

/** Open live score. With a session id: go straight to it. Without: resume a game
 *  being counted, or ask which session this game belongs to. */
function showLiveScore(sid) {
  var saved = lsLoad();
  if (!sid && saved && _lsSession(saved.sid) && (saved.sa + saved.sb > 0 || _lsReady(saved))) sid = saved.sid;
  if (sid && _lsSession(sid)) {
    var s = _lsSession(sid);
    live = saved && saved.sid === sid ? saved : _lsBlank(sid, s.gameType && s.gameType !== "any" ? s.gameType : "md");
    liveMode = _lsReady(live) ? "count" : "setup";
  } else {
    live = null;
    liveMode = "pick";
  }
  _lsShow();
}

function _lsReady(st) { if (st.test) return true;  var size = st.type === "singles" ? 1 : 2; return st.a.length === size && st.b.length === size; }

function _lsShow() {
  var el = document.getElementById("liveScreen");
  if (!el) return;
  el.classList.add("on");
  document.body.classList.add("live-on");
  lsRender();
  _lsWake(true);
}

function lsClose() {
  var el = document.getElementById("liveScreen");
  if (el) { el.classList.remove("on"); el.innerHTML = ""; }
  document.body.classList.remove("live-on");
  _lsWake(false);
  if (typeof refreshCurrentPage === "function") refreshCurrentPage("live");
}

function _lsWake(on) {
  try {
    if (on && navigator.wakeLock && !_wakeLock) navigator.wakeLock.request("screen").then(function (l) { _wakeLock = l; l.addEventListener("release", function () { _wakeLock = null; }); }).catch(function () {});
    if (!on && _wakeLock) { _wakeLock.release(); _wakeLock = null; }
  } catch (e) {}
}

/* ---------- Render ---------- */

function lsRender() {
  var el = document.getElementById("liveScreen");
  if (!el) return;
  if (liveMode === "watch") { el.innerHTML = _lsWatchHtml(); return; }
  if (liveMode === "pick") { el.innerHTML = _lsPickHtml(); return; }
  if (!live) return;
  if (liveMode === "setup") el.innerHTML = _lsSetupHtml();
  else if (liveMode === "settings") el.innerHTML = _lsSettingsHtml();
  else el.innerHTML = _lsCountHtml();
}

function _lsTheme() { return LS_THEMES[lsThemeIdx()]; }
function _lsTeam(side, ids) {
  return ids.map(function (u) { return '<span class="ls-chip">' + avatarHtml(u, 26) + '<span>' + getUserName(u) + '</span></span>'; }).join("");
}

function _lsCountHtml() {
  var th = _lsTheme(), cap = maxPoints(), gp = lsGamePoint(live.sa, live.sb, cap);
  var half = function (side) {
    var score = side === "A" ? live.sa : live.sb, from = side === "A" ? th[1] : th[3], to = side === "A" ? th[2] : th[4];
    var ids = byNameAZ(side === "A" ? live.a : live.b);
    return '<div class="ls-half" style="background:linear-gradient(160deg,' + from + ',' + to + ')">' +
      '<button type="button" class="ls-zone ls-minus" aria-label="' + t("lsMinus") + '" onclick="lsTap(\'' + side + '\',-1)"><span>' + icon("minus", 18) + '</span></button>' +
      '<button type="button" class="ls-zone ls-plus" aria-label="' + t("lsPlus") + '" onclick="lsTap(\'' + side + '\',1)"><span>' + icon("plus", 24) + '</span></button>' +
      '<div class="ls-info"><div class="ls-team">' + (live.serve === side ? icon("shuttle", 26) + ' ' : '') + '<span class="ls-tname">' + t("lsTeam") + ' ' + side + '</span></div>' +
      '<div class="ls-chips">' + _lsTeam(side, ids) + '</div><div class="ls-score">' + score + '</div>' +
      ((live.bo || 1) > 1 ? flipBoardHtml(side, live.sw, live.gl) : '') + '</div></div>';
  };
  var html = half("A") + half("B");
  html += '<button type="button" class="ls-exit ls-exit-count" onclick="lsExit()">' + icon("back", 18) + ' ' + t("lsExit") + '</button>';
  if (live.test) html += '<div class="ls-test">' + icon("warning", 14) + ' ' + t("lsTestBadge") + '</div>';
  html += '<div class="ls-mid"><button type="button" class="ls-mid-btn" aria-label="' + t("lsUndo") + '" onclick="lsUndo()">' + icon("history", 22) + '</button>' +
    '<span class="ls-pill">' + t("lsGameN").replace("{n}", (live.bo || 1) > 1 ? (live.sw.A + live.sw.B + 1) : live.saved + 1) + '<span class="ls-pill-x"> · ' + t("lsTo").replace("{n}", LS_START_POINTS) +
      ((live.bo || 1) > 1 ? ' · ' + t("lsBestOf").replace("{n}", live.bo) + ' (' + live.sw.A + '\u2013' + live.sw.B + ')' : '') + '</span></span>' +
    '<button type="button" class="ls-mid-btn" aria-label="' + t("lsMenu") + '" onclick="lsMenu()">' + icon("settings", 22) + '</button></div>';
  if (gp && !live.over) html += '<div class="ls-gp"><span>' + t("lsGamePoint") + ' · ' + t("lsTeam") + ' ' + gp + '</span></div>';
  if (liveMode === "menu") {
    html += '<div class="ls-scrim" onclick="lsMenu(false)"></div><div class="ls-menu">' +
      '<button type="button" onclick="lsExit()">' + icon("back", 32) + '<span>' + t("lsExit") + '</span></button>' +
      '<button type="button" onclick="lsReset()">' + icon("trash", 32) + '<span>' + t("lsReset") + '</span></button>' +
      '<button type="button" onclick="lsOpenSettings()">' + icon("settings", 32) + '<span>' + t("lsSettings") + '</span></button>' +
      (document.documentElement.requestFullscreen ? '<button type="button" onclick="lsFullscreen()">' + icon("scoreboard", 32) + '<span>' + t("lsFullscreen") + '</span></button>' : '') + '</div>' +
      '<button type="button" class="ls-menu-x" aria-label="' + t("close") + '" onclick="lsMenu(false)">' + icon("close", 26) + '</button>';
  }
  if (live.over) html += _lsOverHtml();
  return html;
}

function _lsOverHtml() {
  var w = live.over, ids = byNameAZ(w === "A" ? live.a : live.b);
  var after = lsSeriesAfter(live, w), decided = lsMatchDecided(live, w), multi = (live.bo || 1) > 1;
  var title = decided
    ? t("lsMatchWins").replace("{team}", t("lsTeam") + " " + w).replace("{a}", after.A).replace("{b}", after.B)
    : t("lsWins").replace("{team}", t("lsTeam") + " " + w);
  var series = multi && !decided ? '<div class="form-hint">' + t("lsBestOf").replace("{n}", live.bo) + ' \u00B7 ' + after.A + '\u2013' + after.B + '</div>' : '';
  if (live.test) {
    return '<div class="ls-scrim dark"></div><div class="ls-over"><div class="ls-over-title">' + icon("medal", 28) + ' ' + title + '</div>' +
      '<div class="ls-over-score">' + live.sa + ' \u2013 ' + live.sb + '</div>' + series + '<div class="form-hint">' + t("lsTestBadge") + '</div>' +
      '<button class="btn-primary" onclick="lsTestAgain()">' + icon("scoreboard", 16) + ' ' + t(decided ? "lsRematch" : "lsTestAgain") + '</button>' +
      '<button class="btn-secondary" onclick="lsExit()">' + t("lsExit") + '</button>' +
      '<button class="link-btn" onclick="lsUndo()">' + t("lsUndo") + '</button></div>';
  }
  return '<div class="ls-scrim dark"></div><div class="ls-over"><div class="ls-over-title">' + icon("medal", 28) + ' ' + title + '</div>' +
    '<div class="ls-over-score">' + live.sa + ' \u2013 ' + live.sb + '</div>' + series + '<div class="ls-over-people">' + ids.map(function (u) { return personHtml(u, 30); }).join("") + '</div>' +
    '<button class="btn-primary" onclick="lsSaveGame(true)">' + icon("check", 16) + ' ' + t(decided ? "lsRematch" : "lsSaveNext") + '</button>' +
    '<button class="btn-secondary" onclick="lsSaveGame(false)">' + t("lsSaveFinish") + '</button>' +
    '<button class="link-btn" onclick="lsUndo()">' + t("lsUndo") + '</button></div>';
}

/** Step 1: which game (session) is this score for? */
function _lsPickHtml() {
  var list = _lsSessions(), today = _todayIso();
  var html = '<div class="ls-bar"><button type="button" class="ls-back" aria-label="' + t("lsExit") + '" onclick="lsClose()">' + icon("back", 22) + '</button><div><b>' + t("lsPickGame") + '</b><small>' + t("lsPickGameHint") + '</small></div></div><div class="ls-body">';
  html += '<button type="button" class="ls-try" onclick="lsTry()">' + icon("scoreboard", 22) + '<span><b>' + t("lsTry") + '</b><small>' + t("lsTryHint") + '</small></span>' + icon("chevron", 16) + '</button>';
  if (!list.length) {
    html += '<div class="card"><div class="empty-state" style="padding:16px"><div class="empty-icon">' + icon("sessions", 40) + '</div><div>' + t("homeNoSession") + '</div></div></div>';
  }
  list.forEach(function (s, i) {
    var pl = s.players || [];
    html += '<button type="button" class="ls-game-row" onclick="lsChoose(\'' + s.id + '\')">' + dateBlockHtml(s.date) +
      '<span class="ls-game-main"><b>' + escapeHtml(s.courtName || "–") + '</b><small>' + iconStatHtml("users", pl.length) + ' ' + iconStatHtml("clock", escapeHtml(s.time || "–")) + '</small>' +
      '<span class="ls-game-people">' + peopleHtml(pl, 20, 3) + '</span></span>' +
      (i === 0 ? pillHtml("teal", s.date === today ? t("lsToday") : t("lsCurrent")) : '') + icon("chevron", 16) + '</button>';
  });
  html += '</div>';
  return html;
}

/** Practice: count points to see how it works. Nothing is saved or kept, no game is needed. */
function lsTry() {
  live = _lsBlank("__test__", "md");
  live.test = true;
  liveMode = "count";
  lsShare();   // a practice board can be watched too, to try the iPad
  lsRender();
}

function lsChoose(sid) {
  var s = _lsSession(sid);
  if (!s) return;
  live = _lsBlank(sid, s.gameType && s.gameType !== "any" ? s.gameType : "md");
  lsSave();
  liveMode = "setup";
  lsRender();
}

function lsChangeGame() { liveMode = "pick"; lsRender(); }

function _lsSetupHtml() {
  var s = _lsSession(live.sid) || {}, size = live.type === "singles" ? 1 : 2, th = _lsTheme();
  var team = function (side, ids, from, to) {
    var html = '<div class="ls-team-box" style="background:linear-gradient(160deg,' + from + ',' + to + ')"><div class="ls-team-head"><b>' + t("lsTeam") + ' ' + side + '</b><span>' + ids.length + '/' + size + '</span></div><div class="ls-chips">';
    html += ids.map(function (u) { return '<button type="button" class="ls-chip rm" onclick="lsRemove(\'' + side + '\',\'' + u + '\')">' + avatarHtml(u, 26) + '<span>' + getUserName(u) + '</span>' + icon("close", 12) + '</button>'; }).join("");
    if (ids.length < size) html += '<span class="ls-chip ghost">' + icon("add", 18) + ' ' + t("lsAddPlayer") + '</span>';
    return html + '</div></div>';
  };
  var taken = live.a.concat(live.b);
  var pool = (s.players || []).filter(function (u) { return taken.indexOf(u) < 0; });
  pool = byNameAZ(pool);
  var html = '<div class="ls-bar"><button type="button" class="ls-back" aria-label="' + t("back") + '" onclick="lsChangeGame()">' + icon("back", 22) + '</button><div><b>' + t("lsTitle") + '</b><small>' + fmtDate(s.date) + ' · ' + escapeHtml(s.courtName || "") + '</small></div></div><div class="ls-body">' +
    '<button type="button" class="ls-current" onclick="lsChangeGame()">' + dateBlockHtml(s.date) + '<span><b>' + escapeHtml(s.courtName || "–") + '</b><small>' + t("lsCurrentGame") + '</small></span><i>' + t("lsChange") + '</i></button>' +
    '<div class="seg seg-wrap">' + ["md", "wd", "xd", "singles"].map(function (x) { return '<button type="button" class="seg-btn' + (live.type === x ? ' active' : '') + '" onclick="lsType(\'' + x + '\')">' + t("gameType_" + x) + '</button>'; }).join("") + '</div>' +
    '<div class="card"><div class="card-title">' + icon("medal", 14) + ' ' + t("lsFormat") + '</div>' + _boSegHtml() + '</div>' +
    (live.saved > 0 ? '<div class="ls-same">' + icon("users", 18) + '<span><b>' + t("lsSamePlayers") + '</b><small>' + t("lsSamePlayersHint") + '</small></span></div>' : '') +
    team("A", live.a, th[1], th[2]) + team("B", live.b, th[3], th[4]) +
    '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("lsPickPlayers") + '</div><div class="ls-pool">' +
    (pool.length ? pool.map(function (u) { return '<button type="button" class="ls-pool-chip" onclick="lsAdd(\'' + u + '\')">' + personHtml(u, 30) + '</button>'; }).join("") : '<div class="form-hint">' + t("lsNoMore") + '</div>') +
    '</div></div>' +
    '<div class="card ls-rules"><div class="card-title">' + icon("medal", 14) + ' ' + t("lsRules") + '</div>' +
    '<div>' + icon("medal", 16) + ' ' + t("lsRule1").replace("{n}", LS_START_POINTS) + '</div><div>' + icon("check", 16) + ' ' + t("lsRule2") + '</div>' +
    '<div>' + icon("crown", 16) + ' ' + t("lsRule3").replace("{cap}", maxPoints()) + '</div><div>' + icon("shuttle", 16) + ' ' + t("lsRule4") + '</div></div></div>' +
    '<div class="ls-foot"><button class="btn-primary" ' + (_lsReady(live) ? '' : 'disabled') + ' onclick="lsStart()">' + icon("scoreboard", 18) + ' ' + t("lsStart") + '</button></div>';
  return html;
}

function _lsSettingsHtml() {
  var cur = lsThemeIdx(), size = live.type === "singles" ? 1 : 2;
  var games = _lsSessions();
  var html = '<div class="ls-bar"><button type="button" class="ls-back" aria-label="' + t("back") + '" onclick="liveMode=\'count\';lsRender()">' + icon("back", 22) + '</button><div><b>' + t("lsSettings") + '</b></div></div><div class="ls-body">';
  html += '<div class="card"><div class="card-title">' + icon("medal", 14) + ' ' + t("lsFormat") + '</div>' + _boSegHtml() + '</div>';
  html += '<div class="card"><div class="card-title">' + icon("court", 14) + ' ' + t("lsCurrentGame") + '</div>' +
    games.map(function (s) {
      var on = s.id === live.sid;
      return '<button type="button" class="ls-game-row' + (on ? ' on' : '') + '" onclick="lsPickSession(\'' + s.id + '\')"><span class="radio-dot' + (on ? ' on' : '') + '"></span><span><b>' + fmtDate(s.date) + '</b><small>' + escapeHtml(s.courtName || "") + ' · ' + (s.players || []).length + ' ' + t("playersWord") + '</small></span></button>';
    }).join("") + '</div>';
  html += '<div class="card"><div class="card-title">' + icon("users", 14) + ' ' + t("lsTeamsPlaying") + '</div>' +
    ["A", "B"].map(function (side) {
      var ids = side === "A" ? live.a : live.b, th = LS_THEMES[cur];
      return '<div class="ls-team-box" style="background:linear-gradient(160deg,' + (side === "A" ? th[1] : th[3]) + ',' + (side === "A" ? th[2] : th[4]) + ')"><div class="ls-team-head"><b>' + t("lsTeam") + ' ' + side + '</b><span>' + ids.length + '/' + size + '</span></div><div class="ls-chips">' +
        ids.map(function (u) { return '<span class="ls-chip">' + avatarHtml(u, 26) + '<span>' + getUserName(u) + '</span></span>'; }).join("") + '</div></div>';
    }).join("") +
    '<button type="button" class="btn-secondary" onclick="lsEditTeams()">' + icon("pen", 16) + ' ' + t("lsChangeTeams") + '</button></div>';
  html += '<div class="card"><div class="card-title">' + icon("sun", 14) + ' ' + t("lsTheme") + '</div><div class="ls-themes">' +
    LS_THEMES.map(function (th, i) {
      return '<button type="button" class="ls-theme' + (i === cur ? ' on' : '') + '" onclick="lsSetTheme(' + i + ')"><span style="background:linear-gradient(160deg,' + th[1] + ',' + th[2] + ')"></span><span style="background:linear-gradient(160deg,' + th[3] + ',' + th[4] + ')"></span><b>' + th[0] + (i === cur ? ' ' + icon("check", 14) : '') + '</b></button>';
    }).join("") + '</div></div></div>' +
    '<div class="ls-foot"><button class="btn-primary" onclick="liveMode=\'count\';lsRender()">' + icon("check", 18) + ' ' + t("done") + '</button></div>';
  return html;
}

/* ---------- Actions ---------- */

function lsTap(side, delta) {
  if (!live || live.over) return;
  var before = live.sa + live.sb;
  live = lsApply(live, side, delta, maxPoints());
  if (delta > 0 && live.sa + live.sb !== before) { try { if (navigator.vibrate) navigator.vibrate(live.over ? [60, 40, 60] : 25); } catch (e) {} }
  lsSave();
  lsRender();
}
function lsUndo() { if (!live) return; live = lsUndoLast(live); lsSave(); lsRender(); }
function lsFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) {}
  lsMenu(false);
}
function lsMenu(on) { liveMode = on === false ? "count" : "menu"; lsRender(); }
function lsOpenSettings() { liveMode = "settings"; lsRender(); }
function lsEditTeams() { live.a = []; live.b = []; lsSave(); liveMode = "setup"; lsRender(); }
function lsSetTheme(i) { try { localStorage.setItem(LS_THEME_KEY, String(i)); } catch (e) {} lsRender(); }
function lsPickSession(id) {
  if (id === live.sid) return;
  live = _lsBlank(id, live.type); lsSave(); liveMode = "setup"; lsRender();
}
function lsType(x) { live.type = x; live.a = []; live.b = []; lsSave(); lsRender(); }
function lsAdd(uid) {
  var size = live.type === "singles" ? 1 : 2;
  if (live.a.length < size) live.a.push(uid); else if (live.b.length < size) live.b.push(uid);
  lsSave(); lsRender();
}
function lsRemove(side, uid) { var k = side === "A" ? "a" : "b"; live[k] = live[k].filter(function (u) { return u !== uid; }); lsSave(); lsRender(); }
function lsStart() { if (!_lsReady(live)) return; live.sa = 0; live.sb = 0; live.hist = []; live.over = null; lsSave(); liveMode = "count"; lsRender(); }

/** Reset everything counted in this match: the score, the games won (best of) and who serves. The pairs stay. */
function lsReset() {
  if (!confirm(t("lsResetConfirm"))) return;   // always ask: the button sits next to the ones you tap all game
  live.sa = 0; live.sb = 0; live.hist = []; live.over = null; live.serve = "A"; live.sw = { A: 0, B: 0 }; live.gl = [];
  lsSave(); liveMode = "count"; lsRender();
}

function lsTestAgain() {
  var w = live.over || "A", decided = lsMatchDecided(live, w);
  live.gl = decided ? [] : (live.gl || []).concat([{ a: live.sa, b: live.sb }]);
  live.sw = decided ? { A: 0, B: 0 } : lsSeriesAfter(live, w);
  live.sa = 0; live.sb = 0; live.hist = []; live.over = null; live.serve = w;
  lsShare(); lsRender();
}

/** Quit: ask first, then clear this live game (nothing counted is kept) */
function lsExit() {
  if (liveMode === "watch") { lsWatchStop(); return; }
  if (!confirm(t(live && live.test ? "lsExitTestConfirm" : "lsExitConfirm"))) return;   // always ask, whatever the score: an accidental tap must not end the game
  live = null; lsSave();
  liveMode = "count";
  lsClose();
}

/** Save the finished game like "Add game score" does, then continue or finish */
function lsSaveGame(next) {
  if (live && live.test) return;   // practice games are never saved
  var s = _lsSession(live.sid);
  if (!s || !live.over) return;
  var a = live.sa, b = live.sb, p = scoreProblem(a, b);
  if (p) { showToast(p); return; }
  var data = { type: live.type, teamA: live.a.slice(), teamB: live.b.slice(), games: [{ a: a, b: b }],
    minutes: Math.max(1, Math.min(180, Math.round((Date.now() - (live.startedAt || Date.now())) / 60000))) };
  fsdb.collection("matches").add(withGroup(Object.assign(data, { sessionId: s.id, date: s.date, mode: s.mode || "competition",
    court: null, shuttles: 0, createdBy: currentUser.uid, createdAt: Date.now(), confirmed: false, live: true })))
    .then(function () {
      showToast(t("gameSaved") + " ✔");
      if (next) {
        var winner = live.over, decided = lsMatchDecided(live, winner);
        live.gl = decided ? [] : (live.gl || []).concat([{ a: live.sa, b: live.sb }]);
        live.sw = decided ? { A: 0, B: 0 } : lsSeriesAfter(live, winner);   // a decided match starts again from 0\u20130
        live.saved += 1; live.sa = 0; live.sb = 0; live.hist = []; live.over = null; live.serve = winner; live.startedAt = Date.now();
        lsSave(); liveMode = "count"; lsRender();   // the same pairs play on; Settings \u2192 change teams to swap players
      } else {
        live = null; lsSave(); lsClose();
        showSessionDetail(s.id, "games");
      }
    }).catch(function (e) { showToast(_permError(e)); });
}

/** Drop a half-counted game from the Home banner (asks first) */
function lsCancelSaved() {
  if (!confirm(t("lsExitConfirm"))) return;
  live = null; lsSave();
  if (typeof refreshCurrentPage === "function") refreshCurrentPage("live");
}

/** A game is still being counted on this phone (for the Home banner) */
function lsInProgress() {
  var s = lsLoad();
  if (!s || s.over || !(s.sa + s.sb > 0) || !_lsSession(s.sid)) return null;
  if (_liveEnded(s)) {   // the game was ended or cancelled: nothing left to count, drop the banner and the board
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    if (live && live.sid === s.sid) live = null;
    lsUnshare();
    return null;
  }
  return s;
}


/* ============================================================
   Share and watch: the phone that counts publishes the score to
   liveGames/{hostUid}; other devices of the group (an iPad on a
   stand, a friend's phone) open it read-only and see it change.
   ============================================================ */

var LIVE_STALE_MS = 3 * 3600e3;   // a board nobody touched for 3 h is ignored
var liveNow = [];                  // other people's live games in my group
/** A random id kept on this device, so the board of my OWN phone is not offered to my own iPad logged in with the same account */
function _lsDev() {
  try { var d = localStorage.getItem("godsmash_dev"); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("godsmash_dev", d); } return d; } catch (e) { return "nodev"; }
}
var _liveListUnsub = null, _watchUnsub = null, _watch = null, _shareTimer = null, _shared = false;

/** Publish the running game (a short wait collects fast taps into one write) */
function lsShare() {
  if (!live || !currentUser || !currentGroupId || !_lsReady(live)) return;
  clearTimeout(_shareTimer);
  _shareTimer = setTimeout(function () {
    if (!live) return;
    _shared = true;
    fsdb.collection("liveGames").doc(currentUser.uid).set({
      hostId: currentUser.uid, dev: _lsDev(), groupId: currentGroupId, sid: live.sid, type: live.type, a: live.a, b: live.b,
      test: !!live.test, bo: live.bo || 1, sw: live.sw || { A: 0, B: 0 }, gl: live.gl || [], sa: live.sa, sb: live.sb, serve: live.serve || "A", over: live.over || null, saved: live.saved || 0,
      theme: lsThemeIdx(), startedAt: live.startedAt || Date.now(), updatedAt: Date.now()
    }).catch(function () {});   // watching is a bonus: counting never fails because of it
  }, 250);
}
function lsUnshare() {
  clearTimeout(_shareTimer);
  if (!currentUser) return;   // always ask for the delete: after a reload this page no longer knows it shared
  _shared = false;
  fsdb.collection("liveGames").doc(currentUser.uid).delete().catch(function () {});
}

/** The game (session) this board belongs to was ended or cancelled: the board must go too (practice boards have no session) */
function _liveEnded(x) {
  var ses = x.test ? null : _lsSession(x.sid);
  return !!ses && (ses.status === "completed" || ses.status === "cancelled" || sessionStep(ses) === 3);
}

/** Which games are being counted now by others in my group (for the Home banner) */
function liveWatchStart() {
  if (_liveListUnsub || !currentUser || !currentGroupId) return;
  _liveListUnsub = groupScoped(fsdb.collection("liveGames")).onSnapshot(function (snap) {
    var list = [];
    snap.forEach(function (d) {
      var x = d.data(); x.id = d.id;
      var ended = _liveEnded(x);
      if (ended && x.hostId === currentUser.uid && !live) d.ref.delete().catch(function () {});
      if (x.dev !== _lsDev() && !ended && Date.now() - (x.updatedAt || 0) < LIVE_STALE_MS) list.push(x);
    });
    liveNow = list;
    if (typeof refreshCurrentPage === "function" && currentPage === "home") refreshCurrentPage("live");
  }, function (e) { dbOnError(e, "liveGames"); });
}
function liveWatchStop() {
  if (_liveListUnsub) { _liveListUnsub(); _liveListUnsub = null; }
  liveNow = [];
  lsWatchStop(true);
}

/** Home banner: one tap on a running game of the group */
function liveNowHtml() {
  return liveNow.filter(function (g) { return !_liveEnded(g); }).map(function (g) {
    return '<div class="home-live-wrap"><button type="button" class="home-live" onclick="lsWatch(\'' + g.id + '\')">' + icon("scoreboard", 22) +
      '<span><b>' + t("lsLiveNow") + (g.test ? ' \u00B7 ' + t("lsTestBadge") : '') + '</b><small>' + g.sa + ' \u2013 ' + g.sb + ' \u00B7 ' + (g.a || []).concat(g.b || []).map(getUserName).join(", ") + '</small></span><i>' + t("lsWatch") + '</i></button></div>';
  }).join("");
}

function lsWatch(id) {
  var g = liveNow.filter(function (x) { return x.id === id; })[0];
  if (!g) return;
  _watch = g; live = null; liveMode = "watch";
  if (_watchUnsub) _watchUnsub();
  _watchUnsub = fsdb.collection("liveGames").doc(id).onSnapshot(function (doc) {
    if (!doc.exists) { showToast(t("lsEnded")); lsWatchStop(); return; }
    _watch = doc.data(); _watch.id = doc.id;
    if (liveMode === "watch") lsRender();
  }, function () { lsWatchStop(); });
  _lsShow();
}
function lsWatchStop(quiet) {
  if (_watchUnsub) { _watchUnsub(); _watchUnsub = null; }
  _watch = null;
  if (liveMode === "watch") { liveMode = "count"; if (!quiet) lsClose(); else { var el = document.getElementById("liveScreen"); if (el) { el.classList.remove("on"); el.innerHTML = ""; } document.body.classList.remove("live-on"); _lsWake(false); } }
}

function _lsWatchHtml() {
  var g = _watch;
  if (!g) return "";
  var th = LS_THEMES[g.theme >= 0 && g.theme < LS_THEMES.length ? g.theme : 0];
  var cap = maxPoints(), gp = lsGamePoint(g.sa, g.sb, cap);
  var bo = g.bo || 1, need = Math.ceil(bo / 2), sw = g.sw || { A: 0, B: 0 };
  var won = function (side) { return bo > 1 ? flipBoardHtml(side, sw, g.gl) : ''; };
  var half = function (side) {
    var score = side === "A" ? g.sa : g.sb, from = side === "A" ? th[1] : th[3], to = side === "A" ? th[2] : th[4];
    var ids = byNameAZ(side === "A" ? g.a : g.b);
    return '<div class="ls-half ls-watch" style="background:linear-gradient(160deg,' + from + ',' + to + ')">' +
      '<div class="ls-info"><div class="ls-serve-slot">' + (g.serve === side && !g.over ? icon("shuttle", 64, "ls-serve-big") : '') + '</div>' +
      '<div class="ls-team">' + t("lsTeam") + ' ' + side + '</div>' +
      '<div class="ls-chips">' + _lsTeam(side, ids) + '</div><div class="ls-score">' + score + '</div>' + won(side) + '</div></div>';
  };
  var html = half("A") + half("B");
  html += '<button type="button" class="ls-exit" onclick="lsWatchStop()">' + icon("back", 18) + ' ' + t("lsExit") + '</button>';
  html += '<div class="ls-mid"><span class="ls-pill">' + icon("scoreboard", 14) + ' ' + t("lsWatching") + (g.test ? ' \u00B7 ' + t("lsTestBadge") : '') + ' \u00B7 ' + t("lsGameN").replace("{n}", bo > 1 ? sw.A + sw.B + 1 : (g.saved || 0) + 1) + (bo > 1 ? ' \u00B7 ' + t("lsBestOf").replace("{n}", bo) : '') + '</span></div>';
  if (gp && !g.over) html += '<div class="ls-gp"><span>' + t("lsGamePoint") + ' \u00B7 ' + t("lsTeam") + ' ' + gp + '</span></div>';
  if (g.over) {
    var aft = { A: sw.A + (g.over === "A" ? 1 : 0), B: sw.B + (g.over === "B" ? 1 : 0) }, done = bo > 1 && aft[g.over] >= need;
    html += '<div class="ls-gp"><span>' + icon("medal", 14) + ' ' + (done ? t("lsMatchWins").replace("{team}", t("lsTeam") + " " + g.over).replace("{a}", aft.A).replace("{b}", aft.B) : t("lsWins").replace("{team}", t("lsTeam") + " " + g.over)) + '</span></div>';
  }
  return html;
}
