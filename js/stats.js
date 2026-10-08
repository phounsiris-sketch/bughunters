/* ============================================================
   stats.js — Matches, ratings and the Stats tab (group only).
   matches/{id} { groupId, sessionId, date, type md|wd|xd|singles,
                  teamA [uid], teamB [uid], games [{a, b}], minutes,
                  court, shuttles, mode fun|exercise|competition,
                  createdBy, createdAt, confirmed, confirmedBy, confirmedAt }
   A match counts once someone on the other team confirms it, or 24 h
   after it was recorded. Only confirmed Competition matches with a score
   change ratings; every match counts for matches / minutes played.
   Ratings are Elo-style (start 1500): beating stronger players earns more,
   a bigger point difference a little more. Pairs get their own rating.
   Nothing here is ever shown outside the group.
   ============================================================ */

var lastMatches = [];
var _matchesUnsub = null;
var statsTab = "ranking";     // ranking | h2h | progress
var statsPeriod = "month";    // month | all (for wins / losses shown)
var progressUser = null;
var h2hSides = null;          // { a: key, b: key }

var RATING_START = 1500;
var RATING_K = 32;
var RANK_MIN_MATCHES = 10;
var PAIR_MIN_MATCHES = 5;

/* ---------- Data ---------- */

function loadMatches() {
  if (_matchesUnsub || !GROUPS_ON || !currentGroupId) return;
  _matchesUnsub = groupScoped(fsdb.collection("matches")).onSnapshot(function (snap) {
    var list = [];
    snap.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
    lastMatches = list.sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")) || ((a.createdAt || 0) - (b.createdAt || 0)); });
    _statsCache = null;
    if (/^(stats|matches|dashboard|user)$/.test(currentPage)) refreshCurrentPage("matches");
    if (currentPage === "session-detail") { refreshSessionGames(); var tn = document.getElementById("sessionTabGamesN"); if (tn && currentSession) tn.textContent = sessionMatches(currentSession.id).length; }
    if (typeof updateNotifications === "function") updateNotifications();
  }, dbOnError);
}

function stopMatches() {
  if (_matchesUnsub) _matchesUnsub();
  _matchesUnsub = null;
  lastMatches = [];
  _statsCache = null;
}

/** Every saved game counts straight away (fix or delete a wrong one) */
function isMatchCounted(m) { return !!m; }

/** Games won by each team: { a, b, pts } (pts = team A points − team B points) */
function matchScore(m) {
  var r = { a: 0, b: 0, pts: 0, games: 0 };
  (m.games || []).forEach(function (g) {
    if (g == null || (g.a == null && g.b == null)) return;
    r.games++;
    r.pts += (g.a || 0) - (g.b || 0);
    if ((g.a || 0) > (g.b || 0)) r.a++; else if ((g.b || 0) > (g.a || 0)) r.b++;
  });
  return r;
}

function matchWinner(m) {
  var s = matchScore(m);
  return s.a > s.b ? "A" : s.b > s.a ? "B" : null;
}


function pairKey(team) { return team.slice().sort().join("+"); }
function pairName(key) { return key.split("+").map(function (u) { return getUserName(u); }).join(" &amp; "); }
function _monthKey(date) { return (date || "").slice(0, 7); }

/* ---------- Ratings & stats (memoised per data change) ---------- */
var _statsCache = null;

