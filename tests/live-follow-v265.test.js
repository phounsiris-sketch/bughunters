/* Run: node tests/live-follow-v265.test.js — v265: the watching screen (iPad) follows the next game of the same live session:
   a new game in the same session switches the view (toast "Next: A + B vs C + D"); another session does not; no new listeners. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var names = { a: "Ann", b: "Bob", c: "Cat", d: "Dan", e: "Eve", f: "Fay", g: "Gus", h: "Hal" };
var toasts = [], timers = [], renders = 0, listeners = 0, unsubs = 0, docCb = null, docErr = null, classes = {};
var el = { classList: { add: function (c) { classes[c] = 1; }, remove: function (c) { delete classes[c]; } }, innerHTML: "" };
var ctx = { console: console, Math: Math, JSON: JSON, Date: Date, isFinite: isFinite, Object: Object, Array: Array, String: String, Number: Number, parseInt: parseInt,
  t: function (k) { return { lsEnded: "The match has ended", lsNextUp: "Next: {teams}", lsWaitNext: "Waiting for the next match" }[k] || k; },
  showToast: function (m) { toasts.push(m); }, plainUserName: function (u) { return u.n; }, findUser: function (u) { return { n: names[u] || u }; },
  byNameAZ: function (l) { return l.slice().sort(function (x, y) { return names[x].localeCompare(names[y]); }); },
  jsq: String, icon: function () { return ""; }, currentUser: { uid: "host" }, currentGroupId: "g1", lastSessions: [], currentPage: "home",
  fsdb: { collection: function () { return { doc: function () { return { onSnapshot: function (ok, err) { listeners++; docCb = ok; docErr = err; return function () { unsubs++; }; } }; } }; } },
  document: { getElementById: function (id) { return id === "liveScreen" ? el : null; }, body: { classList: { add: function () {}, remove: function () {}, contains: function () { return false; } } }, addEventListener: function () {}, hidden: false },
  navigator: {}, localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
  setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; }, clearTimeout: function (i) { if (timers[i - 1]) timers[i - 1].dead = true; },
  setInterval: function () { return 1; }, clearInterval: function () {}, addEventListener: function () {} };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/livescore.js", "utf8"), ctx, { filename: "js/livescore.js" });
// the screen drawing is not under test
ctx.lsRender = function () { renders++; };
ctx._lsShow = function () { ctx.liveMode = "watch"; renders++; };
ctx._lsWake = function () {}; ctx.lsClose = function () { ctx.closed = true; };
ctx.maxPoints = function () { return 30; };
var G = function (o) { return Object.assign({ id: "host", sid: "S1", type: "md", a: ["a", "b"], b: ["c", "d"], sa: 0, sb: 0, bo: 1, sw: { A: 0, B: 0 }, gl: [], serve: "A", over: null, saved: 0, theme: 0, test: false, updatedAt: 100 }, o || {}); };
var snap = function (x, exists) { return { exists: exists !== false, id: "host", metadata: { fromCache: false }, data: function () { return JSON.parse(JSON.stringify(x)); } }; };
function startWatch(g) { ctx.liveNow = [ctx._lsClean(g)]; ctx.lsWatch("host"); }
function live() { return vm.runInContext("_watch", ctx); }
function waiting() { return vm.runInContext("_watchWait", ctx); }
function mode() { return vm.runInContext("liveMode", ctx); }

// ---- 1. the pure rule ----
var K = ctx.lsFollowKind;
assert.strictEqual(K(G({ over: "A" }), G({ over: null, a: ["e", "f"], b: ["g", "h"], updatedAt: 200 })), "next", "finished game, then a new game in the same session");
assert.strictEqual(K(G({ over: "A" }), G({ over: null, sid: "S2" })), "other", "another session is not followed");
assert.strictEqual(K(G({ over: null, sa: 3 }), G({ over: null, sa: 4 })), "update", "a point in the same game");
assert.strictEqual(K(G({ over: "A" }), G({ over: "A" })), "update", "the finished game again (heartbeat)");
assert.strictEqual(K(null, G()), "keep");
assert.strictEqual(ctx.lsFollowTeams(G({ a: ["b", "a"], b: ["d", "c"] })), "Ann + Bob vs Cat + Dan");

// ---- 2. same board rewritten in place (Save and next match) ----
startWatch(G({ sa: 21, sb: 15, over: "A", updatedAt: 100 }));
assert.strictEqual(listeners, 1, "one doc listener");
assert.strictEqual(mode(), "watch");
var r0 = renders;
docCb(snap(G({ sa: 21, sb: 15, over: "A", updatedAt: 100, hb: 5 })));           // same game, nothing to follow
assert.strictEqual(toasts.length, 0);
docCb(snap(G({ a: ["e", "f"], b: ["g", "h"], sa: 0, sb: 0, over: null, saved: 1, updatedAt: 200 })));
assert.strictEqual(toasts.length, 1); assert.strictEqual(toasts[0], "Next: Eve + Fay vs Gus + Hal", "toast names the new pair");
assert.deepStrictEqual(live().a, ["e", "f"], "the view shows the new pair");
assert.ok(classes["ls-follow"], "short transition class set"); assert.ok(renders > r0);
assert.strictEqual(listeners, 1, "no new listener"); assert.strictEqual(unsubs, 0);
timers.filter(function (x) { return x.ms === 800; }).forEach(function (x) { x.fn(); }); assert.ok(!classes["ls-follow"], "transition class removed again");

// ---- 3. tournament: the board is removed, then written again for the next game ----
toasts.length = 0;
docCb(snap(G({ a: ["e", "f"], b: ["g", "h"], sa: 21, sb: 9, over: "A", saved: 1, updatedAt: 300 })));   // the finished game
docCb(snap({}, false));                                                      // the phone saved it: the board is removed
assert.strictEqual(mode(), "watch", "still watching: no 'ended' stop");
assert.ok(waiting(), "waiting for the next game"); assert.strictEqual(toasts.length, 0, "no 'ended' toast"); assert.ok(!ctx.closed);
assert.strictEqual(live().sa, 21, "the finished result stays on screen");
var wt = timers.filter(function (x) { return x.ms === 15 * 60e3 && !x.dead; }); assert.strictEqual(wt.length, 1, "one wait limit timer");
docCb(snap(G({ a: ["a", "c"], b: ["b", "d"], sa: 0, sb: 0, over: null, saved: 0, updatedAt: 400 })));   // the next tournament game starts
assert.strictEqual(toasts.length, 1); assert.strictEqual(toasts[0], "Next: Ann + Cat vs Bob + Dan");
assert.ok(!waiting(), "not waiting any more"); assert.ok(wt[0].dead, "the wait timer is cancelled");
assert.deepStrictEqual(live().a, ["a", "c"]); assert.strictEqual(mode(), "watch");
assert.strictEqual(listeners, 1, "still the same single listener");

// ---- 4. the group list listener (Home) also sees the next game ----
toasts.length = 0;
docCb(snap(G({ a: ["a", "c"], b: ["b", "d"], sa: 21, sb: 18, over: "B", updatedAt: 500 })));
docCb(snap({}, false)); assert.ok(waiting());
ctx.liveNow = [];                                      // list without the board
ctx.lsFollowFromList(); assert.ok(waiting() && toasts.length === 0);
ctx.liveNow = [ctx._lsClean(G({ id: "host", a: ["e", "g"], b: ["f", "h"], over: null, updatedAt: 600 }))];
ctx.lsFollowFromList();
assert.ok(!waiting()); assert.strictEqual(toasts[0], "Next: Eve + Gus vs Fay + Hal");
assert.deepStrictEqual(live().a, ["e", "g"]);
// an old board still in the list (older updatedAt) is ignored
docCb(snap(G({ a: ["e", "g"], b: ["f", "h"], sa: 21, sb: 1, over: "A", updatedAt: 700 }))); docCb(snap({}, false));
toasts.length = 0; ctx.liveNow = [ctx._lsClean(G({ a: ["a", "b"], b: ["c", "d"], over: null, updatedAt: 650 }))];
ctx.lsFollowFromList(); assert.ok(waiting() && !toasts.length, "an older board does not switch the view");
// the error callback of the doc listener keeps waiting (the list still sees the next game)
docErr(new Error("permission-denied")); assert.ok(waiting() && mode() === "watch");

// ---- 5. another session: not followed ----
ctx.lsWatchStop(true); toasts.length = 0; ctx.closed = false;
startWatch(G({ sa: 21, sb: 15, over: "A", updatedAt: 100 }));
docCb(snap(G({ sid: "S2", a: ["e", "f"], b: ["g", "h"], over: null, updatedAt: 200 })));
assert.strictEqual(mode(), "count", "the watch ended"); assert.deepStrictEqual(toasts, ["The match has ended"]);
assert.ok(!waiting());
// waiting, then the board of ANOTHER session shows up
startWatch(G({ sa: 21, sb: 15, over: "A", updatedAt: 100 })); toasts.length = 0;
docCb(snap({}, false)); assert.ok(waiting());
ctx.liveNow = [ctx._lsClean(G({ sid: "S2", over: null, updatedAt: 900 }))]; ctx.lsFollowFromList();
assert.strictEqual(mode(), "count"); assert.deepStrictEqual(toasts, ["The match has ended"]); assert.ok(!waiting());

// ---- 6. a board that vanishes in the middle of a game is an ended match (nothing to wait for) ----
startWatch(G({ sa: 7, sb: 3, over: null, updatedAt: 100 })); toasts.length = 0;
docCb(snap({}, false));
assert.strictEqual(mode(), "count"); assert.deepStrictEqual(toasts, ["The match has ended"]);

// ---- 7. the wait does not last for ever; Exit works while waiting and clears the timer ----
startWatch(G({ sa: 21, sb: 15, over: "A", updatedAt: 100 })); toasts.length = 0;
docCb(snap({}, false)); var tm = timers.filter(function (x) { return x.ms === 15 * 60e3 && !x.dead; }).pop();
tm.fn(); assert.strictEqual(mode(), "count"); assert.deepStrictEqual(toasts, ["The match has ended"]);
startWatch(G({ sa: 21, sb: 15, over: "A", updatedAt: 100 })); docCb(snap({}, false));
var tm2 = timers.filter(function (x) { return x.ms === 15 * 60e3 && !x.dead; }).pop();
ctx.lsWatchStop(); assert.ok(tm2.dead, "leaving cancels the wait timer"); assert.ok(!waiting());

// ---- 8. the list listener code only reacts while waiting; no polling was added ----
var src = fs.readFileSync("js/livescore.js", "utf8");
assert.ok(/if \(_watchWait\) lsFollowFromList\(\)/.test(src), "list hook is guarded");
var follow = src.slice(src.indexOf("v265: the watching screen follows"), src.indexOf("function lsWatchStop"));
assert.ok(!/setInterval|\.get\(\)|\.onSnapshot\(/.test(follow), "no polling, no new listener in the follow code");
console.log("live-follow-v265 ok");
