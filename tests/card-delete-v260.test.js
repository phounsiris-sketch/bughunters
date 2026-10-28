/* Run: node tests/card-delete-v260.test.js — v260: ⋯ on Sessions cards (permission, sheet items), richer delete-session confirm, cascade unchanged */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var games = fs.readFileSync("js/games.js", "utf8"), ses = fs.readFileSync("js/sessions.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8");

var calls = [];
var T = { cmMore: "More actions", cmEditDetails: "Edit details", cmBill: "Bill", cmDeleteSession: "Delete session", cmEditVote: "Edit vote", cmDeleteVote: "Delete vote",
  cdTitle: "Delete this session?", cdTournament: "Tournament", cdAlso: "This will also remove:", cdMatches: "{n} matches", cdHof: "Hall of Fame entry", cdPoll: "The linked vote",
  cdUndo: "You can undo for 30 days in Recently deleted.", delete: "Delete", sessionsWord: "Sessions" };
var perm = { del: true, det: true, bill: true, poll: true };
var ctx = { t: function (k) { return T[k] || k; }, escapeHtml: String, jsq: String, fmtDate: function (d) { return d; },
  canDeleteSession: function () { return perm.del; }, canEditSessionDetails: function () { return perm.det; }, canEditBill: function () { return perm.bill; }, canManagePoll: function () { return perm.poll; },
  lastSessions: [{ id: "s1", date: "2026-10-30", time: "18:00", courtName: "Court 1", pollId: "p1" }], _findPoll: function (id) { return id === "p1" ? { id: "p1", status: "confirmed", sessionId: "s1" } : { id: id }; },
  showSessionDetailsModal: function (i) { calls.push("details:" + i); }, openSessionBill: function (i) { calls.push("bill:" + i); }, deleteSessionById: function (i) { calls.push("del:" + i); },
  showEditPoll: function (i) { calls.push("editpoll:" + i); }, deletePoll: function (i) { calls.push("delpoll:" + i); },
  tourOf: function (s) { return s.tour || null; }, lastMatches: [{ sessionId: "s1" }, { sessionId: "s1" }, { sessionId: "s1" }, { sessionId: "other" }], _hofStored: [{ sid: "s1" }], _hofSaved: {},
  document: { addEventListener: function () {}, removeEventListener: function () {}, getElementById: function () { return null; } }, icon: function () { return ""; } };
vm.createContext(ctx);
vm.runInContext(games, ctx);
vm.runInContext(ses.slice(ses.indexOf("function sessionDeleteInfo("), ses.indexOf("function deleteSessionById(")), ctx);

// 1. the ⋯ button: only with permission, never inside the card button, stops the tap
var sit = { kind: "session", id: "s1", s: ctx.lastSessions[0] }, pit = { kind: "poll", id: "p9", poll: { id: "p9" } };
assert.ok(/gc-more/.test(ctx._gameMoreBtn(sit)) && /aria-label="More actions"/.test(ctx._gameMoreBtn(sit)) && /stopPropagation/.test(ctx._gameMoreBtn(sit)), "button, label, stopPropagation");
perm.del = false; perm.det = false; perm.bill = false;
assert.strictEqual(ctx._gameMoreBtn(sit), "", "session: none of the three permissions -> no ⋯");
perm.bill = true; assert.notStrictEqual(ctx._gameMoreBtn(sit), "", "canEditBill alone is enough");
perm.bill = false; perm.det = true; assert.notStrictEqual(ctx._gameMoreBtn(sit), "", "canEditSessionDetails alone is enough");
perm.det = false; perm.del = true; assert.notStrictEqual(ctx._gameMoreBtn(sit), "", "canDeleteSession alone is enough");
perm.poll = false; assert.strictEqual(ctx._gameMoreBtn(pit), "", "vote: no canManagePoll -> no ⋯");
perm.poll = true; assert.notStrictEqual(ctx._gameMoreBtn(pit), "");
assert.ok(/class="gcard-wrap">' \+ '<button type="button" class="game-card2"[\s\S]*<\/button>' \+ more \+ '<\/div>/.test(games), "⋯ is a sibling of the card button (no button in a button)");

