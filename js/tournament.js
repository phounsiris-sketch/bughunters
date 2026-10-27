/* ============================================================
   tournament.js — a tournament inside one session (v227)
   1. Rotation: 6 players play 9 games, 8 players play 6, with a random partner each game
      and an even rest (everyone plays the same number of games).
   2. Pairs: best with worst, from the rotation table.
   3. Playoff: 8 players = 2 semis (drawn at random), 3rd place (1 game), final best of 3.
               6 players = round robin of the 3 pairs.
   The first part of this file is the plain engine (tour*), no DOM, tested in tests/tournament.test.js.
   The state is one object saved as sessions/{id}.tourney (NOT .tournament: the v48 round robin already used that name):
   { v, n, ids:[uid], coin:[idx], games:[{ph,a:[idx],b:[idx],sa,sb}], po:[{ph,lab,fin,a,b,pa,pb,sa,sb,wo?,v?}], drawn, semi:[0..3]|null,
     out:[{p:pairNo, why:"injury"|"left"|"other", note}] }   (v228: a pair that is out gives walkovers; wo = walkover game, v = void game)
   v238: hurt:[{i, why, note}] players out for the games left; a game can carry subs:[{from, to, why, note}] (a stand-in plays for `from`)
   and woHurt (walkover because nobody could stand in). Both are optional, older data stays valid.
   Players inside games are positions (0..n-1) in `ids`, so the nested arrays stay legal in Firestore.
   ============================================================ */

var TOUR_BASE = {
  6: [[[0, 2], [5, 3]], [[1, 4], [3, 2]], [[4, 1], [0, 5]], [[0, 3], [5, 2]], [[1, 2], [4, 5]], [[1, 3], [4, 0]], [[0, 1], [2, 4]], [[3, 4], [5, 2]], [[5, 1], [3, 0]]],
  8: [[[3, 7], [4, 1]], [[0, 6], [2, 5]], [[6, 3], [4, 5]], [[2, 1], [0, 7]], [[7, 6], [5, 1]], [[0, 2], [4, 3]]]
};
var TOUR_MAX_SCORE = 30;
var TOUR_WO = 21;            // a walkover is written as 21–0 and flagged g.wo (never counted in stats)

function tourShuffle(a, rnd) {
  rnd = rnd || Math.random;
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}
function tourDone(g) { return !!g && g.sa !== null && g.sa !== undefined; }
function tourSizeOk(n) { return n === 6 || n === 8; }
function tourRounds(n) { return TOUR_BASE[n] ? TOUR_BASE[n].length : 0; }

/** Longest rest and longest play streak of any player */
function tourRuns(games, n) {
  var mr = 0, mp = 0;
  for (var p = 0; p < n; p++) {
    var r = 0, q = 0;
    for (var k = 0; k < games.length; k++) {
      var on = games[k].a.indexOf(p) >= 0 || games[k].b.indexOf(p) >= 0;
      if (on) { q++; r = 0; if (q > mp) mp = q; } else { r++; q = 0; if (r > mr) mr = r; }
    }
  }
  return { rest: mr, play: mp };
}

/** The base schedule on a random order of games and a random mix of players; keeps the one with the most even rest */
function tourPickShape(n, rnd) {
  var base = TOUR_BASE[n], limR = n === 8 ? 2 : 1, limP = n === 8 ? 2 : 3, best = null, bs = 1e9, ids = [], i;
  for (i = 0; i < n; i++) ids.push(i);
  for (var t = 0; t < 40000; t++) {
    var ord = tourShuffle(base, rnd), pm = tourShuffle(ids, rnd);
    var gs = ord.map(function (g) {
      return { ph: "rot", a: [pm[g[0][0]], pm[g[0][1]]], b: [pm[g[1][0]], pm[g[1][1]]], sa: null, sb: null };
    });
    var r = tourRuns(gs, n), sc = r.rest * 10 + r.play;
    if (sc < bs) { bs = sc; best = gs; }
    if (r.rest <= limR && r.play <= limP) break;
  }
  return best;
}

/** A new tournament for the players of a session (6 or 8 user ids) */
function tourNew(uids, rnd) {
  var n = uids.length, ids = [], i;
  for (i = 0; i < n; i++) ids.push(i);
  return { v: 1, n: n, ids: uids.slice(), coin: tourShuffle(ids, rnd), games: tourPickShape(n, rnd), po: [], drawn: false, semi: null, out: [] };
}

function tourAll(T) { return T.games.concat(T.po); }

/* ---- v242: a player swapped in a session edit. Positions never change; T.swaps = [{ i, from, to, at, old? }] (oldest first):
   from game number `at` (index in tourAll) position i is `to`; `old` lists later games already played (or live) that keep the player they had.
   Games before `at` and the games in `old` stay with the earlier player. A tournament without swaps reads exactly as before. ---- */
/** Index of game g in tourAll(T) (a number passes through), -1 when it is not a game of T */
function _tourGi(T, g) { return typeof g === "number" ? g : tourAll(T).indexOf(g); }
/** The user id on position i in game g (a game object or its index); with no game: the CURRENT player of that position */
function tourUid(T, i, g) {
  var sw = (T && T.swaps) || [], none = g === undefined || g === null, gi = none ? -1 : _tourGi(T, g), u = T.ids[i];
  for (var k = 0; k < sw.length; k++) {
    var x = sw[k];
    if (x.i !== i) continue;
    if (none || gi < 0 || (gi >= x.at && (x.old || []).indexOf(gi) < 0)) u = x.to;
  }
  return u;
}
/** Position whose player in game g (none: now) is user u, -1 when u is not in the tournament */
function tourPosOf(T, u, g) { for (var i = 0; i < T.n; i++) if (tourUid(T, i, g) === u) return i; return -1; }
/** Every player of the tournament now, by position */
function tourCurIds(T) { var o = []; for (var i = 0; i < T.n; i++) o.push(tourUid(T, i)); return o; }
/** One-for-one swap in a session edit: `to` takes the place of `from` in every game not played yet.
    keep = indexes of unplayed games that must stay as they are (a live score game in progress). False (nothing changed) when it cannot be done. */
function tourSwap(T, from, to, keep, nameOf) {
  if (!T || !from || !to || from === to || tourComplete(T)) return false;
  var pos = tourPosOf(T, from);
  if (pos < 0 || tourPosOf(T, to) >= 0) return false;
  if (tourHurtOf(T, pos)) tourBackIn(T, pos, nameOf);   // the new player is fit: the stand-ins and walkovers of the old one go
  var all = tourAll(T), at = all.length, old = [], k;
  for (k = 0; k < all.length; k++) if (!tourDone(all[k])) { at = k; break; }
  for (k = at; k < all.length; k++) if (tourDone(all[k]) || (keep || []).indexOf(k) >= 0) old.push(k);
  var x = { i: pos, from: from, to: to, at: at };
  if (old.length) x.old = old;
  T.swaps = (T.swaps || []).concat([x]);
  return true;
}
/** How a session edit changes the players of a session with a tournament: "none", "swap" (one out, one in: { from, to }) or "count" (anything else) */
function tourPlayersChange(T, oldPlayers, newPlayers) {
  var np = newPlayers || [], cur = T ? tourCurIds(T) : (oldPlayers || []);
  var out = cur.filter(function (u) { return np.indexOf(u) < 0; }), inn = np.filter(function (u) { return cur.indexOf(u) < 0; });
  if (!out.length && !inn.length) return { kind: "none" };
  if (out.length === 1 && inn.length === 1) return { kind: "swap", from: out[0], to: inn[0] };
  return { kind: "count", out: out, inn: inn };
}
function tourNext(T) { var a = tourAll(T); for (var i = 0; i < a.length; i++) if (!tourDone(a[i])) return a[i]; return null; }
function tourRotDone(T) { return T.games.length > 0 && T.games.every(tourDone); }

/** Rotation table: wins, then point difference, then points for, then the coin drawn at the start.
    v242: a row is a POSITION: a player swapped in takes over the row (the old player's games stay in it, shown under the current name);
    the per-player credit of old games lives in tourMatches (Rankings, Elo). */
function tourStats(T) {
  var st = {}, i, out = [];
  for (i = 0; i < T.n; i++) st[i] = { id: i, w: 0, l: 0, pf: 0, pa: 0, p: 0 };
  T.games.forEach(function (g) {
    if (!tourDone(g) || g.v) return;
    var on = tourOn(g);   // v238: whoever was on court (a stand-in gets the game, the hurt player does not)
    if (g.wo) {           // v238: a walkover because nobody could step in: a win or a loss, no points
      var aw = g.sa > g.sb;
      (aw ? on.a : on.b).forEach(function (x) { if (st[x]) { st[x].p++; st[x].w++; } });
      (aw ? on.b : on.a).forEach(function (x) { if (st[x] && x !== g.woHurt) { st[x].p++; st[x].l++; } });
      return;
    }
    on.a.forEach(function (x) { var s = st[x]; if (!s) return; s.p++; s.pf += g.sa; s.pa += g.sb; if (g.sa > g.sb) s.w++; else s.l++; });
    on.b.forEach(function (x) { var s = st[x]; if (!s) return; s.p++; s.pf += g.sb; s.pa += g.sa; if (g.sb > g.sa) s.w++; else s.l++; });
  });
  for (i = 0; i < T.n; i++) out.push(st[i]);
  var coin = T.coin || [];
  return out.sort(function (x, y) {
    return y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf || (coin.indexOf(x.id) - coin.indexOf(y.id)) || x.id - y.id;
  });
}

/** Best with worst: #1+#n, #2+#n-1 ... Sorted by the pair's combined point difference; seed = place in this list */
function tourPairs(T) {
  var r = tourStats(T), n = T.n, out = [];
  for (var k = 0; k < n / 2; k++) {
    var a = r[k], b = r[n - 1 - k];
    out.push({ m: [a.id, b.id], ranks: [k + 1, n - k], diff: (a.pf - a.pa) + (b.pf - b.pa) });
  }
  out.sort(function (x, y) { return y.diff - x.diff || x.ranks[0] - y.ranks[0]; });
  return out.map(function (p, i) { p.seed = i + 1; return p; });
}
function tourSig(T) { return tourPairs(T).map(function (p) { return p.m.slice().sort().join("-"); }).join("|"); }

function tourFinals(T) { return T.po.filter(function (g) { return g.fin; }); }
function tourFinalWins(T) { var wa = 0, wb = 0; tourFinals(T).forEach(function (g) { if (tourDone(g) && !g.v) { if (g.sa > g.sb) wa++; else wb++; } }); return { wa: wa, wb: wb }; }
function tourFinalDecided(T) { var f = tourFinals(T); if (f.length && f[0].v) return true; var w = tourFinalWins(T); return w.wa === 2 || w.wb === 2; }
/** Pair numbers (seed - 1) of the winner and the loser of a played playoff game; -1 for a void game or an empty side */
function _tourW(g) { return g.v ? -1 : (g.sa > g.sb ? g.pa : g.pb); }
function _tourL(g) { return g.v ? -1 : (g.sa > g.sb ? g.pb : g.pa); }
function _tourSide(P, x) { return x >= 0 && P[x] ? P[x].m : []; }
/** The out mark of a pair (seed - 1), or null */
function tourOutOf(T, p) { var o = T.out || []; for (var i = 0; i < o.length; i++) if (o[i].p === p) return o[i]; return null; }
/** How many final games the current results need (the series ends at 2 wins) */
function tourFinalKeep(T) {
  var f = tourFinals(T), wa = 0, wb = 0, keep = 0;
  for (var i = 0; i < f.length; i++) {
    if (wa === 2 || wb === 2) break;
    keep = i + 1;
    if (!tourDone(f[i])) break;
    if (f[i].v) break;
    if (f[i].sa > f[i].sb) wa++; else wb++;
  }
  return keep;
}
/** Trim final games the score no longer needs, add game 2 or 3 when the series asks for it */
function tourSync(T) {
  var f = tourFinals(T);
  if (!f.length) return;
  var kept = f.slice(0, tourFinalKeep(T));
  T.po = T.po.filter(function (g) { return !g.fin; }).concat(kept);
  var w = tourFinalWins(T);
  if (kept.every(tourDone) && !kept[0].v && w.wa < 2 && w.wb < 2 && kept.length < 3) {
    var k = kept[0];
    T.po.push({ ph: "po", fin: true, a: k.a, b: k.b, pa: k.pa, pb: k.pb, lab: "F" + (kept.length + 1), sa: null, sb: null });
  }
}

