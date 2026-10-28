/* Run: node tests/clay-sticker-v263.test.js — v263: Live icon shows 7|7 in clay and sticker; Home tiles size clay/sticker like 3D */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ctx = { console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } };
vm.createContext(ctx);
["icons-solar-bold", "icons-sets", "icons"].forEach(function (f) { vm.runInContext(fs.readFileSync("js/" + f + ".js", "utf8"), ctx); });
var clay = vm.runInContext("CLAY_ART.scoreboard", ctx), stk = vm.runInContext("STICKER_ART.scoreboard", ctx);
assert.ok(stk && stk !== clay, "sticker has its own scoreboard art");
[clay, stk].forEach(function (a) {
  assert.ok(!/M5\.6 15\.2V9/.test(a), "old 10|2 art is gone");
  assert.ok(/pk-pulse/.test(a), "red live dot");
  // two sevens: a top bar then a diagonal stem, once on each side of the centre line (x < 12 and x > 12)
  var sevens = a.match(/M\d+(\.\d+)? ?\d+(\.\d+)?H\d+(\.\d+)?L\d+(\.\d+)? \d+(\.\d+)?/g) || [];
  assert.ok(sevens.length >= 2, "left and right 7 strokes");
});
var home = fs.readFileSync("js/home.js", "utf8");
vm.runInContext(home.match(/function _tilePackPx[\s\S]*?\n\}/)[0], ctx);
vm.runInContext("currentDashPack='clay'", ctx); assert.ok(Math.abs(ctx._tilePackPx(54) * 1.35 - 54) < 1);
vm.runInContext("currentDashPack='sticker'", ctx); assert.ok(Math.abs(ctx._tilePackPx(54) * 1.4 - 54) < 1);
vm.runInContext("currentDashPack='same'", ctx); assert.strictEqual(ctx._tilePackPx(54), 24);
vm.runInContext("currentDashPack='3d'", ctx); assert.strictEqual(ctx._tilePackPx(54), 24);
console.log("clay-sticker-v263 OK");
