/* Run: node tests/nav-icons-v271.test.js — "Nav bar icons" (v271): plain (default) / same as Icon style / same as Dashboard icons */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function load(store) {
  var ctx = { localStorage: { getItem: function (k) { return store[k] == null ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); } } };
  vm.createContext(ctx);
  ["js/icons.js", "js/icons-sets.js", "js/icons-solar-bold.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx); });
  // fillStaticIcons from app.js, run against fake elements
  var app = fs.readFileSync("js/app.js", "utf8"), i0 = app.indexOf("function fillStaticIcons"), i1 = app.indexOf("\nfillStaticIcons();");
  vm.runInContext(app.slice(i0, i1), ctx);
  return ctx;
}
function el(name, plain) {
  var cls = {};
  return { _n: name, html: "", cls: cls, classList: { toggle: function (c, on) { cls[c] = !!on; } },
    getAttribute: function (a) { return a === "data-icon" ? name : a === "data-size" ? "24" : null; }, hasAttribute: function (a) { return a === "data-plain" && plain; },
    set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; } };
}
function fill(ctx, els) { ctx.document = { querySelectorAll: function () { return els; } }; ctx.fillStaticIcons(); }
var NAMES = ["dashboard", "sessions", "ranking", "globe", "settings"];

// 1. default: plain, localStorage key, markup identical to the v270 nav
var store = {}, ctx = load(store);
assert.strictEqual(ctx.currentNavIcons, "plain", "default is plain");
assert.deepStrictEqual(JSON.stringify(ctx.NAV_ICON_MODES), JSON.stringify(["plain", "style", "pack"]));
var els = NAMES.map(function (n) { return el(n, true); }); fill(ctx, els);
els.forEach(function (e, i) { assert.strictEqual(e.html, ctx.iconAs("classic", NAMES[i], 24), "plain markup unchanged: " + NAMES[i]); assert.ok(!e.cls["nav-rich"], "no nav-rich class when plain"); });
var other = el("trophy", false); fill(ctx, [other]); assert.strictEqual(other.html, ctx.icon("trophy", 24), "header / other icons still follow icon()");
store.navIcons = "bogus"; assert.strictEqual(load(store).currentNavIcons, "plain", "an invalid saved value falls back to plain");
store.navIcons = "pack"; assert.strictEqual(load(store).currentNavIcons, "pack", "saved value is read back from localStorage navIcons");

// 2. same as Icon style
store = {}; ctx = load(store);
ctx.setNavIcons("style"); assert.strictEqual(store.navIcons, "style", "setNavIcons stores navIcons"); ctx.setNavIcons("nonsense"); assert.strictEqual(store.navIcons, "style", "invalid id ignored");
["box", "neu", "glass", "tiles"].forEach(function (th) {
  ctx.currentIconTheme = th; els = NAMES.map(function (n) { return el(n, true); }); fill(ctx, els);
  els.forEach(function (e) { assert.ok(e.cls["nav-rich"], th + ": nav-rich"); assert.ok(/ico-(bx|neu|gl|tile)/.test(e.html), th + ": plate drawn"); });
  var m = /width:(\d+)px/.exec(els[0].html); assert.ok(m && +m[1] >= 24 && +m[1] <= 28, th + ": plate is about 26px (" + (m && m[1]) + ")");
});
ctx.currentIconTheme = "classic"; els = NAMES.map(function (n) { return el(n, true); }); fill(ctx, els);
assert.strictEqual(els[0].html, ctx.iconAs("classic", "dashboard", 24)); assert.ok(!els[0].cls["nav-rich"], "classic style = the plain glyph, no rich class");

// 3. same as Dashboard icons: draws the pack svg; changing the pack re-renders the nav
store = {}; ctx = load(store); ctx.currentIconTheme = "box"; ctx.setNavIcons("pack");
ctx.document = { body: { setAttribute: function () {} }, querySelector: function (s) { return { sel: s }; }, querySelectorAll: function () { return []; } };
var redraws = []; ctx.fillStaticIcons = function (root) { redraws.push(root.sel); };
ctx.currentDashPack = "clay"; ctx._chromeKey = ""; ctx.applyChromeIcons(); redraws.length = 0;
ctx.setDashPack("3d"); assert.ok(redraws.indexOf(".bottom-nav") >= 0, "setDashPack re-renders the nav bar");
redraws.length = 0; ctx.applyChromeIcons(); assert.strictEqual(redraws.length, 0, "no redraw when nothing changed");
redraws.length = 0; ctx.setNavIcons("plain"); assert.ok(redraws.indexOf(".bottom-nav") >= 0, "setNavIcons re-renders the nav bar");
redraws.length = 0; ctx.setIconTheme("glass"); assert.ok(redraws.indexOf(".bottom-nav") >= 0, "setIconTheme re-renders the nav bar");
ctx.setNavIcons("pack");
var real = load({}); real.currentNavIcons = "pack"; real.currentIconTheme = "box";
real.currentDashPack = "3d"; var h3 = real.navIconHtml("dashboard", 24); assert.ok(/ico-3d/.test(h3) && /#g3d-i-/.test(h3), "3d pack: 3D object drawn");
real.currentDashPack = "clay"; assert.ok(/ico-clay/.test(real.navIconHtml("dashboard", 24)), "clay pack: clay svg");
real.currentDashPack = "sticker"; assert.ok(/ico-sticker/.test(real.navIconHtml("dashboard", 24)), "sticker pack: sticker svg");
real.currentDashPack = "same"; assert.ok(/ico-bx/.test(real.navIconHtml("dashboard", 24)), "pack 'same' = the icon style (box)");
["3d", "clay", "sticker"].forEach(function (p) { real.currentDashPack = p; var w = /width="(\d+)"/.exec(real.navIconHtml("settings", 24)); assert.ok(w && +w[1] >= 24 && +w[1] <= 28, p + ": about 26px (" + (w && w[1]) + ")"); });
real.currentNavIcons = "style"; real.currentIconTheme = "neu"; real.currentDashPack = "3d"; assert.ok(/ico-neu/.test(real.navIconHtml("dashboard", 24)) && !/ico-3d/.test(real.navIconHtml("dashboard", 24)), "style mode ignores the pack");

// 4. markup, css, i18n, settings
var html = fs.readFileSync("index.html", "utf8"), css = fs.readFileSync("css/styles.css", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), st = fs.readFileSync("js/settings.js", "utf8");
assert.strictEqual((html.match(/data-plain/g) || []).length, 5, "the 5 nav icons keep data-plain (the default markup is unchanged)");
assert.ok(/\.nav-item\.active \.nav-icon\.nav-rich > \* \{ transform: scale\(1\.3\)/.test(css) && /\.nav-icon:not\(\.nav-rich\) \.si \{ width: 24px/.test(css), "css: active icon grows, 24px override only for plain");
["iconsGroup", "navIcons", "navIconsHint", "navIconsPlain", "navIconsStyle", "navIconsPack"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN and LA"); });
assert.ok(/setNavIcons\(/.test(st) && /navIconHtml\(/.test(st), "Settings shows the 3rd setting with previews");
assert.ok(/The 5 buttons at the bottom/.test(i18n) && /Home shortcuts and detail pages/.test(i18n) && /Lists, cards and buttons across the app/.test(i18n), "EN hints");
console.log("nav-icons-v271 ok");
