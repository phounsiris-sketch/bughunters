/* ============================================================
   stats-core.js — ONE source for the numbers every page shows about a
   player (Rankings card, Rankings list, Progress, Home, Profile).
   Nobody else computes win rate, games, streak, best partner or rank.
   Scope: "all" | "month" (this calendar month) | "3m" | "6m" | "1y".
   Built from lastMatches (via _myGames), the same data as computeStats().
   ============================================================ */

var MIN_PARTNER_GAMES = 5;     // games together before someone can be "best partner"
var STATS_SCOPES = [["all", "allTime"], ["month", "thisMonth"], ["3m", "period_3m"], ["6m", "period_6m"], ["1y", "period_1y"]];
var statsScope = "all";
try { var _ss = localStorage.getItem("statsScope"); if (_ss && STATS_SCOPES.some(function (x) { return x[0] === _ss; })) statsScope = _ss; } catch (e) {}

function setStatsScope(s) {
  statsScope = s;
  try { localStorage.setItem("statsScope", s); } catch (e) {}
  if (typeof renderStats === "function") renderStats();
}

/** First ISO date of a scope ("" = from the beginning) */
function scopeFrom(scope) {
  if (!scope || scope === "all") return "";
  if (scope === "month") return _todayIso().slice(0, 7) + "-01";
  if (scope === "3m") return _periodStart(3);
  if (scope === "6m") return _periodStart(6);
  if (scope === "1y") return _periodStart(12);
  return "";
}

function scopeLabel(scope) {
  var x = STATS_SCOPES.filter(function (s) { return s[0] === (scope || "all"); })[0];
  return t(x ? x[1] : "allTime");
}

/** Row of scope buttons (same everywhere) */
function scopeChipsHtml() {
  return '<div class="period-toggle scope-chips">' + STATS_SCOPES.map(function (x) {
    return '<button class="period-btn' + (statsScope === x[0] ? ' active' : '') + '" onclick="setStatsScope(\'' + x[0] + '\')">' + t(x[1]) + '</button>';
  }).join('') + '</div>';
}

/** "5–3" everywhere */
function fmtWL(w, l) { return w + "–" + l; }
/** Whole percent, or "–" when there is nothing to divide */
function pct(w, n) { return n ? Math.round(w / n * 100) + "%" : "–"; }

/** Everything about one player in one scope */
function statsFor(uid, scope) {
  var from = scopeFrom(scope);
  var games = _myGames(uid, from);                    // decided games, oldest first
  var played = lastMatches.filter(function (m) {      // every saved game, decided or not
    return m.teamA && m.teamB && (m.teamA.indexOf(uid) >= 0 || m.teamB.indexOf(uid) >= 0) && (!from || (m.date || "") >= from);
  }).length;
  var wins = games.filter(function (x) { return x.won; }).length, run = 0, best = 0;
  games.forEach(function (x) { run = x.won ? run + 1 : 0; if (run > best) best = run; });
  var now = 0;
  for (var i = games.length - 1; i >= 0 && games[i].won === games[games.length - 1].won; i--) now++;
  var pts = games.reduce(function (s, x) { return s + x.pts; }, 0);
  return { played: played, decided: games.length, wins: wins, losses: games.length - wins, winRate: games.length ? Math.round(wins / games.length * 100) : null,
    streakNow: games.length ? (games[games.length - 1].won ? now : -now) : 0, streakBest: best, pts: pts, games: games };
}

/** Partners of a player: [{uid, n, w, l, rate}] */
function partnerList(uid, scope) {
  var map = {};
  _myGames(uid, scopeFrom(scope)).forEach(function (g) {
    g.mine.forEach(function (u) { if (u !== uid) { var x = map[u] || (map[u] = { uid: u, n: 0, w: 0 }); x.n++; if (g.won) x.w++; } });
  });
  return Object.keys(map).map(function (k) { var x = map[k]; x.l = x.n - x.w; x.rate = x.w / x.n; return x; });
}

function _partnerSort(a, b) {
  return b.rate - a.rate || b.n - a.n || b.w - a.w || String(getUserName(a.uid)).localeCompare(String(getUserName(b.uid)));
}

/** Best partner = highest win rate with at least MIN_PARTNER_GAMES games together; null if nobody qualifies */
function bestPartnerOf(uid, scope) {
  var l = partnerList(uid, scope).filter(function (x) { return x.n >= MIN_PARTNER_GAMES; }).sort(_partnerSort);
  return l[0] || null;
}
/** Weakest partner (same rules); null when there is no one clearly worse than the best */
function worstPartnerOf(uid, scope) {
  var l = partnerList(uid, scope).filter(function (x) { return x.n >= MIN_PARTNER_GAMES; }).sort(_partnerSort);
  var w = l.length > 1 ? l[l.length - 1] : null;
  return w && w.rate < l[0].rate ? w : null;
}

/** My pair with the highest pair rating (Elo, over all games): { key, rating, wins, losses, other } or null */
function topPairOf(uid) {
  var st = computeStats(), best = null;
  Object.keys(st.pairs).forEach(function (k) {
    var p = st.pairs[k];
    if (k.split("+").indexOf(uid) < 0 || p.comp < PAIR_MIN_MATCHES) return;
    if (!best || p.rating > best.rating) best = p;
  });
  if (!best) return null;
  return { key: best.key, rating: Math.round(best.rating), wins: best.wins, losses: best.losses, other: best.key.split("+").filter(function (u) { return u !== uid; })[0] };
}

/** The pair with the top rating in the whole group */
function topPairInGroup() {
  var st = computeStats(), best = null;
  Object.keys(st.pairs).forEach(function (k) {
    var p = st.pairs[k];
    if (p.comp < PAIR_MIN_MATCHES) return;
    if (!best || p.rating > best.rating || (p.rating === best.rating && p.comp > best.comp)) best = p;
  });
  return best;
}

/** Players shown in the Rankings list for a scope, in order (everyone with a rating; in a period only those who played in it) */
function rankedFor(scope) {
  var list = computeStats().ranked;
  if (!scope || scope === "all") return list;
  var from = scopeFrom(scope);
  return list.filter(function (p) { return _myGames(p.uid, from).length > 0; });
}

/** My place in that list (0 = not in it); the list rows and the hero card both use this order */
function rankOf(uid, scope) {
  var l = rankedFor(scope);
  for (var i = 0; i < l.length; i++) if (l[i].uid === uid) return i + 1;
  return 0;
}

/** My last n results, newest first */
function formStrip(uid, n) { return _myGames(uid).slice(-(n || 5)).reverse(); }

/** Pair records inside a scope: { pairKey: {w, l} } from the 2 v 2 games with a winner */
function pairRecordsFor(scope) {
  var from = scopeFrom(scope), out = {};
  lastMatches.forEach(function (m) {
    if (!m.teamA || !m.teamB || m.teamA.length !== 2 || m.teamB.length !== 2 || (from && (m.date || "") < from)) return;
    var w = matchWinner(m);
    if (!w) return;
    [["A", m.teamA], ["B", m.teamB]].forEach(function (x) {
      var k = pairKey(x[1]), r = out[k] || (out[k] = { w: 0, l: 0 });
      if (w === x[0]) r.w++; else r.l++;
    });
  });
  return out;
}
