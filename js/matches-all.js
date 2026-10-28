/* ============================================================
   matches-all.js — v247: "All my matches" page (page id matches-all).
   Opened from the Rankings hero. A player picker (me by default), filters (period, result,
   type, partner, opponent), a summary, then the games grouped by day and by session.
   Built once per render from lastMatches (saved games + session tournament games).
   The pure helpers (maPeriodFrom, maGames, maFilter, maSummary, maGroup, maTimeRange) have no DOM,
   so tests/matches-all.test.js runs them straight.
   Rating change per game: computeStats() keeps it in each player's history (d + the match).
   ============================================================ */

var MA_DAYS_PAGE = 30;          // days drawn at first; "Show older" adds this many
var maUser = null;              // whose games (null = me)
var maPeriod = "30d";           // month | 30d | 1y | all
var maResult = "all";           // all | won | lost
var maType = "all";             // all | doubles | singles | tournament
var maPartner = "", maOpp = "";
var maDays = MA_DAYS_PAGE;
var maOpenDays = {};            // date -> true/false once the person folds or opens a day

/* ---------- Pure helpers ---------- */

/** First ISO date of a period chip ("" = from the beginning) */
function maPeriodFrom(period) {
  if (period === "month") return _todayIso().slice(0, 7) + "-01";
  if (period === "30d") {
    var d = new Date(_todayIso() + "T00:00:00");
    d.setDate(d.getDate() - 29);   // today and the 29 days before it
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  if (period === "1y") return scopeFrom("1y");
  return "";
}

/** Every decided game of uid, oldest first: { m, won, pts, mine, them, d (rating change or null), sid, tid } */
function maGames(uid) {
  var games = _myGames(uid), p = computeStats().players[uid], hist = p && p.history ? p.history : [];
  // history has one entry per decided game, in the same order as _myGames: match them up (and check it is the same game)
  return games.map(function (g, i) {
    var h = hist[i];
    return { m: g.m, won: g.won, pts: g.pts, mine: g.mine, them: g.them, d: h && h.mm === g.m ? h.d : null, sid: g.m.sessionId || "", tid: g.m.tid || "" };
  });
}

/** f = { from, result: all|won|lost, type: all|doubles|singles|tournament, partner: uid|"", opp: uid|"" } */
function maFilter(games, f) {
  return games.filter(function (g) {
    if (f.from && (g.m.date || "") < f.from) return false;
    if (f.result === "won" && !g.won) return false;
    if (f.result === "lost" && g.won) return false;
    if (f.type === "doubles" && g.mine.length !== 2) return false;
    if (f.type === "singles" && g.mine.length !== 1) return false;
    if (f.type === "tournament" && !g.tid) return false;
    if (f.partner && g.mine.indexOf(f.partner) < 0) return false;
    if (f.opp && g.them.indexOf(f.opp) < 0) return false;
    return true;
  });
}

/** { n, w, l, pct (text), delta (rounded sum of the games' rating changes) } */
function maSummary(list) {
  var w = 0, d = 0;
  list.forEach(function (g) { if (g.won) w++; d += g.d || 0; });
  return { n: list.length, w: w, l: list.length - w, pct: pct(w, list.length), delta: Math.round(d) };
}

/** "19:00–21:00" from a session's start time and duration (hours); just the start when there is no duration; "" without a time */
function maTimeRange(s) {
  if (!s || !s.time) return "";
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(s.time));
  if (!m || !s.duration) return String(s.time);
  var mins = (+m[1] * 60 + +m[2] + Math.round(s.duration * 60)) % 1440;
  return s.time + "–" + ("0" + Math.floor(mins / 60)).slice(-2) + ":" + ("0" + (mins % 60)).slice(-2);
}

/** Days newest first. Inside a day, sessions by start time, then "other" (games with no session); games keep their order.
    One pass over the games: { date, games, w, l, delta, sessions: [{ sid, s, tour, games, w, l, delta }], other: {games,w,l,delta}|null } */