function computeStats() {
  if (_statsCache) return _statsCache;
  var players = {}, pairs = {}, h2h = [];
  var month = _todayIso().slice(0, 7);
  var P = function (u) {
    return players[u] || (players[u] = { uid: u, rating: RATING_START, comp: 0, played: 0, wins: 0, losses: 0, minutes: 0,
      ptsDiff: 0, games: 0, streak: 0, history: [], partners: {}, opponents: {}, monthStart: null,
      monthWins: 0, monthLosses: 0, monthPlayed: 0, monthMinutes: 0, byMonth: {} });
  };
  var PR = function (k) {
    return pairs[k] || (pairs[k] = { key: k, rating: RATING_START, comp: 0, wins: 0, losses: 0, monthStart: null, monthWins: 0, monthLosses: 0 });
  };
  lastMatches.forEach(function (m) {
    if (!isMatchCounted(m) || !m.teamA || !m.teamB) return;
    var all = m.teamA.concat(m.teamB);
    var mk = _monthKey(m.date);
    var inMonth = mk === month;
    all.forEach(function (u) {
      var p = P(u);
      p.played++;
      p.minutes += m.minutes || 0;
      var bm = p.byMonth[mk] || (p.byMonth[mk] = { played: 0, wins: 0, losses: 0, minutes: 0, rating: null });
      bm.played++;
      bm.minutes += m.minutes || 0;
      if (inMonth) { p.monthPlayed++; p.monthMinutes += m.minutes || 0; }
    });
    var w = matchWinner(m);
    if (m.mode && m.mode !== "competition") return;
    if (!w) return;
    var sc = matchScore(m);
    var A = m.teamA, B = m.teamB;
    var avg = function (t) { return t.reduce(function (s, u) { return s + P(u).rating; }, 0) / t.length; };
    var ea = 1 / (1 + Math.pow(10, (avg(B) - avg(A)) / 400));
    var sa = w === "A" ? 1 : 0;
    var margin = 1 + Math.min(Math.abs(sc.pts) / Math.max(1, sc.games), 15) / 30;
    var delta = RATING_K * margin * (sa - ea);
    var apply = function (team, d, won, ptsForTeam, other) {
      team.forEach(function (u) {
        var p = P(u);
        if (inMonth && p.monthStart === null) p.monthStart = p.rating;
        p.rating += d;
        p.comp++;
        p.games += sc.games;
        p.ptsDiff += ptsForTeam;
        if (won) { p.wins++; p.streak = p.streak >= 0 ? p.streak + 1 : 1; } else { p.losses++; p.streak = p.streak <= 0 ? p.streak - 1 : -1; }
        p.maxStreak = Math.max(p.maxStreak || 0, p.streak);
        if (inMonth) { if (won) p.monthWins++; else p.monthLosses++; }
        var bm = p.byMonth[mk];
        if (won) bm.wins++; else bm.losses++;
        bm.rating = p.rating;
        p.history.push({ at: m.date, r: p.rating });
        team.forEach(function (v) { if (v !== u) { var x = p.partners[v] || (p.partners[v] = { n: 0, w: 0 }); x.n++; if (won) x.w++; } });
        other.forEach(function (v) { var x = p.opponents[v] || (p.opponents[v] = { n: 0, w: 0 }); x.n++; if (won) x.w++; });
      });
    };
    apply(A, delta, sa === 1, sc.pts, B);
    apply(B, -delta, sa === 0, -sc.pts, A);
    if (A.length === 2 && B.length === 2) {
      var ka = pairKey(A), kb = pairKey(B), pa = PR(ka), pb = PR(kb);
      var ep = 1 / (1 + Math.pow(10, (pb.rating - pa.rating) / 400));
      var dp = RATING_K * margin * (sa - ep);
      [[pa, dp, sa === 1], [pb, -dp, sa === 0]].forEach(function (x) {
        var pr = x[0];
        if (inMonth && pr.monthStart === null) pr.monthStart = pr.rating;
        pr.rating += x[1];
        pr.comp++;
        if (x[2]) pr.wins++; else pr.losses++;
        if (inMonth) { if (x[2]) pr.monthWins++; else pr.monthLosses++; }
      });
    }
    h2h.push({ m: m, w: w, pts: sc.pts });
  });
  // The individual ranking: everyone with a game, settled players first
  // (fewer than RANK_MIN_MATCHES games = provisional, shown after them)
  var ranked = Object.keys(players).map(function (u) { return players[u]; })
    .filter(function (p) { return p.comp > 0; })
    .sort(function (a, b) { return ((b.comp >= RANK_MIN_MATCHES) - (a.comp >= RANK_MIN_MATCHES)) || (b.rating - a.rating); });
  _statsCache = { players: players, pairs: pairs, h2h: h2h, ranked: ranked, month: month };
  return _statsCache;
}

/** A player's level (BG…B&A): set by a group admin, else their own choice; "" if none */
function playerLevel(uid) {
  var m = typeof memberOf === "function" ? memberOf(uid) : null;
  var u = findUser(uid) || {};
  return normLevel(m && m.level) || normLevel(u.selfLevel || (u.about || {}).selfLevel) || "";
}

function ratingOf(uid) {
  var p = computeStats().players[uid];
  return p ? Math.round(p.rating) : RATING_START;
}

/* ---------- Stats page ---------- */

function loadStats() {
  setBreadcrumb(null);
  loadMatches();
  renderStats();
}

function setStatsTab(tab) { statsTab = tab; renderStats(); }
function setStatsPeriod(p) { statsPeriod = p; renderStats(); }

function renderStats() {
  var box = document.getElementById("statsContent");
  if (!box) return;
  var tabs = '<div class="dash-tabs">' + [["ranking", "statsRanking"], ["h2h", "headToHead"], ["progress", "progress"]].map(function (x) {
    return '<button class="dash-tab' + (statsTab === x[0] ? ' active' : '') + '" onclick="setStatsTab(\'' + x[0] + '\')">' + t(x[1]) + '</button>';
  }).join('') + '</div>';
  var note = '<div class="private-note">' + icon("lock", 12) + ' ' + t("statsPrivate").replace("{group}", escapeHtml(currentGroup ? currentGroup.name : "")) + '</div>';
  var body = statsTab === "h2h" ? _renderH2H() : statsTab === "progress" ? _renderProgress() : _renderRanking();
  box.innerHTML = tabs + note + body;
}

function _trend(now, start) {
  if (start === null || start === undefined) return '';
  var d = Math.round(now - start);
  if (!d) return '<span class="trend">\u2013</span>';
  return '<span class="trend ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(d) + '</span>';
}

/** "3/10 games" while a rating is still settling */
function _provTag(n, min) { return n < min ? ' <span class="tag prov-tag" title="' + escapeHtml(t("provisionalHint")) + '">' + t("provisionalN").replace("{n}", n).replace("{min}", min) + '</span>' : ''; }

function _wl(w, l) { return w + t("winShort") + ' \u2013 ' + l + t("lossShort"); }

function _myStatsCard() {
  var me = currentUser.uid, st = computeStats(), p = st.players[me];
  var lvl = playerLevel(me);
  var html = '<div class="card my-stats" onclick="progressUser=currentUser.uid;setStatsTab(\'progress\')">';
  html += '<div class="my-stats-head">' + (lvl ? levelBadgeHtml(lvl) : '<span class="level-badge lv-none" onclick="event.stopPropagation();showLevelGuide()">?</span>') + '<div><div class="my-stats-title">' + t("myLevel") + '</div>' +
    '<div class="my-stats-rating">' + (p && p.comp ? Math.round(p.rating) + ' ' + _trend(p.rating, p.monthStart) + _provTag(p.comp, RANK_MIN_MATCHES) : t("notRankedYet").replace("{n}", 0).replace("{min}", RANK_MIN_MATCHES)) + '</div></div></div>';
  if (p) {
    var wr = p.wins + p.losses ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0;
    var best = _bestPartner(p);
    html += '<div class="my-stats-facts"><span><b>' + wr + '%</b> ' + t("winRate") + '</span><span><b>' + p.monthPlayed + '</b> ' + t("matchesThisMonth") + '</span>' +
      (best ? '<span>' + t("bestPartner") + ' <b>' + getUserName(best) + '</b></span>' : '') + '</div>';
  }
  return html + '</div>';
}

