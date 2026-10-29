/* Run: node tests/swap-sync-v269.test.js — v269: scorer swap travels to the watching screen. Was v267 display only: the left area credits the team drawn there,
   team A/B in the data never change, nothing is written to Firestore, the choice is kept per game and resets for a new game. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var store = {}, fsWrites = 0, classes = {}, timers = [];
var el = { classList: { add: function (c) { classes[c] = 1; }, remove: function (c) { delete classes[c]; } }, innerHTML: "", offsetWidth: 1 };
var ctx = { console: console, Math: Math, JSON: JSON, Date: Date, isFinite: isFinite, Object: Object, Array: Array, String: String, Number: Number, parseInt: parseInt,
  t: function (k) { return k; }, showToast: function () {}, icon: function () { return ""; }, jsq: String, avatarHtml: function () { return ""; }, getUserName: function (u) { return u; },
  byNameAZ: function (l) { return l.slice().sort(); }, maxPoints: function () { return 30; },
  currentUser: { uid: "host" }, currentGroupId: "g1", lastSessions: [], currentPage: "home",
  fsdb: { collection: function () { return { doc: function () { return { set: function () { fsWrites++; return { then: function () { return { catch: function () {} }; } }; }, update: function () { fsWrites++; return { catch: function () {} }; }, delete: function () { fsWrites++; return { catch: function () {} }; }, onSnapshot: function () { return function () {}; } }; } }; } },
  document: { getElementById: function (id) { return id === "liveScreen" ? el : null; }, body: { classList: { add: function () {}, remove: function () {}, contains: function () { return false; } } }, addEventListener: function () {}, hidden: false },
  navigator: {}, localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
  setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; }, clearTimeout: function () {}, setInterval: function () { return 1; }, clearInterval: function () {}, addEventListener: function () {} };
ctx.btoa = function (x) { return Buffer.from(x, 'binary').toString('base64'); }; ctx.Uint8Array = Uint8Array; ctx.DataView = DataView;
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/livescore.js", "utf8"), ctx, { filename: "js/livescore.js" });
var run = function (c) { return vm.runInContext(c, ctx); };
var sets = [], snapHandlers = [], listeners = 0;
ctx.fsdb = { collection: function () { return { doc: function () { return {
  set: function (d) { sets.push(d); return { then: function () { return { catch: function () {} }; } }; },
  update: function () { return { catch: function () {} }; }, delete: function () { return { catch: function () {} }; },
  onSnapshot: function (fn) { listeners++; snapHandlers.push(fn); return function () {}; } }; } }; } };
var toasts = []; ctx.showToast = function (m) { toasts.push(m); };
function G(o) { return Object.assign({ sid: "S1", type: "md", a: ["a", "b"], b: ["c", "d"], sa: 0, sb: 0, serve: "A", hist: [], over: null, startedAt: 1000, saved: 0, bo: 1, sw: { A: 0, B: 0 }, gl: [] }, o || {}); }
function flush() { var t = ctx.__t; }
// 1. scorer: swap puts `swap` in the live doc, through the one normal write
ctx.__o = G(); run("live = __o; liveMode = 'count'; _watch = null;");
run("lsSwap()");
run("_lsSend()");
assert.strictEqual(sets[sets.length - 1].swap, true, "scorer swap written");
run("lsSwap()"); run("_lsSend()");
assert.strictEqual(sets[sets.length - 1].swap, false, "swap back written");
assert.strictEqual(sets[sets.length - 1].sa, 0, "same doc, same write path");
// new game resets per game: swapped, then a new startedAt
run("lsSwap()"); ctx.__o = G({ startedAt: 2000 }); run("live = __o; _lsSend()");
assert.strictEqual(sets[sets.length - 1].swap, false, "new game starts normal");

// 2. viewer: display = remote XOR local mirror; missing = false
assert.strictEqual(run("_lsViewSwapped(undefined, false)"), false, "missing field = false");
assert.strictEqual(run("_lsViewSwapped(true, false)"), true);
assert.strictEqual(run("_lsViewSwapped(true, true)"), false, "remote + mirror cancel");
assert.strictEqual(run("_lsViewSwapped(false, true)"), true);
function watch(o) { ctx.__o = o; run("live = null; liveMode = 'watch'; _watch = __o;"); }
watch(G({ id: "host" }));
assert.strictEqual(run("lsSwapped('w')"), false, "old scorer without field");
assert.strictEqual(run("_lsOrder('w').join('')"), "AB");
watch(G({ id: "host", swap: true }));
assert.strictEqual(run("_lsOrder('w').join('')"), "BA", "follows scorer");
run("lsSwap()");   // viewer button = mirror
assert.strictEqual(store["godsmash_ls_mirror"], "1", "mirror kept per device");
assert.strictEqual(run("_lsOrder('w').join('')"), "AB", "remote XOR mirror");
assert.strictEqual(sets.length, 3, "viewer button writes nothing");
// mirror persists across games (not keyed per game)
watch(G({ id: "host", startedAt: 9999, swap: false }));
assert.strictEqual(run("_lsOrder('w').join('')"), "BA", "mirror stays, doc value followed");
run("lsSwap()");
assert.strictEqual(store["godsmash_ls_mirror"], "0");
// viewer never shows the Change ends prompt (the scorer decides)
watch(G({ id: "host", bo: 3, sw: { A: 1, B: 0 }, swap: false }));
assert.ok(run("_lsWatchHtml()").indexOf("ls-ends") < 0, "no ends prompt on the viewer");
assert.ok(run("_lsWatchHtml()").indexOf("lsMirror") > 0, "mirror label on the viewer button");

// 3. snapshot: scorer swap -> animation + toast; _lsClean keeps the field
assert.strictEqual(run("_lsClean({ swap: true, sa: 1 }).swap"), true);
assert.strictEqual(run("_lsClean({ sa: 1 }).swap"), false);
run("liveNow = [Object.assign(_lsClean(" + JSON.stringify(G({ swap: false, updatedAt: 1 })) + "), { id: 'host' })]; liveMode = 'count'; lsWatch('host');");
var before = listeners, h = snapHandlers[snapHandlers.length - 1];
function snap(o) { h({ exists: true, id: "host", metadata: { fromCache: false }, data: function () { return o; } }); }
toasts.length = 0; classes = {};
snap(Object.assign(G({ swap: true, updatedAt: 5 })));
assert.ok(toasts.indexOf("lsSidesChanged") >= 0, "toast Sides changed");
assert.ok(classes["ls-swapping"], "animated");
assert.strictEqual(run("_lsOrder('w').join('')"), "BA");
toasts.length = 0;
snap(G({ swap: true, sa: 3, updatedAt: 6 }));
assert.strictEqual(toasts.length, 0, "no toast when the side did not change");
assert.strictEqual(listeners, before, "no new listener for swap");
var src = fs.readFileSync("js/livescore.js", "utf8");
assert.strictEqual((src.match(/\.onSnapshot\(/g) || []).length, 2, "still two listeners in livescore.js (list + one doc)");
console.log("swap-sync v269 OK");
