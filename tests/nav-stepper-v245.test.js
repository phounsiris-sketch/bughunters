/* Run: node tests/nav-stepper-v245.test.js — v245: bottom bar order and markup, notch positioning, Games tab first/default, tournament stepper states */
var fs = require("fs"), vm = require("vm"), assert = require("assert");

// ---- 1. bottom bar markup ----
var html = fs.readFileSync("index.html", "utf8");
var nav = html.slice(html.indexOf('<nav class="bottom-nav"'), html.indexOf("</nav>", html.indexOf('<nav class="bottom-nav"')));
var ids = (nav.match(/<button[^>]* id="(nav-[a-z]+)"/g) || []).map(function (m) { return /id="(nav-[a-z]+)"/.exec(m)[1]; });
assert.deepStrictEqual(ids, ["nav-dashboard", "nav-games", "nav-stats", "nav-public", "nav-settings"], "order: Dashboard, Game, Rank, Community, Setting");
assert.ok(/id="nav-dashboard"[^>]*onclick="showPage\('home'\)"/.test(nav) || /onclick="showPage\('home'\)" id="nav-dashboard"/.test(nav), "Dashboard opens the home page");
assert.ok(/data-i18n="navDashboard"/.test(nav) && !/nav-center/.test(nav + fs.readFileSync("css/styles.css", "utf8")), "Dashboard label key; no raised center button");
assert.ok(/id="navBadge-games"/.test(nav) && /id="navBadge-public"/.test(nav), "badges kept");
assert.strictEqual((nav.match(/data-plain/g) || []).length, 5, "every nav icon is a plain glyph");
assert.ok(/id="nav-stats" style="display:none"/.test(nav) && /id="nav-public" style="display:none"/.test(nav), "Rank and Community hidden until groups are on");
assert.ok(/nb-notch/.test(nav) && /aria-hidden="true"/.test(nav), "notch shape present and hidden from screen readers");
var i18n = fs.readFileSync("js/i18n.js", "utf8");
["navDashboard: \"Dashboard\"", "navDashboard: \"ແດຊບອດ\"", "tourStepRotL: \"Rotation\"", "tourStepRotL: \"ໝູນວຽນ\"", "tourStepPairsL: \"ຄູ່\"", "tourStepPlayoffL: \"ຮອບຕັດສິນ\"", "tourStepWinnerL: \"ຜູ້ຊະນະ\""].forEach(function (k) { assert.ok(i18n.indexOf(k) > 0, "i18n " + k); });
var css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(/prefers-reduced-motion: reduce\) \{\s*\.nb-l/.test(css), "reduced motion switches the bar motion off");
assert.ok(/cubic-bezier\(\.34, 1\.56, \.64, 1\)/.test(css), "spring ease on the bubble");

