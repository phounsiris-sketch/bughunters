/* Run: node tests/session-swap.test.js — v242: a player swapped in a session edit takes the old player's place in the tournament games
   not played yet (played games stay with the old player) and in the linked poll; any other player change asks first */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var J = function (x) { return JSON.stringify(x); };
var ctx = { console: console, Math: Math, JSON: JSON, isFinite: isFinite };
vm.createContext(ctx); vm.runInContext(fs.readFileSync("js/tournament.js", "utf8"), ctx);
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
var U = ["mb", "u1", "u2", "u3", "u4", "u5", "u6", "u7"];
function fresh(n, seed) { return ctx.tourNew(U.slice(0, n), seeded(seed || 3)); }
function play(T, k) { for (var i = 0; i < k; i++) { var g = ctx.tourNext(T); assert.ok(g); ctx.tourApply(T, g, 21, 15); } }
function onList(g) { var on = ctx.tourOn(g); return on.a.concat(on.b); }
function uidsIn(T, gi) { var g = ctx.tourAll(T)[gi]; return onList(g).map(function (p) { return ctx.tourUid(T, p, gi); }); }

// ---- 1. swap applies only to the games not played yet ----
[6, 8].forEach(function (n) {
  var T = fresh(n), pos = T.ids.indexOf("mb");
  play(T, 3);
  assert.strictEqual(ctx.tourSwap(T, "mb", "new"), true);
  assert.strictEqual(T.swaps.length, 1);
  assert.strictEqual(T.swaps[0].at, 3, "first unplayed game");
  ctx.tourAll(T).forEach(function (g, gi) {
    var uids = uidsIn(T, gi);
    if (gi < 3) assert.ok(uids.indexOf("new") < 0, n + ": played game " + gi + " keeps the old player");
    else assert.ok(uids.indexOf("mb") < 0, n + ": game " + gi + " has no old player");
    if (gi >= 3 && onList(g).indexOf(pos) >= 0) assert.ok(uids.indexOf("new") >= 0, "new player plays where the old one was");
  });
  assert.strictEqual(ctx.tourUid(T, pos), "new", "current player of the position");
  assert.strictEqual(ctx.tourPosOf(T, "new"), pos);
  assert.strictEqual(ctx.tourPosOf(T, "mb"), -1);
  assert.strictEqual(ctx.tourPosOf(T, "mb", 0), pos, "in game 0 the old player is still there");
});

// ---- 2. Rankings / Elo records credit the player of each game ----
(function () {
  var T = fresh(6, 5), s = { id: "S1", tourney: T, date: "2026-10-27" };
  play(T, 4); ctx.tourSwap(T, "mb", "new"); play(T, 3);
  var ms = ctx.tourMatches(s, "g1");
  assert.strictEqual(ms.length, 7);
  ms.forEach(function (m) {
    var idx = Number(m.id.split(":")[2]), all = m.teamA.concat(m.teamB);
    assert.strictEqual(J(all), J(uidsIn(T, idx)), "record ids = the players of that game");
    if (idx < 4) assert.ok(all.indexOf("new") < 0); else assert.ok(all.indexOf("mb") < 0);
  });
  var mbGames = ms.filter(function (m) { return m.teamA.concat(m.teamB).indexOf("mb") >= 0; }).length;
  assert.ok(mbGames > 0 && mbGames <= 4, "old player keeps credit for the games he played");
  // the table row is the position: it carries the old player's games, the new player continues it
  var pos = T.ids.indexOf("mb"), row = ctx.tourStats(T).filter(function (r) { return r.id === pos; })[0];
  assert.strictEqual(row.p, T.games.filter(function (g) { return ctx.tourDone(g) && onList(g).indexOf(pos) >= 0; }).length);
})();

// ---- 3. swap back, and a second swap on the same position ----
(function () {
  var T = fresh(8, 7), pos = T.ids.indexOf("mb");
  play(T, 2); ctx.tourSwap(T, "mb", "x");
  play(T, 2); assert.strictEqual(ctx.tourSwap(T, "x", "mb"), true, "swapped back");
  assert.strictEqual(T.swaps[1].at, 4);
  assert.strictEqual(ctx.tourUid(T, pos, 0), "mb"); assert.strictEqual(ctx.tourUid(T, pos, 2), "x"); assert.strictEqual(ctx.tourUid(T, pos, 3), "x");
  assert.strictEqual(ctx.tourUid(T, pos, 4), "mb"); assert.strictEqual(ctx.tourUid(T, pos), "mb");
  assert.strictEqual(ctx.tourSwap(T, "mb", "y"), true);
  assert.strictEqual(ctx.tourUid(T, pos), "y"); assert.strictEqual(ctx.tourUid(T, pos, 5), "y");
  assert.strictEqual(ctx.tourSwap(T, "ghost", "z"), false, "unknown player");
  assert.strictEqual(ctx.tourSwap(T, "y", "u1"), false, "the new player is already in the tournament");
})();

