/* ============================================================
   stats.js — Matches, ratings and the Stats tab (group only).
   matches/{id} { groupId, sessionId, date, type md|wd|xd|singles,
                  teamA [uid], teamB [uid], games [{a, b}], minutes,
                  court, shuttles, mode fun|exercise|competition,
                  createdBy, createdAt, confirmed, confirmedBy, confirmedAt }
   A match counts once someone on the other team confirms it, or 24 h
   after it was recorded. Every saved game with a score changes ratings,
   whatever its mode (fun / exercise / competition is only a label).
   Ratings are Elo-style (start 1500): beating stronger players earns more,
   a bigger point difference a little more. Pairs get their own rating.
   Nothing here is ever shown outside the group.
   ============================================================ */

var lastMatches = [];
var _matchesUnsub = null;
var statsTab = "ranking";     // ranking | h2h | progress
var progressUser = null;

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
    if (/^(stats|matches|dashboard|user|home)$/.test(currentPage)) refreshCurrentPage("matches");   // the Home badge count follows the games (not Settings or forms: a re-render would wipe typing)
    if (currentPage === "session-detail") { refreshSessionGames(); var tn = document.getElementById("sessionTabGamesN"); if (tn && currentSession) tn.textContent = sessionMatches(currentSession.id).length; }
    if (typeof updateNotifications === "function") updateNotifications();
  }, function (e) { dbOnError(e, "matches"); });
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
/** The two uids of a pair key, ordered by display name (A→Z) so a pair always reads the same way */
function pairUids(key) {
  var nm = function (u) { return String(getUserName(u)).toLowerCase(); };
  return key.split("+").sort(function (a, b) { return nm(a).localeCompare(nm(b)) || (a < b ? -1 : 1); });
}
function pairName(key) { return pairUids(key).map(function (u) { return getUserName(u); }).join(" &amp; "); }
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
    // Every game with a score changes ratings: mode (fun | exercise | competition) is only a label for the players
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
        if (inMonth && p.monthStart === null) { p.monthStart = p.rating; p.compAtStart = p.comp; }
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
        if (inMonth && pr.monthStart === null) { pr.monthStart = pr.rating; pr.compAtStart = pr.comp; }
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
  // Rank change since the start of the month: position now vs position then
  // (same ordering rules; players or pairs with no game before this month are NEW)
  var rankMaps = function (list, startComp, settledMin) {
    var before = list.filter(function (x) { return (x.monthStart === null ? x.comp : x.compAtStart) > 0; });
    var r0 = function (x) { return x.monthStart === null ? x.rating : x.monthStart; };
    var c0 = function (x) { return x.monthStart === null ? x.comp : x.compAtStart; };
    before.sort(function (a, b) { return (settledMin ? ((c0(b) >= settledMin) - (c0(a) >= settledMin)) : 0) || (r0(b) - r0(a)); });
    var then = {}; before.forEach(function (x, i) { then[x.uid || x.key] = i + 1; });
    var now = list.slice().sort(function (a, b) { return (settledMin ? ((b.comp >= settledMin) - (a.comp >= settledMin)) : 0) || (b.rating - a.rating); });
    var change = {}; now.forEach(function (x, i) { var k = x.uid || x.key; change[k] = then[k] ? then[k] - (i + 1) : null; });
    return change;
  };
  var rankChange = {
    players: rankMaps(ranked, 0, RANK_MIN_MATCHES),
    pairs: rankMaps(Object.keys(pairs).map(function (k) { return pairs[k]; }).filter(function (x) { return x.comp > 0; }), 0, 0)
  };
  _statsCache = { players: players, pairs: pairs, h2h: h2h, ranked: ranked, month: month, rankChange: rankChange };
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
function setStatsPeriod(p) { setStatsScope(p); }

function renderStats() {
  var box = document.getElementById("statsContent");
  if (!box) return;
  var tabs = '<div class="me-title">' + icon("ranking", 22) + ' ' + t("navRankings") + '</div>' +
    '<div class="dashboard-tabs stats-tabs" role="tablist">' + [["ranking", "statsRanking", "ranking"], ["h2h", "headToHead", "users"], ["progress", "progress", "chart"]].map(function (x) {
    return '<button role="tab" class="dash-tab' + (statsTab === x[0] ? ' active' : '') + '" onclick="setStatsTab(\'' + x[0] + '\')">' + icon(x[2], 14) + ' ' + t(x[1]) + '</button>';
  }).join('') + '</div>';
  var note = '<div class="private-note">' + icon("lock", 12) + ' ' + t("statsPrivate").replace("{group}", escapeHtml(currentGroup ? currentGroup.name : "")) + '</div>';
  var body = statsTab === "h2h" ? _renderH2H() : statsTab === "progress" ? _renderProgress() : _renderRanking();
  box.innerHTML = tabs + note + body;
  uiMotion(box, statsTab + "|" + statsScope + "|" + (typeof progressUser !== "undefined" ? progressUser : ""));
}

function _trend(now, start) {
  if (start === null || start === undefined) return '';
  var d = Math.round(now - start);
  if (!d) return '<span class="trend">\u2013</span>';
  return '<span class="trend ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(d) + '</span>';
}

/** Rank movement since the start of the month + the score change under it */
function _rankTrend(change, now, start) {
  var rk = change === null || change === undefined ? '<span class="rk-chg new">' + t("newTag") + '</span>'
    : !change ? '<span class="rk-chg same">\u2013</span>'
    : '<span class="rk-chg ' + (change > 0 ? 'up' : 'down') + '">' + (change > 0 ? '\u25B2' : '\u25BC') + Math.abs(change) + '</span>';
  return '<span class="rk-side" title="' + escapeHtml(t("rankChangeHint")) + '">' + rk + _trend(now, start) + '</span>';
}

/** "3/10 games" while a rating is still settling */
function _provTag(n, min) { return n < min ? ' <span class="tag prov-tag" title="' + escapeHtml(t("provisionalHint")) + '">' + t("provisionalN").replace("{n}", n).replace("{min}", min) + '</span>' : ''; }

function _wl(w, l) { return fmtWL(w, l); }

