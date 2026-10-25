/* Run: node tests/buddy-calendar.test.js — the Find buddy page has a calendar like Public games (v215) */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var src = fs.readFileSync("js/social.js", "utf8");
var a = src.indexOf("/** The weekdays (0 = Sunday) a buddy is free"), b = src.indexOf("function _renderBuddies()");
var ctx = { _buddies: [], currentUser: { uid: "me" }, buddyFilter: { looking: "", level: "" }, buddyCal: { sel: "" }, publicCity: function () { return "all"; }, isBlockedPair: function () { return false; },
  normCity: function (c) { return c; }, normLevel: function (l) { return l; }, canSeeField: function (u, k) { return u.showDays !== false; } };
vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx);
// 2026-10-26 is a Monday (1), 2026-10-28 a Wednesday (3)
ctx._buddies = [
  { id: "u1", buddy: { days: [1, 3], lookingFor: ["doubles"] } },
  { id: "u2", buddy: { lookingFor: ["singles"] }, about: { daysFree: [3] } },
  { id: "u3", buddy: {}, about: { daysFree: [1] }, showDays: false },
  { id: "me", buddy: { days: [1] } }
];
assert.deepStrictEqual(JSON.stringify(ctx._buddyDays(ctx._buddies[0])), "[1,3]", "days set for buddies win");
assert.deepStrictEqual(JSON.stringify(ctx._buddyDays(ctx._buddies[1])), "[3]", "else the profile days I may see");
assert.deepStrictEqual(JSON.stringify(ctx._buddyDays(ctx._buddies[2])), "[]", "profile days hidden from me are not used");
assert.ok(ctx._buddyFreeOn(ctx._buddies[0], "2026-10-26") && !ctx._buddyFreeOn(ctx._buddies[0], "2026-10-27"), "free on Monday, not on Tuesday");
assert.strictEqual(ctx._buddyMatches(false).length, 3, "everyone but me");
ctx.buddyCal.sel = "2026-10-28";
assert.strictEqual(ctx._buddyMatches(true).map(function (u) { return u.id; }).join(","), "u1,u2", "a picked day keeps the people free that weekday");
ctx.buddyFilter.looking = "singles";
assert.strictEqual(ctx._buddyMatches(true).map(function (u) { return u.id; }).join(","), "u2", "the filters still apply");
assert.ok(/calendarHtml\(\{ month: buddyCal\.month/.test(src) && /var pool = b\.on/.test(src), "the page draws the calendar from the buddy pool");
var i18n = fs.readFileSync("js/i18n.js", "utf8");
["noBuddiesDay", "buddyDaysHint"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN and LA"); });
console.log("buddy calendar OK");
