/* Run: node tests/security-xss.test.js — stored-XSS guards (v211): data from the network never becomes HTML or code */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function load(files, extra) { var ctx = Object.assign({ console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } }, extra || {}); ctx.window = ctx; vm.createContext(ctx); files.forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx); }); return ctx; }
var BAD = '"><img src=x onerror=alert(1)>';
// t(): a missing key is text, never HTML (keys are built from stored data)
var i18n = fs.readFileSync("js/i18n.js", "utf8");
var tfn = i18n.slice(i18n.indexOf("function t(key)"), i18n.indexOf("}", i18n.indexOf("// A missing key") + 200) + 1);
var c = { translations: { en: { ok: "Fine" }, la: {} }, currentLang: "en" }; vm.createContext(c); vm.runInContext(tfn + "\nthis.t = t;", c);
assert.strictEqual(c.t("ok"), "Fine");
assert.ok(c.t("mode_" + BAD).indexOf("<") < 0 && c.t("mode_" + BAD).indexOf('"') < 0, "a missing key with markup is escaped");
assert.strictEqual(c.t("plainKey"), "plainKey", "a plain missing key is shown as before");
// no eval / new Function anywhere in the app code
fs.readdirSync("js").filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { var src = fs.readFileSync("js/" + f, "utf8"); assert.ok(!/new Function\s*\(|[^.\w]eval\s*\(/.test(src), f + " must not use eval or new Function"); });
// runAction: only simple calls of existing functions run
var app = fs.readFileSync("js/app.js", "utf8"), calls = [];
var rc = { showPage: function (p) { calls.push("showPage:" + p); }, showSessionDetail: function (i) { calls.push("ssd:" + i); }, publicTab: "x" }; rc.window = rc; vm.createContext(rc);
vm.runInContext(app.slice(app.indexOf("function runAction"), app.indexOf("/** A value that is safe inside a class name")), rc);
rc.runAction("showSessionDetail('ab-1')"); rc.runAction("publicTab='buddies';showPage('public')"); rc.runAction("showSessionDetail('x');fetch('//evil')"); rc.runAction("showSessionDetail('x\\');alert(1)//')");
assert.strictEqual(JSON.stringify(calls), JSON.stringify(["ssd:ab-1", "showPage:public", "ssd:x"]), "injected statements and arguments are ignored: " + JSON.stringify(calls));
assert.strictEqual(rc.publicTab, "buddies");
// cssId / jsq keep only letters, digits, - and _
var h = load([]); vm.runInContext(app.slice(app.indexOf("function cssId"), app.indexOf("/** A URL that is safe")), h);
assert.strictEqual(h.cssId(BAD), "imgsrcxonerroralert1"); assert.strictEqual(h.jsq("a');b"), "ab");
// live score: another phone's game is cleaned before it is drawn
var ls = fs.readFileSync("js/livescore.js", "utf8"), lc = { jsq: h.jsq }; vm.createContext(lc);
vm.runInContext(ls.slice(ls.indexOf("function _lsClean"), ls.indexOf("/** Which games are being counted now")), lc);
var g = lc._lsClean({ sa: BAD, sb: "9<b>", bo: 99, a: [BAD, "u1"], b: "x", sw: { A: BAD, B: 2 }, gl: [{ a: BAD, b: 21 }], serve: BAD, over: BAD, theme: BAD, test: "yes" });
assert.ok(g.sa === 0 && g.sb === 0 && g.bo === 5 && g.serve === "A" && g.over === null && g.theme === 0 && g.test === true, "numbers and words are coerced");
assert.deepStrictEqual(JSON.stringify(g.a), JSON.stringify(["imgsrcxonerroralert1", "u1"])); assert.strictEqual(JSON.stringify(g.b), "[]"); assert.strictEqual(g.sw.A, 0); assert.strictEqual(g.gl[0].a, 0); assert.strictEqual(g.gl[0].b, 21);
// the places that were open before print numbers escaped and ids through jsq
var sess = fs.readFileSync("js/sessions.js", "utf8"), social = fs.readFileSync("js/social.js", "utf8"), stats = fs.readFileSync("js/stats.js", "utf8");
assert.ok(sess.indexOf("showUserProfile(\\'' + u + '\\'") < 0 && social.indexOf("showUserProfile(\\'' + r.about + '\\'") < 0, "raw ids are not put in onclick");
assert.ok(stats.indexOf("' + m.minutes + '") < 0 && stats.indexOf("class=\"tag mode-' + mode + '\"") < 0, "match minutes and mode are escaped");
// rules: the open writers are checked
var rules = fs.readFileSync("firestore.rules", "utf8");
["liveOk(request.resource.data)", "modeOk(request.resource.data)", "in ['rude', 'harassment', 'fake', 'noshow', 'other']", "in ['racket', 'shoes', 'other']", "!isManual(request.resource.data)"].forEach(function (k) { assert.ok(rules.indexOf(k) > 0, "rules check: " + k); });
console.log("security xss OK");
