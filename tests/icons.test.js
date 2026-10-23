/* Run: node tests/icons.test.js — icon styles: classic everywhere, the chosen style only while the dashboard renders */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ctx = { localStorage: { getItem: function () { return "line"; }, setItem: function () {} } }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/icons.js", "utf8"), ctx);
assert.strictEqual(ctx.currentIconTheme, "line", "saved style is read");
var classic = ctx.iconAs("classic", "trophy", 20);
assert.ok(/^<svg class="si"/.test(classic) && classic.indexOf("ico-") < 0, "classic is the plain svg");
assert.strictEqual(ctx.icon("trophy", 20), classic, "outside the dashboard every page keeps the classic icon, whatever the setting");
ctx._iconCtx = true;
assert.ok(ctx.icon("trophy", 20).indexOf("ico-line") > 0, "inside the dashboard the chosen style applies");
assert.ok(/ico-tile ico-t\d/.test(ctx.iconAs("tiles", "bill", 20)) && ctx.iconAs("tiles", "bill", 20).indexOf("<svg") > 0, "tiles wrap the svg");
assert.ok(ctx.iconAs("emoji", "trophy", 20).indexOf("ico-chip") > 0 && ctx.iconAs("emoji", "trophy", 20).indexOf("ico-emoji") > 0 && ctx.iconAs("emoji", "trophy", 20).indexOf("<svg") < 0, "emoji sits on a soft chip and replaces the svg");
["chevron", "back", "plus", "close", "search"].forEach(function (n) { ["tiles", "emoji"].forEach(function (th) { assert.ok(/^<svg/.test(ctx.iconAs(th, n, 18)), n + " stays a plain svg in " + th); }); });
assert.strictEqual(ctx.iconAs("emoji", "settings", 18).indexOf("ico-emoji") > 0, true);
assert.strictEqual(ctx.icon("does-not-exist", 18), "", "unknown icon");
ctx._iconCtx = false;
ctx.setIconTheme("nope"); assert.strictEqual(ctx.currentIconTheme, "line", "an unknown style is ignored");
ctx.setIconTheme("tiles"); assert.strictEqual(ctx.currentIconTheme, "tiles");
// nav bar + app bar follow the style on the dashboard page only
var calls = []; ctx.document = { body: { setAttribute: function (k, v) { calls.push(["attr", k, v]); } }, querySelector: function (sel) { return { sel: sel }; } };
ctx.fillStaticIcons = function (root) { calls.push([root.sel, ctx._iconCtx]); };
ctx.currentIconTheme = "tiles"; ctx._chromeKey = ""; calls.length = 0;
ctx.applyChromeIcons("stats"); assert.strictEqual(calls.length, 0, "other pages: nothing to change");
ctx.applyChromeIcons("home"); assert.ok(calls.some(function (c) { return c[0] === ".bottom-nav" && c[1] === true; }) && calls.some(function (c) { return c[0] === ".app-header" && c[1] === true; }), "dashboard: nav and app bar drawn in the chosen style");
assert.ok(calls.some(function (c) { return c[0] === "attr" && c[2] === "tiles"; }), "body marked with the style");
calls.length = 0; ctx.applyChromeIcons("dashboard"); assert.strictEqual(calls.length, 0, "dashboard shares the same state as home: no redraw when nothing changed");
ctx.applyChromeIcons("stats"); assert.ok(calls.some(function (c) { return c[0] === ".bottom-nav" && c[1] === false; }), "leaving the dashboard: back to classic");
assert.strictEqual(ctx._iconCtx, false, "context is always switched off again");
ctx.currentIconTheme = "classic"; ctx._chromeKey = ""; calls.length = 0; ctx.applyChromeIcons("dashboard"); assert.strictEqual(calls.length, 0, "classic style changes nothing");
// the dashboard is wrapped, other pages are not
var dash = fs.readFileSync("js/dashboard.js", "utf8");
assert.ok(/function _renderDashboard\(\) \{\s*_iconCtx = true;\s*try \{ _renderDashboardInner\(\); \} finally \{ _iconCtx = false; \}/.test(dash), "dashboard render switches the style on and always off again");
var homeSrc = fs.readFileSync("js/home.js", "utf8");
assert.ok(/function renderHome\(\) \{\s*_iconCtx = true;\s*try \{ _renderHomeInner\(\); \} finally \{ _iconCtx = false; \}/.test(homeSrc), "home render switches the style on and always off again");
assert.ok(fs.readdirSync("js").filter(function (f) { return /\.js$/.test(f) && f !== "dashboard.js" && f !== "home.js" && f !== "icons.js"; }).every(function (f) { return fs.readFileSync("js/" + f, "utf8").indexOf("_iconCtx = true") < 0; }), "no other page switches it on");
var i18n = fs.readFileSync("js/i18n.js", "utf8");
["iconStyle", "iconStyleHint", "icon_classic", "icon_line", "icon_tiles", "icon_emoji"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
console.log("icons OK");
