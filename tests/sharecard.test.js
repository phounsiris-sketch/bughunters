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