// 2. sheet items
perm.del = perm.det = perm.bill = true;
var names = function (a) { return a.map(function (x) { return x.sep ? "-" : x.key; }).join(","); };
assert.strictEqual(names(ctx.cardMenuItems("session", "s1")), "editDetails,bill,-,deleteSession");
perm.del = false; assert.strictEqual(names(ctx.cardMenuItems("session", "s1")), "editDetails,bill", "no delete without canDeleteSession, no trailing separator");
perm.del = true; perm.det = false; perm.bill = false; assert.strictEqual(names(ctx.cardMenuItems("session", "s1")), "deleteSession", "delete only: no leading separator");
perm.det = perm.bill = true;
assert.strictEqual(names(ctx.cardMenuItems("poll", "p9")), "editVote,-,deleteVote");
assert.ok(ctx.cardMenuItems("session", "s1").pop().danger && ctx.cardMenuItems("poll", "p9").pop().danger, "delete items are red");
ctx.cardMenuItems("session", "s1").filter(function (x) { return x.run; }).forEach(function (x) { x.run(); });
ctx.cardMenuItems("poll", "p9").filter(function (x) { return x.run; }).forEach(function (x) { x.run(); });
assert.deepStrictEqual(calls, ["details:s1", "bill:s1", "del:s1", "editpoll:p9", "delpoll:p9"], "items call the existing flows");
assert.ok(/Escape/.test(games) && /e\.target === el/.test(games) && /role="dialog" aria-modal="true"/.test(games) && /o\.focus\(\)/.test(games), "Esc, backdrop, dialog role, focus return");

// 3. confirm text
var i = ctx.sessionDeleteInfo(ctx.lastSessions[0], "s1");
assert.strictEqual(i.title, "Delete this session?");
assert.strictEqual(i.detail, "2026-10-30 · 18:00 · Court 1");
assert.ok(/3 matches/.test(i.body) && /Hall of Fame entry/.test(i.body) && /The linked vote/.test(i.body) && /You can undo for 30 days in Recently deleted\.$/.test(i.body), i.body);
assert.ok(i.kind === "danger" && i.yes === "Delete");
var tr = ctx.sessionDeleteInfo({ id: "s2", date: "2026-10-31", time: "", courtName: "C", tour: { games: [] } }, "s2");
assert.ok(/Tournament$/.test(tr.detail), "tournament tag");
assert.ok(!/matches|Hall of Fame|vote/.test(tr.body) && /undo/.test(tr.body), "no counts when nothing is attached: " + tr.body);

// 4. cascade unchanged, no native confirm
var d = ses.slice(ses.indexOf("function deleteSessionById("), ses.indexOf("function trashSessionMatches("));
assert.ok(/askConfirm\(sessionDeleteInfo\(s0, sessionId\), function \(\) \{ _deleteSessionRun\(sessionId\); \}\)/.test(d), "ask first, then the cascade");
var run = d.slice(d.indexOf("function _deleteSessionRun("));
assert.ok(/trashSessionMatches\(sessionId[\s\S]*trashSessionHof\(sessionId[\s\S]*trashDoc\("session"[\s\S]*trashDoc\("poll"[\s\S]*showUndoToast\([^\n]*cascadeUndoIds\(done\.session, done\.poll, done\.hof, done\.matches\)/.test(run), "cascade + Undo toast as v241");
assert.ok(!/\bconfirm\(/.test(games.replace(/askConfirm|closeCardMenu/g, "")) && !/[^k]\bconfirm\(/.test(d.replace(/askConfirm/g, "")), "no native confirm");
["tour", "deleteSessionById", "_deleteSessionRun"].forEach(function () {});
assert.strictEqual((ses.match(/deleteSessionById\(/g) || []).length >= 4, true, "the other callers (bill tab, edit costs, list) still call it");

// 5. i18n + css
["cmMore", "cmEditDetails", "cmBill", "cmDeleteSession", "cmEditVote", "cmDeleteVote", "cdTitle", "cdTournament", "cdAlso", "cdMatches", "cdHof", "cdPoll", "cdUndo"].forEach(function (k) {
  assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
assert.ok(/\.gc-more \{[^}]*width: 44px; height: 44px/.test(css) && /\.gc-more:focus-visible/.test(css), "44px target + focus ring");
assert.ok(/\.gcard-wrap \.gc-top \{ padding-right: 30px/.test(css), "room for the ⋯ so it never covers the pill");
console.log("card-delete-v260 OK");