function maGroup(list, sessions) {
  var byS = {}, days = {}, order = [];
  (sessions || []).forEach(function (s) { byS[s.id] = s; });
  var bump = function (o, g) { o.games.push(g); if (g.won) o.w++; else o.l++; o.delta += g.d || 0; };
  list.forEach(function (g) {
    var date = g.m.date || "", day = days[date];
    if (!day) { day = days[date] = { date: date, games: [], w: 0, l: 0, delta: 0, sessions: [], sIdx: {}, other: null }; order.push(date); }
    bump(day, g);
    if (g.sid && byS[g.sid]) {
      var so = day.sIdx[g.sid];
      if (!so) { so = day.sIdx[g.sid] = { sid: g.sid, s: byS[g.sid], tour: false, games: [], w: 0, l: 0, delta: 0 }; day.sessions.push(so); }
      if (g.tid) so.tour = true;
      bump(so, g);
    } else {
      if (!day.other) day.other = { games: [], w: 0, l: 0, delta: 0 };
      bump(day.other, g);
    }
  });
  return order.sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; }).map(function (date) {
    var d = days[date];
    delete d.sIdx;
    d.sessions.sort(function (a, b) { return String(a.s.time || "99:99").localeCompare(String(b.s.time || "99:99")); });
    return d;
  });
}

/* ---------- Page ---------- */

function openMatchesAll(uid) {
  maUser = uid || null; maResult = "all"; maType = "all"; maPartner = ""; maOpp = ""; maDays = MA_DAYS_PAGE; maOpenDays = {};
  showPage("matches-all");
}

function loadMatchesAll() {
  setBreadcrumb([{ label: t("navRankings"), action: "showPage('stats')" }, { label: t("maCrumb") }]);
  loadMatches();
  renderMatchesAll();
}

/** Change one filter / the player; every change starts from the newest days again */
function maSet(key, val) {
  if (key === "user") { maUser = val === (currentUser && currentUser.uid) ? null : val; maPartner = ""; maOpp = ""; }
  else if (key === "period") maPeriod = val;
  else if (key === "result") maResult = val;
  else if (key === "type") maType = val;
  else if (key === "partner") maPartner = val;
  else if (key === "opp") maOpp = val;
  maDays = MA_DAYS_PAGE; maOpenDays = {};
  renderMatchesAll();
}
function maMore() { maDays += MA_DAYS_PAGE; renderMatchesAll(); }
function maClear() { maResult = "all"; maType = "all"; maPartner = ""; maOpp = ""; maPeriod = "all"; maDays = MA_DAYS_PAGE; maOpenDays = {}; renderMatchesAll(); }
function maToggleDay(date, open) { maOpenDays[date] = !!open; }

function _maDeltaHtml(d) {
  var r = Math.round(d);
  return '<span class="' + (r > 0 ? 'up' : r < 0 ? 'down' : '') + '">' + (r > 0 ? '+' + r : r < 0 ? '−' + Math.abs(r) : '0') + '</span>';
}

function _maDayLabel(date) {
  var d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return escapeHtml(date);
  return escapeHtml(weekdayShort(d.getDay()) + " " + d.getDate() + " " + monthShort(d.getMonth()));
}

/** Score of every set from the viewer's side: "21–15, 18–21" (kept for the tap detail) */
function maScoreText(g) {
  return maSets(g).map(function (x) { return x.me + "–" + x.them; }).join(", ");
}

/** Sets with a score, from the viewer's side: [{ me, them }] */
function maSets(g) {
  var mineA = g.m.teamA.indexOf(g.mine[0]) >= 0;
  return (g.m.games || []).filter(function (x) { return x && (x.a != null || x.b != null); }).map(function (x) {
    return { me: mineA ? x.a : x.b, them: mineA ? x.b : x.a };
  });
}

/** "1 game" / "5 games" (Lao has no plural: same word both ways) */
function maGamesN(n) { return n === 1 ? t("oneGame") : n + " " + t("gamesWord"); }

/** One side's avatars, overlapped, then the names */
function _maTeamHtml(uids, cls, firstUid) {
  var names = uids.map(function (u) { return u === firstUid ? '<b>' + escapeHtml(getUserName(u)) + '</b>' : escapeHtml(getUserName(u)); }).join(' + ');
  return '<span class="ma-team ' + cls + '"><span class="ma-avs">' + uids.map(function (u) { return avatarHtml(u, 26); }).join('') + '</span><span class="ma-nm">' + names + '</span></span>';
}

