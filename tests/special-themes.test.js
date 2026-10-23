/* Run: node tests/special-themes.test.js — every special theme has its CSS, its texts (EN + LA) and a live-score colour set */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var app = fs.readFileSync("js/app.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), ls = fs.readFileSync("js/livescore.js", "utf8");
var m = app.match(/var SPECIALS = \[[\s\S]*?\n\];/); assert.ok(m, "SPECIALS found");
var ctx = {}; vm.createContext(ctx); vm.runInContext(m[0], ctx);
var themes = vm.runInContext("(" + ls.match(/var LS_THEMES = (\[[\s\S]*?\n\]);/)[1] + ")", ctx);
var idx = vm.runInContext("(" + ls.match(/var LS_SPECIAL_IDX = (\{[^}]*\});/)[1] + ")", ctx);
var seen = {};
ctx.SPECIALS.forEach(function (sp) {
  assert.ok(!seen[sp[0]], "duplicate id " + sp[0]); seen[sp[0]] = 1;
  assert.ok(css.indexOf('body[data-special="' + sp[0] + '"]:not([data-theme="light"]) {') >= 0, sp[0] + " has a CSS block");
  assert.ok(css.indexOf('body[data-special="' + sp[0] + '"]:not([data-theme="light"]) .hs-play') >= 0, sp[0] + " themes the home cards");
  [sp[1], sp[1] + "Sub", sp[1] + "Title"].forEach(function (k) {
    var n = (i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length;
    assert.strictEqual(n, 2, k + " must exist once in EN and once in LA (found " + n + ")");
  });
  assert.ok(sp[2].length === 4, sp[0] + " swatch has 4 colours");
  assert.ok(idx[sp[0]] && themes[idx[sp[0]]][0].toLowerCase() === sp[0], sp[0] + " has a live-score colour set");
});
console.log("special-themes OK (" + ctx.SPECIALS.length + " themes)");
