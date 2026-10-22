/* node tools/check-static.js — catches what once slipped through: duplicate i18n keys, EN/LA key mismatch,
   a <script> in index.html that the service worker does not precache, a precached file that does not exist. */
var fs = require("fs"), path = require("path"), bad = [];
var root = path.join(__dirname, "..");
var rd = function (f) { return fs.readFileSync(path.join(root, f), "utf8"); };

// 1) i18n: duplicate keys inside one language, and keys only one language has
var lines = rd("js/i18n.js").split("\n"), sec = null, keys = { en: {}, la: {} };
lines.forEach(function (l, i) {
  if (/^  en: \{/.test(l)) sec = "en"; else if (/^  la: \{/.test(l)) sec = "la";
  var m = sec && l.match(/^    ([A-Za-z0-9_]+):/);
  if (!m) return;
  if (keys[sec][m[1]]) bad.push("i18n duplicate key '" + m[1] + "' in " + sec + " (lines " + keys[sec][m[1]] + " and " + (i + 1) + ")");
  else keys[sec][m[1]] = i + 1;
});
Object.keys(keys.en).forEach(function (k) { if (!keys.la[k]) bad.push("i18n key '" + k + "' missing in Lao"); });
Object.keys(keys.la).forEach(function (k) { if (!keys.en[k]) bad.push("i18n key '" + k + "' missing in English"); });

// 2) every local <script> is precached, every precached file exists
var scripts = (rd("index.html").match(/<script src="([^"]+)"/g) || []).map(function (x) { return x.slice(13, -1); }).filter(function (x) { return !/^https?:/.test(x); });
var sw = rd("sw.js"), pre = (sw.match(/'\.\/([^']+)'/g) || []).map(function (x) { return x.slice(3, -1); });
scripts.forEach(function (s) { if (pre.indexOf(s) < 0) bad.push("sw.js ASSETS is missing " + s); });
pre.forEach(function (p) { if (p && !fs.existsSync(path.join(root, p))) bad.push("sw.js ASSETS lists a file that does not exist: " + p); });

if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
console.log("static OK (" + Object.keys(keys.en).length + " keys, " + scripts.length + " scripts)");
