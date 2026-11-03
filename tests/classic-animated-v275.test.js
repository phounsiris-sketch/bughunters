/* Run: node tests/classic-animated-v275.test.js — v275: Classic Menu icons pack + Animated Friends & Live variant. No version number is hard-coded. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function load(store) {
  var ctx = { localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } } };
  vm.createContext(ctx);
  ["icons.js", "icons-sets.js", "icons-solar-bold.js"].forEach(function (f) { vm.runInContext(fs.readFileSync("js/" + f, "utf8"), ctx); });
  return ctx;
}
/* ---- A. Classic pack ---- */
var c = load({});
assert.ok(c.DASH_PACKS.indexOf("classic") >= 0, "classic registered");
assert.strictEqual(c.currentDashPack, "3d", "default stays 3d");
assert.strictEqual(load({ dashPack: "classic" }).currentDashPack, "classic", "saved classic survives the migration");
var kept = {}; kept.dashPack = "classic"; load(kept); assert.strictEqual(kept.dashPack, "classic", "classic not rewritten");
assert.strictEqual(load({ dashPack: "nope" }).currentDashPack, "3d", "unknown -> 3d");
assert.ok(c.NAV_FIT.classic > 0, "NAV_FIT for classic");
// bar + titles: plain Solar glyph, no clay/sticker/3d markup
["dashboard", "sessions", "ranking", "globe", "settings"].forEach(function (n) {
  var h = c.menuIcon(n, 24, "", "classic");
  assert.ok(/ico-mcl/.test(h) && h.indexOf(c.SOLAR[n]) > 0, n + " is the plain Solar glyph");
  assert.ok(!/ico-clay|ico-sticker|ico-3d|filter=/.test(h), n + " has no pack styling");
  assert.ok(c.menuIconFit(n, 26, "", "classic").indexOf('width="' + Math.round(26 / c.NAV_FIT.classic) + '"') > 0, n + " fits the nav visual size");
});
// Home tiles
c.currentDashPack = "classic";
var tiles = { court: "court", friends: "users", market: "other", poll: "vote", game: "shuttle", score: "manual", live: "scoreboard" };
Object.keys(tiles).forEach(function (k) {
  assert.ok(c.SOLAR[tiles[k]], "glyph exists: " + tiles[k]);
  assert.strictEqual(c.CLASSIC_TILE[k], tiles[k], "tile " + k);
  var h = c.icon3("x", 54, "bx1", k, 32);
  assert.ok(h.indexOf(c.SOLAR[tiles[k]]) > 0 && /width="32"/.test(h) && !/ico-3d/.test(h), "tile " + k + " draws the glyph at the pack size");
});
assert.ok(c.icon("trophy", 20).indexOf("ico-mcl") < 0, "icon() (System icons) never takes the Menu pack");
assert.ok(fs.readFileSync("js/home.js", "utf8").indexOf('currentDashPack === "classic"') > 0, "Home sizes classic tiles");
// the serve shuttle never follows a pack
assert.ok(c.serveShuttleHtml(26).indexOf("ico-mcl") < 0, "serve shuttle is never a pack");
// other packs unchanged
c.currentDashPack = "3d"; assert.ok(/ico-3d/.test(c.icon3("users", 54, "", "friends", 24)), "3d tiles unchanged");
// settings picker: all packs listed, 3 variants picker still 3d only
var st = fs.readFileSync("js/settings.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), tr = {};
assert.ok(/DASH_PACKS\.map/.test(st) && /currentDashPack === "3d" \? '<div class="settings-label"[^;]*g3dVariant/.test(st), "picker lists every pack; variant picker only for 3d");
vm.runInNewContext(i18n + "\n;this.__tr = translations;", tr);
["dashPack_classic", "g3dVar_animated"].forEach(function (k) { ["en", "la"].forEach(function (l) { assert.ok(tr.__tr[l][k] && tr.__tr[l][k].trim(), l + "." + k); }); });
assert.strictEqual(tr.__tr.la.dashPack_classic, tr.__tr.la.icon_classic, "LA Classic label matches the System icons card");
assert.strictEqual(tr.__tr.en.dashPack_classic, tr.__tr.en.icon_classic, "EN Classic label matches");

/* ---- B. Animated variant ---- */
assert.strictEqual(c.G3D_VARIANTS[c.G3D_VARIANTS.length - 1], "animated", "animated is the 4th variant");
assert.strictEqual(load({ g3dVariant: "animated" }).currentG3dVariant, "animated", "saved animated is read");
["friends", "live"].forEach(function (k) {
  var art = c.ART_3D_VAR[k].animated;
  assert.ok(art && art.length > 300, k + " animated art");
  assert.ok(/class="g3a-/.test(art), k + " has animated parts");
  assert.ok(!/<text|<image|href="http|xlink/.test(art), k + " original art: no text, image or link");
  assert.ok(c._svg3d(k, 40, "", "animated").indexOf('href="#g3d-i-' + k + '-animated"') > 0, k + " renders");
});
assert.ok(/g3a-bob/.test(c.ART_3D_VAR.friends.animated) && /g3a-wave/.test(c.ART_3D_VAR.friends.animated) && /g3a-heart/.test(c.ART_3D_VAR.friends.animated), "friends: bob, wave, heart");
assert.ok(/g3a-dot/.test(c.ART_3D_VAR.live.animated) && /g3a-flip/.test(c.ART_3D_VAR.live.animated), "live: blinking dot + digit flip");
var html = c._g3dDefsHtml(), ids = (html.match(/\bid="[^"]+"/g) || []).map(function (x) { return x.slice(4, -1); });
assert.strictEqual(ids.length, new Set(ids).size, "unique ids");
assert.ok(ids.filter(function (i) { return /^g3a-/.test(i); }).length >= 5, "g3a- gradients defined once");
(html.match(/url\(#[^)]+\)/g) || []).forEach(function (r) { assert.ok(ids.indexOf(r.slice(5, -1)) >= 0, "resolves " + r); });
// CSS: every g3a-* class used has rules, only transform/opacity animate, reduced motion stops them
var css = fs.readFileSync("css/styles.css", "utf8");
var used = {}; (c.ART_3D_VAR.friends.animated + c.ART_3D_VAR.live.animated).replace(/class="([^"]+)"/g, function (_, v) { v.split(" ").forEach(function (x) { used[x] = 1; }); });
Object.keys(used).forEach(function (cl) { assert.ok(css.indexOf("." + cl) >= 0, "css for ." + cl); });
var kf = css.match(/@keyframes g3a[A-Za-z]+ \{[^\n]*\}/g) || []; assert.ok(kf.length >= 5, "keyframes g3a*");
kf.forEach(function (k) { assert.ok(!/\b(width|height|top|left|margin|fill|stroke|filter)\s*:/.test(k), "GPU only: " + k.slice(0, 30)); });
assert.ok(/prefers-reduced-motion: reduce\)\s*\{\s*\.g3a-bob[^}]*animation:\s*none/.test(css), "reduced motion stops the animation");
assert.ok(!/prefers-color-scheme/.test(css), "no prefers-color-scheme");
// housekeeping
assert.strictEqual(fs.readFileSync("js/app.js", "utf8").match(/APP_VERSION = "(v\d+)"/)[1], fs.readFileSync("sw.js", "utf8").match(/godsmash-(v\d+)/)[1], "APP_VERSION and CACHE_NAME agree");
console.log("classic-animated-v275 OK");
