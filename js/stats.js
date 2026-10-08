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
var recMatch = null;          // record form state
var matchesSessionId = null;  // session shown on the Matches page

var RATING_START = 1500;
var RATING_K = 32;
var RANK_MIN_MATCHES = 10;
var PAIR_MIN_MATCHES = 5;
var AUTO_CONFIRM_MS = 24 * 3600e3;

/* ---------- Data ---------- */

function loadMatches() {
  if (_matchesUnsub || !GROUPS_ON || !currentGroupId) return;
  _matchesUnsub = groupScoped(fsdb.collection("matches")).onSnapshot(function (snap) {
    var list = [];
    snap.forEach(function (d) { list.push(Object.assign({ id: d.id }, d.data())); });
    lastMatches = list.sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")) || ((a.createdAt || 0) - (b.createdAt || 0)); });
    _statsCache = null;
    if (/^(stats|matches|dashboard|user)$/.test(currentPage)) refreshCurrentPage("matches");
    if (typeof updateNotifications === "function") updateNotifications();
  }, dbOnError);
}

function stopMatches() {
  if (_matchesUnsub) _matchesUnsub();
  _matchesUnsub = null;
  lastMatches = [];
  _statsCache = null;
}

function isMatchCounted(m) {
  return !!(m.confirmed || (m.createdAt && Date.now() - m.createdAt >= AUTO_CONFIRM_MS));
}

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

/** Badminton game: to 21, win by 2, at most 30 */
function validGame(a, b) {
  var hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi < 21 || hi > 30) return false;
  if (hi === 21) return lo <= 19;
  if (hi === 30) return lo === 28 || lo === 29;
  return hi - lo === 2;
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
  // Levels from the player ranking (A top 15 %, B to 50 %, C to 80 %, D rest)
  var ranked = Object.keys(players).map(function (u) { return players[u]; })
    .filter(function (p) { return p.comp >= RANK_MIN_MATCHES; }).sort(function (a, b) { return b.rating - a.rating; });
  ranked.forEach(function (p) {
    // Same rating = same level
    var above = ranked.filter(function (x) { return x.rating > p.rating + 0.5; }).length;
    var q = ranked.length > 1 ? above / (ranked.length - 1) : 0;
    p.level = ranked.length < 4
      ? (p.rating >= 1600 ? "A" : p.rating >= 1520 ? "B" : p.rating >= 1460 ? "C" : "D")
      : (q <= 0.15 ? "A" : q <= 0.5 ? "B" : q <= 0.8 ? "C" : "D");
  });
  _statsCache = { players: players, pairs: pairs, h2h: h2h, ranked: ranked, month: month };
  return _statsCache;
}

