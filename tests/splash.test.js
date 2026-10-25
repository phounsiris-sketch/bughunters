/* Run: node tests/splash.test.js — one splash design, coloured by the chosen theme, under one second */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var splash = fs.readFileSync("js/splash.js", "utf8"), app = fs.readFileSync("js/app.js", "utf8"), router = fs.readFileSync("js/router.js", "utf8"), html = fs.readFileSync("index.html", "utf8"), css = fs.readFileSync("css/styles.css", "utf8");
var pal = vm.runInNewContext("(" + splash.match(/var PALS = (\{[\s\S]*?\n  \});/)[1] + ")");
var ids = [];
(app.match(/var PALETTES = (\[[\s\S]*?\n\]);/)[1].match(/\["([a-z]+)", "pal/g) || []).forEach(function (m) { ids.push(m.slice(2, m.indexOf('"', 2))); });
(app.match(/var LIGHT_PALETTES = (\[[\s\S]*?\n\]);/)[1].match(/\["([a-z]+)", "pal/g) || []).forEach(function (m) { ids.push(m.slice(2, m.indexOf('"', 2))); });
(app.match(/var SPECIALS = (\[[\s\S]*?\n\]);/)[1].match(/\["([a-z]+)", "sp/g) || []).forEach(function (m) { ids.push(m.slice(2, m.indexOf('"', 2))); });
assert.ok(ids.length >= 17, "found the style ids: " + ids.length);
ids.forEach(function (id) { var p = pal[id]; assert.ok(p && ["hot", "hot2", "stone", "deep"].every(function (k) { return p[k] && p[k].length === 3 && p[k].every(function (v) { return v >= 0 && v <= 255; }); }), "the splash has colours for " + id); });
assert.ok(splash.indexOf("pickPal()") > 0 && /localStorage\.getItem\(k\)/.test(splash), "the colours come from the saved theme");
assert.ok(html.indexOf("godsmash_splash") < 0 && html.indexOf("sp-blue") < 0 && html.indexOf("sp-red") < 0, "no more red/blue alternation");
assert.ok(html.indexOf("sp3fx") < 0 && splash.indexOf("getContext") < 0 && splash.indexOf("requestAnimationFrame") < 0, "no canvas: the splash is plain CSS");
assert.ok(/class="sp-court"/.test(html) && (html.match(/<path class="c\d"/g) || []).length === 4, "the badminton court is drawn as lines behind the logo");
assert.ok(/prefers-reduced-motion: reduce\) \{\s*#splash::before/.test(css), "reduced motion shows a still frame");
var min = +router.match(/\? (\d+) : (\d+);\s*\/\/ plus a \.25 s fade/)[2];
assert.ok(min + 250 <= 1000, "minimum on screen " + min + " ms + 250 ms fade stays under 1 s");
assert.ok(/#splash \{[^}]*transition: opacity 0\.25s/.test(css), "fade is 0.25 s");
console.log("splash OK");
