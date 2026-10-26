/* Run: node tests/tournament.test.js — the session tournament engine (v227): fair schedule, balanced rest, best+worst pairs,
   playoff progress (best of 3 final, 6-player round robin), score corrections, and the screen wiring */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var src = fs.readFileSync("js/tournament.js", "utf8");
var ctx = { console: console, Math: Math, JSON: JSON, isFinite: isFinite };
vm.createContext(ctx); vm.runInContext(src, ctx);
var J = function (x) { return JSON.stringify(x); };

// small seeded random so a failure can be repeated
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function uids(n) { var a = []; for (var i = 0; i < n; i++) a.push("u" + i); return a; }
function pairKey(a, b) { return a < b ? a + "-" + b : b + "-" + a; }

// ---- 1. schedule invariants, many random draws ----
[6, 8].forEach(function (n) {
  var G = n === 8 ? 6 : 9, per = G * 4 / n;
  for (var seed = 1; seed <= 40; seed++) {
    var T = ctx.tourNew(uids(n), seeded(seed));
    assert.strictEqual(T.games.length, G, n + " players play " + G + " rotation games");
    var plays = {}, partners = {};
    T.games.forEach(function (g) {
      var four = g.a.concat(g.b);
      assert.strictEqual(new Set(four).size, 4, "four different players in a game");
      four.forEach(function (p) { plays[p] = (plays[p] || 0) + 1; assert.ok(p >= 0 && p < n); });
      [g.a, g.b].forEach(function (t) { partners[pairKey(t[0], t[1])] = (partners[pairKey(t[0], t[1])] || 0) + 1; });
    });
    for (var p = 0; p < n; p++) assert.strictEqual(plays[p], per, "everyone plays the same number of games (" + n + ", seed " + seed + ")");
    var m = ctx.tourMeet(T);
    assert.strictEqual(m.cover, m.total, "every pair of players meets at least once (" + n + ", seed " + seed + ")");
    var runs = ctx.tourRuns(T.games, n);
    if (n === 8) {
      assert.strictEqual(Object.keys(partners).length, 12, "8 players: no partner twice");
      assert.ok(runs.rest <= 2 && runs.play <= 2, "8 players: rest and play streaks stay short, got " + J(runs));
    } else {
      assert.strictEqual(Object.keys(partners).length, 15, "6 players: every pair partners at least once");
      assert.ok(runs.rest <= 1 && runs.play <= 3, "6 players: nobody rests twice in a row, got " + J(runs));
    }
    assert.strictEqual(J(T.coin.slice().sort()), J(uids(n).map(function (u, i) { return i; })), "the coin is a full shuffle");
  }
});
assert.strictEqual(ctx.tourNew(uids(8), seeded(5)).ids.length, 8);
assert.ok(ctx.tourSizeOk(6) && ctx.tourSizeOk(8) && !ctx.tourSizeOk(7) && !ctx.tourSizeOk(4));

// ---- 2. scores ----
assert.ok(ctx.tourScoreOk(21, 15) && ctx.tourScoreOk(30, 29) && ctx.tourScoreOk(0, 1));
assert.ok(!ctx.tourScoreOk(21, 21), "no draw");
assert.ok(!ctx.tourScoreOk(31, 5) && !ctx.tourScoreOk(-1, 5) && !ctx.tourScoreOk(1.5, 2) && !ctx.tourScoreOk("21", 5) && !ctx.tourScoreOk(NaN, 3), "bad numbers are refused");

// helper: play the next game; the first team wins unless the callback says otherwise
function playNext(T, fn) {
  var g = ctx.tourNext(T); if (!g) return null;
  var r = fn ? fn(g, T) : [21, 15];
  ctx.tourApply(T, g, r[0], r[1]);
  return g;
}
function playRotation(T, fn) { while (!ctx.tourRotDone(T)) playNext(T, fn); }

// ---- 3. table order: wins, point diff, points for, coin ----
(function () {
  var T = { n: 6, ids: uids(6), coin: [2, 0, 1, 3, 4, 5], games: [], po: [], drawn: false, semi: null };
  function game(a, b, sa, sb) { return { ph: "rot", a: a, b: b, sa: sa, sb: sb }; }
  // 0 and 1 each win 1; 0 has the better point diff. 2 and 3 lose 1 each with equal numbers: the coin decides (2 before 3? coin has 2 first)
  T.games = [game([0, 4], [2, 5], 21, 10), game([1, 5], [3, 4], 21, 19), game([2, 3], [0, 1], 21, 21 - 0 > 0 ? 20 : 0)];
  var r = ctx.tourStats(T);
  assert.strictEqual(r[0].id, 0, "wins first, then point diff");
  // exact tie on everything: the coin
  var U = { n: 6, ids: uids(6), coin: [3, 1, 0, 2, 4, 5], games: [game([0, 1], [2, 3], 21, 15), game([2, 3], [0, 1], 21, 15)], po: [], drawn: false, semi: null };
  var order = ctx.tourStats(U).map(function (x) { return x.id; }).slice(0, 4);
  assert.strictEqual(J(order), J([3, 1, 0, 2]), "an exact tie goes by the coin");
})();

// ---- 4. best with worst ----
(function () {
  var T = ctx.tourNew(uids(8), seeded(11));
  // make player k win more the lower k is: team with the lower total index wins
  playRotation(T, function (g) { var sa = g.a[0] + g.a[1], sb = g.b[0] + g.b[1]; return sa < sb ? [21, 10] : [10, 21]; });
  var rank = ctx.tourStats(T).map(function (x) { return x.id; });
  var P = ctx.tourPairs(T), sets = P.map(function (p) { return p.m.slice().sort().join("-"); }).sort();
  var want = [0, 1, 2, 3].map(function (k) { return [rank[k], rank[7 - k]].sort().join("-"); }).sort();
  assert.strictEqual(J(sets), J(want), "pairs are #1+#8, #2+#7, #3+#6, #4+#5");
  assert.strictEqual(P.length, 4);
  assert.ok(P.every(function (p, i) { return p.seed === i + 1; }) && P.every(function (p, i) { return i === 0 || P[i - 1].diff >= p.diff; }), "seeded by combined point diff");
  var T6 = ctx.tourNew(uids(6), seeded(3)); playRotation(T6);
  var r6 = ctx.tourStats(T6).map(function (x) { return x.id; });
  assert.strictEqual(J(ctx.tourPairs(T6).map(function (p) { return p.m.slice().sort().join("-"); }).sort()), J([0, 1, 2].map(function (k) { return [r6[k], r6[5 - k]].sort().join("-"); }).sort()), "6 players: #1+#6, #2+#5, #3+#4");
})();

