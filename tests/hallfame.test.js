/* Run: node tests/hallfame.test.js — the winner card and the Hall of Fame (v229): records, kept after deletion, rules, fallback when the write is refused */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var store = {};
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
var names = {}; for (var q = 0; q < 8; q++) names["u" + q] = "Player" + q;
var writes = [], deletes = [], failSet = false, asked = [];
var fsdb = { collection: function () { return { doc: function () { return { collection: function () { return {
  doc: function (id) { return { set: function (rec) { if (failSet) return Promise.reject({ code: "permission-denied" }); writes.push([id, rec]); return Promise.resolve(); }, delete: function () { deletes.push(id); return Promise.resolve(); } }; },
  onSnapshot: function () { return function () {}; } }; } }; } }; } };
var ctx = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, Object: Object, Array: Array, Promise: Promise, String: String,
  t: function (k) { return k; }, plainUserName: function (u) { return u.displayName; }, findUser: function (u) { return names[u] ? { displayName: names[u] } : null; },
  avatarHtml: function () { return ""; }, escapeHtml: function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }, fmtDate: function (d) { return d; }, jsq: function (x) { return x; }, icon: function () { return ""; },
  currentUser: { uid: "u0" }, GROUPS_ON: true, currentGroupId: "g1", currentGroup: { name: "Club" }, lastSessions: [], currentPage: "stats", isGroupAdminMe: function () { return false; },
  localStorage: { getItem: function (k) { return store[k] === undefined ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); } },
  askYes: function (a, cb, o) { asked.push([a, o]); }, showToast: function () {}, fsdb: fsdb, _scLoadAvatar: function () { return Promise.resolve(null); } };