/** Build the playoff games from what is drawn and played so far */
function tourBuild(T) {
  if (!tourRotDone(T) || !T.drawn) { T.po = []; return; }
  var P = tourPairs(T);
  function mk(x, lab) { return { ph: "po", a: _tourSide(P, x[0]), b: _tourSide(P, x[1]), pa: x[0], pb: x[1], lab: lab, sa: null, sb: null }; }
  if (!T.po.length) {
    if (T.n === 6) T.po = [mk([0, 1], "R1"), mk([0, 2], "R2"), mk([1, 2], "R3")];
    else { var o = T.semi || [0, 1, 2, 3]; T.po = [mk([o[0], o[1]], "S1"), mk([o[2], o[3]], "S2")]; }
  }
  if (T.n === 8 && T.po.length >= 2 && tourDone(T.po[0]) && tourDone(T.po[1])) {
    if (T.po.length === 2) {
      var g0 = T.po[0], g1 = T.po[1];
      var w1 = _tourW(g0), l1 = _tourL(g0), w2 = _tourW(g1), l2 = _tourL(g1);
      T.po.push({ ph: "po", a: _tourSide(P, l1), b: _tourSide(P, l2), pa: l1, pb: l2, lab: "T", sa: null, sb: null });
      T.po.push({ ph: "po", fin: true, a: _tourSide(P, w1), b: _tourSide(P, w2), pa: w1, pb: w2, lab: "F1", sa: null, sb: null });
    }
    tourSync(T);
  }
}

/** Draw the playoff (semifinals at random for 8 players, the pairs for 6) once the rotation is played */
function tourDraw(T, rnd) {
  if (!tourRotDone(T)) return false;
  T.drawn = true; T.semi = T.n === 8 ? tourShuffle([0, 1, 2, 3], rnd) : null; T.po = []; T.out = [];
  tourResolve(T);   // v238: a player who is out already gets a stand-in in the new games
  return true;
}

function tourComplete(T) {
  if (!T.po.length || !T.po.every(tourDone)) return false;
  return T.n === 6 ? T.po.length === 3 : (T.po.length >= 4 && tourFinalDecided(T));
}
/** 0 rotation, 1 pairs drawn / waiting for the draw, 2 playoff running, 3 done */
function tourPhase(T) {
  if (!tourRotDone(T)) return 0;
  if (tourComplete(T)) return 3;
  return T.po.some(tourDone) ? 2 : 1;
}

/** 6 players: the round-robin table of the three pairs (wins, point diff, the game between them, seed) */
function tourPairTable(T) {
  var P = tourPairs(T), tab = P.map(function (p) { return { i: p.seed - 1, w: 0, l: 0, d: 0 }; });
  T.po.forEach(function (g) {
    if (!tourDone(g) || g.v || g.lab.charAt(0) !== "R") return;
    var df = g.sa - g.sb;
    tab[g.pa].d += df; tab[g.pb].d -= df;
    if (df > 0) { tab[g.pa].w++; tab[g.pb].l++; } else { tab[g.pb].w++; tab[g.pa].l++; }
  });
  function h2h(x, y) {
    for (var k = 0; k < T.po.length; k++) {
      var g = T.po[k];
      if (!tourDone(g) || g.v || g.lab.charAt(0) !== "R") continue;
      if (g.pa === x && g.pb === y) return g.sa > g.sb ? -1 : 1;
      if (g.pa === y && g.pb === x) return g.sa > g.sb ? 1 : -1;
    }
    return 0;
  }
  return tab.sort(function (x, y) { return y.w - x.w || y.d - x.d || h2h(x.i, y.i) || x.i - y.i; });
}

/** [1st, 2nd, 3rd] as pair numbers (seed - 1), once everything is played */
function tourOrder(T) {
  if (!tourComplete(T)) return null;
  if (T.n === 8) {
    var t3 = T.po[2], f0 = T.po[3], fw = tourFinalWins(T);
    if (f0.v) return [-1, -1, _tourW(t3)];
    return [fw.wa > fw.wb ? f0.pa : f0.pb, fw.wa > fw.wb ? f0.pb : f0.pa, _tourW(t3)];
  }
  return tourPairTable(T).map(function (x) { return x.i; });
}

/** Who partners and who meets whom in the rotation */
function tourMeet(T) {
  var pc = {}, oc = {};
  function k(a, b) { return a < b ? a + "-" + b : b + "-" + a; }
  T.games.forEach(function (g) {
    [g.a, g.b].forEach(function (t) { var x = k(t[0], t[1]); pc[x] = (pc[x] || 0) + 1; });
    g.a.forEach(function (x) { g.b.forEach(function (y) { var q = k(x, y); oc[q] = (oc[q] || 0) + 1; }); });
  });
  var seen = {}, cover = 0;
  Object.keys(pc).concat(Object.keys(oc)).forEach(function (q) { if (!seen[q]) { seen[q] = 1; cover++; } });
  return { pc: pc, oc: oc, cover: cover, total: T.n * (T.n - 1) / 2, partners: Object.keys(pc).length };
}

function tourScoreOk(sa, sb) {
  function ok(x) { return typeof x === "number" && isFinite(x) && Math.floor(x) === x && x >= 0 && x <= TOUR_MAX_SCORE; }
  return ok(sa) && ok(sb) && sa !== sb;
}

function _tourTry(g, sa, sb, fn) { var o = [g.sa, g.sb]; g.sa = sa; g.sb = sb; var r = fn(); g.sa = o[0]; g.sb = o[1]; return r; }

/** What a correction of a played game would throw away: null, or { kind: "pairs"|"semi"|"final", ... } */
function tourImpact(T, g, sa, sb) {
  if (!tourDone(g)) return null;
  var played = T.po.filter(tourDone).length;
  if (g.ph === "rot" && tourRotDone(T) && T.po.length) {
    var before = tourSig(T), after = _tourTry(g, sa, sb, function () { return { sig: tourSig(T), pairs: tourPairs(T).map(function (p) { return p.m.slice(); }) }; });
    var outs = (T.out || []).length;
    if (before !== after.sig && (played || outs)) return { kind: "pairs", pairs: after.pairs, played: played, outs: outs };
  }
  var i = T.po.indexOf(g);
  if (g.wo || g.v) return null;
  if (g.ph === "po" && T.n === 8 && i >= 0 && i < 2 && T.po.length > 2) {
    var flip = (g.sa > g.sb) !== (sa > sb);
    if (flip && (tourDone(T.po[2]) || tourFinals(T).some(tourDone))) return { kind: "semi" };
  }
  if (g.fin) {
    var lost = _tourTry(g, sa, sb, function () { return tourFinals(T).slice(tourFinalKeep(T)).some(tourDone); });
    if (lost) return { kind: "final" };
  }
  return null;
}

/** Write a score into a game and fix what depends on it. Returns what happened. */
function tourApply(T, g, sa, sb) {
  if (g.wo || g.v) return { fixed: false, pairsChanged: false, semiReset: false, blocked: true };   // a walkover is not a score to correct
  var was = tourDone(g), oldA = was && g.sa > g.sb, res = { fixed: was, pairsChanged: false, semiReset: false };
  var before = (g.ph === "rot" && tourRotDone(T)) ? tourSig(T) : null;
  g.sa = sa; g.sb = sb;
  var i = T.po.indexOf(g);
  if (g.ph === "rot") {
    if (before !== null && tourSig(T) !== before) { T.po = []; T.drawn = false; T.semi = null; T.out = []; res.pairsChanged = true; }
    tourBuild(T);
  } else if (T.n === 8 && i >= 0 && i < 2 && T.po.length > 2 && was && oldA !== (sa > sb)) {
    T.po.length = 2; res.semiReset = true; tourBuild(T);
  } else tourBuild(T);
  tourResolve(T);
  return res;
}

/* ---- v228: a pair that cannot continue ---- */

var TOUR_WHY = ["injury", "left", "other"];

/** Give walkovers (21–0, flagged wo) for every game still to play that has a pair that is out; a game with nobody left is void.
    Loops because a walkover decides who plays the next game. */
function tourResolve(T, nameOf) {
  for (var it = 0; it < 30; it++) {
    tourBuild(T);
    var changed = false;
    T.po.forEach(function (g) {
      if (tourDone(g)) return;
      var na = g.pa < 0 || !!tourOutOf(T, g.pa), nb = g.pb < 0 || !!tourOutOf(T, g.pb);
      if (na && nb) { g.sa = 0; g.sb = 0; g.v = true; changed = true; }
      else if (na) { g.sa = 0; g.sb = TOUR_WO; g.wo = true; changed = true; }
      else if (nb) { g.sa = TOUR_WO; g.sb = 0; g.wo = true; changed = true; }
    });
    if (_tourHurtFill(T, nameOf)) changed = true;   // v238: stand-ins for players who are out
    if (!changed) break;
  }
}

/** Mark a pair (seed - 1) out. Only once the pairs are drawn. Returns false when it cannot be done. */
function tourMarkOut(T, p, why, note) {
  if (!T || !T.drawn || tourComplete(T) || p < 0 || p >= T.n / 2 || tourOutOf(T, p)) return false;
  if (TOUR_WHY.indexOf(why) < 0) why = "other";
  T.out = (T.out || []).concat([{ p: p, why: why, note: String(note || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60) }]);
  tourResolve(T);
  return true;
}

/** How many played games an undo would throw away (the walkovers themselves are always redone) */
function tourUndoImpact(T, p) {
  if (!tourOutOf(T, p)) return 0;
  var flagged = T.po.some(function (g) { return g.wo || g.v; });
  if (!flagged) return 0;
  if (T.n === 8 && (T.po.slice(0, 2).some(function (g) { return g.wo || g.v; }))) return T.po.slice(2).filter(function (g) { return tourDone(g) && !g.wo && !g.v; }).length;
  return 0;
}

/** Bring a pair back: walkovers are cleared and given again to whoever is still out */
function tourUndoOut(T, p) {
  if (!tourOutOf(T, p)) return false;
  T.out = T.out.filter(function (o) { return o.p !== p; });
  var semiFlag = T.n === 8 && T.po.slice(0, 2).some(function (g) { return g.wo || g.v; });
  T.po.forEach(function (g) { if (g.wo || g.v) { g.sa = null; g.sb = null; delete g.wo; delete g.v; } });
  if (semiFlag) T.po.length = 2;
  tourResolve(T);
  return true;
}

/* ---- v238: a player who cannot play gets a stand-in ----
   g.subs = [{ from, to, why, note }]: in this game player `to` plays in the place of `from` (positions in ids).
   T.hurt = [{ i, why, note }]: players who are out for every game still to play; each of those games gets a stand-in.
   A stand-in is someone not on court in that game and not out. Nobody free: the game is a walkover (g.wo, g.woHurt = the player). */

