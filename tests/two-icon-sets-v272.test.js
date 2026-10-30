/* Run: node tests/two-icon-sets-v272.test.js — v272: exactly two icon settings. System icons (icon theme, drawn by icon()) and Menu icons (pack, drawn by menuIcon:
   bottom bar, the 5 menu page titles, Home tiles). Also the v271 -> v272 migration, titles, and the i18n strings in both languages. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function load(store) {
  var ctx = { console: console, localStorage: { getItem: function (k) { return store[k] == null ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } } };
  vm.createContext(ctx);
  ["js/icons.js", "js/icons-sets.js", "js/icons-solar-bold.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx); });
  ctx.t = function (k) { return "T:" + k; };
  var app = fs.readFileSync("js/app.js", "utf8"), i0 = app.indexOf("function fillStaticIcons"), i1 = app.indexOf("\nfillStaticIcons();");
  vm.runInContext(app.slice(i0, i1), ctx);
  return ctx;
}
var NAMES = ["dashboard", "sessions", "ranking", "globe", "settings"];

// 1. migration from v271 values (dashPack = stored pack, navIcons = plain | style | pack)
var cases = [
  [{}, "3d", "fresh install / nothing saved"],
  [{ navIcons: "plain" }, "3d", "v271 plain, no pack saved"],
  [{ navIcons: "style" }, "3d", "v271 same as Icon style, no pack saved"],
  [{ navIcons: "pack" }, "clay", "v271 same as Dashboard icons, never picked a pack: the bar showed the old default (clay), keep it"],
  [{ dashPack: "clay", navIcons: "plain" }, "clay", "saved clay is kept"],
  [{ dashPack: "sticker", navIcons: "style" }, "sticker", "saved sticker is kept"],
  [{ dashPack: "sticker", navIcons: "pack" }, "sticker", "saved sticker with nav pack is kept"],
  [{ dashPack: "3d", navIcons: "pack" }, "3d", "saved 3d is kept"],
  [{ dashPack: "same", navIcons: "pack" }, "3d", "the removed option 'same' becomes 3d"],
  [{ dashPack: "same", navIcons: "plain" }, "3d", "'same' becomes 3d"],
  [{ dashPack: "bogus" }, "3d", "garbage becomes 3d"]
];
cases.forEach(function (c) {
  var store = JSON.parse(JSON.stringify(c[0])), ic = store.iconTheme; var ctx = load(store);
  assert.strictEqual(ctx.currentDashPack, c[1], c[2]);
  assert.strictEqual(store.dashPack, c[1], "migrated value is stored: " + c[2]);
  assert.ok(!("navIcons" in store), "old navIcons key removed: " + c[2]);
  assert.strictEqual(store.iconTheme, ic, "System icons theme untouched: " + c[2]);
});
var keep = load({ iconTheme: "glass", navIcons: "style" }); assert.strictEqual(keep.currentIconTheme, "glass", "System icons keep the saved style");
assert.deepStrictEqual(JSON.stringify(keep.DASH_PACKS), JSON.stringify(["clay", "sticker", "3d"]), "packs: clay, sticker, 3d (no 'same')");
["currentNavIcons", "NAV_ICON_MODES", "navIconTheme", "setNavIcons", "_dashCtx"].forEach(function (n) { assert.strictEqual(typeof keep[n], "undefined", n + " is gone"); });

// 2. icon() = System icons always; menuIcon() = pack always
var ctx = load({}); ctx.currentIconTheme = "box";
["clay", "sticker", "3d"].forEach(function (p) {
  ctx.currentDashPack = p;
  assert.ok(/ico-bx/.test(ctx.icon("trophy", 20)), p + ": icon() is the System icons style");
  var m = ctx.menuIcon("trophy", 20); assert.ok(p === "3d" ? /ico-3d/.test(m) : new RegExp("ico-" + p).test(m), p + ": menuIcon() is the pack");
  assert.ok(!/ico-bx/.test(m), p + ": menuIcon() ignores the System icons style");
});
ctx.currentDashPack = "3d"; assert.ok(/#g3d-i-trophy/.test(ctx.menuIcon("ranking", 24)), "3d: Ranking is the trophy");
assert.ok(ctx.menuIcon("dashboard", 24).indexOf("#g3d-i-") > 0 && ctx.menuIcon("dashboard", 24) !== ctx.menuIcon("ranking", 24), "Dashboard is the chart, not the Ranking trophy");
assert.ok(ctx.menuIcon("dashboard", 24, "", "clay").indexOf("ico-clay") > 0, "menuIcon(pack) previews another pack");

// 3. the bottom bar always draws the pack (one size, whatever the System icons style)
["classic", "box", "neu", "glass", "tiles"].forEach(function (th) {
  ["clay", "sticker", "3d"].forEach(function (p) {
    ctx.currentIconTheme = th; ctx.currentDashPack = p;
    var els = NAMES.map(function (n) { var cls = {}; return { _n: n, cls: cls, html: "", classList: { add: function (c) { cls[c] = true; } }, getAttribute: function (a) { return a === "data-icon" ? n : a === "data-size" ? "24" : null; }, hasAttribute: function (a) { return a === "data-plain"; }, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; } }; });
    ctx.document = { querySelectorAll: function () { return els; } }; ctx.fillStaticIcons();
    els.forEach(function (e) {
      assert.ok(e.cls["nav-rich"], th + "/" + p + ": nav-rich");
      // the 3D pack has no Globe / Settings object (iconAs falls back to clay for names without a drawing, same as on the Dashboard before v272)
      var fb3d = p === "3d" && /ico-clay/.test(e.html) && (e._n === "globe" || e._n === "settings");
      assert.ok(fb3d || (p === "3d" ? /ico-3d/.test(e.html) : new RegExp("ico-" + p).test(e.html)), th + "/" + p + ": bar icon is the pack (" + e._n + ")");
      var w = /width="(\d+)"/.exec(e.html); assert.ok(w && +w[1] >= 24 && +w[1] <= 28, th + "/" + p + ": about 26px (" + (w && w[1]) + ")");
    });
  });
});
var other = { html: "", classList: { add: function () {} }, getAttribute: function (a) { return a === "data-icon" ? "trophy" : "24"; }, hasAttribute: function () { return false; }, set innerHTML(v) { this.html = v; } };
ctx.currentIconTheme = "neu"; ctx.document = { querySelectorAll: function () { return [other]; } }; ctx.fillStaticIcons(); assert.strictEqual(other.html, ctx.icon("trophy", 24), "app bar / other static icons follow the System icons");

// 4. titles: menuTitleHtml, same box in every pack; used by exactly the 5 menu pages
["clay", "sticker", "3d"].forEach(function (p) {
  ctx.currentDashPack = p; var h = ctx.menuTitleHtml("sessions", "navGames");
  assert.ok(/^<div class="me-title">/.test(h) && h.indexOf("T:navGames") > 0, p + ": title row has the text");
  var w = /width="(\d+)"/.exec(h); assert.ok(w && Math.abs(+w[1] - 30) <= 3, p + ": title icon about 30px (" + (w && w[1]) + ")");
});
var src = function (f) { return fs.readFileSync("js/" + f + ".js", "utf8"); };
assert.ok(/menuTitleHtml\("dashboard", "navDashboard"\)/.test(src("home")), "Home title");
assert.ok(/menuTitleHtml\("sessions", "navGames"\)/.test(src("games")), "Sessions title");
assert.ok(/menuTitleHtml\("ranking", "navRankings"\)/.test(src("stats")), "Rankings title");
assert.ok(/menuTitleHtml\("globe", "navCommunity"\)/.test(src("public")) && /id="publicTitle"/.test(fs.readFileSync("index.html", "utf8")), "Community title + slot in the page shell");
assert.ok(/menuTitleHtml\("settings", "navSettings"\)/.test(src("settings")), "Settings title");
assert.ok(!/_dashCtx|currentNavIcons|setNavIcons|navIconTheme/.test(fs.readdirSync("js").map(function (f) { return /\.js$/.test(f) ? src(f.replace(/\.js$/, "")) : ""; }).join("\n")), "no v271 leftovers in js/");

// 5. changing either setting redraws the bars, the page on screen and the preview
var calls = [], c2 = load({}); c2.document = { body: { setAttribute: function () {} }, querySelector: function (s) { return { sel: s }; }, querySelectorAll: function () { return []; } };
c2.fillStaticIcons = function (root) { calls.push("bar:" + root.sel); }; c2.refreshCurrentPage = function (why) { calls.push("page:" + why); }; c2.renderSettings = function () { calls.push("settings"); };
["setIconTheme('glass')", "setDashPack('clay')", "setG3dVariant('clay')"].forEach(function (call, i) {
  calls.length = 0; c2._chromeKey = "x"; vm.runInContext(call, c2);
  if (i < 2) assert.ok(calls.indexOf("bar:.bottom-nav") >= 0, call + " redraws the bottom bar");
  assert.ok(calls.indexOf("page:icons") >= 0 && calls.indexOf("settings") >= 0, call + " redraws the page and Settings");
});
c2.setDashPack("bogus"); assert.strictEqual(c2.currentDashPack, "clay", "invalid pack ignored");

// 6. Settings: two groups, previews, no third setting; i18n
var st = src("settings"), i18n = src("i18n"), tr = {};
vm.runInNewContext(i18n + "\n;this.__tr = translations;", tr);
assert.ok(/sysIcons/.test(st) && /menuIcons/.test(st) && /id="sysIconsPreview"/.test(st) && /id="menuIconsPreview"/.test(st), "Settings shows System icons + Menu icons with previews");
assert.ok(/setIconTheme\(/.test(st) && /setDashPack\(/.test(st) && !/setNavIcons/.test(st), "two settings, no nav bar setting");
["en", "la"].forEach(function (lang) {
  ["iconsGroup", "sysIcons", "sysIconsHint", "menuIcons", "menuIconsHint", "dashPack_3d", "dashPack_clay", "dashPack_sticker", "g3dVariant", "g3dVariantHint", "navDashboard", "navGames", "navRankings", "navCommunity", "navSettings"].forEach(function (k) {
    assert.ok(tr.__tr[lang][k] && String(tr.__tr[lang][k]).trim(), lang + "." + k + " present");
  });
  ["iconStyle", "iconStyleHint", "navIcons", "navIconsHint", "navIconsPlain", "navIconsStyle", "navIconsPack", "dashPack", "dashPackHint", "dashPackSame", "dashPack3d", "dashPackClay", "dashPackSticker"].forEach(function (k) {
    assert.strictEqual(tr.__tr[lang][k], undefined, lang + "." + k + " removed");
  });
  Object.keys(tr.__tr[lang]).forEach(function (k) { if (/^(sysIcons|menuIcons)/.test(k)) assert.ok(!/\{|undefined/.test(tr.__tr[lang][k]), lang + "." + k + " is clean"); });
});
assert.strictEqual(tr.__tr.en.sysIcons, "System icons"); assert.strictEqual(tr.__tr.en.menuIcons, "Menu icons");
// every icon theme + pack name used in Settings has a label in both languages
["box", "neu", "glass", "classic", "tiles"].forEach(function (id) { assert.ok(tr.__tr.en["icon_" + id] && tr.__tr.la["icon_" + id], "icon_" + id); });
// uimatrix: "<System>+<pack>" only
assert.ok(/"box\+3d", "glass\+sticker", "neu\+clay"/.test(fs.readFileSync("tools/uimatrix/driver.js", "utf8")), "uimatrix icons combos are two-part");
// version
assert.strictEqual(src("app").match(/APP_VERSION = "(v\d+)"/)[1], "v272"); assert.ok(/godsmash-v272/.test(fs.readFileSync("sw.js", "utf8")));
console.log("two-icon-sets-v272 OK");
