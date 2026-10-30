/* Run: node tests/series-format-v270.test.js — v270: series format of the 3rd place series and the final (T.bo = { th, fi } = 1 | 2 | 3, missing = 3),
   "2 matches, points decide", and minutes per match from the matches played (15 until one real duration is known). */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function uids(n) { var a = []; for (var i = 0; i < n; i++) a.push("u" + i); return a; }
var names = {}; uids(24).forEach(function (u) { names[u] = "Player " + u; });
var ic = { console: console, localStorage: { getItem: function () { return "en"; } }, document: {}, window: {} };
vm.createContext(ic); vm.runInContext(fs.readFileSync("js/i18n.js", "utf8"), ic);
var asked = [], puts = [];
var ctx = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, Object: Object, Array: Array, Promise: Promise, String: String, Number: Number, Date: Date,
  t: function (k) { return ic.t(k); }, escapeHtml: function (v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }, icon: function (n) { return "<i:" + n + ">"; }, jsq: String,
  plainUserName: function (u) { return u ? u.displayName : "?"; }, findUser: function (u) { return { displayName: names[u] || u }; },
  getUserName: function (u) { return names[u] || u; }, avatarHtml: function (u) { return "<av " + u + ">"; },
  canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, fmtDate: String,
  askConfirm: function (o, yes) { asked.push({ o: o, yes: yes }); },
  dbUpdateSession: function (id, patch) { puts.push({ id: id, patch: patch }); return Promise.resolve(); }, dbOnError: function () {}, showToast: function () {},
  document: { getElementById: function () { return null; }, body: { classList: { add: function () {}, remove: function () {} } }, addEventListener: function () {}, removeEventListener: function () {} },
  lastSessions: [], _matchesReal: [] };