function _bestPartner(p) {
  var best = null, bestRate = -1;
  Object.keys(p.partners).forEach(function (u) {
    var x = p.partners[u];
    if (x.n < 3) return;
    var r = x.w / x.n;
    if (r > bestRate) { bestRate = r; best = u; }
  });
  return best;
}

function _renderRanking() {
  var st = computeStats();
  var month = statsPeriod === "month";
  var html = _myStatsCard() + badgesHtml(currentUser.uid, true);
  html += '<div class="period-toggle">' + [["month", "thisMonth"], ["all", "allTime"]].map(function (x) {
    return '<button class="period-btn' + (statsPeriod === x[0] ? ' active' : '') + '" onclick="setStatsPeriod(\'' + x[0] + '\')">' + t(x[1]) + '</button>';
  }).join('') + '</div>';

  // 1. Pair rank (men's doubles is how most of us play)
  var pairs = Object.keys(st.pairs).map(function (k) { return st.pairs[k]; })
    .filter(function (p) { return p.comp > 0 && (!month || p.monthWins + p.monthLosses > 0); })
    .sort(function (a, b) { return ((b.comp >= PAIR_MIN_MATCHES) - (a.comp >= PAIR_MIN_MATCHES)) || (b.rating - a.rating); });
  html += '<div class="settings-section">1. ' + t("pairRank") + '</div><div class="card rank-list">';
  if (!pairs.length) html += '<div class="empty-state" style="padding:12px">' + t("noPairsYet").replace("{n}", PAIR_MIN_MATCHES) + '</div>';
  pairs.forEach(function (p, i) {
    var us = p.key.split("+");
    html += '<div class="rank-row' + (us.indexOf(currentUser.uid) >= 0 ? ' me' : '') + '" onclick="h2hSides={a:\'' + p.key + '\',b:null};setStatsTab(\'h2h\')">' +
      '<span class="rank-no">' + (i + 1) + '</span><span class="rank-avatars">' + avatarHtml(us[0], 30) + avatarHtml(us[1], 30) + '</span>' +
      '<span class="rank-text"><b>' + pairName(p.key) + _provTag(p.comp, PAIR_MIN_MATCHES) + '</b><small>' + Math.round(p.rating) + ' \u00B7 ' +
      (month ? _wl(p.monthWins, p.monthLosses) : _wl(p.wins, p.losses)) + '</small></span>' + _trend(p.rating, p.monthStart) + '</div>';
  });
  html += '</div>';

  // 2. Player rank
  var ranked = st.ranked.filter(function (p) { return !month || p.monthWins + p.monthLosses > 0; });
  html += '<div class="settings-section">2. ' + t("playerRank") + '</div><div class="card rank-list">';
  if (!ranked.length) html += '<div class="empty-state" style="padding:12px">' + t("noRankYet").replace("{n}", RANK_MIN_MATCHES) + '</div>';
  ranked.forEach(function (p, i) {
    var w = month ? p.monthWins : p.wins, l = month ? p.monthLosses : p.losses;
    var wr = w + l ? Math.round(w / (w + l) * 100) : 0;
    html += '<div class="rank-row' + (p.uid === currentUser.uid ? ' me' : '') + '" onclick="progressUser=\'' + p.uid + '\';setStatsTab(\'progress\')">' +
      '<span class="rank-no">' + (i + 1) + '</span>' + avatarHtml(p.uid, 32) +
      '<span class="rank-text"><b>' + getUserName(p.uid) + ' ' + levelBadgeHtml(playerLevel(p.uid), true) + _provTag(p.comp, RANK_MIN_MATCHES) + '</b>' +
      '<small>' + Math.round(p.rating) + ' \u00B7 ' + wr + '% \u00B7 ' + _wl(w, l) + '</small></span>' + _trend(p.rating, p.monthStart) + '</div>';
  });
  html += '</div>';
  return html;
}

/* ---------- Head-to-head ---------- */

function _sides() {
  // Pairs that played, then single players
  var st = computeStats();
  var pairKeys = Object.keys(st.pairs).sort(function (a, b) { return st.pairs[b].comp - st.pairs[a].comp; });
  var players = Object.keys(st.players).filter(function (u) { return st.players[u].comp > 0; });
  return pairKeys.concat(players);
}

function _sideMembers(key) { return key ? key.split("+") : []; }