// ---- 4. a game played out of order before the swap keeps the old player ----
(function () {
  var T = fresh(6, 9), all = ctx.tourAll(T);
  ctx.tourApply(T, all[0], 21, 10); ctx.tourApply(T, all[2], 21, 12);   // game 1 left open
  ctx.tourSwap(T, "mb", "n");
  assert.strictEqual(T.swaps[0].at, 1); assert.strictEqual(J(T.swaps[0].old), "[2]");
  assert.ok(uidsIn(T, 2).indexOf("n") < 0, "the played game 2 keeps the old player");
  assert.ok(uidsIn(T, 1).indexOf("mb") < 0, "the open game 1 has the new player");
})();

// ---- 5. a live game in progress keeps its lineup (keep), the swap starts after it ----
(function () {
  var T = fresh(6, 11);
  play(T, 1);
  var gi = 1, g = ctx.tourAll(T)[gi];
  ctx.tourSwap(T, "mb", "n", [gi]);
  assert.strictEqual(J(T.swaps[0].old), "[1]");
  var a = ctx.tourOn(g).a.map(function (p) { return ctx.tourUid(T, p, gi); }), b = ctx.tourOn(g).b.map(function (p) { return ctx.tourUid(T, p, gi); });
  assert.ok(a.concat(b).indexOf("n") < 0, "live lineup unchanged");
  var ok = ctx.tourLiveApply(T, { gi: gi, a: a, b: b, subs: [] }, 21, 18, a, b, function (i) { return String(i); });
  assert.strictEqual(ok, true, "the live game still saves");
  assert.ok(ctx.tourDone(g));
  ctx.tourAll(T).forEach(function (x, k) { if (k > 1) assert.ok(uidsIn(T, k).indexOf("mb") < 0, "later games use the new player"); });
})();

// ---- 6. stand-in (v238) next to a swap; hurt player swapped ----
(function () {
  var T = fresh(8, 13), pos = T.ids.indexOf("mb");
  var g = ctx.tourAll(T).filter(function (x) { return onList(x).indexOf(pos) >= 0; })[0], gi = ctx.tourAll(T).indexOf(g);
  assert.strictEqual(ctx.tourSub(T, gi, pos, ctx.tourEligible(T, g, pos)[0], "injury", "", true, String), true);
  assert.ok(ctx.tourHurtOf(T, pos), "hurt for the rest");
  assert.ok(ctx.tourAll(T).filter(function (x) { return (x.subs || []).length; }).length > 0);
  assert.strictEqual(ctx.tourSwap(T, "mb", "fit", [], String), true);
  assert.ok(!ctx.tourHurtOf(T, pos), "the new player is not hurt");
  assert.strictEqual(ctx.tourAll(T).filter(function (x) { return !ctx.tourDone(x) && (x.subs || []).length; }).length, 0, "stand-ins of the old player are cleared");
  var g2 = ctx.tourNext(T), gi2 = ctx.tourAll(T).indexOf(g2), on2 = onList(g2);
  assert.strictEqual(ctx.tourSub(T, gi2, on2[0], ctx.tourEligible(T, g2, on2[0])[0], "other", "", false, String), true, "a stand-in after the swap still works");
  play(T, 2);
  assert.ok(ctx.tourMatches({ id: "S", tourney: T }).every(function (m) { return m.teamA.concat(m.teamB).indexOf("mb") < 0 || Number(m.id.split(":")[2]) < T.swaps[0].at; }), "the old player has no game after the swap");
})();

// ---- 7. a tournament without swaps reads as before ----
(function () {
  var T = fresh(6, 2); assert.strictEqual(T.swaps, undefined);
  assert.strictEqual(ctx.tourUid(T, 2, 0), T.ids[2]); assert.strictEqual(ctx.tourUid(T, 2), T.ids[2]);
  assert.strictEqual(J(ctx.tourCurIds(T)), J(T.ids));
})();

