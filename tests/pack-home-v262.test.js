/* Run: node tests/pack-home-v262.test.js — v262: the dashboard icon pack also applies on Home (the bottom-bar "Dashboard") */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ctx = { console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } };
vm.createContext(ctx);
["icons-solar-bold", "icons-sets", "icons"].forEach(function (f) { vm.runInContext(fs.readFileSync("js/" + f + ".js", "utf8"), ctx); });
var home = fs.readFileSync("js/home.js", "utf8");
assert.ok(/function renderHome\(\) \{[\s\S]{0,200}_dashCtx = true;[\s\S]{0,120}_renderHomeInner\(\)[\s\S]{0,60}_dashCtx = was;/.test(home), "renderHome draws inside the dashboard context and restores it");
// with the context on, icon() follows the pack; off, the icon style
var out = {};
["clay", "sticker", "same"].forEach(function (p) { vm.runInContext("currentDashPack = " + JSON.stringify(p) + "; _dashCtx = true;", ctx); out[p] = ctx.icon("users", 24); });
vm.runInContext("_dashCtx = false;", ctx);
var plain = ctx.icon("users", 24);
assert.notStrictEqual(out.clay, out.sticker, "clay and sticker draw differently on Home");
assert.strictEqual(out.same, plain, "same = the chosen icon style");
console.log("pack-home-v262 OK");