function _renderH2H() {
  var st = computeStats();
  var sides = _sides();
  if (!sides.length) return '<div class="empty-state"><div class="empty-icon">' + icon("ranking", 44) + '</div><div>' + t("noMatchesYet") + '</div></div>';
  if (!h2hSides) h2hSides = { a: null, b: null };
  var me = currentUser.uid;
  if (!h2hSides.a) h2hSides.a = sides.filter(function (k) { return _sideMembers(k).indexOf(me) >= 0; })[0] || sides[0];
  // Default opponent: the side the first side met most
  if (!h2hSides.b) {
    var cnt = {};
    st.h2h.forEach(function (x) {
      var A = x.m.teamA, B = x.m.teamB;
      [[A, B], [B, A]].forEach(function (pq) {
        if (_isSide(h2hSides.a, pq[0])) { var k = _sideMembers(h2hSides.a).length === 2 ? pairKey(pq[1]) : (pq[1].length === 1 ? pq[1][0] : null); if (k) cnt[k] = (cnt[k] || 0) + 1; }
      });
    });
    h2hSides.b = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || sides.filter(function (k) { return k !== h2hSides.a; })[0] || null;
  }
  var opt = function (sel, which) {
    return '<select class="form-select" onchange="h2hSides.' + which + '=this.value;renderStats()">' + sides.map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + (k.indexOf("+") > 0 ? pairName(k).replace(/&amp;/g, "&") : plainUserName(findUser(k))) + '</option>';
    }).join('') + '</select>';
  };
  var html = '<div class="card"><div class="form-row">' + opt(h2hSides.a, "a") + '<span class="vs">vs</span>' + opt(h2hSides.b, "b") + '</div></div>';
  var r = headToHead(h2hSides.a, h2hSides.b);
  html += '<div class="card h2h-card"><div class="h2h-names"><span>' + _sideLabel(h2hSides.a) + '</span><span>' + _sideLabel(h2hSides.b) + '</span></div>' +
    '<div class="h2h-score">' + r.a + ' \u2013 ' + r.b + '</div>' +
    '<div class="h2h-facts">' + (r.n ? (r.pts >= 0 ? '+' : '') + r.pts + ' ' + t("ptsShort") + ' \u00B7 ' + t("lastN").replace("{n}", r.last.length) + ' ' +
      r.last.map(function (x) { return '<span class="wl ' + (x ? 'w' : 'l') + '">' + (x ? t("winShort") : t("lossShort")) + '</span>'; }).join('') : t("neverMet")) + '</div>' +
    (r.n ? '<button class="btn-secondary" style="margin-top:12px" onclick="showCreatePoll()">' + t("rematch") + '</button>' : '') + '</div>';
  return html;
}

function _sideLabel(k) {
  var us = _sideMembers(k);
  return us.map(function (u) { return avatarHtml(u, 34); }).join('') + '<b>' + (us.length === 2 ? pairName(k) : getUserName(us[0])) + '</b>';
}

function _isSide(key, team) {
  var us = _sideMembers(key);
  if (us.length === 2) return team.length === 2 && pairKey(team) === key;
  return team.indexOf(us[0]) >= 0;
}

/** Results between side a and side b (pair keys "u1+u2" or single uids) */
function headToHead(a, b) {
  var r = { a: 0, b: 0, pts: 0, n: 0, last: [] };
  if (!a || !b) return r;
  computeStats().h2h.forEach(function (x) {
    var m = x.m, aIsA = _isSide(a, m.teamA) && _isSide(b, m.teamB), aIsB = _isSide(a, m.teamB) && _isSide(b, m.teamA);
    if (!aIsA && !aIsB) return;
    var aWon = (x.w === "A") === aIsA;
    r.n++;
    if (aWon) r.a++; else r.b++;
    r.pts += aIsA ? x.pts : -x.pts;
    r.last.push(aWon);
  });
  r.last = r.last.slice(-5);
  return r;
}

/* ---------- Progress by month ---------- */

function _renderProgress() {
  var st = computeStats();
  var uid = progressUser || currentUser.uid;
  var uids = Object.keys(st.players);
  if (uids.indexOf(uid) < 0) uids.unshift(uid);
  var html = '<div class="card"><select class="form-select" onchange="progressUser=this.value;renderStats()">' + uids.map(function (u) {
    return '<option value="' + u + '"' + (u === uid ? ' selected' : '') + '>' + escapeHtml(plainUserName(findUser(u))) + '</option>';
  }).join('') + '</select></div>';
  var p = st.players[uid];
  if (!p) return html + '<div class="empty-state"><div class="empty-icon">' + icon("chart", 44) + '</div><div>' + t("noMatchesYet") + '</div></div>';
  var months = Object.keys(p.byMonth).sort().slice(-6);
  var last = RATING_START;
  // rating at the end of each month (carry over months without competition)
  var rows = months.map(function (mk) { var bm = p.byMonth[mk]; if (bm.rating !== null) last = bm.rating; return { mk: mk, bm: bm, r: last }; });
  html += '<div class="card"><div class="card-title">' + icon("chart", 14) + ' ' + t("ratingByMonth") + '</div>' + _sparkline(rows.map(function (x) { return x.r; })) + '</div>';
  html += '<div class="card rank-list">';
  var prev = null;
  rows.forEach(function (x) {
    var wr = x.bm.wins + x.bm.losses ? Math.round(x.bm.wins / (x.bm.wins + x.bm.losses) * 100) + '%' : '\u2013';
    var parts = x.mk.split("-");
    html += '<div class="rank-row"><span class="rank-text"><b>' + monthYear(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1) + '</b>' +
      '<small>' + x.bm.played + ' ' + t("matchesWord") + ' \u00B7 ' + x.bm.minutes + ' ' + t("minShort") + ' \u00B7 ' + t("winRate") + ' ' + wr + '</small></span>' +
      '<span class="rank-rating">' + Math.round(x.r) + ' ' + (prev !== null ? _trend(x.r, prev) : '') + '</span></div>';
    prev = x.r;
  });
  html += '</div>';
  var best = _bestPartner(p);
  html += '<div class="card"><div class="my-stats-facts">' +
    '<span><b>' + p.played + '</b> ' + t("matchesWord") + '</span><span><b>' + p.minutes + '</b> ' + t("minShort") + '</span>' +
    '<span><b>' + (p.games ? (p.ptsDiff / p.games >= 0 ? '+' : '') + (p.ptsDiff / p.games).toFixed(1) : '0') + '</b> ' + t("ptsPerGame") + '</span>' +
    '<span>' + t("streak") + ' <b>' + (p.streak > 0 ? p.streak + t("winShort") : p.streak < 0 ? (-p.streak) + t("lossShort") : '\u2013') + '</b></span>' +
    (best ? '<span>' + t("bestPartner") + ' <b>' + getUserName(best) + '</b></span>' : '') + '</div></div>';
  return html;
}