function _myStatsCard() {
  var me = currentUser.uid, st = computeStats(), p = st.players[me];
  var lvl = playerLevel(me), sf = statsFor(me, statsScope), rk = rankOf(me, statsScope);
  var html = '<div class="card my-hero">';
  // Who I am, my place and my rating (the one big number)
  html += '<div class="mh-top">' + avatarHtml(me, 56) + '<div class="mh-id"><div class="mh-name"><span class="mh-nm">' + getUserName(me) + '</span></div>' +
    '<div class="mh-sub">' + (lvl ? levelBadgeHtml(lvl, true) : '') + (rk ? '<b class="mh-rank">#' + rk + '</b> ' + _rankTrend(st.rankChange.players[me], p.rating, p.monthStart) : t("notRankedYet")) + '</div></div>' +
    '<div class="mh-acts"><button class="how-btn" aria-label="' + t("shareMyCard") + '" title="' + t("shareMyCard") + '" onclick="openShareCard()">' + icon("shareOut", 14) + '</button>' +
    '<button class="how-btn" aria-label="' + t("howRankingWorks") + '" onclick="showRankingHelp()">?</button></div>' +
    '<div class="mh-rate"><small>' + t("homeRating") + '</small><b>' + (p && p.comp ? Math.round(p.rating) : '\u2013') + '</b>' + (p && p.comp ? _provTag(p.comp, RANK_MIN_MATCHES) : '') + '</div></div>';
  html += '<div class="mh-scope">' + scopeChipsHtml() + '</div>';
  // Facts for the chosen period: icon + number chips (the words are in the tooltip)
  var progressBtn = '<button class="mh-go" aria-label="' + escapeHtml(t("seeMyProgress")) + '" title="' + escapeHtml(t("seeMyProgress")) + '" onclick="progressUser=currentUser.uid;setStatsTab(\'progress\')">' + icon("chart", 18) + '</button>';
  html += '<div class="mh-facts">' +
    '<span class="mh-chip" title="' + escapeHtml(t("winRate")) + '">' + icon("medal", 18) + '<span><b>' + pct(sf.wins, sf.decided) + '</b><small>' + t("winRate") + '</small></span></span>' +
    '<span class="mh-chip" title="' + escapeHtml(t("gamesWord")) + '">' + icon("court", 18) + '<span><b>' + sf.played + '</b><small>' + t("gamesWord") + '</small></span></span>' +
    '<span class="mh-chip" title="' + escapeHtml(t("streak")) + '">' + icon("chart", 18) + '<span><b>' + (sf.streakNow > 0 ? sf.streakNow + t("winShort") : sf.streakNow < 0 ? (-sf.streakNow) + t("lossShort") : '\u2013') + '</b><small>' + t("streak") + '</small></span></span>' +
    progressBtn + '</div>';
  // One useful sentence + my rating line for the period
  var ins = insightFor(me, statsScope), tr = ratingTrend(me, statsScope);
  var line = t(ins.key).replace("{n}", ins.n).replace("{pct}", ins.pct || "").replace("{name}", ins.uid ? '<b>' + escapeHtml(getUserName(ins.uid)) + '</b>' : "");
  html += '<div class="mh-insight ' + ins.key + '"><span class="mh-ii">' + icon(ins.key === "insLineTough" ? "chart" : ins.key === "insLineStart" ? "court" : "ranking", 18) + '</span><span>' + line + '</span></div>';
  if (tr && tr.vals.length > 2) {
    html += '<div class="mh-trend">' + _sparkline(tr.vals) +
      '<div class="mh-tl"><span>' + t("startWord") + ' <b>' + tr.start + '</b></span><span>' + t("homeBest") + ' <b>' + tr.peak + '</b></span><span>' + t("nowWord") + ' <b>' + tr.end + '</b>' +
      (tr.delta ? ' <em class="' + (tr.delta > 0 ? 'up' : 'down') + '">' + (tr.delta > 0 ? '\u25B2 +' : '\u25BC ') + tr.delta + '</em>' : '') + '</span></div></div>';
  }
  // My last 5 games, newest first: W/L chips only; tap to open the list
  var last = formStrip(me, 5);
  if (last.length) {
    html += '<details class="recent-wrap"><summary class="form-strip" title="' + escapeHtml(t("lastNGames").replace("{n}", last.length)) + '">' +
      last.map(function (x) { return '<span class="wl ' + (x.won ? 'w' : 'l') + '">' + (x.won ? t("winShort") : t("lossShort")) + '</span>'; }).join('') +
      '<span class="recent-chev">' + icon("chevron", 14) + '</span></summary>';
    html += '<div class="recent-games">' + last.map(function (x) {
      var mine = x.mine.slice().sort(function (a, b) { return (b === me) - (a === me); });  // personal view: me first
      return '<div class="recent-game ' + (x.won ? 'won' : 'lost') + '"><span class="rg-res">' + (x.won ? t("winShort") : t("lossShort")) + '</span>' +
        '<div class="rg-body"><div class="rg-line">' + mine.map(function (u) { return personHtml(u, 24); }).join('') + '</div>' +
        '<div class="rg-line vs"><span class="rg-vs">' + t("vsWord") + '</span>' + byNameAZ(x.them).map(function (u) { return personHtml(u, 20); }).join('') + '</div></div></div>';
    }).join('') + '</div></details>';
  }
  return html + '</div>';
}

/** How ratings and rankings are counted — with the systems it follows */
function showRankingHelp() {
  var el = document.createElement("div");
  el.className = "image-viewer level-guide";
  el.onclick = function (e) { if (e.target === el || e.target.closest(".lg-close")) el.remove(); };
  var cap = typeof maxPoints === "function" ? maxPoints() : 31;
  el.innerHTML = '<div class="lg-sheet"><div class="lg-head"><b>' + t("howRankingWorks") + '</b><button class="lg-close" aria-label="' + t("close") + '">' + icon("close", 18) + '</button></div>' +
    '<div class="help-body">' + t("rankHelpHtml").replace(/\{start\}/g, RATING_START).replace(/\{k\}/g, RATING_K).replace(/\{min\}/g, RANK_MIN_MATCHES).replace(/\{pmin\}/g, PAIR_MIN_MATCHES).replace(/\{cap\}/g, cap) + '</div></div>';
  document.body.appendChild(el);
}

