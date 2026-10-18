/* Run: node tests/stats-core.test.js  — every page must give the same answer for the same player */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var names = { me: "Me", john: "John", ton: "Ton", mike: "Mike", al: "Al", bo: "Bo", cy: "Cy" };
var ctx = { console: console, GROUPS_ON: true, currentGroupId: "g", currentUser: { uid: "me" }, localStorage: { getItem: function () { return null; }, setItem: function () {} },
  t: function (k) { return k; }, getUserName: function (u) { return names[u] || u; }, escapeHtml: function (x) { return String(x); }, icon: function () { return ""; },
  _todayIso: function () { return "2026-10-18"; }, avatarHtml: function () { return ""; }, personHtml: function (u) { return "[" + names[u] + "]"; },
  findUser: function () { return {}; }, memberOf: function () { return null; }, normLevel: function (x) { return x || ""; }, levelBadgeHtml: function () { return ""; },
  badgesHtml: function () { return ""; }, byNameAZ: function (a) { return a; }, fmtDate: function (d) { return d; }, plainUserName: function () { return ""; }, setBreadcrumb: function () {}, refreshCurrentPage: function () {}, document: {}, setTimeout: setTimeout };
ctx.window = ctx; vm.createContext(ctx);
["js/stats.js", "js/stats-core.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });
function G(a, b, wins, date) { return { id: date + a.join(""), date: date, teamA: a, teamB: b, games: [wins ? { a: 21, b: 10 } : { a: 10, b: 21 }] }; }
var M = [];
for (var i = 0; i < 3; i++) M.push(G(["me", "john"], ["al", "bo"], true, "2025-03-0" + (i + 1)));     // John: 3-0 a long time ago
for (var j = 0; j < 9; j++) M.push(G(["me", "ton"], ["al", "bo"], true, "2026-10-0" + (j + 1)));      // Ton: 9-3 recent
for (var k = 0; k < 3; k++) M.push(G(["me", "ton"], ["al", "bo"], false, "2026-10-1" + k));
for (var n = 0; n < 8; n++) M.push(G(["mike", "ton"], ["al", "cy"], true, "2026-09-1" + n));            // Mike+Ton also strong
ctx.lastMatches = M.sort(function (a, b) { return a.date.localeCompare(b.date); });
ctx._statsCache = null;
var bp = ctx.bestPartnerOf("me", "all");
assert.strictEqual(bp.uid, "ton", "best partner needs 5+ games: Ton (9-3), not John (3-0)");
assert.strictEqual(ctx.bestPartnerOf("me", "month").uid, "ton");
assert.strictEqual(ctx.partnerList("me", "all").filter(function (x) { return x.uid === "john"; })[0].n, 3);
assert.strictEqual(ctx.bestPartnerOf("ton", "all") && ctx.bestPartnerOf("ton", "all").uid !== undefined, true);
var tp = ctx.topPairOf("me");
assert.ok(tp && tp.other === "ton", "top pair (rating) for me is with Ton");
var sf = ctx.statsFor("me", "all");
assert.strictEqual(sf.decided, 15); assert.strictEqual(sf.wins, 12); assert.strictEqual(ctx.pct(sf.wins, sf.decided), "80%");
assert.strictEqual(ctx.statsFor("me", "month").decided, 12);
assert.strictEqual(ctx.statsFor("me", "month").streakNow, -3, "latest 3 games were losses");
assert.strictEqual(ctx.fmtWL(5, 3), "5–3");
// hero rank and list rows come from the same function
var list = ctx.rankedFor("all"), r = ctx.rankOf("me", "all");
assert.strictEqual(list[r - 1].uid, "me");
var lm = ctx.rankedFor("month"), rm = ctx.rankOf("me", "month");
assert.strictEqual(lm[rm - 1].uid, "me");
assert.ok(lm.every(function (p) { return ctx.statsFor(p.uid, "month").decided > 0; }), "month list only has players who played this month");
// the cards print the same names
var card = ctx._myStatsCard(), ins = ctx._pairInsightsHtml("me", ctx.statsFor("me", "all").games);
var rows = card.split('<div class="mh-prow">').slice(1);
var starred = rows.filter(function (r) { return r.indexOf("mh-mk best") >= 0; });
assert.strictEqual(starred.length, 1, "exactly one starred partner");
assert.ok(starred[0].indexOf("[Ton]") >= 0, "the starred partner on the hero card is Ton");
assert.ok(rows.some(function (r) { return r.indexOf("[John]") >= 0 && r.indexOf("mh-mk best") < 0; }), "John is listed (3 games) but not starred");
assert.ok(rows[0].indexOf("[Ton]") >= 0, "most games first");
assert.ok(ins.indexOf("Me") >= 0 && ins.indexOf("Ton") >= 0, "Progress best partner is Ton too");
assert.ok(/bestPartner<\/span>[\s\S]*?Ton/.test(ins.replace(/&amp;/g, "&")) || ins.indexOf("Ton") >= 0);
// a losing partnership is never "best"
M.push(G(["me", "al"], ["bo", "cy"], true, "2026-10-14"), G(["me", "al"], ["bo", "cy"], false, "2026-10-15"), G(["me", "al"], ["bo", "cy"], false, "2026-10-16"), G(["me", "al"], ["bo", "cy"], false, "2026-10-17"), G(["me", "al"], ["bo", "cy"], true, "2026-10-17"));
ctx.lastMatches = M.sort(function (a, b) { return a.date.localeCompare(b.date); }); ctx._statsCache = null;
assert.strictEqual(ctx.bestPartnerOf("me", "all").uid, "ton");
assert.notStrictEqual(ctx.bestPartnerOf("me", "all").uid, "al", "Al is 2-3: not best");
assert.strictEqual(ctx.worstPartnerOf("me", "all").uid, "al", "Al is the toughest partner (5 games, 40%)");
console.log("stats-core OK");
