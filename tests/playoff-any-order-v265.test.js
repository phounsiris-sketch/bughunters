/* Run: node tests/playoff-any-order-v265.test.js — v265: the 3rd place and the final series (best of 3) can be played in any order
   (3rd G1, Final G1, 3rd G2, Final G2 ...). Same standings, same podium; game 3 only at 1-1; the cards of those games get Live score / Add score. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function uids(n) { var a = []; for (var i = 0; i < n; i++) a.push("u" + i); return a; }
var names = {}; uids(24).forEach(function (u) { names[u] = "Player " + u; });
var J = function (x) { return JSON.stringify(x); };
var ic = { console: console, localStorage: { getItem: function () { return "en"; } }, document: {}, window: {} };
vm.createContext(ic); vm.runInContext(fs.readFileSync("js/i18n.js", "utf8"), ic);
var ctx = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, Object: Object, Array: Array, Promise: Promise, String: String, Number: Number,
  t: function (k) { return ic.t(k); }, escapeHtml: function (v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }, icon: function (n) { return "<i:" + n + ">"; }, jsq: String,
  plainUserName: function (u) { return u ? u.displayName : "?"; }, findUser: function (u) { return { displayName: names[u] || u }; },
  getUserName: function (u) { return names[u] || u; }, avatarHtml: function (u) { return "<av " + u + ">"; },
  canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, fmtDate: String, askConfirm: function () {},
  document: { getElementById: function () { return null; }, body: { classList: { add: function () {}, remove: function () {} } }, addEventListener: function () {}, removeEventListener: function () {} },
  lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/tournament.js", "utf8"), ctx, { filename: "js/tournament.js" });

// fixed result per game label: the same result whenever the game is played
var RES = { S1: [21, 12], S2: [14, 21], T1: [21, 10], T2: [15, 21], T3: [21, 18], F1: [21, 19], F2: [18, 21], F3: [21, 15] };
function byLab(T, lab) { return T.po.filter(function (g) { return g.lab === lab; })[0]; }
function play(T, lab, res) { var g = byLab(T, lab); assert.ok(g, lab + " exists"); assert.ok(!ctx.tourDone(g), lab + " not played yet"); var r = (res || RES)[lab]; ctx.tourApply(T, g, r[0], r[1]); }
function upToSemis(n) {
  var T = ctx.tourNew(uids(n), seeded(11));
  while (!ctx.tourRotDone(T)) { var g = ctx.tourNext(T); ctx.tourApply(T, g, 21, 12 + (T.games.indexOf(g) % 7)); }
  ctx.tourDraw(T, seeded(5));
  return T;
}
function snapshot(T) {
  var po = T.po.slice().sort(function (a, b) { return a.lab < b.lab ? -1 : 1; }).map(function (g) { return g.lab + ":" + g.sa + "-" + g.sb; });
  return J({ po: po, stats: ctx.tourStats(T), complete: ctx.tourComplete(T), order: ctx.tourOrder(T), th: ctx.tourThirdWins(T), fin: ctx.tourFinalWins(T), n: T.po.length, labs: T.po.map(function (g) { return g.lab; }) });
}
/** play the playoff, picking the next game from `plan` (a list of labels; a label that does not exist or is done is skipped) */
function runPlan(n, plan, res) {
  var T = upToSemis(n);
  play(T, "S1", res); play(T, "S2", res);
  plan.forEach(function (lab) { var g = byLab(T, lab); if (g && !ctx.tourDone(g)) { assert.ok(ctx.tourAnyOrder(T, g), lab + " may be played now"); play(T, lab, res); } });
  return T;
}

// ---- 1. the series cards: any pending game of a series can be started ----
[8, 11, 16, 20].forEach(function (n) {
  var T = upToSemis(n); play(T, "S1"); play(T, "S2");
  assert.strictEqual(T.po.length, 4, "S1 S2 T1 F1 (" + n + " players)");
  var t1 = byLab(T, "T1"), f1 = byLab(T, "F1");
  assert.strictEqual(ctx.tourNext(T), t1, "up next is still the 3rd place game 1");
  assert.ok(ctx.tourAnyOrder(T, t1) && ctx.tourAnyOrder(T, f1), "both game 1s can be played now");
  assert.strictEqual(ctx.tourAnyOrderCount(T), 2);
  assert.ok(!ctx.tourAnyOrder(T, byLab(T, "S1")), "a played semi is not open");
  play(T, "F1");   // final game 1 first
  assert.strictEqual(T.po.length, 5, "final game 2 appears after final game 1");
  assert.ok(byLab(T, "F2") && !byLab(T, "T2"));
  assert.strictEqual(ctx.tourNext(T), t1, "the up-next pointer still points at the first unplayed game");
  assert.ok(ctx.tourAnyOrder(T, byLab(T, "F2")) && ctx.tourAnyOrder(T, t1));
});