/** Best pair (highest pair rating) and best score (biggest win margin) for the period */
function _highlightsHtml(st, pairs, scope) {
  var html = '', bp = pairs[0], bs = null;
  st.h2h.forEach(function (x) {
    if (scopeFrom(scope) && (x.m.date || "") < scopeFrom(scope)) return;
    var margin = Math.abs(x.pts);
    if (!bs || margin > bs.margin || (margin === bs.margin && (x.m.date || "") > (bs.x.m.date || ""))) bs = { x: x, margin: margin };
  });
  if (!bp && !bs) return '';
  html += '<div class="card hl-card">';
  if (bp) {
    var us = pairUids(bp.key);
    html += '<div class="hl-row"><span class="hl-ico">' + icon("ranking", 16) + '</span><span class="rank-avatars">' + avatarHtml(us[0], 28) + (us[1] ? avatarHtml(us[1], 28) : '') + '</span>' +
      '<span class="rank-text"><small>' + t("groupTopPair") + '</small><b>' + pairName(bp.key) + '</b>' +
      '<small>' + Math.round(bp.rating) + ' · ' + _wl(bp.wins, bp.losses) + '</small></span></div>';
  }
  if (bs) {
    var m = bs.x.m, g = (m.games || [])[0] || {}, aWon = bs.x.w === "A";
    var win = aWon ? m.teamA : m.teamB, lose = aWon ? m.teamB : m.teamA;
    var hi = Math.max(g.a || 0, g.b || 0), lo = Math.min(g.a || 0, g.b || 0);
    var names = function (team) { return byNameAZ(team).map(function (u) { return escapeHtml(getUserName(u)); }).join(" &amp; "); };
    html += '<div class="hl-row"><span class="hl-ico">' + icon("chart", 16) + '</span>' +
      '<span class="rank-text"><small>' + t("bestScore") + (m.date ? ' · ' + fmtDate(m.date) : '') + '</small><b>' + names(win) + ' ' + hi + '–' + lo + '</b>' +
      '<small>' + t("vsWord") + ' ' + names(lose) + ' · +' + bs.margin + '</small></span></div>';
  }
  return html + '</div>';
}

function _renderRanking() {
  var st = computeStats();
  var html = _myStatsCard() + badgesHtml(currentUser.uid, true);
  html += '<div class="form-hint scope-note">' + icon("chart", 13) + ' ' + scopeLabel(statsScope) + '</div>';

  // 1. Pair rank (men's doubles is how most of us play)
  var recs = pairRecordsFor(statsScope), all = statsScope === "all";
  var pairs = Object.keys(st.pairs).map(function (k) { return st.pairs[k]; })
    .filter(function (p) { return p.comp > 0 && (all || recs[p.key]); })
    .sort(function (a, b) { return (b.rating - a.rating) || (b.comp - a.comp); });
  html += _highlightsHtml(st, pairs, statsScope);
  html += '<div class="settings-section">1. ' + t("pairRank") + '</div><div class="card rank-list">';
  if (!pairs.length) html += '<div class="empty-state" style="padding:12px">' + t("noPairsYet").replace("{n}", PAIR_MIN_MATCHES) + '</div>';
  pairs.forEach(function (p, i) {
    var us = pairUids(p.key), r = all ? { w: p.wins, l: p.losses } : recs[p.key];
    html += '<div class="rank-row' + (us.indexOf(currentUser.uid) >= 0 ? ' me' : '') + '" onclick="setStatsTab(\'h2h\')">' +
      '<span class="rank-no">' + (i + 1) + '</span><span class="rank-avatars">' + avatarHtml(us[0], 30) + avatarHtml(us[1], 30) + '</span>' +
      '<span class="rank-text"><b>' + pairName(p.key) + _provTag(p.comp, PAIR_MIN_MATCHES) + '</b><small>' + Math.round(p.rating) + ' \u00B7 ' +
      _wl(r.w, r.l) + '</small></span>' + _rankTrend(st.rankChange.pairs[p.key], p.rating, p.monthStart) + '</div>';
  });
  html += '</div>';

  // 2. Player rank: the same list rankOf() numbers
  var ranked = rankedFor(statsScope);
  html += '<div class="settings-section">2. ' + t("playerRank") + '</div><div class="card rank-list">';
  if (!ranked.length) html += '<div class="empty-state" style="padding:12px">' + t("noRankYet").replace("{n}", RANK_MIN_MATCHES) + '</div>';
  ranked.forEach(function (p, i) {
    var sf = statsFor(p.uid, statsScope);
    html += '<div class="rank-row' + (p.uid === currentUser.uid ? ' me' : '') + '" onclick="progressUser=\'' + jsq(p.uid) + '\';setStatsTab(\'progress\')">' +
      '<span class="rank-no">' + (i + 1) + '</span>' + avatarHtml(p.uid, 32) +
      '<span class="rank-text"><b>' + getUserName(p.uid) + ' ' + levelBadgeHtml(playerLevel(p.uid), true) + _provTag(p.comp, RANK_MIN_MATCHES) + '</b>' +
      '<small>' + Math.round(p.rating) + ' \u00B7 ' + pct(sf.wins, sf.decided) + ' \u00B7 ' + fmtWL(sf.wins, sf.losses) + '</small></span>' + _rankTrend(st.rankChange.players[p.uid], p.rating, p.monthStart) + '</div>';
  });
  html += '</div>';
  return html;
}

/* ---------- Head-to-head: my record, by pair and by single ---------- */

/** All saved games with a winner that uid played (any mode), oldest first */
function _myGames(uid, fromIso) {
  return lastMatches.filter(function (m) {
    return m.teamA && m.teamB && (m.teamA.indexOf(uid) >= 0 || m.teamB.indexOf(uid) >= 0) && matchWinner(m) && (!fromIso || (m.date || "") >= fromIso);
  }).map(function (m) {
    var mineA = m.teamA.indexOf(uid) >= 0, sc = matchScore(m);
    return { m: m, won: (matchWinner(m) === "A") === mineA, pts: mineA ? sc.pts : -sc.pts,
      mine: mineA ? m.teamA : m.teamB, them: mineA ? m.teamB : m.teamA };
  });
}

