/* Run: node tests/no-os-dark.test.js — the app's own colours are final: no OS dark-mode reaction, forced darkening opted out */
var fs = require("fs"), assert = require("assert");
var html = fs.readFileSync("index.html", "utf8"), css = fs.readFileSync("css/styles.css", "utf8"), app = fs.readFileSync("js/app.js", "utf8");
assert.ok(/<meta name="color-scheme" content="only (dark|light)">/.test(html), "meta color-scheme in index.html");
assert.ok(html.indexOf('name="color-scheme"') < html.indexOf('css/styles.css'), "meta comes before the CSS");
assert.ok(/function _syncColorScheme[\s\S]*?"only light" : "only dark"[\s\S]*?meta\[name="color-scheme"\]/.test(app), "JS maps theme to the meta");
assert.ok(/function applyTheme\(\)[\s\S]*?_syncColorScheme\(light\)/.test(app), "applyTheme sets the meta (covers palettes, specials, toggle)");
assert.ok(/body\[data-theme="light"\] \{ color-scheme: only light; \}/.test(css), "light = only light");
assert.ok(/body\[data-theme="dark"\] \{ color-scheme: only dark; \}/.test(css), "dark = only dark");
assert.ok(!/color-scheme:\s*(light|dark)\s*[;}]/.test(css), "no color-scheme without only");
fs.readdirSync("css").forEach(function (f) { assert.ok(!/prefers-color-scheme/.test(fs.readFileSync("css/" + f, "utf8")), "prefers-color-scheme in css/" + f); });
fs.readdirSync("js").forEach(function (f) { if (/\.js$/.test(f)) assert.ok(!/prefers-color-scheme/.test(fs.readFileSync("js/" + f, "utf8")), "prefers-color-scheme in js/" + f); });
assert.ok(!/filter:\s*invert/.test(css), "no invert hacks");
console.log("no-os-dark OK");