ctx.window = ctx; vm.createContext(ctx);
["js/tournament.js", "js/sharecard.js", "js/hallfame.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });
var uids = function (n) { var a = []; for (var i = 0; i < n; i++) a.push("u" + i); return a; };
function nameOf(u) { return names[u] || u; }
function finished(n, seed, fin) {
  var T = ctx.tourNew(uids(n), seeded(seed)); T.games.forEach(function (g, i) { ctx.tourApply(T, g, 21, 8 + (i % 9)); }); ctx.tourDraw(T, seeded(seed + 7));
  var guard = 0; while (ctx.tourNext(T) && guard++ < 30) { var g = ctx.tourNext(T); ctx.tourApply(T, g, (fin && fin(g)) ? 15 : 21, (fin && fin(g)) ? 21 : 14); }
  return T;
}
var S = function (id, T, date) { return { id: id, date: date || "2026-10-24", groupId: "g1", createdAt: 1000, tourney: T }; };

// ---- 1. a record of a finished tournament ----
var T8 = finished(8, 3), s8 = S("S1", T8), r8 = ctx.hofRecord(s8, "g1", nameOf, "u0");
assert.ok(r8, "a finished tournament has a record"); assert.strictEqual(r8.sid, "S1"); assert.strictEqual(r8.n, 8); assert.strictEqual(r8.gid, "g1"); assert.strictEqual(r8.createdBy, "u0");
assert.strictEqual(r8.champion.uids.length, 2); assert.strictEqual(r8.champion.names.length, 2); assert.ok(r8.runnerUp && r8.third);
assert.ok(/^2–[01]$/.test(r8.finalScore), "final score from the champion's side: " + r8.finalScore); assert.ok(r8.finalGames.length >= 2 && r8.finalGames.length <= 3);
var o8 = ctx.tourOrder(T8), P8 = ctx.tourPairs(T8);
assert.deepStrictEqual(JSON.stringify(r8.champion.uids), JSON.stringify([T8.ids[P8[o8[0]].m[0]], T8.ids[P8[o8[0]].m[1]]]), "champion = first of the final order");
assert.ok(!("__P" in T8), "the engine object is left clean");
// not finished, no tournament, old v48 value: no record
var half = ctx.tourNew(uids(8), seeded(5)); assert.strictEqual(ctx.hofRecord(S("H", half), "g1", nameOf, "u0"), null);
assert.strictEqual(ctx.hofRecord({ id: "o", tournament: { pairs: [["a", "b"]], at: 1, by: "a" } }, "g1", nameOf, "u0"), null, "the old round robin value is ignored");
assert.strictEqual(ctx.hofRecord({ id: "x" }, "g1", nameOf, "u0"), null);
// the final series ending 2-1
var T21 = finished(8, 9, function (g) { return g.fin && g.lab === "F2"; });
var r21 = ctx.hofRecord(S("S2", T21), "g1", nameOf, "u0"); assert.ok(r21.finalScore === "2–1" && r21.finalGames.length === 3, "2-1 final: " + JSON.stringify(r21.finalGames));
// 6 players: round robin
var T6 = finished(6, 4), r6 = ctx.hofRecord(S("S3", T6), "g1", nameOf, "u0"); assert.ok(r6 && r6.n === 6 && /^\d–\d$/.test(r6.finalScore), "round robin record");
// a pair that was out is written, the champion is still the pair left
var TO = ctx.tourNew(uids(8), seeded(11)); TO.games.forEach(function (g, i) { ctx.tourApply(TO, g, 21, 9 + i); }); ctx.tourDraw(TO, seeded(2));
var outP = TO.po[0].pa; ctx.tourMarkOut(TO, outP, "injury", "knee"); var guard = 0; while (ctx.tourNext(TO) && guard++ < 20) ctx.tourApply(TO, ctx.tourNext(TO), 21, 10);
var rO = ctx.hofRecord(S("S4", TO), "g1", nameOf, "u0"); assert.ok(rO && rO.outs.length === 1 && rO.outs[0].why === "injury" && rO.outs[0].uids.length === 2, "the out pair is recorded: " + JSON.stringify(rO.outs));
// everybody out but one: still a champion; nobody left: none
var TV = ctx.tourNew(uids(8), seeded(13)); TV.games.forEach(function (g, i) { ctx.tourApply(TV, g, 21, 9 + i); }); ctx.tourDraw(TV, seeded(2));
assert.strictEqual(ctx.hofRecord(S("V", TV), "g1", nameOf, "u0"), null, "unfinished tournament: nothing to keep");

// ---- 2. a record read from the database is made safe ----
var dirty = { sid: "X".repeat(200), gid: "g", date: "2026-10-24-and-more", n: 99, champion: { uids: ["a", "b", "c", "d"], names: ["<b>x</b>".repeat(30), "y", "z"] }, runnerUp: "nope", third: { uids: [], names: [] }, finalScore: "123456789012", finalGames: [1, 2, 3, 4, 5], outs: [{ uids: ["a", "b", "c"], why: "a-very-long-reason-word" }, null], createdAt: "now" };
var clean = ctx.hofClean(dirty);
assert.ok(clean.sid.length === 80 && clean.date.length === 10 && clean.n === 8 && clean.champion.uids.length === 2 && clean.champion.names.length === 2 && clean.champion.names[0].length === 60, "cut to size");
assert.strictEqual(clean.runnerUp, null); assert.strictEqual(clean.third, null); assert.strictEqual(clean.finalScore.length, 8); assert.strictEqual(clean.finalGames.length, 3); assert.strictEqual(clean.outs[0].uids.length, 2); assert.strictEqual(clean.createdAt, 0);
assert.strictEqual(ctx.hofClean({ champion: {} }), null); assert.strictEqual(ctx.hofClean(null), null); assert.strictEqual(ctx.hofClean("x"), null);

// ---- 3. merge: saved first, then this phone, then sessions; one per session; kept without the session ----
var recA = ctx.hofClean(r8), recB = ctx.hofClean(r21), recC = ctx.hofClean(r6);
var m1 = ctx.hofMerge([recA], [], [recA, recB]);
assert.strictEqual(m1.list.length, 2, "one record per session"); assert.strictEqual(m1.list.filter(function (r) { return r.sid === "S1"; })[0].src, "stored"); assert.strictEqual(m1.unsaved, 1, "the one only in the sessions is not saved yet");
var m2 = ctx.hofMerge([recA, recB], [], []);   // the sessions are deleted: the Hall of Fame keeps both
assert.strictEqual(m2.list.length, 2, "deleting sessions does not delete champions"); assert.strictEqual(m2.unsaved, 0);
var m3 = ctx.hofMerge([], [recC], []); assert.strictEqual(m3.list.length, 1); assert.strictEqual(m3.unsaved, 1, "kept on this phone counts as not saved yet");
var m4 = ctx.hofMerge([recA, { sid: "bad" }], [], []); assert.strictEqual(m4.list.length, 1, "a record without a champion is dropped");
assert.ok(m1.list[0].date >= m1.list[m1.list.length - 1].date, "newest first");

// ---- 4. aggregate ----
function rec(sid, date, champ, run, third) { return ctx.hofClean({ sid: sid, date: date, n: 8, champion: { uids: champ, names: champ }, runnerUp: run ? { uids: run, names: run } : null, third: third ? { uids: third, names: third } : null, finalScore: "2–0", finalGames: [], outs: [] }); }
var L = [rec("a", "2026-10-01", ["u1", "u2"], ["u3", "u4"], ["u5", "u6"]), rec("b", "2026-10-08", ["u2", "u1"], ["u3", "u4"]), rec("c", "2026-10-15", ["u1", "u3"], ["u2", "u4"]), rec("d", "2026-10-22", ["u1", "u2"], ["u5", "u6"])];
var A = ctx.hofAggregate(L);
assert.strictEqual(A.count, 4); assert.strictEqual(A.teams[0].titles, 3, "u1+u2 won 3 (pair order does not matter)"); assert.strictEqual(A.teams[0].last, "2026-10-22"); assert.strictEqual(A.teams[1].titles, 1);
var pl = {}; A.players.forEach(function (p) { pl[p.uid] = p; });
assert.strictEqual(pl.u1.titles, 4); assert.strictEqual(pl.u2.titles, 3); assert.strictEqual(pl.u3.titles, 1); assert.strictEqual(pl.u3.runnerUps, 2); assert.strictEqual(pl.u4.runnerUps, 3); assert.strictEqual(pl.u4.titles, 0);
assert.strictEqual(A.players[0].uid, "u1", "most titles first");
assert.ok(A.teams.every(function (x) { return x.titles > 0; }), "only teams that won are listed as champions");
assert.strictEqual(ctx.hofAggregate([]).teams.length, 0);

// ---- 5. saving: written once, kept on this phone when the database refuses, dropped when it works ----
ctx.lastSessions = [s8]; ctx._hofSaved = {};
ctx.hofSave(s8); assert.strictEqual(writes.length, 1, "written"); assert.strictEqual(writes[0][0], "S1"); assert.strictEqual(writes[0][1].sid, "S1");
ctx.hofSave(s8); assert.strictEqual(writes.length, 1, "the same result is not written twice");
failSet = true; writes.length = 0; ctx._hofSaved = {};
ctx.hofSave(s8);
setTimeout(function () {
  assert.strictEqual(ctx.hofLocalGet("g1").length, 1, "refused write: the record is kept on this phone"); assert.strictEqual(ctx._hofDenied, true);
  ctx.lastSessions = [];   // the session is deleted before the rules are updated
  var m = ctx.hofRecords(); assert.strictEqual(m.list.length, 1, "still listed from this phone"); assert.strictEqual(m.unsaved, 1);
  var html = ctx.hofHtml(); assert.ok(/hofLocalNote/.test(html), "a quiet note says it is not saved for everyone yet"); assert.ok(/openShareCard\(/.test(html));
  failSet = false; ctx._hofSaved = {}; ctx.lastSessions = [s8];
  ctx.hofSave(s8);
  setTimeout(function () {
    assert.strictEqual(ctx.hofLocalGet("g1").length, 0, "saved: the phone copy is dropped");
    // the page
    ctx._hofStored = [recA, recB]; ctx.lastSessions = []; ctx.currentUser = { uid: "u5" };
    var page = ctx.hofHtml();
    assert.ok(/hofTeams/.test(page) && /hofPlayers/.test(page) && /hofList/.test(page) && !/undefined|NaN/.test(page), "page shows teams, players and the list");
    assert.ok(!/hofRemove\(/.test(page), "a member who did not save it cannot remove it");
    ctx.currentUser = { uid: "u0" };
    assert.ok(/hofRemove\(/.test(ctx.hofHtml()), "the organiser who saved it can remove it");
    ctx.hofRemove("S1"); assert.ok(asked.length === 1 && asked[0][1].kind === "danger", "removing asks first (danger)");
    ctx._hofStored = []; ctx.lastSessions = [];
    assert.ok(/hof-empty/.test(ctx.hofHtml()), "empty state");
    // an old v48 session never shows up
    ctx.lastSessions = [{ id: "o", date: "2026-01-01", tournament: { pairs: [["a", "b"]], at: 1, by: "a" } }]; assert.strictEqual(ctx.hofRecords().list.length, 0);

    // ---- 6. the winner card draws without error, with and without photos, in both shapes ----
    function fakeCanvas() {
      var calls = 0, grad = { addColorStop: function () {} };
      var c = new Proxy({}, { get: function (o, k) {
        if (k === "measureText") return function (s) { return { width: String(s).length * 12 }; };
        if (k === "createLinearGradient" || k === "createRadialGradient") return function () { return grad; };
        if (k === "drawImage") return function () { calls++; };
        return o[k] || function () {};
      }, set: function (o, k, v) { o[k] = v; return true; } });
      return { getContext: function () { return c; }, width: 0, height: 0 };
    }
    var d = { rec: recA, group: "Club", date: "2026-10-24" };
    ["story", "square"].forEach(function (fmt) { ["default", "halloween"].forEach(function (id) { var cv = fakeCanvas(); assert.doesNotThrow(function () { ctx.drawTournamentCard(cv, d, id, fmt); }); assert.strictEqual(cv.height, fmt === "square" ? 1350 : 1920); }); });
    var withOut = { rec: Object.assign({}, recA, { outs: [{ uids: ["u1", "u2"], why: "injury" }] }), group: "", date: "x" };
    assert.doesNotThrow(function () { ctx.drawTournamentCard(fakeCanvas(), withOut, "default", "story"); });
    assert.doesNotThrow(function () { ctx.drawTournamentCard(fakeCanvas(), { rec: Object.assign({}, recA, { runnerUp: null, third: null, finalScore: "" }), group: "", date: "" }, "default", "square"); }, "a card with no runner-up still draws");

    // ---- 7. wiring ----
    var rules = fs.readFileSync("firestore.rules", "utf8"), st = fs.readFileSync("js/stats.js", "utf8"), sc = fs.readFileSync("js/sharecard.js", "utf8"), tn = fs.readFileSync("js/tournament.js", "utf8");
    var hf = fs.readFileSync("js/hallfame.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), sw = fs.readFileSync("sw.js", "utf8"), html = fs.readFileSync("index.html", "utf8"), app = fs.readFileSync("js/app.js", "utf8");
    assert.ok(/match \/hallOfFame\/\{sid\}/.test(rules) && /function hofOk\(d\)/.test(rules), "rules for groups/{gid}/hallOfFame");
    var block = rules.split("match /hallOfFame/{sid} {")[1].split("// Names of groups")[0];
    assert.ok(/allow read: if isSuper\(\) \|\| isMember\(gid\)/.test(block) && /allow create:[^;]*isMember\(gid\)[^;]*hofOk\(/.test(block), "members read and create, with the shape check");
    assert.ok(/allow delete: if isSuper\(\) \|\| isGroupAdmin\(gid\) \|\| canIn\('editSession', gid\)/.test(block) && /createdBy/.test(block), "delete: admins, session editors, or the organiser who saved it");
    assert.ok(!/allow (update|create|delete)[^;]*\bif true\b/.test(block), "no open write");
    assert.ok(/\["hof", "hofTab", "trophy"\]/.test(st) && /hofHtml\(\)/.test(st) && /hofStop\(\)/.test(st), "Rankings has a Hall of fame tab; it stops with the group");
    assert.ok(/mode === "tournament"/.test(sc) && /drawTournamentCard\(cv/.test(sc) && /loadTournamentAvatars/.test(sc), "the share sheet has a tournament mode");
    assert.ok(/hofSave\(s\)/.test(tn) && /data-act="share"/.test(tn) && /hofShareBtn/.test(tn), "finishing saves the winners; the podium has a share button");
    assert.ok(!/dbOnError/.test(hf), "a refused hall of fame read or write never shows the red error bar");
    assert.ok(/askYes\(t\("hofRemoveTitle"\)/.test(hf), "remove asks first");
    assert.ok(!/\b(confirm|prompt|alert)\s*\(/.test(hf.replace(/askYes|askConfirm/g, "")) && !/\beval\s*\(|new Function/.test(hf), "no native dialogs, no eval");
    assert.ok(!/\.tournament\b/.test(hf), "reads the session field through tourOf only");
    assert.ok(sw.indexOf("'./js/hallfame.js'") > 0 && html.indexOf('src="js/hallfame.js"') > 0, "script loaded and precached");
    assert.ok(app.match(/APP_VERSION = "(v\d+)"/)[1] === sw.match(/godsmash-(v\d+)/)[1], "version bumped together");
    ["hofTab", "hofEmpty", "hofTeams", "hofPlayers", "hofList", "hofTitles", "hofRunnerUps", "hofLastWin", "hofSize8", "hofSize6", "hofShare", "hofShareBtn", "hofShareTitle", "hofChampions", "hofFinalLine", "hofRoundRobin", "hofRemoveTitle", "hofRemoveBody", "hofLocalNote"].forEach(function (k) {
      assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + Lao");
    });
    assert.ok(/escapeHtml\(_hofName/.test(hf) && !/innerHTML[^;\n]*\+\s*r\.champion/.test(hf), "names are escaped");
    console.log("hallfame OK");
  }, 20);
}, 20);