/** A player's level: from the group ranking, else what they chose when joining */
function playerLevel(uid) {
  var st = computeStats();
  var p = st.players[uid];
  if (p && p.level) return p.level;
  var m = typeof memberOf === "function" ? memberOf(uid) : null;
  return (m && m.level) || (findUser(uid) && findUser(uid).selfLevel) || "D";
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

function _wl(w, l) { return w + t("winShort") + ' \u2013 ' + l + t("lossShort"); }

function _myStatsCard() {
  var me = currentUser.uid, st = computeStats(), p = st.players[me];
  var lvl = playerLevel(me);
  var html = '<div class="card my-stats" onclick="progressUser=currentUser.uid;setStatsTab(\'progress\')">';
  html += '<div class="my-stats-head"><span class="level-badge lv-' + lvl + '">' + lvl + '</span><div><div class="my-stats-title">' + t("myLevel") + '</div>' +
    '<div class="my-stats-rating">' + (p && p.comp ? Math.round(p.rating) + ' ' + _trend(p.rating, p.monthStart) : t("notRankedYet").replace("{n}", p ? p.comp : 0).replace("{min}", RANK_MIN_MATCHES)) + '</div></div></div>';
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
    .filter(function (p) { return p.comp >= PAIR_MIN_MATCHES && (!month || p.monthWins + p.monthLosses > 0); })
    .sort(function (a, b) { return b.rating - a.rating; });
  html += '<div class="settings-section">1. ' + t("pairRank") + '</div><div class="card rank-list">';
  if (!pairs.length) html += '<div class="empty-state" style="padding:12px">' + t("noPairsYet").replace("{n}", PAIR_MIN_MATCHES) + '</div>';
  pairs.forEach(function (p, i) {
    var us = p.key.split("+");
    html += '<div class="rank-row' + (us.indexOf(currentUser.uid) >= 0 ? ' me' : '') + '" onclick="h2hSides={a:\'' + p.key + '\',b:null};setStatsTab(\'h2h\')">' +
      '<span class="rank-no">' + (i + 1) + '</span><span class="rank-avatars">' + avatarHtml(us[0], 30) + avatarHtml(us[1], 30) + '</span>' +
      '<span class="rank-text"><b>' + pairName(p.key) + '</b><small>' + Math.round(p.rating) + ' \u00B7 ' +
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
      '<span class="rank-text"><b>' + getUserName(p.uid) + ' <span class="level-badge sm lv-' + p.level + '">' + p.level + '</span></b>' +
      '<small>' + Math.round(p.rating) + ' \u00B7 ' + wr + '% \u00B7 ' + _wl(w, l) + '</small></span>' + _trend(p.rating, p.monthStart) + '</div>';
  });
  html += '</div>';
  // Not ranked yet
  var waiting = Object.keys(st.players).map(function (u) { return st.players[u]; }).filter(function (p) { return p.comp < RANK_MIN_MATCHES; });
  if (waiting.length) {
    html += '<div class="form-hint" style="margin:6px 4px 14px">' + t("notRankedList") + ' ' + waiting.map(function (p) {
      return getUserName(p.uid) + ' (' + p.comp + '/' + RANK_MIN_MATCHES + ')';
    }).join(', ') + '</div>';
  }
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

/* ---------- Matches of a session (+ match maker, queue) ---------- */

function showSessionMatches(sessionId) {
  matchesSessionId = sessionId;
  showPage("matches");
}

function loadMatchesPage() {
  loadMatches();
  renderMatchesPage();
}

function _matchSession() {
  return (currentSession && currentSession.id === matchesSessionId) ? currentSession : (lastSessions || []).filter(function (s) { return s.id === matchesSessionId; })[0];
}

function sessionMatches(sid) { return lastMatches.filter(function (m) { return m.sessionId === sid; }); }

function renderMatchesPage() {
  var box = document.getElementById("matchesContent");
  var s = _matchSession();
  if (!box || !s) return;
  setBreadcrumb([{ label: t("navSessions"), action: "showPage('sessions')" }, { label: fmtDate(s.date), action: "showSessionDetail('" + s.id + "')" }, { label: t("matches") }]);
  var list = sessionMatches(s.id);
  var mode = s.mode || "competition";
  var html = '<div class="card"><div class="game-tags" style="margin-top:0"><span class="tag mode-' + mode + '">' + t("mode_" + mode) + '</span>' +
    '<span class="tag">' + t("gameType_" + (s.gameType || "md")) + '</span><span class="tag">' + (s.players || []).length + ' ' + t("players") + '</span></div>' +
    '<div class="form-hint">' + t("modeHint_" + mode) + '</div></div>';
  html += _renderMatchMaker(s, list);
  if (typeof tournamentHtml === "function") html += tournamentHtml(s, list);
  html += '<div class="settings-section">' + t("matches") + ' (' + list.length + ')</div>';
  if (!list.length) html += '<div class="empty-state" style="padding:14px">' + t("noMatchesYet") + '</div>';
  list.slice().reverse().forEach(function (m) { html += matchRowHtml(m); });
  html += '<button class="btn-primary" onclick="startRecordMatch(null)">+ ' + t("recordMatch") + '</button>';
  box.innerHTML = html;
}

function matchRowHtml(m) {
  var sc = matchScore(m), w = matchWinner(m), me = currentUser.uid;
  var nameOf = function (team) { return team.map(function (u) { return getUserName(u); }).join(" &amp; "); };
  var aWin = w === "A", bWin = w === "B";
  var counted = isMatchCounted(m);
  var canConfirm = !m.confirmed && m.createdBy !== me && (m.teamA.concat(m.teamB).indexOf(me) >= 0) &&
    !((m.teamA.indexOf(m.createdBy) >= 0) && (m.teamA.indexOf(me) >= 0)) && !((m.teamB.indexOf(m.createdBy) >= 0) && (m.teamB.indexOf(me) >= 0));
  var canEdit = (m.createdBy === me && !m.confirmed) || isGroupAdminMe();
  var games = (m.games || []).filter(function (g) { return g && (g.a != null || g.b != null); }).map(function (g) { return g.a + '\u2013' + g.b; }).join(', ');
  var html = '<div class="card match-row">';
  html += '<div class="match-teams"><span class="' + (aWin ? 'win' : '') + '">' + nameOf(m.teamA) + '</span><span class="vs">vs</span><span class="' + (bWin ? 'win' : '') + '">' + nameOf(m.teamB) + '</span></div>';
  html += '<div class="match-facts">' + (games || t("noScore")) + (m.minutes ? ' \u00B7 ' + m.minutes + ' ' + t("minShort") : '') +
    ' \u00B7 <span class="tag mode-' + (m.mode || "competition") + '">' + t("mode_" + (m.mode || "competition")) + '</span></div>';
  html += '<div class="match-status">' + (m.confirmed ? '<span class="status-chip st-settled">' + t("confirmedWord") + '</span>'
    : counted ? '<span class="status-chip st-settled">' + t("autoConfirmed") + '</span>'
    : '<span class="status-chip st-costs">' + t("waitingConfirm") + '</span>') +
    (canConfirm && !counted ? '<button class="edit-btn" onclick="confirmMatch(\'' + m.id + '\')">' + icon("check", 14) + ' ' + t("confirm") + '</button>' : '') +
    (canEdit ? '<button class="edit-btn" onclick="startRecordMatch(\'' + m.id + '\')">' + icon("pen", 14) + '</button>' +
      '<button class="delete-btn" onclick="deleteMatch(\'' + m.id + '\')">' + icon("trash", 14) + '</button>' : '') + '</div>';
  return html + '</div>';
}

function confirmMatch(id) {
  fsdb.collection("matches").doc(id).update({ confirmed: true, confirmedBy: currentUser.uid, confirmedAt: Date.now() })
    .then(function () { showToast(t("confirmedWord") + " \u2714"); })
    .catch(function (e) { showToast(_permError(e)); });
}

function deleteMatch(id) {
  if (!confirm(t("deleteMatchConfirm"))) return;
  fsdb.collection("matches").doc(id).delete().then(function () { showToast(t("delete") + " \u2714"); })
    .catch(function (e) { showToast(_permError(e)); });
}

/* Match maker: the next players are those who played least (then waited
   longest); Competition = even teams by rating, Exercise = new partners,
   Fun = random. */
var _mmSeed = 0;

function suggestNextMatch(s, list) {
  var players = (s.players || []).slice();
  var size = (s.gameType === "singles") ? 2 : 4;
  if (players.length < size) return null;
  var played = {}, lastAt = {};
  players.forEach(function (u) { played[u] = 0; lastAt[u] = 0; });
  list.forEach(function (m, i) { m.teamA.concat(m.teamB).forEach(function (u) { if (u in played) { played[u]++; lastAt[u] = i + 1; } }); });
  var rnd = function (u) { var h = _mmSeed * 31; for (var i = 0; i < u.length; i++) h = (h * 33 + u.charCodeAt(i)) % 9973; return h; };
  players.sort(function (a, b) { return (played[a] - played[b]) || (lastAt[a] - lastAt[b]) || (rnd(a) - rnd(b)); });
  var next = players.slice(0, size), queue = players.slice(size);
  if (size === 2) return { a: [next[0]], b: [next[1]], queue: queue };
  var splits = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  var mode = s.mode || "competition";
  var best = splits[0];
  if (mode === "competition") {
    var r = function (i) { return ratingOf(next[i]); };
    best = splits.slice().sort(function (x, y) {
      return Math.abs(r(x[0][0]) + r(x[0][1]) - r(x[1][0]) - r(x[1][1])) - Math.abs(r(y[0][0]) + r(y[0][1]) - r(y[1][0]) - r(y[1][1]));
    })[_mmSeed % 3]; // Shuffle: next most even split
  } else if (mode === "exercise") {
    var together = function (u, v) { return list.filter(function (m) { return (m.teamA.indexOf(u) >= 0 && m.teamA.indexOf(v) >= 0) || (m.teamB.indexOf(u) >= 0 && m.teamB.indexOf(v) >= 0); }).length; };
    best = splits.slice().sort(function (x, y) {
      return (together(next[x[0][0]], next[x[0][1]]) + together(next[x[1][0]], next[x[1][1]])) - (together(next[y[0][0]], next[y[0][1]]) + together(next[y[1][0]], next[y[1][1]]));
    })[0];
  } else {
    best = splits[_mmSeed % 3];
  }
  return { a: [next[best[0][0]], next[best[0][1]]], b: [next[best[1][0]], next[best[1][1]]], queue: queue };
}

function _renderMatchMaker(s, list) {
  var sug = suggestNextMatch(s, list);
  if (!sug) return '<div class="form-hint" style="margin:8px 4px">' + t("needPlayersForMatch") + '</div>';
  var team = function (us) { return us.map(function (u) { return '<span class="mm-player">' + avatarHtml(u, 30) + '<b>' + getUserName(u) + '</b></span>'; }).join(''); };
  var html = '<div class="card match-maker"><div class="card-title">' + icon("users", 14) + ' ' + t("nextMatch") + '</div>' +
    '<div class="mm-teams"><div class="mm-team">' + team(sug.a) + '</div><div class="vs">vs</div><div class="mm-team">' + team(sug.b) + '</div></div>' +
    '<div class="game-actions"><button class="btn-primary" onclick="startRecordMatch(null,' + JSON.stringify({ a: sug.a, b: sug.b }).replace(/"/g, "'") + ')">' + t("startMatch") + '</button>' +
    '<button class="btn-secondary" onclick="_mmSeed++;renderMatchesPage()">' + t("shuffle") + '</button></div>';
  if (sug.queue.length) {
    html += '<div class="mm-queue"><span class="form-hint">' + t("waitingQueue") + '</span> ' + sug.queue.map(function (u, i) {
      return '<span class="queue-chip">' + (i + 1) + '. ' + getUserName(u) + '</span>';
    }).join('') + '</div>';
  }
  return html + '</div>';
}

/* ---------- Record a match ---------- */

function startRecordMatch(matchId, teams) {
  var s = _matchSession();
  if (!s) return;
  var m = matchId ? lastMatches.filter(function (x) { return x.id === matchId; })[0] : null;
  var type = s.gameType && s.gameType !== "any" ? s.gameType : "md";
  recMatch = m ? JSON.parse(JSON.stringify(m)) : {
    sessionId: s.id, date: s.date, type: type, mode: s.mode || "competition",
    teamA: teams ? teams.a.slice() : [], teamB: teams ? teams.b.slice() : [],
    format: 3, games: [{ a: 0, b: 0 }, { a: 0, b: 0 }, { a: 0, b: 0 }], minutes: "", court: 1, shuttles: 1
  };
  if (m) {
    recMatch.format = (m.games || []).length > 1 ? 3 : 1;
    while (recMatch.games.length < 3) recMatch.games.push({ a: 0, b: 0 });
  }
  showPage("match-record");
}

function loadMatchRecord() {
  var s = _matchSession();
  setBreadcrumb([{ label: t("matches"), action: "showPage('matches')" }, { label: t("recordMatch") }]);
  renderMatchRecord(s);
}

function _teamSize() { return recMatch.type === "singles" ? 1 : 2; }

function renderMatchRecord() {
  var box = document.getElementById("matchRecordContent");
  var s = _matchSession();
  if (!box || !recMatch || !s) return;
  var r = recMatch, size = _teamSize();
  var html = '<div class="card">';
  // Must: type, teams, score
  html += '<div class="form-group"><label class="form-label">' + t("matchType") + ' *</label><div class="seg seg-wrap">' +
    ["md", "wd", "xd", "singles"].map(function (x) { return '<button type="button" class="seg-btn' + (r.type === x ? ' active' : '') + '" onclick="recSet(\'type\',\'' + x + '\')">' + t("gameType_" + x) + '</button>'; }).join('') + '</div></div>';
  ["A", "B"].forEach(function (side) {
    var team = r["team" + side], other = r["team" + (side === "A" ? "B" : "A")];
    html += '<div class="form-group"><label class="form-label">' + t("team") + ' ' + side + ' * <small>(' + team.length + '/' + size + ')</small></label><div class="chips">' +
      (s.players || []).map(function (u) {
        var on = team.indexOf(u) >= 0, taken = other.indexOf(u) >= 0;
        return '<div class="chip avatar-chip' + (on ? ' active' : '') + (taken ? ' disabled' : '') + '"' + (taken ? '' : ' onclick="recToggle(\'' + side + '\',\'' + u + '\')"') + '>' + avatarHtml(u, 20) + getUserName(u) + '</div>';
      }).join('') + '</div></div>';
  });
  html += '<div class="form-group"><label class="form-label">' + t("format") + ' *</label><div class="seg">' +
    [[1, "oneGame"], [3, "bestOf3"]].map(function (x) { return '<button type="button" class="seg-btn' + (r.format === x[0] ? ' active' : '') + '" onclick="recSet(\'format\',' + x[0] + ')">' + t(x[1]) + '</button>'; }).join('') + '</div></div>';
  var w0 = _gamesWon(0), w1 = _gamesWon(1);
  var needThird = r.format === 3 && w0 >= 0 && w1 >= 0 && w0 !== w1; // 1–1 after two games
  for (var gi = 0; gi < (r.format === 3 ? (needThird ? 3 : 2) : 1); gi++) {
    var g = r.games[gi];
    html += '<div class="form-group"><label class="form-label">' + t("gameN").replace("{n}", gi + 1) + (r.mode === "competition" ? ' *' : '') + '</label><div class="score-row">' +
      _counter(gi, "a", g.a) + '<span class="score-sep">\u2013</span>' + _counter(gi, "b", g.b) + '</div></div>';
  }
  // Should: minutes (typed — no running timer)
  html += '<div class="form-group"><label class="form-label">' + t("timePlayed") + '</label>' +
    '<input type="number" class="form-input" inputmode="numeric" min="1" max="120" placeholder="' + t("minutesExample") + '" value="' + escapeHtml(String(r.minutes || "")) + '" oninput="recMatch.minutes=parseInt(this.value,10)||\'\'"></div>';
  html += '<details class="more-details"><summary>' + t("moreDetails") + '</summary>' +
    '<div class="form-row"><div class="form-group"><label class="form-label">' + t("courtNumber") + '</label><input type="number" class="form-input" min="1" max="30" value="' + (r.court || 1) + '" oninput="recMatch.court=parseInt(this.value,10)||1"></div>' +
    '<div class="form-group"><label class="form-label">' + t("shuttlesUsed") + '</label><input type="number" class="form-input" min="0" max="20" value="' + (r.shuttles || 0) + '" oninput="recMatch.shuttles=parseInt(this.value,10)||0"></div></div></details>';
  html += '<div class="live-summary">' + _recSummary() + '</div>';
  html += '<button class="btn-primary" onclick="saveMatch()">' + t("saveScore") + '</button>';
  html += '<div class="form-hint" style="text-align:center;margin-top:8px">' + t(r.mode === "competition" ? "confirmHintComp" : "confirmHintFun") + '</div>';
  box.innerHTML = html + '</div>';
}

function _counter(gi, side, v) {
  return '<div class="score-counter"><button type="button" onclick="recScore(' + gi + ',\'' + side + '\',-1)">\u2212</button>' +
    '<input type="number" inputmode="numeric" min="0" max="30" value="' + (v || 0) + '" onchange="recScore(' + gi + ',\'' + side + '\',0,this.value)">' +
    '<button type="button" onclick="recScore(' + gi + ',\'' + side + '\',1)">+</button></div>';
}

function _gamesWon(gi) {
  var g = recMatch.games[gi];
  if (!g || !validGame(g.a || 0, g.b || 0)) return -1;
  return g.a > g.b ? 1 : 0;
}

function _recGames() {
  var r = recMatch, n = r.format === 3 ? 3 : 1;
  if (n === 3) { var w0 = _gamesWon(0), w1 = _gamesWon(1); if (w0 >= 0 && w0 === w1) n = 2; } // 2–0: no third game
  var out = [];
  for (var i = 0; i < n; i++) {
    var g = r.games[i];
    if (!g || (!g.a && !g.b)) continue;
    out.push({ a: g.a || 0, b: g.b || 0 });
  }
  return out;
}

function _recSummary() {
  var r = recMatch;
  var games = _recGames();
  var a = 0, b = 0;
  games.forEach(function (g) { if (g.a > g.b) a++; else if (g.b > g.a) b++; });
  var name = function (team) { return team.length ? team.map(function (u) { return getUserName(u); }).join(" &amp; ") : "?"; };
  var who = a > b ? name(r.teamA) : b > a ? name(r.teamB) : "";
  return (who ? t("winsSummary").replace("{team}", who).replace("{score}", Math.max(a, b) + "\u2013" + Math.min(a, b)) : t("noScore")) +
    (r.minutes ? ' \u00B7 ' + r.minutes + ' ' + t("minShort") : '') + ' \u00B7 ' + t(r.mode === "competition" ? "countsForRating" : "countsForPlayed");
}

function recSet(field, value) {
  recMatch[field] = value;
  if (field === "type") {
    var size = _teamSize();
    recMatch.teamA = recMatch.teamA.slice(0, size);
    recMatch.teamB = recMatch.teamB.slice(0, size);
  }
  renderMatchRecord();
}

function recToggle(side, uid) {
  var team = recMatch["team" + side], i = team.indexOf(uid);
  if (i >= 0) team.splice(i, 1);
  else if (team.length < _teamSize()) team.push(uid);
  else { team.shift(); team.push(uid); }
  renderMatchRecord();
}

function recScore(gi, side, delta, typed) {
  var g = recMatch.games[gi];
  var v = typed !== undefined ? parseInt(typed, 10) || 0 : (g[side] || 0) + delta;
  g[side] = Math.max(0, Math.min(30, v));
  renderMatchRecord();
}

function saveMatch() {
  var r = recMatch, size = _teamSize();
  if (r.teamA.length !== size || r.teamB.length !== size) { showToast(t("pickTeams").replace("{n}", size)); return; }
  var games = _recGames();
  var bad = games.filter(function (g) { return !validGame(g.a, g.b); })[0];
  if (bad) { showToast(t("scoreRule").replace("{score}", bad.a + "\u2013" + bad.b)); return; }
  if (r.mode === "competition") {
    var a = 0, b = 0;
    games.forEach(function (g) { if (g.a > g.b) a++; else b++; });
    var need = r.format === 3 ? 2 : 1;
    if (Math.max(a, b) < need) { showToast(t("scoreNeeded")); return; }
  }
  if (r.minutes && (r.minutes < 1 || r.minutes > 180)) { showToast(t("minutesRange")); return; }
  var data = {
    sessionId: r.sessionId, date: r.date, type: r.type, mode: r.mode, teamA: r.teamA.slice(), teamB: r.teamB.slice(),
    games: games, minutes: r.minutes || null, court: r.court || null, shuttles: r.shuttles || 0
  };
  var op;
  if (r.id) op = fsdb.collection("matches").doc(r.id).update(data);
  else op = fsdb.collection("matches").add(withGroup(Object.assign(data, { createdBy: currentUser.uid, createdAt: Date.now(), confirmed: false })));
  op.then(function () {
    recMatch = null;
    showToast(t("matchSaved") + " \u2714");
    showPage("matches", false);
  }).catch(function (e) { showToast(_permError(e)); });
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
  font("600", 34); g.globalAlpha = 0.75; g.fillText(t("level") + " " + playerLevel(me), 80, 1260); g.globalAlpha = 1;
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
