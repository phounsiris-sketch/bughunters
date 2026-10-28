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

var lastMatches = [];         // the saved matches plus the games of session tournaments (v228), oldest first
var _matchesReal = [];        // only what is saved in matches/
var _matchesUnsub = null;
var statsTab = "ranking";     // ranking | h2h | hof (v257: Progress is a sheet opened from the Ranking hero, see openProgress)
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
    _matchesReal = list.sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")) || ((a.createdAt || 0) - (b.createdAt || 0)); });
    rebuildMatches();
    if (/^(stats|matches|matches-all|dashboard|user|home)$/.test(currentPage)) refreshCurrentPage("matches");   // the Home badge count follows the games (not Settings or forms: a re-render would wipe typing)
    if (currentPage === "session-detail") { refreshSessionGames(); var tn = document.getElementById("sessionTabGamesN"); if (tn && currentSession) tn.textContent = sessionMatches(currentSession.id).length; }
    if (typeof updateNotifications === "function") updateNotifications();
  }, function (e) { dbOnError(e, "matches"); });
}

/** Saved matches + the real games of every session tournament (walkovers left out), counted once. Everything reads lastMatches. */
function rebuildMatches() {
  lastMatches = typeof tourMergeMatches === "function" ? tourMergeMatches(_matchesReal, typeof lastSessions !== "undefined" ? lastSessions : [], typeof currentGroupId !== "undefined" ? currentGroupId : "") : _matchesReal;
  _statsCache = null;
}

