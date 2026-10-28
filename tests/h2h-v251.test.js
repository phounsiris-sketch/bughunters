/* Run: node tests/h2h-v251.test.js — v251: Head-to-head tab = "Rivals & partners": partner / opposing-pair aggregation, sorting, min games,
   top 3 + See all, period, toughest/easiest split, rows -> All matches filters, removed markup gone, EN + LA strings */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ctx = { console: console, GROUPS_ON: true, currentGroupId: "g", currentUser: { uid: "me" }, localStorage: { getItem: function () { return null; }, setItem: function () {} },
  t: function (k) { return k; }, getUserName: function (u) { return u === "me" ? "Me" : u.toUpperCase(); }, escapeHtml: function (x) { return String(x); }, icon: function (n) { return "<i>" + n + "</i>"; },
  jsq: function (v) { return String(v); }, _todayIso: function () { return "2026-10-28"; }, avatarHtml: function (u) { return "<av " + u + ">"; },
  findUser: function () { return {}; }, memberOf: function () { return null; }, normLevel: function (x) { return x || ""; }, levelBadgeHtml: function () { return ""; },
  byNameAZ: function (a) { return a.slice().sort(); }, fmtDate: function (d) { return d; }, plainUserName: function (u) { return "n"; }, setBreadcrumb: function () {}, showPage: function () {},
  weekdayShort: function () { return "x"; }, monthShort: function () { return "x"; }, document: {}, setTimeout: setTimeout, lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
["js/stats.js", "js/stats-core.js", "js/matches-all.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });

var M = [], n = 0;
function G(a, b, won, date, pa, pb) { M.push({ id: "m" + n, date: date, teamA: a, teamB: b, games: [{ a: pa, b: pb }], createdAt: n++ }); }
var D = "2026-10-2";
// me + p1 vs p2 + p3: 3 wins, 1 loss (21-10 x3, 15-21)
for (var i = 0; i < 3; i++) G(["me", "p1"], ["p2", "p3"], true, D + "0", 21, 10);
G(["me", "p1"], ["p2", "p3"], false, D + "1", 15, 21);
// me + p4 vs p5 + p6: 1 win, 2 losses
G(["me", "p4"], ["p5", "p6"], true, D + "2", 21, 19); G(["p5", "p6"], ["me", "p4"], true, D + "2", 21, 12); G(["me", "p4"], ["p5", "p6"], false, D + "3", 18, 21);
// me + p1 vs p7 + p9: exactly 50% (1-1): neither toughest nor easiest
G(["me", "p1"], ["p7", "p9"], true, D + "2", 21, 20); G(["me", "p1"], ["p7", "p9"], false, D + "3", 20, 21);
// me + p2 vs p8 + p9: 2 wins; me + p3: 1-1 together (p3 vs ...) ; one single game; one lone game with p7 (1 game: under the minimum)
G(["me", "p2"], ["p8", "p9"], true, D + "4", 21, 5); G(["me", "p2"], ["p8", "p9"], true, D + "5", 21, 5);
G(["me", "p3"], ["p4", "p5"], true, D + "4", 21, 15); G(["me", "p3"], ["p4", "p5"], false, D + "5", 15, 21);
G(["me", "p7"], ["p4", "p6"], true, D + "6", 21, 15);
G(["me"], ["p7"], true, D + "5", 21, 15);
// an old game (outside 30 days, inside 1 year) and an undecided one
G(["me", "p8"], ["p4", "p5"], true, "2026-02-01", 21, 15); G(["me", "p8"], ["p4", "p5"], true, "2026-02-02", 21, 15);
G(["p10", "p11"], ["p12", "p13"], true, D + "6", 21, 15);   // one game only: p10 has no row anywhere
M.push({ id: "u", date: D + "6", teamA: ["me", "p1"], teamB: ["p2", "p3"], games: [] });
ctx.lastMatches = M; ctx._statsCache = null;

/* ---- aggregation ---- */
var a = ctx.h2hAggregate("me", "30d");
var J = function (x) { return JSON.parse(JSON.stringify(x)); };
var row = function (r) { return r.k + ":" + r.w + "-" + r.l + ":" + r.pts; };
assert.strictEqual(a.n, 15, "decided games in 30 days (undecided and the old ones left out)");
assert.deepStrictEqual(J(a.partners.map(function (r) { return r.k + ":" + r.w + "-" + r.l; })), ["p2:2-0", "p1:4-2", "p3:1-1", "p4:1-2"], "partners: win rate, then games, min 2 games (p7 has 1 game)");
assert.strictEqual(a.partners.filter(function (r) { return r.k === "p7"; }).length, 0, "1 game together: no row");
assert.deepStrictEqual(J(a.toughest.map(function (r) { return r.k; })), ["p5+p6"].map(function (k) { return k; }), "toughest: win rate under 50%, 2+ games");
assert.deepStrictEqual(J(a.easiest.map(function (r) { return r.k; })), ["p8+p9", "p2+p3"], "easiest: win rate over 50%: 100% first, then 75%");
assert.ok(a.toughest.concat(a.easiest).every(function (r) { return r.k !== "p7+p9"; }), "exactly 50% is in neither list");
a.toughest.forEach(function (t) { assert.ok(!a.easiest.some(function (e) { return e.k === t.k; }), "a pair is never in both lists"); });
var pts = a.partners.filter(function (r) { return r.k === "p2"; })[0].pts;
assert.strictEqual(pts, 16 + 16, "point difference sums the first game: +16 twice");
assert.deepStrictEqual(J(a.singles.map(row)), ["p7:1-0:6"], "singles listed when there are singles games");
// ties: same win rate -> more games first
var t1 = ctx.h2hAggregate("me", "all");
assert.ok(t1.partners.some(function (r) { return r.k === "p8" && r.n === 2; }), "all time includes the old games");
assert.strictEqual(ctx.h2hAggregate("me", "1y").n, 17);
assert.strictEqual(ctx.h2hAggregate("me", "month").n, 15, "this month = from Oct 1");
assert.strictEqual(ctx.h2hAggregate("p9", "30d").singles.length, 0, "no singles games: nothing to show");
assert.strictEqual(ctx.h2hAggregate("nobody", "all").n, 0);

/* ---- markup: top 3, See all, Show less ---- */
ctx.renderStats = function () {};
ctx.maPeriod = "30d"; ctx.h2hUser = null;
var html = ctx._renderH2H();
assert.ok(/h2hBestPartners/.test(html) && /h2hToughest/.test(html) && /h2hEasiest/.test(html) && /h2hSingles/.test(html), "four cards (singles has games)");
var card = function (h, id) { var s = h.indexOf('id="h2h-' + id + '"'); var e = h.indexOf('<div class="card', s + 5); return h.slice(s, e < 0 ? h.length : e); };
var partners = card(html, "partners");
assert.strictEqual((partners.match(/class="rank-row h2h-row"/g) || []).length, 3, "top 3 only");
assert.ok(/seeAllN/.test(partners) && /onclick="h2hToggle\('partners'\)"/.test(partners));
assert.ok(!/seeAllN/.test(card(html, "toughest")), "1 row: no See all");
ctx.h2hToggle("partners");
partners = card(ctx._renderH2H(), "partners");
assert.strictEqual((partners.match(/class="rank-row h2h-row"/g) || []).length, 4, "See all opens the rest in place");
assert.ok(/seeLess/.test(partners) && /aria-expanded="true"/.test(partners));
ctx.h2hToggle("partners");
assert.strictEqual((card(ctx._renderH2H(), "partners").match(/class="rank-row h2h-row"/g) || []).length, 3);
// row text
assert.ok(/<b>2–0<\/b><small>100%<\/small>/.test(partners) && /class="h2h-rec up"/.test(partners) && /h2hPtDiff \+32/.test(partners), "W-L, win %, point diff");
assert.ok(/class="h2h-rec down"/.test(card(html, "toughest")) && /P5 \+ P6/.test(card(html, "toughest")));
assert.ok(/<button type="button" class="rank-row h2h-row"/.test(html), "rows are buttons");

/* ---- period + empty states ---- */
ctx.maPeriod = "month";
assert.ok(/h2hBestPartners/.test(ctx._renderH2H()));
ctx.h2hUser = "p9"; ctx.maPeriod = "30d";
var h9 = ctx._renderH2H();
assert.ok(!/h2hSingles/.test(h9), "no singles card without singles games");
ctx.h2hUser = "p10"; var h6 = ctx._renderH2H();
assert.ok(/h2hEmptyPartners/.test(h6) && /h2hEmptyEasiest/.test(h6), "empty text per card");
ctx.lastMatches = []; ctx._statsCache = null;
assert.ok(/h2hNoGames/.test(ctx._renderH2H()) && !/h2hBestPartners/.test(ctx._renderH2H()), "no games at all");
ctx.lastMatches = M; ctx._statsCache = null;
ctx.h2hSetPeriod("1y"); assert.strictEqual(ctx.maPeriod, "1y", "the period is All matches' period");
ctx.maPeriod = "30d"; ctx.h2hUser = null;

/* ---- rows -> All matches ---- */
var p = ctx.h2hGoParams("partner", "p1");
assert.deepStrictEqual(J(p), { uid: "me", opts: { period: "30d", partner: "p1" } });
assert.deepStrictEqual(J(ctx.h2hGoParams("pair", "p5+p6").opts), { period: "30d", oppPair: "p5+p6" });
assert.deepStrictEqual(J(ctx.h2hGoParams("single", "p7").opts), { period: "30d", opp: "p7", type: "singles" });
ctx.h2hUser = "p2"; assert.strictEqual(ctx.h2hGoParams("partner", "me").uid, "p2", "the viewed player, not me"); ctx.h2hUser = null;
ctx.showPage = function () {};
ctx.h2hGo("pair", "p5+p6");
assert.strictEqual(ctx.maUser, "me"); assert.strictEqual(ctx.maOppPair, "p5+p6"); assert.strictEqual(ctx.maPeriod, "30d"); assert.strictEqual(ctx.maPartner, ""); assert.strictEqual(ctx.maOpp, "");
var all = ctx.maGames("me"), from = ctx.maPeriodFrom("30d");
var fl = ctx.maFilter(all, { from: from, result: "all", type: "all", partner: "", opp: "", oppPair: "p5+p6" });
assert.strictEqual(fl.length, 3, "All matches shows exactly the 3 games against Pair p5+p6");
assert.ok(fl.every(function (g) { return g.them.slice().sort().join("+") === "p5+p6"; }));
assert.strictEqual(ctx.maFilter(all, { from: from, oppPair: "p4+p5" }).length, 2, "not just 'a game that includes p5'");
assert.strictEqual(ctx.maFilter(all, { from: from, opp: "p5" }).length, 5, "the single-opponent filter still matches any game with p5");
ctx.h2hGo("partner", "p1"); assert.strictEqual(ctx.maPartner, "p1"); assert.strictEqual(ctx.maOppPair, "", "reset by the next jump");
assert.strictEqual(ctx.maFilter(all, { from: from, partner: "p1" }).length, 6, "partner filter: 6 decided games with p1");
ctx.h2hGo("single", "p7"); assert.strictEqual(ctx.maType, "singles"); assert.strictEqual(ctx.maOpp, "p7");
assert.strictEqual(ctx.maFilter(all, { from: from, type: "singles", opp: "p7" }).length, 1);
// the opponent select picks a pair back up and drops it when another opponent is chosen
ctx.renderMatchesAll = function () {};
ctx.maSet("opp", "pair:p5+p6"); assert.strictEqual(ctx.maOppPair, "p5+p6"); ctx.maSet("opp", "p4"); assert.strictEqual(ctx.maOppPair, ""); assert.strictEqual(ctx.maOpp, "p4");
ctx.maSet("opp", "pair:p5+p6"); ctx.maSet("user", "p1"); assert.strictEqual(ctx.maOppPair, "", "changing the player clears it");
ctx.maSet("opp", "pair:p5+p6"); ctx.maClear(); assert.strictEqual(ctx.maOppPair, "");

/* ---- removed ---- */
var src = fs.readFileSync("js/stats.js", "utf8");
["_pairVsPairHtml", "_h2hAllHtml", "h2hPairA", "h2hPairB", "h2h-total", "pvpCard", "h2hAll\\b", "_h2hRows"].forEach(function (k) { assert.ok(!new RegExp(k).test(src), k + " is gone from stats.js"); });
assert.ok(!/h2hMine|h2hTheirs/.test(html), "no My record total card");
var css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(!/\.pvp-|\.h2h-total|\.h2h-score/.test(css), "pair-vs-pair and total-card CSS gone");

/* ---- strings (EN and LA) ---- */
var i18n = fs.readFileSync("js/i18n.js", "utf8");
["h2hPtDiff", "seeLess", "h2hPeriod", "h2hNoGames", "h2hBestPartners", "h2hToughest", "h2hEasiest", "h2hSingles", "h2hEmptyPartners", "h2hEmptyToughest", "h2hEmptyEasiest", "h2hNone", "headToHead"].forEach(function (k) {
  assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN and LA");
});
["h2hPairVsPair", "pvpNoOpponent", "pvpNeverMet", "h2hTheirs", "h2hWithPartners", "h2hMine", "h2hVsPairs", "h2hWithPartner", "h2hVsSingles", "allPairs", "ptsShort"].forEach(function (k) {
  assert.ok(!new RegExp("^\\s+" + k + ":", "m").test(i18n), k + " removed");
});
console.log("h2h-v251 OK");