function _h2hRows(groups, avatarsOf, nameOf) {
  var keys = Object.keys(groups).sort(function (a, b) { return groups[b].n - groups[a].n || groups[b].w - groups[a].w; });
  if (!keys.length) return '<div class="empty-state" style="padding:12px">' + t("h2hNone") + '</div>';
  return keys.map(function (k) {
    var g = groups[k], l = g.n - g.w, wr = Math.round(g.w / g.n * 100);
    return '<div class="rank-row h2h-row"><span class="rank-avatars">' + avatarsOf(k) + '</span>' +
      '<span class="rank-text"><b>' + nameOf(k) + '</b><small>' + g.n + ' ' + t("gamesWord") + ' \u00B7 ' + (g.pts >= 0 ? '+' : '') + g.pts + ' ' + t("ptsShort") + '</small></span>' +
      '<span class="h2h-rec ' + (g.w > l ? 'up' : g.w < l ? 'down' : '') + '"><b>' + g.w + '\u2013' + l + '</b><small>' + wr + '%</small></span></div>';
  }).join('');
}

var h2hUser = null;   // whose record the Head-to-head tab shows (me by default)

function _renderH2H() {
  var me = h2hUser || currentUser.uid;
  // Pick a player: everyone who has played a game
  var who = {};
  lastMatches.forEach(function (m) { (m.teamA || []).concat(m.teamB || []).forEach(function (u) { who[u] = true; }); });
  who[currentUser.uid] = true;
  var uids = Object.keys(who).sort(function (a, b) { return a === currentUser.uid ? -1 : b === currentUser.uid ? 1 : getUserName(a).localeCompare(getUserName(b)); });
  var picker = '<div class="card"><select class="form-select" id="h2hUser" onchange="h2hUser=this.value;renderStats()">' + uids.map(function (u) {
    return '<option value="' + u + '"' + (u === me ? ' selected' : '') + '>' + escapeHtml(plainUserName(findUser(u))) + (u === currentUser.uid ? ' (' + t("you") + ')' : '') + '</option>';
  }).join('') + '</select></div>';
  var games = _myGames(me);
  if (!games.length) return picker + '<div class="empty-state"><div class="empty-icon">' + icon("ranking", 44) + '</div><div>' + t("noMatchesYet") + '</div></div>';
  var vsPairs = {}, withPartner = {}, vsSingles = {}, tot = { n: 0, w: 0, pts: 0 };
  var add = function (map, k, x) { var g = map[k] || (map[k] = { n: 0, w: 0, pts: 0 }); g.n++; if (x.won) g.w++; g.pts += x.pts; };
  games.forEach(function (x) {
    tot.n++; if (x.won) tot.w++; tot.pts += x.pts;
    if (x.mine.length === 2 && x.them.length === 2) {
      add(vsPairs, pairKey(x.them), x);
      add(withPartner, x.mine.filter(function (u) { return u !== me; })[0], x);
    } else if (x.mine.length === 1 && x.them.length === 1) add(vsSingles, x.them[0], x);
  });
  var pairAv = function (k) { return pairUids(k).map(function (u) { return avatarHtml(u, 26); }).join(''); };
  var oneAv = function (u) { return avatarHtml(u, 30); };
  var oneName = function (u) { return escapeHtml(getUserName(u)); };
  var html = picker + '<div class="card h2h-total"><div class="h2h-total-who">' + avatarHtml(me, 30) + '<b>' + escapeHtml(getUserName(me)) + '</b></div><div class="h2h-score">' + tot.w + ' \u2013 ' + (tot.n - tot.w) + '</div>' +
    '<div class="h2h-facts">' + t(me === currentUser.uid ? "h2hMine" : "h2hTheirs").replace("{n}", tot.n) + ' \u00B7 ' + (tot.pts >= 0 ? '+' : '') + tot.pts + ' ' + t("ptsShort") + '</div></div>';
  html += '<div class="settings-section">' + t("h2hVsPairs") + '</div><div class="card rank-list">' + _h2hRows(vsPairs, pairAv, pairName) + '</div>';
  html += '<div class="settings-section">' + t(me === currentUser.uid ? "h2hWithPartner" : "h2hWithPartners") + '</div><div class="card rank-list">' + _h2hRows(withPartner, oneAv, oneName) + '</div>';
  html += '<div class="settings-section">' + t("h2hVsSingles") + '</div><div class="card rank-list">' + _h2hRows(vsSingles, oneAv, oneName) + '</div>';
  html += _pairVsPairHtml(me);
  return html;
}

/* ---------- Pair vs pair: pick two pairs, see their record against each other ---------- */

var h2hPairA = null, h2hPairB = null;

function _plainPair(key) { return pairUids(key).map(function (u) { return plainUserName(findUser(u)); }).join(" & "); }
function _disjoint(ka, kb) { var a = ka.split("+"); return kb.split("+").every(function (u) { return a.indexOf(u) < 0; }); }