/** Small line chart (SVG) of numbers */
function _sparkline(vals) {
  if (vals.length < 2) return '<div class="form-hint">' + t("needMoreMonths") + '</div>';
  var w = 300, h = 70, lo = Math.min.apply(null, vals) - 10, hi = Math.max.apply(null, vals) + 10;
  var pts = vals.map(function (v, i) { return (i * w / (vals.length - 1)).toFixed(1) + "," + (h - (v - lo) / (hi - lo) * h).toFixed(1); });
  return '<svg class="sparkline" viewBox="-6 -6 ' + (w + 12) + ' ' + (h + 12) + '" preserveAspectRatio="none"><polyline points="' + pts.join(" ") + '"/>' +
    pts.map(function (p) { var xy = p.split(","); return '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3"/>'; }).join('') + '</svg>';
}

/* ---------- Games of a session (the session's "Games" tab) ----------
   One record = one game. Teams are picked by hand; scores are typed.
   Every player of the session (and group admins) can add games; a game
   counts in Stats as soon as it is saved. */

var gameForm = null;   // { sessionId, id (when editing), type, teamA, teamB, a, b, minutes }

function sessionMatches(sid) { return lastMatches.filter(function (m) { return m.sessionId === sid; }); }

/** Old links to the Matches page open the session's Games tab */
function showSessionMatches(sessionId) {
  sessionTab = "games";
  if (currentSession && currentSession.id === sessionId && currentPage === "session-detail") { renderSessionGamesTab(); return; }
  showSessionDetail(sessionId, "games");
}
function loadMatchesPage() { if (currentSessionId) showSessionMatches(currentSessionId); else showPage("sessions"); }
function loadMatchRecord() { loadMatchesPage(); }
function renderMatchesPage() {}

/** Highest score allowed (the group's rule; 31 unless the group picked 30) */
function maxPoints() { var m = currentGroup && Number(currentGroup.maxPoints); return m === 30 ? 30 : 31; }

/** Why a game score is not valid (null = valid). a, b are numbers. */
function scoreProblem(a, b) {
  var cap = maxPoints(), hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi < 21) return t("scoreNeeds21");
  if (hi > cap) return t("scoreMaxCap").replace("{cap}", cap);
  if (hi === 21 && lo <= 19) return null;
  if (hi === cap && lo === cap - 1) return null;
  if (lo >= 20 && hi - lo === 2) return null;
  if (lo < 20) return t("scoreOver21").replace("{lo}", lo);
  return t("scoreLead2").replace("{w}", Math.min(lo + 2, cap)).replace("{l}", lo);
}
function validGame(a, b) { return scoreProblem(a, b) === null; }

function _canAddGames(s) { return !!s && ((s.players || []).indexOf(currentUser.uid) >= 0 || isGroupAdminMe()); }

function _blankGameForm(s) {
  var type = s.gameType && s.gameType !== "any" ? s.gameType : "md";
  return { sessionId: s.id, id: null, type: type, teamA: [], teamB: [], a: "", b: "", minutes: "" };
}

function _teamName(team, side) {
  return team.length ? team.map(function (u) { return escapeHtml(getUserName(u)); }).join(" &amp; ") : t("team") + " " + side;
}

/** The whole Games tab: add-game form + the list */
function sessionGamesTabHtml(s) {
  if (!gameForm || gameForm.sessionId !== s.id) gameForm = _blankGameForm(s);
  var mode = s.mode || "competition";
  var html = '<div class="games-mode"><span class="tag mode-' + mode + '">' + t("mode_" + mode) + '</span><span class="form-hint">' + t("modeHint_" + mode) + '</span></div>';
  if (_canAddGames(s)) html += '<div id="gameFormBox">' + _gameFormHtml(s) + '</div>';
  html += '<div id="sgList">' + _gamesListHtml(s) + '</div>';
  return html;
}