/** Points per set, my side on top: the set's winner in a green pill, the loser grey; a draw leaves both plain */
function _maScoreHtml(g) {
  var sets = maSets(g);
  if (!sets.length) return '';
  var pill = function (v, o) { return '<span class="ma-pt' + (v > o ? ' won' : v < o ? ' lost' : '') + '">' + v + '</span>'; };
  return '<span class="ma-sc' + (sets.length > 1 ? ' multi' : '') + '" style="--sets:' + sets.length + '">' +
    sets.map(function (x) { return pill(x.me, x.them); }).join('') + sets.map(function (x) { return pill(x.them, x.me); }).join('') + '</span>';
}

function _maGameHtml(g, uid, sessionOpen) {
  var partner = g.mine.filter(function (u) { return u !== uid; });
  var inner = '<span class="ma-bar" aria-hidden="true"></span><span class="ma-who">' + _maTeamHtml([uid].concat(partner), 'me', uid) +
    _maTeamHtml(byNameAZ(g.them), 'them', '') + '</span>' + _maScoreHtml(g);
  var cls = 'ma-game ' + (g.won ? 'w' : 'l');
  // Tap: the session's Games tab (where a game is edited). A game with no session opens a small detail instead.
  if (sessionOpen) return '<button type="button" class="' + cls + '" onclick="showSessionDetail(\'' + jsq(g.sid) + '\',\'games\')">' + inner + '</button>';
  var sets = maScoreText(g);
  return '<div class="ma-gw"><button type="button" class="' + cls + '" aria-expanded="false" onclick="maToggleGame(this)">' + inner + '</button>' +
    '<div class="ma-det" hidden><span>' + (g.won ? t("wonWord") : t("lostWord")) + (sets ? ' · ' + escapeHtml(sets) : '') + '</span>' +
    (g.d === null ? '' : '<span>' + t("ratingWord") + ' ' + _maDeltaHtml(g.d) + '</span>') + '</div></div>';
}