function _tourClean(note) { return String(note || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60); }
/** Who is on court in a game, with the stand-ins in place */
function tourOn(g) {
  var subs = (g && g.subs) || [];
  function m(x) { for (var i = 0; i < subs.length; i++) if (subs[i].from === x) return subs[i].to; return x; }
  return { a: ((g && g.a) || []).map(m), b: ((g && g.b) || []).map(m) };
}
function _tourOnList(g) { var o = tourOn(g); return o.a.concat(o.b); }
function tourHurtOf(T, i) { var h = T.hurt || []; for (var k = 0; k < h.length; k++) if (h[k].i === i) return h[k]; return null; }
/** The stand-in entry that put player `to` on court in this game, or null */
function tourSubOf(g, to) { var s = (g && g.subs) || []; for (var k = 0; k < s.length; k++) if (s[k].to === to) return s[k]; return null; }
/** Out for good: hurt, or in a pair that is out */
function _tourGone(T, i) {
  if (tourHurtOf(T, i)) return true;
  if (!T.drawn || !(T.out || []).length || !tourRotDone(T)) return false;
  var P = tourPairs(T);
  for (var k = 0; k < P.length; k++) if (P[k].m.indexOf(i) >= 0) return !!tourOutOf(T, k);
  return false;
}
/** Real games a player has played so far (walkovers and void games left out) */
function tourPlayed(T, i) { return tourAll(T).filter(function (g) { return tourDone(g) && !g.wo && !g.v && _tourOnList(g).indexOf(i) >= 0; }).length; }
/** Games a player has had before game g, the planned ones too, so the stand-in games of later games are spread out */
function _tourLoad(T, i, g) { var all = tourAll(T), k = all.indexOf(g); return all.slice(0, k < 0 ? all.length : k).filter(function (x) { return !x.wo && !x.v && _tourOnList(x).indexOf(i) >= 0; }).length; }
/** Who may step in for `from` in this game. `on` = who is on court now (the live score may differ from the saved game) */
function tourEligible(T, g, from, on) {
  on = on || _tourOnList(g);
  var out = [];
  for (var i = 0; i < T.n; i++) if (i !== from && on.indexOf(i) < 0 && !_tourGone(T, i)) out.push(i);
  return out;
}
/** The stand-in the app picks: fewest games before this one, then name A–Z. -1 when nobody is free. */
function tourAutoPick(T, g, from, nameOf, on) {
  var e = tourEligible(T, g, from, on);
  if (!e.length) return -1;
  var nm = nameOf || function (i) { return String(i); };
  e.sort(function (x, y) { return _tourLoad(T, x, g) - _tourLoad(T, y, g) || String(nm(x)).localeCompare(String(nm(y))) || x - y; });
  return e[0];
}
/** How many games in a row player i is on court, ending with game g */
function tourRowRun(T, g, i) {
  var all = tourAll(T), k = all.indexOf(g), n = 0;
  for (; k >= 0; k--) { var x = all[k]; if (x.v || (x.wo && !x.subs)) break; if (_tourOnList(x).indexOf(i) < 0) break; n++; }
  return n;
}
function _tourSetSub(g, from, to, why, note) {
  var subs = (g.subs || []).slice(), s = null, k;
  for (k = 0; k < subs.length; k++) if (subs[k].to === from) { s = subs[k]; break; }
  if (s) {   // `from` is a stand-in already: change who stands in (or the player comes back)
    if (s.from === to) subs.splice(k, 1); else { s.to = to; s.why = why; s.note = note; }
  } else subs.push({ from: from, to: to, why: why, note: note });
  if (subs.length) g.subs = subs; else delete g.subs;
}
function _tourHurtWO(g, i) {
  var on = tourOn(g), inA = on.a.indexOf(i) >= 0;
  g.sa = inA ? 0 : TOUR_WO; g.sb = inA ? TOUR_WO : 0; g.wo = true; g.woHurt = i;
}
/** Every game still to play with a hurt player on court gets a stand-in, or a walkover when nobody is free. True when a walkover was given. */
function _tourHurtFill(T, nameOf) {
  if (!(T.hurt || []).length) return false;
  var wo = false;
  tourAll(T).forEach(function (g) {
    for (var it = 0; it < 4; it++) {
      if (tourDone(g) || g.wo || g.v) return;
      var on = _tourOnList(g), p = -1;
      for (var k = 0; k < on.length; k++) if (tourHurtOf(T, on[k])) { p = on[k]; break; }
      if (p < 0) return;
      var h = tourHurtOf(T, p), pick = tourAutoPick(T, g, p, nameOf);
      if (pick >= 0) _tourSetSub(g, p, pick, h.why, h.note);
      else { _tourHurtWO(g, p); wo = true; return; }
    }
  });
  return wo;
}
/** Replace player `from` in game gi by `to` (-1 = nobody: walkover). all = `from` is out for every game left. Returns false when it cannot be done. */
function tourSub(T, gi, from, to, why, note, all, nameOf) {
  var g = T && tourAll(T)[gi];
  if (!g || tourDone(g) || g.wo || g.v || tourComplete(T)) return false;
  if (_tourOnList(g).indexOf(from) < 0) return false;
  if (to !== -1 && tourEligible(T, g, from).indexOf(to) < 0) return false;
  if (to === -1 && tourEligible(T, g, from).length) return false;   // a walkover only when really nobody is free
  if (TOUR_WHY.indexOf(why) < 0) why = "other";
  note = _tourClean(note);
  if (all) T.hurt = (T.hurt || []).filter(function (h) { return h.i !== from; }).concat([{ i: from, why: why, note: note }]);
  if (to >= 0) _tourSetSub(g, from, to, why, note); else _tourHurtWO(g, from);
  tourResolve(T, nameOf);
  return true;
}
/** A hurt player can play again: the stand-ins and walkovers of the games not played yet are cleared */
function tourBackIn(T, i, nameOf) {
  if (!T || !tourHurtOf(T, i) || tourComplete(T)) return false;
  T.hurt = T.hurt.filter(function (h) { return h.i !== i; });
  var rotLocked = tourRotDone(T) && T.drawn, semiFlag = false;
  tourAll(T).forEach(function (g) {
    if (g.wo && g.woHurt === i && !(g.ph === "rot" && rotLocked)) {
      if (T.n === 8 && T.po.indexOf(g) >= 0 && T.po.indexOf(g) < 2) semiFlag = true;
      g.sa = null; g.sb = null; delete g.wo; delete g.woHurt;
    }
    if (tourDone(g) || !g.subs) return;
    g.subs = g.subs.filter(function (s) { return s.from !== i; });
    if (!g.subs.length) delete g.subs;
  });
  if (semiFlag && T.po.length > 2) T.po.length = 2;
  tourResolve(T, nameOf);
  return true;
}
function _tourSameSet(x, y) { return x.length === y.length && x.every(function (u) { return y.indexOf(u) >= 0; }); }
/** A live score game came back. tour.subs = [{ from, to, why, note, all }] as user ids, in the order they were made in live score.
    The teams must be the game's players with those stand-ins (either side first). The stand-ins are written first, then the score.
    Returns false (and changes nothing) when the teams do not match or a stand-in is not allowed any more. */
function tourLiveApply(T, tour, sa, sb, la, lb, nameOf) {
  var gi = tour ? tour.gi : -1, g = T && tourAll(T)[gi];
  if (!g || tourDone(g) || g.wo || g.v) return false;
  var on = tourOn(g), id = function (p) { return tourUid(T, p, gi); }, ea = on.a.map(id), eb = on.b.map(id), subs = tour.subs || [];
  subs.forEach(function (x) { [ea, eb].forEach(function (arr) { var k = arr.indexOf(x.from); if (k >= 0) arr[k] = x.to; }); });
  la = la || tour.a || []; lb = lb || tour.b || [];
  var flip;
  if (_tourSameSet(ea, la) && _tourSameSet(eb, lb)) flip = false;
  else if (_tourSameSet(ea, lb) && _tourSameSet(eb, la)) flip = true;
  else return false;
  function put(X) {
    for (var k = 0; k < subs.length; k++) {
      var x = subs[k], f = tourPosOf(X, x.from, gi), to = tourPosOf(X, x.to, gi);
      if (f < 0 || to < 0 || !tourSub(X, gi, f, to, x.why, x.note, !!x.all, nameOf)) return false;
    }
    return true;
  }
  if (subs.length && !put(JSON.parse(JSON.stringify(T)))) return false;   // tried on a copy first: a refused stand-in leaves the game as it was
  put(T);
  tourApply(T, tourAll(T)[gi], flip ? sb : sa, flip ? sa : sb);
  return true;
}

/* ---- v228: the games of a tournament as stats records ---- */

/** Match-like records for the real games of a session tournament (walkovers and void games are left out). id "t:<sid>:<n>", tid = session id */
function tourMatches(s, gid) {
  var T = tourOf(s), out = [];
  if (!T) return out;
  var base = s.createdAt || 0;
  function add(g, idx, stage) {
    function uid(i) { return tourUid(T, i, idx); }   // v242: the player who was on that position in THAT game
    if (!tourDone(g) || g.wo || g.v || !g.a || !g.b || g.a.length !== 2 || g.b.length !== 2) return;
    var on = tourOn(g), a = on.a.map(uid), b = on.b.map(uid);   // v238: the stand-in gets the game in Rankings and Elo
    if (a.concat(b).some(function (u) { return !u; })) return;
    out.push({ id: "t:" + s.id + ":" + idx, groupId: gid || s.groupId || "", sessionId: s.id, date: s.date || "", type: "md", teamA: a, teamB: b,
      games: [{ a: g.sa, b: g.sb }], minutes: 0, court: s.courtName || "", shuttles: 0, mode: "competition", createdBy: "", createdAt: base + idx,
      confirmed: true, tid: s.id, tstage: stage });
  }
  T.games.forEach(function (g, i) { add(g, i, "rot"); });
  T.po.forEach(function (g, i) { add(g, T.games.length + i, g.lab); });
  return out;
}
function _tourMKey(m) {
  var g = (m.games || [])[0] || {}, ka = (m.teamA || []).slice().sort().join("+"), kb = (m.teamB || []).slice().sort().join("+");
  var x = [ka + "=" + g.a, kb + "=" + g.b].sort();
  return String(m.sessionId) + "|" + x.join("~");
}
/** Saved matches plus the tournament games, oldest first. A tournament game that someone also typed in as a normal match is counted once. */
function tourMergeMatches(real, sessions, gid) {
  var res = (real || []).filter(function (m) { return !m.tid; }), seen = {};
  res.forEach(function (m) { if (m.sessionId && m.teamA && m.teamB && m.games && m.games[0]) seen[_tourMKey(m)] = 1; });
  (sessions || []).forEach(function (s) {
    tourMatches(s, gid).forEach(function (m) { if (!seen[_tourMKey(m)]) res.push(m); });
  });
  return res.sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")) || ((a.createdAt || 0) - (b.createdAt || 0)); });
}

/* ============================================================
   The screen
   ============================================================ */

var _tnSid = null;       // session whose tournament screen is open
var _tnEdit = null;      // { gi, sa, sb, err } score being typed
var _tnAnim = null;      // { kind: "teams" | "draw" } while the draw plays
var _tnTimer = null;
var _tnToast = "";
var _tnBusy = false;
var _tnOut = null;       // { p, why, note } the "mark pair out" panel that is open
var _tnTab = null;       // v237: the step tab being looked at (null = follow the current step)
var _tnSig = "";       // what the tournaments of all sessions looked like when the stats games were last built

var TN_DICE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/></svg>';
var TN_CROWN = '<svg class="tn-crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11z"/><rect x="3" y="19.5" width="18" height="2" rx="1"/></svg>';

function _tnSession(sid) {
  for (var i = 0; i < lastSessions.length; i++) if (lastSessions[i].id === sid) return lastSessions[i];
  return null;
}
/** The session's tournament, only if it has the right shape: an old or half-saved value counts as none, so a bad field can never break the list */
function tourOf(s) {
  var T = s && s.tourney;
  return T && T.v === 1 && Array.isArray(T.games) && Array.isArray(T.po) && Array.isArray(T.ids) && T.n === T.ids.length ? T : null;
}

/** Only people who may edit the session (or its bill) run the tournament; everyone else watches */
function tourCanRun(s) { return !!s && (canEditSessionDetails(s) || canEditBill(s)); }
function _tnReduced() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
function _tnFill(str, o) { return String(str).replace(/\{(\w+)\}/g, function (m, k) { return o[k] === undefined ? m : o[k]; }); }
/** v242: g = the game (object or index) when the name is for one game; without it the current player of the position */
function _tnPlain(T, i, g) { return plainUserName(findUser(tourUid(T, i, g))); }
function _tnWho(T, i, sz, g) { var u = tourUid(T, i, g); return '<span class="tn-who">' + avatarHtml(u, sz || 22) + '<span class="tn-nm">' + getUserName(u) + '</span></span>'; }
function _tnPairName(T, m) { return m && m.length ? getUserName(tourUid(T, m[0])) + " + " + getUserName(tourUid(T, m[1])) : t("tourNobody"); }
function _tnPairPlain(T, m) { return m && m.length ? _tnPlain(T, m[0]) + " + " + _tnPlain(T, m[1]) : t("tourNobody"); }
/** Both players of a side, or a dash when nobody is there (a void game above it) */
function _tnTeam(T, arr, sz) { return arr && arr.length ? arr.map(function (i) { return _tnWho(T, i, sz || 22); }).join("") : '<span class="tn-who tn-none">\u2014</span>'; }
/** v238: one side of a game as it is played: a stand-in shows with a gold tag "↺ for Nith" */
function _tnSide(T, g, side, sz) {
  var on = tourOn(g), arr = side === "a" ? on.a : on.b;
  if (!arr.length) return '<span class="tn-who tn-none">—</span>';
  return arr.map(function (i) {
    var sb = tourSubOf(g, i);
    return _tnWho(T, i, sz || 22, g) + (sb ? '<span class="tn-si">' + escapeHtml(_tnFill(t("tourSubTag"), { name: _tnPlain(T, sb.from, g) })) + '</span>' : '');
  }).join("");
}
/** v238: "Nith (injury)" for a player who is out */
function _tnHurtName(T, i) { var h = tourHurtOf(T, i); return _tnPlain(T, i) + (h ? " (" + t("tourWhy_" + h.why) + (h.note ? ", " + h.note : "") + ")" : ""); }
function _tnHurtTag(T, i) { var h = tourHurtOf(T, i); return h ? '<span class="tn-outtag">' + escapeHtml(_tnFill(t("tourOutTag"), { why: t("tourWhy_" + h.why) })) + '</span>' : ''; }
/** "Out: injury" (+ the note), plain text */
function _tnOutTxt(T, p) {
  var o = p >= 0 ? tourOutOf(T, p) : null;
  if (!o) return "";
  return _tnFill(t("tourOutTag"), { why: t("tourWhy_" + o.why) }) + (o.note ? " (" + o.note + ")" : "");
}
function _tnOutTag(T, p) { var x = _tnOutTxt(T, p); return x ? '<span class="tn-outtag">' + escapeHtml(x) + '</span>' : ''; }
/** What a side of a game shows as its score */
function _tnShow(g, side) {
  if (!tourDone(g) || g.v) return "–";
  var win = side === "a" ? g.sa > g.sb : g.sb > g.sa;
  if (g.wo) return win ? t("tourWO") : "–";
  return String(side === "a" ? g.sa : g.sb);
}
function _tnGameTxt(g) { return !tourDone(g) ? "–" : g.v ? t("tourOutVoid") : g.wo ? t("tourWO") : g.sa + "–" + g.sb; }
function tourLabText(lab) {
  if (lab === "rot") return t("tourBadgeRot");
  var c = String(lab).charAt(0), n = String(lab).slice(1);
  if (c === "S") return _tnFill(t("tourSemi"), { n: n });
  if (c === "R") return _tnFill(t("tourRound"), { n: n });
  if (c === "F") return _tnFill(t("tourFinalG"), { n: n });
  return t("tourThirdPlace");
}
function _tnLab(g) {
  var c = g.lab.charAt(0), n = g.lab.slice(1);
  if (c === "S") return _tnFill(t("tourSemi"), { n: n });
  if (c === "R") return _tnFill(t("tourRound"), { n: n });
  if (c === "F") return _tnFill(t("tourFinalG"), { n: n });
  return t("tourThirdPlace");
}
function _tnDrawWord(T) { return T.n === 8 ? t("tourWordSemi") : t("tourWordPairs"); }