ctx.window = ctx; vm.createContext(ctx);
["js/tournament.js", "js/hallfame.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });
ctx.tourRender = function () {};

function byLab(T, lab) { return T.po.filter(function (g) { return g.lab === lab; })[0]; }
function labs(T) { return T.po.map(function (g) { return g.lab; }).join(","); }
function play(T, lab, sa, sb) { var g = byLab(T, lab); assert.ok(g, lab + " exists"); assert.ok(!ctx.tourDone(g), lab + " not played"); ctx.tourApply(T, g, sa, sb); }
function upToSemis(bo) {
  var T = ctx.tourNew(uids(8), seeded(11));
  if (bo) T.bo = bo;
  while (!ctx.tourRotDone(T)) { var g = ctx.tourNext(T); ctx.tourApply(T, g, 21, 12 + (T.games.indexOf(g) % 7)); }
  ctx.tourDraw(T, seeded(5));
  play(T, "S1", 21, 12); play(T, "S2", 14, 21);
  return T;
}
function sess(T) { return { id: "S", date: "2026-10-29", createdAt: 1000, groupId: "g", players: uids(T.n), createdBy: "u0", tourney: T }; }
var ser = function (T, k) { return JSON.parse(JSON.stringify({ w: ctx._tourSerWins(T, k), p: ctx.tourSerPoints(T, k) })); };

// ---- 1. data shape: missing = 3, v266 { th: 1 } and { fin: 1 } still read, { fi } is the final ----
var T0 = upToSemis();
assert.strictEqual(T0.bo, undefined);
assert.strictEqual(ctx.tourSerFmt(T0, "th"), 3); assert.strictEqual(ctx.tourSerFmt(T0, "fin"), 3);
assert.strictEqual(ctx.tourSerFmt({ bo: { th: 1 } }, "th"), 1, "v266 data"); assert.strictEqual(ctx.tourSerFmt({ bo: { fin: 1 } }, "fin"), 1, "v266 final key");
assert.strictEqual(ctx.tourSerFmt({ bo: { fi: 2, th: 2 } }, "fin"), 2); assert.strictEqual(ctx.tourSerFmt({ bo: { th: 7 } }, "th"), 3, "bad value = best of 3");
assert.strictEqual(ctx.tourSerNeed({ bo: { th: 2 } }, "th"), 2); assert.strictEqual(ctx.tourSerNeed({ bo: { th: 1 } }, "th"), 1);
// an old tournament with th:1 plays exactly as before
var Told = upToSemis({ th: 1 }); play(Told, "T1", 21, 10);
assert.ok(ctx.tourThirdDecided(Told) && labs(Told) === "S1,S2,T1,F1");
// ---- 2. format 2: 2-0 decides after two matches ----
var A = upToSemis({ th: 2, fi: 2 });
assert.strictEqual(labs(A), "S1,S2,T1,F1");
play(A, "T1", 21, 15); assert.ok(!ctx.tourThirdDecided(A), "one match is not enough"); assert.strictEqual(labs(A), "S1,S2,T1,T2,F1", "match 2 always comes");
play(A, "T2", 21, 17);
assert.ok(ctx.tourThirdDecided(A) && labs(A) === "S1,S2,T1,T2,F1", "2-0: decided, no match 3");
assert.strictEqual(ctx.tourSerWinner(A, "th"), "a");
// ---- 3. 1-1: more total points wins (and a-side / b-side both work) ----
var B = upToSemis({ th: 2, fi: 2 });
play(B, "T1", 21, 12); play(B, "T2", 19, 21);   // a: 40, b: 33 -> a wins on points
assert.deepStrictEqual(ser(B, "th"), { w: { wa: 1, wb: 1 }, p: { pa: 40, pb: 33 } });
assert.ok(ctx.tourThirdDecided(B) && !byLab(B, "T3"), "1-1 with different points: decided");
assert.strictEqual(ctx.tourSerWinner(B, "th"), "a");
var box = ctx._tnSeriesBox(B, "th", false, true);
assert.ok(box.indexOf("Points 40–33") > 0 && box.indexOf("The higher total wins.") > 0 && box.indexOf("3rd place · 2 matches, points") > 0 && box.indexOf("2 matches, points decide") > 0, "the card shows the points");
var B2 = upToSemis({ th: 2 }); play(B2, "T1", 21, 19); play(B2, "T2", 12, 21);   // a: 33, b: 40 -> b wins on points
assert.strictEqual(ctx.tourSerWinner(B2, "th"), "b"); assert.ok(ctx.tourThirdDecided(B2));
play(B2, "F1", 21, 10); play(B2, "F2", 21, 10); assert.ok(ctx.tourComplete(B2));
var o2 = ctx.tourOrder(B2), t1 = byLab(B2, "T1");
assert.strictEqual(o2[2], t1.pb, "3rd place = the side with more points (b)");
// walkover / void: first match void = void series, nothing to decide
// ---- 4. 1-1 and equal points: a 3rd decider match; explained on the card ----
var C = upToSemis({ th: 2, fi: 2 });
play(C, "T1", 21, 19); play(C, "T2", 19, 21);   // 40-40
assert.ok(!ctx.tourThirdDecided(C), "equal points: not decided"); assert.strictEqual(labs(C), "S1,S2,T1,T2,T3,F1", "decider match 3");
assert.strictEqual(ctx.tourSerWinner(C, "th"), "");
var boxC = ctx._tnSeriesBox(C, "th", false, true);
assert.ok(boxC.indexOf("Points 40–40") > 0 && boxC.indexOf("Points are equal: a 3rd match decides.") > 0 && boxC.indexOf("tn-pts tie") > 0);
play(C, "T3", 15, 21);   // b wins the decider: 2-1 for b
assert.ok(ctx.tourThirdDecided(C) && ctx.tourSerWinner(C, "th") === "b");
assert.strictEqual(ctx.tourSerPoints(C, "th").pa, 55);
// ---- 5. any-order across the two series, with the points rule ----
var D = upToSemis({ th: 2, fi: 2 });
assert.ok(ctx.tourAnyOrder(D, byLab(D, "T1")) && ctx.tourAnyOrder(D, byLab(D, "F1")) && ctx.tourAnyOrderCount(D) === 2);
play(D, "F1", 21, 19); play(D, "T1", 21, 19); play(D, "F2", 19, 21);   // final 1-1 40-40 -> F3
assert.strictEqual(labs(D), "S1,S2,T1,T2,F1,F2,F3", "T2 then the final matches, in series order");
play(D, "T2", 21, 10);   // 3rd place 2-0
play(D, "F3", 21, 5);
assert.ok(ctx.tourComplete(D), "finished in any order");
var oD = ctx.tourOrder(D), f1 = byLab(D, "F1"); assert.strictEqual(oD[0], f1.pa, "final: a wins 2-1");
// ---- 6. champion / Hall of Fame / stats matches follow the points rule ----
var E = upToSemis({ fi: 2 });
play(E, "T1", 21, 10); play(E, "T2", 21, 10);
play(E, "F1", 21, 19); play(E, "F2", 12, 21);   // final 1-1: a 33, b 40 -> b is the champion
assert.ok(ctx.tourComplete(E) && ctx.tourSerWinner(E, "fin") === "b");
var oE = ctx.tourOrder(E), fE = byLab(E, "F1");
assert.strictEqual(oE[0], fE.pb, "champion = side b (more points)"); assert.strictEqual(oE[1], fE.pa);
var rec = ctx.hofRecord(sess(E), "g", function (u) { return names[u] || u; }, "u0");
assert.ok(rec, "a Hall of Fame record exists");
assert.strictEqual(rec.finalScore, "40–33", "1-1 decided by points: the points are the score");
assert.deepStrictEqual(JSON.parse(JSON.stringify(rec.finalGames)), ["19–21", "21–12"]);
assert.strictEqual(rec.champion.uids.length, 2);
assert.strictEqual(ctx.tourMatches(sess(E)).length, E.games.length + E.po.length, "every played match is a stats match");
var Eold = upToSemis(); play(Eold, "T1", 21, 10); play(Eold, "T2", 21, 10); play(Eold, "F1", 21, 19); play(Eold, "F2", 12, 21); play(Eold, "F3", 21, 19);
assert.strictEqual(ctx.hofRecord(sess(Eold), "g", function (u) { return u; }, "u0").finalScore, "2–1", "best of 3 keeps the wins as the score");

// ---- 7. switching format: confirm only when played matches go, Undo, nothing saved before the yes ----
var G = upToSemis(); play(G, "T1", 21, 15); play(G, "T2", 19, 21); play(G, "T3", 21, 18);
var sG = sess(G); ctx.lastSessions = [sG];
assert.strictEqual(ctx.tourFormatLoss(G, "th", 2), 1, "T3 would go (points 40-36 decide)");
assert.strictEqual(ctx.tourFormatLoss(G, "th", 1), 2);
assert.strictEqual(ctx.tourFormatLoss(G, "fin", 1), 0);
var mG = ctx.tourMatches(sG).length;
asked.length = 0; puts.length = 0;
ctx._tnSid = "S";
ctx.tourAskFormat(sG, "th", 2);
assert.strictEqual(asked.length, 1, "asks first with askConfirm"); assert.strictEqual(asked[0].o.kind, "danger");
assert.ok(/Change 3rd place to 2 matches, points decide\?/.test(asked[0].o.title), asked[0].o.title);
assert.ok(/1 played match\(es\)/.test(asked[0].o.body), asked[0].o.body);
assert.strictEqual(puts.length, 0); assert.strictEqual(sG.tourney.bo, undefined, "nothing changed before the yes");
asked[0].yes();
assert.deepStrictEqual(JSON.parse(JSON.stringify(sG.tourney.bo)), { th: 2 });
assert.strictEqual(labs(sG.tourney), "S1,S2,T1,T2,F1"); assert.strictEqual(ctx.tourMatches(sG).length, mG - 1);
assert.strictEqual(puts.length, 1); assert.deepStrictEqual(Object.keys(puts[0].patch), ["tourney"]);
ctx.tourUndoShorten(sG);   // the same function the Undo button calls
assert.strictEqual(sG.tourney.bo, undefined); assert.strictEqual(labs(sG.tourney), "S1,S2,T1,T2,T3,F1"); assert.strictEqual(ctx.tourMatches(sG).length, mG);
assert.strictEqual(puts.length, 2);
assert.strictEqual(byLab(sG.tourney, "T3").sa, 21, "the played match came back with its score");
// to 1 match: confirm too, and Undo
asked.length = 0; ctx.tourAskFormat(sG, "th", 1); assert.strictEqual(asked.length, 1); assert.ok(/2 played match/.test(asked[0].o.body)); asked[0].yes();
assert.strictEqual(labs(sG.tourney), "S1,S2,T1,F1"); assert.strictEqual(ctx.tourSerFmt(sG.tourney, "th"), 1);
ctx.tourUndoShorten(sG); assert.strictEqual(labs(sG.tourney), "S1,S2,T1,T2,T3,F1");
// nothing played: no question, saved at once, Undo available
var H = upToSemis(), sH = sess(H); ctx.lastSessions = [sH]; asked.length = 0; puts.length = 0;
ctx.tourAskFormat(sH, "fin", 2);
assert.strictEqual(asked.length, 0, "no match is lost: no question"); assert.deepStrictEqual(JSON.parse(JSON.stringify(sH.tourney.bo)), { fi: 2 }); assert.strictEqual(puts.length, 1);
assert.ok(ctx._tnUndo && ctx._tnUndo.sid === "S", "Undo is offered");
ctx.tourUndoShorten(sH); assert.strictEqual(sH.tourney.bo, undefined);
// 3 -> 1 -> 3: back to nothing stored; a v266 { fin: 1 } is replaced by { fi }
var H2 = upToSemis({ fin: 1 }); assert.strictEqual(ctx.tourSerFmt(H2, "fin"), 1);
assert.ok(ctx.tourSetFormat(H2, "fin", 2)); assert.deepStrictEqual(JSON.parse(JSON.stringify(H2.bo)), { fi: 2 });
assert.ok(ctx.tourSetFormat(H2, "fin", 3)); assert.strictEqual(H2.bo, undefined);
assert.strictEqual(ctx.tourSetFormat(H2, "fin", 3), false, "unchanged = refused"); assert.strictEqual(ctx.tourSetFormat(H2, "fin", 4), false);
// 2 -> 3 on a 1-1 points decision reopens it: the decider appears, nothing is lost
var B3 = upToSemis({ th: 2 }); play(B3, "T1", 21, 12); play(B3, "T2", 19, 21);
assert.ok(ctx.tourThirdDecided(B3) && ctx.tourFormatLoss(B3, "th", 3) === 0);
assert.ok(ctx.tourSetFormat(B3, "th", 3)); assert.ok(!ctx.tourThirdDecided(B3) && labs(B3) === "S1,S2,T1,T2,T3,F1");
// not for a finished tournament, a void series, the 3rd place of format 1, or the sheet-less viewer
assert.strictEqual(ctx.tourSetFormat(D, "th", 1), false); assert.ok(ctx._tnSeriesBox(D, "th", false, true).indexOf('data-act="fmt"') < 0, "finished: no chip");
var V = upToSemis(); byLab(V, "T1").v = true; byLab(V, "T1").sa = 0; byLab(V, "T1").sb = 0; assert.ok(!ctx.tourCanFormat(V, "th"));
var P1 = ctx.tourNewV1(uids(8), seeded(3)); assert.ok(!ctx.tourCanFormat(P1, "th"), "format 1 has a single 3rd place match"); assert.ok(ctx.tourCanFormat(P1, "fin"));
var chip = ctx._tnSeriesBox(H, "th", false, true);
assert.ok(chip.indexOf('data-act="fmt"') > 0 && chip.indexOf('data-k="th"') > 0 && chip.indexOf("Format:") > 0 && chip.indexOf("Best of 3") > 0 && chip.indexOf('aria-haspopup="dialog"') > 0, "chip");
assert.ok(ctx._tnSeriesBox(H, "th", false, false).indexOf('data-act="fmt"') < 0, "a viewer has no chip");
var tbd = ctx.tourNew(uids(8), seeded(11)); while (!ctx.tourRotDone(tbd)) ctx.tourApply(tbd, ctx.tourNext(tbd), 21, 14); ctx.tourDraw(tbd, seeded(5));
assert.ok(ctx._tnSeriesBox(tbd, "fin", false, true).indexOf('data-act="fmt"') > 0, "the format can be chosen before the series starts");
// removing match 2 still works in format 2 (= decide by match 1)
var R = upToSemis({ th: 2 }); play(R, "T1", 21, 10); play(R, "T2", 21, 10);
assert.ok(ctx.tourRemoveGame(R, ctx.tourAll(R).indexOf(byLab(R, "T2"))) && ctx.tourSerFmt(R, "th") === 1);

// ---- 8. estimate follows the formats ----
var e3 = ctx.tourEstimate(8), e11 = ctx.tourEstimate(8, 0, { bo: { th: 1, fi: 1 } }), e22 = ctx.tourEstimate(8, 0, { bo: { th: 2, fi: 2 } });
assert.strictEqual(e3.poMin, 6); assert.strictEqual(e3.poMax, 8); assert.strictEqual(e11.poMin, 4); assert.strictEqual(e11.poMax, 4);
assert.strictEqual(e22.poMin, 6); assert.strictEqual(e22.poMax, 8);
assert.strictEqual(ctx.tourTotals(upToSemis({ th: 1, fi: 1 })).max, e11.maxGames);
assert.strictEqual(ctx.tourEstimate(4, 0, { bo: { fi: 1 } }).poMax, 1);

// ---- 9. minutes per match: 15 until a real duration is known, then the average of the real ones ----
var M = upToSemis(), sM = sess(M), MIN = 60000;
sM.tourney = M;
function timed(g, min) { g.t0 = 1e12; g.t1 = 1e12 + min * MIN; }
var pm = ctx.tourPerMatch(sM, []);
assert.deepStrictEqual(JSON.parse(JSON.stringify(pm)), { per: 15, auto: false, n: 0 }, "no timed match: 15 (estimate)");
timed(M.games[0], 18); pm = ctx.tourPerMatch(sM, []);
assert.deepStrictEqual(JSON.parse(JSON.stringify(pm)), { per: 18, auto: true, n: 1 }, "the first match sets it");
timed(M.games[1], 22); assert.strictEqual(ctx.tourPerMatch(sM, []).per, 20, "then the average");
timed(M.games[2], 2); timed(M.games[3], 61); M.games[4].t0 = 5; M.games[4].t1 = NaN;
assert.strictEqual(ctx.tourPerMatch(sM, []).n, 2, "<3 min, >60 min and bad timestamps are ignored");
timed(M.games[2], 3); timed(M.games[3], 60); assert.strictEqual(ctx.tourPerMatch(sM, []).n, 4, "3 and 60 are kept");
assert.strictEqual(ctx.tourPerMatch(sM, []).per, Math.round((18 + 22 + 3 + 60) / 4));
// a walkover and a manually typed score (no timing) do not count
timed(M.games[2], 3); delete M.games[3].t0; delete M.games[3].t1; M.games[5].wo = true; timed(M.games[5], 30);
assert.strictEqual(ctx.tourPerMatch(sM, []).n, 3);
// old match without t0/t1: the saved live match document (startAt / endAt) is used when it is the same match
var M2 = upToSemis(), sM2 = sess(M2), rec6 = ctx.tourMatches(sM2).filter(function (m) { return m.id === "t:S:6"; })[0];
var doc = { sessionId: "S", teamA: rec6.teamA, teamB: rec6.teamB, games: rec6.games, startAt: 5e11, endAt: 5e11 + 25 * MIN, live: true };
assert.strictEqual(ctx.tourPerMatch(sM2, [doc]).per, 25, "from the saved match document");
assert.strictEqual(ctx.tourPerMatch(sM2, [Object.assign({}, doc, { startAt: undefined })]).auto, false, "a match typed by hand has no timing");
assert.strictEqual(ctx.tourPerMatch(sM2, [Object.assign({}, doc, { sessionId: "other" })]).auto, false);
// the live board hands its window to the game
var M3 = ctx.tourNew(uids(8), seeded(11)), g0 = M3.games[0], on = ctx.tourOn(g0);
var la = on.a.map(function (p) { return ctx.tourUid(M3, p, 0); }), lb = on.b.map(function (p) { return ctx.tourUid(M3, p, 0); });
assert.ok(ctx.tourLiveApply(M3, { gi: 0, a: la, b: lb, subs: [] }, 21, 18, la, lb, function (i) { return "P" + i; }, { startAt: 1e12, endAt: 1e12 + 19 * MIN }));
assert.strictEqual(g0.t0, 1e12); assert.strictEqual(g0.t1, 1e12 + 19 * MIN);
assert.strictEqual(ctx.tourPerMatch(sess(M3), []).per, 19);
var g1 = M3.games[1], on1 = ctx.tourOn(g1), la1 = on1.a.map(function (p) { return ctx.tourUid(M3, p, 1); }), lb1 = on1.b.map(function (p) { return ctx.tourUid(M3, p, 1); });
assert.ok(ctx.tourLiveApply(M3, { gi: 1, a: la1, b: lb1, subs: [] }, 21, 18, la1, lb1, function (i) { return "P" + i; }));
assert.strictEqual(g1.t0, undefined, "no window = no timing");
JSON.parse(JSON.stringify(M3));
// time left follows the per-match minutes
var tl = ctx.tourTimeLeft(M3, 20), tt = ctx.tourTotals(M3);
assert.strictEqual(tl.maxMin, (tt.max - 2) * 20); assert.strictEqual(tl.minMin, (tt.min - 2) * 20);
var line = ctx._tnTimeLine(sess(M3), M3);
assert.ok(line.indexOf("≈ 19 min/match (from played matches)") > 0 && line.indexOf("left") > 0, line);
assert.ok(ctx._tnTimeLine(sess(ctx.tourNew(uids(8), seeded(2))), ctx.tourNew(uids(8), seeded(2))).indexOf("≈ 15 min/match (estimate)") > 0);
// the info sheet explains the formats and uses the per-match minutes
var inf = ctx.tourInfoModel(8, M3, 19), flat = JSON.stringify(inf);
assert.ok(flat.indexOf("2 matches (points decide") > 0 && flat.indexOf("best of 3 (the default)") > 0, "info line for the 3 formats");
assert.ok(flat.indexOf("19 minutes each") > 0, "info time uses the real minutes");

// ---- 10. strings: EN and LA have every new key; the app version moved with the cache ----
var src = fs.readFileSync("js/i18n.js", "utf8");
["tourFinalBo2", "tourThirdBo2", "tourFirstTo2", "tourFirstTo3", "tourFmtLabel", "tourFmtName1", "tourFmtName2", "tourFmtName3", "tourFmtShort1", "tourFmtShort2", "tourFmtShort3", "tourFmtDesc1", "tourFmtDesc2", "tourFmtDesc3",
  "tourFmtDefault", "tourFmtTitle", "tourFmtChipAria", "tourFmtAskTitle", "tourFmtLoses", "tourFmtYes", "tourFmtDone1", "tourFmtDone2", "tourFmtDone3", "tourSerPts", "tourSerPtsWin", "tourSerPtsTie", "tourInfoFormats",
  "tourPerAuto", "tourPerEst", "tourTimeLeft"].forEach(function (k) { assert.strictEqual((src.match(new RegExp("^\\s*" + k + ":", "gm")) || []).length, 2, k + " in EN and LA"); });
assert.strictEqual(fs.readFileSync("js/app.js", "utf8").match(/APP_VERSION = "(v\d+)"/)[1], fs.readFileSync("sw.js", "utf8").match(/godsmash-(v\d+)/)[1], "version bumped together");
console.log("series-format-v270: ok");
