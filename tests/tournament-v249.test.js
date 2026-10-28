/* Run: node tests/tournament-v249.test.js — tournament for any size 4–20 (v249): the mix schedule for every n, the playoff by size,
   3rd place best of 3, the estimate, old (format 1) tournaments, stand-ins and pair-out in the new format, Hall of Fame, stats, the info sheet */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function uids(n) { var a = []; for (var i = 0; i < n; i++) a.push("u" + i); return a; }
var names = {}; uids(24).forEach(function (u) { names[u] = "Player " + u; });
var J = function (x) { return JSON.stringify(x); };

// real English strings
var ic = { console: console, localStorage: { getItem: function () { return "en"; } }, document: {}, window: {} };
vm.createContext(ic); vm.runInContext(fs.readFileSync("js/i18n.js", "utf8"), ic);
var tt = function (k) { return ic.t(k); };

var asked = [], els = {}, body = { classList: { add: function () {}, remove: function () {} }, appendChild: function (e) { els[e.id] = e; } };
var focusLog = [];
var ctx = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, Object: Object, Array: Array, Promise: Promise, String: String, Number: Number,
  t: tt, escapeHtml: function (v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }, icon: function (n) { return "<i:" + n + ">"; }, jsq: String,
  plainUserName: function (u) { return u ? u.displayName : "?"; }, findUser: function (u) { return { displayName: names[u] || u }; },
  getUserName: function (u) { return names[u] || u; }, avatarHtml: function (u) { return "<av " + u + ">"; },
  canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, fmtDate: String,
  askConfirm: function (o, yes) { asked.push({ o: o, yes: yes }); },
  document: { getElementById: function (id) { return els[id] || null; }, body: body, addEventListener: function () {}, removeEventListener: function () {}, activeElement: null, contains: function () { return true; },
    createElement: function () { var e = { id: "", className: "", _h: "", set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, remove: function () { delete els[this.id]; }, querySelector: function () { return { focus: function () { focusLog.push("close"); } }; } }; return e; } },
  lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
