/* Run: node tests/no-dup-functions.test.js — v246: every script shares one global scope, so a repeated
   top-level function name silently replaces the earlier one (v245 broke the score editor this way) */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var seen = {}, dups = [];
fs.readdirSync("js").filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
  var src = fs.readFileSync("js/" + f, "utf8"), re = /^function ([A-Za-z0-9_$]+)\s*\(/gm, m;
  while ((m = re.exec(src))) { if (seen[m[1]]) dups.push(m[1] + " (" + seen[m[1]] + ", " + f + ")"); else seen[m[1]] = f; }
});
assert.deepStrictEqual(dups, [], "top-level function names repeat: " + dups.join("; "));
// the score editor draws its -/+ buttons, the step stepper draws the step list
var tc = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, t: function (k) { return "[" + k + "]"; }, escapeHtml: function (v) { return String(v); }, icon: function (n) { return "<i>" + n + "</i>"; } };
vm.createContext(tc); vm.runInContext(fs.readFileSync("js/tournament.js", "utf8"), tc);
var T = tc.tourNew(["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7"], function () { return 0.42; });
tc._tnSide = function () { return "<span>side</span>"; };
var ed = tc._tnStepper(T, T.games[0], "a", 7);
assert.ok(/data-act="adj"[^>]*data-d="-1"/.test(ed) && /data-d="1"/.test(ed) && /<b>7<\/b>/.test(ed), "score stepper: minus, plus and the score");
assert.ok(/<ol class="tn-steps"/.test(tc._tnSteps(0, 0)), "step stepper: the step list");
console.log("no-dup-functions OK");