/** What the main button says and does for this session now */
function tourStage(s) {
  var T = tourOf(s), org = tourCanRun(s), n = (s.players || []).length;
  if (_tnAnim && _tnSid === s.id) return { act: "", label: t("tourDrawing"), disabled: true };
  if (!T) {
    if (!org) return null;
    if (!tourSizeOk(n)) return { act: "", label: t("tourNeed"), disabled: true };
    return { act: "start", icon: TN_DICE, label: _tnFill(t("tourBtnStart"), { n: n, g: tourRounds(n) }) };
  }
  if (tourComplete(T)) return { act: "winner", icon: icon("trophy", 20), label: t("tourBtnWinner") };
  if (!org) return { act: "view", label: t("tourBtnView") };
  if (tourRotDone(T) && !T.drawn) return { act: "draw", icon: TN_DICE, label: T.n === 8 ? t("tourBtnSemi") : t("tourBtnPairs") };
  var g = tourNext(T);
  if (!g) return { act: "view", label: t("tourBtnView") };
  if (g.ph === "rot") return { act: "play", label: _tnFill(t("tourBtnPlay"), { k: T.games.filter(tourDone).length + 1, g: T.games.length }) };
  return { act: "play", label: _tnFill(t("tourBtnPlayLab"), { label: _tnLab(g) }) };
}

function _tnLine(T) {
  if (!T) return t("tourLineNone");
  var ph = tourPhase(T), played = tourAll(T).filter(tourDone).length;
  if (ph === 3) return _tnFill(t("tourLineDone"), { k: played });
  if (!tourRotDone(T)) return _tnFill(t("tourLineRot"), { k: T.games.filter(tourDone).length, g: T.games.length });
  if (!T.drawn) return _tnFill(t("tourLineWait"), { w: _tnDrawWord(T) });
  return _tnFill(t("tourLinePlay"), { k: T.po.filter(tourDone).length });
}

/** The strip on the session card in the sessions list */
function tourCardHtml(s) {
  var st = tourStage(s);
  if (!st) return "";
  var T = tourOf(s), played = T ? tourAll(T).filter(tourDone).length : 0;
  return '<div class="tn-card">' +
    '<div class="tn-card-line">' + icon("trophy", 14) + '<span>' + escapeHtml(_tnLine(T)) + '</span></div>' +
    (T ? '<div class="tn-bar"><i style="width:' + (tourComplete(T) ? 100 : Math.round(played / 12 * 100)) + '%"></i></div>' : '') +
    '<button type="button" class="tn-btn"' + (st.disabled ? ' disabled' : '') + ' onclick="tourCardAct(\'' + jsq(s.id) + '\')">' + (st.icon || "") + '<span>' + escapeHtml(st.label) + '</span></button>' +
    '</div>';
}

function tourCardAct(sid) {
  var s = _tnSession(sid);
  if (!s) return;
  var st = tourStage(s);
  if (!st || st.disabled) return;
  if (st.act === "start") { tourAskStart(s, true); return; }   // v237: asks first, the screen opens only on yes
  _tnOpen(sid);
  _tnStageAct(s, st);
}

/** v237: starting a tournament asks first; on yes the screen opens and the teams are drawn straight away */
function tourAskStart(s, open) {
  var n = (s.players || []).length;
  askConfirm({ title: t("tourStartTitle"), body: _tnFill(t("tourStartBody"), { g: tourRounds(n), n: n }), kind: "ask", yes: t("tourStartYes"), no: t("cancel") }, function () {
    var cur = _tnSession(s.id) || s;
    if (tourOf(cur)) return;
    if (open || !document.getElementById("tnScreen")) _tnOpen(cur.id);
    tourStartDraw(cur, "teams");
  });
}

/** The main button, on the card and on the screen */
function _tnStageAct(s, st) {
  if (st.act === "start") tourAskStart(s, false);
  else if (st.act === "draw") tourStartDraw(s, "draw");
  else if (st.act === "play") {
    var g = tourNext(tourOf(s));
    if (g) { _tnEdit = { gi: tourAll(tourOf(s)).indexOf(g), sa: 21, sb: 15, err: "" }; _tnToast = ""; tourRender(); _tnScroll(".tn-game.cur"); }
  } else if (st.act === "winner") _tnScroll("#tnWinner");
  else tourRender();
}

var _tnToastKeep = false;
function _tnOpen(sid) {
  _tnSid = sid; _tnEdit = null; _tnTab = null; _tnOut = null; if (!_tnToastKeep) _tnToast = ""; _tnToastKeep = false;
  var el = document.getElementById("tnScreen");
  if (!el) {
    el = document.createElement("div");
    el.id = "tnScreen"; el.className = "tn-screen";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", t("tourTitle"));
    el.innerHTML = '<div class="tn-top"><button type="button" class="tn-close" data-act="close" aria-label="' + escapeHtml(t("close")) + '">' + icon("back", 20) + '</button>' +
      '<div class="tn-ttl"><b>' + escapeHtml(t("tourTitle")) + '</b><small id="tnSub"></small></div></div><div class="tn-wrap" id="tnBody"></div>';
    el.onclick = _tnClick;
    el.oninput = function (ev) { if (_tnOut && ev.target && ev.target.id === "tnOutNote") _tnOut.note = String(ev.target.value).slice(0, 60); };
    document.body.appendChild(el);
    document.body.classList.add("tn-open");
    document.addEventListener("keydown", _tnKey, true);
  }
  tourRender();
}
function _tnKey(e) {
  if (e.key !== "Escape") return;
  if (document.getElementById("askSheet")) return;   // the ask sheet closes first
  tourClose();
}
function tourClose() {
  clearInterval(_tnTimer); _tnAnim = null; _tnEdit = null; _tnOut = null; _tnSid = null;
  var el = document.getElementById("tnScreen"); if (el) el.remove();
  document.body.classList.remove("tn-open");
  document.removeEventListener("keydown", _tnKey, true);
  _tnRefreshHost();
}
function _tnScroll(sel) {
  try { setTimeout(function () { var e = document.querySelector(sel); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: _tnReduced() ? "auto" : "smooth", block: "center" }); }, 60); } catch (e) {}
}

/** Called when sessions change on the server: show the newest tournament unless someone is typing */
/** v235: the button sits in the session's Games tab; keep its label in step with the newest scores */
function _tnRefreshHost() {
  try {
    if (typeof currentPage === "undefined" || currentPage !== "session-detail" || typeof currentSession === "undefined" || !currentSession) return;
    var box = document.querySelector(".tn-card");
    if (!box) return;
    var fresh = _tnSession(currentSession.id) || currentSession, tmp = document.createElement("div");
    tmp.innerHTML = tourCardHtml(fresh);
    if (tmp.firstChild) box.replaceWith(tmp.firstChild); else box.remove();
  } catch (e) {}
}
function tourOnSessions() {
  _tnRefreshHost();
  if (!_tnSid || !document.getElementById("tnScreen")) return;
  var s = _tnSession(_tnSid);
  if (!s) { tourClose(); return; }
  if (_tnAnim || _tnBusy) return;
  if (_tnEdit && tourOf(s) && _tnEdit.gi >= tourAll(tourOf(s)).length) _tnEdit = null;
  if (_tnEdit || _tnOut) return;   // do not wipe the score or note being typed
  tourRender();
}

/** Sessions changed: the tournament games feed Rankings and stats, so rebuild them when any tournament moved */
function tourSessionsChanged() {
  var sg = (typeof lastSessions !== "undefined" ? lastSessions : []).map(function (s) { var T = tourOf(s); return T ? s.id + ":" + JSON.stringify(T) : ""; }).join("|");
  if (sg === _tnSig) return;
  _tnSig = sg;
  if (typeof rebuildMatches !== "function") return;
  rebuildMatches();
  if (/^(stats|matches|dashboard|user|home)$/.test(currentPage) && typeof refreshCurrentPage === "function") refreshCurrentPage("matches");
  if (currentPage === "session-detail" && typeof refreshSessionGames === "function") refreshSessionGames();
}

function _tnPut(s) {
  _tnBusy = true;
  return dbUpdateSession(s.id, { tourney: JSON.parse(JSON.stringify(s.tourney)) }).then(function () {
    _tnBusy = false;
    if (typeof hofSave === "function" && tourOf(s) && tourComplete(tourOf(s))) hofSave(s);   // the winners are kept in the Hall of Fame
  }, function (e) {
    _tnBusy = false;
    dbOnError(e, "sessions");
    showToast(t("tourSaveFail"));
  });
}

/** The shuffle on screen, then the real draw is made and saved */
function tourStartDraw(s, kind) {
  if (_tnAnim || _tnBusy) return;
  var sid = s.id;
  function fin() {
    clearInterval(_tnTimer); _tnAnim = null;
    var cur = _tnSession(sid) || s;
    if (kind === "teams") {
      if (tourOf(cur) || !tourSizeOk((cur.players || []).length)) { tourRender(); return; }
      cur.tourney = tourNew(cur.players.slice());
      _tnToast = _tnFill(t("tourTeamsDrawn"), { g: cur.tourney.games.length });
    } else {
      if (!tourOf(cur) || !tourDraw(cur.tourney)) { tourRender(); return; }
      _tnToast = cur.tourney.n === 8 ? t("tourSemiDrawn") : t("tourPairsDrawn");
    }
    _tnTab = null;
    _tnPut(cur);
    tourRender(); _tnScroll(".tn-game.cur");
  }
  _tnToast = ""; _tnEdit = null;
  _tnAnim = { kind: kind, tick: 0 };
  if (_tnReduced()) { fin(); return; }
  tourRender();
  var t0 = 0;
  _tnTimer = setInterval(function () { t0++; if (t0 >= 14) fin(); else tourRender(); }, 110);
}