function stopMatches() {
  if (typeof hofStop === "function") hofStop();
  if (_matchesUnsub) _matchesUnsub();
  _matchesUnsub = null;
  _matchesReal = [];
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
        p.history.push({ at: m.date, r: p.rating, d: d, mm: m });   // d = this game's rating change, mm = the match (v247: All my matches)
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

/** The rating to show: a dash until the player has a counted game (same as the Rankings hero), never a made-up 1500 */
function ratingText(uid) {
  var p = computeStats().players[uid];
  return p && p.comp ? String(Math.round(p.rating)) : "\u2013";
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
    '<div class="dashboard-tabs stats-tabs" role="tablist">' + [["ranking", "statsRanking", "ranking"], ["h2h", "headToHead", "users"], ["hof", "hofTab", "trophy"]].map(function (x) {
    return '<button role="tab" class="dash-tab' + (statsTab === x[0] ? ' active' : '') + '" onclick="setStatsTab(\'' + x[0] + '\')">' + icon(x[2], 14) + ' ' + t(x[1]) + '</button>';
  }).join('') + '</div>';
  var note = '<div class="private-note">' + icon("lock", 12) + ' ' + t("statsPrivate").replace("{group}", escapeHtml(currentGroup ? currentGroup.name : "")) + '</div>';
  var body = statsTab === "h2h" ? _renderH2H() : statsTab === "hof" && typeof hofHtml === "function" ? hofHtml() : _renderRanking();
  box.innerHTML = tabs + note + body;
  uiMotion(box, statsTab + "|" + statsScope);
  if (document.getElementById("pgSheet")) _progRefresh();   // the period chips inside the progress sheet call setStatsScope
}

function _trend(now, start) {
  if (start === null || start === undefined) return '';
  var d = Math.round(now - start);
  if (!d) return '<span class="trend">\u2013</span>';
  return '<span class="trend ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(d) + '</span>';
}

/** v247: ONE change marker on a row or the hero: the rating change since the start of the month (a dash when nothing yet) */
function _rankTrend(now, start) {
  var tr = start === null || start === undefined ? '<span class="trend">\u2013</span>' : _trend(now, start);
  return '<span class="rk-side" title="' + escapeHtml(t("ratingMonthHint")) + '">' + tr + '</span>';
}

/** "3/10 games" while a rating is still settling (the hero rating only; list rows are faded instead) */
function _provTag(n, min) { return n < min ? ' <span class="tag prov-tag" title="' + escapeHtml(t("provisionalHint")) + '">' + t("provisionalN").replace("{n}", n).replace("{min}", min) + '</span>' : ''; }

function _wl(w, l) { return fmtWL(w, l); }

function _myStatsCard() {
  var me = currentUser.uid, st = computeStats(), p = st.players[me];
  var lvl = playerLevel(me), sf = statsFor(me, statsScope), rk = rankOf(me, statsScope);
  var html = '<div class="card my-hero">';
  // Who I am, my place and my rating (the one big number)
  html += '<div class="mh-top">' + avatarHtml(me, 56) + '<div class="mh-id"><div class="mh-name"><span class="mh-nm">' + getUserName(me) + '</span></div>' +
    '<div class="mh-sub">' + (lvl ? levelBadgeHtml(lvl, true) : '') + (rk ? '<b class="mh-rank">#' + rk + '</b> ' + _rankTrend(p.rating, p.monthStart) : t("notRankedYet")) + '</div></div>' +
    '<div class="mh-acts">' + _badgeBtnHtml(me) + '<button class="how-btn" aria-label="' + t("shareMyCard") + '" title="' + t("shareMyCard") + '" onclick="openShareCard()">' + icon("shareOut", 14) + '</button>' +
    '<button class="how-btn" aria-label="' + t("howRankingWorks") + '" onclick="showRankingHelp()">?</button></div>' +
    '<div class="mh-rate"><small>' + t("homeRating") + '</small><b>' + (p && p.comp ? Math.round(p.rating) : '\u2013') + '</b>' + (p && p.comp ? _provTag(p.comp, RANK_MIN_MATCHES) : '') + '</div></div>';
  html += '<div class="mh-scope">' + scopeChipsHtml() + '</div>';
  // Facts for the chosen period: icon + number chips (the words are in the tooltip)
  var progressBtn = '<button class="mh-go" aria-label="' + escapeHtml(t("seeMyProgress")) + '" title="' + escapeHtml(t("seeMyProgress")) + '" onclick="openProgress(currentUser.uid, this)">' + icon("chart", 18) + '</button>';
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
    html += '<div class="mh-trend mh-open" role="button" tabindex="0" aria-label="' + escapeHtml(t("seeMyProgress")) + '" onclick="openProgress(currentUser.uid, this)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openProgress(currentUser.uid, this)}">' + _sparkline(tr.vals) +
      '<div class="mh-tl"><span>' + t("startWord") + ' <b>' + tr.start + '</b></span><span>' + t("homeBest") + ' <b>' + tr.peak + '</b></span><span>' + t("nowWord") + ' <b>' + tr.end + '</b>' +
      (tr.delta ? ' <em class="' + (tr.delta > 0 ? 'up' : 'down') + '">' + (tr.delta > 0 ? '\u25B2 +' : '\u25BC ') + tr.delta + '</em>' : '') + '</span></div></div>';
  }
  // My last 5 results (chips only) + the link to the full list of my games (v247)
  var last = formStrip(me, 5);
  if (last.length) {
    html += '<div class="form-strip" title="' + escapeHtml(t("lastNGames").replace("{n}", last.length)) + '">' +
      last.map(function (x) { return '<span class="wl ' + (x.won ? 'w' : 'l') + '">' + (x.won ? t("winShort") : t("lossShort")) + '</span>'; }).join('') +
      '<button type="button" class="mh-all" onclick="openMatchesAll(\'\')">' + t("allMyMatches") + ' ' + icon("chevron", 12) + '</button></div>';
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

/** Best score (biggest win margin) for the period. v247: the "top pair" row went (it is row 1 of Pair rank) */
function _highlightsHtml(st, scope) {
  var bs = null;
  st.h2h.forEach(function (x) {
    if (scopeFrom(scope) && (x.m.date || "") < scopeFrom(scope)) return;
    var g0 = (x.m.games || [])[0] || {}, margin = Math.abs((g0.a || 0) - (g0.b || 0));   // the margin of the game that is shown
    if (!bs || margin > bs.margin || (margin === bs.margin && (x.m.date || "") > (bs.x.m.date || ""))) bs = { x: x, margin: margin };
  });
  if (!bs) return '';
  var m = bs.x.m, g = (m.games || [])[0] || {}, aWon = bs.x.w === "A";
  var win = aWon ? m.teamA : m.teamB, lose = aWon ? m.teamB : m.teamA;
  var hi = Math.max(g.a || 0, g.b || 0), lo = Math.min(g.a || 0, g.b || 0);
  var names = function (team) { return byNameAZ(team).map(function (u) { return escapeHtml(getUserName(u)); }).join(" &amp; "); };
  return '<div class="card hl-card"><div class="hl-row"><span class="hl-ico">' + icon("chart", 16) + '</span>' +
    '<span class="rank-text"><small>' + t("bestScore") + (m.date ? ' · ' + fmtDate(m.date) : '') + '</small><b>' + names(win) + ' ' + hi + '–' + lo + '</b>' +
    '<small>' + t("vsWord") + ' ' + names(lose) + ' · +' + bs.margin + '</small></span></div></div>';
}

/* ---------- Pair rank / Player rank lists (v247: top 3 + last 3, "See all" in Head-to-head) ---------- */
var RANK_FULL_MAX = 10;  // a list this short is shown in full (v248: up to 10 rows)

/** Which rows of a ranked list of n rows to show: everything when short, else the top 3 and the last 3.
    A row of mine in the hidden middle (meIdx) stays visible between them. Items: { i: index } or { gap: hiddenCount }. */
function rankSliceIdx(n, meIdx) {
  var out = [], i;
  if (n <= RANK_FULL_MAX) { for (i = 0; i < n; i++) out.push({ i: i }); return out; }
  for (i = 0; i < 3; i++) out.push({ i: i });
  var mid = meIdx >= 3 && meIdx < n - 3 ? meIdx : -1;
  var before = (mid >= 0 ? mid : n - 3) - 3;
  if (before > 0) out.push({ gap: before });
  if (mid >= 0) {
    out.push({ i: mid });
    var after = n - 3 - mid - 1;
    if (after > 0) out.push({ gap: after });
  }
  for (i = n - 3; i < n; i++) out.push({ i: i });
  return out;
}

/** Both lists for the chosen scope, built once per render */
function _rankLists() {
  var st = computeStats(), recs = pairRecordsFor(statsScope), all = statsScope === "all";
  var pairs = Object.keys(st.pairs).map(function (k) { return st.pairs[k]; })
    .filter(function (p) { return p.comp > 0 && (all || recs[p.key]); })
    .sort(function (a, b) { return (b.rating - a.rating) || (b.comp - a.comp); });
  return { st: st, recs: recs, all: all, pairs: pairs, ranked: rankedFor(statsScope) };
}

function _pairRowHtml(L, p, i) {
  var us = pairUids(p.key), r = L.all ? { w: p.wins, l: p.losses } : L.recs[p.key];
  return '<div class="rank-row' + (us.indexOf(currentUser.uid) >= 0 ? ' me' : '') + (p.comp < PAIR_MIN_MATCHES ? ' prov' : '') + '" data-k="' + escapeHtml(p.key) + '" onclick="statsPairGo(this.getAttribute(\'data-k\'))">' +
    '<span class="rank-no">' + (i + 1) + '</span><span class="rank-avatars">' + avatarHtml(us[0], 30) + avatarHtml(us[1], 30) + '</span>' +
    '<span class="rank-text"><b>' + pairName(p.key) + '</b><small>' + Math.round(p.rating) + ' \u00B7 ' +
    _wl(r.w, r.l) + '</small></span>' + _rankTrend(p.rating, p.monthStart) + '</div>';
}

function _playerRowHtml(L, p, i) {
  var sf = statsFor(p.uid, statsScope);
  return '<div class="rank-row' + (p.uid === currentUser.uid ? ' me' : '') + (p.comp < RANK_MIN_MATCHES ? ' prov' : '') + '" role="button" tabindex="0" onclick="openProgress(\'' + jsq(p.uid) + '\', this)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openProgress(\'' + jsq(p.uid) + '\', this)}">' +
    '<span class="rank-no">' + (i + 1) + '</span>' + avatarHtml(p.uid, 32) +
    '<span class="rank-text"><b>' + getUserName(p.uid) + ' ' + levelBadgeHtml(playerLevel(p.uid), true) + '</b>' +
    '<small>' + Math.round(p.rating) + ' \u00B7 ' + pct(sf.wins, sf.decided) + ' \u00B7 ' + fmtWL(sf.wins, sf.losses) + '</small></span>' + _rankTrend(p.rating, p.monthStart) + '</div>';
}

/** Rows (short form unless `full`), the "faded" note when a row is faded, and the "See all" button under a short list */
function _rankListHtml(list, rowFn, isMine, isProv, min, kind, full) {
  var meIdx = -1;
  for (var k = 0; k < list.length; k++) if (isMine(list[k])) { meIdx = k; break; }
  var items = full ? list.map(function (x, i) { return { i: i }; }) : rankSliceIdx(list.length, meIdx), html = '';
  items.forEach(function (it) {
    html += it.gap ? '<div class="rank-gap" aria-hidden="true">\u00B7 \u00B7 \u00B7 ' + t("rankMore").replace("{n}", it.gap) + ' \u00B7 \u00B7 \u00B7</div>' : rowFn(list[it.i], it.i);
  });
  if (list.some(isProv)) html += '<div class="form-hint rank-note">' + t("provFadedNote").replace("{min}", min) + '</div>';
  if (list.length > RANK_FULL_MAX) html += '<button type="button" class="rank-see" aria-expanded="' + !!full + '" onclick="statsSeeAll(\'' + kind + '\')">' + (full ? t("seeLess") : t("seeAllN").replace("{n}", list.length) + ' ' + icon("chevron", 12)) + '</button>';
  return html;
}
function _pairListHtml(L, full) {
  var me = currentUser.uid;
  return _rankListHtml(L.pairs, function (p, i) { return _pairRowHtml(L, p, i); }, function (p) { return p.key.split("+").indexOf(me) >= 0; },
    function (p) { return p.comp < PAIR_MIN_MATCHES; }, PAIR_MIN_MATCHES, "pairs", full);
}
function _playerListHtml(L, full) {
  var me = currentUser.uid;
  return _rankListHtml(L.ranked, function (p, i) { return _playerRowHtml(L, p, i); }, function (p) { return p.uid === me; },
    function (p) { return p.comp < RANK_MIN_MATCHES; }, RANK_MIN_MATCHES, "players", full);
}

function _renderRanking() {
  var L = _rankLists(), st = L.st;
  var html = _myStatsCard();
  html += '<div class="form-hint scope-note">' + icon("chart", 13) + ' ' + scopeLabel(statsScope) + '</div>';
  html += _highlightsHtml(st, statsScope);
  // 1. Pair rank (men's doubles is how most of us play)
  html += '<div class="settings-section">1. ' + t("pairRank") + '</div><div class="card rank-list">';
  html += L.pairs.length ? _pairListHtml(L, rankExpand.pairs) : '<div class="empty-state" style="padding:12px">' + t("noPairsYet").replace("{n}", PAIR_MIN_MATCHES) + '</div>';
  html += '</div>';
  // 2. Player rank: the same list rankOf() numbers
  html += '<div class="settings-section">2. ' + t("playerRank") + '</div><div class="card rank-list">';
  html += L.ranked.length ? _playerListHtml(L, rankExpand.players) : '<div class="empty-state" style="padding:12px">' + t("noRankYet").replace("{n}", RANK_MIN_MATCHES) + '</div>';
  html += '</div>';
  return html;
}

/** v251: "See all N" on the Ranking tab opens the rest of that list in place; the same button then reads "Show less" */
var rankExpand = { pairs: false, players: false };
function statsSeeAll(kind) {
  var k = kind === "players" ? "players" : "pairs";
  rankExpand[k] = !rankExpand[k];
  renderStats();
}

/** Tap on a pair row of the Ranking tab: All matches of the pair's first member, partner = the second member, same period (3 and 6 months have no slot there: all time) */
function statsPairGo(key) {
  var us = key ? pairUids(key) : [];
  if (us.length < 2) return;
  openMatchesAll(us[0], { partner: us[1], period: statsScope === "month" || statsScope === "1y" ? statsScope : "all" });
}

/* ---------- Head-to-head = "Rivals & partners" (v251) ---------- */

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

var h2hUser = null;                 // whose rivals and partners the tab shows (null = me); the period is maPeriod (shared with All matches)
var h2hOpen = {};                   // card id -> true once "See all" opened it
var H2H_MIN = 2, H2H_TOP = 3;       // fewest games for a row in Best partners / Toughest / Easiest, and rows shown before "See all"

/** { partners, toughest, easiest, singles, n } for uid in a period (month | 30d | 1y | all). Rows: { k, n, w, l, pts }.
    Partners: doubles partners, best win rate first. Pairs: opposing pairs in doubles; Toughest = win rate under 50% (lowest first, then most losses),
    Easiest = over 50% (highest first). Exactly 50% is in neither (it is neither tough nor easy). Ties: more games, then better point difference. */
function h2hAggregate(uid, period) {
  var partners = {}, vs = {}, singles = {}, games = _myGames(uid, maPeriodFrom(period));
  var add = function (map, k, x) { var g = map[k] || (map[k] = { k: k, n: 0, w: 0, l: 0, pts: 0 }); g.n++; if (x.won) g.w++; else g.l++; g.pts += x.pts; };
  games.forEach(function (x) {
    if (x.mine.length === 2 && x.them.length === 2) {
      add(vs, pairKey(x.them), x);
      add(partners, x.mine.filter(function (u) { return u !== uid; })[0], x);
    } else if (x.mine.length === 1 && x.them.length === 1) add(singles, x.them[0], x);
  });
  var list = function (map) { return Object.keys(map).map(function (k) { return map[k]; }); };
  var rate = function (g) { return g.w / g.n; };
  var enough = function (g) { return g.n >= H2H_MIN; };
  var best = function (a, b) { return rate(b) - rate(a) || b.n - a.n || b.pts - a.pts; };
  return {
    n: games.length,
    partners: list(partners).filter(enough).sort(best),
    toughest: list(vs).filter(function (g) { return enough(g) && g.w * 2 < g.n; }).sort(function (a, b) { return rate(a) - rate(b) || b.l - a.l || b.n - a.n || a.pts - b.pts; }),
    easiest: list(vs).filter(function (g) { return enough(g) && g.w * 2 > g.n; }).sort(best),
    singles: list(singles).sort(function (a, b) { return b.n - a.n || rate(b) - rate(a) || b.pts - a.pts; })
  };
}

/** What a row opens in All matches: { uid, opts } (opts: partner | oppPair | opp + type, and the shared period) */
function h2hGoParams(kind, key) {
  var o = { period: maPeriod };
  if (kind === "partner") o.partner = key;
  else if (kind === "pair") o.oppPair = key;
  else { o.opp = key; o.type = "singles"; }
  return { uid: h2hUser || currentUser.uid, opts: o };
}
function h2hGo(kind, key) { var p = h2hGoParams(kind, key); openMatchesAll(p.uid, p.opts); }
function h2hToggle(id) { h2hOpen[id] = !h2hOpen[id]; renderStats(); }
function h2hSetPeriod(p) { maPeriod = p; renderStats(); }

function _h2hRowHtml(g, kind) {
  var l = g.l, rate = Math.round(g.w / g.n * 100), names, avs;
  if (kind === "pair") {
    var us = pairUids(g.k);
    avs = '<span class="rank-avatars">' + us.map(function (u) { return avatarHtml(u, 26); }).join('') + '</span>';
    names = us.map(function (u) { return escapeHtml(getUserName(u)); }).join(' + ');
  } else {
    avs = '<span class="rank-avatars one">' + avatarHtml(g.k, 30) + '</span>';
    names = escapeHtml(getUserName(g.k));
  }
  return '<button type="button" class="rank-row h2h-row" data-kind="' + kind + '" data-k="' + escapeHtml(g.k) + '" onclick="h2hGo(this.getAttribute(\'data-kind\'),this.getAttribute(\'data-k\'))">' + avs +
    '<span class="rank-text"><b>' + names + '</b><small>' + maGamesN(g.n) + ' · ' + t("h2hPtDiff") + ' ' + (g.pts >= 0 ? '+' : '−') + Math.abs(g.pts) + '</small></span>' +
    '<span class="h2h-rec ' + (g.w > l ? 'up' : g.w < l ? 'down' : '') + '"><b>' + g.w + '–' + l + '</b><small>' + rate + '%</small></span></button>';
}

/** One card: title, "See all N" / "Show less" when there are more than 3 rows, the rows (3 or all), or the empty text */
function _h2hCardHtml(id, title, rows, kind, emptyKey) {
  var open = !!h2hOpen[id], more = rows.length > H2H_TOP;
  return '<div class="card h2h-sec" id="h2h-' + id + '"><div class="h2h-ct"><h3>' + t(title) + '</h3>' +
    (more ? '<button type="button" class="h2h-more" aria-expanded="' + open + '" onclick="h2hToggle(\'' + id + '\')">' + (open ? t("seeLess") : t("seeAllN").replace("{n}", rows.length)) + '</button>' : '') + '</div>' +
    (rows.length ? (open ? rows : rows.slice(0, H2H_TOP)).map(function (g) { return _h2hRowHtml(g, kind); }).join('') : '<div class="h2h-empty">' + t(emptyKey) + '</div>') + '</div>';
}

function _renderH2H() {
  var me = currentUser.uid, who = h2hUser || me;
  // Pick a player: everyone who has played a game
  var seen = {};
  lastMatches.forEach(function (m) { (m.teamA || []).concat(m.teamB || []).forEach(function (u) { seen[u] = true; }); });
  seen[me] = seen[who] = true;
  var nm = function (u) { return plainUserName(findUser(u)); };
  var uids = Object.keys(seen).sort(function (a, b) { return a === me ? -1 : b === me ? 1 : String(nm(a)).localeCompare(String(nm(b))); });
  var periods = [["month", t("thisMonth")], ["30d", t("maP30Short")], ["1y", t("period_1y")], ["all", t("allWord")]];
  var head = '<div class="card h2h-head"><div class="ma-pick"><span class="ma-pick-av" aria-hidden="true">' + avatarHtml(who, 28) + '</span>' +
    '<select class="form-select" id="h2hUser" aria-label="' + escapeHtml(t("maPlayer")) + '" onchange="h2hUser=this.value;renderStats()">' + uids.map(function (u) {
      return '<option value="' + escapeHtml(u) + '"' + (u === who ? ' selected' : '') + '>' + escapeHtml(nm(u)) + (u === me ? ' (' + t("you") + ')' : '') + '</option>';
    }).join('') + '</select></div>' +
    '<div class="ma-seg s4" role="group" aria-label="' + escapeHtml(t("h2hPeriod")) + '">' + periods.map(function (o) {
      return '<button type="button" class="ma-segb' + (maPeriod === o[0] ? ' on' : '') + '" aria-pressed="' + (maPeriod === o[0]) + '" onclick="h2hSetPeriod(\'' + o[0] + '\')">' + escapeHtml(o[1]) + '</button>';
    }).join('') + '</div></div>';
  var a = h2hAggregate(who, maPeriod);
  if (!a.n) return head + '<div class="empty-state"><div class="empty-icon">' + icon("ranking", 44) + '</div><div>' + t("h2hNoGames") + '</div></div>';
  return head + _h2hCardHtml("partners", "h2hBestPartners", a.partners, "partner", "h2hEmptyPartners") +
    _h2hCardHtml("toughest", "h2hToughest", a.toughest, "pair", "h2hEmptyToughest") +
    _h2hCardHtml("easiest", "h2hEasiest", a.easiest, "pair", "h2hEmptyEasiest") +
    (a.singles.length ? _h2hCardHtml("singles", "h2hSingles", a.singles, "single", "h2hNone") : '');
}

/* ---------- Progress over a period (1 month, quarter, 6 months, year) ---------- */

function setProgressPeriod(p) { setStatsScope(p === "1m" ? "month" : p); }

function _periodStart(months) {
  var d = new Date(_todayIso() + "T00:00:00");
  var day = d.getDate();
  d.setDate(1);                                  // clamp the day first: Oct 31 minus 3 months is Jul 31 (not Aug 1 or later)
  d.setMonth(d.getMonth() - months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

/** Monday of the week of an ISO date */
function _weekKey(iso) {
  var d = new Date(iso + "T00:00:00"), dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

/* ---------- v257: the progress detail is a sheet (it was the Progress tab): the hero button, the hero chart, a player row and the Home rating card open it ---------- */
var _pgOpener = null;
function _progBody() { return '<div class="pg-in">' + _renderProgress() + '</div>'; }
function openProgress(uid, opener) {
  if (!currentUser) return;
  progressUser = uid || currentUser.uid;
  var had = document.getElementById("pgSheet");
  if (had) { _progRefresh(); return; }
  _pgOpener = opener || document.activeElement;
  var el = document.createElement("div"); el.id = "pgSheet"; el.className = "sheet-wrap";
  el.onclick = function (e) { if (e.target === el) closeProgress(); };
  el.innerHTML = '<div class="sheet pg-sheet" role="dialog" aria-modal="true" aria-labelledby="pgTitle"><div class="sheet-grab"></div>' +
    '<div class="pg-head"><b id="pgTitle">' + icon("chart", 16) + ' ' + escapeHtml(t("progress")) + '</b><button type="button" class="lg-close" id="pgClose" aria-label="' + escapeHtml(t("close")) + '">' + icon("close", 18) + '</button></div>' +
    '<div class="pg-body" id="pgBody" tabindex="-1">' + _progBody() + '</div></div>';
  document.body.appendChild(el);
  document.addEventListener("keydown", _progKey, true);
  el.querySelector("#pgClose").onclick = closeProgress;
  el.querySelector("#pgClose").focus();
}
/** Redraw the open sheet (another player or another period); the scroll place and the focused control stay */
function _progRefresh() {
  var b = document.getElementById("pgBody"); if (!b) return;
  var top = b.scrollTop, ae = document.activeElement, isSel = ae && ae.tagName === "SELECT" && b.contains(ae);
  b.innerHTML = _progBody(); b.scrollTop = top;
  if (isSel) { var s = b.querySelector("select"); if (s) s.focus(); }
}
function _progKey(e) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeProgress(); return; }
  if (e.key !== "Tab") return;
  var f = Array.prototype.slice.call(document.querySelectorAll("#pgSheet button, #pgSheet select, #pgSheet [tabindex='0']")).filter(function (x) { return !x.disabled; });
  if (!f.length) return;
  var first = f[0], last = f[f.length - 1], sh = document.getElementById("pgSheet");
  if (!sh || !sh.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function closeProgress() {
  var el = document.getElementById("pgSheet");
  document.removeEventListener("keydown", _progKey, true);
  if (!el) return;
  el.remove();
  var o = _pgOpener; _pgOpener = null;
  if (o && o.focus && document.body.contains(o)) { try { o.focus(); } catch (e) {} }
}

function _renderProgress() {
  var st = computeStats();
  var uid = progressUser || currentUser.uid;
  var uids = Object.keys(st.players);
  if (uids.indexOf(uid) < 0) uids.unshift(uid);
  var from = scopeFrom(statsScope);
  var html = '<div class="card"><select class="form-select" onchange="progressUser=this.value;_progRefresh()">' + uids.map(function (u) {
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
    '<div class="progress-wl"><b>' + fmtWL(w, l) + '</b><small>' + pct(w, games.length) + ' ' + t("winRate") + '</small></div></div>' +
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

var _gfOpen = false, _gfSession = "";   // is the Add score form open (it is closed until the button is tapped)
function _gfSetOpen(v) {
  _gfOpen = !!v;
  var box = document.getElementById("gameFormBox"), btn = document.querySelector(".score-add");
  if (box) box.classList.toggle("gf-closed", !_gfOpen);
  if (btn) { btn.classList.toggle("active", _gfOpen); btn.setAttribute("aria-expanded", String(_gfOpen)); }
}
function toggleGameForm() {
  _gfSetOpen(!_gfOpen);
  if (_gfOpen) { var box = document.getElementById("gameFormBox"); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}

/** The whole Games tab: Live score and Add score buttons, the add-game form + the list */
function sessionGamesTabHtml(s) {
  if (!gameForm || gameForm.sessionId !== s.id) gameForm = _blankGameForm(s);
  var mode = s.mode || "competition";
  // Tournament (v236): first thing in the Games tab (and on the list card)
  var html = (typeof tourCardHtml === "function" ? tourCardHtml(s) : '') + '<div class="games-mode"><span class="tag mode-' + cssId(mode) + '">' + t("mode_" + mode) + '</span><span class="form-hint">' + t("modeHint_" + mode) + '</span></div>';
  // Two buttons (v216): Live score first, Add score opens the form
  if (_gfSession !== s.id) { _gfSession = s.id; _gfOpen = false; }
  if (gameForm && gameForm.id) _gfOpen = true;
  if (_canAddGames(s)) {
    html += '<div class="score-actions">' +
      (sessionStep(s) < 3 ? '<button type="button" class="live-launch" onclick="showLiveScore(\'' + jsq(s.id) + '\')">' + icon("scoreboard", 24) + '<b>' + t("lsTitle") + '</b></button>' : '') +
      '<button type="button" class="live-launch score-add' + (_gfOpen ? ' active' : '') + '" aria-expanded="' + _gfOpen + '" onclick="toggleGameForm()">' + icon("ranking", 24) + '<b>' + t("addScore") + '</b></button></div>';
    html += '<div id="gameFormBox" class="' + (_gfOpen ? '' : 'gf-closed') + '">' + _gameFormHtml(s) + '</div>';
  }
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

var _gameSaving = false;
function saveGame() {
  if (_gameSaving) return;   // a double tap must not write the game twice
  var f = gameForm, s = currentSession, size = f.type === "singles" ? 1 : 2;
  if (!s || f.sessionId !== s.id) return;
  if (f.teamA.length !== size || f.teamB.length !== size) { showToast(t("pickTeams").replace("{n}", size)); return; }
  if (f.a === "" || f.b === "") { showToast(t("scoreTypeBoth").replace("{cap}", maxPoints())); return; }
  var a = Number(f.a), b = Number(f.b), p = scoreProblem(a, b);
  if (p) { showToast(p); return; }
  var minutes = parseInt(f.minutes, 10) || null;
  if (minutes && (minutes < 1 || minutes > 180)) { showToast(t("minutesRange")); return; }
  var data = { type: f.type, teamA: f.teamA.slice(), teamB: f.teamB.slice(), games: [{ a: a, b: b }], minutes: minutes };
  _gameSaving = true;
  var op = f.id
    ? fsdb.collection("matches").doc(f.id).update(Object.assign(data, { updatedBy: currentUser.uid, updatedAt: Date.now() }))
    : fsdb.collection("matches").add(withGroup(Object.assign(data, { sessionId: s.id, date: s.date, mode: s.mode || "competition",
        court: null, shuttles: 0, createdBy: currentUser.uid, createdAt: Date.now(), confirmed: false })));
  op.then(function () {
    _gameSaving = false;
    showToast(t("gameSaved") + " ✔");
    // Ready for the next game (same type, empty teams and score)
    var type = f.type;
    gameForm = _blankGameForm(s); gameForm.type = type;
    _rerenderGameForm();
    if (f.id) _gfSetOpen(false);   // a fixed game closes the form; a new one leaves it open for the next game
  }).catch(function (e) { _gameSaving = false; showToast(_permError(e)); });
}

function editGame(id) {
  var m = lastMatches.filter(function (x) { return x.id === id; })[0];
  if (!m || !currentSession) return;
  if ((m.games || []).length > 1) { showToast(t("editMultiGame")); return; }   // the form holds one game: saving would drop the others
  var g = (m.games || [])[0] || {};
  gameForm = { sessionId: currentSession.id, id: id, type: m.type || "md", teamA: (m.teamA || []).slice(), teamB: (m.teamB || []).slice(),
    a: g.a != null ? String(g.a) : "", b: g.b != null ? String(g.b) : "", minutes: m.minutes ? String(m.minutes) : "" };
  _rerenderGameForm();
  _gfSetOpen(true);
  var box = document.getElementById("gameFormBox"); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelGameEdit() { gameForm = _blankGameForm(currentSession); _rerenderGameForm(); _gfSetOpen(false); }

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
  var tn = !!m.tid;   // a tournament game: it belongs to the tournament screen, not to this list
  var canEdit = !tn && (m.createdBy === me || isGroupAdminMe());
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
  html += '<div class="match-by">' + (tn ? '<span class="tn-badge">' + escapeHtml(t("tourBadge")) + '</span> ' + escapeHtml(typeof tourLabText === "function" ? tourLabText(m.tstage) : "") : m.live ? '<span class="match-by-lbl">' + t("countedBy") + '</span> ' + personHtml(m.createdBy, 20) : t("addedBy").replace("{name}", escapeHtml(getUserName(m.createdBy)))) + (m.createdAt && !tn ? ' ' + _whenShort(m.createdAt) : '') +
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
  { key: "streak5", icon: "chart", need: 5, best: true, val: function (p) { return p.maxStreak || 0; } },
  { key: "streak10", icon: "ranking", need: 10, best: true, val: function (p) { return p.maxStreak || 0; } },
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
  return BADGES.map(function (b) { var v = b.val(p); return { key: b.key, icon: b.icon, earned: v >= b.need, value: Math.min(v, b.need), need: b.need, best: !!b.best }; });
}

/** Progress under a badge: a tick when earned, "best 6" for streaks, "62/100" for counts */
function badgeProgText(b) {
  if (b.earned) return "\u2714";
  if (b.best) return t("badgeBestN").replace("{n}", b.value);
  return b.need > 1 ? b.value + "/" + b.need : "\u2013";
}

/** The gold "medal N" button on the Rankings hero (N = badges earned) */
function _badgeBtnHtml(uid) {
  if (!GROUPS_ON) return "";
  var list = badgesFor(uid), got = list.filter(function (b) { return b.earned; }).length;
  return '<button type="button" class="how-btn badge-btn" aria-haspopup="dialog" aria-label="' + escapeHtml(t("badgesBtnLabel").replace("{n}", got).replace("{m}", list.length)) + '" title="' + escapeHtml(t("badges")) + '" onclick="openBadgesSheet()">' +
    icon("medal", 14) + '<span class="bd-n">' + got + '</span></button>';
}

/** Bottom sheet with every badge: earned in colour, locked in grey with their progress. Esc, the backdrop and the close button close it; focus returns to the button. */
function openBadgesSheet(uid) {
  uid = uid || (currentUser && currentUser.uid); if (!uid) return;
  var old = document.getElementById("badgesSheet"); if (old) old.remove();
  var list = badgesFor(uid), got = list.filter(function (b) { return b.earned; }).length, opener = document.activeElement;
  var el = document.createElement("div"); el.id = "badgesSheet"; el.className = "sheet-wrap";
  el.innerHTML = '<div class="sheet bd-sheet" role="dialog" aria-modal="true" aria-labelledby="bdTitle"><div class="sheet-grab"></div>' +
    '<div class="bd-head"><b id="bdTitle">' + icon("medal", 16) + ' ' + t("badges") + '</b><span class="bd-count">' + got + '/' + list.length + '</span>' +
    '<button type="button" class="lg-close" id="bdClose" aria-label="' + escapeHtml(t("close")) + '">' + icon("close", 18) + '</button></div>' +
    '<ul class="bd-grid">' + list.map(function (b) {
      var pc = b.earned ? 100 : Math.min(100, Math.round((b.value || 0) / b.need * 100));
      return '<li class="bd-item ' + (b.earned ? 'earned' : 'locked') + '" title="' + escapeHtml(t("badgeDesc_" + b.key)) + '">' +
        '<span class="bd-ico">' + icon(b.icon, 24) + '</span><span class="bd-name">' + t("badge_" + b.key) + '</span>' +
        '<span class="bd-bar" aria-hidden="true"><i style="width:' + pc + '%"></i></span>' +
        '<small class="bd-prog">' + (b.earned ? t("badgeEarned") : badgeProgText(b)) + '</small></li>';
    }).join("") + '</ul></div>';
  var close = function () {
    document.removeEventListener("keydown", onKey, true);
    el.remove();
    if (opener && opener.focus && document.body.contains(opener)) { try { opener.focus(); } catch (e) {} }
  };
  var onKey = function (e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); var c = document.getElementById("bdClose"); if (c) c.focus(); }   // the close button is the only control: keep focus inside the dialog
  };
  document.addEventListener("keydown", onKey, true);
  el.onclick = function (e) { if (e.target === el) close(); };
  document.body.appendChild(el);
  el.querySelector("#bdClose").onclick = close;
  el.querySelector("#bdClose").focus();
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
      '<small class="badge-val">' + badgeProgText(b) + '</small></div>';
  });
  return html + '</div></div>';
}

/* ---------- Monthly recap card (an image to share) ---------- */
function _roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