function _gameFormHtml(s) {
  var f = gameForm, size = f.type === "singles" ? 1 : 2;
  var n = sessionMatches(s.id).length;
  var html = '<div class="card game-form"><div class="card-title">' + icon("ranking", 14) + ' ' +
    (f.id ? t("editGame") : t("gameN").replace("{n}", n + 1)) + '</div>';
  html += '<div class="seg seg-wrap" style="margin-bottom:12px">' + ["md", "wd", "xd", "singles"].map(function (x) {
    return '<button type="button" class="seg-btn' + (f.type === x ? ' active' : '') + '" onclick="gameFormType(\'' + x + '\')">' + t("gameType_" + x) + '</button>';
  }).join('') + '</div>';
  ["A", "B"].forEach(function (side) {
    var team = f["team" + side], other = f["team" + (side === "A" ? "B" : "A")];
    html += '<div class="form-group"><label class="form-label">' + t("team") + ' ' + side + ' <small>(' + team.length + '/' + size + ')</small></label><div class="chips">' +
      (s.players || []).map(function (u) {
        var on = team.indexOf(u) >= 0, taken = other.indexOf(u) >= 0;
        return '<div class="chip avatar-chip' + (on ? ' active' : '') + (taken ? ' disabled' : '') + '"' + (taken ? '' : ' onclick="gameFormPick(\'' + side + '\',\'' + u + '\')"') + '>' + avatarHtml(u, 20) + escapeHtml(getUserName(u)) + '</div>';
      }).join('') + '</div></div>';
  });
  // Score: names above each box, − / + beside it, typed directly
  html += '<div class="score-entry">' + ["a", "b"].map(function (k) {
    return '<div class="score-side"><div class="score-names" id="gfName_' + k + '">' + _teamName(k === "a" ? f.teamA : f.teamB, k.toUpperCase()) + '</div>' +
      '<div class="score-box"><button type="button" aria-label="−1" onclick="gameFormStep(\'' + k + '\',-1)">−</button>' +
      '<input id="gfScore_' + k + '" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" placeholder="–" value="' + escapeHtml(String(f[k])) + '" oninput="gameFormScore(\'' + k + '\',this.value)">' +
      '<button type="button" aria-label="+1" onclick="gameFormStep(\'' + k + '\',1)">+</button></div></div>';
  }).join('<div class="score-vs">–</div>') + '</div>';
  html += '<div class="score-msg" id="gfMsg">' + _gameFormMsg() + '</div>';
  html += '<div class="form-group"><label class="form-label">' + t("timePlayed") + '</label>' +
    '<input type="text" inputmode="numeric" maxlength="3" class="form-input" placeholder="' + t("minutesExample") + '" value="' + escapeHtml(String(f.minutes || "")) + '" oninput="gameForm.minutes=this.value.replace(/\\D/g,\'\')"></div>';
  html += '<button class="btn-primary" onclick="saveGame()">' + t(f.id ? "save" : "saveGame") + '</button>';
  if (f.id) html += '<button class="btn-secondary" style="margin-top:8px" onclick="cancelGameEdit()">' + t("cancel") + '</button>';
  return html + '</div>';
}

/** The line under the score: what's wrong, or who wins */
function _gameFormMsg() {
  var f = gameForm;
  if (f.a === "" || f.b === "") return '<span class="form-hint">' + t("scoreTypeBoth").replace("{cap}", maxPoints()) + '</span>';
  var a = Number(f.a), b = Number(f.b), p = scoreProblem(a, b);
  if (p) return '<span class="score-bad">' + icon("warning", 13) + ' ' + p + '</span>';
  var team = a > b ? _teamName(f.teamA, "A") : _teamName(f.teamB, "B");
  return '<span class="score-ok">' + icon("check", 13) + ' ' + t("teamWinsScore").replace("{team}", team).replace("{score}", Math.max(a, b) + "–" + Math.min(a, b)) + '</span>';
}

function _rerenderGameForm() {
  var box = document.getElementById("gameFormBox");
  if (box && currentSession) box.innerHTML = _gameFormHtml(currentSession);
}

function gameFormType(x) {
  var size = x === "singles" ? 1 : 2;
  gameForm.type = x;
  gameForm.teamA = gameForm.teamA.slice(0, size);
  gameForm.teamB = gameForm.teamB.slice(0, size);
  _rerenderGameForm();
}

function gameFormPick(side, uid) {
  var team = gameForm["team" + side], size = gameForm.type === "singles" ? 1 : 2, i = team.indexOf(uid);
  if (i >= 0) team.splice(i, 1);
  else if (team.length < size) team.push(uid);
  else { team.shift(); team.push(uid); }
  _rerenderGameForm();
}

/** Typing: keep digits, update the message in place (the box keeps focus) */
function gameFormScore(k, v) {
  var d = String(v).replace(/\D/g, "").slice(0, 2);
  gameForm[k] = d === "" ? "" : String(Math.min(99, Number(d)));
  var el = document.getElementById("gfScore_" + k);
  if (el && el.value !== gameForm[k]) el.value = gameForm[k];
  var msg = document.getElementById("gfMsg"); if (msg) msg.innerHTML = _gameFormMsg();
}

function gameFormStep(k, delta) {
  var cur = gameForm[k] === "" ? (delta > 0 ? 20 : 22) : Number(gameForm[k]);
  gameFormScore(k, String(Math.max(0, Math.min(maxPoints(), cur + delta))));
}

function saveGame() {
  var f = gameForm, s = currentSession, size = f.type === "singles" ? 1 : 2;
  if (!s || f.sessionId !== s.id) return;
  if (f.teamA.length !== size || f.teamB.length !== size) { showToast(t("pickTeams").replace("{n}", size)); return; }
  if (f.a === "" || f.b === "") { showToast(t("scoreTypeBoth").replace("{cap}", maxPoints())); return; }
  var a = Number(f.a), b = Number(f.b), p = scoreProblem(a, b);
  if (p) { showToast(p); return; }
  var minutes = parseInt(f.minutes, 10) || null;
  if (minutes && (minutes < 1 || minutes > 180)) { showToast(t("minutesRange")); return; }
  var data = { type: f.type, teamA: f.teamA.slice(), teamB: f.teamB.slice(), games: [{ a: a, b: b }], minutes: minutes };
  var op = f.id
    ? fsdb.collection("matches").doc(f.id).update(data)
    : fsdb.collection("matches").add(withGroup(Object.assign(data, { sessionId: s.id, date: s.date, mode: s.mode || "competition",
        court: null, shuttles: 0, createdBy: currentUser.uid, createdAt: Date.now(), confirmed: false })));
  op.then(function () {
    showToast(t("gameSaved") + " ✔");
    // Ready for the next game (same type, empty teams and score)
    var type = f.type;
    gameForm = _blankGameForm(s); gameForm.type = type;
    _rerenderGameForm();
  }).catch(function (e) { showToast(_permError(e)); });
}

