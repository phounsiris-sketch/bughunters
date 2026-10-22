/* Run: node tests/security.test.js — the XSS guards: safeUrl, jsq, escapeHtml, imgSrcAttrs, and that no raw stored value reaches src="..." */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var app = fs.readFileSync("js/app.js", "utf8");
function grab(name) { var m = app.match(new RegExp("function " + name + "\\([\\s\\S]*?\\n}\\n")); assert.ok(m, name + " found"); return m[0]; }
var ctx = {}; vm.createContext(ctx);
vm.runInContext(grab("jsq") + grab("safeUrl") + grab("escapeHtml"), ctx);
var evil = 'x" onerror="alert(1)';
assert.strictEqual(ctx.safeUrl(evil), "", "quote breakout rejected");
assert.strictEqual(ctx.safeUrl("javascript:alert(1)"), "");
assert.strictEqual(ctx.safeUrl("data:text/html;base64,PHNjcmlwdD4="), "", "non-image data URL rejected");
assert.strictEqual(ctx.safeUrl("data:image/svg+xml;base64,PHN2Zz4="), "", "svg rejected");
assert.strictEqual(ctx.safeUrl("data:image/jpeg;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
assert.strictEqual(ctx.safeUrl("img:AbC123_-x"), "img:AbC123_-x");
assert.strictEqual(ctx.safeUrl("https://example.com/a.png"), "https://example.com/a.png");
assert.strictEqual(ctx.safeUrl('https://example.com/a.png" onerror="x'), "", "quote in an https url rejected");
assert.strictEqual(ctx.safeUrl("data:image/jpeg;base64,AAA\"onerror=\"x"), "");
assert.strictEqual(ctx.jsq("abc123_-DEF"), "abc123_-DEF");
assert.strictEqual(ctx.jsq("x');fetch('//e');//"), "xfetche", "handler breakout characters dropped");
assert.strictEqual(ctx.escapeHtml('<img src=x onerror=a()>"\''), "&lt;img src=x onerror=a()&gt;&quot;&#39;" , "escapeHtml");
// no raw stored value into src="..." anywhere in the app code
var bad = [];
fs.readdirSync("js").filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
  fs.readFileSync("js/" + f, "utf8").split("\n").forEach(function (line, i) {
    var m = line.match(/src="' \+ ([^+]+?) \+ '"/g);
    (m || []).forEach(function (x) {
      var inner = x.replace(/^src="' \+ /, "").replace(/ \+ '"$/, "");
      if (!/safeUrl\(|escapeHtml\(|IMG_BLANK|_imgCache|dataUrl\b/.test(inner)) bad.push(f + ":" + (i + 1) + " " + inner);
    });
  });
});
assert.deepStrictEqual(bad, [], "unguarded src sinks: " + bad.join(" | "));
console.log("security OK");
