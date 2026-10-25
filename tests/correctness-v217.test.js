/* Run: node tests/correctness-v217.test.js — v217 correctness fixes that can be checked without a browser */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function slice(file, from, to) { var s = fs.readFileSync(file, "utf8"), i = s.indexOf(from), j = s.indexOf(to, i); assert.ok(i >= 0 && j > i, file + ": " + from); return s.slice(i, j); }
function run(code, ctx) { ctx = ctx || {}; vm.createContext(ctx); vm.runInContext(code, ctx); return ctx; }

// 1. weekly polls: later weeks close the day before their game (createdMs 0), not 24h after creation
var p = run(slice("js/polls.js", "var BKK_MS", "function pollClosesAt") + "\nthis.f = defaultCloseAt;");
var created = Date.UTC(2026, 9, 1, 3, 0), day = "2026-10-22";
assert.strictEqual(p.f(day, "18:00", created), Date.UTC(2026, 9, 2, 3, 0), "week 1: 24h after creation");
assert.strictEqual(p.f(day, "18:00", 0), Date.UTC(2026, 9, 22) - 7 * 3600e3, "later weeks: midnight (Bangkok) before the game day");
var src = fs.readFileSync("js/polls.js", "utf8");
assert.ok(/defaultCloseAt\(day, newPoll\.time, k \? 0 : Date\.now\(\)\)/.test(src), "submitPoll passes 0 for weeks 2..N");

// 8. vote for others: only the rows the organiser changed are written
var v = run(slice("js/polls.js", "function pollVoteChanges", "function _proxyPick") + "\nthis.f = pollVoteChanges;");
assert.deepStrictEqual(JSON.parse(JSON.stringify(v.f({ a: 0, b: 1 }, { a: 0, b: 1 }))), {}, "nothing changed: nothing written");
assert.deepStrictEqual(JSON.parse(JSON.stringify(v.f({ a: 0, b: 1 }, { a: 1 }))), { a: 1, b: -1 }, "changed and cleared rows; a vote that arrived meanwhile (not in the sheet) is not touched");

// 13. live score: minus keeps the history in step, Undo never goes below 0
var ls = run(slice("js/livescore.js", "function lsOver", "/* ---------- Storage") + "\nthis.apply = lsApply; this.undo = lsUndoLast;", { LS_START_POINTS: 21 });
var st = { sa: 0, sb: 0, hist: [], serve: "A", over: null };
st = ls.apply(st, "A", 1, 30); st = ls.apply(st, "B", 1, 30);       // A:1 B:1
st = ls.apply(st, "A", -1, 30);                                      // A back to 0 although B scored last
assert.strictEqual(st.sa, 0); assert.strictEqual(st.hist.length, 1, "A's point left the history");
st = ls.undo(st); st = ls.undo(st);
assert.ok(st.sa >= 0 && st.sb >= 0, "no negative score after Undo: " + st.sa + "-" + st.sb);

// 21. period start does not overflow at month ends
function periodStart(today, months) {
  var c = run(slice("js/stats.js", "function _periodStart", "/** Monday of the week") + "\nthis.f = _periodStart;", { _todayIso: function () { return today; } });
  return c.f(months);
}
assert.strictEqual(periodStart("2026-10-31", 3), "2026-08-01", "Oct 31 - 3 months = Jul 31, +1 day = Aug 1");
assert.strictEqual(periodStart("2026-05-31", 3), "2026-03-01", "May 31 - 3 months = Feb 28 (clamped), +1 day = Mar 1");
assert.strictEqual(periodStart("2026-10-15", 12), "2025-10-16");

// 2. merge: every field naming the manual player is rewritten, and only those
var sw = run(slice("js/settings.js", "function _swapUid", "function mergeManualPlayer") + "\nthis.f = mergeFieldUpdates;");
var out = JSON.parse(JSON.stringify(sw.f({ teamA: ["old", "x"], teamB: ["y", "z"], createdBy: "old", note: "old" }, ["teamA", "teamB", "createdBy", "updatedBy"], "old", "me")));
assert.deepStrictEqual(out, { teamA: ["me", "x"], createdBy: "me" }, "only fields that hold the uid change");
out = JSON.parse(JSON.stringify(sw.f({ settled: { "old__x__court": true }, voteLog: { old: { a: 0, by: "old" } } }, ["settled", "voteLog"], "old", "me")));
assert.deepStrictEqual(out, { settled: { "me__x__court": true }, voteLog: { me: { a: 0, by: "me" } } }, "map keys and values are rewritten");
assert.strictEqual(sw.f({ teamA: ["a"] }, ["teamA"], "old", "me"), null);
var set = fs.readFileSync("js/settings.js", "utf8");
assert.ok(/trashDoc\("player", "users", manualId/.test(set) && /collect\("matches", matchFields\)/.test(set), "merge trashes the manual user and migrates matches");

// 12/7/5/6/4/9/15: guards are present in the source
assert.ok(/_autoTried\[p\.id\]; \}\)/.test(src), "auto-confirm retries after a failure");
assert.ok(/_pollSubmitting/.test(src) && /_lsSaving/.test(fs.readFileSync("js/livescore.js", "utf8")) && /_gameSaving/.test(fs.readFileSync("js/stats.js", "utf8")), "double-submit guards");
assert.ok(/var done = false/.test(fs.readFileSync("js/motion.js", "utf8")), "askConfirm runs onYes once");
assert.ok(/runTransaction[\s\S]*computeLedger\(fresh\)/.test(fs.readFileSync("js/sessions.js", "utf8")), "settleTransfers works out the status from the fresh document");

// 22/23: no native prompt; storage reads are guarded
fs.readdirSync("js").filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { assert.ok(!/window\.prompt|[^.\w]prompt\(/.test(fs.readFileSync("js/" + f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), f + " must not call prompt()"); });
assert.ok(/try \{ return localStorage\.getItem\("lang"\)/.test(fs.readFileSync("js/i18n.js", "utf8")) && /try \{ return localStorage\.getItem\("theme"\)/.test(fs.readFileSync("js/app.js", "utf8")), "top-level storage reads are guarded");
console.log("correctness-v217 OK");