function editGame(id) {
  var m = lastMatches.filter(function (x) { return x.id === id; })[0];
  if (!m || !currentSession) return;
  var g = (m.games || [])[0] || {};
  gameForm = { sessionId: currentSession.id, id: id, type: m.type || "md", teamA: (m.teamA || []).slice(), teamB: (m.teamB || []).slice(),
    a: g.a != null ? String(g.a) : "", b: g.b != null ? String(g.b) : "", minutes: m.minutes ? String(m.minutes) : "" };
  _rerenderGameForm();
  var box = document.getElementById("gameFormBox"); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelGameEdit() { gameForm = _blankGameForm(currentSession); _rerenderGameForm(); }

function _gamesListHtml(s) {
  var list = sessionMatches(s.id);
  var html = '<div class="settings-section">' + t("gamesTitle") + ' (' + list.length + ')</div>';
  if (!list.length) return html + '<div class="empty-state" style="padding:14px">' + t(_canAddGames(s) ? "gamesEmptyPlayer" : "gamesEmpty") + '</div>';
  list.slice().reverse().forEach(function (m, i) { html += matchRowHtml(m, list.length - i); });
  return html;
}

/** Live: another player saved a game → refresh the list (not the form being typed in) */
function refreshSessionGames() {
  if (!currentSession || currentPage !== "session-detail" || sessionTab !== "games") return;
  var el = document.getElementById("sgList"); if (el) el.innerHTML = _gamesListHtml(currentSession);
  var tab = document.getElementById("sessionTabGamesN"); if (tab) tab.textContent = sessionMatches(currentSession.id).length;
  var title = document.querySelector("#gameFormBox .card-title");
  if (title && gameForm && !gameForm.id) title.innerHTML = icon("ranking", 14) + ' ' + t("gameN").replace("{n}", sessionMatches(currentSession.id).length + 1);
}

function matchRowHtml(m, no) {
  var w = matchWinner(m), me = currentUser.uid;
  var canEdit = m.createdBy === me || isGroupAdminMe();
  var g = (m.games || [])[0] || {};
  var more = (m.games || []).slice(1).map(function (x) { return x.a + '–' + x.b; }).join(', ');
  var html = '<div class="card match-row">';
  html += '<div class="match-head"><b>' + (no ? t("gameN").replace("{n}", no) : '') + '</b>' +
    '<span class="match-meta">' + t("gameType_" + (m.type || "md")) + (m.minutes ? ' · ' + m.minutes + ' ' + t("minShort") : '') + '</span>' +
    (canEdit ? '<span class="match-actions"><button class="edit-btn" aria-label="' + t("edit") + '" onclick="editGame(\'' + m.id + '\')">' + icon("pen", 14) + '</button>' +
      '<button class="delete-btn" aria-label="' + t("delete") + '" onclick="deleteMatch(\'' + m.id + '\')">' + icon("trash", 14) + '</button></span>' : '') + '</div>';
  html += '<div class="match-score-row"><div class="ms-side' + (w === "A" ? ' win' : '') + '"><div class="ms-names">' + _teamName(m.teamA || [], "A") + '</div><div class="ms-pts">' + (g.a != null ? g.a : '–') + '</div></div>' +
    '<div class="ms-vs">–</div>' +
    '<div class="ms-side' + (w === "B" ? ' win' : '') + '"><div class="ms-names">' + _teamName(m.teamB || [], "B") + '</div><div class="ms-pts">' + (g.b != null ? g.b : '–') + '</div></div></div>';
  if (more) html += '<div class="form-hint" style="text-align:center">' + more + '</div>';
  return html + '</div>';
}

function deleteMatch(id) {
  if (!confirm(t("deleteMatchConfirm"))) return;
  fsdb.collection("matches").doc(id).delete().then(function () { showToast(t("delete") + " ✔"); })
    .catch(function (e) { showToast(_permError(e)); });
}

/** Play mode + game type fields (poll and session forms). `name` is the global holding the form state. */
function playModeFieldsHtml(state, name, rerender) {
  var seg = function (field, opts, prefix) {
    return '<div class="seg seg-wrap">' + opts.map(function (o) {
      return '<button type="button" class="seg-btn' + (state[field] === o ? ' active' : '') + '" onclick="' + name + '.' + field + '=\'' + o + '\';' + rerender + '()">' + t(prefix + o) + '</button>';
    }).join('') + '</div>';
  };
  return '<div class="card"><div class="card-title">' + icon("ranking", 14) + ' ' + t("playMode") + '</div>' +
    seg("mode", ["fun", "exercise", "competition"], "mode_") +
    '<div class="form-hint" style="margin-bottom:10px">' + t("modeHint_" + (state.mode || "competition")) + '</div>' +
    '<label class="form-label">' + t("gameType") + '</label>' + seg("gameType", ["md", "wd", "xd", "singles", "any"], "gameType_") + '</div>';
}

/** Home: my level card (groups only) */
function homeLevelCardHtml() {
  if (!GROUPS_ON || !currentGroupId) return "";
  loadMatches();
  return '<div class="home-level">' + _myStatsCard().replace('onclick="progressUser=currentUser.uid;setStatsTab(\'progress\')"', 'onclick="statsTab=\'ranking\';showPage(\'stats\')"') + '</div>';
}

/* ---------- Badges ---------- */
var BADGES = [
  { key: "first", icon: "shuttle", need: 1, val: function (p) { return p.played; } },
  { key: "m50", icon: "medal", need: 50, val: function (p) { return p.played; } },
  { key: "m100", icon: "crown", need: 100, val: function (p) { return p.played; } },
  { key: "streak5", icon: "chart", need: 5, val: function (p) { return p.maxStreak || 0; } },
  { key: "streak10", icon: "ranking", need: 10, val: function (p) { return p.maxStreak || 0; } },
  { key: "courts5", icon: "court", need: 5, val: function (p) { return _courtsPlayed(p.uid); } },
  { key: "min1000", icon: "clock", need: 1000, val: function (p) { return p.minutes; } },
  { key: "pairMonth", icon: "users", need: 1, val: function (p) { return _isPairOfMonth(p.uid) ? 1 : 0; } }
];

function _courtsPlayed(uid) {
  var seen = {};
  (lastSessions || []).forEach(function (s) { if ((s.players || []).indexOf(uid) >= 0 && s.courtId) seen[s.courtId] = true; });
  return Object.keys(seen).length;
}

/** Best pair this month (at least 3 Competition matches together this month) */
function _isPairOfMonth(uid) {
  var st = computeStats(), best = null;
  Object.keys(st.pairs).forEach(function (k) {
    var p = st.pairs[k];
    if (p.monthWins + p.monthLosses < 3) return;
    if (!best || p.rating > best.rating) best = p;
  });
  return !!(best && best.key.split("+").indexOf(uid) >= 0);
}

function badgesFor(uid) {
  var p = computeStats().players[uid] || { uid: uid, played: 0, minutes: 0, maxStreak: 0 };
  return BADGES.map(function (b) { var v = b.val(p); return { key: b.key, icon: b.icon, earned: v >= b.need, value: Math.min(v, b.need), need: b.need }; });
}

function badgesHtml(uid, showLocked) {
  if (!GROUPS_ON) return "";
  var list = badgesFor(uid).filter(function (b) { return showLocked || b.earned; });
  if (!list.length) return "";
  var html = '<div class="card"><div class="card-title">' + icon("medal", 14) + ' ' + t("badges") +
    (uid === currentUser.uid ? '<button class="link-btn recap-btn" onclick="makeRecap()">' + t("monthlyRecap") + '</button>' : '') + '</div><div class="badge-grid">';
  list.forEach(function (b) {
    html += '<div class="badge-item' + (b.earned ? ' earned' : '') + '" title="' + t("badgeDesc_" + b.key) + '">' + icon(b.icon, 20) +
      '<span>' + t("badge_" + b.key) + '</span>' + (!b.earned && b.need > 1 ? '<small>' + b.value + '/' + b.need + '</small>' : '') + '</div>';
  });
  return html + '</div></div>';
}

/* ---------- Monthly recap card (an image to share) ---------- */
function makeRecap() {
  var me = currentUser.uid, st = computeStats(), p = st.players[me];
  var now = new Date(), mk = _todayIso().slice(0, 7);
  var bm = p && p.byMonth[mk] ? p.byMonth[mk] : { played: 0, wins: 0, losses: 0, minutes: 0 };
  var wr = bm.wins + bm.losses ? Math.round(bm.wins / (bm.wins + bm.losses) * 100) + "%" : "\u2013";
  var change = p && p.monthStart !== null ? Math.round(p.rating - p.monthStart) : 0;
  var best = p ? _bestPartner(p) : null;
  var earned = badgesFor(me).filter(function (b) { return b.earned; }).length;
  var c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  var g = c.getContext("2d");
  var grad = g.createLinearGradient(0, 0, 1080, 1350);
  grad.addColorStop(0, "#0d9488"); grad.addColorStop(1, "#1d4ed8");
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = "rgba(255,255,255,0.10)"; g.beginPath(); g.arc(900, 200, 300, 0, Math.PI * 2); g.fill();
  var font = function (w, px) { g.font = w + " " + px + "px Montserrat, 'Noto Sans Lao', sans-serif"; };
  g.fillStyle = "#fff"; g.textAlign = "left";
  font("700", 44); g.fillText("\uD83C\uDFF8 Godsmash \u00B7 " + (currentGroup ? currentGroup.name : ""), 80, 130);
  font("600", 40); g.globalAlpha = 0.85; g.fillText(monthYear(now.getFullYear(), now.getMonth()), 80, 200); g.globalAlpha = 1;
  font("800", 96); g.fillText(plainUserName(findUser(me)), 80, 340);
  var tiles = [[String(bm.played), t("matchesWord")], [wr, t("winRate")], [String(bm.minutes), t("minShort")], [(change > 0 ? "+" : "") + change, t("ratingWord")]];
  tiles.forEach(function (x, i) {
    var col = i % 2, row = Math.floor(i / 2), x0 = 80 + col * 470, y0 = 430 + row * 290;
    g.fillStyle = "rgba(255,255,255,0.14)"; _roundRect(g, x0, y0, 440, 250, 36); g.fill();
    g.fillStyle = "#fff"; font("800", 110); g.fillText(x[0], x0 + 40, y0 + 145);
    font("600", 40); g.globalAlpha = 0.85; g.fillText(x[1], x0 + 40, y0 + 210); g.globalAlpha = 1;
  });
  font("600", 44);
  if (best) g.fillText(t("bestPartner") + ": " + plainUserName(findUser(best)), 80, 1080);
  g.fillText(t("badges") + ": " + earned, 80, 1150);
  font("600", 34); g.globalAlpha = 0.75; g.fillText(playerLevel(me) ? t("level") + " " + levelShort(playerLevel(me)) + " · " + levelName(playerLevel(me)) : "", 80, 1260); g.globalAlpha = 1;
  c.toBlob(function (blob) {
    var file = typeof File !== "undefined" ? new File([blob], "godsmash-" + mk + ".png", { type: "image/png" }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Godsmash " + mk }).catch(function () {});
    } else {
      var url = URL.createObjectURL(blob);
      openImage(url);
      var a = document.createElement("a"); a.href = url; a.download = "godsmash-" + mk + ".png";
      document.body.appendChild(a); a.click(); a.remove();
    }
  }, "image/png");
}

function _roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
