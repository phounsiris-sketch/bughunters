/* Run: node tests/sharecard.test.js — the share card reads stats-core numbers, covers every special theme, and has its texts in EN + LA */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var src = fs.readFileSync("js/sharecard.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), app = fs.readFileSync("js/app.js", "utf8");
var ctx = { t: function (k) { return k; }, STATS_SCOPES: [["all", "allTime"], ["month", "thisMonth"]], currentGroup: { name: "Club" },
  findUser: function (u) { return { displayName: u === "p" ? "Ton" : "Me" }; }, plainUserName: function (u) { return u.displayName; },
  statsFor: function () { return { winRate: 60, played: 10, streakNow: 3 }; }, computeStats: function () { return { players: { me: { comp: 20, rating: 1300.4 } } }; },
  bestPartnerOf: function () { return { uid: "p", n: 6, rate: 0.8333 }; }, ratingTrend: function () { return { vals: [1, 2, 3] }; },
  rankOf: function () { return 2; }, playerLevel: function () { return "S"; }, formStrip: function () { return [{ won: true }, { won: false }]; } };
vm.createContext(ctx); vm.runInContext(src, ctx);
var d = ctx.shareCardData("me", "all");
assert.strictEqual(d.name, "Me"); assert.strictEqual(d.rating, 1300); assert.strictEqual(d.rank, 2); assert.strictEqual(d.winRate, 60);
assert.strictEqual(d.partner.name, "Ton"); assert.strictEqual(d.partner.rate, 83); assert.deepStrictEqual(JSON.stringify(d.form), "[true,false]");
assert.strictEqual(d.period, "allTime"); assert.strictEqual(d.group, "Club");
// every special theme has a card palette
var specials = vm.runInContext("(" + app.match(/var SPECIALS = (\[[\s\S]*?\n\]);/)[1] + ")", vm.createContext({}));
specials.forEach(function (sp) { assert.ok(ctx.SC_THEMES[sp[0]], sp[0] + " has a share-card palette"); });
// texts exist once in EN and once in LA
["shareWord", "shareCardTitle", "shareMyCard", "saveImage", "savedImage", "scAuto", "scDefault", "scStory", "scSquare"].forEach(function (k) {
  assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA");
});
console.log("sharecard OK");

// health share cards: data builders and badges
var hs = { t: function (k) { return k; }, HEALTH_ZONE_COLORS: ["#38bdf8", "#4ade80", "#facc15", "#fb923c", "#ef4444"] }; vm.createContext(hs);
vm.runInContext(fs.readFileSync("js/sharecard-health.js", "utf8"), hs);
var wk = { sid: "s1", date: "2026-10-22", time: "18:00", totalMin: 189, onCourt: 145, games: 9, kcal: 836, avg: 133, peak: 154,
  d: { zoneMin: [10, 60, 30, 5, 0], zones: [], pts: [[0, 90], [1, 120]], close: 4, restAssumed: false, segs: [{ mine: 21, their: 15, won: true, close: false, len: 14, s: 10, e: 24 }, { mine: 19, their: 21, won: false, close: true, len: 18, s: 30, e: 48 }] } };
var wsd = hs.workoutShareData(wk, "Thu 22 Oct 2026");
assert.strictEqual(wsd.date, "Thu 22 Oct 2026"); assert.strictEqual(wsd.kcal, 836); assert.strictEqual(wsd.segs.length, 2); assert.strictEqual(wsd.segs[1].close, true);
var bd = hs.workoutBadges(Object.assign({}, wsd, { games: 9, kcal: 900, close: 4 })).map(function (b) { return b[1]; });
assert.deepStrictEqual(JSON.stringify(bd), JSON.stringify(["wbBurner", "wbClutch", "wbMarathon"]), "three badges at most, in priority order");
assert.strictEqual(hs.workoutBadges({ kcal: 100, close: 0, games: 2, zoneMin: [1, 1, 0, 0, 0], segs: [] })[0][1], "wbFresh", "a quiet session still gets a friendly badge");
assert.strictEqual(hs.workoutBadges({ kcal: 300, close: 0, games: 3, zoneMin: null, segs: [{ won: true }, { won: true }, { won: true }] })[0][1], "wbUnbeaten");
var ov = hs.overviewShareData({ buckets: [{ min: 0 }, { min: 120 }, { min: 60 }], totalMin: 180, sessions: 2, games: 10, kcal: 1500, hasKcal: true, avg: 130, zoneMin: [0, 1, 2, 3, 4], hasZones: true, avgBucket: 90 }, { kind: "week" }, "Oct 19 - 25", function (b, i) { return "d" + i; });
assert.strictEqual(ov.best, 1, "the best day is crowned"); assert.strictEqual(ov.active, 2, "two active days"); assert.strictEqual(ov.buckets[2].label, "d2");
assert.strictEqual(hs.overviewBadges({ kind: "week", sessions: 3, games: 5, kcal: 100, zoneMin: null })[0][1], "wbConsistent");
["shareWorkoutTitle", "shareOverviewTitle", "wbBurner", "wbClutch", "wbMarathon", "wbCardio", "wbUnbeaten", "wbFresh", "wbConsistent", "scActiveDays", "scActiveMonths"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
console.log("sharecard-health OK");