function _pairVsPairHtml(me) {
  var ms = lastMatches.filter(function (m) { return m.teamA && m.teamB && m.teamA.length === 2 && m.teamB.length === 2 && matchWinner(m); });
  if (!ms.length) return '';
  var pairsSet = {}, meet = {};   // meet[ka][kb] = games
  ms.forEach(function (m) {
    var ka = pairKey(m.teamA), kb = pairKey(m.teamB);
    pairsSet[ka] = pairsSet[kb] = true;
    (meet[ka] = meet[ka] || {})[kb] = (meet[ka][kb] || 0) + 1;
    (meet[kb] = meet[kb] || {})[ka] = (meet[kb][ka] || 0) + 1;
  });
  var keys = Object.keys(pairsSet).sort(function (a, b) { return _plainPair(a).localeCompare(_plainPair(b)); });
  var games = function (k) { var n = 0; Object.keys(meet[k] || {}).forEach(function (o) { n += meet[k][o]; }); return n; };
  // Defaults: my most-played pair, then the pair it has met most
  if (!h2hPairA || !pairsSet[h2hPairA]) {
    var mine = keys.filter(function (k) { return k.split("+").indexOf(me) >= 0; });
    h2hPairA = (mine.length ? mine : keys).slice().sort(function (a, b) { return games(b) - games(a); })[0];
    h2hPairB = null;
  }
  var others = keys.filter(function (k) { return _disjoint(h2hPairA, k); });
  if (!h2hPairB || others.indexOf(h2hPairB) < 0) {
    h2hPairB = others.slice().sort(function (a, b) { return ((meet[h2hPairA] || {})[b] || 0) - ((meet[h2hPairA] || {})[a] || 0); })[0] || null;
  }
  var opts = function (list, sel) { return list.map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + escapeHtml(_plainPair(k)) + '</option>'; }).join(''); };
  var html = '<div class="settings-section">' + t("h2hPairVsPair") + '</div><div class="card pvp-card">' +
    '<select class="form-select" onchange="h2hPairA=this.value;h2hPairB=null;renderStats()">' + opts(keys, h2hPairA) + '</select>' +
    '<div class="pvp-vs">' + t("vsWord") + '</div>' +
    '<select class="form-select" onchange="h2hPairB=this.value;renderStats()">' + opts(others, h2hPairB) + '</select>';
  if (!h2hPairB) return html + '<div class="form-hint" style="margin-top:10px">' + t("pvpNoOpponent") + '</div></div>';
  var rows = [], wa = 0, wb = 0, pts = 0;
  ms.forEach(function (m) {
    var ka = pairKey(m.teamA), kb = pairKey(m.teamB), aIsA = ka === h2hPairA;
    if (!((ka === h2hPairA && kb === h2hPairB) || (ka === h2hPairB && kb === h2hPairA))) return;
    var sc = matchScore(m), g = (m.games || [])[0] || {}, aWon = (matchWinner(m) === "A") === aIsA;
    if (aWon) wa++; else wb++;
    pts += aIsA ? sc.pts : -sc.pts;
    rows.push({ date: m.date || "", a: aIsA ? g.a : g.b, b: aIsA ? g.b : g.a, aWon: aWon });
  });
  var av = function (k) { return pairUids(k).map(function (u) { return avatarHtml(u, 26); }).join(''); };
  html += '<div class="pvp-score"><span class="pvp-side">' + av(h2hPairA) + '</span><b>' + wa + ' \u2013 ' + wb + '</b><span class="pvp-side">' + av(h2hPairB) + '</span></div>';
  if (!rows.length) return html + '<div class="form-hint" style="text-align:center">' + t("pvpNeverMet") + '</div></div>';
  html += '<div class="h2h-facts" style="text-align:center">' + rows.length + ' ' + t("gamesWord") + ' \u00B7 ' + (pts >= 0 ? '+' : '') + pts + ' ' + t("ptsShort") + '</div>';
  rows.sort(function (x, y) { return y.date.localeCompare(x.date); });
  html += '<div class="pvp-list">' + rows.map(function (r) {
    return '<div class="pvp-game"><span class="pvp-date">' + (r.date ? fmtDate(r.date) : '') + '</span>' +
      '<span class="pvp-pts ' + (r.aWon ? 'won' : 'lost') + '">' + (r.a != null ? r.a : '\u2013') + ' \u2013 ' + (r.b != null ? r.b : '\u2013') + '</span></div>';
  }).join('') + '</div></div>';
  return html;
}

/* ---------- Progress over a period (1 month, quarter, 6 months, year) ---------- */

function setProgressPeriod(p) { setStatsScope(p === "1m" ? "month" : p); }

