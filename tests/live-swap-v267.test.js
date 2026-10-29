/* Run: node tests/live-swap-v267.test.js — v267: "Swap sides" on the live score. Display only: the left area credits the team drawn there,
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
function setLive(o) { ctx.__o = o; run("live = __o; liveMode = 'count'; _watch = null;"); }
function G(o) { return Object.assign({ sid: "S1", type: "md", a: ["a", "b"], b: ["c", "d"], sa: 0, sb: 0, serve: "A", hist: [], over: null, startedAt: 1000, saved: 0, bo: 1, sw: { A: 0, B: 0 }, gl: [] }, o || {}); }
function html() { return run("_lsCountHtml()"); }
function sidesInOrder(h) { var r = [], re = /ls-half[^>]*>[\s\S]*?lsTap\('([AB])',-1\)/g, m; while ((m = re.exec(h))) r.push(m[1]); return r; }
function plusInOrder(h) { var r = [], re = /lsTap\('([AB])',1\)/g, m; while ((m = re.exec(h))) r.push(m[1]); return r; }

// 1. normal: A left, B right
setLive(G());
assert.deepStrictEqual(sidesInOrder(html()), ["A", "B"], "normal order");
assert.strictEqual(run("lsLeftSide()"), "A");

// 2. swap: B drawn first; scoring the left area credits B; data A/B unchanged
var writesBefore = fsWrites, keysBefore = Object.keys(store).filter(function (k) { return k === "godsmash_live_v1"; }).length;
run("lsSwap()");
assert.strictEqual(fsWrites, writesBefore, "swap writes nothing to Firestore");
assert.strictEqual(store["godsmash_live_v1"], undefined, "swap does not touch the saved game");
assert.ok(classes["ls-swapping"], "short animation class");
var h = html();
assert.deepStrictEqual(sidesInOrder(h), ["B", "A"], "swapped order");
assert.strictEqual(plusInOrder(h)[0], "B", "left plus button is team B");
assert.strictEqual(run("lsLeftSide()"), "B");
ctx.lsTap(plusInOrder(h)[0], 1);   // tap the plus of the left-drawn area
assert.strictEqual(run("live.sb"), 1, "the team shown on the left (B) got the point");
assert.strictEqual(run("live.sa"), 0);
assert.deepStrictEqual(JSON.parse(JSON.stringify(run("[live.a, live.b]"))), [["a", "b"], ["c", "d"]], "data A/B unchanged");
// minus of the left area takes the point away from B, Undo takes the last point of whoever scored
var minusLeft = sidesInOrder(html())[0];
ctx.lsTap(minusLeft, -1);
assert.strictEqual(run("live.sb"), 0, "minus on the left area hits the team drawn there");
ctx.lsTap("A", 1); ctx.lsTap("B", 1); ctx.lsUndo();
assert.strictEqual(run("live.sa + ':' + live.sb"), "1:0", "undo still undoes the last point of the right team");
assert.deepStrictEqual(sidesInOrder(html()), ["B", "A"], "still swapped after scoring");
assert.strictEqual(run("live.serve"), "A", "serve data is by team, not by side");

// 3. remembered on this device for this game (reload = new module state, same game)
var saved = JSON.parse(store["godsmash_ls_swap_s"]);
assert.strictEqual(saved.v, 1);
run("_lsSwapMem = { s: { k: '', on: false }, w: { k: '', on: false } };");
assert.strictEqual(run("lsSwapped('s')"), true, "restored for the same game");

// 4. swap back
run("lsSwap()");
assert.deepStrictEqual(sidesInOrder(html()), ["A", "B"]);

// 5. a new game starts normal again (saved game / next game of a match / another session)
run("lsSwap()");
assert.strictEqual(run("lsSwapped('s')"), true);
run("live.saved = 1; live.startedAt = 2000; live.sa = 0; live.sb = 0;");
assert.strictEqual(run("lsSwapped('s')"), false, "next game: normal");
setLive(G({ sid: "S2" }));
assert.strictEqual(run("lsSwapped('s')"), false, "another session: normal");
// Reset score / edit teams keeps the same game id: the swap stays
setLive(G({ sid: "S3", startedAt: 5 })); run("lsSwap()");
run("live.sa = 0; live.sb = 0; live.hist = [];");
assert.strictEqual(run("lsSwapped('s')"), true, "same game reset keeps the display");

// 6. "Change ends?" prompt: only in a match of 2+ games, never forced
setLive(G({ bo: 3 }));
assert.ok(html().indexOf("ls-ends") < 0, "no question in game 1 at 0-0");
setLive(G({ bo: 3, sw: { A: 1, B: 0 }, gl: [{ a: 21, b: 10 }], startedAt: 7 }));
assert.ok(html().indexOf("lsChangeEnds") > 0, "game 2 start asks");
var before = run("lsLeftSide()");
assert.strictEqual(before, "A", "no automatic swap");
run("lsSwap()");
assert.ok(html().indexOf("lsChangeEnds") < 0, "swapping answers the question");
setLive(G({ bo: 3, sw: { A: 1, B: 1 }, gl: [{ a: 21, b: 10 }, { a: 8, b: 21 }], sa: 10, sb: 8, startedAt: 9 }));
assert.ok(html().indexOf("lsChangeEnds") < 0, "decider before 11: no question");
setLive(G({ bo: 3, sw: { A: 1, B: 1 }, gl: [{ a: 21, b: 10 }, { a: 8, b: 21 }], sa: 11, sb: 8, startedAt: 9 }));
assert.ok(html().indexOf("lsChangeEnds") > 0, "decider at 11 asks");
run("lsEndsDismiss()");
assert.ok(html().indexOf("lsChangeEnds") < 0, "dismissed");
assert.strictEqual(run("lsLeftSide()"), "A", "dismiss does not swap");
setLive(G({ bo: 1, saved: 1 }));
assert.ok(html().indexOf("lsChangeEnds") < 0, "single games: no question");

// 7. the watch remote follows the screen: previous = left
var acts = {};
ctx.navigator = { mediaSession: { setActionHandler: function (n, f) { acts[n] = f; } } }; ctx.Audio = function () { this.play = function () { return { catch: function () {} }; }; this.pause = function () {}; };
setLive(G({ startedAt: 11 })); run("lsSwap(); _remoteOn = true; _lsRemoteStart();");
acts.previoustrack();
assert.strictEqual(run("live.sb + ':' + live.sa"), "1:0", "previous track = left team (B after swap)");

// 8. the viewer has its own swap, independent of the scorer; the next game resets it; no write
var w0 = fsWrites;
run("_watch = { id: 'host', sid: 'S1', type: 'md', a: ['a','b'], b: ['c','d'], sa: 3, sb: 2, bo: 1, sw: {A:0,B:0}, gl: [], serve: 'B', over: null, saved: 0, startedAt: 50, theme: 0 }; live = null; liveMode = 'watch';");
var wh = run("_lsWatchHtml()");
assert.ok(wh.indexOf("lsSwap()") > 0, "viewer has the button");
function watchOrder() { var h = run("_lsWatchHtml()"), r = [], re = /ls-team">lsTeam ([AB])</g, m; while ((m = re.exec(h))) r.push(m[1]); return r; }
assert.deepStrictEqual(watchOrder(), ["A", "B"]);
run("lsSwap()");
assert.deepStrictEqual(watchOrder(), ["B", "A"], "viewer swapped");
assert.strictEqual(JSON.parse(store["godsmash_ls_swap_s"]).v, 1, "the scorer keeps its own choice (own storage slot)");   // scorer was swapped in 7
setLive(G({ startedAt: 11 })); run("_watch = { id: 'host', sid: 'S1', type: 'md', a: ['a','b'], b: ['c','d'], sa: 3, sb: 2, bo: 1, sw: {A:0,B:0}, gl: [], serve: 'B', over: null, saved: 0, startedAt: 50, theme: 0 }; live = null; liveMode = 'watch';");
assert.deepStrictEqual(watchOrder(), ["B", "A"], "viewer choice kept while the same game goes on");
run("_watch = { id: 'host', sid: 'S1', type: 'md', a: ['e','f'], b: ['g','h'], sa: 0, sb: 0, bo: 1, sw: {A:0,B:0}, gl: [], serve: 'A', over: null, saved: 1, startedAt: 90, theme: 0 };");   // v265: the next game of the session
assert.deepStrictEqual(watchOrder(), ["B", "A"], "v269: the viewer's button is a per-device mirror, it stays for the next game (the scorer's own swap resets via the doc)");
assert.strictEqual(fsWrites, w0, "viewer swap writes nothing");

console.log("live-swap-v267 OK");
