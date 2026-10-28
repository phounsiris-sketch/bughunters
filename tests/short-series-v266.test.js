/* Run: node tests/short-series-v266.test.js — v266: a playoff series (3rd place / final) can be decided by ONE game.
   "Remove this match" on game 2 after game 1 was played = the series becomes best of 1 (T.bo = { th: 1 }): no game 2/3 is made again by tourSync,
   the winner is the winner of game 1, the match of the removed game is gone from the stats games, new tournaments stay best of 3, the final is not touched. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function uids(n) { var a = []; for (var i = 0; i < n; i++) a.push("u" + i); return a; }
var names = {}; uids(24).forEach(function (u) { names[u] = "Player " + u; });
var ic = { console: console, localStorage: { getItem: function () { return "en"; } }, document: {}, window: {} };
vm.createContext(ic); vm.runInContext(fs.readFileSync("js/i18n.js", "utf8"), ic);
var asked = [], puts = [];
var ctx = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, Object: Object, Array: Array, Promise: Promise, String: String, Number: Number,
  t: function (k) { return ic.t(k); }, escapeHtml: function (v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }, icon: function (n) { return "<i:" + n + ">"; }, jsq: String,
  plainUserName: function (u) { return u ? u.displayName : "?"; }, findUser: function (u) { return { displayName: names[u] || u }; },
  getUserName: function (u) { return names[u] || u; }, avatarHtml: function (u) { return "<av " + u + ">"; },
  canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, fmtDate: String,
  askConfirm: function (o, yes) { asked.push({ o: o, yes: yes }); },
  dbUpdateSession: function (id, patch) { puts.push({ id: id, patch: patch }); return Promise.resolve(); }, dbOnError: function () {}, showToast: function () {},
  document: { getElementById: function () { return null; }, body: { classList: { add: function () {}, remove: function () {} } }, addEventListener: function () {}, removeEventListener: function () {} },
  lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/tournament.js", "utf8"), ctx, { filename: "js/tournament.js" });
ctx.tourRender = function () {};

// game 1 of each series: side a wins; game 2: side b wins (like the real one: 19-21); game 3 side a
var RES = { S1: [21, 12], S2: [14, 21], T1: [21, 10], T2: [19, 21], T3: [21, 18], F1: [21, 19], F2: [18, 21], F3: [21, 15] };
function byLab(T, lab) { return T.po.filter(function (g) { return g.lab === lab; })[0]; }
function play(T, lab) { var g = byLab(T, lab); assert.ok(g, lab + " exists"); assert.ok(!ctx.tourDone(g), lab + " not played yet"); ctx.tourApply(T, g, RES[lab][0], RES[lab][1]); }
function upToSemis(n) {
  var T = ctx.tourNew(uids(n || 8), seeded(11));
  while (!ctx.tourRotDone(T)) { var g = ctx.tourNext(T); ctx.tourApply(T, g, 21, 12 + (T.games.indexOf(g) % 7)); }
  ctx.tourDraw(T, seeded(5));
  play(T, "S1"); play(T, "S2");
  return T;
}
function labs(T) { return T.po.map(function (g) { return g.lab; }).join(","); }
function sess(T) { return { id: "S", date: "2026-10-28", createdAt: 1000, groupId: "g", players: uids(T.n), tourney: T }; }

// ---- 1. a new tournament is best of 3, nothing stored ----
var T = upToSemis();
assert.strictEqual(T.bo, undefined, "no bo on a new tournament");
assert.strictEqual(ctx.tourSerNeed(T, "th"), 2); assert.strictEqual(ctx.tourSerNeed(T, "fin"), 2);
assert.strictEqual(labs(T), "S1,S2,T1,F1");

// ---- 2. the real case: G1 played, G2 played (19-21), G3 waiting. Remove G2 ----
play(T, "T1"); play(T, "T2");
assert.strictEqual(labs(T), "S1,S2,T1,T2,T3,F1", "1-1: game 3 made");
var t1 = byLab(T, "T1"), winner1 = t1.sa > t1.sb ? t1.pa : t1.pb, loser1 = t1.sa > t1.sb ? t1.pb : t1.pa;
var before = ctx.tourMatches(sess(T)).length;
var gi2 = ctx.tourAll(T).indexOf(byLab(T, "T2"));
assert.strictEqual(ctx.tourShortenLoss(T, "th"), 1, "one played game after game 1");
var r = ctx.tourRemoveGame(T, gi2);
assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { key: "th", lost: 1 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(T.bo)), { th: 1 });
assert.strictEqual(labs(T), "S1,S2,T1,F1", "T2 and T3 are gone");
assert.ok(ctx.tourThirdDecided(T), "decided by game 1");
assert.strictEqual(ctx.tourMatches(sess(T)).length, before - 1, "the match of the removed game is gone from the stats games");
// it is not made again, whatever runs
for (var k = 0; k < 5; k++) { ctx.tourSync(T); ctx.tourBuild(T); ctx.tourResolve(T); }
assert.strictEqual(labs(T), "S1,S2,T1,F1", "tourSync / tourBuild / tourResolve do not recreate it");
// the final goes on as best of 3 and the podium follows game 1
assert.ok(!ctx.tourComplete(T) && ctx.tourNext(T) === byLab(T, "F1"));
play(T, "F1"); assert.strictEqual(labs(T), "S1,S2,T1,F1,F2", "final unaffected: game 2 still comes after game 1");
play(T, "F2"); assert.strictEqual(labs(T), "S1,S2,T1,F1,F2,F3", "final unaffected: game 3 at 1-1");
assert.ok(!ctx.tourComplete(T));
play(T, "F3"); assert.ok(ctx.tourComplete(T));
var P = ctx.tourPairs(T), order = ctx.tourOrder(T);
assert.strictEqual(order[2], winner1, "3rd place = the winner of game 1");
assert.notStrictEqual(order[2], loser1);
JSON.parse(JSON.stringify(T)); ctx.tourSync(T); assert.strictEqual(labs(T), "S1,S2,T1,F1,F2,F3");
// a finished tournament cannot go back to best of 3 (champion + Hall of Fame are settled)
assert.strictEqual(ctx.tourLengthen(T, "th"), false); assert.strictEqual(T.bo.th, 1);

// ---- 3. G2 and G3 both played: both go, 3rd place = game 1 winner ----
var T3 = upToSemis(); play(T3, "T1"); play(T3, "T2"); play(T3, "T3");
assert.strictEqual(ctx.tourShortenLoss(T3, "th"), 2);
assert.ok(ctx.tourRemoveGame(T3, ctx.tourAll(T3).indexOf(byLab(T3, "T2"))));
assert.strictEqual(labs(T3), "S1,S2,T1,F1");
assert.strictEqual(ctx.tourThirdWins(T3).wa + ctx.tourThirdWins(T3).wb, 1);

// ---- 4. only game 2 of a series can be removed; not game 1, not a semi, not a pending game ----
var T4 = upToSemis(); play(T4, "T1");
assert.strictEqual(ctx.tourRemoveGame(T4, ctx.tourAll(T4).indexOf(byLab(T4, "T1"))), null, "game 1");
assert.strictEqual(ctx.tourRemoveGame(T4, ctx.tourAll(T4).indexOf(byLab(T4, "S1"))), null, "a semi");
assert.strictEqual(ctx.tourRemoveGame(T4, ctx.tourAll(T4).indexOf(byLab(T4, "T2"))), null, "a game not played");
assert.strictEqual(ctx.tourRemoveGame(T4, 0), null, "a rotation game");
assert.strictEqual(T4.bo, undefined);

// ---- 5. "Decide by 1 game" before and after game 1; any-order still works ----
var T5 = upToSemis();
assert.ok(ctx.tourCanShorten(T5, "th"));
assert.ok(ctx.tourShorten(T5, "th"));
assert.ok(!ctx.tourCanShorten(T5, "th"), "already one game");
assert.ok(ctx.tourAnyOrder(T5, byLab(T5, "T1")) && ctx.tourAnyOrder(T5, byLab(T5, "F1")), "any order with a short series");
play(T5, "F1"); play(T5, "T1");   // final game 1 first, then 3rd place
assert.strictEqual(labs(T5), "S1,S2,T1,F1,F2", "no T2; F2 for the final");
assert.ok(ctx.tourThirdDecided(T5) && !ctx.tourFinalDecided(T5));
// a final can be shortened too, and the 3rd place stays as it was
var T5b = upToSemis(); assert.ok(ctx.tourShorten(T5b, "fin")); play(T5b, "F1"); play(T5b, "T1"); play(T5b, "T2");
assert.ok(ctx.tourFinalDecided(T5b) && !byLab(T5b, "F2"), "final by one game");
assert.ok(byLab(T5b, "T3"), "3rd place still best of 3");
// the void series cannot be shortened
var T5c = upToSemis(); byLab(T5c, "T1").v = true; byLab(T5c, "T1").sa = 0; byLab(T5c, "T1").sb = 0;
assert.ok(!ctx.tourCanShorten(T5c, "th"));

// ---- 6. back to best of 3 (not finished): game 2 comes back when game 1 is played and the series is open ----
var T6 = upToSemis(); play(T6, "T1"); ctx.tourShorten(T6, "th"); assert.strictEqual(labs(T6), "S1,S2,T1,F1");
assert.ok(ctx.tourLengthen(T6, "th")); assert.strictEqual(T6.bo, undefined);
assert.strictEqual(labs(T6), "S1,S2,T1,T2,F1", "game 2 again");
// a shortened series that is played: lengthening reopens the series, so only offer while open; the engine refuses for a finished tournament (test 2)

// ---- 7. format 1 (one 3rd place game, label T) and old tournaments are untouched ----
var T7 = ctx.tourNewV1(uids(8), seeded(3));
while (!ctx.tourRotDone(T7)) { var g7 = ctx.tourNext(T7); ctx.tourApply(T7, g7, 21, 12 + (T7.games.indexOf(g7) % 7)); }
ctx.tourDraw(T7, seeded(5)); play(T7, "S1"); play(T7, "S2");
assert.ok(!ctx.tourCanShorten(T7, "th"), "format 1 has no 3rd place series");
assert.strictEqual(ctx.tourSerNeed(T7, "fin"), 2);

// ---- 8. the screen: confirm, save, matches, Undo ----
var T8 = upToSemis(); play(T8, "T1"); play(T8, "T2");
var s8 = sess(T8); ctx.lastSessions = [s8];
var gi8 = ctx.tourAll(T8).indexOf(byLab(T8, "T2"));
var html = ctx._tnGame(T8, byLab(T8, "T2"), gi8 + 1, false, "x", true);
assert.ok(html.indexOf('data-act="rm"') > 0 && html.indexOf("Remove this match") > 0, "game 2 card has the Remove button");
assert.ok(ctx._tnGame(T8, byLab(T8, "T1"), 1, false, "x", true).indexOf('data-act="rm"') < 0, "game 1 card has not");
assert.ok(ctx._tnGame(T8, byLab(T8, "T2"), 1, false, "x", false).indexOf('data-act="rm"') < 0, "a viewer does not");
var box0 = ctx._tnSeriesBox(T8, "th", false, true);
assert.ok(box0.indexOf('data-act="short"') > 0 && box0.indexOf("3rd place · best of 3") > 0 && box0.indexOf("tn-onetag") < 0);
asked.length = 0; puts.length = 0;
ctx.tourAskRemove(s8, gi8);
assert.strictEqual(asked.length, 1, "asks first (askConfirm)");
assert.ok(/Remove .*and decide 3rd place by match 1\?/.test(asked[0].o.title), asked[0].o.title);
assert.strictEqual(asked[0].o.kind, "danger");
assert.strictEqual(puts.length, 0, "nothing saved before the yes"); assert.ok(!s8.tourney.bo);
var mBefore = ctx.tourMatches(s8).length;
asked[0].yes();
assert.deepStrictEqual(JSON.parse(JSON.stringify(s8.tourney.bo)), { th: 1 });
assert.strictEqual(labs(s8.tourney), "S1,S2,T1,F1");
assert.strictEqual(puts.length, 1); assert.deepStrictEqual(Object.keys(puts[0].patch), ["tourney"]); assert.deepStrictEqual(JSON.parse(JSON.stringify(puts[0].patch.tourney.bo)), { th: 1 });
assert.strictEqual(ctx.tourMatches(s8).length, mBefore - 1);
var box1 = ctx._tnSeriesBox(s8.tourney, "th", false, true);
assert.ok(box1.indexOf("3rd place · 1 match") > 0 && box1.indexOf("tn-onetag") > 0 && box1.indexOf("1 match decides") > 0, "tag on the series");
assert.strictEqual((box1.match(/tn-pip/g) || []).length, 2, "one pip per side");
assert.ok(box1.indexOf('data-act="long"') > 0 && box1.indexOf('data-act="short"') < 0);
// Undo brings the whole tournament back (game 2 and 3 with the scores)
ctx.tourUndoShorten(s8);
assert.strictEqual(labs(s8.tourney), "S1,S2,T1,T2,T3,F1"); assert.ok(!s8.tourney.bo);
assert.strictEqual(ctx.tourMatches(s8).length, mBefore);
assert.strictEqual(puts.length, 2);
// Undo is gone after any other save
asked.length = 0; ctx.tourAskRemove(s8, gi8); asked[0].yes();
ctx._tnPut(s8); ctx.tourUndoShorten(s8); assert.strictEqual(s8.tourney.bo.th, 1, "no undo after a later save");

// ---- 9. strings: EN and LA have every new key ----
var keys = ["tourRmGame", "tourRmTitle", "tourRmBody", "tourRmYes", "tourRmDone", "tourBo1Btn", "tourBo1Title", "tourBo1Body", "tourBo1Loses", "tourBo1Yes", "tourBo1Done",
  "tourBo3Back", "tourBo3Title", "tourBo3Body", "tourBo3Yes", "tourBo3Done", "tourOneTag", "tourFirstTo1", "tourThirdBo1", "tourFinalBo1", "tourSerFinal", "tourSerThird", "tourUndone"];
var src = fs.readFileSync("js/i18n.js", "utf8");
keys.forEach(function (k) { assert.strictEqual((src.match(new RegExp("^\\s*" + k + ":", "gm")) || []).length, 2, k + " in EN and LA"); });
console.log("short-series-v266: ok");
