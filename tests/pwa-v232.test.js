/* Run: node tests/pwa-v232.test.js — offline QR library, "Update ready" bar instead of a silent reload, and the slim database error bar */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var read = function (f) { return fs.readFileSync(f, "utf8"); };
function slice(src, from, to) { var a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, "slice " + from); return src.slice(a, b); }

/* ---------- 1. the service worker keeps the QR generator offline ---------- */
var sw = read("sw.js"), assets = (sw.match(/var ASSETS = \[([\s\S]*?)\];/)[1].match(/'\.\/[^']*'/g) || []).map(function (x) { return x.slice(1, -1); });
assert.ok(assets.indexOf("./js/vendor/qrcode/qrcode.js") >= 0, "qrcode.js is precached");
assert.ok(/s\.src = "js\/vendor\/qrcode\/qrcode\.js"/.test(read("js/groups.js")), "and it is the file the invite page loads");
assets.forEach(function (a) { if (a !== "./") assert.ok(fs.existsSync(a.slice(2)), "precached file exists (one missing file would fail the whole install): " + a); });
assert.strictEqual(new Set(assets).size, assets.length, "no file listed twice");
assert.ok(/cache\.add\(new Request\(u, \{ cache: 'reload' \}\)\)/.test(sw), "fresh copies on install");

/* ---------- 2. update bar ---------- */
(function () {
  var created = [], reloads = 0, doc = { _els: {}, activeElement: { tagName: "BODY" }, getElementById: function (id) { return doc._els[id] || null; }, querySelector: function (s) { return doc._sel && doc._sel[s] ? {} : null; },
    createElement: function () { var el = { _kids: [], _q: {}, setAttribute: function () {}, remove: function () { delete doc._els[el.id]; }, querySelector: function (s) { return el._q[s] || (el._q[s] = {}); }, set innerHTML(v) { el._html = v; }, get innerHTML() { return el._html; } }; created.push(el); return el; },
    body: { appendChild: function (el) { doc._els[el.id] = el; } } };
  var ctx = { document: doc, window: { location: { reload: function () { reloads++; } } }, t: function (k) { return k; }, escapeHtml: function (x) { return String(x); } };
  vm.createContext(ctx);
  vm.runInContext(slice(read("js/app.js"), "function _appBusy() {", "if (\"serviceWorker\" in navigator) {\n  var _swHad"), ctx);
  // first install: no worker before -> nothing at all
  ctx.swControllerChanged(false); assert.strictEqual(reloads, 0); assert.ok(!doc._els.swUpdate, "first install: no reload, no bar");
  // an update while nothing is open: one reload
  ctx.swControllerChanged(true); assert.strictEqual(reloads, 1, "nothing being edited: reload once"); ctx.swControllerChanged(true); assert.strictEqual(reloads, 1, "only once");
  // an update while typing / a sheet is open: the bar, no reload
  var c2 = { document: doc, window: ctx.window, t: ctx.t, escapeHtml: ctx.escapeHtml }; vm.createContext(c2);
  vm.runInContext(slice(read("js/app.js"), "function _appBusy() {", "if (\"serviceWorker\" in navigator) {\n  var _swHad"), c2);
  doc.activeElement = { tagName: "INPUT" }; reloads = 0;
  c2.swControllerChanged(true); assert.strictEqual(reloads, 0, "typing: no reload"); assert.ok(doc._els.swUpdate, "the Update ready bar waits");
  assert.ok(/updateReady/.test(doc._els.swUpdate.innerHTML) && /updateReload/.test(doc._els.swUpdate.innerHTML), "it says what to do");
  doc._els.swUpdate.querySelector(".sw-reload").onclick(); assert.strictEqual(reloads, 1, "tapping reloads");
  delete doc._els.swUpdate; doc.activeElement = { tagName: "BODY" }; doc._els.tnScreen = {};
  c2._swReloaded = false; c2.swControllerChanged(true); assert.ok(doc._els.swUpdate, "the tournament screen open counts as busy");
  delete doc._els.swUpdate; delete doc._els.tnScreen; doc._els.modal = { classList: { contains: function (c) { return c === "active"; } } };
  c2.swControllerChanged(true); assert.ok(doc._els.swUpdate, "an open modal counts as busy");
  doc._els.swUpdate.querySelector(".sw-x").onclick(); assert.ok(!doc._els.swUpdate, "dismiss removes the bar");
  var app = read("js/app.js");
  assert.ok(/var _swHad = !!navigator\.serviceWorker\.controller/.test(app) && /swControllerChanged\(_swHad\)/.test(app), "the first install is told apart from an update");
  assert.ok(!/window\.location\.reload\(\);\n  \}\);\n\}/.test(slice(app, "// A new version took over", "if (\"serviceWorker\" in navigator) {\n  window.addEventListener(\"load\"")), "no unconditional reload on controllerchange any more");
})();

