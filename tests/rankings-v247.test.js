/* Run: node tests/rankings-v247.test.js — v247: Rankings top 3 + last 3, one change marker, faded provisional rows,
   badges button + sheet, "All my matches" (grouping, filters, rating change), wiring and EN + LA strings */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ids = ["me", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
var ctx = { console: console, GROUPS_ON: true, currentGroupId: "g", currentUser: { uid: "me" }, localStorage: { getItem: function () { return null; }, setItem: function () {} },
  t: function (k) { return k; }, getUserName: function (u) { return u === "me" ? "Me" : u.toUpperCase(); }, escapeHtml: function (x) { return String(x); }, icon: function (n) { return "<i>" + n + "</i>"; },
  jsq: function (v) { return String(v).replace(/[^A-Za-z0-9_\-]/g, ""); },
  _todayIso: function () { return "2026-10-28"; }, avatarHtml: function () { return ""; }, personHtml: function (u) { return u; },
  findUser: function () { return {}; }, memberOf: function () { return null; }, normLevel: function (x) { return x || ""; }, levelBadgeHtml: function () { return ""; },
  byNameAZ: function (a) { return a.slice().sort(); }, fmtDate: function (d) { return d; }, plainUserName: function () { return "x"; }, setBreadcrumb: function () {}, refreshCurrentPage: function () {},
  weekdayShort: function (d) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]; }, monthShort: function (m) { return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]; },
  document: {}, setTimeout: setTimeout, lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
