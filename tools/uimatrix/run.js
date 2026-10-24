/* node tools/uimatrix/run.js [outDir] : theme x icon style x page layout matrix in headless Chrome (phone width). Not part of release-guard. */
var fs = require("fs"), cp = require("child_process"), path = require("path");
var out = process.argv[2] || path.join(process.cwd(), "tools/uimatrix/out");
cp.execFileSync("node", [path.join(__dirname, "build.js"), out], { stdio: "inherit" });
var r = cp.spawnSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--window-size=500,900", "--virtual-time-budget=600000", "--dump-dom", "file://" + out + "/wrapper.html"], { maxBuffer: 1 << 28, timeout: 900000 });
var dom = r.stdout.toString(), m = dom.match(/<pre id="res">([\s\S]*?)<\/pre>/);
if (!m) { console.log("no result; page head:", dom.slice(0, 400)); process.exit(1); }
var D = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(D));
// group: same problem (type + selector + page) in how many combos
var g = {}; D.issues.forEach(function (i) { var k = i.type + " | " + i.page + " | " + i.sel; (g[k] = g[k] || { n: 0, ex: i.extra, combos: {} }).n++; g[k].combos[i.combo] = 1; });
console.log(D.renders + " renders, " + D.audited + " elements checked, " + D.issues.length + " issues, " + Object.keys(g).length + " distinct, " + D.errors.length + " script errors");
Object.keys(g).sort(function (a, b) { return g[b].n - g[a].n; }).slice(0, +process.env.TOP || 60).forEach(function (k) { console.log(g[k].n + "x  " + k + "  [" + g[k].ex + "]  e.g. " + Object.keys(g[k].combos).slice(0, 2).join(" ; ")); });
var errs = {}; D.errors.forEach(function (e) { errs[e] = (errs[e] || 0) + 1; }); Object.keys(errs).slice(0, 15).forEach(function (e) { console.log("ERR " + errs[e] + "x " + e); });
