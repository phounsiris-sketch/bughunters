/* Run: node tests/delete-cascade.test.js — v241: deleting a session removes its games and Hall of Fame record, one Undo restores all */
var fs = require("fs"), assert = require("assert"), vm = require("vm");
var trash = fs.readFileSync("js/trash.js", "utf8"), ses = fs.readFileSync("js/sessions.js", "utf8"), rules = fs.readFileSync("firestore.rules", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8");

// pure helpers
var ctx = {}; vm.createContext(ctx);
vm.runInContext(trash.slice(0, trash.indexOf("function _trashEntry")), ctx);
assert.strictEqual(JSON.stringify(ctx.trashChunk([1, 2, 3, 4, 5], 2)), "[[1,2],[3,4],[5]]");
assert.strictEqual(JSON.stringify(ctx.trashChunk([], 200)), "[]");
assert.strictEqual(ctx.cascadeUndoIds("s", "p", "h", ["m1", "m2"]), "s,p,h,m1,m2", "session first, then poll, record, games");
assert.strictEqual(ctx.cascadeUndoIds("s", null, null, []), "s");
assert.strictEqual(ctx.cascadeUndoIds("s", null, "h", undefined), "s,h");
assert.ok(ctx.TRASH_KINDS.matches === "scoreboard" && ctx.TRASH_KINDS.hof === "trophy");

// the delete path
var f = ses.slice(ses.indexOf("function deleteSessionById("), ses.indexOf("function trashLabelSession("));
assert.ok(/askYes\(t\("deleteConfirm"\)/.test(f), "asks first");
var iM = f.indexOf("trashSessionMatches(sessionId"), iH = f.indexOf("trashSessionHof(sessionId"), iS = f.indexOf('trashDoc("session"'), iP = f.indexOf('trashDoc("poll"');
assert.ok(iM > 0 && iM < iH && iH < iS && iS < iP, "games, record, session, poll in that order");
assert.ok(/where\("sessionId", "==", sid\)/.test(f) && /hallOfFame/.test(f) && /hofLocalDrop/.test(f), "queries the session's games, drops the record and the local copy");
assert.ok(/cascadeUndoIds\(done\.session, done\.poll, done\.hof, done\.matches\)/.test(f), "one Undo for everything");
assert.ok(/e\.items/.test(trash) && /collection\("matches"\)\.doc\(m\.id\)\.*/.test(trash), "restore puts the games back");
["trashKind_matches", "trashKind_hof", "trashGamesLabel"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });

// rules: who may delete a session may delete and restore its games and record
assert.ok(/function sessionMgr\(/.test(rules));
assert.ok(/match \/matches\/\{id\}[\s\S]*allow delete:[^;]*sessionMgr\(/.test(rules), "matches: session manager may delete");
assert.ok(/match \/matches\/\{id\}[\s\S]*allow create: if request\.resource\.data\.get\('groupId', ''\) != '' && sessionMgr\(/.test(rules), "matches: restore");
assert.ok(/match \/hallOfFame\/\{sid\}[\s\S]*allow create: if idOk\(sid\) && sessionMgr\(/.test(rules) && /allow delete:[^;]*sessionMgr\(sid, gid\)/.test(rules), "hall of fame: delete + restore");

// stats read the live listener: a deleted match leaves lastMatches by itself
assert.ok(/_matchesUnsub = groupScoped\(fsdb\.collection\("matches"\)\)\.onSnapshot/.test(fs.readFileSync("js/stats.js", "utf8")));
console.log("delete-cascade OK");
