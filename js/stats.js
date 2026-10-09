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
  var tabs = '<div class="session-tabs stats-tabs" role="tablist">' + [["ranking", "statsRanking", "ranking"], ["h2h", "headToHead", "users"], ["progress", "progress", "chart"]].map(function (x) {
    return '<button role="tab" class="session-tab' + (statsTab === x[0] ? ' active' : '') + '" onclick="setStatsTab(\'' + x[0] + '\')">' + icon(x[2], 15) + ' ' + t(x[1]) + '</button>';
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
  var html = '<div class="card my-stats">';
  html += '<div class="my-stats-head">' + (lvl ? levelBadgeHtml(lvl) : '<span class="level-badge lv-none" onclick="showLevelGuide()">?</span>') +
    '<div style="flex:1;min-width:0"><div class="my-stats-title">' + t("myLevel") + '</div>' +
    '<div class="my-stats-rating">' + (p && p.comp ? Math.round(p.rating) + ' ' + _trend(p.rating, p.monthStart) + _provTag(p.comp, RANK_MIN_MATCHES) : t("notRankedYet").replace("{n}", 0).replace("{min}", RANK_MIN_MATCHES)) + '</div></div>' +
    '<button class="how-btn" aria-label="' + t("howRankingWorks") + '" onclick="showRankingHelp()">?</button></div>';
  if (p) {
    var wr = p.wins + p.losses ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0;
    var best = _bestPartner(p);
    html += '<div class="my-stats-facts"><span><b>' + wr + '%</b> ' + t("winRate") + '</span><span><b>' + p.monthPlayed + '</b> ' + t("matchesThisMonth") + '</span>' +
      (best ? '<span>' + t("bestPartner") + ' <b>' + getUserName(best) + '</b></span>' : '') + '</div>';
  }
  // My last 5 games: me (and my partner) vs the rivals, won or lost
  var last = _myGames(me).slice(-5).reverse();
  if (last.length) {
    html += '<div class="form-strip"><span class="form-hint" style="margin:0">' + t("lastNGames").replace("{n}", last.length) + '</span>' +
      last.slice().reverse().map(function (x) { return '<span class="wl ' + (x.won ? 'w' : 'l') + '">' + (x.won ? t("winShort") : t("lossShort")) + '</span>'; }).join('') + '</div>';
    // Each game: won or lost, my team (my name highlighted) vs the rivals
    var nm = function (u) { return '<span class="' + (u === me ? 'rg-me' : '') + '">' + escapeHtml(getUserName(u)) + '</span>'; };
    html += '<div class="recent-games">' + last.map(function (x) {
      var mine = x.mine.slice().sort(function (a, b) { return a === me ? -1 : b === me ? 1 : 0; });
      return '<div class="recent-game ' + (x.won ? 'won' : 'lost') + '">' +
        '<span class="rg-res">' + (x.won ? t("winShort") : t("lossShort")) + '</span>' +
        '<span class="rg-teams"><b>' + mine.map(nm).join(' &amp; ') + '</b>' +
          '<small>' + t("vsWord") + ' ' + x.them.map(function (u) { return escapeHtml(getUserName(u)); }).join(' &amp; ') + '</small></span>' +
        '<span class="rg-word">' + t(x.won ? "wonWord" : "lostWord") + '</span></div>';
    }).join('') + '</div>';
  }
  html += '<button class="link-btn my-stats-more" onclick="progressUser=currentUser.uid;setStatsTab(\'progress\')">' + t("seeMyProgress") + ' ' + icon("chevron", 12) + '</button>';
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
    html += '<div class="rank-row' + (us.indexOf(currentUser.uid) >= 0 ? ' me' : '') + '" onclick="setStatsTab(\'h2h\')">' +
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
  var pairAv = function (k) { return k.split("+").map(function (u) { return avatarHtml(u, 26); }).join(''); };
  var oneAv = function (u) { return avatarHtml(u, 30); };
  var oneName = function (u) { return escapeHtml(getUserName(u)); };
  var html = picker + '<div class="card h2h-total"><div class="h2h-total-who">' + avatarHtml(me, 30) + '<b>' + escapeHtml(getUserName(me)) + '</b></div><div class="h2h-score">' + tot.w + ' \u2013 ' + (tot.n - tot.w) + '</div>' +
    '<div class="h2h-facts">' + t(me === currentUser.uid ? "h2hMine" : "h2hTheirs").replace("{n}", tot.n) + ' \u00B7 ' + (tot.pts >= 0 ? '+' : '') + tot.pts + ' ' + t("ptsShort") + '</div></div>';
  html += '<div class="settings-section">' + t("h2hVsPairs") + '</div><div class="card rank-list">' + _h2hRows(vsPairs, pairAv, pairName) + '</div>';
  html += '<div class="settings-section">' + t(me === currentUser.uid ? "h2hWithPartner" : "h2hWithPartners") + '</div><div class="card rank-list">' + _h2hRows(withPartner, oneAv, oneName) + '</div>';
  html += '<div class="settings-section">' + t("h2hVsSingles") + '</div><div class="card rank-list">' + _h2hRows(vsSingles, oneAv, oneName) + '</div>';
  return html;
}

/* ---------- Progress over a period (1 month, quarter, 6 months, year) ---------- */

var progressPeriod = "3m";
var PROGRESS_PERIODS = [["1m", 1], ["3m", 3], ["6m", 6], ["1y", 12]];

function setProgressPeriod(p) { progressPeriod = p; renderStats(); }

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
  var months = (PROGRESS_PERIODS.filter(function (x) { return x[0] === progressPeriod; })[0] || PROGRESS_PERIODS[1])[1];
  var from = _periodStart(months);
  var html = '<div class="card"><select class="form-select" onchange="progressUser=this.value;renderStats()">' + uids.map(function (u) {
    return '<option value="' + u + '"' + (u === uid ? ' selected' : '') + '>' + escapeHtml(plainUserName(findUser(u))) + '</option>';
  }).join('') + '</select>' +
    '<div class="period-toggle" style="margin:10px 0 0">' + PROGRESS_PERIODS.map(function (x) {
      return '<button class="period-btn' + (progressPeriod === x[0] ? ' active' : '') + '" onclick="setProgressPeriod(\'' + x[0] + '\')">' + t("period_" + x[0]) + '</button>';
    }).join('') + '</div></div>';
  var p = st.players[uid];
  var games = _myGames(uid, from);
  var all = lastMatches.filter(function (m) { return m.teamA && m.teamB && (m.teamA.indexOf(uid) >= 0 || m.teamB.indexOf(uid) >= 0) && (m.date || "") >= from; });
  if (!p || !all.length) return html + '<div class="empty-state"><div class="empty-icon">' + icon("chart", 44) + '</div><div>' + t("noGamesInPeriod") + '</div></div>';
  // Rating: where it stood when the period began, then after each game in it
  var hist = p.history || [], startR = RATING_START;
  hist.forEach(function (h) { if ((h.at || "") < from) startR = h.r; });
  var inP = hist.filter(function (h) { return (h.at || "") >= from; });
  var endR = inP.length ? inP[inP.length - 1].r : startR;
  var w = games.filter(function (x) { return x.won; }).length, l = games.length - w;
  var mins = all.reduce(function (s, m) { return s + (m.minutes || 0); }, 0);
  var pts = games.reduce(function (s, x) { return s + x.pts; }, 0);
  html += '<div class="card"><div class="progress-head"><div><div class="form-hint" style="margin:0">' + t("ratingWord") + '</div><b class="progress-rating">' + Math.round(endR) + '</b> ' + _trend(endR, startR) + '</div>' +
    '<div class="progress-wl"><b>' + w + '\u2013' + l + '</b><small>' + (games.length ? Math.round(w / games.length * 100) : 0) + '% ' + t("winRate") + '</small></div></div>' +
    _sparkline([startR].concat(inP.map(function (h) { return h.r; }))) + '</div>';
  html += '<div class="card"><div class="my-stats-facts">' +
    '<span><b>' + all.length + '</b> ' + t("gamesWord") + '</span><span><b>' + mins + '</b> ' + t("minShort") + '</span>' +
    '<span><b>' + (games.length ? (pts / games.length >= 0 ? '+' : '') + (pts / games.length).toFixed(1) : '0') + '</b> ' + t("ptsPerGame") + '</span>' +
    '<span>' + t("streak") + ' <b>' + (p.streak > 0 ? p.streak + t("winShort") : p.streak < 0 ? (-p.streak) + t("lossShort") : '\u2013') + '</b></span></div></div>';
  // Breakdown: by week for one month, by month otherwise
  var byWeek = months === 1, buckets = {};
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
    html += '<div class="rank-row"><span class="rank-text"><b>' + label + '</b><small>' + b.n + ' ' + t("gamesWord") + ' \u00B7 ' + b.w + '\u2013' + b.l +
      (b.w + b.l ? ' \u00B7 ' + Math.round(b.w / (b.w + b.l) * 100) + '%' : '') + (b.min ? ' \u00B7 ' + b.min + ' ' + t("minShort") : '') + '</small></span>' +
      '<span class="rank-rating">' + Math.round(r) + ' ' + _trend(r, prev) + '</span></div>';
  });
  html += '</div>';
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
  // Who saved it, and who changed it last
  html += '<div class="match-by">' + t("addedBy").replace("{name}", escapeHtml(getUserName(m.createdBy))) + (m.createdAt ? ' ' + _whenShort(m.createdAt) : '') +
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
  var got = list.filter(function (b) { return b.earned; }).length;
  var html = '<div class="card badges-card"><div class="badges-head"><div class="card-title" style="margin:0">' + icon("medal", 14) + ' ' + t("badges") +
    ' <span class="badges-count">' + got + '/' + list.length + '</span></div>' +
    (uid === currentUser.uid ? '<button class="btn-secondary recap-btn" onclick="makeRecap()">' + icon("camera", 14) + ' ' + t("monthlyRecap") + '</button>' : '') + '</div><div class="badge-grid">';
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
function makeRecap() {
  var me = currentUser.uid, st = computeStats(), p = st.players[me];
  var now = new Date(), mk = _todayIso().slice(0, 7);
  // This month's games (any mode, with a winner)
  var games = _myGames(me, mk + "-01");
  var w = games.filter(function (x) { return x.won; }).length, l = games.length - w;
  var wr = games.length ? Math.round(w / games.length * 100) : 0;
  var change = p && p.monthStart !== null ? Math.round(p.rating - p.monthStart) : 0;
  var pts = games.reduce(function (sum, x) { return sum + x.pts; }, 0);
  var streak = 0, run = 0;
  games.forEach(function (x) { run = x.won ? run + 1 : 0; streak = Math.max(streak, run); });
  // Best partner (most wins together) and the rival pair met most
  var partners = {}, rivals = {};
  games.forEach(function (x) {
    var mate = x.mine.filter(function (u) { return u !== me; })[0];
    if (mate) { var q = partners[mate] || (partners[mate] = { n: 0, w: 0 }); q.n++; if (x.won) q.w++; }
    var rk = x.them.slice().sort().join("+"), r = rivals[rk] || (rivals[rk] = { n: 0, w: 0 }); r.n++; if (x.won) r.w++;
  });
  var bestMate = Object.keys(partners).sort(function (a, b) { return partners[b].w - partners[a].w || partners[b].n - partners[a].n; })[0];
  var rival = Object.keys(rivals).sort(function (a, b) { return rivals[b].n - rivals[a].n; })[0];
  var name = function (u) { return plainUserName(findUser(u)); };
  var earned = badgesFor(me).filter(function (x) { return x.earned; }).length;
  var lvl = playerLevel(me);

  var c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  var g = c.getContext("2d");
  var grad = g.createLinearGradient(0, 0, 1080, 1350);
  grad.addColorStop(0, "#0f766e"); grad.addColorStop(0.55, "#1e40af"); grad.addColorStop(1, "#6d28d9");
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = "rgba(255,255,255,0.07)"; g.beginPath(); g.arc(980, 120, 320, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(60, 1300, 260, 0, Math.PI * 2); g.fill();
  var font = function (wt, px) { g.font = wt + " " + px + "px Montserrat, 'Noto Sans Lao', sans-serif"; };
  var text = function (str, x, y, wt, px, alpha, align) { font(wt, px); g.globalAlpha = alpha == null ? 1 : alpha; g.textAlign = align || "left"; g.fillStyle = "#fff"; g.fillText(str, x, y); g.globalAlpha = 1; };
  var card = function (x, y, wd, ht) { g.fillStyle = "rgba(255,255,255,0.13)"; _roundRect(g, x, y, wd, ht, 32); g.fill(); };

  // Header
  text("🏸 GODSMASH", 80, 110, "800", 36, 0.9);
  text((currentGroup ? currentGroup.name + " · " : "") + monthYear(now.getFullYear(), now.getMonth()), 80, 160, "600", 34, 0.8);
  text(name(me), 80, 268, "800", 84);
  if (lvl) {
    var lc = { BG: "#64748b", N: "#0d9488", S: "#2563eb", P: "#7c3aed", CL: "#d97706", BA: "#dc2626" }[lvl] || "#64748b";
    g.fillStyle = lc; _roundRect(g, 80, 300, 300, 64, 18); g.fill();
    text(levelShort(lvl) + " · " + levelName(lvl), 230, 344, "700", 28, 1, "center");
  }

  // Win rate ring
  var cx = 270, cy = 590, R = 170;
  g.lineWidth = 34; g.lineCap = "round";
  g.strokeStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  if (games.length) { g.strokeStyle = "#4ade80"; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * wr / 100); g.stroke(); }
  text(wr + "%", cx, cy + 22, "800", 92, 1, "center");
  text(t("winRate"), cx, cy + 74, "600", 30, 0.85, "center");

  // W – L and the last five
  text(w + t("winShort") + " – " + l + t("lossShort"), 520, 520, "800", 96);
  text(t("recapGamesN").replace("{n}", games.length), 520, 575, "600", 32, 0.85);
  games.slice(-5).forEach(function (x, i) {
    g.fillStyle = x.won ? "#16a34a" : "#dc2626";
    _roundRect(g, 520 + i * 92, 620, 76, 76, 18); g.fill();
    text(x.won ? t("winShort") : t("lossShort"), 558 + i * 92, 672, "800", 36, 1, "center");
  });
  if (games.length) text(t("lastNGames").replace("{n}", Math.min(5, games.length)), 520, 740, "600", 26, 0.75);

  // Three tiles: rating change, best streak, points per game
  var tiles = [[(change > 0 ? "+" : "") + change, t("recapRating")], [String(streak), t("recapStreak")],
    [(games.length ? (pts / games.length >= 0 ? "+" : "") + (pts / games.length).toFixed(1) : "0"), t("ptsPerGame")]];
  tiles.forEach(function (x, i) {
    var x0 = 80 + i * 313;
    card(x0, 830, 290, 200);
    text(x[0], x0 + 145, 940, "800", 76, 1, "center");
    text(x[1], x0 + 145, 990, "600", 26, 0.85, "center");
  });

  // Partner and rival
  card(80, 1060, 920, 170);
  text(t("bestPartner"), 120, 1112, "600", 28, 0.8);
  text(bestMate ? name(bestMate) + "  " + partners[bestMate].w + t("winShort") + "–" + (partners[bestMate].n - partners[bestMate].w) + t("lossShort") : "–", 120, 1160, "800", 38);
  text(t("recapRival"), 560, 1112, "600", 28, 0.8);
  text(rival ? rival.split("+").map(name).join(" & ") : "–", 560, 1160, "800", 34);
  if (rival) text(rivals[rival].w + t("winShort") + "–" + (rivals[rival].n - rivals[rival].w) + t("lossShort"), 560, 1204, "600", 28, 0.85);

  // Footer
  text(t("badges") + " " + earned + "/" + BADGES.length + "  ·  godsmash", 540, 1300, "600", 28, 0.7, "center");

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