/* ---------- 3. database error bar ---------- */
(function () {
  var reloads = 0, listeners = {}, doc = { _els: {}, getElementById: function (id) { return doc._els[id] || null; },
    createElement: function () { var el = { _kids: [], _attr: {}, setAttribute: function (k, v) { el._attr[k] = v; }, getAttribute: function (k) { return el._attr[k]; }, appendChild: function (c) { el._kids.push(c); }, remove: function () { delete doc._els[el.id]; } }; return el; },
    body: { appendChild: function (el) { doc._els[el.id] = el; } } };
  var win = { addEventListener: function (n, f) { listeners[n] = f; }, location: { reload: function () { reloads++; } } };
  var ctx = { document: doc, window: win, console: { error: function () {} }, t: function (k) { return k; } };
  vm.createContext(ctx);
  vm.runInContext(slice(read("js/db.js"), "var _dbErrorShown = false;", "// ── Courts"), ctx);
  ctx.dbOnError({ code: "permission-denied" }, "sessions");
  var bar = doc._els.dbErrBar; assert.ok(bar, "one bar"); assert.strictEqual(bar.getAttribute("data-kind"), "perm"); assert.strictEqual(bar.getAttribute("role"), "alert");
  var txt = bar._kids[0].textContent; assert.ok(/The database refused this request \[sessions\]\. Check the rules and your sign-in\./.test(txt), "says what and where: " + txt);
  assert.strictEqual(bar._kids.length, 3, "message, Retry, dismiss");
  var n = Object.keys(doc._els).length; ctx.dbOnError({ code: "unavailable" }, "matches"); assert.strictEqual(Object.keys(doc._els).length, n, "only the first error shows a bar");
  bar._kids[1].onclick(); assert.strictEqual(reloads, 1, "Retry reloads");
  bar._kids[2].onclick(); assert.ok(!doc._els.dbErrBar, "dismiss removes it");
  // a network error clears itself when the phone is back online
  ctx._dbErrorShown = false; ctx.dbOnError({ message: "offline" }, "groups");
  assert.strictEqual(doc._els.dbErrBar.getAttribute("data-kind"), "net"); assert.ok(/Cannot reach the database \[groups\]\./.test(doc._els.dbErrBar._kids[0].textContent));
  listeners.online(); assert.ok(!doc._els.dbErrBar, "back online: the bar goes"); ctx.dbOnError({ message: "again" }, "x"); assert.ok(doc._els.dbErrBar, "and a later error can show it again");
  // a permission bar stays when the phone comes online
  doc._els.dbErrBar.remove(); ctx._dbErrorShown = false; ctx.dbOnError({ code: "permission-denied" }, "y"); listeners.online(); assert.ok(doc._els.dbErrBar, "a refused request does not clear by itself");
  var css = read("css/styles.css"), i18n = read("js/i18n.js");
  assert.ok(/\.db-err \{[^}]*top: calc\(8px \+ env\(safe-area-inset-top/.test(css) && /\.sw-update \{[^}]*bottom: calc\(var\(--nav-bar\)/.test(css), "bars clear the notch and the bottom nav");
  ["updateReady", "updateReload", "dbErrPerm", "dbErrPermHint", "dbErrNet", "dbRetry", "dbDismiss"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + Lao"); });
  var db = read("js/db.js"); assert.ok(!/style\.cssText/.test(slice(db, "var _dbErrorShown", "// ── Courts")), "no inline red banner any more");
  assert.ok(app = read("js/app.js"));
  var ver = app.match(/APP_VERSION = "(v\d+)"/)[1]; assert.strictEqual(ver, sw.match(/godsmash-(v\d+)/)[1], "version bumped together");
  console.log("pwa v232 OK");
})();
