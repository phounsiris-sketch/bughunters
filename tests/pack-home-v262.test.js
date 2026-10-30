/* Run: node tests/pack-home-v262.test.js — v262 (reworked v272): Home and the Menu icons pack (the bottom-bar "Dashboard") */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ctx = { console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } };
vm.createContext(ctx);
["icons-solar-bold", "icons-sets", "icons"].forEach(function (f) { vm.runInContext(fs.readFileSync("js/" + f + ".js", "utf8"), ctx); });
var home = fs.readFileSync("js/home.js", "utf8");
// v272: the broad dashboard context (_dashCtx) is gone. Home draws only its title and its shortcut tiles in the Menu icons pack (menuTitleHtml / icon3);
// the rest of Home uses icon() = the System icons. Details: tests/two-icon-sets-v272.test.js
assert.ok(!/_dashCtx/.test(home), "renderHome no longer switches a dashboard context");
assert.ok(/function renderHome\(\) \{\s*_renderHomeInner\(\);\s*\}/.test(home), "renderHome just draws");
assert.ok(/var html = menuTitleHtml\("dashboard", "navDashboard"\);/.test(home), "Home title is a Menu icons title");
var out = {};
["clay", "sticker", "3d"].forEach(function (p) { vm.runInContext("currentDashPack = " + JSON.stringify(p), ctx); out[p] = ctx.icon3("users", 24, "", null, 14); });
assert.notStrictEqual(out.clay, out.sticker, "clay and sticker draw Home tiles differently");
assert.notStrictEqual(out["3d"], out.clay, "3d draws Home tiles differently");
var sys = ctx.icon("users", 24);
["clay", "sticker", "3d"].forEach(function (p) { vm.runInContext("currentDashPack = " + JSON.stringify(p), ctx); assert.strictEqual(ctx.icon("users", 24), sys, "icon() ignores the pack: " + p); });
console.log("pack-home-v262 OK");
