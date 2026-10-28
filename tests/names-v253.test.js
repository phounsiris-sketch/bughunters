/* Run: node tests/names-v253.test.js — v253: naming. Play day = Session / ນັດຫຼິ້ນ, one match = Match / ແມັດ, money tab = Bill / ບິນ.
   EN and LA have the same keys; no Game/ເກມ/ເຊດຊັນ/ເຊສຊັ່ນ word left in the app strings. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ctx = { console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/i18n.js", "utf8") + "\n;this.__tr = translations;", ctx, { filename: "js/i18n.js" });
var T = ctx.__tr, en = T.en, la = T.la;

assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(la).sort(), "EN and LA have the same key set");
assert.strictEqual(en.navGames, "Session"); assert.strictEqual(la.navGames, "ເຊດຊັນ");   // v254: user named the bar item
assert.strictEqual(en.homeShortPlay, "Play"); assert.strictEqual(la.homeShortPlay, "ຫຼິ້ນ");   // v254: Create shortcut
assert.strictEqual(en.sessionTabGames, "Games"); assert.strictEqual(la.sessionTabGames, "ເກມ");   // v258: user named the session tab "Games"
assert.strictEqual(en.sessionTabBill, "Bill"); assert.strictEqual(la.sessionTabBill, "ບິນ");
assert.strictEqual(en.matches, "Matches"); assert.strictEqual(la.matches, "ແມັດ");
assert.strictEqual(en.createSession, "Create session"); assert.strictEqual(la.createSession, "ສ້າງນັດຫຼິ້ນ");
assert.strictEqual(en.homeGame, "Session"); assert.strictEqual(la.homeGame, "ນັດຫຼິ້ນ");
assert.strictEqual(la.lastNGames, "{n} ແມັດລ່າສຸດ"); assert.strictEqual(en.maCrumb, "All matches"); assert.strictEqual(la.maCrumb, "ແມັດທັງໝົດ");

Object.keys(la).forEach(function (k) {
  if (k === "navGames" || k === "sessionTabGames") return;   // v254: the bar item is "ເຊດຊັນ" by the user's choice
  assert.ok(!/ເກມ|ເຊດຊັນ|ເຊສຊັ່ນ/.test(la[k]), "LA " + k + " still uses an old word: " + la[k]);
});
Object.keys(en).forEach(function (k) {
  if (k === "sessionTabGames") return;   // v258: the session tab is "Games" by the user's choice
  var v = en[k].replace(/\{\w+\}/g, "");   // placeholders such as {game} / {games} are code names, not text
  assert.ok(!/\bgames?\b/i.test(v), "EN " + k + " still says game: " + en[k]);
});

var ev = fs.readFileSync("push/events.js", "utf8");
assert.ok(!/ເກມ/.test(ev) && !/\bGame\b/.test(ev.replace(/ \* .*|\/\/.*/g, "")), "push texts use session wording");
var idx = fs.readFileSync("index.html", "utf8");
assert.ok(/data-i18n="navGames">Session</.test(idx), "static nav fallback text");
console.log("names-v253 ok");
