/* Run: node tests/clear-tour-v268.test.js - v268: the clear-tournament control is a "Manage tournament" card at the very bottom of the Winner step
   (no longer a bare pill between the champion and the bracket); it asks through askConfirm with real counts, never a native confirm; one Undo. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function uids(n) { var a = []; for (var i = 0; i < n; i++) a.push("u" + i); return a; }
var names = {}; uids(24).forEach(function (u) { names[u] = "Player " + u; });
var ic = { console: console, localStorage: { getItem: function () { return "en"; } }, document: {}, window: {} };
vm.createContext(ic); vm.runInContext(fs.readFileSync("js/i18n.js", "utf8"), ic);
var asked = [], puts = [], toasts = [];
var ctx = { clearInterval: function () {}, firebase: { firestore: { FieldValue: { delete: function () { return "DEL"; } } } }, console: console, Math: Math, JSON: JSON, isFinite: isFinite, Object: Object, Array: Array, Promise: Promise, String: String, Number: Number,
  t: function (k) { return ic.t(k); }, escapeHtml: function (v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }, icon: function (n) { return "<i:" + n + ">"; }, jsq: String,
  plainUserName: function (u) { return u ? u.displayName : "?"; }, findUser: function (u) { return { displayName: names[u] || u }; },
  getUserName: function (u) { return names[u] || u; }, avatarHtml: function (u) { return "<av " + u + ">"; },
  canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, fmtDate: String,
  askConfirm: function (o, yes) { asked.push({ o: o, yes: yes }); },
  dbUpdateSession: function (id, patch) { puts.push({ id: id, patch: patch }); return Promise.resolve(); }, dbOnError: function () {}, showToast: function (m) { toasts.push(m); },
  document: { getElementById: function () { return null; }, body: { classList: { add: function () {}, remove: function () {} } }, addEventListener: function () {}, removeEventListener: function () {} },
  lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync("js/tournament.js", "utf8"), ctx, { filename: "js/tournament.js" });
ctx.tourRender = function () {};
// Hall of Fame: a fake Firestore that records get / delete / set on groups/g/hallOfFame/<sid>
var fsStore = { S: { sid: "S", gid: "g", date: "2026-10-28", champion: { uids: ["u1", "u2"], names: ["A", "B"] }, createdBy: "u9" } }, fsLog = [], fsDeny = false;
ctx.currentUser = { uid: "u9" }; ctx.GROUPS_ON = true; ctx.currentGroupId = "g"; ctx.localStorage = { getItem: function () { return null; }, setItem: function () {} };
ctx.fsdb = { collection: function () { return { doc: function () { return { collection: function () { return { doc: function (id) { return {
  get: function () { fsLog.push("get " + id); return Promise.resolve({ exists: !!fsStore[id], id: id, data: function () { return JSON.parse(JSON.stringify(fsStore[id])); } }); },
  delete: function () { fsLog.push("delete " + id); if (fsDeny) return Promise.reject(new Error("denied")); delete fsStore[id]; return Promise.resolve(); },
  set: function (r) { fsLog.push("set " + id); fsStore[id] = r; return Promise.resolve(); } }; } }; } }; } }; } };
vm.runInContext(fs.readFileSync("js/hallfame.js", "utf8"), ctx, { filename: "js/hallfame.js" });


var src = fs.readFileSync("js/tournament.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8");
function finished() {
  var T = ctx.tourNew(uids(8), seeded(11));
  while (!ctx.tourRotDone(T)) { var g = ctx.tourNext(T); ctx.tourApply(T, g, 21, 12 + (T.games.indexOf(g) % 7)); }
  ctx.tourDraw(T, seeded(5));
  while (ctx.tourNext(T)) ctx.tourApply(T, ctx.tourNext(T), 21, 15);
  assert.ok(ctx.tourComplete(T)); return T;
}
var T = finished(), s = { id: "S", date: "2026-10-28", createdAt: 1000, groupId: "g", players: uids(8), createdBy: "u0", tourney: T };
ctx.lastSessions.push(s);
fsStore.S = ctx.hofRecord(s, "g", function (u) { return ctx._hofName(u, u); }, "u9");   // the record hofSave would have stored
assert.ok(fsStore.S && fsStore.S.champion, "a finished tournament has a record");

// ---- 1. placement: not in the winner panel (between champion and bracket), but in its own card ----
var panel = ctx._tnPanel(T, 3, null, 3, true, s);
assert.ok(!/data-act="reset"/.test(panel), "no reset button inside the Winner panel any more");
assert.ok(panel.indexOf("tnWinner") >= 0 && panel.indexOf("tn-bracket") !== panel.indexOf("tnWinner"), "panel still has champion and bracket");
var card = ctx._tnManage();
assert.ok(/class="tn-sec tn-manage"/.test(card) && /data-act="reset"/.test(card) && /<i:trash>/.test(card) && /Removes all scores and the playoff\. Players stay\./.test(card) && />Reset tournament</.test(card), "card: trash icon, label, muted subtitle");
var rs = src.slice(src.indexOf("function tourRender()"), src.indexOf("var TOUR_TABS"));
assert.ok(rs.indexOf("_tnPanel(") < rs.indexOf("_tnManage()"), "the card is rendered after the whole panel (bottom)");
assert.ok(/org && view === 3 && !_tnAnim\) h \+= _tnManage\(\)/.test(rs), "organisers only, Winner step only");
assert.ok(/\.tn-mrow\s*\{[^}]*width: 100%/.test(css) && /\.tn-manage/.test(css), "full-width row styled");

// ---- 2. the confirm: askConfirm, danger, real numbers ----
var played = ctx.tourAll(T).filter(ctx.tourDone).length;
ctx.tourAskClear(s);
assert.strictEqual(asked.length, 1);
var o = asked[0].o;
assert.strictEqual(o.kind, "danger"); assert.strictEqual(o.yes, "Clear tournament"); assert.strictEqual(o.no, "Cancel");
assert.strictEqual(o.detail, played + " matches scored", "real count: " + played);
assert.ok(/Playoff: finished/.test(o.body) && /Champion: .+ \+ .+/.test(o.body) && /Hall of Fame record \(champion .+ \+ .+\) will be removed too/.test(o.body) && !/not changed/.test(o.body) && /Players stay/.test(o.body), "body: playoff, champion, hall of fame, players stay: " + o.body);
assert.ok(!/\bgames?\b/i.test(o.title + o.detail + o.body + o.yes), "EN says match, not game");
assert.strictEqual(puts.length, 0, "nothing is written before the yes");

// ---- 3. yes: tourney deleted AND the Hall of Fame record deleted; Undo brings back both (same id, same data) ----
var hofBefore = JSON.stringify(fsStore.S);
asked[0].yes();
assert.ok(s.tourney === null && puts.length === 1 && puts[0].patch.tourney !== undefined, "tourney removed through dbUpdateSession (FieldValue.delete)");
assert.strictEqual(ctx._tnUndo && ctx._tnUndo.sid, "S"); assert.strictEqual(ctx._tnUndo.snap.po.length, T.po.length, "undo holds the whole tournament");
ctx._tnUndo.hofP.then(function (rec) {
  assert.deepStrictEqual(fsLog, ["get S", "delete S"], "HoF record read then deleted"); assert.ok(!fsStore.S, "record is gone");
  assert.strictEqual(JSON.stringify(rec), JSON.stringify(Object.assign({}, JSON.parse(hofBefore))), "the undo keeps the record data");
  ctx.tourUndoClear(s);
  return new Promise(function (r) { setTimeout(r, 20); });
}).then(function () {
  assert.ok(s.tourney && ctx.tourComplete(s.tourney) && ctx.tourAll(s.tourney).filter(ctx.tourDone).length === played, "undo restores every score");
  assert.strictEqual(JSON.stringify(fsStore.S), hofBefore, "undo wrote the record back with the same id and data");
  assert.ok(fsLog.indexOf("set S") > fsLog.indexOf("delete S"), "set after delete");
  assert.strictEqual(fsLog.filter(function (x) { return x === "set S"; }).length, 1, "hofSave did not write a second copy after the restore");
  // refused delete: the clear still works, a soft note appears
  fsDeny = true; asked.length = 0; ctx.tourAskClear(s); asked[0].yes();
  assert.ok(s.tourney === null, "clear works although the record cannot be deleted");
  return ctx._tnUndo.hofP;
}).then(function (r) {
  assert.strictEqual(r, null); assert.ok(/Hall of Fame record could not be removed/.test(ctx.__noteOf ? "" : ctx.t("tourClrHofKept")), "soft note string exists");
  console.log("clear-tour-v268 async OK");
}).catch(function (e) { console.error(e); process.exit(1); });

// ---- 4. a running tournament: counts and playoff state, keep-playing as cancel ----
var R = ctx.tourNew(uids(8), seeded(3)); for (var i = 0; i < 4; i++) ctx.tourApply(R, ctx.tourNext(R), 21, 10);
var s2 = { id: "R", date: "2026-10-28", players: uids(8), createdBy: "u0", tourney: R }; ctx.lastSessions.push(s2);
asked.length = 0; ctx.tourAskClear(s2);
assert.strictEqual(asked[0].o.detail, "4 matches scored"); assert.ok(/Playoff: not drawn yet/.test(asked[0].o.body) && !/Champion/.test(asked[0].o.body), asked[0].o.body);
assert.strictEqual(asked[0].o.no, "Keep the tournament");

// ---- 5. v268: "Decide by 1 match" is hidden once the tournament is finished, shown while a series can still be shortened ----
var Q = ctx.tourNew(uids(8), seeded(11)); while (!ctx.tourRotDone(Q)) ctx.tourApply(Q, ctx.tourNext(Q), 21, 12);
ctx.tourDraw(Q, seeded(5)); ["S1", "S2", "T1"].forEach(function (l) { ctx.tourApply(Q, Q.po.filter(function (g) { return g.lab === l; })[0], 21, 15); });
var sq = { id: "Q", players: uids(8), createdBy: "u0", tourney: Q };
var runPanel = ctx._tnPanel(Q, 2, null, 2, true, sq);
assert.ok(!ctx.tourComplete(Q) && /data-act="short"/.test(runPanel), "running: Decide by 1 match is offered");
while (ctx.tourNext(Q)) ctx.tourApply(Q, ctx.tourNext(Q), 21, 15);
assert.ok(ctx.tourComplete(Q));
var donePanel = ctx._tnPanel(Q, 3, null, 3, true, sq) + ctx._tnPanel(Q, 2, null, 3, true, sq);
assert.ok(!/data-act="short"/.test(donePanel) && !/data-act="long"/.test(donePanel), "finished: no Decide by 1 / Back to best of 3");
assert.ok(/data-act="edit"/.test(donePanel), "Correct score stays for admins");

// ---- 6. source rules ----
assert.ok(!/\b(confirm|prompt|alert)\s*\(/.test(src.replace(/askConfirm|askYes/g, "")), "no native confirm");
var fnSrc = src.slice(src.indexOf("function tourAskClear"), src.indexOf("function _tnManage"));
assert.ok(/askConfirm\(/.test(fnSrc) && !/\bconfirm\(/.test(fnSrc.replace(/askConfirm/g, "")));
assert.ok(!/class="tn-b dng" data-act="reset"/.test(src), "the old floating pill is gone");
console.log("clear-tour-v268 sync OK");