// ---- 2. in-order vs interleaved: identical results ----
[8, 12, 20].forEach(function (n) {
  var inOrder = runPlan(n, ["T1", "T2", "T3", "F1", "F2", "F3"]);                    // 3rd place series, then the final
  var finalFirst = runPlan(n, ["F1", "F2", "F3", "T1", "T2", "T3"]);
  var mixed = runPlan(n, ["T1", "F1", "T2", "F2", "T3", "F3"]);                     // 3rd G1, Final G1, 3rd G2, Final G2 ...
  var mixed2 = runPlan(n, ["F1", "T1", "F2", "T2", "F3", "T3"]);
  var a = snapshot(inOrder);
  [finalFirst, mixed, mixed2].forEach(function (T, i) { assert.strictEqual(snapshot(T), a, "same result however it was played (n " + n + ", variant " + i + ")"); });
  var T = mixed;
  assert.ok(ctx.tourComplete(T));
  assert.strictEqual(J(T.po.map(function (g) { return g.lab; })), J(["S1", "S2", "T1", "T2", "T3", "F1", "F2", "F3"]), "games stay in series order, not play order");
  var o = ctx.tourOrder(T); assert.strictEqual(o.length, 3);
  assert.strictEqual(J(ctx.tourFinalWins(T)), J({ wa: 2, wb: 1 })); assert.strictEqual(J(ctx.tourThirdWins(T)), J({ wa: 2, wb: 1 }));
  function ids(X) { return J(ctx.tourMatches({ id: "s", tourney: X }, "g").map(function (m) { return m.id + ":" + m.games[0].a + ":" + m.teamA.join(); })); }
  assert.strictEqual(ids(T), ids(inOrder), "stats games identical");
});

// ---- 3. game 3 only when a series is 1-1 ----
var sweep = { S1: [21, 12], S2: [14, 21], T1: [21, 10], T2: [21, 15], F1: [21, 19], F2: [21, 18] };   // 2-0 both
var T0 = runPlan(8, ["F1", "T1", "F2", "T2"], sweep);
assert.ok(!byLab(T0, "T3") && !byLab(T0, "F3"), "no game 3 after 2-0");
assert.ok(ctx.tourComplete(T0), "complete after two straight wins in both series");
assert.strictEqual(T0.po.length, 6);
// 1-1 in the final, 2-0 in the 3rd place: only the final gets game 3
var Tm = upToSemis(8); play(Tm, "S1"); play(Tm, "S2");
play(Tm, "F1"); assert.ok(!byLab(Tm, "F3"), "no game 3 after one game");
play(Tm, "T1", sweep); play(Tm, "T2", sweep);
assert.ok(!byLab(Tm, "T3"));
assert.ok(!ctx.tourComplete(Tm));
assert.ok(!byLab(Tm, "F3"), "no game 3 while game 2 is open"); assert.ok(byLab(Tm, "F2") && !ctx.tourDone(byLab(Tm, "F2")));
play(Tm, "F2");   // 1-1
assert.ok(byLab(Tm, "F3") && !ctx.tourDone(byLab(Tm, "F3")), "game 3 appears at 1-1");
assert.strictEqual(ctx.tourAnyOrderCount(Tm), 1);
play(Tm, "F3"); assert.ok(ctx.tourComplete(Tm));
// correcting a played game (a 1-1 becomes 2-0) trims game 3 whatever the order was
var Tc = runPlan(8, ["F1", "T1", "F2", "T2", "T3", "F3"]);
assert.ok(Tc.po.length === 8);
var f2 = byLab(Tc, "F2"); ctx.tourApply(Tc, f2, 21, 5);
assert.ok(!byLab(Tc, "F3"), "final game 3 is gone after the correction"); assert.ok(ctx.tourComplete(Tc));
assert.ok(byLab(Tc, "T3"), "the 3rd place series is not touched");