// ---- 2. notch positioning from the active element ----
var els = {};
function mk(o) { var e = Object.assign({ style: {}, classList: { _c: {}, add: function (c) { this._c[c] = 1; }, remove: function (c) { delete this._c[c]; }, contains: function (c) { return !!this._c[c]; } }, attrs: {}, getAttribute: function (k) { return this.attrs[k] || null; }, setAttribute: function (k, v) { this.attrs[k] = v; }, offsetWidth: 0 }, o); return e; }
function run(slots, activeIdx, width) {
  var parts = { ".nb-notch": mk({}), ".nb-l": mk({}), ".nb-r": mk({}) };
  var bg = { querySelector: function (s) { return parts[s]; } };
  var w = width / slots, items = [];
  for (var i = 0; i < slots; i++) items.push(mk({ offsetLeft: i * w, offsetWidth: w }));
  var navEl = mk({ offsetWidth: width, clientWidth: width, querySelector: function (s) { return s === ".nav-bg" ? bg : (s === ".nav-item.active" ? (activeIdx < 0 ? null : items[activeIdx]) : null); } });
  var c = { document: { getElementById: function () { return navEl; } }, window: undefined, console: console };
  vm.createContext(c); vm.runInContext(fs.readFileSync("js/router.js", "utf8").split("var NAV_NOTCH_W")[1] ? "var NAV_NOTCH_W" + fs.readFileSync("js/router.js", "utf8").split("var NAV_NOTCH_W")[1] : "", c);
  c.positionNavNotch(true);
  return { x: parseFloat(/translateX\((-?[\d.]+)px/.exec(parts[".nb-notch"].style.transform)[1]), l: parts[".nb-l"].style.transform, r: parts[".nb-r"].style.transform, nav: navEl };
}
var a = run(5, 1, 390), b = run(3, 2, 390), z = run(5, 0, 360);
assert.ok(Math.abs(a.x - (78 * 1.5 - 60)) < 1e-6, "5 slots: notch centered under slot 2");
assert.ok(Math.abs(b.x - (130 * 2.5 - 60)) < 1e-6, "3 slots: notch centered under slot 3");
assert.ok(Math.abs(z.x - (36 - 60)) < 1e-6, "narrow width follows the measured slot");
assert.ok(/translateX/.test(a.l) && /translateX/.test(a.r), "fillers move with transforms only");
assert.strictEqual(a.nav.attrs["data-ready"], "1", "first call is marked ready after the snap");
assert.ok(!a.nav.classList.contains("nav-snap"), "snap class is removed again");
var none = run(5, -1, 390); assert.ok(none.x > 390, "no active item parks the notch off-screen");

// ---- 3. session tabs: Games first and default ----
var sess = fs.readFileSync("js/sessions.js", "utf8");
var tabs = sess.slice(sess.indexOf("function _sessionTabsHtml"), sess.indexOf("function _sessionActionBar"));
assert.ok(tabs.indexOf("sessionTabGames") < tabs.indexOf("sessionTabBill"), "Games tab is first");
var sc = { console: console, GROUPS_ON: true, sessionGamesTabHtml: function () {}, fsdb: { collection: function () { return { doc: function () { return { onSnapshot: function () {} }; } }; } }, showPage: function () {}, document: { getElementById: function () { return null; } }, t: function (k) { return k; } };
vm.createContext(sc); vm.runInContext(sess, sc);
sc.showSessionDetail("a"); assert.strictEqual(sc.sessionTab, "games", "opens on Games by default");
sc.showSessionDetail("a", "bill"); assert.strictEqual(sc.sessionTab, "bill", "an explicit bill request still opens the bill");
sc.showSessionDetail("a", "games"); assert.strictEqual(sc.sessionTab, "games");
sc.GROUPS_ON = false; sc.showSessionDetail("a"); assert.strictEqual(sc.sessionTab, "bill", "no groups: no Games tab, so the bill");
assert.ok(/showSessionDetail\(sessionId, "bill"\)/.test(sess), "edit bill opens the bill tab");

// ---- 4. tournament stepper ----
var tsrc = fs.readFileSync("js/tournament.js", "utf8");
var tc = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, t: function (k) { return "[" + k + "]"; }, escapeHtml: function (v) { return String(v); } };
vm.createContext(tc); vm.runInContext(tsrc, tc);
function states(h) { return (h.match(/<li class="tn-li[^"]*"><button[^>]*>/g) || []).map(function (b) { return /class="tn-s tn-tab-b (done|now|lock)/.exec(b)[1] + (/disabled/.test(b) ? "!" : "") + (/aria-current="step"/.test(b) ? "*" : ""); }); }
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
[6, 8].forEach(function (n) {
  var ids = []; for (var i = 0; i < n; i++) ids.push("u" + i);
  var T = tc.tourNew(ids, seeded(7));
  var h = tc._tnStepper(tc._tnViewNow(T), 0);
  assert.deepStrictEqual(states(h), ["now*", "lock!", "lock!", "lock!"], n + " players: rotation is current, the rest are locked");
  assert.ok(/aria-label="\[tourTitle\]"/.test(h) && /<ol class="tn-steps"/.test(h), "list with a label");
  assert.ok(/\[tourStepRotL\]/.test(h) && !/\[tourStepRot\]/.test(h), "labels without numbers");
  assert.strictEqual((h.match(/tn-bdg/g) || []).length, 1, "trophy badge on step 4 only");
  while (!tc.tourRotDone(T)) { var g = tc.tourNext(T); tc.tourApply(T, g, 21, 10); }
  h = tc._tnStepper(tc._tnViewNow(T), 0);
  assert.deepStrictEqual(states(h), ["done", "now*", "lock!", "lock!"], n + " players: pairs step after the rotation");
  assert.ok(/tn-tab-b done on/.test(h) && /<svg/.test(h.split("</li>")[0]), "viewed done step is marked on and shows a tick");
  assert.ok(!/data-k="2"[^>]*>/.test(h) || /data-k="2" disabled/.test(h), "locked step cannot be tapped");
});
console.log("nav-stepper-v245 OK");