/** v236: count a tournament game in the live score screen; the result comes back through tourFromLive */
/** v236: the live score for a session with a tournament running starts on the up-next pair (nobody picks players) */
function tourLivePreset(s) {
  var T = tourOf(s), g = T && tourNext(T);
  if (!g || g.wo || g.v || typeof _lsBlank !== "function") return null;
  var gi = tourAll(T).indexOf(g), on = tourOn(g), a = on.a.map(function (p) { return tourUid(T, p, gi); }), b = on.b.map(function (p) { return tourUid(T, p, gi); });
  var st = _lsBlank(s.id, "md");
  st.a = a; st.b = b; st.tour = { sid: s.id, gi: gi, a: a.slice(), b: b.slice() };
  return st;
}
function tourStartLive(s, gi) {
  var T = tourOf(s), g = T && tourAll(T)[gi];
  if (!g || tourDone(g) || g.wo || g.v || typeof _lsBlank !== "function" || typeof _lsShow !== "function") return;
  var on = tourOn(g), a = on.a.map(function (p) { return tourUid(T, p, gi); }), b = on.b.map(function (p) { return tourUid(T, p, gi); });
  live = _lsBlank(s.id, "md");
  live.a = a; live.b = b;
  live.tour = { sid: s.id, gi: gi, a: a.slice(), b: b.slice() };
  lsSave(); liveMode = "count";
  tourClose();
  _lsShow();
}
function _tnSame(x, y) { return x.length === y.length && x.every(function (u) { return y.indexOf(u) >= 0; }); }
/** The live score screen saved a game that was started from the tournament: put its score on that game */
function tourFromLive(tour, sa, sb, la, lb) {
  var s = _tnSession(tour.sid), T = tourOf(s);
  var ok = tourLiveApply(T, tour, sa, sb, la, lb, function (i) { return _tnPlain(T, i); });
  if (ok) { _tnToast = t("tourLiveSaved"); _tnPut(s); }
  else _tnToast = t("tourLiveMismatch");
  _tnToastKeep = true;
  if (s) { _tnOpen(s.id); _tnScroll(".tn-game.cur"); }
}

function _tnClick(ev) {
  var b = ev.target.closest ? ev.target.closest("[data-act]") : null;
  if (!b) return;
  var s = _tnSession(_tnSid), act = b.getAttribute("data-act");
  if (act === "close") { tourClose(); return; }
  if (!s) return;
  var T = tourOf(s), org = tourCanRun(s);
  if (act === "share") { if (T && tourComplete(T) && typeof openShareCard === "function") openShareCard("", "tournament", s.id); return; }
  if (act === "stage") { var st = tourStage(s); if (st && !st.disabled) _tnStageAct(s, st); return; }
  if (act === "tab") {
    var k = +b.getAttribute("data-k");
    if (!T || b.disabled || k > _tnViewNow(T)) return;
    _tnTab = k === _tnViewNow(T) ? null : k; _tnEdit = null; _tnOut = null; tourRender();
    var tb = document.querySelector('.tn-tab-b[data-k="' + k + '"]'); if (tb) tb.focus();
    return;
  }
  if (!T || !org) return;
  if (act === "edit") {
    var gi = +b.getAttribute("data-i"), g = tourAll(T)[gi]; if (!g) return;
    _tnToast = ""; _tnEdit = { gi: gi, sa: tourDone(g) ? g.sa : 21, sb: tourDone(g) ? g.sb : 15, err: "" }; tourRender();
  } else if (act === "live") {
    tourStartLive(s, +b.getAttribute("data-i"));
  } else if (act === "adj" && _tnEdit) {
    var k = b.getAttribute("data-t") === "a" ? "sa" : "sb";
    _tnEdit[k] = Math.max(0, Math.min(TOUR_MAX_SCORE, _tnEdit[k] + (+b.getAttribute("data-d")))); _tnEdit.err = ""; tourRender();
  } else if (act === "save") tourSaveScore(s);
  else if (act === "cancel") { _tnEdit = null; tourRender(); }
  else if (act === "out-open") { if (!T.drawn || tourComplete(T)) return; _tnEdit = null; _tnOut = { p: +b.getAttribute("data-p"), why: "injury", note: "" }; tourRender(); }
  else if (act === "out-why" && _tnOut) { _tnOut.why = b.getAttribute("data-w"); tourRender(); }
  else if (act === "out-cancel") { _tnOut = null; tourRender(); }
  else if (act === "out-save" && _tnOut) tourSaveOut(s);
  else if (act === "out-undo") tourAskUndoOut(s, +b.getAttribute("data-p"));
  else if (act === "sub") _tnSubFromScreen(s, +b.getAttribute("data-i"));
  else if (act === "back-in") tourAskBackIn(s, +b.getAttribute("data-p"));
  else if (act === "reset") {
    askYes(t("tourResetTitle"), function () {
      var cur = _tnSession(s.id); if (!cur) return;
      clearInterval(_tnTimer); _tnAnim = null; _tnEdit = null; _tnToast = "";
      cur.tourney = null;
      _tnBusy = true;
      dbUpdateSession(cur.id, { tourney: firebase.firestore.FieldValue.delete() }).then(function () { _tnBusy = false; }, function (e) { _tnBusy = false; dbOnError(e, "sessions"); showToast(t("tourSaveFail")); });
      tourClose();
    }, { kind: "danger", body: t("tourResetBody"), yes: tourComplete(T) ? t("tourReset") : t("tourCancelYes"), no: t("tourKeepPlaying") });
  }
}

function tourSaveScore(s) {
  var T = tourOf(s), e = _tnEdit, g = e && tourAll(T)[e.gi];
  if (!g) { _tnEdit = null; tourRender(); return; }
  if (!tourScoreOk(e.sa, e.sb)) { e.err = t("tourNoDraw"); tourRender(); return; }
  var imp = tourImpact(T, g, e.sa, e.sb);
  function go() {
    var cur = _tnSession(s.id) || s, T2 = tourOf(cur), g2 = T2 && tourAll(T2)[e.gi];
    if (!g2) { _tnEdit = null; tourRender(); return; }
    var res = tourApply(T2, g2, e.sa, e.sb), msg = res.fixed ? t("tourScoreFixed") : t("tourScoreSaved");
    if (res.pairsChanged) msg += " " + _tnFill(t("tourPairsChanged"), { w: _tnDrawWord(T2) });
    if (res.semiReset) msg += " " + t("tourSemiReset");
    _tnEdit = null; _tnToast = msg; _tnTab = null;
    _tnPut(cur);
    tourRender(); _tnScroll(".tn-game.cur");
  }
  if (!imp) { go(); return; }
  var body;
  if (imp.kind === "pairs") body = _tnFill(t("tourWarnPairs"), { pairs: imp.pairs.map(function (m) { return _tnPlain(T, m[0]) + " + " + _tnPlain(T, m[1]); }).join(", "), k: imp.played });
  else body = t(imp.kind === "semi" ? "tourWarnSemi" : "tourWarnFinal");
  askConfirm({ title: t("tourCorrect"), body: body, kind: "warn", yes: t("tourYesChange"), no: t("tourKeep") }, go);
}

/** Mark the pair out (asks first), save, and say what happened */
function tourSaveOut(s) {
  var T = tourOf(s), o = _tnOut;
  if (!T || !o || !T.drawn) return;
  var P = tourPairs(T), pr = P[o.p];
  if (!pr || tourOutOf(T, o.p)) { _tnOut = null; tourRender(); return; }
  var name = _tnPairPlain(T, pr.m);
  askConfirm({ title: t("tourOutTitle"), body: _tnFill(t("tourOutBody"), { pair: name }), kind: "warn", yes: t("tourOutYes"), no: t("cancel") }, function () {
    var cur = _tnSession(s.id) || s, T2 = tourOf(cur);
    if (!T2 || !tourMarkOut(T2, o.p, o.why, o.note)) { _tnOut = null; tourRender(); return; }
    _tnOut = null; _tnToast = _tnFill(t("tourOutDone"), { pair: name });
    _tnPut(cur); tourRender();
  });
}
function tourAskUndoOut(s, p) {
  var T = tourOf(s);
  if (!T || !tourOutOf(T, p)) return;
  var k = tourUndoImpact(T, p), name = _tnPairPlain(T, tourPairs(T)[p].m);
  askConfirm({ title: t("tourOutUndoTitle"), body: _tnFill(t("tourOutUndoBody"), { pair: name }) + (k ? " " + _tnFill(t("tourOutUndoLoses"), { k: k }) : ""), kind: "warn", yes: t("tourOutUndoYes"), no: t("cancel") }, function () {
    var cur = _tnSession(s.id) || s, T2 = tourOf(cur);
    if (!T2 || !tourUndoOut(T2, p)) { tourRender(); return; }
    _tnToast = _tnFill(t("tourOutBackDone"), { pair: name });
    _tnPut(cur); tourRender();
  });
}

/* ---- v238: replace a player (the stand-in sheet) ---- */