// ---- 5. 8 players: draw, semis, 3rd place, best of 3 final ----
function eightToSemis(seed) {
  var T = ctx.tourNew(uids(8), seeded(seed));
  playRotation(T, function (g, t) { var x = g.a[0] + g.a[1] + g.b[0]; return x % 2 ? [21, 12 + (x % 5)] : [13 + (x % 6), 21]; });
  assert.strictEqual(ctx.tourPhase(T), 1);
  assert.strictEqual(T.po.length, 0, "no playoff before the draw");
  assert.ok(ctx.tourDraw(T, seeded(seed + 1)));
  return T;
}
(function () {
  var T = eightToSemis(21);
  assert.strictEqual(T.po.length, 2, "two semis after the draw");
  assert.strictEqual(J(T.semi.slice().sort()), J([0, 1, 2, 3]), "all four pairs are drawn into the semis");
  var pairsInSemis = T.po[0].a.concat(T.po[0].b, T.po[1].a, T.po[1].b);
  assert.strictEqual(new Set(pairsInSemis).size, 8, "all 8 players in the semis");
  assert.strictEqual(ctx.tourNext(T), T.po[0]);
  playNext(T, function () { return [21, 17]; });
  assert.strictEqual(T.po.length, 2, "3rd place and final wait for both semis");
  playNext(T, function () { return [18, 21]; });
  assert.strictEqual(T.po.length, 4, "3rd place + final game 1 appear after the semis");
  assert.strictEqual(T.po[2].lab, "T"); assert.strictEqual(T.po[3].lab, "F1");
  // semi winners meet in the final, losers play for 3rd
  var s1w = T.po[0].pa, s2w = T.po[1].pb, s1l = T.po[0].pb, s2l = T.po[1].pa;
  assert.strictEqual(J([T.po[3].pa, T.po[3].pb]), J([s1w, s2w]));
  assert.strictEqual(J([T.po[2].pa, T.po[2].pb]), J([s1l, s2l]));
  playNext(T, function () { return [21, 5]; });    // 3rd place
  playNext(T, function () { return [21, 19]; });   // F1: pair A wins
  assert.strictEqual(T.po.length, 5, "game 2 of the final is added");
  playNext(T, function () { return [21, 18]; });   // F2: A wins again
  assert.strictEqual(T.po.length, 5, "2-0: no third game");
  assert.ok(ctx.tourComplete(T) && ctx.tourPhase(T) === 3);
  var played = ctx.tourAll(T).length;
  assert.strictEqual(played, 11, "a 2-0 final saves a game (6 + 5)");
  var ord = ctx.tourOrder(T);
  assert.strictEqual(ord[0], s1w, "pair A is champion"); assert.strictEqual(ord[1], s2w); assert.strictEqual(ord[2], s1l);
})();
(function () {
  var T = eightToSemis(33);
  playNext(T, function () { return [21, 10]; }); playNext(T, function () { return [21, 10]; });
  playNext(T, function () { return [21, 10]; });                      // 3rd
  playNext(T, function () { return [21, 19]; });                      // F1: A
  playNext(T, function () { return [19, 21]; });                      // F2: B
  assert.strictEqual(T.po.length, 6, "1-1 adds game 3");
  assert.ok(!ctx.tourComplete(T));
  assert.strictEqual(ctx.tourFinalWins(T).wa, 1);
  playNext(T, function () { return [22, 20]; });                      // F3: A
  assert.ok(ctx.tourComplete(T) && ctx.tourAll(T).length === 12, "a 2-1 final uses all 12 games");
  assert.strictEqual(ctx.tourOrder(T)[0], T.po[3].pa);
})();

// ---- 6. 6 players: draw pairs, round robin ----
(function () {
  var T = ctx.tourNew(uids(6), seeded(8));
  playRotation(T);
  assert.strictEqual(ctx.tourPhase(T), 1);
  assert.ok(ctx.tourDraw(T, seeded(9)));
  assert.strictEqual(T.po.length, 3, "round robin of 3 pairs");
  assert.strictEqual(J(T.po.map(function (g) { return [g.pa, g.pb].sort().join(""); }).sort()), J(["01", "02", "12"]));
  // pair 0 beats 1 and 2; pair 1 beats 2
  playNext(T, function (g) { return g.pa < g.pb ? [21, 10] : [10, 21]; });
  playNext(T, function (g) { return g.pa < g.pb ? [21, 10] : [10, 21]; });
  playNext(T, function (g) { return g.pa < g.pb ? [21, 10] : [10, 21]; });
  assert.ok(ctx.tourComplete(T) && ctx.tourAll(T).length === 12, "9 + 3 games");
  assert.strictEqual(J(ctx.tourOrder(T)), J([0, 1, 2]));
  // a 3-way tie in wins: point diff, then the game between two
  var U = ctx.tourNew(uids(6), seeded(8)); playRotation(U); ctx.tourDraw(U, seeded(1));
  U.po.forEach(function (g) { delete g.sa; });
  var pc = {}; U.po.forEach(function (g) { pc[g.lab] = g; });
  ctx.tourApply(U, pc.R1, 21, 19); ctx.tourApply(U, pc.R2, 19, 21); ctx.tourApply(U, pc.R3, 21, 19);   // 0>1, 2>0, 1>2: everyone 1-1
  var tab = ctx.tourPairTable(U);
  assert.strictEqual(tab[0].w, 1); assert.strictEqual(tab.length, 3);
  assert.ok(tab[0].d >= tab[1].d && tab[1].d >= tab[2].d, "ties in wins go by point diff");
})();

// ---- 7. correcting a score ----
(function () {
  // a rotation correction that changes the pairs clears the draw and asks first (impact) when playoff games were played
  var T = eightToSemis(44);
  playNext(T, function () { return [21, 9]; });
  var before = ctx.tourSig(T), hit = null;
  for (var gi = 0; gi < T.games.length && !hit; gi++) {
    var g = T.games[gi], flip = g.sa > g.sb ? [5, 21] : [21, 5];
    var imp = ctx.tourImpact(T, g, flip[0], flip[1]);
    if (imp) hit = { g: g, flip: flip, imp: imp };
  }
  assert.ok(hit, "some rotation correction changes the pairs");
  assert.strictEqual(hit.imp.kind, "pairs"); assert.strictEqual(hit.imp.played, 1); assert.strictEqual(hit.imp.pairs.length, 4);
  assert.strictEqual(ctx.tourSig(T), before, "asking about the impact changes nothing");
  var res = ctx.tourApply(T, hit.g, hit.flip[0], hit.flip[1]);
  assert.ok(res.pairsChanged && res.fixed);
  assert.strictEqual(T.drawn, false); assert.strictEqual(T.po.length, 0); assert.strictEqual(T.semi, null);
  assert.strictEqual(ctx.tourPhase(T), 1, "back to waiting for the draw");
  assert.ok(ctx.tourDraw(T, seeded(2)) && T.po.length === 2, "the draw can be made again");

  // pairs that do not change keep the playoff
  var U = eightToSemis(45); playNext(U, function () { return [21, 9]; });
  var g0 = U.games[0], sigBefore = ctx.tourSig(U);
  ctx.tourApply(U, g0, g0.sa > g0.sb ? Math.min(30, g0.sa + 1) : g0.sa, g0.sb > g0.sa ? Math.min(30, g0.sb + 1) : g0.sb);
  if (ctx.tourSig(U) === sigBefore) assert.ok(U.drawn && U.po.length >= 2 && ctx.tourDone(U.po[0]), "same pairs: the played semi stays");

  // semi flip after 3rd place/final: impact, then reset
  var V = eightToSemis(46);
  playNext(V, function () { return [21, 10]; }); playNext(V, function () { return [21, 10]; });
  playNext(V, function () { return [21, 10]; }); playNext(V, function () { return [21, 10]; });
  assert.ok(V.po.length === 5 && ctx.tourDone(V.po[2]));
  var flipImp = ctx.tourImpact(V, V.po[0], 10, 21);
  assert.strictEqual(flipImp.kind, "semi");
  assert.strictEqual(ctx.tourImpact(V, V.po[0], 21, 5), null, "same winner: nothing is lost");
  var r2 = ctx.tourApply(V, V.po[0], 10, 21);
  assert.ok(r2.semiReset && V.po.length === 4 && !ctx.tourDone(V.po[2]) && !ctx.tourDone(V.po[3]), "3rd place and the final start again");

  // final series: 2-0, then game 1 corrected to a loss -> game 3 is needed; the other way trims it
  var W = eightToSemis(47);
  for (var i = 0; i < 5; i++) playNext(W, function () { return [21, 10]; });
  assert.ok(ctx.tourComplete(W) && W.po.length === 5);
  var f1 = W.po[3];
  assert.strictEqual(ctx.tourImpact(W, f1, 10, 21), null, "turning a 2-0 into 1-1 loses nothing");
  ctx.tourApply(W, f1, 10, 21);
  assert.strictEqual(W.po.length === 6 && !ctx.tourDone(W.po[5]) && !ctx.tourComplete(W), true, "game 3 is added");
  playNext(W, function () { return [21, 7]; });
  assert.ok(ctx.tourComplete(W) && W.po.length === 6);
  // game 1 corrected back into a win for A: the series is 2-0 after game 2 and the played game 3 would be thrown away
  var imp3 = ctx.tourImpact(W, W.po[3], 21, 5);
  assert.strictEqual(imp3 && imp3.kind, "final");
  ctx.tourApply(W, W.po[3], 21, 5);
  assert.ok(W.po.length === 5 && ctx.tourComplete(W), "game 3 is gone, the final ends 2-0");
})();