// ---- 8. what a player edit means ----
(function () {
  var T = fresh(6, 2), cur = T.ids.slice();
  assert.strictEqual(ctx.tourPlayersChange(T, cur, cur.slice().reverse()).kind, "none");
  var sw = cur.filter(function (u) { return u !== "mb"; }).concat(["new"]), r = ctx.tourPlayersChange(T, cur, sw);
  assert.strictEqual(J([r.kind, r.from, r.to]), J(["swap", "mb", "new"]));
  assert.strictEqual(ctx.tourPlayersChange(T, cur, cur.filter(function (u) { return u !== "mb"; })).kind, "count", "one left");
  assert.strictEqual(ctx.tourPlayersChange(T, cur, cur.concat(["new"])).kind, "count", "one more");
  var two = cur.filter(function (u) { return u !== "mb" && u !== "u1"; }).concat(["a", "b"]);
  assert.strictEqual(ctx.tourPlayersChange(T, cur, two).kind, "count", "two swaps at once");
  assert.strictEqual(ctx.tourPlayersChange(null, ["a", "b"], ["a", "c"]).kind, "swap", "no tournament: the old list is compared");
  // a session edited BEFORE v242 (players changed, tournament not): the next save sees the swap
  var s = sw;
  assert.strictEqual(ctx.tourPlayersChange(T, s, s).kind, "swap", "players already new, tournament still old");
  ctx.tourSwap(T, "mb", "new"); assert.strictEqual(ctx.tourPlayersChange(T, s, s).kind, "none", "after the fix");
})();

// ---- 9. the poll: the old answer moves to the new player ----
(function () {
  var src = fs.readFileSync("js/polls.js", "utf8"), m = src.match(/function pollSwapFields[\s\S]*?\n\}\n/);
  assert.ok(m, "pollSwapFields exists");
  var pc = {}; vm.createContext(pc); vm.runInContext(m[0], pc);
  var DEL = { del: true };
  var poll = { responses: { mb: 0, a: 0, b: 1, n: 1 }, voteLog: { mb: { a: 0, at: 111, by: "mb" } }, responseFor: {} };
  var u = pc.pollSwapFields(poll, "mb", "n", "org", DEL);
  assert.strictEqual(u["responses.n"], 0, "the new player gets the answer, even over an old one");
  assert.strictEqual(u["responses.mb"], DEL);
  assert.strictEqual(u["responseFor.n"], "mb");
  assert.strictEqual(u["voteLog.n"].at, 111, "time kept so the order and notices do not jump");
  assert.strictEqual(u["voteLog.n"]["for"], "mb"); assert.strictEqual(u["voteLog.mb"], DEL);
  var after = Object.assign({}, poll.responses); after.n = u["responses.n"]; delete after.mb;
  assert.strictEqual(Object.keys(after).filter(function (k) { return after[k] === 0; }).length, 2, "the number of Join answers stays");
  var p2 = { responses: { n: 0 }, voteLog: {}, responseFor: { n: "mb" } };
  var u2 = pc.pollSwapFields(p2, "n", "z", "org", DEL);
  assert.strictEqual(u2["responseFor.z"], "mb", "the note keeps the first player"); assert.strictEqual(u2["responseFor.n"], DEL); assert.ok(!("voteLog.z" in u2));
  var u3 = pc.pollSwapFields(p2, "n", "mb", "org", DEL);
  assert.strictEqual(u3["responseFor.mb"], DEL, "back to the first player: no note");
  assert.strictEqual(pc.pollSwapFields({ responses: { a: 0 } }, "mb", "n", "o", DEL), null, "the old player had no answer: nothing to move");
  assert.strictEqual(pc.pollSwapFields({ responses: { mb: 0 } }, "mb", "mb", "o", DEL), null);
})();

// ---- 10. wiring ----
(function () {
  var ses = fs.readFileSync("js/sessions.js", "utf8"), polls = fs.readFileSync("js/polls.js", "utf8"), rules = fs.readFileSync("firestore.rules", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8");
  assert.ok((ses.match(/sessionPlayersGate\(/g) || []).length >= 3, "gate defined + used by the details modal and the session edit");
  assert.ok((ses.match(/sessionWriteEx\(/g) || []).length >= 4 && (ses.match(/sessionAfterPlayers\(/g) || []).length >= 4, "the tournament is written together with the players, the poll follows after the save");
  assert.ok(/askConfirm\(\{ title: t\("tourPlayersTitle"\)[\s\S]*onNo:/.test(ses), "count change asks with the in-app sheet");
  var gate = ses.slice(ses.indexOf("function sessionPlayersGate"), ses.indexOf("function showSessionDetailsModal"));
  assert.ok(!/[^k]confirm\(/.test(gate.replace(/askConfirm\(/g, "")), "no native confirm");
  assert.ok(/_pollForNotes\(np, vu\)/.test(polls), "the poll card shows the note");
  assert.ok(/canIn\('editSession', gidOf\(resource.data\)\) && changed\(\)\.hasOnly\(\['responses', 'voteLog', 'responseFor'\]\)/.test(rules), "rules: session editors move the answer");
  ["pollForTag", "pollSwapFail", "tourSwapDone", "tourPlayersTitle", "tourPlayersBody", "tourPlayersKeep"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
})();
console.log("session-swap OK");