var _tnSubSt = null;   // { sid, gi, on:[pos], from, to, why, note, all, picked, done(from, to, why, note, all) }
function _tnNameOf(T) { return function (i) { return _tnPlain(T, i); }; }
/** Open the sheet for game gi. on = who is on court now (the live score passes its own teams). done gets the choice after the yes. */
function tourOpenSub(s, gi, on, done) {
  var T = tourOf(s), g = T && tourAll(T)[gi];
  if (!g || tourDone(g) || g.wo || g.v) return;
  _tnSubSt = { sid: s.id, gi: gi, on: on || _tourOnList(g), from: -1, to: -1, why: "injury", note: "", all: true, picked: false, done: done };
  _tnSubDraw();
}
function _tnSubClose() {
  _tnSubSt = null;
  var el = document.getElementById("tnSubSheet"); if (el) el.remove();
  document.removeEventListener("keydown", _tnSubKey, true);
}
function _tnSubKey(e) { if (e.key === "Escape" && !document.getElementById("askSheet")) { e.preventDefault(); e.stopPropagation(); _tnSubClose(); } }
function _tnSubDraw() {
  var st = _tnSubSt, s = st && _tnSession(st.sid), T = tourOf(s), g = T && tourAll(T)[st.gi];
  if (!g) { _tnSubClose(); return; }
  var el = document.getElementById("tnSubSheet");
  if (!el) {
    el = document.createElement("div");
    el.id = "tnSubSheet"; el.className = "sheet-wrap tn-subwrap";
    el.onclick = _tnSubClick;
    el.oninput = function (ev) { if (_tnSubSt && ev.target && ev.target.id === "tnSubNote") _tnSubSt.note = String(ev.target.value).slice(0, 60); };
    document.body.appendChild(el);
    document.addEventListener("keydown", _tnSubKey, true);
  }
  var lab = g.ph === "rot" ? _tnFill(t("tourGame"), { k: tourAll(T).indexOf(g) + 1 }) : _tnLab(g);
  var h = '<div class="sheet tn-subsheet" role="dialog" aria-modal="true" aria-labelledby="tnSubT"><div class="sheet-grab"></div>' +
    '<div class="sheet-title" id="tnSubT">' + escapeHtml(_tnFill(t("tourSubTitle"), { game: lab })) + '</div>' +
    '<div class="tn-lbl">' + escapeHtml(t("tourSubWho")) + '</div><div class="tn-why">' +
    st.on.map(function (i) { return '<button type="button" class="tn-chip tn-pchip' + (st.from === i ? ' on' : '') + '" data-sact="from" data-p="' + i + '" aria-pressed="' + (st.from === i) + '">' + avatarHtml(tourUid(T, i), 24) + '<span>' + escapeHtml(_tnPlain(T, i)) + '</span></button>'; }).join('') + '</div>';
  if (st.from >= 0) {
    var el2 = tourEligible(T, g, st.from, st.on), nm = _tnNameOf(T);
    if (!st.picked || el2.indexOf(st.to) < 0) { st.to = tourAutoPick(T, g, st.from, nm, st.on); st.picked = false; }
    var auto = tourAutoPick(T, g, st.from, nm, st.on);
    h += '<div class="tn-lbl">' + escapeHtml(t("tourOutWhy")) + '</div><div class="tn-why">' +
      TOUR_WHY.map(function (w) { return '<button type="button" class="tn-chip tn-wchip' + (st.why === w ? ' on' : '') + '" data-sact="why" data-w="' + w + '" aria-pressed="' + (st.why === w) + '">' + escapeHtml(t("tourWhy_" + w)) + '</button>'; }).join('') + '</div>' +
      '<input id="tnSubNote" class="tn-note-in" type="text" maxlength="60" value="' + escapeHtml(st.note || '') + '" placeholder="' + escapeHtml(t("tourOutNote")) + '" aria-label="' + escapeHtml(t("tourOutNote")) + '">' +
      '<div class="tn-lbl">' + escapeHtml(t("tourSubIn")) + '</div>';
    if (!el2.length) h += '<p class="tn-subnone" role="note">' + escapeHtml(t("tourSubNone")) + '</p>';
    else h += '<div class="tn-picks">' + el2.map(function (i) {
      return '<button type="button" class="tn-pick' + (st.to === i ? ' on' : '') + '" data-sact="to" data-p="' + i + '" aria-pressed="' + (st.to === i) + '">' + avatarHtml(tourUid(T, i), 28) + '<span class="tn-pick-n">' + escapeHtml(_tnPlain(T, i)) + '</span><span class="tn-pick-k">' + escapeHtml(_tnFill(t("tourSubPlayed"), { k: tourPlayed(T, i) })) + '</span>' + (i === auto ? '<span class="tn-pick-t">' + escapeHtml(t("tourSubPicked")) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    h += '<div class="tn-lbl">' + escapeHtml(t("tourSubFor")) + '</div><div class="tn-why">' +
      '<button type="button" class="tn-chip tn-wchip' + (!st.all ? ' on' : '') + '" data-sact="all" data-v="0" aria-pressed="' + !st.all + '">' + escapeHtml(t("tourSubOne")) + '</button>' +
      '<button type="button" class="tn-chip tn-wchip' + (st.all ? ' on' : '') + '" data-sact="all" data-v="1" aria-pressed="' + st.all + '">' + escapeHtml(_tnFill(t("tourSubAll"), { name: _tnPlain(T, st.from) })) + '</button></div>';
  } else h += '<p class="tn-note">' + escapeHtml(t("tourSubPick")) + '</p>';
  h += '<div class="tn-btns"><button type="button" class="tn-b pri" data-sact="go"' + (st.from < 0 ? ' disabled' : '') + '>' + escapeHtml(t("tourSubGo")) + '</button><button type="button" class="tn-b" data-sact="cancel">' + escapeHtml(t("cancel")) + '</button></div></div>';
  // keep the focus on the same button after the redraw (keyboard and screen reader users)
  var ae = document.activeElement, fk = "";
  if (ae && ae.getAttribute && ae.getAttribute("data-sact") && el.contains(ae)) fk = '[data-sact="' + ae.getAttribute("data-sact") + '"]' + ["data-p", "data-w", "data-v"].map(function (k) { var v = ae.getAttribute(k); return v !== null ? '[' + k + '="' + v + '"]' : ''; }).join('');
  el.innerHTML = h;
  try { var fb = fk && el.querySelector(fk); (fb || el.querySelector(".tn-subsheet [data-sact]")).focus(); } catch (e) {}
}
function _tnSubClick(ev) {
  var st = _tnSubSt;
  if (!st) return;
  if (ev.target && ev.target.id === "tnSubSheet") { _tnSubClose(); return; }   // tap outside
  var b = ev.target.closest ? ev.target.closest("[data-sact]") : null;
  if (!b || b.disabled) return;
  var a = b.getAttribute("data-sact");
  if (a === "cancel") { _tnSubClose(); return; }
  if (a === "from") { var p = +b.getAttribute("data-p"); if (st.from !== p) { st.from = p; st.picked = false; } }
  else if (a === "to") { st.to = +b.getAttribute("data-p"); st.picked = true; }
  else if (a === "why") { if (TOUR_WHY.indexOf(b.getAttribute("data-w")) >= 0) st.why = b.getAttribute("data-w"); }
  else if (a === "all") st.all = b.getAttribute("data-v") === "1";
  else if (a === "go") { _tnSubAsk(); return; }
  _tnSubDraw();
}
/** The yes / no before anything changes */
function _tnSubAsk() {
  var st = _tnSubSt, s = _tnSession(st.sid), T = tourOf(s), g = T && tourAll(T)[st.gi];
  if (!g || st.from < 0) return;
  var from = _tnPlain(T, st.from), why = t("tourWhy_" + st.why), body, title;
  var left = st.all ? tourAll(T).filter(function (x) { return !tourDone(x) && !x.v && (_tourOnList(x).indexOf(st.from) >= 0 || x === g); }).length : 1;
  if (st.to < 0) { title = _tnFill(t("tourSubAskWoT"), { from: from }); body = _tnFill(t("tourSubAskWo"), { from: from, why: why }); }
  else {
    var to = _tnPlain(T, st.to);
    title = _tnFill(t("tourSubAsk"), { to: to, from: from });
    body = st.all ? _tnFill(t("tourSubAskAll"), { to: to, from: from, why: why, k: left }) : _tnFill(t("tourSubAskOne"), { to: to, from: from });
  }
  var c = { from: st.from, to: st.to, why: st.why, note: _tourClean(st.note), all: st.all }, done = st.done;
  _tnSubClose();
  askConfirm({ title: title, body: body, kind: "warn", yes: t("tourSubYes"), no: _tnFill(t("tourSubKeep"), { from: from }) }, function () { done(c); });
}
/** From the tournament screen: write the stand-in into the game */
function _tnSubFromScreen(s, gi) {
  tourOpenSub(s, gi, null, function (c) {
    var cur = _tnSession(s.id) || s, T2 = tourOf(cur);
    if (!T2 || !tourSub(T2, gi, c.from, c.to, c.why, c.note, c.all, _tnNameOf(T2))) { _tnToast = t("tourSubFail"); tourRender(); return; }
    _tnToast = c.to < 0 ? _tnFill(t("tourSubWoDone"), { from: _tnPlain(T2, c.from) }) : _tnFill(t("tourSubDone"), { to: _tnPlain(T2, c.to), from: _tnPlain(T2, c.from) });
    _tnTab = null; _tnPut(cur); tourRender(); _tnScroll(".tn-game.cur");
  });
}
/** From the live score menu: swap the player on court; the score goes on from where it is. Saved with the game (tourLiveApply). */
function tourLiveSub() {
  if (typeof live === "undefined" || !live || !live.tour) return;
  var s = _tnSession(live.tour.sid), T = tourOf(s);
  if (!T) return;
  var lg = tourAll(T)[live.tour.gi], pos = function (u) { return tourPosOf(T, u, lg); };   // v242: the player of THAT game (a swap applies from a later game)
  var on = live.a.concat(live.b).map(pos).filter(function (i) { return i >= 0; });
  if (typeof lsMenu === "function") lsMenu(false);
  tourOpenSub(s, live.tour.gi, on, function (c) {
    if (!live || !live.tour) return;
    var fu = tourUid(T, c.from, lg);
    if (c.to < 0) {   // nobody free: the game ends as a walkover
      var T2 = tourOf(_tnSession(s.id) || s);
      if (!T2 || !tourSub(T2, live.tour.gi, c.from, -1, c.why, c.note, c.all, _tnNameOf(T2))) { showToast(t("tourSubFail")); return; }
      live = null; lsSave(); liveMode = "count"; lsClose();
      _tnToast = _tnFill(t("tourSubWoDone"), { from: _tnPlain(T2, c.from) }); _tnToastKeep = true; _tnPut(s); _tnOpen(s.id);
      return;
    }
    var tu = tourUid(T, c.to, lg);
    ["a", "b"].forEach(function (k) { var x = live[k].indexOf(fu); if (x >= 0) live[k][x] = tu; });
    live.tour.subs = (live.tour.subs || []).concat([{ from: fu, to: tu, why: c.why, note: c.note, all: c.all }]);
    lsSave(); liveMode = "count"; lsRender();
    showToast(_tnFill(t("tourSubDone"), { to: _tnPlain(T, c.to), from: _tnPlain(T, c.from) }));
  });
}
function _tnHurtCard(T, org) {
  var hs = T.hurt || [];
  if (!hs.length) return "";
  var live = org && !tourComplete(T);
  return '<div class="tn-sec tn-hurt"><h3>' + escapeHtml(t("tourHurtTitle")) + '</h3>' + hs.map(function (x) {
    return '<div class="tn-hrow">' + _tnWho(T, x.i, 24) + _tnHurtTag(T, x.i) + (x.note ? '<span class="tn-hnote">' + escapeHtml(x.note) + '</span>' : '') +
      (live ? '<button type="button" class="tn-b sm" data-act="back-in" data-p="' + x.i + '">' + escapeHtml(t("tourOutBack")) + '</button>' : '') + '</div>';
  }).join('') + '</div>';
}
function tourAskBackIn(s, i) {
  var T = tourOf(s);
  if (!T || !tourHurtOf(T, i)) return;
  var name = _tnPlain(T, i);
  askConfirm({ title: _tnFill(t("tourBackInTitle"), { name: name }), body: _tnFill(t("tourBackInBody"), { name: name }), kind: "warn", yes: t("tourOutUndoYes"), no: t("cancel") }, function () {
    var cur = _tnSession(s.id) || s, T2 = tourOf(cur);
    if (!T2 || !tourBackIn(T2, i, _tnNameOf(T2))) { tourRender(); return; }
    _tnToast = _tnFill(t("tourBackInDone"), { name: name }); _tnTab = null;
    _tnPut(cur); tourRender();
  });
}

/* ---- views ---- */

function _tnStepper(T, g, side, sc) {
  return '<div class="tn-ed"><div class="tn-names">' + _tnSide(T, g, side, 22) + '</div>' +
    '<div class="tn-stp"><button type="button" data-act="adj" data-t="' + side + '" data-d="-1" aria-label="' + escapeHtml(t("tourMinus")) + '">' + icon("minus", 16) + '</button><b>' + sc + '</b>' +
    '<button type="button" data-act="adj" data-t="' + side + '" data-d="1" aria-label="' + escapeHtml(t("tourPlus")) + '">' + icon("plus", 16) + '</button></div></div>';
}
function _tnEditor(T, g) {
  return '<div class="tn-editor">' + _tnStepper(T, g, "a", _tnEdit.sa) + _tnStepper(T, g, "b", _tnEdit.sb) +
    (_tnEdit.err ? '<div class="tn-err" role="alert">' + escapeHtml(_tnEdit.err) + '</div>' : '') +
    '<div class="tn-btns"><button type="button" class="tn-b pri" data-act="save">' + escapeHtml(t("tourSave")) + '</button><button type="button" class="tn-b" data-act="cancel">' + escapeHtml(t("cancel")) + '</button></div></div>';
}
function _tnGame(T, g, idx, cur, label, org) {
  var d = tourDone(g), aw = d && !g.v && g.sa > g.sb, bw = d && !g.v && g.sb > g.sa, gi = tourAll(T).indexOf(g);
  var editing = _tnEdit && _tnEdit.gi === gi;
  var h = '<div class="tn-game' + (cur ? ' cur' : '') + (!d && !cur ? ' wait' : '') + (g.wo ? ' wo' : '') + (g.v ? ' void' : '') + '"><div class="tn-gh"><span>' + escapeHtml(label || _tnFill(t("tourGame"), { k: idx })) + '</span><span>' + (d ? escapeHtml(g.v ? t("tourOutVoid") : g.wo ? t("tourWO") : t("tourFinalScore")) : (cur ? escapeHtml(t("tourUpNext")) : '<span class="tn-waiting">' + escapeHtml(t("tourWaiting")) + '</span>')) + '</span></div>';
  [["a", aw, g.pa], ["b", bw, g.pb]].forEach(function (x) {
    h += '<div class="tn-tm ' + (d ? (x[1] ? 'win' : 'lose') : '') + '"><div class="tn-names">' + _tnSide(T, g, x[0], 22) + _tnOutTag(T, x[2]) + '</div><span class="tn-pts">' + escapeHtml(d ? _tnShow(g, x[0]) : '–') + '</span></div>';
  });
  // v238: who rests, and who is out (a hurt player is out, not resting)
  var on = _tourOnList(g), outs = [], i;
  if (g.ph === "rot") {
    var rest = [];
    for (i = 0; i < T.n; i++) if (on.indexOf(i) < 0) { if (tourHurtOf(T, i) && (!d || (g.subs || []).some(function (x) { return x.from === i; }))) outs.push(_tnHurtName(T, i)); else rest.push(_tnPlain(T, i, g)); }
    h += '<div class="tn-rest">' + escapeHtml(t("tourResting")) + ' ' + escapeHtml(rest.join(", ") || "—") + (outs.length ? ' · ' + escapeHtml(_tnFill(t("tourRestOut"), { names: outs.join(", ") })) : '') + '</div>';
  } else if ((g.subs || []).length) {
    h += '<div class="tn-rest">' + escapeHtml(_tnFill(t("tourRestOut"), { names: g.subs.map(function (x) { return tourHurtOf(T, x.from) ? _tnHurtName(T, x.from) : _tnPlain(T, x.from, g) + " (" + t("tourWhy_" + x.why) + ")"; }).join(", ") })) + '</div>';
  }
  if (g.wo && g.woHurt !== undefined) h += '<div class="tn-rest">' + escapeHtml(_tnFill(t("tourSubWoLine"), { name: _tnPlain(T, g.woHurt, g) })) + '</div>';
  if (!d) (g.subs || []).forEach(function (x) {   // v238: a stand-in with no rest gets a small warning
    var run = tourRowRun(T, g, x.to);
    if (run >= 3) h += '<div class="tn-warn">' + escapeHtml(_tnFill(t("tourSubRow"), { name: _tnPlain(T, x.to, g), k: run })) + '</div>';
  });
  if (org && !g.wo && !g.v) {
    if (editing) h += _tnEditor(T, g);
    else if (d) h += '<button type="button" class="tn-b sm" data-act="edit" data-i="' + gi + '">' + escapeHtml(t("tourCorrect")) + '</button>';
    else if (cur) h += '<div class="tn-gbtns"><button type="button" class="tn-b pri sm" data-act="live" data-i="' + gi + '"><span class="tn-gi">' + icon("scoreboard", 16) + '</span><span>' + escapeHtml(t("lsTitle")) + '</span></button>' +
      '<button type="button" class="tn-b sm" data-act="edit" data-i="' + gi + '"><span class="tn-gi">' + icon("ranking", 16) + '</span><span>' + escapeHtml(t("addScore")) + '</span></button>' +
      '<button type="button" class="tn-b sm tn-subb" data-act="sub" data-i="' + gi + '"><span class="tn-subi" aria-hidden="true">↺</span><span>' + escapeHtml(t("tourSubBtn")) + '</span></button></div>';
  }
  return h + '</div>';
}

function _tnMeetCard(T) {
  var m = tourMeet(T), n = T.n, rows = "", i, j;
  function k(a, b) { return a < b ? a + "-" + b : b + "-" + a; }
  var head = '<tr><th></th>';
  for (j = 0; j < n; j++) head += '<th class="c">' + avatarHtml(tourUid(T, j), 22) + '</th>';
  head += '</tr>';
  for (i = 0; i < n; i++) {
    rows += '<tr><td>' + avatarHtml(tourUid(T, i), 22) + '</td>';
    for (j = 0; j < n; j++) {
      if (i === j) { rows += '<td class="c dim">·</td>'; continue; }
      var q = k(i, j), p = m.pc[q] || 0, o = m.oc[q] || 0;
      rows += '<td class="c">' + (p ? '<b class="tn-p">P' + (p > 1 ? p : '') + '</b>' : '') + (p && o ? ' ' : '') + (o ? '<span class="dim">v' + (o > 1 ? o : '') + '</span>' : '') + (!p && !o ? '<span class="tn-no">–</span>' : '') + '</td>';
    }
    rows += '</tr>';
  }
  return '<div class="tn-sec"><h3>' + escapeHtml(t("tourMeetTitle")) + '</h3><p>' + escapeHtml(_tnFill(t("tourMeetHint"), { a: m.cover, b: m.total, c: m.partners })) + '</p><div class="tn-scroll"><table class="tn-tab">' + head + rows + '</table></div></div>';
}
function _tnRestCard(T) {
  var G = T.games.length, r = tourRuns(T.games, T.n), rows = '<div class="tn-rr" style="--g:' + G + '"><span></span>';
  for (var k = 0; k < G; k++) rows += '<span class="h">G' + (k + 1) + '</span>';
  rows += '<span></span></div>';
  for (var p = 0; p < T.n; p++) {
    var pl = 0, cells = "";
    T.games.forEach(function (g) { var on = g.a.indexOf(p) >= 0 || g.b.indexOf(p) >= 0; if (on) pl++; cells += '<i class="tn-rc' + (on ? ' on' : '') + '"></i>'; });
    rows += '<div class="tn-rr" style="--g:' + G + '"><span class="tn-who">' + avatarHtml(tourUid(T, p), 22) + '<span class="tn-nm">' + getUserName(tourUid(T, p)) + '</span></span>' + cells + '<span class="e">' + escapeHtml(_tnFill(t("tourPlayRest"), { p: pl, r: G - pl })) + '</span></div>';
  }
  return '<div class="tn-sec"><h3>' + escapeHtml(t("tourRestTitle")) + '</h3><p>' + escapeHtml(_tnFill(t("tourRestHint"), { p: G * 4 / T.n, r: G - G * 4 / T.n, mr: r.rest, mp: r.play })) + '</p><div class="tn-rt">' + rows + '</div></div>';
}
/** v238: in the table, a stand-in shows how many rotation games were for someone else; a hurt player shows Out */
function _tnStandTag(T, i) {
  var k = T.games.filter(function (g) { return tourDone(g) && !g.wo && !g.v && tourSubOf(g, i); }).length;
  return _tnHurtTag(T, i) + (k ? '<span class="tn-si">' + escapeHtml(_tnFill(t("tourSubPlus"), { k: k })) + '</span>' : '');
}
function _tnStandCard(T, ph) {
  var r = tourStats(T), body = '';
  r.forEach(function (s, i) {
    var d = s.pf - s.pa;
    body += '<tr class="' + ((ph >= 1 && (i < 2 || i >= r.length - 2)) ? 'top' : '') + '"><td class="dim">' + (i + 1) + '</td><td>' + _tnWho(T, s.id, 22) + _tnStandTag(T, s.id) + '</td><td>' + s.p + '</td><td>' + s.w + '</td><td>' + s.l + '</td><td>' + (d > 0 ? '+' : '') + d + '</td></tr>';
  });
  return '<div class="tn-sec"><h3>' + escapeHtml(t("tourStandTitle")) + '</h3><div class="tn-scroll"><table class="tn-tab"><tr><th>#</th><th class="l">' + escapeHtml(t("tourPlayer")) + '</th><th>' + escapeHtml(t("tourColP")) + '</th><th>' + escapeHtml(t("tourColW")) + '</th><th>' + escapeHtml(t("tourColL")) + '</th><th>+/−</th></tr>' + body + '</table></div><p class="tn-note">' + escapeHtml(t("tourStandHint")) + '</p></div>';
}
function _tnOutPanel(T, p) {
  var o = _tnOut;
  return '<div class="tn-outpanel"><div class="tn-lbl">' + escapeHtml(t("tourOutWhy")) + '</div><div class="tn-why">' +
    TOUR_WHY.map(function (w) { return '<button type="button" class="tn-chip' + (o.why === w ? ' on' : '') + '" data-act="out-why" data-w="' + w + '">' + escapeHtml(t("tourWhy_" + w)) + '</button>'; }).join('') + '</div>' +
    '<input id="tnOutNote" class="tn-note-in" type="text" maxlength="60" value="' + escapeHtml(o.note || '') + '" placeholder="' + escapeHtml(t("tourOutNote")) + '" aria-label="' + escapeHtml(t("tourOutNote")) + '">' +
    '<div class="tn-btns"><button type="button" class="tn-b dng" data-act="out-save">' + escapeHtml(t("tourOutSave")) + '</button><button type="button" class="tn-b" data-act="out-cancel">' + escapeHtml(t("cancel")) + '</button></div></div>';
}
function _tnPairCard(T, P, org) {
  var h = '<div class="tn-sec"><h3>' + escapeHtml(t("tourPairsTitle")) + '</h3><p>' + escapeHtml(t(T.n === 8 ? "tourPairsHint8" : "tourPairsHint6")) + '</p><div class="tn-pairs">';
  var live = org && T.drawn && !tourComplete(T);
  P.forEach(function (p, k) {
    var out = tourOutOf(T, k);
    h += '<div class="tn-pair' + (out ? ' out' : '') + '"><span class="tn-tag">' + escapeHtml(_tnFill(t("tourPairN"), { n: p.seed })) + '</span><div class="tn-chips">' + _tnWho(T, p.m[0], 22) + _tnHurtTag(T, p.m[0]) + _tnWho(T, p.m[1], 22) + _tnHurtTag(T, p.m[1]) + '</div><span class="tn-rk">' + escapeHtml(_tnFill(t("tourPairRk"), { a: p.ranks[0], b: p.ranks[1], d: (p.diff > 0 ? '+' : '') + p.diff })) + '</span>';
    if (out) {
      h += _tnOutTag(T, k);
      if (live) h += '<button type="button" class="tn-b sm" data-act="out-undo" data-p="' + k + '">' + escapeHtml(t("tourOutBack")) + '</button>';
    } else if (live) {
      if (_tnOut && _tnOut.p === k) h += _tnOutPanel(T, k);
      else h += '<button type="button" class="tn-b sm" data-act="out-open" data-p="' + k + '">' + escapeHtml(t("tourOutBtn")) + '</button>';
    }
    h += '</div>';
  });
  return h + '</div></div>';
}

function _tnPbRow(T, g, side, score, win, lose, extra) {
  var pi = side === "a" ? g.pa : g.pb;
  return '<div class="tn-pr' + (win ? ' w' : '') + (lose ? ' l' : '') + '"><div class="tn-pn">' + _tnSide(T, g, side, 22) + _tnOutTag(T, pi) + '</div><span class="tn-ps">' + extra + escapeHtml(score) + '</span></div>';
}
function _tnSemiBox(T, g, cur) {
  var d = tourDone(g), aw = d && !g.v && g.sa > g.sb, bw = d && !g.v && g.sb > g.sa;
  return '<div class="tn-pb' + (cur ? ' cur' : '') + '"><div class="tn-pbt"><span>' + escapeHtml(_tnLab(g)) + '</span><span>' + (d ? escapeHtml(g.v ? t("tourOutVoid") : g.wo ? t("tourWO") : t("tourFinalScore")) : (cur ? escapeHtml(t("tourUpNext")) : escapeHtml(t("tourWaiting")))) + '</span></div>' +
    _tnPbRow(T, g, "a", d ? _tnShow(g, "a") : "–", aw, bw, '') + _tnPbRow(T, g, "b", d ? _tnShow(g, "b") : "–", bw, aw, '') + '</div>';
}
function _tnFinalBox(T, cur) {
  var f = tourFinals(T);
  if (!f.length) return '<div class="tn-pb fin"><div class="tn-pbt"><span>' + escapeHtml(t("tourFinalBo3")) + '</span></div><div class="tn-pn tbd">' + escapeHtml(t("tourFinalTbd")) + '</div></div>';
  var w = tourFinalWins(T), dec = tourFinalDecided(T), k = f[0], vd = !!k.v;
  function pips(n) { return '<span class="tn-pip' + (n >= 1 ? ' on' : '') + '"></span><span class="tn-pip' + (n >= 2 ? ' on' : '') + '"></span>'; }
  var kk = f.filter(function (g) { return !tourDone(g); })[0] || f[f.length - 1];   // v238: the lineup of the game being played (stand-ins included)
  function row(side, wins, win, pi) {
    return '<div class="tn-pr' + (win ? ' w' : (dec && !vd ? ' l' : '')) + '"><div class="tn-pn">' + _tnSide(T, kk, side, 22) + _tnOutTag(T, pi) + '</div><span class="tn-ps">' + (win ? TN_CROWN : '') + pips(wins) + '</span></div>';
  }
  return '<div class="tn-pb fin' + (cur ? ' cur' : '') + '"><div class="tn-pbt"><span>' + escapeHtml(t("tourFinalBo3")) + '</span><span>' + (dec && !vd ? escapeHtml(t("tourChampion")) : (vd ? escapeHtml(t("tourOutVoid")) : '')) + '</span></div>' +
    row("a", w.wa, w.wa === 2, k.pa) + row("b", w.wb, w.wb === 2, k.pb) +
    '<div class="tn-pbn">' + f.map(function (g, i) { return 'G' + (i + 1) + ' ' + escapeHtml(_tnGameTxt(g)); }).join(' · ') + ' · ' + escapeHtml(t("tourFirstTo2")) + '</div></div>';
}
function _tnBracket(T, ng) {
  if (T.n !== 8 || !T.drawn || T.po.length < 2) return "";
  var third = T.po[2], semisDone = tourDone(T.po[0]) && tourDone(T.po[1]);
  return '<div class="tn-sec"><h3>' + escapeHtml(t("tourBracketTitle")) + '</h3><div class="tn-bk"><div class="tn-bks">' + _tnSemiBox(T, T.po[0], T.po[0] === ng) + _tnSemiBox(T, T.po[1], T.po[1] === ng) +
    '</div><div class="tn-bkc' + (semisDone ? ' on' : '') + '"></div><div>' + _tnFinalBox(T, tourFinals(T).some(function (g) { return g === ng; })) + '</div></div>' +
    '<div class="tn-third"><div class="tn-bt">' + escapeHtml(t("tourThirdTitle")) + '</div>' + (third ? _tnSemiBox(T, third, third === ng) : '<div class="tn-pb tbd">' + escapeHtml(t("tourThirdTbd")) + '</div>') + '</div></div>';
}

function _tnDrawCard(T) {
  var a = _tnAnim, s = _tnSession(_tnSid), h = '<div class="tn-sec"><h3>' + escapeHtml(a.kind === "teams" ? t("tourDrawingTeams") : (T && T.n === 8 ? t("tourDrawingSemi") : t("tourDrawingPairs"))) + '</h3><div class="tn-draw">';
  if (a.kind === "teams") {
    tourShuffle(s ? s.players : [], Math.random).forEach(function (u) { h += '<div class="tn-slot">' + avatarHtml(u, 28) + '<span>' + getUserName(u) + '</span></div>'; });
  } else if (T) {
    var P = tourPairs(T);
    if (T.n === 6) tourShuffle([0, 1, 2]).forEach(function (i, k) { h += '<div class="tn-slot"><small>' + escapeHtml(_tnFill(t("tourPairN"), { n: k + 1 })) + '</small>' + _tnPairName(T, P[i].m) + '</div>'; });
    else { var o = tourShuffle([0, 1, 2, 3]); [[0, 1], [2, 3]].forEach(function (x, k) { h += '<div class="tn-slot"><small>' + escapeHtml(_tnFill(t("tourSemi"), { n: k + 1 })) + '</small>' + _tnPairName(T, P[o[x[0]]].m) + '<small>v</small>' + _tnPairName(T, P[o[x[1]]].m) + '</div>'; }); }
  }
  return h + '</div></div>';
}

function _tnWinner(T, sid) {
  var order = tourOrder(T);
  if (!order) return "";
  var P = tourPairs(T);
  // v237: a podium with levels; the pair stands on its block, 1st in the middle and highest
  function pl(k, cls, lab) {
    var p = order[k] >= 0 ? P[order[k]] : null;
    return '<div class="tn-pl ' + cls + '" data-place="' + (k + 1) + '"><div class="tn-pnm">' + (p ? p.m.map(function (i) { return '<span class="tn-pw">' + avatarHtml(tourUid(T, i), 32) + '<span>' + getUserName(tourUid(T, i)) + '</span></span>'; }).join('') : '<span>\u2014</span>') + (p ? _tnOutTag(T, order[k]) : '') + '</div>' +
      '<div class="tn-plinth">' + (k === 0 ? TN_CROWN : '') + '<span class="tn-medal">' + escapeHtml(lab) + '</span></div></div>';
  }
  return '<div class="tn-sec" id="tnWinner"><h3>' + escapeHtml(t("tourWinnerTitle")) + '</h3><div class="tn-pod">' + pl(1, 'p2', t("tourPlace2")) + pl(0, 'p1', t("tourPlace1")) + pl(2, 'p3', t("tourPlace3")) + '</div><button type="button" class="tn-b sm tn-share" data-act="share">' + icon("shareOut", 16) + ' ' + escapeHtml(t("hofShareBtn")) + '</button></div>';
}

/** v236: after the last rotation game, a short summary and the one button that draws the playoff bracket */
function _tnSummary(T, org) {
  var r = tourStats(T), top = r.slice(0, 3);
  var h = '<div class="tn-sec tn-sum"><h3>' + escapeHtml(_tnFill(t("tourSumTitle"), { g: T.games.length })) + '</h3><ol class="tn-sum-top">' +
    top.map(function (x) { var d = x.pf - x.pa; return '<li>' + avatarHtml(tourUid(T, x.id), 22) + '<b>' + escapeHtml(getUserName(tourUid(T, x.id))) + '</b><span>' + x.w + '–' + x.l + ' · ' + (d > 0 ? '+' : '') + d + '</span></li>'; }).join('') + '</ol>' +
    '<p>' + escapeHtml(t(T.n === 8 ? "tourSumNext8" : "tourSumNext6")) + '</p>';
  if (org) h += '<button type="button" class="tn-btn big" data-act="stage">' + TN_DICE + '<span>' + escapeHtml(T.n === 8 ? t("tourBtnSemi") : t("tourBtnPairs")) + '</span></button>';
  return h + '</div>';
}
var _tnSumSeen = "";
function tourRender() {
  var body = document.getElementById("tnBody");
  if (!body) return;
  var s = _tnSession(_tnSid);
  if (!s) { tourClose(); return; }
  var T = tourOf(s), org = tourCanRun(s), st = tourStage(s);
  var sub = document.getElementById("tnSub");
  if (sub) sub.textContent = fmtDate(s.date) + (s.courtName ? " · " + s.courtName : "");
  var h = "";
  if (st) h += '<button type="button" class="tn-btn big" data-act="stage"' + (st.disabled ? ' disabled' : '') + '>' + (st.icon || "") + '<span>' + escapeHtml(st.label) + '</span></button>';
  if (_tnToast) h += '<div class="tn-toast" role="status">' + escapeHtml(_tnToast) + '</div>';
  if (!T) {
    if (_tnAnim) h += _tnDrawCard(null);
    else h += '<div class="tn-sec"><h3>' + escapeHtml(t("tourHowTitle")) + '</h3><p>' + escapeHtml(t("tourHow1")) + '</p><p>' + escapeHtml(t("tourHow2")) + '</p><p>' + escapeHtml(t("tourHow3")) + '</p></div>';
    body.innerHTML = h; return;
  }
  var ph = tourPhase(T), ng = tourNext(T), played = tourAll(T).filter(tourDone).length;
  var now = _tnViewNow(T), view = _tnTab === null || _tnTab > now ? now : _tnTab;
  // v237: cancel stays near the top until the tournament is done (the session goes back to normal games)
  if (org && !tourComplete(T) && !_tnAnim) h += '<button type="button" class="tn-b tn-cancel" data-act="reset">' + icon("close", 16) + '<span>' + escapeHtml(t("tourCancelBtn")) + '</span></button>';
  h += _tnStepper(now, view);
  h += '<div class="tn-prog"><span>' + escapeHtml(ph === 3 ? _tnFill(t("tourLineDone"), { k: played }) : _tnFill(t("tourProgress"), { k: played + 1, m: T.n === 8 ? "11–12" : "12" })) + '</span><span>' + escapeHtml(_tnFill(t("tourPlayed"), { k: played })) + '</span></div>';
  h += '<div class="tn-bar"><i style="width:' + (ph === 3 ? 100 : Math.round(played / 12 * 100)) + '%"></i></div>';
  h += _tnHurtCard(T, org);
  if (view !== now) h += '<button type="button" class="tn-b sm tn-back" data-act="tab" data-k="' + now + '">' + escapeHtml(_tnFill(t("tourBackToNow"), { step: t(TOUR_LABELS[now]) })) + '</button>';
  if (_tnAnim) h += _tnDrawCard(T);
  h += '<div class="tn-panel">' + _tnPanel(T, view, ng, ph, org, s) + '</div>';
  body.innerHTML = h;
  if (view === 1 && !T.drawn && _tnSumSeen !== _tnSid) { _tnSumSeen = _tnSid; _tnScroll(".tn-sum"); }
}

var TOUR_TABS = ["tourStepRot", "tourStepPairs", "tourStepPlayoff", "tourStepWinner"];
/** v245: the same steps without the "1 " "2 " numbers (the stepper circles carry the number) */
var TOUR_LABELS = ["tourStepRotL", "tourStepPairsL", "tourStepPlayoffL", "tourStepWinnerL"];
var TN_TICK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** v245: stepper card. now = the step going on, view = the step on screen. Done steps (tick) open for a look, the current step has the ring,
    later steps are locked (disabled). Same four steps for 6 and 8 players. */
function _tnStepper(now, view) {
  return '<ol class="tn-steps" aria-label="' + escapeHtml(t("tourTitle")) + '">' + TOUR_LABELS.map(function (k, i) {
    var st = i < now ? 'done' : i === now ? 'now' : 'lock';
    var cls = 'tn-s tn-tab-b ' + st + (i === view ? ' on' : '');
    var c = st === 'done' ? TN_TICK : String(i + 1);
    if (i === 3) c += '<span class="tn-bdg" aria-hidden="true">\uD83C\uDFC6</span>';
    return '<li class="tn-li ' + (i > 0 && i - 1 < now ? 'ln-done' : '') + '"><button type="button" class="' + cls + '" data-act="tab" data-k="' + i + '"' + (i === now ? ' aria-current="step"' : '') + (i > now ? ' disabled' : '') + '><span class="tn-c">' + c + '</span><span class="tn-sl">' + escapeHtml(t(k)) + '</span></button></li>';
  }).join('') + '</ol>';
}
/** v237: the step that is going on now; once the playoff is drawn its games are on the Playoff tab */
function _tnViewNow(T) {
  var ph = tourPhase(T);
  return ph === 1 && T.drawn ? 2 : ph;
}
/** v237: which sections each step tab shows (names only, so a test can check the map) */
function tourTabParts(T, view) {
  if (view === 0) return ["rule", "hint", "rot", "meet", "rest", "stand"];
  if (view === 1) return (T.drawn ? [] : ["sum"]).concat(["stand", "pairs"], T.drawn ? [] : ["drawsec"]);
  if (view === 2) return ["bracket", "po"];
  return ["winner", "bracket"];
}
function _tnPanel(T, view, ng, ph, org, s) {
  var P = tourRotDone(T) ? tourPairs(T) : null;
  return tourTabParts(T, view).map(function (part) {
    if (part === "rule") return '<p class="tn-note">' + escapeHtml(t(T.n === 8 ? "tourRule8" : "tourRule6")) + '</p>';
    if (part === "hint") return org && !T.drawn ? '<div class="tn-sec tn-hint"><h3>' + escapeHtml(t("tourOutRotTitle")) + '</h3><p>' + escapeHtml(t("tourOutRotHint")) + '</p></div>' : '';
    if (part === "rot") return '<div class="tn-sec"><h3>' + escapeHtml(_tnFill(t("tourRotTitle"), { a: 1, b: T.games.length })) + '</h3><div class="tn-games">' + T.games.map(function (g, i) { return _tnGame(T, g, i + 1, g === ng, null, org); }).join('') + '</div></div>';
    if (part === "meet") return _tnMeetCard(T);
    if (part === "rest") return _tnRestCard(T);
    if (part === "stand") return _tnStandCard(T, ph);
    if (part === "sum") return _tnAnim ? '' : _tnSummary(T, org);
    if (part === "pairs") return P ? _tnPairCard(T, P, org) : '';
    if (part === "drawsec") return '<div class="tn-sec"><h3>' + escapeHtml(t("tourPlayoffTitle")) + '</h3><p>' + escapeHtml(_tnFill(t("tourDrawHint"), { w: T.n === 8 ? t("tourBtnSemi") : t("tourBtnPairs") })) + '</p></div>';
    if (part === "bracket") return _tnBracket(T, ng);
    if (part === "winner") return _tnWinner(T, s.id) + (org ? '<button type="button" class="tn-b dng" data-act="reset">' + escapeHtml(t("tourReset")) + '</button>' : '');
    if (part === "po") {
      if (!T.drawn || !P) return '';
      var h = '<div class="tn-sec"><h3>' + escapeHtml(_tnFill(t("tourPlayoffGames"), { a: T.games.length + 1 })) + '</h3>';
      if (T.n === 8) h += '<div class="tn-how">' + escapeHtml(t("tourHow8")) + '</div>';
      else {
        var pt = tourPairTable(T);
        h += '<div class="tn-how">' + escapeHtml(t("tourHowRR")) + '</div><div class="tn-scroll"><table class="tn-tab"><tr><th>#</th><th class="l">' + escapeHtml(t("tourColPair")) + '</th><th>' + escapeHtml(t("tourColW")) + '</th><th>' + escapeHtml(t("tourColL")) + '</th><th>+/−</th></tr>' +
          pt.map(function (x, k) { return '<tr class="' + (k === 0 && x.w + x.l > 0 ? 'top' : '') + '"><td class="dim">' + (k + 1) + '</td><td>' + _tnPairName(T, P[x.i].m) + _tnOutTag(T, x.i) + '</td><td>' + x.w + '</td><td>' + x.l + '</td><td>' + (x.d > 0 ? '+' : '') + x.d + '</td></tr>'; }).join('') + '</table></div>';
      }
      h += '<div class="tn-games">' + T.po.map(function (g, i) { return _tnGame(T, g, T.games.length + i + 1, g === ng, _tnLab(g) + ' · ' + _tnFill(t("tourGame"), { k: T.games.length + i + 1 }), org); }).join('') + '</div>';
      if (T.n === 8 && T.po.length === 2) h += '<p class="tn-note">' + escapeHtml(t("tourAfterSemis")) + '</p>';
      return h + '</div>';
    }
    return '';
  }).join('');
}