/** Open / close the detail under a game that has no session */
function maToggleGame(btn) {
  var det = btn.parentNode && btn.parentNode.querySelector(".ma-det");
  if (!det) return;
  var open = det.hidden;
  det.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function _maBlockHtml(title, tag, o, games, uid, canOpen) {
  return '<div class="ma-ses"><div class="ma-sh"><span class="ma-st">' + title + '</span>' + (tag ? '<span class="ma-tag">' + escapeHtml(t("tourBadge")) + '</span>' : '') +
    '<span class="ma-r">' + fmtWL(o.w, o.l) + '</span></div>' +
    games.map(function (g) { return _maGameHtml(g, uid, canOpen); }).join('') + '</div>';
}

function _maDayHtml(day, uid, open) {
  var html = '<details class="ma-day"' + (open ? ' open' : '') + ' ontoggle="maToggleDay(\'' + jsq(day.date) + '\',this.open)"><summary><b>' + _maDayLabel(day.date) + '</b>' +
    '<span>' + maGamesN(day.games.length) + ' · ' + fmtWL(day.w, day.l) + ' · ' + _maDeltaHtml(day.delta) + '</span></summary>';
  day.sessions.forEach(function (so) {
    var tm = maTimeRange(so.s);
    html += _maBlockHtml(icon("court", 13) + '<span class="ma-stt">' + escapeHtml(so.s.courtName || "") + (tm ? ' · ' + escapeHtml(tm) : '') + '</span>', so.tour, so, so.games, uid, true);
  });
  if (day.other) html += _maBlockHtml('<span class="ma-stt">' + escapeHtml(t("maOther")) + '</span>', false, day.other, day.other.games, uid, false);
  return html + '</details>';
}

/** Full-width segmented control, equal slots */
function _maChips(key, cur, opts) {
  return '<div class="ma-seg s' + opts.length + '" role="group">' + opts.map(function (o) {
    return '<button type="button" class="ma-segb' + (cur === o[0] ? ' on' : '') + '" aria-pressed="' + (cur === o[0]) + '" onclick="maSet(\'' + key + '\',\'' + o[0] + '\')">' + escapeHtml(o[1]) + '</button>';
  }).join('') + '</div>';
}

function _maSelect(key, label, cur, opts, caption, lead) {
  var sel = '<select class="form-select" aria-label="' + escapeHtml(label) + '" onchange="maSet(\'' + key + '\',this.value)">' + opts.map(function (o) {
    return '<option value="' + escapeHtml(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + escapeHtml(o[1]) + '</option>';
  }).join('') + '</select>';
  if (lead) return '<div class="ma-pick"><span class="ma-pick-av" aria-hidden="true">' + lead + '</span>' + sel + '</div>';
  return caption ? '<label class="ma-sel"><small>' + escapeHtml(caption) + '</small>' + sel + '</label>' : sel;
}

function renderMatchesAll() {
  var box = document.getElementById("matchesAllContent");
  if (!box || !currentUser) return;
  var me = currentUser.uid, uid = maUser || me, all = maGames(uid);
  // Picker: everyone who has played a game, me first (same as Head-to-head)
  var who = {};
  lastMatches.forEach(function (m) { (m.teamA || []).concat(m.teamB || []).forEach(function (u) { who[u] = true; }); });
  who[me] = who[uid] = true;
  var nm = function (u) { return plainUserName(findUser(u)); };
  var uids = Object.keys(who).sort(function (a, b) { return a === me ? -1 : b === me ? 1 : String(nm(a)).localeCompare(String(nm(b))); });
  var people = function (map, first) {
    var seen = {}, out = [];
    all.forEach(function (g) { g[map].forEach(function (u) { if (u !== uid && !seen[u]) { seen[u] = true; out.push(u); } }); });
    return [["", first]].concat(out.sort(function (a, b) { return String(nm(a)).localeCompare(String(nm(b))); }).map(function (u) { return [u, nm(u)]; }));
  };
  var html = '<div class="card ma-filters">' +
    _maSelect("user", t("maPlayer"), uid, uids.map(function (u) { return [u, nm(u) + (u === me ? ' (' + t("you") + ')' : '')]; }), "", avatarHtml(uid, 28)) +
    _maChips("period", maPeriod, [["month", t("thisMonth")], ["30d", t("maP30Short")], ["1y", t("period_1y")], ["all", t("allWord")]]) +
    _maChips("result", maResult, [["all", t("allWord")], ["won", t("wonWord")], ["lost", t("lostWord")]]) +
    '<div class="ma-sels">' +
    _maSelect("type", t("gameType"), maType, [["all", t("maTypeAll")], ["doubles", t("maTypeDoubles")], ["singles", t("gameType_singles")], ["tournament", t("tourBadge")]], t("maTypeCap")) +
    _maSelect("partner", t("maPartner"), maPartner, people("mine", t("maPartnerAll")), t("maPartner")) +
    _maSelect("opp", t("maOpp"), maOpp, people("them", t("maOppAll")), t("maOpp")) + '</div></div>';
  if (!all.length) {
    box.innerHTML = html + '<div class="empty-state"><div class="empty-icon">' + icon("ranking", 44) + '</div><div>' + t("noMatchesYet") + '</div></div>';
    return;
  }
  var list = maFilter(all, { from: maPeriodFrom(maPeriod), result: maResult, type: maType, partner: maPartner, opp: maOpp });
  if (!list.length) {
    box.innerHTML = html + '<div class="empty-state"><div class="empty-icon">' + icon("ranking", 44) + '</div><div>' + t("maNoMatch") + '</div>' +
      '<button type="button" class="btn-secondary" style="margin-top:10px" onclick="maClear()">' + t("maClear") + '</button></div>';
    return;
  }
  var sm = maSummary(list);
  html += '<div class="ma-sum" role="group" aria-label="' + escapeHtml(t("maSummary")) + '">' +
    '<div><b>' + sm.n + '</b><small>' + (sm.n === 1 ? t("maGameOne") : t("gamesWord")) + '</small></div><div><b>' + fmtWL(sm.w, sm.l) + '</b><small>' + t("winShort") + '–' + t("lossShort") + '</small></div>' +
    '<div><b>' + sm.pct + '</b><small>' + t("winRate") + '</small></div><div><b>' + _maDeltaHtml(sm.delta) + '</b><small>' + t("ratingWord") + '</small></div></div>';
  var days = maGroup(list, lastSessions), shown = days.slice(0, maDays);
  shown.forEach(function (day, i) { html += _maDayHtml(day, uid, maOpenDays[day.date] !== undefined ? maOpenDays[day.date] : i === 0); });
  if (days.length > shown.length) html += '<button type="button" class="rank-see" onclick="maMore()">' + t("maShowOlder").replace("{n}", days.length - shown.length) + '</button>';
  box.innerHTML = html;
}