function _periodStart(months) {
  var d = new Date(_todayIso() + "T00:00:00");
  d.setMonth(d.getMonth() - months);
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

/** Monday of the week of an ISO date */
function _weekKey(iso) {
  var d = new Date(iso + "T00:00:00"), dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

function _renderProgress() {
  var st = computeStats();
  var uid = progressUser || currentUser.uid;
  var uids = Object.keys(st.players);
  if (uids.indexOf(uid) < 0) uids.unshift(uid);
  var from = scopeFrom(statsScope);
  var html = '<div class="card"><select class="form-select" onchange="progressUser=this.value;renderStats()">' + uids.map(function (u) {
    return '<option value="' + u + '"' + (u === uid ? ' selected' : '') + '>' + escapeHtml(plainUserName(findUser(u))) + '</option>';
  }).join('') + '</select>' +
    scopeChipsHtml() + '</div>';
  var p = st.players[uid];
  var games = _myGames(uid, from);
  var all = lastMatches.filter(function (m) { return m.teamA && m.teamB && (m.teamA.indexOf(uid) >= 0 || m.teamB.indexOf(uid) >= 0) && (!from || (m.date || "") >= from); });
  if (!p || !all.length) return html + '<div class="empty-state"><div class="empty-icon">' + icon("chart", 44) + '</div><div>' + t("noGamesInPeriod") + '</div></div>';
  // Rating: where it stood when the period began, then after each game in it
  var hist = p.history || [], startR = RATING_START;
  hist.forEach(function (h) { if ((h.at || "") < from) startR = h.r; });
  var inP = hist.filter(function (h) { return (h.at || "") >= from; });
  var endR = inP.length ? inP[inP.length - 1].r : startR;
  var sfp = statsFor(uid, statsScope);
  var w = games.filter(function (x) { return x.won; }).length, l = games.length - w;
  var mins = all.reduce(function (s, m) { return s + (m.minutes || 0); }, 0);
  var pts = games.reduce(function (s, x) { return s + x.pts; }, 0);
  html += '<div class="card"><div class="progress-head"><div><div class="form-hint" style="margin:0">' + t("ratingWord") + '</div><b class="progress-rating">' + Math.round(endR) + '</b> ' + _trend(endR, startR) + '</div>' +
    '<div class="progress-wl"><b>' + fmtWL(w, l) + '</b><small>' + (games.length ? Math.round(w / games.length * 100) : 0) + '% ' + t("winRate") + '</small></div></div>' +
    _sparkline([startR].concat(inP.map(function (h) { return h.r; })), { start: t("startWord") + ' ' + Math.round(startR), games: inP.length }) + '</div>';
  html += '<div class="card"><div class="my-stats-facts">' +
    '<span><b>' + all.length + '</b> ' + t("gamesWord") + '</span><span><b>' + mins + '</b> ' + t("minShort") + '</span>' +
    '<span><b>' + (games.length ? (pts / games.length >= 0 ? '+' : '') + (pts / games.length).toFixed(1) : '0') + '</b> ' + t("ptsPerGame") + '</span>' +
    '<span>' + t("streak") + ' <b>' + (sfp.streakNow > 0 ? sfp.streakNow + t("winShort") : sfp.streakNow < 0 ? (-sfp.streakNow) + t("lossShort") : '\u2013') + '</b></span></div></div>';
  html += _pairInsightsHtml(uid, games);
  // Breakdown: by week for one month, by month otherwise
  var byWeek = statsScope === "month", buckets = {};
  all.forEach(function (m) {
    var k = byWeek ? _weekKey(m.date) : _monthKey(m.date);
    var b = buckets[k] || (buckets[k] = { n: 0, w: 0, l: 0, min: 0 });
    b.n++; b.min += m.minutes || 0;
  });
  games.forEach(function (x) { var k = byWeek ? _weekKey(x.m.date) : _monthKey(x.m.date); if (x.won) buckets[k].w++; else buckets[k].l++; });
  var r = startR;
  html += '<div class="settings-section">' + t(byWeek ? "byWeek" : "byMonth") + '</div><div class="card rank-list">';
  Object.keys(buckets).sort().forEach(function (k) {
    var b = buckets[k], prev = r;
    inP.forEach(function (h) { var hk = byWeek ? _weekKey(h.at) : _monthKey(h.at); if (hk === k) r = h.r; });
    var label = byWeek ? t("weekOf").replace("{d}", fmtDate(k)) : monthYear(parseInt(k.slice(0, 4), 10), parseInt(k.slice(5, 7), 10) - 1);
    html += '<div class="rank-row"><span class="rank-text"><b>' + label + '</b><small>' + b.n + ' ' + t("gamesWord") + ' \u00B7 ' + fmtWL(b.w, b.l) +
      (b.w + b.l ? ' \u00B7 ' + pct(b.w, b.w + b.l) : '') + (b.min ? ' \u00B7 ' + b.min + ' ' + t("minShort") : '') + '</small></span>' +
      '<span class="rank-rating">' + Math.round(r) + ' ' + _trend(r, prev) + '</span></div>';
  });
  html += '</div>';
  return html;
}

/* ---------- Tips: one script per case, several wordings each ----------
   Each case (best partner, hard rival, close games …) has TIP_COUNT[case] wordings in i18n as tip_<case>_<n>.
   The wording shown changes with the player's games (so it is not the same sentence every time) but stays the same
   while nothing changes. Rules: one tip per person, one per case, the same sentence never twice, at most 4, and a
   partner who is also the hardest rival gets ONE combined tip. Tips never repeat the numbers of the cards above them. */
var TIP_COUNT = { best: 4, worst: 4, both: 3, rival: 4, easy: 3, close: 3, blowout: 3, rest: 3, streak: 3, great: 3, few: 2, mix: 3, gen: 8 };
var TIP_MAX = 4;

function _tipSeed(uid, games) {
  var last = games.length ? games[games.length - 1].m : null;
  var str = uid + "|" + games.length + "|" + (last ? (last.id || last.date || "") : ""), h = 0;
  for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
/** The wording of a case for this seed; `salt` makes two cases pick different positions */
function _tipText(kind, seed, salt, name) {
  var n = TIP_COUNT[kind], i = (seed + salt * 7) % n;
  return t("tip_" + kind + "_" + (i + 1)).replace("{name}", name ? escapeHtml(getUserName(name)) : "");
}

function _pairTips(uid, games, best, worst, hard, rate, rivals, partner) {
  var seed = _tipSeed(uid, games), cands = [], salt = 0;
  var add = function (kind, p, person, group) { cands.push({ kind: kind, p: p, uid: person || null, group: group || kind, text: _tipText(kind, seed, ++salt, person) }); };
  var w = games.filter(function (x) { return x.won; }).length;
  var avg = games.reduce(function (s, x) { return s + x.pts; }, 0) / games.length;
  var lossRun = 0; for (var i = games.length - 1; i >= 0 && !games[i].won; i--) lossRun++;
  var winRun = 0; for (var j = games.length - 1; j >= 0 && games[j].won; j--) winRun++;

  if (worst && hard && worst.uid === hard.uid) add("both", 1, worst.uid);   // same person is the worst partner AND the hardest rival: one tip
  else {
    if (worst) add("worst", 1, worst.uid);
    if (hard) add("rival", 2, hard.uid);
  }
  if (best && rate(best) >= 0.5) add("best", 3, best.uid);
  var easy = rivals.filter(function (x) { return x.n >= 3 && rate(x) >= 0.75; }).sort(function (a, b) { return rate(b) - rate(a) || b.n - a.n; })[0];
  if (easy) add("easy", 5, easy.uid);
  if (lossRun >= 2) add("rest", 1);
  else if (winRun >= 3) add("streak", 4);
  if (games.length >= 3 && avg <= -5) add("blowout", 3);
  else if (games.length >= 3 && avg < 0) add("close", 4);
  if (games.length >= 5 && w / games.length >= 0.7) add("great", 4);
  if (!best) add(games.length < 3 ? "few" : "mix", 5);

  // One per case, one per person, no repeated sentence; the most useful first
  var out = [], usedKind = {}, usedUid = {}, usedText = {};
  cands.sort(function (a, b) { return a.p - b.p; }).forEach(function (c) {
    if (out.length >= TIP_MAX || usedKind[c.group] || (c.uid && usedUid[c.uid]) || usedText[c.text]) return;
    usedKind[c.group] = usedUid[c.uid || ""] = usedText[c.text] = true;
    out.push(c.text);
  });
  // Too few tips: top up with general ones (a different one each, never twice)
  var g = 0;
  while (out.length < 3 && g < TIP_COUNT.gen) {
    var tx = t("tip_gen_" + (((seed + out.length * 3 + g) % TIP_COUNT.gen) + 1));
    g++;
    if (!usedText[tx]) { usedText[tx] = true; out.push(tx); }
  }
  return out;
}

/** Best / worst pair (partners) of a player in the period, and gentle tips from the numbers */
var INSIGHT_MIN_GAMES = 2;      // for rivals only; partners use MIN_PARTNER_GAMES (stats-core.js)
function _pairInsightsHtml(uid, games) {
  if (!games.length) return '';
  var rival = {};
  games.forEach(function (g) {
    g.them.forEach(function (u) { var x = rival[u] || (rival[u] = { uid: u, n: 0, w: 0 }); x.n++; if (g.won) x.w++; });
  });
  var rate = function (x) { return x.w / x.n; };
  var list = function (o) { return Object.keys(o).map(function (k) { return o[k]; }).filter(function (x) { return x.n >= INSIGHT_MIN_GAMES; }); };
  var best = bestPartnerOf(uid, statsScope), worst = worstPartnerOf(uid, statsScope);   // the same answer the Rankings card gives
  var hard = list(rival).sort(function (a, b) { return rate(a) - rate(b) || b.n - a.n; })[0];
  if (hard && rate(hard) >= 0.5) hard = null;
  var row = function (x, cls, label) {
    return '<div class="ins-row ' + cls + '"><span class="rank-avatars">' + avatarHtml(uid, 28) + avatarHtml(x.uid, 28) + '</span>' +
      '<span class="rank-text"><small>' + label + '</small><b>' + escapeHtml(getUserName(uid)) + ' &amp; ' + escapeHtml(getUserName(x.uid)) + '</b>' +
      '<small>' + fmtWL(x.w, x.l) + ' · ' + pct(x.w, x.n) + '</small></span></div>';
  };
  var html = '<div class="card ins-card"><div class="card-title">' + icon("users", 14) + ' ' + t("bestWorstPair") + '</div>';
  if (!best) html += '<div class="form-hint">' + t("bestPartnerNone").replace("{n}", MIN_PARTNER_GAMES) + '</div>';
  else html += row(best, "good", t("bestPartner")) + (worst ? row(worst, "low", t("worstPartner")) : '');

  // Gentle tips: a script per case, several wordings each, never the same person or sentence twice, no numbers (the cards above show them)
  var tips = _pairTips(uid, games, best, worst, hard, rate, list(rival), null);
  html += '<div class="ins-tips-title">' + icon("chart", 13) + ' ' + t("insTipsTitle") + '</div><ul class="ins-tips">' +
    tips.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>';
  return html;
}

/** Small line chart (SVG) of numbers. With opts, the first value is the hollow "Start" dot and the rest are games */
function _sparkline(vals, opts) {
  if (vals.length < 2) return '<div class="form-hint">' + t("needMoreMonths") + '</div>';
  var w = 300, h = 70, lo = Math.min.apply(null, vals) - 10, hi = Math.max.apply(null, vals) + 10;
  var pts = vals.map(function (v, i) { return (i * w / (vals.length - 1)).toFixed(1) + "," + (h - (v - lo) / (hi - lo) * h).toFixed(1); });
  return '<svg class="sparkline" viewBox="-6 -6 ' + (w + 12) + ' ' + (h + 12) + '" preserveAspectRatio="none"><polyline points="' + pts.join(" ") + '"/>' +
    pts.map(function (p, i) { var xy = p.split(","); return '<circle' + (opts && i === 0 ? ' class="start"' : '') + ' cx="' + xy[0] + '" cy="' + xy[1] + '" r="3"/>'; }).join('') + '</svg>' +
    (opts ? '<div class="spark-legend"><span><i class="sk-dot start"></i>' + escapeHtml(opts.start) + '</span>' +
      '<span><i class="sk-dot"></i>' + t("gamesDots").replace("{n}", opts.games) + '</span></div>' : '');
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

/** Players of a team ordered by display name (A→Z), so a pair always reads the same way */
function byNameAZ(team) {
  var nm = function (u) { return String(getUserName(u)).toLowerCase(); };
  return (team || []).slice().sort(function (a, b) { return nm(a).localeCompare(nm(b)) || (a < b ? -1 : 1); });
}
function _teamName(team, side) {
  return team.length ? byNameAZ(team).map(function (u) { return escapeHtml(getUserName(u)); }).join(" &amp; ") : t("team") + " " + side;
}

/** Shortcut button (Session tab): open the Games tab at the add-game form */
function quickAddGame() {
  if (currentSession && !_canAddGames(currentSession)) return;
  setSessionTab("games");
  setTimeout(function () {
    var box = document.getElementById("gameFormBox");
    if (box && box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 60);
}

/** The whole Games tab: add-game form + the list */
function sessionGamesTabHtml(s) {
  if (!gameForm || gameForm.sessionId !== s.id) gameForm = _blankGameForm(s);
  var mode = s.mode || "competition";
  var html = '<div class="games-mode"><span class="tag mode-' + cssId(mode) + '">' + t("mode_" + mode) + '</span><span class="form-hint">' + t("modeHint_" + mode) + '</span></div>';
  if (_canAddGames(s) && sessionStep(s) < 3) html += '<button type="button" class="live-launch" onclick="showLiveScore(\'' + jsq(s.id) + '\')">' + icon("scoreboard", 22) + '<span><b>' + t("lsTitle") + '</b><small>' + t("lsRule4") + '</small></span>' + icon("chevron", 18) + '</button>';
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
        return '<div class="chip avatar-chip' + (on ? ' active' : '') + (taken ? ' disabled' : '') + '"' + (taken ? '' : ' onclick="gameFormPick(\'' + side + '\',\'' + jsq(u) + '\')"') + '>' + avatarHtml(u, 20) + escapeHtml(getUserName(u)) + '</div>';
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
    ? fsdb.collection("matches").doc(f.id).update(Object.assign(data, { updatedBy: currentUser.uid, updatedAt: Date.now() }))
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

/** Summary card: total games in this session + how many games each player played */
function _gamesSummaryHtml(list) {
  if (!list.length) return '';
  var count = {}, max = 0;
  list.forEach(function (m) {
    (m.teamA || []).concat(m.teamB || []).forEach(function (u) { count[u] = (count[u] || 0) + 1; });
  });
  var rows = Object.keys(count).map(function (u) { if (count[u] > max) max = count[u]; return { uid: u, n: count[u], name: getUserName(u) }; });
  rows.sort(function (a, b) { return b.n - a.n || String(a.name).localeCompare(String(b.name)); });
  var html = '<div class="card games-summary"><div class="card-title">' + icon("ranking", 14) + ' ' + t("gamesSummary") + '</div>' +
    '<div class="gs-total"><b>' + list.length + '</b> ' + t("gamesWord") + ' \u00B7 ' + rows.length + ' ' + t("playersWord") + '</div>';
  rows.forEach(function (r) {
    html += '<div class="gs-row"><span class="gs-name">' + escapeHtml(r.name) + '</span>' +
      '<span class="gs-bar"><i style="width:' + Math.round(r.n / max * 100) + '%"></i></span>' +
      '<span class="gs-n">' + r.n + '</span></div>';
  });
  return html + '</div>';
}

function _gamesListHtml(s) {
  var list = sessionMatches(s.id);
  var html = _gamesSummaryHtml(list) + '<div class="settings-section">' + t("gamesTitle") + ' (' + list.length + ')</div>';
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
  var more = (m.games || []).slice(1).map(function (x) { return escapeHtml(x.a) + '–' + escapeHtml(x.b); }).join(', ');
  var html = '<div class="card match-row">';
  html += '<div class="match-head"><b>' + (no ? t("gameN").replace("{n}", no) : '') + '</b>' +
    '<span class="match-meta">' + t("gameType_" + (m.type || "md")) + (m.minutes ? ' · ' + escapeHtml(m.minutes) + ' ' + t("minShort") : '') + '</span>' +
    (canEdit ? '<span class="match-actions"><button class="edit-btn" aria-label="' + t("edit") + '" onclick="editGame(\'' + jsq(m.id) + '\')">' + icon("pen", 14) + '</button>' +
      '<button class="delete-btn" aria-label="' + t("delete") + '" onclick="deleteMatch(\'' + jsq(m.id) + '\')">' + icon("trash", 14) + '</button></span>' : '') + '</div>';
  html += '<div class="match-score-row"><div class="ms-side' + (w === "A" ? ' win' : '') + '"><div class="ms-names">' + (m.teamA && m.teamA.length ? teamHtml(m.teamA, 24) : _teamName([], "A")) + '</div><div class="ms-pts">' + (g.a != null ? escapeHtml(g.a) : '–') + '</div></div>' +
    '<div class="ms-vs">–</div>' +
    '<div class="ms-side' + (w === "B" ? ' win' : '') + '"><div class="ms-names">' + (m.teamB && m.teamB.length ? teamHtml(m.teamB, 24) : _teamName([], "B")) + '</div><div class="ms-pts">' + (g.b != null ? escapeHtml(g.b) : '–') + '</div></div></div>';
  if (more) html += '<div class="form-hint" style="text-align:center">' + more + '</div>';
  // Who saved it, and who changed it last
  // Counted with Live score: show the scorekeeper (photo + name); otherwise who added it
  html += '<div class="match-by">' + (m.live ? '<span class="match-by-lbl">' + t("countedBy") + '</span> ' + personHtml(m.createdBy, 20) : t("addedBy").replace("{name}", escapeHtml(getUserName(m.createdBy)))) + (m.createdAt ? ' ' + _whenShort(m.createdAt) : '') +
    (m.updatedBy ? ' \u00B7 ' + t("editedBy").replace("{name}", escapeHtml(getUserName(m.updatedBy))) + (m.updatedAt ? ' ' + _whenShort(m.updatedAt) : '') : '') + '</div>';
  return html + '</div>';
}

/** "18:42" today, else "8 Oct 18:42" */
function _whenShort(ms) {
  var d = new Date(ms), now = new Date();
  var hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  return d.toDateString() === now.toDateString() ? hm : fmtDate(d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2)) + " " + hm;
}

function deleteMatch(id) {
  askYes(t("deleteMatchConfirm"), function () {
    fsdb.collection("matches").doc(id).delete().then(function () { showToast(t("delete") + " ✔"); })
      .catch(function (e) { showToast(_permError(e)); });
  }, { danger: true, yes: t("delete") });
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


/* ---------- Badges ---------- */
var BADGES = [
  { key: "first", icon: "shuttle", need: 1, val: function (p) { return p.played; } },
  { key: "m50", icon: "medal", need: 50, val: function (p) { return p.played; } },
  { key: "m100", icon: "crown", need: 100, val: function (p) { return p.played; } },
  { key: "streak5", icon: "chart", need: 5, val: function (p) { return p.maxStreak || 0; } },
  { key: "streak10", icon: "ranking", need: 10, val: function (p) { return p.maxStreak || 0; } },
  { key: "courts5", icon: "court", need: 5, val: function (p) { return _courtsPlayed(p.uid); } },
  { key: "min1000", icon: "clock", need: 1000, val: function (p) { return p.minutes; } },
  { key: "scorer", icon: "scoreboard", need: 50, val: function (p) { return _gamesCounted(p.uid); } }
];

function _courtsPlayed(uid) {
  var seen = {};
  (lastSessions || []).forEach(function (s) { if ((s.players || []).indexOf(uid) >= 0 && s.courtId) seen[s.courtId] = true; });
  return Object.keys(seen).length;
}

/** Games this player added: counted with Live score or typed in (the person who created the game) */
function _gamesCounted(uid) {
  return (lastMatches || []).filter(function (m) { return m.createdBy === uid; }).length;
}

function badgesFor(uid) {
  var p = computeStats().players[uid] || { uid: uid, played: 0, minutes: 0, maxStreak: 0 };
  return BADGES.map(function (b) { var v = b.val(p); return { key: b.key, icon: b.icon, earned: v >= b.need, value: Math.min(v, b.need), need: b.need }; });
}

function badgesHtml(uid, showLocked) {
  if (!GROUPS_ON) return "";
  var list = badgesFor(uid).filter(function (b) { return showLocked || b.earned; });
  if (!list.length) return "";
  var got = list.filter(function (b) { return b.earned; }).length;
  var html = '<div class="card badges-card"><div class="badges-head"><div class="card-title" style="margin:0">' + icon("medal", 14) + ' ' + t("badges") +
    ' <span class="badges-count">' + got + '/' + list.length + '</span></div>' +
'' + '</div><div class="badge-grid">';
  list.forEach(function (b) {
    var pct = b.earned ? 100 : Math.min(100, Math.round((b.value || 0) / b.need * 100));
    html += '<div class="badge-item' + (b.earned ? ' earned' : '') + '" title="' + escapeHtml(t("badgeDesc_" + b.key)) + '">' +
      '<span class="badge-icon">' + icon(b.icon, 20) + '</span>' +
      '<span class="badge-name">' + t("badge_" + b.key) + '</span>' +
      '<span class="badge-bar"><i style="width:' + pct + '%"></i></span>' +
      '<small class="badge-val">' + (b.earned ? '\u2714' : (b.need > 1 ? b.value + '/' + b.need : '\u2013')) + '</small></div>';
  });
  return html + '</div></div>';
}

/* ---------- Monthly recap card (an image to share) ---------- */
function _roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
