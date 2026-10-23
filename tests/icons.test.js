/* Run: node tests/icons.test.js — icon styles: classic everywhere, the chosen style only while the dashboard renders */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ctx = { localStorage: { getItem: function () { return "line"; }, setItem: function () {} } }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/icons.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("js/icons-sets.js", "utf8"), ctx);
assert.strictEqual(ctx.currentIconTheme, "line", "saved style is read");
assert.deepStrictEqual(JSON.stringify(ctx.ICON_THEMES), JSON.stringify(["classic", "line", "duo", "tiles"]));
var classic = ctx.iconAs("classic", "trophy", 20);
assert.ok(/^<svg class="si"/.test(classic) && classic.indexOf("viewBox=\"0 0 24 24\"") > 0 && classic.indexOf("ico-") < 0, "classic is the Solar svg");
assert.strictEqual(ctx.icon("trophy", 20), classic, "outside Home and the dashboard every page keeps the classic icon, whatever the setting");
ctx._iconCtx = true;
var line = ctx.icon("trophy", 20);
assert.ok(line.indexOf("viewBox=\"0 0 256 256\"") > 0 && line.indexOf("class=\"si ph\"") > 0 && line !== classic, "line is a different icon set (Phosphor regular)");
var duo = ctx.iconAs("duo", "trophy", 20); assert.ok(/ico-dc ico-dc\d/.test(duo) && duo.indexOf("opacity=\"0.2\"") > 0, "duotone keeps its soft second layer and gets a colour class");
assert.notStrictEqual(duo, line); assert.notStrictEqual(ctx.iconAs("tiles", "trophy", 20), line);
var tile = ctx.iconAs("tiles", "bill", 20); assert.ok(/ico-tile ico-t\d/.test(tile) && tile.indexOf("<svg class=\"si ph\"") > 0, "tiles wrap a filled icon");
["chevron", "back", "plus", "close", "search", "edit"].forEach(function (n) { ["tiles", "duo"].forEach(function (th) { assert.ok(/^<svg class="si ph/.test(ctx.iconAs(th, n, 18)) && ctx.iconAs(th, n, 18).indexOf("ico-") < 0, n + " stays a plain line icon in " + th); }); });
assert.strictEqual(ctx.icon("does-not-exist", 18), "", "unknown icon");
// every icon the app draws has a place in all three Phosphor sets
var used = {}; ["dashboard.js", "home.js", "health-ui.js", "payments.js", "stats.js", "sessions.js", "polls.js", "settings.js", "public.js", "sharecard.js"].forEach(function (f) { (fs.readFileSync("js/" + f, "utf8").match(/\bicon\("([a-z0-9]+)"/g) || []).forEach(function (m) { used[m.slice(6, -1)] = 1; }); });
(fs.readFileSync("index.html", "utf8").match(/data-icon="([a-z0-9]+)"/g) || []).forEach(function (m) { used[m.slice(11, -1)] = 1; });
Object.keys(used).forEach(function (n) { if (!ctx.SOLAR[n]) return; ["line", "duo", "fill"].forEach(function (set) { assert.ok(ctx.ICON_SETS[set][n], "icon set " + set + " has " + n); }); });
ctx._iconCtx = false;
ctx.setIconTheme("nope"); assert.strictEqual(ctx.currentIconTheme, "line", "an unknown style is ignored");
ctx.setIconTheme("tiles"); assert.strictEqual(ctx.currentIconTheme, "tiles");
var old = { localStorage: { getItem: function () { return "emoji"; }, setItem: function () {} } }; vm.createContext(old); vm.runInContext(fs.readFileSync("js/icons.js", "utf8"), old);
assert.strictEqual(old.currentIconTheme, "duo", "an old saved emoji style becomes duotone");
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
["iconStyle", "iconStyleHint", "icon_classic", "icon_line", "icon_duo", "icon_tiles"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
console.log("icons OK");