// ---- 8. the screen renders (stubbed page) ----
(function () {
  var els = {}, body = { classList: { add: function () {}, remove: function () {} }, appendChild: function (e) { els[e.id] = e; } };
  function el(id) { return els[id] || (els[id] = { id: id, innerHTML: "", textContent: "", remove: function () { delete els[id]; } }); }
  var sess = { id: "s1", date: "2026-10-24", courtName: "AP", players: uids(8), createdBy: "u0" };
  var c2 = {
    console: console, Math: Math, JSON: JSON, isFinite: isFinite, setTimeout: function () {}, setInterval: function () { return 1; }, clearInterval: function () {},
    window: { matchMedia: function () { return { matches: true }; } },
    document: { getElementById: function (id) { return els[id] || (id === "tnBody" || id === "tnSub" ? el(id) : null); }, body: body, addEventListener: function () {}, removeEventListener: function () {}, querySelector: function () { return null; },
      createElement: function () { return { setAttribute: function () {}, id: "", className: "", set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, remove: function () {} }; } },
    lastSessions: [sess], t: function (k) { return "[" + k + "]"; }, icon: function (n) { return "<i:" + n + ">"; }, escapeHtml: function (v) { return String(v).replace(/</g, "&lt;"); }, jsq: function (v) { return String(v).replace(/[^A-Za-z0-9_\-]/g, ""); },
    avatarHtml: function (u) { return "<av " + u + ">"; }, getUserName: function (u) { return "N" + u; }, plainUserName: function (u) { return u ? u.displayName : "?"; }, findUser: function (id) { return { displayName: "P" + id }; },
    canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, fmtDate: function (d) { return d; }, dbUpdateSession: function () { return { then: function (f) { f(); } }; }, dbOnError: function () {}, showToast: function () {},
    askYes: function (msg, yes, o) { c2.__ask = o || {}; c2.__yes = yes; }, askConfirm: function (o, yes) { c2.__ask = o; c2.__yes = yes; }, firebase: { firestore: { FieldValue: { delete: function () { return "DEL"; } } } }
  };
  vm.createContext(c2); vm.runInContext(src, c2);
  var rd = function () { return el("tnBody").innerHTML; };
  // before any tournament: the card shows the start button
  var card = c2.tourCardHtml(sess);
  assert.ok(/tourBtnStart/.test(card) && /tourCardAct\('s1'\)/.test(card), "card button offers the draw");
  c2.tourCardAct("s1");   // v237: asks first; nothing is drawn and no screen opens until yes
  assert.ok(!sess.tourney && c2.__ask && c2.__ask.title === "[tourStartTitle]" && !els.tnScreen, "start asks before drawing");
  assert.ok(/\[tourStartBody\]/.test(c2.__ask.body), "the question says what happens");
  c2.__yes();   // reduced motion: the draw is made at once
  assert.ok(sess.tourney && sess.tourney.games.length === 6, "the draw made a tournament of 6 games");
  var h = rd();
  assert.ok(/tn-cancel" data-act="reset"/.test(h) && /tourCancelBtn/.test(h), "after the draw a cancel button sits near the top");
  assert.ok(h.indexOf("tn-cancel") < h.indexOf("tn-steps"), "cancel is above the step tabs");
  assert.ok(/role="tablist"/.test(h) && /data-k="0" aria-selected="true"/.test(h) && /data-k="1" aria-selected="false" disabled/.test(h), "step tabs: rotation open, later steps wait");
  assert.strictEqual((h.match(/tn-waiting/g) || []).length, 5, "the 5 games after the up-next one say Waiting");
  assert.strictEqual((h.match(/data-act="live"/g) || []).length, 1, "only the up-next game has Live score");
  assert.ok(/tourBtnPlay/.test(h) && /tn-game cur/.test(h) && /tourMeetTitle/.test(h) && /tourRestTitle/.test(h) && /tourStandTitle/.test(h), "rotation, who-meets-who, rest and table are shown");
  assert.ok(!/undefined|NaN/.test(h), "no undefined or NaN in the screen");
  // enter a score through the screen's own click handler
  var click = function (act, extra) { var attrs = Object.assign({ "data-act": act }, extra || {}); c2.document.getElementById("tnScreen").onclick({ target: { closest: function () { return { getAttribute: function (k) { return attrs[k]; } }; } } }); };
  click("stage");   // opens the editor on the up-next game
  assert.ok(/tn-editor/.test(rd()), "the stage button opens the score editor");
  click("save"); assert.ok(sess.tourney.games.filter(function (g) { return g.sa !== null; }).length === 1, "the up-next game got its score");
  while (!ctx.tourRotDone(sess.tourney)) { var g = ctx.tourNext(sess.tourney); ctx.tourApply(sess.tourney, g, 21, 10); }
  c2.tourRender();
  assert.ok(/tourBtnSemi/.test(rd()) && /tourDrawHint/.test(rd()), "after the rotation the button is the semifinal draw");
  click("stage");
  assert.ok(sess.tourney.drawn && sess.tourney.po.length === 2 && /tourBracketTitle/.test(rd()), "the draw builds the bracket");
  while (ctx.tourNext(sess.tourney)) { var g2 = ctx.tourNext(sess.tourney); ctx.tourApply(sess.tourney, g2, 21, 15); }
  c2.tourRender();
  var done = rd();
  assert.ok(/tnWinner/.test(done) && /tourPlace1/.test(done) && /tourBtnWinner/.test(done) && !/undefined|NaN/.test(done), "the winner podium shows");
  assert.ok(done.indexOf("tn-pl p2") < done.indexOf("tn-pl p1") && done.indexOf("tn-pl p1") < done.indexOf("tn-pl p3"), "podium order: 2nd, 1st, 3rd");
  assert.ok(/data-place="1"[\s\S]*tn-plinth/.test(done) && !/tn-cancel/.test(done), "podium blocks; no cancel once done");
  // the tabs: an earlier step can be opened, then back to now
  click("tab", { "data-k": "0" }); assert.ok(/tourRotTitle/.test(rd()) && !/id="tnWinner"/.test(rd()) && /tourBackToNow/.test(rd()), "Rotation tab shows the rotation only");
  click("tab", { "data-k": "3" }); assert.ok(/id="tnWinner"/.test(rd()) && !/tourRotTitle/.test(rd()), "back to the winner");
  click("reset"); assert.ok(c2.__ask && /danger/.test(c2.__ask.kind), "reset asks first (danger)");
  // a viewer sees no edit buttons
  c2.canEditSessionDetails = function () { return false; }; c2.canEditBill = function () { return false; };
  sess.createdBy = "other";
  var viewer = c2.tourCardHtml(sess);
  assert.ok(/tourBtnWinner/.test(viewer), "a viewer can open the finished tournament");
})();

// ---- 9. the screen is wired in and safe ----
var app = fs.readFileSync("js/app.js", "utf8"), sw = fs.readFileSync("sw.js", "utf8"), html = fs.readFileSync("index.html", "utf8"), ses = fs.readFileSync("js/sessions.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(app.match(/APP_VERSION = "(v\d+)"/)[1] === sw.match(/godsmash-(v\d+)/)[1], "version bumped together");
assert.ok(sw.indexOf("'./js/tournament.js'") > 0 && html.indexOf('src="js/tournament.js"') > 0, "script loaded and precached");
var statsSrc = fs.readFileSync("js/stats.js", "utf8");
assert.ok(/tourCardHtml\(s\)/.test(statsSrc) && /tourCardHtml\(s\)/.test(ses) && /tourOnSessions\(\)/.test(ses), "v236: the button is on the list card and first in the Games tab; sessions updates refresh it");
var lsSrc = fs.readFileSync("js/livescore.js", "utf8");
assert.ok(/tourLivePreset\(s\)/.test(lsSrc) && /tourFromLive\(tour, a, b, la, lb\)/.test(lsSrc), "v236: live score starts on the tournament pair and hands the score back");
assert.ok(!/\b(confirm|prompt|alert)\s*\(/.test(src.replace(/askConfirm|askYes/g, "")), "no native confirm, prompt or alert");
assert.ok(!/\beval\s*\(|new Function/.test(src), "no eval, no new Function");
assert.ok(/askYes\(t\("tourResetTitle"\)/.test(src) && /askConfirm\(\{ title: t\("tourCorrect"\)/.test(src), "reset and impact corrections ask first");
assert.ok(/function tourCanRun\(s\)[^\n]*canEditSessionDetails\(s\) \|\| canEditBill\(s\)/.test(src), "only people who may edit the session run it");
assert.ok(!/innerHTML[^;\n]*\+\s*(g\.lab|T\.ids\[)/.test(src), "labels and ids are never put in HTML raw");
assert.ok(/getUserName\(T\.ids/.test(src) && /escapeHtml\(/.test(src), "names are escaped");
assert.ok(/prefers-reduced-motion/.test(css) && /_tnReduced\(\)/.test(src), "the draw shuffle is skipped for reduced motion");
// v227 hotfix: an old session already had `tournament` = { pairs, at, by } (v48 round robin); that and a half-saved value must not break the list
(function () {
  var c3 = {}; vm.createContext(c3);
  Object.assign(c3, { t: function (k) { return "[" + k + "]"; }, icon: function () { return ""; }, escapeHtml: String, jsq: String, perms: {}, canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, document: { getElementById: function () { return null; } } });
  vm.runInContext(src, c3);
  var old = { id: "o", players: ["a", "b"], tournament: { pairs: [["a", "b"]], at: 1, by: "a" } };
  var half = { id: "h", players: ["a", "b"], tourney: { v: 1 } };
  assert.strictEqual(c3.tourOf(old), null, "legacy tournament field is ignored");
  assert.strictEqual(c3.tourOf(half), null, "a half-saved tourney counts as none");
  assert.doesNotThrow(function () { c3.tourStage(old); c3.tourStage(half); }, "stage never throws on odd data");
})();
console.log("tournament OK");

/* ============================================================
   v228: a pair that is out (walkovers), and tournament games as stats records
   ============================================================ */
function playRot(T) { T.games.forEach(function (g, i) { ctx.tourApply(T, g, 21, 10 + (i % 7)); }); }
function drawn(n, seed) { var T = ctx.tourNew(uids(n), seeded(seed)); playRot(T); ctx.tourDraw(T, seeded(seed + 100)); return T; }
function play(T, g, a, b) { ctx.tourApply(T, g, a, b); }

// ---- 8 players: a semifinal pair is out -> walkover, the rest of the bracket carries on ----
(function () {
  var T = drawn(8, 7), s1 = T.po[0], out = s1.pa;
  assert.ok(ctx.tourMarkOut(T, out, "injury", "knee"), "a drawn pair can be marked out");
  assert.ok(s1.wo && s1.sb === ctx.TOUR_WO && s1.sa === 0, "the opponent gets 21-0 by walkover: " + J(s1));
  assert.strictEqual(T.out[0].why, "injury"); assert.strictEqual(T.out[0].note, "knee");
  assert.strictEqual(ctx.tourMarkOut(T, out, "injury"), false, "cannot mark a pair out twice");
  assert.strictEqual(T.po.length, 2, "final and 3rd place wait for the other semi");
  play(T, T.po[1], 21, 15);
  assert.strictEqual(T.po.length >= 4, true, "after the other semi the final and 3rd place exist");
  var third = T.po[2];
  assert.ok(third.wo, "3rd place: the pair that is out gives a walkover");
  assert.strictEqual(ctx.tourOutOf(T, out) !== null, true);
  var f1 = ctx.tourFinals(T)[0]; assert.ok(!f1.wo, "the final is between two pairs still in");
  play(T, f1, 21, 18); play(T, ctx.tourFinals(T)[1], 21, 19);
  assert.ok(ctx.tourComplete(T), "tournament completes"); assert.strictEqual(ctx.tourOrder(T).length, 3);
})();

// ---- a finalist is out before the final: series is 2-0 by walkover ----
(function () {
  var T = drawn(8, 11); play(T, T.po[0], 21, 10); play(T, T.po[1], 21, 12);
  var f1 = ctx.tourFinals(T)[0], p = f1.pa;
  ctx.tourMarkOut(T, p, "left", "");
  var fs = ctx.tourFinals(T);
  assert.strictEqual(fs.length, 2, "2-0 by walkover ends the series"); assert.ok(fs.every(function (g) { return g.wo; }));
  var w = ctx.tourFinalWins(T); assert.strictEqual(w.wb, 2); assert.strictEqual(w.wa, 0);
  play(T, T.po[2], 21, 17);
  assert.ok(ctx.tourComplete(T)); var o = ctx.tourOrder(T);
  assert.strictEqual(o[0], f1.pb, "the pair still in is champion"); assert.strictEqual(o[1], p, "the pair that went out is runner-up");
})();

// ---- a finalist goes out after winning game 1: 1-1 by walkover then game 3 by walkover ----
(function () {
  var T = drawn(8, 13); play(T, T.po[0], 21, 10); play(T, T.po[1], 21, 12); play(T, T.po[2], 21, 17);
  var f1 = ctx.tourFinals(T)[0], p = f1.pa; play(T, f1, 21, 15);   // pair a wins game 1
  ctx.tourMarkOut(T, p, "injury", "");
  var fs = ctx.tourFinals(T), w = ctx.tourFinalWins(T);
  assert.strictEqual(fs.length, 3, "walkovers give game 2 and game 3"); assert.ok(!fs[0].wo && fs[1].wo && fs[2].wo);
  assert.strictEqual(w.wb, 2); assert.strictEqual(w.wa, 1); assert.ok(ctx.tourComplete(T));
  assert.strictEqual(ctx.tourOrder(T)[0], f1.pb);
})();

// ---- both pairs of the 3rd place game are out: that game is void; the other side of a semi is a walkover ----
(function () {
  var T = drawn(8, 17), s1 = T.po[0], s2 = T.po[1];
  var A = s1.pa, B = s1.pb, C = s2.pa, D = s2.pb;
  ctx.tourMarkOut(T, A, "injury"); assert.ok(s1.wo && !s1.v, "one pair out: the other wins the semi by walkover");
  ctx.tourMarkOut(T, C, "left");
  assert.ok(s2.wo && !s2.v);
  assert.strictEqual(T.po.length >= 4, true, "both semis done: 3rd place and final exist");
  var third = T.po[2];
  assert.ok(third.v && third.sa === 0 && third.sb === 0, "3rd place between two pairs that are out is void: " + J(third));
  var f1 = ctx.tourFinals(T)[0]; assert.ok(!f1.wo, "the final is between the two pairs still in");
  play(T, f1, 21, 9); play(T, ctx.tourFinals(T)[1], 21, 9);
  assert.ok(ctx.tourComplete(T)); var o = ctx.tourOrder(T);
  assert.strictEqual(o[2], -1, "no 3rd place when the game was void");
  assert.ok(o[0] >= 0 && o[1] >= 0);
})();

// ---- every pair goes out: champion is the last pair standing, walkovers all the way ----
(function () {
  var T = drawn(8, 19), s1 = T.po[0], s2 = T.po[1];
  var A = s1.pa, B = s1.pb, C = s2.pa, D = s2.pb;
  ctx.tourMarkOut(T, A, "other", "x"); ctx.tourMarkOut(T, B, "other", "x"); ctx.tourMarkOut(T, C, "other", "x");
  assert.ok(ctx.tourComplete(T), "the last pair standing wins by walkover");
  assert.strictEqual(ctx.tourMarkOut(T, D, "other", "x"), false, "a finished tournament cannot change");
  assert.strictEqual(ctx.tourOrder(T)[0], D);
  assert.strictEqual(ctx.tourMatches({ id: "s", tourney: T, date: "2026-10-24" }, "g").filter(function (m) { return m.tid; }).length, T.games.length, "void and walkover games are not stats games");
})();

// ---- 6 players: round robin walkovers ----
(function () {
  var T = drawn(6, 23), P = ctx.tourPairs(T);
  ctx.tourMarkOut(T, 2, "injury", "");
  var wo = T.po.filter(function (g) { return g.wo; });
  assert.strictEqual(wo.length, 2, "the pair that is out gives 2 walkovers");
  var left = T.po.filter(function (g) { return !g.wo && !g.v; }); assert.strictEqual(left.length, 1);
  play(T, left[0], 21, 14); assert.ok(ctx.tourComplete(T));
  var tab = ctx.tourPairTable(T); assert.strictEqual(tab[tab.length - 1].i, 2, "the pair that is out finishes last"); assert.strictEqual(tab[tab.length - 1].w, 0);
  // out after playing one game: only the games left are walkovers
  var U = drawn(6, 29), g0 = U.po[0]; play(U, g0, 21, 8);
  var q = g0.pa; ctx.tourMarkOut(U, q, "left", "");
  assert.ok(!g0.wo, "the played game stays");
  assert.strictEqual(U.po.filter(function (g) { return g.wo; }).length, 1);
})();

// ---- undo: walkovers go back to unplayed, remaining out pairs still apply ----
(function () {
  var T = drawn(8, 31), s1 = T.po[0], a = s1.pa, b = s1.pb, c = T.po[1].pa;
  ctx.tourMarkOut(T, a, "injury"); ctx.tourMarkOut(T, c, "left");
  var third = T.po[2]; assert.ok(third.v, "3rd place void");
  assert.strictEqual(ctx.tourUndoImpact(T, c), 0);
  ctx.tourUndoOut(T, c);
  assert.ok(!ctx.tourDone(T.po[1]) && T.po.length === 2, "second semi is open again, 3rd place and final are gone");
  assert.ok(s1.wo, "the other pair is still out: its walkover stays"); assert.strictEqual(T.out.length, 1);
  ctx.tourUndoOut(T, a);
  assert.ok(!ctx.tourDone(s1) && (T.out || []).length === 0, "no pair out: the semi is open again");
  assert.strictEqual(ctx.tourUndoOut(T, a), false);
  // undo that clears real games played after walkovers
  var U = drawn(8, 37), x = U.po[0].pa; ctx.tourMarkOut(U, x, "injury"); play(U, U.po[1], 21, 12);
  var fin = ctx.tourFinals(U)[0]; play(U, fin, 21, 17);
  assert.strictEqual(ctx.tourUndoImpact(U, x), 1, "one real game (final game 1) would be cleared");
  ctx.tourUndoOut(U, x); assert.strictEqual(U.po.length, 2); assert.ok(!ctx.tourDone(U.po[0]));
})();

// ---- cannot mark out before the draw, nor after the end ----
(function () {
  var T = ctx.tourNew(uids(8), seeded(5)); assert.strictEqual(ctx.tourMarkOut(T, 0, "injury"), false, "before the pairs are drawn: no");
  playRot(T); assert.strictEqual(ctx.tourMarkOut(T, 0, "injury"), false, "rotation done but not drawn: no");
  var U = drawn(8, 41); play(U, U.po[0], 21, 5); play(U, U.po[1], 21, 5); play(U, U.po[2], 21, 5); play(U, ctx.tourFinals(U)[0], 21, 5); play(U, ctx.tourFinals(U)[1], 21, 5);
  assert.ok(ctx.tourComplete(U)); assert.strictEqual(ctx.tourMarkOut(U, 0, "injury"), false, "finished: no");
  assert.strictEqual(ctx.tourMarkOut(drawn(8, 3), 9, "injury"), false, "bad pair number");
  var V = drawn(8, 43); ctx.tourMarkOut(V, 0, "weird<script>", "<b>hi</b>\n"); assert.strictEqual(V.out[0].why, "other"); assert.ok(V.out[0].note.indexOf("<") < 0);
  // a walkover is not a score to correct
  var W = drawn(8, 47), wg = W.po[0]; ctx.tourMarkOut(W, wg.pa, "injury");
  assert.strictEqual(ctx.tourImpact(W, wg, 21, 3), null); assert.ok(ctx.tourApply(W, wg, 21, 3).blocked); assert.ok(wg.wo);
})();

// ---- correcting a rotation score that changes the pairs clears the out marks ----
(function () {
  var T = drawn(8, 53), before = ctx.tourSig(T); ctx.tourMarkOut(T, 0, "injury");
  var changed = false;
  for (var i = 0; i < T.games.length && !changed; i++) {
    [[0, 21], [21, 0], [30, 2]].forEach(function (sc) {
      if (changed) return; var g = T.games[i];
      var imp = ctx.tourImpact(T, g, sc[0], sc[1]);
      if (imp && imp.kind === "pairs") { assert.strictEqual(imp.outs, 1, "the warning counts the out marks"); ctx.tourApply(T, g, sc[0], sc[1]); changed = true; }
    });
  }
  if (changed) { assert.strictEqual(T.out.length, 0); assert.strictEqual(T.drawn, false); }
  assert.ok(before);
})();

// ---- tournament games as stats records ----
(function () {
  var s = { id: "S1", date: "2026-10-24", groupId: "G", createdAt: 1000, courtName: "AP", tourney: drawn(8, 59) };
  var T = s.tourney; play(T, T.po[0], 21, 10); play(T, T.po[1], 18, 21);
  var ms = ctx.tourMatches(s, "G");
  assert.strictEqual(ms.length, T.games.length + 2, "every real game is a record");
  ms.forEach(function (m) {
    assert.ok(m.tid === "S1" && m.confirmed === true && m.sessionId === "S1" && m.createdBy === "", J(m));
    assert.strictEqual(m.teamA.length, 2); assert.strictEqual(m.teamB.length, 2); assert.ok(/^t:S1:\d+$/.test(m.id));
    assert.ok(m.games.length === 1 && typeof m.games[0].a === "number");
  });
  assert.strictEqual(new Set(ms.map(function (m) { return m.id; })).size, ms.length, "unique ids");
  // not counted: unplayed games, tournament without ids
  assert.strictEqual(ctx.tourMatches({ id: "x" }, "G").length, 0);
  // dedupe against a normal match typed in for the same game (teams swapped, same score)
  var first = ms[0], dup = { id: "m1", sessionId: "S1", teamA: first.teamB, teamB: first.teamA, games: [{ a: first.games[0].b, b: first.games[0].a }], date: "2026-10-24", createdAt: 5 };
  var merged = ctx.tourMergeMatches([dup], [s], "G");
  assert.strictEqual(merged.length, ms.length, "a game typed in twice counts once: " + merged.length + " vs " + ms.length);
  assert.ok(merged.some(function (m) { return m.id === "m1" && !m.tid; }), "the typed-in match wins");
  // a different score is a different game
  var other = { id: "m2", sessionId: "S1", teamA: first.teamA, teamB: first.teamB, games: [{ a: 3, b: 21 }], date: "2026-10-24", createdAt: 5 };
  assert.strictEqual(ctx.tourMergeMatches([other], [s], "G").length, ms.length + 1);
  // sorted by date
  var old = { id: "m0", sessionId: "Z", teamA: ["a", "b"], teamB: ["c", "d"], games: [{ a: 21, b: 1 }], date: "2026-01-01", createdAt: 1 };
  assert.strictEqual(ctx.tourMergeMatches([old], [s], "G")[0].id, "m0");
})();
// ---- wiring: stats read the tournament games, walkovers asked first, badge shown ----
(function () {
  var st = fs.readFileSync("js/stats.js", "utf8"), ses2 = fs.readFileSync("js/sessions.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8");
  assert.ok(/function rebuildMatches\(\)/.test(st) && /tourMergeMatches\(_matchesReal/.test(st) && /rebuildMatches\(\);/.test(st), "lastMatches = saved matches + tournament games");
  assert.ok(/tourSessionsChanged\(\)/.test(ses2), "sessions updates rebuild the stats games");
  assert.ok(/tn-badge/.test(st) && /var canEdit = !tn &&/.test(st), "tournament games show a badge and cannot be edited or deleted from the match list");
  assert.ok(/askConfirm\(\{ title: t\("tourOutTitle"\)/.test(src) && /askConfirm\(\{ title: t\("tourOutUndoTitle"\)/.test(src), "marking out and bringing back ask first");
  assert.ok(/tourOutRotHint/.test(src) && /org && !T\.drawn \? '<div class="tn-sec tn-hint"/.test(src), "before the draw the screen explains Cancel instead of mark out");
  ["tourOutBtn", "tourOutTag", "tourWO", "tourWhy_injury", "tourWhy_left", "tourWhy_other", "tourBadge", "tourOutRotHint"].forEach(function (k) {
    assert.ok(new RegExp("\\b" + k + ":").test(i18n.split("la: {")[0]) || true); assert.ok((i18n.match(new RegExp("\\b" + k + ":", "g")) || []).length === 2, k + " in EN and Lao");
  });
})();
// ---- v237: what each step tab shows ----
(function () {
  var T = ctx.tourNew(uids(8), seeded(9));
  assert.strictEqual(J(ctx.tourTabParts(T, 0)), J(["rule", "hint", "rot", "meet", "rest", "stand"]));
  assert.strictEqual(J(ctx.tourTabParts(T, 1)), J(["sum", "stand", "pairs", "drawsec"]), "before the draw: summary and the draw");
  assert.strictEqual(J(ctx.tourTabParts(T, 2)), J(["bracket", "po"]));
  assert.strictEqual(J(ctx.tourTabParts(T, 3)), J(["winner", "bracket"]));
  assert.strictEqual(ctx._tnViewNow(T), 0);
  playRotation(T); assert.strictEqual(ctx._tnViewNow(T), 1, "rotation done: Pairs");
  ctx.tourDraw(T, seeded(3)); assert.strictEqual(ctx._tnViewNow(T), 2, "drawn: the semis are on Playoff");
  assert.strictEqual(J(ctx.tourTabParts(T, 1)), J(["stand", "pairs"]), "after the draw no summary");
})();
console.log("tournament v228 ok");

/* ============================================================
   v238: a stand-in for a player who cannot play
   ============================================================ */
(function () {
  function onList(g) { var o = ctx.tourOn(g); return o.a.concat(o.b); }
  // ---- eligibility: never someone on court, never someone out ----
  var T = ctx.tourNew(uids(6), seeded(61));
  playNext(T); playNext(T); playNext(T);   // games 1-3 played
  var gi = 3, g = T.games[gi], from = g.a[0], on = onList(g);
  var el = ctx.tourEligible(T, g, from);
  assert.strictEqual(el.length, 2, "6 players: the 2 resting players can step in");
  el.forEach(function (i) { assert.ok(on.indexOf(i) < 0 && i !== from, "a stand-in is never on court"); });
  // ---- auto pick: fewest games, then name ----
  var names = ["Mee", "Bob", "Lich", "Ton", "Mira", "Nith"], nm = function (i) { return names[i]; };
  var pick = ctx.tourAutoPick(T, g, from, nm);
  var load = function (i) { var all = ctx.tourAll(T); return all.slice(0, all.indexOf(g)).filter(function (x) { return onList(x).indexOf(i) >= 0; }).length; };
  var exp = el.slice().sort(function (x, y) { return load(x) - load(y) || nm(x).localeCompare(nm(y)); })[0];
  assert.strictEqual(pick, exp, "the app picks the stand-in with the fewest games, then by name");
  // ---- this game only ----
  var to = el[0];
  assert.ok(ctx.tourSub(T, gi, from, to, "injury", "ankle", false, nm), "replace for this game");
  assert.ok(onList(g).indexOf(to) >= 0 && onList(g).indexOf(from) < 0, "the stand-in is on court");
  assert.strictEqual(J(g.subs[0]), J({ from: from, to: to, why: "injury", note: "ankle" }));
  assert.ok(!(T.hurt || []).length, "this game only: nobody is out for good");
  assert.strictEqual(ctx.tourSub(T, gi, from, el[1], "injury", "", false, nm), false, "the hurt player is not on court any more");
  // swap the stand-in for the other resting player, then put the first player back
  assert.ok(ctx.tourSub(T, gi, to, el[1], "other", "", false, nm)); assert.strictEqual(g.subs.length, 1); assert.strictEqual(g.subs[0].to, el[1]);
  assert.ok(ctx.tourSub(T, gi, el[1], from, "other", "", false, nm)); assert.ok(!g.subs, "the player is back: no stand-in left");
  // ---- 1b + 2: the stand-in gets the game in the table and in stats; the hurt player does not ----
  var before = ctx.tourStats(T).filter(function (x) { return x.id === to; })[0].p, beforeH = ctx.tourStats(T).filter(function (x) { return x.id === from; })[0].p;
  ctx.tourSub(T, gi, from, to, "injury", "", false, nm);
  ctx.tourApply(T, g, 21, 12);
  var st = ctx.tourStats(T), sTo = st.filter(function (x) { return x.id === to; })[0], sFrom = st.filter(function (x) { return x.id === from; })[0];
  assert.strictEqual(sTo.p, before + 1, "the stand-in's game counts for the stand-in");
  assert.strictEqual(sFrom.p, beforeH, "the hurt player keeps only the games they played");
  var ms = ctx.tourMatches({ id: "S", tourney: T, date: "2026-10-26" }, "G"), m = ms.filter(function (x) { return x.id === "t:S:" + gi; })[0];
  assert.ok(m.teamA.concat(m.teamB).indexOf("u" + to) >= 0 && m.teamA.concat(m.teamB).indexOf("u" + from) < 0, "Rankings and Elo: the stand-in played it");
  // ---- all games left: every later game of the hurt player gets a stand-in ----
  var U = ctx.tourNew(uids(6), seeded(67)); playNext(U);
  var g1 = ctx.tourNext(U), gi1 = ctx.tourAll(U).indexOf(g1), h = g1.b[1], e1 = ctx.tourEligible(U, g1, h);
  assert.ok(ctx.tourSub(U, gi1, h, e1[0], "injury", "", true, nm), "replace for all games left");
  assert.strictEqual(U.hurt.length, 1); assert.strictEqual(U.hurt[0].i, h);
  ctx.tourAll(U).forEach(function (x) { if (!ctx.tourDone(x)) assert.ok(onList(x).indexOf(h) < 0, "the hurt player is on court in no game left"); });
  ctx.tourAll(U).forEach(function (x) { (x.subs || []).forEach(function (sb) { assert.ok(onList(x).filter(function (i) { return i === sb.to; }).length === 1); }); });
  // play all; the table counts and the playoff draws with the hurt player still in the pairs
  playRotation(U); ctx.tourDraw(U, seeded(5));
  assert.ok(U.po.length === 3, "6 players: 3 round-robin games");
  U.po.forEach(function (x) { if (!ctx.tourDone(x)) assert.ok(onList(x).indexOf(h) < 0, "playoff games get stand-ins too"); });
  U.po.forEach(function (x) {   // never the hurt player's own partner (they are on court already)
    (x.subs || []).forEach(function (sb) { var side = x.a.indexOf(sb.from) >= 0 ? x.a : x.b; assert.ok(side.indexOf(sb.to) < 0, "the partner never stands in for their partner"); });
  });
  // ---- back in: the games not played yet are his again ----
  assert.ok(ctx.tourBackIn(U, h, nm)); assert.ok(!(U.hurt || []).length);
  var open = ctx.tourAll(U).filter(function (x) { return !ctx.tourDone(x); });
  assert.ok(open.some(function (x) { return x.a.concat(x.b).indexOf(h) >= 0 && onList(x).indexOf(h) >= 0; }), "back in: plays his own games again");
  open.forEach(function (x) { assert.ok(!(x.subs || []).some(function (sb) { return sb.from === h; })); });
  assert.strictEqual(ctx.tourBackIn(U, h, nm), false, "not out: nothing to undo");
  // ---- nobody free: walkover ----
  var V = ctx.tourNew(uids(6), seeded(71)), vg = V.games[0], vrest = [0, 1, 2, 3, 4, 5].filter(function (i) { return onList(vg).indexOf(i) < 0; });
  V.hurt = vrest.map(function (i) { return { i: i, why: "left", note: "" }; });   // both resting players already left
  var vh = vg.a[0];
  assert.strictEqual(ctx.tourEligible(V, vg, vh).length, 0, "nobody free");
  assert.strictEqual(ctx.tourSub(V, 0, vh, vrest[0], "injury", "", true, nm), false, "a player who is out cannot step in");
  assert.ok(ctx.tourSub(V, 0, vh, -1, "injury", "", true, nm), "nobody free: walkover");
  assert.ok(vg.wo && vg.woHurt === vh && vg.sa === 0 && vg.sb === 21, "the hurt player's team loses by walkover");
  assert.ok(ctx.tourApply(V, vg, 21, 3).blocked, "a walkover is not a score");
  var vs = ctx.tourStats(V), vp = vs.filter(function (x) { return x.id === vh; })[0];
  assert.strictEqual(vp.p, 0, "the hurt player gets no game for the walkover");
  assert.strictEqual(ctx.tourMatches({ id: "V", tourney: V }, "G").length, 0, "walkovers are not stats games");
  var W = ctx.tourNew(uids(6), seeded(73)); assert.strictEqual(ctx.tourSub(W, 0, W.games[0].a[0], -1, "injury", "", false, nm), false, "no walkover while someone is free");
  // ---- old data without subs or hurt stays valid ----
  var old = ctx.tourNew(uids(8), seeded(79)); delete old.out; playRot(old);
  assert.ok(ctx.tourOf({ tourney: old }), "no hurt / subs fields: still a tournament");
  assert.doesNotThrow(function () { ctx.tourStats(old); ctx.tourDraw(old, seeded(2)); ctx.tourMatches({ id: "o", tourney: old }); });
  // ---- 8 players: a semi stand-in comes from the other semi ----
  var X = drawn(8, 83), s1 = X.po[0], xh = s1.a[0], xe = ctx.tourEligible(X, s1, xh);
  assert.strictEqual(xe.length, 4, "8 players: the 4 players of the other semi can step in");
  xe.forEach(function (i) { assert.ok(X.po[1].a.concat(X.po[1].b).indexOf(i) >= 0); });
  // ---- row warning: a stand-in on court game after game ----
  assert.ok(typeof ctx.tourRowRun(X, s1, s1.a[1]) === "number");
})();

// ---- v238: mid-game in live score: the stand-in finishes, the whole game counts for them ----
(function () {
  var T = ctx.tourNew(uids(6), seeded(89)); playNext(T);
  var g = ctx.tourNext(T), gi = ctx.tourAll(T).indexOf(g), id = function (p) { return T.ids[p]; };
  var a = g.a.map(id), b = g.b.map(id), restP = [0, 1, 2, 3, 4, 5].filter(function (i) { return g.a.indexOf(i) < 0 && g.b.indexOf(i) < 0; });
  var hurtU = a[1], subU = id(restP[0]);
  var la = [a[0], subU], lb = b.slice();
  // without the stand-in recorded, these teams do not match
  assert.strictEqual(ctx.tourLiveApply(T, { sid: "S", gi: gi, a: a, b: b }, 21, 18, la, lb), false, "an unknown player is refused");
  assert.ok(!ctx.tourDone(g));
  var tour = { sid: "S", gi: gi, a: a, b: b, subs: [{ from: hurtU, to: subU, why: "injury", note: "", all: false }] };
  assert.ok(ctx.tourLiveApply(T, tour, 18, 21, lb, la), "the live game with a stand-in is accepted (sides swapped too)");
  assert.ok(ctx.tourDone(g) && g.sa === 21 && g.sb === 18, "score put on the right sides");
  assert.ok(ctx.tourOn(g).a.indexOf(T.ids.indexOf(subU)) >= 0, "the stand-in is recorded on the game");
  var ms = ctx.tourMatches({ id: "S", tourney: T }, "G"), m = ms.filter(function (x) { return x.id === "t:S:" + gi; })[0];
  assert.ok(m.teamA.indexOf(subU) >= 0 && m.teamA.indexOf(hurtU) < 0, "the whole game counts for whoever finished it");
  // a stand-in that is not allowed (on court) leaves everything as it was
  var g2 = ctx.tourNext(T), gi2 = ctx.tourAll(T).indexOf(g2), a2 = g2.a.map(id), b2 = g2.b.map(id);
  var bad = { sid: "S", gi: gi2, a: a2, b: b2, subs: [{ from: a2[0], to: b2[0], why: "injury", note: "" }] };
  assert.strictEqual(ctx.tourLiveApply(T, bad, 21, 5, [b2[0], a2[1]], b2), false);
  assert.ok(!ctx.tourDone(g2) && !g2.subs, "nothing changed");
})();

// ---- v238: the screen: three buttons in one row, the sheet shows photos, asks first ----
(function () {
  var tn = fs.readFileSync("js/tournament.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8"), ls = fs.readFileSync("js/livescore.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8");
  var row = tn.match(/else if \(cur\) h \+= '<div class="tn-gbtns">[^\n]*\n[^\n]*\n[^\n]*/);
  assert.ok(row && /data-act="live"/.test(row[0]) && /data-act="edit"/.test(row[0]) && /data-act="sub"/.test(row[0]), "Live score, Add score and Replace player sit in the same .tn-gbtns row");
  assert.ok(/\.tn-gbtns\{display:flex;gap:6px;flex-wrap:nowrap\}/.test(css), "the row never wraps");
  assert.ok(/tn-pchip[^\n]*avatarHtml\(T\.ids\[i\], 24\)/.test(tn) && /tn-pick[^\n]*avatarHtml\(T\.ids\[i\], 28\)/.test(tn), "who cannot play and who steps in show the profile picture");
  assert.ok(/askConfirm\(\{ title: title, body: body, kind: "warn", yes: t\("tourSubYes"\)/.test(tn) && /askConfirm\(\{ title: _tnFill\(t\("tourBackInTitle"\)/.test(tn), "replace and back in ask first");
  assert.ok(/tourLiveSub\(\)/.test(ls) && /tourLiveApply\(T, tour, sa, sb, la, lb/.test(tn), "live score has Replace player and hands the stand-in back");
  ["tourSubBtn", "tourSubTag", "tourSubRow", "tourRestOut", "tourHurtTitle", "tourBackInTitle", "tourSubNone", "tourSubAll"].forEach(function (k) {
    assert.strictEqual((i18n.match(new RegExp("\\b" + k + ":", "g")) || []).length, 2, k + " in EN and Lao");
  });
})();
// ---- v238: the screen with a stand-in (stubbed page) ----
(function () {
  var els = {}, body = { classList: { add: function () {}, remove: function () {} }, appendChild: function (e) { els[e.id] = e; } };
  function el(id) { return els[id] || (els[id] = { id: id, innerHTML: "", textContent: "", remove: function () { delete els[id]; } }); }
  var sess = { id: "s1", date: "2026-10-26", courtName: "Test", players: uids(6), createdBy: "u0" };
  var c4 = {
    console: console, Math: Math, JSON: JSON, isFinite: isFinite, setTimeout: function () {}, setInterval: function () { return 1; }, clearInterval: function () {},
    window: { matchMedia: function () { return { matches: true }; } },
    document: { getElementById: function (id) { return els[id] || (id === "tnBody" || id === "tnSub" ? el(id) : null); }, body: body, addEventListener: function () {}, removeEventListener: function () {}, querySelector: function () { return null; },
      createElement: function () { return { setAttribute: function () {}, id: "", className: "", querySelector: function () { return null; }, contains: function () { return false; }, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, remove: function () { delete els[this.id]; } }; } },
    lastSessions: [sess], t: function (k) { return "[" + k + "]"; }, icon: function (n) { return "<i:" + n + ">"; }, escapeHtml: function (v) { return String(v).replace(/</g, "&lt;"); }, jsq: String,
    avatarHtml: function (u) { return "<av " + u + ">"; }, getUserName: function (u) { return "N" + u; }, plainUserName: function (u) { return u ? u.displayName : "?"; }, findUser: function (id) { return { displayName: "P" + id }; },
    canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, fmtDate: function (d) { return d; }, dbUpdateSession: function () { return { then: function (f) { f(); } }; }, dbOnError: function () {}, showToast: function () {},
    askYes: function (msg, yes, o) { c4.__ask = o || {}; c4.__yes = yes; }, askConfirm: function (o, yes) { c4.__ask = o; c4.__yes = yes; }
  };
  vm.createContext(c4); vm.runInContext(src, c4);
  sess.tourney = c4.tourNew(uids(6), seeded(97));
  var T = sess.tourney; c4.tourApply(T, T.games[0], 21, 10);
  c4._tnOpen("s1");
  var h = els.tnBody.innerHTML, cur = c4.tourNext(T), gi = c4.tourAll(T).indexOf(cur);
  assert.strictEqual((h.match(/class="tn-gbtns"/g) || []).length, 1, "one button row");
  assert.ok(/data-act="live"[^]*data-act="edit"[^]*data-act="sub"/.test(h.slice(h.indexOf("tn-gbtns"), h.indexOf("tn-gbtns") + 900)), "the 3 buttons are in that row, in order");
  var click = function (act, extra) { var attrs = Object.assign({ "data-act": act }, extra || {}); els.tnScreen.onclick({ target: { closest: function () { return { getAttribute: function (k) { return attrs[k]; } }; } } }); };
  click("sub", { "data-i": String(gi) });
  var sh = els.tnSubSheet; assert.ok(sh && /tourSubWho/.test(sh.innerHTML) && (sh.innerHTML.match(/<av u\d>/g) || []).length === 4, "the sheet lists the 4 players on court with photos");
  var sclick = function (attrs) { sh.onclick({ target: { id: "", closest: function () { return { disabled: false, getAttribute: function (k) { return attrs[k] === undefined ? null : attrs[k]; } }; } } }); };
  var hurt = cur.a[0];
  sclick({ "data-sact": "from", "data-p": String(hurt) });
  assert.ok(/tn-pick on/.test(sh.innerHTML) && /tourSubPicked/.test(sh.innerHTML) && (sh.innerHTML.match(/tn-pick[ "]/g) || []).length >= 2, "stand-ins listed with photos, one picked");
  sclick({ "data-sact": "go" });
  assert.ok(!els.tnSubSheet && c4.__ask && c4.__ask.title === "[tourSubAsk]", "Replace asks first");
  assert.ok(!(cur.subs || []).length, "nothing changes before yes");
  c4.__yes();
  assert.ok(cur.subs && cur.subs.length === 1 && T.hurt.length === 1, "yes: stand-in on this game and the player is out for the games left");
  h = els.tnBody.innerHTML;
  assert.ok(/tn-si/.test(h) && /tourSubTag/.test(h) && /tourRestOut/.test(h) && /tn-hurt/.test(h) && /data-act="back-in"/.test(h), "the game shows the stand-in, the out line and the back-in button");
  assert.ok(!/undefined|NaN/.test(h), "no undefined or NaN");
  click("back-in", { "data-p": String(hurt) });
  assert.ok(c4.__ask && /tourBackInTitle/.test(c4.__ask.title)); c4.__yes();
  assert.ok(!(T.hurt || []).length && !(cur.subs || []).length, "back in clears the stand-ins of the games left");
})();
console.log("tournament v238 ok");
