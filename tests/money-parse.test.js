/* Run: node tests/money-parse.test.js — parseMoney handles thousands dots and plain numbers */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var app = fs.readFileSync("js/app.js", "utf8");
var m = app.match(/function parseMoney\([\s\S]*?\n}\n/); assert.ok(m, "parseMoney found");
var ctx = {}; vm.createContext(ctx); vm.runInContext(m[0], ctx);
var p = ctx.parseMoney;
assert.strictEqual(p("1,234,567"), 1234567);
assert.strictEqual(p("1.234.567"), 1234567, "dots as thousands");
assert.strictEqual(p("1.234"), 1234, "one dot + 3 digits is thousands");
assert.strictEqual(p("12.5"), 12.5);
assert.strictEqual(p("50000"), 50000);
assert.strictEqual(p(""), 0);
assert.strictEqual(p("abc"), 0);
assert.strictEqual(p("-500"), 500, "minus sign stripped, never negative");
console.log("money-parse OK");
