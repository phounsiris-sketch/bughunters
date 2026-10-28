// v264: Progress sheet layout rules (padding / grid / safe area)
var assert = require("assert"), fs = require("fs"), path = require("path");
var css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
var js = fs.readFileSync(path.join(__dirname, "..", "js", "stats.js"), "utf8");
function rule(sel) {
  var i = css.indexOf(sel + " {"); assert.ok(i >= 0, "missing rule " + sel);
  return css.slice(i, css.indexOf("}", i));
}
var sheet = rule(".pg-sheet");
assert.ok(/padding:\s*10px 16px calc\(20px \+ env\(safe-area-inset-bottom\)\)/.test(sheet), "sheet padding with safe-area");
assert.ok(/margin:\s*0;\s*padding:\s*14px/.test(rule(".pg-sheet .card")), "cards: no own margin, 14px padding");
assert.ok(/gap:\s*12px/.test(rule(".pg-in")), "uniform 12px gap between cards");
assert.ok(/align-items:\s*center/.test(rule(".pg-head")), "header centred");
var chips = rule(".pg-sheet .scope-chips");
assert.ok(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/.test(chips), "chips are an even grid");
assert.ok(/margin:\s*12px 0 0/.test(chips), "gap select to chips 12px, no bottom margin");
assert.ok(/max-width:\s*359px\)\s*\{\s*\.pg-sheet \.scope-chips\s*\{\s*grid-template-columns:\s*repeat\(6/.test(css), "narrow wrap 3+2");
assert.ok(/align-items:\s*baseline/.test(rule(".pg-sheet .progress-head")), "chart head baseline");
assert.ok(/repeat\(4,\s*minmax\(0,\s*1fr\)\)/.test(rule(".pg-stats")), "stats 4 equal columns");
assert.ok(/max-width:\s*359px\)\s*\{\s*\.pg-stats\s*\{\s*grid-template-columns:\s*repeat\(2/.test(css), "stats 2x2 on narrow");
assert.ok(/border-left:\s*0/.test(rule(".pg-sheet .ins-row")), "no border-left on pair cards");
assert.ok(/class="card pg-filter"/.test(js) && /class="pg-stats"/.test(js), "markup uses the new classes");
assert.ok(/-14 -12/.test(js), "sparkline has inner horizontal padding");
console.log("progress-layout-v264 ok");