["js/tournament.js", "js/sharecard.js", "js/hallfame.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });

function nameOf(u) { return names[u] || u; }
function playNext(T, fn) { var g = ctx.tourNext(T); if (!g) return null; var r = fn ? fn(g, T) : [21, 15]; ctx.tourApply(T, g, r[0], r[1]); return g; }
function playMix(T, fn) { var k = 0; while (!ctx.tourRotDone(T) && k++ < 400) playNext(T, fn); }
function playAll(T, fn, rnd) { playMix(T, fn); ctx.tourDraw(T, rnd || seeded(5)); var k = 0; while (ctx.tourNext(T) && k++ < 40) playNext(T, fn); return T; }
function pairKey(a, b) { return a < b ? a + "-" + b : b + "-" + a; }

// ---- 1. the mix schedule, every n from 4 to 20, many seeds ----
var REST_MAX = function (n) { return n <= 8 ? 1 : Math.ceil((n - 4) / 2.5); };
for (var n = 4; n <= 20; n++) {
  var k = n % 4 === 0 ? 3 : 4, G = n * k / 4;
  assert.strictEqual(ctx.tourK(n), k, "k for " + n); assert.strictEqual(ctx.tourMixGames(n), G, "mix games for " + n);
  for (var seed = 1; seed <= 12; seed++) {
    var T = ctx.tourNew(uids(n), seeded(seed * 7 + n));
    assert.strictEqual(T.fmt, 2); assert.strictEqual(T.n, n); assert.strictEqual(T.q, n <= 5 ? 4 : n <= 7 ? 6 : 8); assert.strictEqual(T.games.length, G, n + " players: " + G + " games");
    var plays = {}, partners = {};
    T.games.forEach(function (g) {
      var four = g.a.concat(g.b);
      assert.strictEqual(new Set(four).size, 4, "four different players in a game");
      four.forEach(function (p) { assert.ok(p >= 0 && p < n && Math.floor(p) === p); plays[p] = (plays[p] || 0) + 1; });
      [g.a, g.b].forEach(function (tm) { var q = pairKey(tm[0], tm[1]); partners[q] = (partners[q] || 0) + 1; });
      assert.ok(g.ph === "rot" && g.sa === null && g.sb === null);
    });
    for (var p = 0; p < n; p++) assert.strictEqual(plays[p], k, "EXACTLY " + k + " games for everyone (n " + n + ", seed " + seed + ", player " + p + ")");
    Object.keys(partners).forEach(function (q) { assert.strictEqual(partners[q], 1, "a pair partners at most once (n " + n + ", seed " + seed + ")"); });
    var runs = ctx.tourRuns(T.games, n);
    assert.ok(runs.rest <= REST_MAX(n), "rest streak " + runs.rest + " too long (n " + n + ", seed " + seed + ")");
    if (n >= 6) assert.ok(runs.play <= 2, "nobody plays 3 in a row (n " + n + ", seed " + seed + "): " + runs.play);
    if (n === 4) assert.ok(runs.rest === 0 && runs.play === 3);
    if (n === 5) assert.ok(runs.rest === 1);
    assert.strictEqual(J(T.coin.slice().sort(function (a, b) { return a - b; })), J(uids(n).map(function (u, i) { return i; })), "the coin is a full shuffle");
  }
}
assert.strictEqual(J(ctx.tourNew(uids(11), seeded(3)).games), J(ctx.tourNew(uids(11), seeded(3)).games), "same seed, same schedule");
// spread rest: with n players and 4 on court, the biggest gap between two games of one player is the same for most players
(function () {
  var T = ctx.tourNew(uids(12), seeded(2)), per = T.games.length;   // 12 players, 9 games, each plays 3
  var gaps = [];
  for (var p = 0; p < 12; p++) { var idx = []; T.games.forEach(function (g, i) { if (g.a.concat(g.b).indexOf(p) >= 0) idx.push(i); }); gaps.push(idx[idx.length - 1] - idx[0]); }
  assert.ok(Math.min.apply(null, gaps) >= 2, "a player's games are not bunched: " + gaps.join(","));
})();
// the sizes
assert.ok(!ctx.tourSizeOk(3) && ctx.tourSizeOk(4) && ctx.tourSizeOk(20) && !ctx.tourSizeOk(21) && !ctx.tourSizeOk(7.5) && !ctx.tourSizeOk("8") && !ctx.tourSizeOk(undefined));

// ---- 2. the estimate (pure), every n ----
var EST = { 4: "1h15–1h30", 5: "1h45–2h00", 6: "2h15", 7: "2h30", 8: "3h00–3h30", 9: "3h45–4h15", 10: "4h00–4h30", 11: "4h15–4h45", 12: "3h45–4h15", 13: "4h45–5h15", 14: "5h00–5h30", 15: "5h15–5h45", 16: "4h30–5h00", 17: "5h45–6h15", 18: "6h00–6h30", 19: "6h15–6h45", 20: "5h15–5h45" };
for (n = 4; n <= 20; n++) {
  var e = ctx.tourEstimate(n);
  assert.strictEqual(ctx.tourEstimateText(e), EST[n], "estimate text for " + n);
  assert.strictEqual(e.minGames, e.mix + (n <= 5 ? 2 : n <= 7 ? 3 : 6)); assert.strictEqual(e.maxGames, e.mix + (n <= 5 ? 3 : n <= 7 ? 3 : 8));
  assert.strictEqual(e.minMin, e.minGames * 15); assert.strictEqual(e.per, 15);
}
assert.strictEqual(ctx.tourEstimate(12, 10).maxMin, 170, "the minutes per game can be given");
assert.strictEqual(ctx.tourFmtDur(135), "2h15"); assert.strictEqual(ctx.tourFmtDur(120), "2h"); assert.strictEqual(ctx.tourFmtDur(120, true), "2h00"); assert.strictEqual(ctx.tourFmtDur(255, true), "4h15");
assert.strictEqual(ctx.tourBookedMin({ duration: 2 }), 120); assert.strictEqual(ctx.tourBookedMin({ duration: 1.5 }), 90); assert.strictEqual(ctx.tourBookedMin({}), 0);
assert.strictEqual(ctx.TOUR_MIN_PER_GAME, 15);

// ---- 3. playoff by size ----
function ranksOf(T) { return ctx.tourPairs(T).map(function (p) { return p.ranks.join("+"); }).sort().join(" "); }
for (n = 4; n <= 20; n++) {
  var T = ctx.tourNew(uids(n), seeded(40 + n));
  playMix(T, function (g, X) { var i = X.games.indexOf(g); return [21, 8 + (i * 5) % 11]; });
  var want = n <= 5 ? "1+4 2+3" : n <= 7 ? "1+6 2+5 3+4" : "1+8 2+7 3+6 4+5";
  assert.strictEqual(ranksOf(T), want, "pairs for " + n + " players");
  var table = ctx.tourStats(T); table.forEach(function (r) { assert.strictEqual(r.p, ctx.tourK(n)); });
  ctx.tourDraw(T, seeded(1));
  var P = ctx.tourPairs(T), q = ctx.tourQ(T), inPo = {};
  if (n <= 5) {
    assert.strictEqual(ctx.tourKind(T), "final"); assert.strictEqual(T.po.length, 1); assert.ok(T.po[0].fin && T.po[0].pa === 0 && T.po[0].pb === 1);
    while (ctx.tourNext(T)) playNext(T, function (g) { return [21, 12]; });   // first side wins 2-0
    assert.strictEqual(T.po.length, 2, "2-0 final: 2 games"); assert.ok(ctx.tourComplete(T)); assert.strictEqual(ctx.tourOrder(T).length, 2, "top 4: a final only, no 3rd place");
  } else if (n <= 7) {
    assert.strictEqual(ctx.tourKind(T), "rr"); assert.strictEqual(T.po.length, 3);
    assert.strictEqual(J(T.po.map(function (g) { return [g.pa, g.pb]; })), J([[0, 1], [0, 2], [1, 2]]));
    while (ctx.tourNext(T)) playNext(T);
    assert.ok(ctx.tourComplete(T)); assert.strictEqual(ctx.tourOrder(T).length, 3);
  } else {
    assert.strictEqual(ctx.tourKind(T), "bracket"); assert.strictEqual(J(T.semi), J([0, 3, 1, 2]), "semis are seeded: pair 1 v 4, pair 2 v 3");
    assert.strictEqual(J(T.po.map(function (g) { return [g.pa, g.pb]; })), J([[0, 3], [1, 2]]));
    var labs = [];
    while (ctx.tourNext(T)) labs.push(playNext(T).lab);
    assert.strictEqual(labs.join(","), "S1,S2,T1,T2,F1,F2", "3rd place (best of 3) before the final (best of 3), 2-0 each: " + labs);
    assert.ok(ctx.tourComplete(T)); assert.strictEqual(ctx.tourOrder(T).length, 3);
  }
  tourAllPlayers(T).forEach(function (u) { inPo[u] = 1; });
  function tourAllPlayers(X) { var o = []; X.po.forEach(function (g) { ctx.tourOn(g).a.concat(ctx.tourOn(g).b).forEach(function (i) { if (o.indexOf(i) < 0) o.push(i); }); }); return o; }
  assert.strictEqual(Object.keys(inPo).length, q, "exactly the top " + q + " play the playoff (n " + n + ")");
  var topIds = ctx.tourStats(T).slice(0, q).map(function (r) { return r.id; }).sort().join(",");
  assert.strictEqual(Object.keys(inPo).sort().join(","), topIds, "and they are the top of the table");
}

// ---- 4. table order: wins, point diff, points scored ----
(function () {
  var T = { v: 1, fmt: 2, n: 5, q: 4, ids: uids(5), coin: [0, 1, 2, 3, 4], games: [], po: [], drawn: false, semi: null, out: [] };
  function G(a, b, sa, sb) { T.games.push({ ph: "rot", a: a, b: b, sa: sa, sb: sb }); }
  // 0 and 1 both win 2 games; 0 has the better diff; 2 and 3 both 1 win, same diff, 3 scored more
  G([0, 4], [2, 3], 21, 10); G([0, 2], [1, 4], 21, 19); G([1, 3], [0, 4], 21, 15); G([1, 2], [3, 4], 21, 9); G([2, 3], [0, 1], 30, 29);
  var r = ctx.tourStats(T).map(function (x) { return x.id + ":" + x.w + ":" + (x.pf - x.pa) + ":" + x.pf; });
  var order = ctx.tourStats(T).map(function (x) { return x.id; });
  var s = ctx.tourStats(T);
  for (var i = 1; i < s.length; i++) {
    var a = s[i - 1], b = s[i];
    assert.ok(a.w > b.w || (a.w === b.w && ((a.pf - a.pa) > (b.pf - b.pa) || ((a.pf - a.pa) === (b.pf - b.pa) && a.pf >= b.pf))), "sorted: wins, diff, points scored: " + r.join(" "));
  }
  // the points-scored step on its own
  var U = { v: 1, fmt: 2, n: 4, q: 4, ids: uids(4), coin: [3, 2, 1, 0], games: [
    { ph: "rot", a: [0, 1], b: [2, 3], sa: 21, sb: 11 }, { ph: "rot", a: [0, 2], b: [1, 3], sa: 11, sb: 21 }, { ph: "rot", a: [0, 3], b: [1, 2], sa: 21, sb: 11 }], po: [], drawn: false, semi: null, out: [] };
  var su = ctx.tourStats(U); assert.ok(su[0].w >= su[1].w);
  var V = { v: 1, fmt: 2, n: 4, q: 4, ids: uids(4), coin: [0, 1, 2, 3], games: [{ ph: "rot", a: [0, 1], b: [2, 3], sa: 21, sb: 10 }, { ph: "rot", a: [0, 2], b: [1, 3], sa: 10, sb: 21 }, { ph: "rot", a: [0, 3], b: [1, 2], sa: 21, sb: 10 }], po: [], drawn: false, semi: null, out: [] };
  var sv = ctx.tourStats(V);
  assert.strictEqual(sv[0].w, 2); assert.ok(sv[0].pf - sv[0].pa >= sv[1].pf - sv[1].pa);
})();

// ---- 5. 3rd place best of 3 (new), final best of 3 ----
function bracketReady(n, seed) { var T = ctx.tourNew(uids(n), seeded(seed)); playMix(T, function (g, X) { return [21, 8 + (X.games.indexOf(g) * 3) % 9]; }); ctx.tourDraw(T, seeded(1)); return T; }
(function () {
  var T = bracketReady(10, 3);
  playNext(T); playNext(T);   // both semis
  assert.strictEqual(T.po.length, 4); assert.ok(T.po[2].th && T.po[2].lab === "T1" && !T.po[2].fin && T.po[3].fin && T.po[3].lab === "F1");
  // 3rd place goes 1-1-then 2-1; final 1-2
  var labs = [], res = { T1: [21, 10], T2: [10, 21], T3: [21, 12], F1: [21, 10], F2: [10, 21], F3: [15, 21] };
  while (ctx.tourNext(T)) { var g = ctx.tourNext(T); labs.push(g.lab); ctx.tourApply(T, g, res[g.lab][0], res[g.lab][1]); }
  assert.strictEqual(labs.join(","), "T1,T2,T3,F1,F2,F3", "3rd place is played first, game 3 only when 1-1: " + labs);
  assert.ok(ctx.tourComplete(T)); assert.strictEqual(T.po.length, 8);
  var o = ctx.tourOrder(T), th = ctx.tourThirds(T), f = ctx.tourFinals(T);
  assert.strictEqual(o[2], th[0].pa, "3rd = the side that won the series 2-1"); assert.strictEqual(o[0], f[0].pb, "champion = the side that won 2-1 on side b");
  assert.strictEqual(o[1], f[0].pa);
  assert.strictEqual(ctx.tourThirdWins(T).wa, 2); assert.strictEqual(ctx.tourFinalWins(T).wb, 2);
  // correcting T2 so that it is 2-0 trims T3, the final stays
  var t2 = T.po[3]; assert.strictEqual(t2.lab, "T2");
  ctx.tourApply(T, t2, 21, 8);
  assert.ok(!T.po.some(function (g) { return g.lab === "T3"; }), "T3 is gone after 2-0"); assert.ok(ctx.tourComplete(T));
  assert.strictEqual(ctx.tourFinals(T).length, 3, "the final games stay");
  // and back to 1-1: T3 comes in before the final games and is empty again (not complete)
  ctx.tourApply(T, t2, 10, 21);
  var labsNow = T.po.map(function (g) { return g.lab; }).join(",");
  assert.strictEqual(labsNow, "S1,S2,T1,T2,T3,F1,F2,F3", "the new 3rd place game sits before the final: " + labsNow); assert.ok(!ctx.tourComplete(T), "T3 is open");
  // pair 1 and pair 4 both go out: the first gives a walkover, the second is already through it; the other semi decides
  var X = bracketReady(8, 9); ctx.tourMarkOut(X, 0, "injury"); assert.ok(X.po[0].wo && X.po[0].sb === 21, "S1 is a walkover for pair 4"); ctx.tourMarkOut(X, 3, "left");
  var kk = 0; while (ctx.tourNext(X) && kk++ < 12) playNext(X, function () { return [21, 9]; });
  assert.ok(ctx.tourComplete(X), "it still finishes (3rd place and the final by walkover where a pair is out)");
})();
(function () {   // 2-0, 2-0 and the swap marks of v242 follow the games when a game moves
  var A = { sa: 1, sb: 0 }, B = { sa: 1, sb: 0 }, C = { sa: 1, sb: 0 }, N = { sa: null, sb: null };
  var T = { games: [A], po: [B, C], swaps: [{ i: 0, from: "x", to: "y", at: 3, old: [2] }, { i: 1, from: "p", to: "q", at: 1 }] };
  var oldAll = ctx.tourAll(T); T.po = [B, N, C]; ctx._tourRemap(T, oldAll);
  assert.strictEqual(T.swaps[0].at, 4, "a swap made after every game stays after them"); assert.strictEqual(J(T.swaps[0].old), J([3]), "the old game keeps its player"); assert.strictEqual(T.swaps[1].at, 1);
})();

// ---- 6. old format (format 1): stored tournaments render and continue as before ----
function clone(x) { return JSON.parse(JSON.stringify(x)); }
[6, 8].forEach(function (n) {
  var T = ctx.tourNewV1(uids(n), seeded(11 + n));
  assert.strictEqual(T.fmt, undefined, "format 1 has no fmt"); assert.strictEqual(T.games.length, n === 6 ? 9 : 6);
  var stored = clone(T);   // what Firestore hands back
  assert.strictEqual(ctx.tourFmt(stored), 1); assert.strictEqual(ctx.tourQ(stored), n); assert.strictEqual(ctx.tourKind(stored), n === 6 ? "rr" : "bracket");
  assert.strictEqual(J(ctx.tourTotals(stored)), n === 6 ? J({ min: 12, max: 12 }) : J({ min: 11, max: 12 }));
  assert.ok(ctx.tourOf({ id: "s", tourney: stored }), "an old tournament is still valid");
  // half way through, saved, read back, finished
  var half = clone(stored); for (var i = 0; i < 3; i++) playNext(half, function () { return [21, 17]; });
  var back = clone(half); playAll(back, function (g) { return [21, 14]; }, seeded(2));
  assert.ok(ctx.tourComplete(back));
  if (n === 8) {
    assert.strictEqual(back.po.length, 5, "old 8: 2 semis, ONE 3rd place game, final 2-0"); assert.strictEqual(back.po[2].lab, "T"); assert.ok(!back.po[2].th);
    assert.strictEqual(J(back.po.map(function (g) { return g.lab; })), J(["S1", "S2", "T", "F1", "F2"]));
  } else assert.strictEqual(back.po.length, 3, "old 6: round robin of 3");
  // old 8: semis are drawn at random (not 1v4/2v3 by seed) and the third place is a single game
  if (n === 8) {
    var w = clone(stored); playMix(w); ctx.tourDraw(w, seeded(99)); assert.strictEqual(w.semi.length, 4);
    var seq = []; for (var q2 = 0; q2 < 12; q2++) { var w2 = clone(stored); playMix(w2); ctx.tourDraw(w2, seeded(q2 + 1)); seq.push(J(w2.semi)); }
    assert.ok(seq.some(function (x) { return x !== J([0, 3, 1, 2]); }), "format 1 draws the semis at random");
    var F = clone(w); while (ctx.tourNext(F)) playNext(F, function (g) { return g.lab === "T" ? [10, 21] : [21, 18]; });
    assert.strictEqual(ctx.tourOrder(F).length, 3); assert.strictEqual(ctx.tourOrder(F)[2], F.po[2].pb, "old 3rd place: the winner of the single game");
  }
  // a finished old tournament: the Hall of Fame record is as before
  var done = playAll(clone(stored), null, seeded(3));
  var rec = ctx.hofRecord({ id: "S" + n, date: "2026-10-01", groupId: "g1", createdAt: 5, tourney: done }, "g1", nameOf, "u0");
  assert.ok(rec && rec.n === n && rec.champion && (n === 6 ? !!rec.finalScore : /^2–/.test(rec.finalScore)));
  // the info sheet of an old tournament explains the old rules
  var m = ctx.tourInfoModel(n, stored); assert.ok(m.secs[0].p[0] === tt(n === 8 ? "tourRule8" : "tourRule6"));
  // stand-in and pair-out on an old tournament still work
  var o = ctx.tourNewV1(uids(n), seeded(5)); playMix(o); ctx.tourDraw(o, seeded(1)); assert.ok(ctx.tourMarkOut(o, 0, "injury")); assert.ok(!ctx.tourMarkOut(o, n / 2, "injury"), "pairs are n/2 in format 1");
});
// a literal old document (fields exactly as saved by v227–v248) keeps working
(function () {
  var lit = { v: 1, n: 6, ids: uids(6), coin: [3, 1, 0, 2, 5, 4], games: [], po: [], drawn: false, semi: null, out: [] };
  [[[0, 2], [5, 3]], [[1, 4], [3, 2]], [[4, 1], [0, 5]], [[0, 3], [5, 2]], [[1, 2], [4, 5]], [[1, 3], [4, 0]], [[0, 1], [2, 4]], [[3, 4], [5, 2]], [[5, 1], [3, 0]]].forEach(function (g) { lit.games.push({ ph: "rot", a: g[0], b: g[1], sa: null, sb: null }); });
  var s = { id: "L", tourney: lit }; assert.ok(ctx.tourOf(s));
  playAll(lit, null, seeded(1)); assert.ok(ctx.tourComplete(lit)); assert.strictEqual(lit.po.length, 3);
  assert.strictEqual(lit.q, undefined, "format 1 documents are not rewritten with new fields"); assert.strictEqual(lit.fmt, undefined);
})();
assert.ok(!ctx.tourOf({ tourney: { v: 1, fmt: 2, n: 3, ids: ["a", "b", "c"], games: [], po: [] } }), "a format 2 document with a size outside 4–20 is refused");

// ---- 7. stand-ins in the new format ----
(function () {
  var T = ctx.tourNew(uids(12), seeded(21)), g0 = T.games[0], on0 = g0.a.concat(g0.b), from = on0[0];
  var el = ctx.tourEligible(T, g0, from);
  assert.strictEqual(el.length, 8, "everybody not on court is eligible"); on0.forEach(function (x) { assert.ok(el.indexOf(x) < 0); });
  var pick = ctx.tourAutoPick(T, g0, from, function (i) { return nameOf(T.ids[i]); }); assert.ok(el.indexOf(pick) >= 0);
  assert.ok(ctx.tourSub(T, 0, from, pick, "injury", "knee", true, function (i) { return nameOf(T.ids[i]); }));
  T.games.forEach(function (g) { assert.ok(ctx.tourOn(g).a.concat(ctx.tourOn(g).b).indexOf(from) < 0, "the hurt player is on no game"); });
  assert.ok(ctx.tourEligible(T, T.games[1], T.games[1].a[0]).indexOf(from) < 0, "a hurt player is not a stand-in");
  playMix(T); ctx.tourDraw(T, seeded(2));
  T.po.forEach(function (g) { assert.ok(ctx.tourOn(g).a.concat(ctx.tourOn(g).b).indexOf(from) < 0, "and not in the playoff"); });
  // playoff stand-in: players below the line are eligible when not on court
  var s1 = T.po[0], gi = ctx.tourAll(T).indexOf(s1), pf = ctx.tourOn(s1).a[0], e2 = ctx.tourEligible(T, s1, pf);
  assert.strictEqual(e2.length, 12 - 4 - 1, "12 - 4 on court - the hurt player: " + e2.length);
  assert.ok(ctx.tourSub(T, gi, pf, e2[0], "other", "", false));
  var k = 0; while (ctx.tourNext(T) && k++ < 20) playNext(T);
  assert.ok(ctx.tourComplete(T));
  // 4 players: nobody rests, so nobody can step in: walkover
  var W = ctx.tourNew(uids(4), seeded(3));
  assert.strictEqual(ctx.tourEligible(W, W.games[0], W.games[0].a[0]).length, 0);
  assert.ok(ctx.tourSub(W, 0, W.games[0].a[0], -1, "injury", "", false)); assert.ok(W.games[0].wo && W.games[0].woHurt !== undefined);
  // new-format games in a tournament with stand-ins still make stats records with the stand-in credited
  var sess = { id: "SS", date: "2026-10-26", createdAt: 1000, groupId: "g1", tourney: T }, ms = ctx.tourMatches(sess, "g1");
  assert.ok(ms.length > 0 && ms.every(function (m) { return m.tid === "SS" && m.sessionId === "SS" && /^t:SS:\d+$/.test(m.id) && m.tstage; }));
})();
// swap a player in a session edit (v242) in the new format
(function () {
  var T = ctx.tourNew(uids(7), seeded(8)); playNext(T); playNext(T);
  assert.ok(ctx.tourSwap(T, "u3", "u9", [], nameOf)); assert.strictEqual(ctx.tourUid(T, 3), "u9");
  assert.strictEqual(ctx.tourUid(T, 3, 0), "u3", "played games keep the old player"); assert.strictEqual(ctx.tourUid(T, 3, 5), "u9");
  playMix(T); ctx.tourDraw(T, seeded(1)); while (ctx.tourNext(T)) playNext(T);
  assert.ok(ctx.tourComplete(T));
  var ms = ctx.tourMatches({ id: "SW", date: "d", createdAt: 1, tourney: T }, "g");
  assert.ok(ms.some(function (m) { return m.teamA.concat(m.teamB).indexOf("u9") >= 0; }) && ms.some(function (m) { return m.teamA.concat(m.teamB).indexOf("u3") >= 0; }));
})();

// ---- 7b. a pair that is out: top-4 final, top-6 round robin, top-8 bracket ----
[[5, 4], [7, 6], [12, 8]].forEach(function (c) {
  var n = c[0], q = c[1], T = ctx.tourNew(uids(n), seeded(60 + n));
  playMix(T, function (g, X) { return [21, 10 + (X.games.indexOf(g) * 7) % 10]; }); ctx.tourDraw(T, seeded(1));
  assert.ok(!ctx.tourMarkOut(T, q / 2, "injury"), "no pair number " + (q / 2 + 1) + " with " + q + " in the playoff");
  assert.ok(ctx.tourMarkOut(T, 0, "injury", "ankle"), "pair 1 out (n " + n + ")");
  var k = 0; while (ctx.tourNext(T) && k++ < 20) playNext(T, function () { return [21, 13]; });
  assert.ok(ctx.tourComplete(T), "completes after a pair is out (n " + n + ")");
  var o = ctx.tourOrder(T); assert.ok(o[0] >= 0 && o[0] !== 0, "the out pair is not champion (n " + n + ")");
  assert.ok(T.po.some(function (g) { return g.wo; }), "walkovers were given");
  if (q === 4) assert.strictEqual(T.po.length, 2, "final: 2 walkovers");
  // undo: back in
  var U = ctx.tourNew(uids(n), seeded(70 + n)); playMix(U); ctx.tourDraw(U, seeded(1)); ctx.tourMarkOut(U, 1, "left"); assert.ok(ctx.tourUndoOut(U, 1)); assert.ok(!U.po.some(function (g) { return g.wo; }));
});
// pair out in a 3rd place series: the walkovers end it 2-0
(function () {
  var T = bracketReady(9, 12); playNext(T, function () { return [21, 10]; }); playNext(T, function () { return [21, 10]; });
  var th = ctx.tourThirds(T)[0]; ctx.tourMarkOut(T, th.pa, "injury");
  assert.strictEqual(ctx.tourThirds(T).length, 2); assert.ok(ctx.tourThirds(T).every(function (g) { return g.wo && g.sb === 21; }));
  var k = 0; while (ctx.tourNext(T) && k++ < 10) playNext(T); assert.ok(ctx.tourComplete(T)); assert.strictEqual(ctx.tourOrder(T)[2], th.pb);
})();

// ---- 8. start button, warning, info sheet ----
(function () {
  var sess = { id: "S", date: "2026-10-26", duration: 2, players: uids(12), createdBy: "u0", groupId: "g1" };
  ctx.lastSessions = [sess];
  var st = ctx.tourStage(sess); assert.strictEqual(st.act, "start"); assert.strictEqual(st.label, "Start · 12 players · ~3h45–4h15");
  sess.players = uids(6); assert.strictEqual(ctx.tourStage(sess).label, "Start · 6 players · ~2h15");
  sess.players = uids(3); st = ctx.tourStage(sess); assert.ok(st.disabled && st.label === "Needs at least 4 players (now 3)");
  sess.players = uids(21); st = ctx.tourStage(sess); assert.ok(st.disabled && st.label === "Up to 20 players (now 21)");
  for (var n = 4; n <= 20; n++) { sess.players = uids(n); var s2 = ctx.tourStage(sess); assert.ok(s2.act === "start" && !s2.disabled, "start for " + n); }
  // the confirm: a warning line when the estimate's upper bound is above the booked time
  sess.players = uids(12); asked.length = 0; ctx.tourAskStart(sess, true);
  var a = asked[0].o; assert.strictEqual(a.detail, "This takes about 4h15, longer than the 2h booked."); assert.strictEqual(a.kind, "warn"); assert.ok(/12 players/.test(a.body) && /3 matches/.test(a.body));
  sess.duration = 5; asked.length = 0; ctx.tourAskStart(sess, true); assert.ok(!asked[0].o.detail && asked[0].o.kind === "ask", "no warning when it fits");
  sess.duration = 4.25; asked.length = 0; ctx.tourAskStart(sess, true); assert.ok(!asked[0].o.detail, "exactly the booked time is fine");
  sess.duration = 4; asked.length = 0; ctx.tourAskStart(sess, true); assert.strictEqual(asked[0].o.detail, "This takes about 4h15, longer than the 4h booked.");
  delete sess.duration; asked.length = 0; ctx.tourAskStart(sess, true); assert.ok(!asked[0].o.detail, "no booked time: no warning");
  sess.players = uids(4); sess.duration = 1; asked.length = 0; ctx.tourAskStart(sess, true); assert.strictEqual(asked[0].o.detail, "This takes about 1h30, longer than the 1h booked.");
  // the info model, personalised
  var m = ctx.tourInfoModel(12, null), txt = m.secs.map(function (x) { return x.p.join(" "); }).join(" | ");
  assert.ok(/Everyone plays 3 matches\. 9 mix matches in all\./.test(txt) && /Players resting in each match: 8\./.test(txt), txt);
  assert.ok(/The top 8 play\. Pairs, best with worst: #1\+#8, #2\+#7, #3\+#6, #4\+#5\./.test(txt) && /3rd place and the final/.test(txt) && /Best of 3: the first pair to 2 wins\. Match 3 is played only if it is 1–1\./.test(txt), txt);
  assert.ok(/Most wins first, then point difference, then points scored/.test(txt) && /About 3h45–4h15 in all \(15–17 matches, 15 minutes each/.test(txt) && /Replace player/.test(txt) && /Players below the line are done/.test(txt), txt);
  var m5 = ctx.tourInfoModel(5, null), t5 = m5.secs.map(function (x) { return x.p.join(" "); }).join(" | ");
  assert.ok(/Everyone plays 4 matches\. 5 mix matches/.test(t5) && /resting in each match: 1\./.test(t5) && /The top 4 play\. Pairs, best with worst: #1\+#4, #2\+#3\./.test(t5) && /final: #1\+#4 against #2\+#3/.test(t5), t5);
  var m7 = ctx.tourInfoModel(7, null), t7 = m7.secs.map(function (x) { return x.p.join(" "); }).join(" | ");
  assert.ok(/#1\+#6, #2\+#5, #3\+#4/.test(t7) && /play each other once \(3 matches\)/.test(t7) && !/Best of 3/.test(t7), t7);
  var m4 = ctx.tourInfoModel(4, null), t4 = m4.secs.map(function (x) { return x.p.join(" "); }).join(" | "); assert.ok(!/below the line/.test(t4) && /resting in each match: 0\./.test(t4), t4);
  var mo = ctx.tourInfoModel(25, null); assert.ok(/Up to 20 players \(now 25\)/.test(mo.secs[0].p[0]));
  for (n = 4; n <= 20; n++) { var mm = ctx.tourInfoModel(n, null); mm.secs.forEach(function (x) { x.p.concat([x.h]).forEach(function (q) { assert.ok(!/undefined|NaN|\{\w+\}/.test(q), "info for " + n + " has no holes: " + q); }); }); }
  // the sheet itself: a dialog, labelled, closes, focus goes back
  ctx.lastSessions = [{ id: "S", players: uids(12), createdBy: "u0" }];
  var opener = { focus: function () { focusLog.push("opener"); } }; focusLog.length = 0;
  ctx.tourOpenInfo("S", opener);
  var sheet = els.tnInfoSheet; assert.ok(sheet && /role="dialog" aria-modal="true" aria-labelledby="tnInfoT"/.test(sheet.innerHTML) && /id="tnInfoT"/.test(sheet.innerHTML) && /data-iact="close"/.test(sheet.innerHTML));
  assert.ok(/12 players/.test(sheet.innerHTML) && !/\[|undefined/.test(sheet.innerHTML.replace(/<[^>]*>/g, "")), "plain words");
  assert.strictEqual(focusLog[0], "close", "focus moves into the sheet");
  ctx._tnInfoClose(); assert.ok(!els.tnInfoSheet && focusLog[focusLog.length - 1] === "opener", "closing returns the focus");
})();
// the source wires the sheet: header button, Start button, Escape closes the sheet first
(function () {
  var src = fs.readFileSync("js/tournament.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8");
  assert.ok(/_tnInfoBtn\('data-act="info"'\)/.test(src) && /tourOpenInfo\(\\'' \+ jsq\(s\.id\)/.test(src), "the i button is in the header and next to Start (screen and card)");
  assert.ok(/getElementById\("tnInfoSheet"\) \|\| document\.getElementById\("tnFairSheet"\)\) return;/.test(src), "Escape closes the sheet (rules or fairness) before the screen");
  assert.ok(/\.tn-info\b/.test(css) && /width: 44px; min-height: 44px/.test(css), "a 44px touch target");
})();

// ---- 9. stats: tourMatches / merge with the new format ----
(function () {
  var T = ctx.tourNew(uids(10), seeded(4)); playAll(T, function (g) { return [21, 12]; });
  var s = { id: "SX", date: "2026-10-26", groupId: "g1", createdAt: 1000, courtName: "AP", tourney: T }, ms = ctx.tourMatches(s, "g1");
  assert.strictEqual(ms.length, ctx.tourAll(T).length, "every game of the tournament is a record");
  var ids = {}; ms.forEach(function (m) { assert.ok(!ids[m.id]); ids[m.id] = 1; assert.strictEqual(m.tid, "SX"); assert.strictEqual(m.sessionId, "SX"); assert.strictEqual(m.type, "md"); assert.strictEqual(m.mode, "competition"); assert.ok(m.teamA.length === 2 && m.teamB.length === 2 && m.date === "2026-10-26"); });
  var stages = ms.map(function (m) { return m.tstage; });
  assert.ok(stages.indexOf("rot") >= 0 && stages.indexOf("T1") >= 0 && stages.indexOf("F1") >= 0 && stages.indexOf("S1") >= 0, stages.join(","));
  var merged = ctx.tourMergeMatches([{ id: "m1", sessionId: "Z", teamA: ["a", "b"], teamB: ["c", "d"], games: [{ a: 21, b: 5 }], date: "2026-10-01" }], [s], "g1");
  assert.strictEqual(merged.length, ms.length + 1); assert.ok(merged.filter(function (m) { return m.tid; }).length === ms.length);
  assert.strictEqual(ctx.tourLabText("T2"), "3rd place · match 2"); assert.strictEqual(ctx.tourLabText("T"), "3rd place"); assert.strictEqual(ctx.tourLabText("F3"), "Final · match 3"); assert.strictEqual(ctx.tourLabText("S2"), "Semi 2");
  // the All matches page lists tournament games by tid (filter "tournament")
  var ma = fs.readFileSync("js/matches-all.js", "utf8"); assert.ok(/f\.type === "tournament" && !g\.tid/.test(ma) && /if \(g\.tid\) so\.tour = true/.test(ma));
})();

// ---- 10. Hall of Fame record against the rules ----
(function () {
  var rules = fs.readFileSync("firestore.rules", "utf8"), m = rules.match(/function hofOk\(d\) \{([\s\S]*?)\n    \}/); assert.ok(m, "hofOk found");
  var body = m[1]; assert.ok(/d\.n is int && d\.n >= 4 && d\.n <= 20/.test(body) && !/d\.n in \[6, 8\]/.test(body), "the rules accept 4 to 20");
  var allowed = body.match(/hasOnly\(\[([^\]]*)\]/)[1].split(",").map(function (x) { return x.trim().replace(/'/g, ""); });
  var maxGames = +body.match(/d\.get\('finalGames', \[\]\)\.size\(\) <= (\d+)/)[1], maxOuts = +body.match(/d\.get\('outs', \[\]\)\.size\(\) <= (\d+)/)[1];
  function rulesOk(d) {
    return Object.keys(d).every(function (k) { return allowed.indexOf(k) >= 0; }) && typeof d.sid === "string" && d.sid.length <= 80 && d.date.length <= 10 &&
      Math.floor(d.n) === d.n && d.n >= 4 && d.n <= 20 && d.champion && d.champion.uids.length <= 2 && d.champion.names.length <= 2 &&
      [d.runnerUp, d.third].every(function (x) { return x == null || (x.uids.length <= 2 && x.names.length <= 2); }) && d.finalScore.length <= 8 && d.finalGames.length <= maxGames && d.outs.length <= maxOuts && typeof d.createdAt === "number";
  }
  for (var n = 4; n <= 20; n++) {
    var T = ctx.tourNew(uids(n), seeded(80 + n));
    // the longest shape: everything goes to game 3, and every pair of the playoff has a note out
    playAll(T, function (g) { var w = { T1: [21, 10], T2: [10, 21], T3: [21, 10], F1: [21, 10], F2: [10, 21], F3: [21, 17] }[g.lab]; return w || [21, 14]; });
    var rec = ctx.hofRecord({ id: "H" + n, date: "2026-10-26", groupId: "g1", createdAt: 7, tourney: T }, "g1", nameOf, "u0");
    assert.ok(rec, "record for " + n); assert.strictEqual(rec.n, n); assert.ok(rulesOk(rec), "valid against the rules for " + n + ": " + J(rec));
    assert.strictEqual(J(ctx.hofClean(rec).n), String(n), "hofClean keeps n");
    if (n <= 5) { assert.strictEqual(rec.third, null, "top 4: no 3rd place"); assert.ok(/^2–[01]$/.test(rec.finalScore)); }
    else if (n >= 8) { assert.ok(rec.third && /^2–[01]$/.test(rec.finalScore) && rec.finalGames.length === 3, "bracket record has a 3rd and a 3-game final: " + J(rec)); }
    else { assert.ok(rec.third && /^\d–\d$/.test(rec.finalScore)); }
  }
  // outs: up to 4 pairs
  var T = ctx.tourNew(uids(16), seeded(5)); playMix(T); ctx.tourDraw(T, seeded(1));
  [0, 1, 2].forEach(function (p) { ctx.tourMarkOut(T, p, "injury"); }); var k = 0; while (ctx.tourNext(T) && k++ < 20) playNext(T);
  if (ctx.tourComplete(T)) { var r2 = ctx.hofRecord({ id: "O", date: "d", groupId: "g1", createdAt: 1, tourney: T }, "g1", nameOf, "u0"); if (r2) assert.ok(rulesOk(r2) && r2.outs.length <= 4); }
  assert.strictEqual(ctx.hofClean({ champion: { uids: ["a", "b"], names: ["A", "B"] }, n: 13 }).n, 13); assert.strictEqual(ctx.hofClean({ champion: { uids: ["a", "b"], names: ["A", "B"] }, n: 99 }).n, 8);
  assert.strictEqual(ctx._hofHasFinal(6), false); assert.strictEqual(ctx._hofHasFinal(7), false); assert.strictEqual(ctx._hofHasFinal(5), true); assert.strictEqual(ctx._hofHasFinal(8), true);
})();

// ---- 11. the screen steps for the new format ----
(function () {
  [4, 5, 7, 12].forEach(function (n) {
    var T = ctx.tourNew(uids(n), seeded(n)), tc = { Math: Math, JSON: JSON, t: tt, escapeHtml: String, icon: function () { return ""; } };
    // phases: 0 mix, 1 pairs waiting, 2 playoff, 3 done: the four steps stay the same for every size
    assert.strictEqual(ctx.tourPhase(T), 0); playMix(T); assert.strictEqual(ctx.tourPhase(T), 1); assert.strictEqual(ctx._tnViewNow(T), 1);
    ctx.tourDraw(T, seeded(1)); assert.strictEqual(ctx._tnViewNow(T), 2, "after the pairs are made the Playoff step shows"); playNext(T); assert.strictEqual(ctx.tourPhase(T), 2);
    while (ctx.tourNext(T)) playNext(T); assert.strictEqual(ctx.tourPhase(T), 3); assert.strictEqual(ctx._tnViewNow(T), 3);
    assert.strictEqual(J(ctx.tourTabParts(T, 2)), J(["bracket", "po"]));
  });
})();

console.log("tournament-v249 OK");