// ---- 4. 4 and 5 players: one series, still in order; a walkover or void game is never open ----
var T4 = ctx.tourNew(uids(4), seeded(3)); while (!ctx.tourRotDone(T4)) ctx.tourApply(T4, ctx.tourNext(T4), 21, 15); ctx.tourDraw(T4, seeded(2));
assert.ok(ctx.tourAnyOrder(T4, T4.po[0]) && ctx.tourAnyOrderCount(T4) === 1);
var wo = { ph: "po", fin: true, lab: "F1", sa: 21, sb: 0, wo: true, a: [0, 1], b: [2, 3], pa: 0, pb: 1 };
assert.ok(!ctx.tourAnyOrder(T4, wo), "a walkover is not played");
assert.ok(!ctx.tourAnyOrder(T4, T4.games[0]), "rotation games stay in order");

// ---- 5. a live game started on a final game keeps its game when another series game is added before it ----
var Tl = upToSemis(8); play(Tl, "S1"); play(Tl, "S2");
var f1 = byLab(Tl, "F1"), gi = ctx.tourAll(Tl).indexOf(f1);
var tour = { sid: "s", gi: gi, lab: "F1", a: f1.a.map(function (p) { return Tl.ids[p]; }), b: f1.b.map(function (p) { return Tl.ids[p]; }) };
play(Tl, "T1");   // T2 is added in front of F1: F1 moves one place
assert.strictEqual(ctx.tourAll(Tl).indexOf(f1), gi + 1, "F1 moved");
assert.strictEqual(ctx.tourResolveGi(Tl, gi, "F1"), gi + 1);
assert.strictEqual(ctx.tourResolveGi(Tl, gi, undefined), gi, "a game without a label keeps its index");
assert.ok(ctx.tourLiveApply(Tl, tour, 21, 17, tour.a, tour.b, function (i) { return "P" + i; }), "the live score is accepted");
assert.ok(ctx.tourDone(f1) && f1.sa === 21 && f1.sb === 17, "the score went to the final game, not to 3rd place game 2");
assert.ok(!ctx.tourDone(byLab(Tl, "T2")));

// ---- 6. the cards ----
var Tr = upToSemis(8); play(Tr, "S1"); play(Tr, "S2");
var ng = ctx.tourNext(Tr);
function card(g, org) { return ctx._tnGame(Tr, g, Tr.games.length + Tr.po.indexOf(g) + 1, g === ng, "x", org !== false); }
var hT = card(byLab(Tr, "T1")), hF = card(byLab(Tr, "F1")), hS = card(byLab(Tr, "S1"));
[hT, hF].forEach(function (h, i) {
  assert.ok(/data-act="live"/.test(h) && /data-act="edit"/.test(h), "Live score and Add score on card " + i);
  assert.ok(h.indexOf("Play in any order to rest players") >= 0, "hint on card " + i);
});
assert.ok(/class="tn-game cur"/.test(hT) && /class="tn-game open"/.test(hF), "up next stays highlighted; the other open game is marked");
assert.ok(!/data-act="live"/.test(hS) && hS.indexOf("Play in any order") < 0, "a played semi has no buttons or hint");
assert.ok(hF.indexOf(">Ready<") >= 0, "the open game says Ready, not Waiting");
assert.ok(!/data-act="live"/.test(card(byLab(Tr, "F1"), false)), "a read-only viewer gets no buttons");
// only one open game left: no hint
play(Tr, "T1"); play(Tr, "T2"); play(Tr, "T3");
play(Tr, "F1"); play(Tr, "F2");
ng = ctx.tourNext(Tr);
assert.strictEqual(ctx.tourAnyOrderCount(Tr), 1);
assert.ok(card(ng).indexOf("Play in any order") < 0, "one open game: no hint");
// Lao strings exist
var lic = { console: console, localStorage: { getItem: function () { return "la"; } }, document: {}, window: {} };
vm.createContext(lic); vm.runInContext(fs.readFileSync("js/i18n.js", "utf8"), lic);
["tourAnyOrder", "tourReady"].forEach(function (k) { assert.ok(lic.t(k) && lic.t(k) !== k && lic.t(k) !== ic.t(k), "Lao " + k); });
console.log("playoff-any-order-v265 ok");
