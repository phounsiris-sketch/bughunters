/* Run: node tests/icons-3d.test.js — dashboard pack "3d" (v244): registered, every mapped name draws, fallback like clay, unique gradient ids, picker */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function load(pack) {
  var ctx = { localStorage: { getItem: function (k) { return k === "dashPack" ? pack : null; }, setItem: function () {} } }; vm.createContext(ctx);
  ["icons.js", "icons-sets.js", "icons-solar-bold.js"].forEach(function (f) { vm.runInContext(fs.readFileSync("js/" + f, "utf8"), ctx); });
  return ctx;
}
var c = load("3d");
assert.ok(c.DASH_PACKS.indexOf("3d") >= 0, "pack 3d registered");
assert.strictEqual(c.currentDashPack, "3d", "saved pack is read");
assert.strictEqual(load(null).currentDashPack, "clay", "default pack is unchanged (clay)");
assert.deepStrictEqual(Object.keys(c.ART_3D).sort(), ["calendar", "clock", "court", "friends", "game", "health", "market", "poll", "score", "share", "stats", "training", "trophy", "wallet"], "14 drawings");
// every mapped name points at a drawing and renders an svg using it
Object.keys(c.ICON_3D_MAP).forEach(function (n) {
  var k = c.ICON_3D_MAP[n]; assert.ok(c.ART_3D[k], n + " -> " + k + " has a drawing");
  var svg = c._svg3d(k, 40); assert.ok(/^<svg[^>]*viewBox="0 0 64 64"/.test(svg) && svg.indexOf('href="#g3d-i-' + k + '"') > 0, n + " renders");
});
// iconAs("3d") for the names the app really has: 3D drawing (not plain controls); fallback like clay for the rest
var expect = { court: "court", users: "friends", user: "friends", polls: "poll", vote: "poll", shuttle: "game", scoreboard: "score", chart: "stats", ranking: "stats", dashboard: "stats", calendar: "calendar", sessions: "calendar", clock: "clock", history: "clock", trophy: "trophy", medal: "trophy", crown: "trophy", wallet: "wallet", bill: "wallet", card: "wallet" };
Object.keys(expect).forEach(function (n) { var s = c.iconAs("3d", n, 18); assert.ok(s.indexOf('class="si ico-3d"') > 0 && s.indexOf("#g3d-i-" + expect[n] + '"') > 0, n + " -> 3D " + expect[n]); });
assert.ok(/^<svg class="si"/.test(c.iconAs("3d", "share", 18)) && /^<svg class="si"/.test(c.iconAs("3d", "plus", 18)), "controls stay plain line icons");
assert.ok(/^<svg class="si"/.test(c.iconAs("3d", "trophy", 12)), "tiny inline icons stay plain");
assert.strictEqual(c.iconAs("3d", "dinner", 18), c.iconAs("clay", "dinner", 18), "names without a drawing fall back exactly like clay");
assert.strictEqual(c.iconAs("3d", "nope", 18), "", "unknown name");
// size: 18 -> 24px like clay
assert.ok(c.iconAs("3d", "trophy", 18).indexOf('width="24"') > 0);
// the dashboard context uses the pack; elsewhere the chosen style
assert.ok(c.icon("trophy", 20).indexOf("ico-3d") < 0, "outside the Dashboard the chosen style is used");
c._dashCtx = true; assert.ok(c.icon("trophy", 20).indexOf("ico-3d") > 0, "Dashboard page draws the 3D object"); c._dashCtx = false;
// icon3(): tiles. 3d on: drawing by explicit key (Home market = name "other"); pack off: the normal icon, size fb
assert.ok(c.icon3("other", 54, "bx4", "market", 24).indexOf("#g3d-i-market") > 0 && c.icon3("other", 54, "bx4", "market", 24).indexOf('width="54"') > 0);
assert.ok(c.icon3("chart", 40, "", "health", 18).indexOf("#g3d-i-health") > 0, "heart-rate zones tile = health drawing, not trophy");
assert.ok(c.icon3("dinner", 40, "", null, 18).indexOf("ico-3d") < 0, "no drawing: normal icon");
var off = load("clay");
assert.strictEqual(off.icon3("other", 54, "bx4", "market", 24), off.icon("other", 24, "bx4"), "pack off: unchanged icon for the tile");
// other packs/styles untouched
["box", "neu", "glass", "classic", "tiles", "clay", "sticker"].forEach(function (th) { assert.ok(c.iconAs(th, "court", 22).indexOf("ico-3d") < 0, th + " not affected"); });
assert.ok(/ico-bx/.test(c.iconAs("box", "court", 22)) && c.ICON_FIXED.shuttle === 1 && c.PLATE_GLYPH.court === "shuttle" && c.PLATE_GLYPH.scoreboard === "scoreboard", "v239 plate rules kept");
// defs: injected once, unique ids, all gradients referenced exist
var html = c._g3dDefsHtml(), ids = (html.match(/\bid="[^"]+"/g) || []).map(function (x) { return x.slice(4, -1); });
assert.strictEqual(ids.length, new Set(ids).size, "no duplicate ids in the 3D defs");
ids.forEach(function (i) { assert.ok(/^g3d-/.test(i), "id prefixed: " + i); });
(html.match(/url\(#[^)]+\)|href="#[^"]+"/g) || []).forEach(function (r) { var id = r.replace(/^url\(#|^href="#|\)$|"$/g, ""); assert.ok(ids.indexOf(id) >= 0, "reference resolves: " + id); });
var clayIds = (fs.readFileSync("js/icons.js", "utf8").match(/id="(clay[A-Za-z0-9]*|stk[A-Za-z0-9]*)"/g) || []);
assert.ok(!clayIds.some(function (x) { return /g3d/.test(x); }), "no clash with clay / sticker ids");
var n = 0; c.document = { body: { insertBefore: function () { n++; } }, getElementById: function () { return n ? {} : null; }, createElement: function () { return { setAttribute: function () {}, style: {} }; } };
vm.runInContext("_svg3d('court', 20); _svg3d('game', 20);", c); assert.strictEqual(n, 1, "defs injected once");
assert.ok(html.length < 26000, "SVG data stays small (" + html.length + " bytes)");
// settings picker lists the pack with a preview and a name in both languages
var st = fs.readFileSync("js/settings.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8");
assert.ok(/\["3d", "dashPack3d"\]/.test(st), "picker includes 3d");
assert.strictEqual((i18n.match(/dashPack3d:/g) || []).length, 2, "dashPack3d in EN and LA");
console.log("icons-3d OK");
