/* Run: node tests/g3d-variants-v252.test.js — Friends and Live in three 3D variants (v252) */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function load(pack, variant) {
  var ctx = { localStorage: { getItem: function (k) { return k === "dashPack" ? pack : k === "g3dVariant" ? variant : null; }, setItem: function (k, v) { ctx._saved = [k, v]; } } }; vm.createContext(ctx);
  ["icons.js", "icons-sets.js", "icons-solar-bold.js"].forEach(function (f) { vm.runInContext(fs.readFileSync("js/" + f, "utf8"), ctx); });
  return ctx;
}
var c = load("3d", null);
assert.strictEqual(c.G3D_VARIANTS.join(), "real,clay,glossy", "variants registered");
assert.strictEqual(c.currentG3dVariant, "real", "default is Realistic");
assert.strictEqual(load("3d", "nope").currentG3dVariant, "real", "bad saved value -> default");
assert.strictEqual(load("3d", "glossy").currentG3dVariant, "glossy", "saved value is read");
// each variant renders for friends and live
["friends", "live"].forEach(function (k) {
  c.G3D_VARIANTS.forEach(function (v) {
    assert.ok(c.ART_3D_VAR[k][v] && c.ART_3D_VAR[k][v].length > 200, k + " " + v + " has art");
    assert.ok(c._svg3d(k, 40, "", v).indexOf('href="#g3d-i-' + k + "-" + v + '"') > 0, k + " " + v + " renders");
  });
});
// the current variant is used when none is given
c.currentG3dVariant = "clay";
assert.ok(c.icon3("users", 54, "", "friends", 24).indexOf("#g3d-i-friends-clay") > 0, "Home Friends follows the choice");
assert.ok(c.icon3("scoreboard", 44, "", "live", 24).indexOf("#g3d-i-live-clay") > 0, "Home Live follows the choice");
assert.ok(c.iconAs("3d", "scoreboard", 18).indexOf("#g3d-i-live-clay") > 0, "any 3D scoreboard icon is the Live drawing");
assert.ok(c.iconAs("3d", "users", 18).indexOf("#g3d-i-friends-clay") > 0, "users is Friends");
c.currentG3dVariant = "real";
// other packs unchanged
var off = load("clay", "glossy");
assert.ok(off.icon3("users", 54, "", "friends", 24).indexOf("ico-3d") < 0, "pack off: normal icon");
assert.strictEqual(off.iconAs("clay", "scoreboard", 18).indexOf("g3d"), -1);
// setter validates and saves
c.setG3dVariant("zzz"); assert.strictEqual(c.currentG3dVariant, "real"); c.setG3dVariant("glossy"); assert.strictEqual(c._saved.join(), "g3dVariant,glossy");
// unique ids, resolved references, no <text>
var html = c._g3dDefsHtml(), ids = (html.match(/\bid="[^"]+"/g) || []).map(function (x) { return x.slice(4, -1); });
assert.strictEqual(ids.length, new Set(ids).size, "unique ids");
ids.forEach(function (i) { assert.ok(/^g3d-/.test(i), "prefixed " + i); });
(html.match(/url\(#[^)]+\)|href="#[^"]+"/g) || []).forEach(function (r) { var id = r.replace(/^url\(#|^href="#|\)$|"$/g, ""); assert.ok(ids.indexOf(id) >= 0, "resolves " + id); });
assert.ok(!/<text/.test(html), "no <text>: no font needed");
assert.ok(/g3d-pulse/.test(c.ART_3D_VAR.live.real) && /g3d-pulse/.test(c.ART_3D_VAR.live.clay) && /g3d-pulse/.test(c.ART_3D_VAR.live.glossy), "pulsing dot in each Live variant");
// css: pulse + reduced motion
var css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(/\.g3d-pulse\s*\{\s*animation:\s*g3dPulse/.test(css), "pulse animation");
assert.ok(/prefers-reduced-motion: reduce\)\s*\{\s*\.g3d-pulse\s*\{\s*animation:\s*none/.test(css), "reduced motion turns it off");
// settings: picker only with the 3d pack, i18n EN + LA
var st = fs.readFileSync("js/settings.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8");
assert.ok(/currentDashPack === "3d" \? '<div class="settings-label"[^;]*g3dVariant/.test(st), "picker only when the pack is 3d");
["g3dVariant", "g3dVariantHint", "g3dVar_real", "g3dVar_clay", "g3dVar_glossy"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("\\b" + k + ":", "g")) || []).length, 2, k + " in EN and LA"); });
assert.ok(/"live", 44/.test(fs.readFileSync("js/home.js", "utf8")), "Create row Live uses the live drawing");
console.log("g3d-variants OK");