["js/stats.js", "js/stats-core.js", "js/matches-all.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });

/* ---- top 3 + last 3 slicing ---- */
var sl = function (n, me) { return ctx.rankSliceIdx(n, me).map(function (x) { return x.gap ? "g" + x.gap : String(x.i); }).join(","); };
assert.strictEqual(sl(7, 3), "0,1,2,3,4,5,6", "7 rows or fewer: shown in full");
assert.strictEqual(sl(0, -1), "");
assert.strictEqual(sl(8, -1), "0,1,2,g2,5,6,7", "8 rows: top 3, gap, last 3");
assert.strictEqual(sl(24, 0), "0,1,2,g18,21,22,23", "me in the top 3: nothing extra");
assert.strictEqual(sl(24, 23), "0,1,2,g18,21,22,23", "me in the last 3: nothing extra");
assert.strictEqual(sl(24, 10), "0,1,2,g7,10,g10,21,22,23", "me in the hidden middle: shown inside the gap with my own index");
assert.strictEqual(sl(24, 3), "0,1,2,3,g17,21,22,23", "me right after the top 3: no gap before");
assert.strictEqual(sl(24, 20), "0,1,2,g17,20,21,22,23", "me right before the last 3: no gap after");
assert.strictEqual(sl(24, -1).split(",").length, 7);

/* ---- fake games: 10 players, many pairs; I play a lot ---- */
var M = [], n = 0;
function G(a, b, wa, date, sid, extra) { var m = { id: "m" + (n++), date: date, sessionId: sid, teamA: a, teamB: b, games: wa ? [{ a: 21, b: 15 }] : [{ a: 15, b: 21 }], createdAt: n }; if (extra) for (var k in extra) m[k] = extra[k]; return m; }
for (var i = 0; i < 9; i++) for (var j = i + 1; j < 10 && j < i + 3; j++) M.push(G([ids[i], ids[j]], [ids[(i + 4) % 10], ids[(j + 4) % 10]], (i + j) % 3 !== 0, "2026-09-" + ("0" + (i + 1)).slice(-2)));
// my games across days and sessions
M.push(G(["me", "p1"], ["p2", "p3"], true, "2026-10-24", "s1"), G(["me", "p4"], ["p2", "p3"], false, "2026-10-24", "s1"), G(["me", "p1"], ["p5", "p6"], true, "2026-10-24", "s1", { tid: "s1", tstage: "rot" }),
  G(["p2", "p3"], ["me", "p1"], true, "2026-10-24"), G(["me", "p1"], ["p2", "p3"], true, "2026-10-21", "s2"), G(["me"], ["p7"], true, "2026-10-21", "s2", {}));
M[M.length - 1].games = [{ a: 21, b: 18 }, { a: 18, b: 21 }, { a: 21, b: 19 }];
M.push({ id: "undecided", date: "2026-10-22", teamA: ["me", "p1"], teamB: ["p2", "p3"], games: [] });
ctx.lastMatches = M.sort(function (a, b) { return a.date.localeCompare(b.date) || a.createdAt - b.createdAt; });
ctx.lastSessions = [{ id: "s1", courtName: "Sport Center", time: "19:00", duration: 2 }, { id: "s2", courtName: "Dongdok", time: "18:00", duration: 1.5 }];
ctx._statsCache = null;

/* ---- Ranking tab markup ---- */
var html = ctx._renderRanking();
assert.ok(!/NEW|newTag|rk-chg/.test(html), "no NEW tag and no rank arrow on the rows");
assert.ok(!/prov-tag|provisionalN/.test(html.replace(/<div class="card my-hero">[\s\S]*?<div class="mh-scope">/, "")), "no n/min chip on the rows");
assert.ok(/class="rank-row[^"]* prov"/.test(html), "a row with few games is faded");
assert.ok(/provFadedNote/.test(html), "one note under a list with faded rows");
assert.ok(!/groupTopPair/.test(html), "the Top pair row is gone");
assert.ok(!/badges-card|badge-grid/.test(html), "the badges card is gone from the Ranking tab");
assert.ok(/class="how-btn badge-btn"/.test(html) && /openBadgesSheet\(\)/.test(html), "the badge button is in the hero");
assert.ok(/openMatchesAll\(''\)/.test(html) && !/recent-wrap|recent-games/.test(html), "All my matches link, no <details> last-5 list");
assert.ok(/statsPairGo\(this\.getAttribute\('data-k'\)\)/.test(html), "pair rows open that pair in Head-to-head");
assert.ok(/progressUser='p\d'|progressUser='me'/.test(html), "player rows still open Progress");
var pairs = ctx._rankLists().pairs.length;
assert.ok(pairs > 7, "the fake data has more than 7 pairs (" + pairs + ")");
assert.strictEqual((html.match(/rank-gap/g) || []).length >= 2, true, "both long lists have a gap row");
assert.ok(html.indexOf("seeAllN") >= 0 && /statsSeeAll\('pairs'\)/.test(html));
// trend: only the rating change
var rt = ctx._rankTrend(1563, 1500);
assert.ok(/▲ 63/.test(rt) && !/rk-chg/.test(rt), "rating up 63");
assert.ok(/▼ 10/.test(ctx._rankTrend(1490, 1500)));
assert.ok(/–/.test(ctx._rankTrend(1500, 1500)) && /–/.test(ctx._rankTrend(1500, null)), "a dash when nothing changed / no game this month");
// highlights: best score only
var hl = ctx._highlightsHtml(ctx.computeStats(), "all");
assert.ok(/bestScore/.test(hl) && !/groupTopPair/.test(hl));
assert.strictEqual(ctx._highlightsHtml({ h2h: [] }, "all"), "", "no games: no card");

// See all: Head-to-head with the full list at the top
ctx.renderStats = function () {};
ctx.statsSeeAll("pairs");
var h2h = ctx._h2hAllHtml();
assert.ok(/allPairs/.test(h2h) && !/rank-gap|rank-see/.test(h2h), "full list, no gap");
assert.strictEqual((h2h.match(/class="rank-row/g) || []).length, pairs, "every pair is listed");
ctx.statsTab = "ranking"; ctx.setStatsTab("h2h");
assert.strictEqual(ctx._h2hAllHtml(), "", "opening the tab by hand shows no full list");
ctx.document = { getElementById: function () { return null; } };
ctx.statsPairGo("p1+p2");
assert.strictEqual(ctx.statsTab, "h2h"); assert.strictEqual(ctx.h2hPairA, "p1+p2"); assert.strictEqual(ctx.h2hPairB, null);

/* ---- badges ---- */
var bl = ctx.badgesFor("me"), got = bl.filter(function (b) { return b.earned; }).length;
assert.ok(got >= 1, "first match earned");
assert.ok(new RegExp('<span class="bd-n">' + got + '</span>').test(ctx._badgeBtnHtml("me")), "the button shows the earned count");
assert.strictEqual(ctx.badgeProgText({ earned: false, best: true, value: 6, need: 10 }), "badgeBestN".replace("{n}", 6));
assert.strictEqual(ctx.badgeProgText({ earned: false, value: 62, need: 100 }), "62/100");
assert.strictEqual(ctx.badgeProgText({ earned: true, value: 5, need: 5 }), "✔");

/* ---- All my matches: pure helpers ---- */
var all = ctx.maGames("me");
assert.ok(all.length >= 6, "my games: " + all.length);
assert.ok(all.every(function (g) { return g.d !== null; }), "every decided game has a rating change");
var st = ctx.computeStats().players.me, sumD = all.reduce(function (s, g) { return s + g.d; }, 0);
assert.ok(Math.abs(sumD - (st.rating - 1500)) < 1e-6, "the game changes add up to the rating");
assert.ok(all.every(function (g) { return g.m.id !== "undecided"; }), "a game with no score is left out");
var f0 = { from: "", result: "all", type: "all", partner: "", opp: "" };
var F = function (o) { var f = Object.assign({}, f0, o); return ctx.maFilter(all, f); };
assert.strictEqual(F({}).length, all.length);
assert.ok(F({ result: "won" }).every(function (g) { return g.won; }) && F({ result: "lost" }).every(function (g) { return !g.won; }));
assert.strictEqual(F({ result: "won" }).length + F({ result: "lost" }).length, all.length);
assert.deepStrictEqual(F({ type: "tournament" }).map(function (g) { return g.m.tid; }), ["s1"], "tournament games have a tid");
assert.strictEqual(F({ type: "singles" }).length, 1); assert.strictEqual(F({ type: "doubles" }).length, all.length - 1);
assert.ok(F({ partner: "p1" }).length >= 4 && F({ partner: "p1" }).every(function (g) { return g.mine.indexOf("p1") >= 0; }));
assert.ok(F({ opp: "p7" }).length >= 1 && F({ opp: "p7" }).every(function (g) { return g.them.indexOf("p7") >= 0; }));
assert.strictEqual(F({ from: "2026-10-22" }).length, 4, "period: games from that date on");
assert.strictEqual(ctx.maPeriodFrom("month"), "2026-10-01"); assert.strictEqual(ctx.maPeriodFrom("30d"), "2026-09-29"); assert.strictEqual(ctx.maPeriodFrom("all"), "");
var sm = ctx.maSummary(F({ from: "2026-10-22" }));
assert.strictEqual(sm.n, 4); assert.strictEqual(sm.w + sm.l, 4); assert.strictEqual(sm.pct, ctx.pct(sm.w, 4));
assert.strictEqual(ctx.maSummary([]).n, 0); assert.strictEqual(ctx.maSummary([]).pct, "–");
// grouping: days newest first, sessions inside, "other" for games with no session
var days = ctx.maGroup(F({ from: "2026-10-01" }), ctx.lastSessions);
assert.strictEqual(JSON.stringify(days.map(function (d) { return d.date; })), '["2026-10-24","2026-10-21"]');
var d24 = days[0];
assert.strictEqual(d24.games.length, 4); assert.strictEqual(d24.sessions.length, 1); assert.strictEqual(d24.sessions[0].games.length, 3);
assert.strictEqual(d24.sessions[0].tour, true, "a session with a tournament game is tagged");
assert.strictEqual(d24.other.games.length, 1, "the game with no session goes under Other");
assert.strictEqual(d24.w + d24.l, 4);
assert.strictEqual(days[1].sessions[0].tour, false); assert.strictEqual(days[1].other, null);
assert.strictEqual(ctx.maTimeRange(ctx.lastSessions[0]), "19:00–21:00"); assert.strictEqual(ctx.maTimeRange(ctx.lastSessions[1]), "18:00–19:30");
assert.strictEqual(ctx.maTimeRange({ time: "23:30", duration: 1 }), "23:30–00:30"); assert.strictEqual(ctx.maTimeRange({}), "");
assert.strictEqual(ctx.maScoreText(all.filter(function (g) { return g.them[0] === "p7"; })[0]), "21\u201318, 18\u201321, 21\u201319", "every set, from my side");
// performance: a few hundred games group in one pass
var big = []; for (var z = 0; z < 600; z++) big.push({ m: { date: "2026-0" + (1 + z % 9) + "-1" + (z % 9), sessionId: "s" + (z % 2 + 1) }, won: z % 2 === 0, d: 1, mine: ["me"], them: ["p1"], sid: "s" + (z % 2 + 1), tid: "" });
var t0 = Date.now(); var gb = ctx.maGroup(big, ctx.lastSessions); assert.ok(Date.now() - t0 < 200 && gb.length > 1);

/* ---- page render (stub DOM) ---- */
var box = { innerHTML: "" };
ctx.document = { getElementById: function (id) { return id === "matchesAllContent" ? box : null; } };
ctx.maPeriod = "all"; ctx.renderMatchesAll();
assert.ok(/ma-sum/.test(box.innerHTML) && /<details class="ma-day" open/.test(box.innerHTML), "summary + newest day open");
assert.strictEqual((box.innerHTML.match(/<details class="ma-day"/g) || []).length, new Set(all.map(function (g) { return g.m.date; })).size, "one block per day");
assert.ok(/ma-tag/.test(box.innerHTML) && /ma-sh/.test(box.innerHTML) && /maOther/.test(box.innerHTML));
assert.ok(/showSessionDetail\('s1','games'\)/.test(box.innerHTML), "a game with a session opens its Games tab");
ctx.maResult = "lost"; ctx.maType = "singles"; ctx.renderMatchesAll();
assert.ok(/maNoMatch/.test(box.innerHTML) && /maClear\(\)/.test(box.innerHTML), "empty state for a filter with no games");
ctx.maClear(); assert.strictEqual(ctx.maResult, "all");
ctx.maUser = "p9"; ctx.maPeriod = "30d"; ctx.renderMatchesAll();
assert.ok(box.innerHTML.length > 0, "another player's list renders");

/* ---- wiring + strings ---- */
var read = function (f) { return fs.readFileSync(f, "utf8"); };
assert.ok(/id="page-matches-all"/.test(read("index.html")) && /js\/matches-all\.js/.test(read("index.html")) && /matches-all\.js/.test(read("sw.js")), "page container, script tag and service-worker entry");
assert.ok(/matches-all/.test(read("js/router.js")) && /loadMatchesAll/.test(read("js/router.js")), "router knows the page");
assert.ok(/"matches-all"/.test(read("tools/uimatrix/driver.js")), "UI matrix covers the page");
assert.ok(!/_homeBadgeCard|hs-badges/.test(read("js/home.js")), "Home has no Badges swipe card");
var i18n = read("js/i18n.js");
["ratingMonthHint", "rankMore", "provFadedNote", "seeAllN", "allPairs", "allPlayers", "badgesBtnLabel", "badgeBestN", "badgeEarned", "allMyMatches", "maCrumb", "maPlayer", "maP30", "maTypeAll", "maTypeDoubles",
  "maPartner", "maPartnerAll", "maOpp", "maOppAll", "maOther", "maShowOlder", "maNoMatch", "maClear", "maSummary"].forEach(function (k) {
  assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN and LA");
});
console.log("rankings-v247 OK");
