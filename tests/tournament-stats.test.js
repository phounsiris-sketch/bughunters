/* Run: node tests/tournament-stats.test.js — tournament games count in Rankings, Elo and personal stats (v228) */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var names = {};
var ctx = { console: console, GROUPS_ON: true, currentGroupId: "g", currentUser: { uid: "u0" }, localStorage: { getItem: function () { return null; }, setItem: function () {} },
  t: function (k) { return k; }, getUserName: function (u) { return names[u] || u; }, escapeHtml: function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;"); },
  _todayIso: function () { return "2026-10-24"; }, avatarHtml: function () { return ""; }, personHtml: function (u) { return "[" + u + "]"; }, teamHtml: function (a) { return a.join("+"); }, _teamName: function () { return "?"; },
  icon: function () { return ""; }, jsq: function (x) { return x; }, isGroupAdminMe: function () { return true; }, findUser: function () { return {}; }, memberOf: function () { return null; },
  normLevel: function (x) { return x || ""; }, levelBadgeHtml: function () { return ""; }, badgesHtml: function () { return ""; }, byNameAZ: function (a) { return a; }, fmtDate: function (d) { return d; },
  plainUserName: function () { return ""; }, setBreadcrumb: function () {}, refreshCurrentPage: function () {}, currentPage: "stats", lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
["js/stats.js", "js/stats-core.js", "js/tournament.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
var ids = []; for (var i = 0; i < 8; i++) ids.push("u" + i);

var T = ctx.tourNew(ids, seeded(3));
T.games.forEach(function (g, k) { ctx.tourApply(T, g, 21, 8 + k); });
var sess = { id: "S1", date: "2026-10-24", groupId: "g", createdAt: 1000, players: ids, tourney: T };
ctx.lastSessions = [sess]; ctx._matchesReal = [];
ctx.rebuildMatches();
assert.strictEqual(ctx.lastMatches.length, 6, "6 rotation games are 6 stats games");
var st = ctx.computeStats();
ids.forEach(function (u) { assert.strictEqual(st.players[u].played, 3, u + " played 3 games"); });
assert.ok(ids.every(function (u) { return st.players[u].played === st.players[u].wins + st.players[u].losses; }));
var winners = {}; ctx.lastMatches.forEach(function (m) { m.teamA.forEach(function (u) { winners[u] = 1; }); });
assert.ok(ids.some(function (u) { return st.players[u].rating > 1500; }) && ids.some(function (u) { return st.players[u].rating < 1500; }), "ratings moved");
assert.strictEqual(ctx.statsFor("u0", "all").played >= 0, true);
assert.ok(ctx.rankedFor("all").length >= 0);

// a game typed in by hand for the same tournament game counts once
var first = ctx.lastMatches[0];
ctx._matchesReal = [{ id: "m1", sessionId: "S1", date: "2026-10-24", teamA: first.teamA, teamB: first.teamB, games: [{ a: first.games[0].a, b: first.games[0].b }], createdBy: "u0", createdAt: 5 }];
ctx.rebuildMatches();
assert.strictEqual(ctx.lastMatches.length, 6, "no double count");
assert.strictEqual(ctx.computeStats().players[first.teamA[0]].played, 3);

// walkovers do not count; real playoff games do
ctx._matchesReal = [];
ctx.tourDraw(T, seeded(9));
var out = T.po[0].pa; ctx.tourMarkOut(T, out, "injury", "");
ctx.tourApply(T, T.po[1], 21, 12);
ctx.tourApply(T, ctx.tourFinals(T)[0], 21, 17);
ctx.tourApply(T, ctx.tourFinals(T)[1], 21, 19);
ctx.rebuildMatches();
var real = 6 + T.po.filter(function (g) { return !g.wo && !g.v; }).length;
assert.strictEqual(ctx.lastMatches.length, real, "rotation + real playoff games only (" + real + ")");
assert.ok(ctx.lastMatches.every(function (m) { return m.games[0].a !== 0 || m.games[0].b !== 0; }), "no 21-0 walkover in the stats");
assert.ok(T.po.some(function (g) { return g.wo; }), "the scenario did give a walkover");
var tour = ctx.lastMatches.filter(function (m) { return m.tid; });
assert.ok(tour.length === real && tour.every(function (m) { return m.tid === "S1" && m.confirmed; }));

// the match list: badge, no edit or delete
var html = ctx.matchRowHtml(tour[0], 1);
assert.ok(/tn-badge/.test(html) && !/deleteMatch|editGame/.test(html), "tournament game: badge, read-only");
var normal = ctx.matchRowHtml({ id: "m9", teamA: ["u0", "u1"], teamB: ["u2", "u3"], games: [{ a: 21, b: 1 }], createdBy: "u0", createdAt: 5, type: "md" }, 1);
assert.ok(/deleteMatch/.test(normal) && !/tn-badge/.test(normal), "a normal match keeps its buttons");

// one truth: every page reads lastMatches
var core = fs.readFileSync("js/stats-core.js", "utf8");
assert.ok(!/_matchesReal/.test(core), "stats-core reads only lastMatches");

// sessions changed -> rebuild (and nothing when the tournaments did not change)
ctx.lastSessions = [{ id: "S2", date: "2026-10-25", groupId: "g", createdAt: 2000, tourney: ctx.tourNew(ids, seeded(4)) }];
ctx.tourSessionsChanged(); assert.strictEqual(ctx.lastMatches.length, 0, "a new tournament with no scores adds no games");
var s3 = ctx.lastSessions[0]; ctx.tourApply(s3.tourney, s3.tourney.games[0], 21, 5);
ctx.tourSessionsChanged(); assert.strictEqual(ctx.lastMatches.length, 1, "a played game shows up straight away");
var before = ctx.lastMatches; ctx.tourSessionsChanged(); assert.strictEqual(ctx.lastMatches, before, "unchanged tournaments: no rebuild");
// an old v48 round-robin session (field "tournament" = {pairs, at, by}) or half-saved data never reaches the stats
ctx.lastSessions = [{ id: "O1", date: "2026-01-01", players: ["a", "b"], tournament: { pairs: [["a", "b"]], at: 1, by: "a" } }, { id: "O2", date: "2026-01-02", tourney: { v: 1, n: 8 } }, { id: "O3", date: "2026-01-03", tourney: "oops" }];
assert.doesNotThrow(function () { ctx.tourSessionsChanged(); }, "bad session data cannot break the stats");
assert.strictEqual(ctx.lastMatches.length, 0);
assert.strictEqual(ctx.tourMatches(ctx.lastSessions[0], "g").length, 0);
assert.ok(/tourOf\(s\)/.test(fs.readFileSync("js/tournament.js", "utf8").split("function tourMatches")[1].slice(0, 200)), "tourMatches reads through tourOf");
console.log("tournament stats OK");
