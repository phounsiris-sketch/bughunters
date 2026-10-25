/* Run: node tests/audit-v231.test.js — the audit decisions of v231: invite code out of member docs, "paid" only for players, no new legacy `votes`,
   fields kept to yourself live in userPrivate. Rules are read as text (they cannot run here); the client parts run with stubs. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var rules = fs.readFileSync("firestore.rules", "utf8"), read = function (f) { return fs.readFileSync(f, "utf8"); };
function slice(src, from, to) { var a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, "slice " + from); return src.slice(a, b); }
var DEL = { __delete: true };
var FV = { delete: function () { return DEL; } };

/* ---------- (a) the invite code is not kept in the member doc ---------- */
(function () {
  var updates = [];
  var ctx = { console: console, currentUser: { uid: "me" }, myMemberships: { g1: { role: "member", status: "active" }, g2: { role: "admin", status: "active" } },
    firebase: { firestore: { FieldValue: FV } },
    fsdb: { collection: function (c) { return { doc: function (id) { return { update: function (d) { updates.push([c, id, d]); return Promise.resolve(); } }; } }; } } };
  vm.createContext(ctx);
  vm.runInContext("var _codeScrubbed = {};\n" + slice(read("js/groups.js"), "function scrubMemberCodes(docs) {", "/** Live updates"), ctx);
  // my own doc (plain member): removed
  ctx.scrubMemberCodes([{ id: "g1_me", gid: "g1", uid: "me", role: "member", code: "ABC123" }]);
  assert.strictEqual(updates.length, 1); assert.strictEqual(updates[0][1], "g1_me"); assert.strictEqual(updates[0][2].code, DEL, "the code field is deleted");
  // someone else's doc in a group where I am only a member: left alone
  ctx.scrubMemberCodes([{ id: "g1_bob", gid: "g1", uid: "bob", role: "member", code: "ABC123" }]); assert.strictEqual(updates.length, 1, "a member never touches another member's doc");
  // an admin cleans the others' docs, but not the owner's
  ctx.scrubMemberCodes([{ id: "g2_bob", gid: "g2", uid: "bob", role: "member", code: "X" }, { id: "g2_own", gid: "g2", uid: "own", role: "owner", code: "X" }, { id: "g2_cy", gid: "g2", uid: "cy", role: "member" }]);
  assert.strictEqual(updates.length, 2, "an admin removes the code from members, not from the owner, and skips docs without one"); assert.strictEqual(updates[1][1], "g2_bob");
  // one try per doc per session
  ctx.scrubMemberCodes([{ id: "g1_me", gid: "g1", uid: "me", role: "member", code: "ABC123" }]); assert.strictEqual(updates.length, 2, "one try per doc");
  // a pending join request (no admin rights): only mine
  var g = read("js/groups.js");
  assert.ok(/scrubMemberCodes\(Object\.keys\(next\)/.test(g) && /scrubMemberCodes\(list\)/.test(g) && /scrubMemberCodes\(\[myMemberships\[gid\]\]\)/.test(g), "scrubbed after joining, when my memberships load, and when an admin loads the roster");
  // the rules: the code can be removed by its owner, never added or changed; joining still needs the code
  assert.ok(/changed\(\)\.hasOnly\(\['nick', 'level', 'message', 'lastSeen', 'code'\]\)/.test(rules) && /!\('code' in request\.resource\.data\) \|\| request\.resource\.data\.code == resource\.data\.get\('code', null\)/.test(rules), "member update: code removable, not addable");
  assert.ok(/request\.resource\.data\.get\('code', ''\) == get\(secretPath\(request\.resource\.data\.gid\)\)\.data\.inviteCode/.test(rules), "joining with the code still works");
})();

/* ---------- (b) "paid" only for the session's players and payers ---------- */
(function () {
  assert.ok(/function settleOk\(\)/.test(rules), "settleOk exists");
  var fn = slice(rules, "function settleOk()", "match /sessions/{sessionId}");
  assert.ok(/canIn\('editBill'/.test(fn) && /canIn\('editSession'/.test(fn) && /request\.auth\.uid in resource\.data\.get\('players', \[\]\)/.test(fn) && /courtPayer/.test(fn) && /shuttlePayer/.test(fn), "players, payers and editors");
  assert.ok(/\(changed\(\)\.hasOnly\(\['settled', 'settledAt', 'status'\]\) && settleOk\(\)\)/.test(rules), "the open 'every member' branch is gone");
  assert.ok(!/Marking a payment as paid is open to every member/.test(rules));
  // the client shows the button only to people the rules let write
  var ctx = { currentUser: { uid: "me" }, canEditBill: function () { return false; }, findUser: function (u) { return { manual: u === "ghost" }; } };
  vm.createContext(ctx); vm.runInContext(slice(read("js/sessions.js"), "function _canMarkTransfer(s, tr) {", "\n}\n") + "\n}", ctx);
  var tr = { from: "me", to: "bob" };
  assert.strictEqual(ctx._canMarkTransfer({ players: ["me", "bob"] }, tr), true, "a player marks their own payment");
  assert.strictEqual(ctx._canMarkTransfer({ players: ["bob", "cy"], courtPayer: "bob" }, { from: "cy", to: "bob" }), false, "someone who is not in the session cannot");
  assert.strictEqual(ctx._canMarkTransfer({ players: ["me", "bob", "cy"] }, { from: "bob", to: "cy" }), false, "a player cannot mark two other people's payment");
  assert.strictEqual(ctx._canMarkTransfer({ players: ["me", "bob", "ghost"] }, { from: "ghost", to: "bob" }), true, "a manual player (no account) can be marked by any player");
  assert.strictEqual(ctx._canMarkTransfer({ players: ["bob"], courtPayer: "me" }, { from: "bob", to: "me" }), true, "the court payer receives and marks");
  assert.strictEqual(ctx._canMarkTransfer({ players: ["bob"], createdBy: "me" }, { from: "bob", to: "cy" }), true, "the organiser who created it");
  ctx.canEditBill = function () { return true; }; assert.strictEqual(ctx._canMarkTransfer({ players: ["bob"] }, { from: "bob", to: "cy" }), true, "whoever edits the bill");
})();

/* ---------- (c) no new writes to the legacy `votes` field ---------- */
(function () {
  var ctx = { firebase: { firestore: { FieldValue: FV } }, t: function (k) { return k; } };
  vm.createContext(ctx); vm.runInContext(slice(read("js/polls.js"), "function legacyPollMigration(data) {", "/** Toggle my answer in a transaction"), ctx);
  var legacy = { confirmedOption: 1, votes: { 0: ["z"], 1: ["a", "b"] }, options: [{ date: "2026-01-01" }, { date: "2026-02-02", time: "18:00", duration: 2, courtId: "c1", courtName: "AP" }] };
  var m = ctx.legacyPollMigration(legacy);
  assert.deepStrictEqual(JSON.stringify(m.responses), JSON.stringify({ a: 0, b: 0 }), "the people who joined the chosen option become Join answers");
  assert.strictEqual(m.fields.votes, DEL, "votes is deleted in the same write"); assert.strictEqual(m.fields.date, "2026-02-02"); assert.strictEqual(m.fields.courtName, "AP"); assert.strictEqual(m.fields.duration, 2);
  assert.deepStrictEqual(JSON.stringify(m.fields.answers), JSON.stringify(["answerJoin", "answerSkip"]));
  var noOpt = ctx.legacyPollMigration({ votes: { 0: ["a"] }, options: [], date: "2026-03-03" });
  assert.ok(!("date" in noOpt.fields), "an existing date is kept"); assert.strictEqual(Object.keys(noOpt.responses).length, 1);
  assert.strictEqual(Object.keys(ctx.legacyPollMigration({}).responses).length, 0, "an empty legacy poll migrates too");
  var p = read("js/polls.js");
  assert.ok(!/update\.votes\s*=/.test(p) && !/\{ votes: votes \}/.test(p), "no code writes votes any more");
  assert.ok(/if \(!canManagePoll\(data\)\) throw new Error\(t\("pollLegacyReadOnly"\)\)/.test(p), "a plain member cannot change an old poll");
  assert.ok(/mig\.fields\.responses = mig\.responses;\s*transaction\.update\(pollRef, mig\.fields\)/.test(p), "the organiser's sheet moves the poll to the current shape");
  assert.ok(/!changed\(\)\.hasAny\(\['votes'\]\)/.test(rules) && !/hasOnly\(\['responses', 'votes'/.test(rules), "rules: votes is never changed; members only write responses, voteLog, reachedAt");
  assert.ok(/!\('votes' in request\.resource\.data\)/.test(rules), "removing votes is allowed (the migration)");
  assert.ok(/normalizePoll/.test(p) && /\(p\.votes \|\| \{\}\)\[idx\]/.test(p), "reading old polls still works");
})();

/* ---------- (d) fields kept to yourself live in userPrivate ---------- */
(function () {
  var writes = [], pending = [];
  var priv = { mine: null };
  var ctx = { console: console, GROUPS_ON: true, currentUser: { uid: "me" }, currentUserProfile: null, DB_CACHE: { users: [] }, Object: Object, Array: Array, Promise: Promise,
    findUser: function (u) { return ctx.DB_CACHE.users.filter(function (x) { return x.id === u; })[0]; }, dbFindById: function () {},
    dbUpdateUser: function (uid, d) { writes.push(["users", uid, d]); return Promise.resolve(); },
    fsdb: { collection: function (c) { return { doc: function (id) { return {
      get: function () { return Promise.resolve({ exists: !!priv.doc, data: function () { return priv.doc; } }); },
      set: function (d, o) { writes.push([c, id, d, o]); return Promise.resolve(); } }; } }; } } };
  vm.createContext(ctx);
  vm.runInContext(slice(read("js/profile.js"), "var VIS_DEFAULT", "var _myPrivate = null;") + "var _myPrivate = null; var _myMine = null;\n" +
    slice(read("js/profile.js"), "var MINE_ABOUT_VIS", "/* ---------- My profile: personal info (one card, one Save) ---------- */"), ctx);
  var VIS = function (o) { return Object.assign({}, ctx.VIS_DEFAULT, o || {}); };
  var vals = { phone: "+8562012345678", firstName: "Mali", lastName: "K", about: { gender: "f", hand: "r", position: "front", homeCourtId: "c1", daysFree: ["mon", "tue"], timeFrom: "18:00", timeTo: "20:00", selfLevel: "S" } };
  // nothing kept to myself: everything stays where it was
  var s0 = ctx.profileSplitMine(vals, VIS());
  assert.strictEqual(s0.any, false); assert.strictEqual(s0.pub.phone, vals.phone); assert.strictEqual(s0.pub.about.gender, "f"); assert.strictEqual(Object.keys(s0.mine.about).length, 0);
  // phone and full name only me
  var s1 = ctx.profileSplitMine(vals, VIS({ phone: "me", fullName: "me" }));
  assert.ok(s1.any && s1.pub.phone === null && s1.pub.firstName === null && s1.pub.lastName === null && s1.mine.phone === vals.phone && s1.mine.firstName === "Mali" && s1.mine.lastName === "K", "phone and name are kept out of users/{uid}");
  assert.strictEqual(s1.pub.about.gender, "f", "other fields stay");
  // about fields only me, day and time share one choice, selfLevel is never moved
  var s2 = ctx.profileSplitMine(vals, VIS({ gender: "me", daysFree: "me", position: "me", homeCourtId: "me", hand: "me", selfLevel: "me" }));
  assert.ok(s2.pub.about.gender === null && s2.pub.about.daysFree === null && s2.pub.about.timeFrom === null && s2.pub.about.timeTo === null && s2.pub.about.position === null && s2.pub.about.homeCourtId === null && s2.pub.about.hand === null, "hidden about fields leave users/{uid}");
  assert.deepStrictEqual(JSON.stringify(s2.mine.about.daysFree), JSON.stringify(["mon", "tue"])); assert.strictEqual(s2.mine.about.timeFrom, "18:00"); assert.strictEqual(s2.pub.about.selfLevel, "S", "selfLevel stays (the app uses it for everyone)");
  assert.deepStrictEqual(JSON.stringify(vals.about.gender), '"f"', "the input is not changed");
  // empty values are not "hidden values"
  var s3 = ctx.profileSplitMine({ phone: null, about: { daysFree: [], gender: null } }, VIS({ phone: "me", daysFree: "me", gender: "me" })); assert.strictEqual(s3.any, false);
  assert.strictEqual(ctx.profileSplitMine(null, null).any, false, "no input, no crash");
  // overlay: my own profile objects get the private fields back, nothing is overwritten
  var prof = { email: "a@b", phone: null, firstName: null, about: { gender: null, hand: "l" } }; ctx.currentUserProfile = prof;
  var cached = { id: "me", about: { daysFree: [] } }; ctx.DB_CACHE.users = [cached];
  ctx._myMine = { phone: "+8562099999999", firstName: "Mali", about: { gender: "f", hand: "r", daysFree: ["fri"] } };
  ctx.profileApplyMine();
  assert.strictEqual(prof.phone, "+8562099999999"); assert.strictEqual(prof.firstName, "Mali"); assert.strictEqual(prof.about.gender, "f"); assert.strictEqual(prof.about.hand, "l", "a value that is there is kept");
  assert.deepStrictEqual(JSON.stringify(cached.about.daysFree), JSON.stringify(["fri"]), "the cached copy of me gets them too");
  ctx._myMine = null; assert.doesNotThrow(function () { ctx.profileApplyMine(); });
  // sign-in: nothing kept to myself -> no extra read or write
  writes.length = 0; priv.doc = null;
  ctx.currentUserProfile = { phone: "+8562011111111", vis: VIS() }; ctx.profileLoadMine();
  setTimeout(function () {
    assert.strictEqual(writes.length, 0, "nothing hidden: nothing moved");
    // sign-in: phone is "only me" but an older version left it in users/{uid}: moved now
    ctx.currentUserProfile = { phone: "+8562011111111", firstName: "Mali", about: { gender: "f" }, vis: VIS({ phone: "me" }) };
    ctx.DB_CACHE.users = [ctx.currentUserProfile]; ctx.currentUserProfile.id = "me";
    priv.doc = { dob: "2000-01-01", mine: { about: { hand: "r" } } };
    ctx.profileLoadMine();
    setTimeout(function () {
      var pw = writes.filter(function (w) { return w[0] === "userPrivate"; })[0], uw = writes.filter(function (w) { return w[0] === "users"; })[0];
      assert.ok(pw && uw, "private copy written and public copy cleared");
      assert.strictEqual(JSON.stringify(pw[3].mergeFields), '["mine"]', "only the mine field is replaced; dob stays");
      assert.strictEqual(pw[2].mine.phone, "+8562011111111"); assert.strictEqual(pw[2].mine.about.hand, "r", "what was already private is kept");
      assert.strictEqual(uw[2].phone, null); assert.strictEqual(uw[2].firstName, "Mali", "only hidden fields are cleared"); assert.strictEqual(uw[2].about.gender, "f");
      assert.ok(writes.indexOf(pw) < writes.indexOf(uw), "private copy first, then the public one is cleared (no data loss)");
      assert.strictEqual(ctx._myMine.phone, "+8562011111111", "and it is back on my own profile in memory");
      assert.strictEqual(ctx.currentUserProfile.phone, "+8562011111111");
      // wiring
      var pr = read("js/profile.js"), auth = read("js/auth.js"), db = read("js/db.js");
      assert.ok(/var sp = profileSplitMine\(/.test(pr) && /mergeFields: \["dob", "relationship", "mine"\]/.test(pr) && /nickname: \(f\.nickname \|\| ""\)\.trim\(\) \|\| null, phone: sp\.pub\.phone, about: sp\.pub\.about/.test(pr), "saving writes the split");
      assert.ok(/profileLoadMine\(\)/.test(auth) && /_myMine = null/.test(auth), "sign-in loads it, sign-out forgets it");
      assert.ok(/profileApplyMine\(\)/.test(db), "a refreshed users list gets my private fields again");
      ["health.js", "social.js"].forEach(function (f) { assert.ok(/profileApplyMine\(\)/.test(read("js/" + f)), f + " puts them back when it reads the private doc"); });
      // rules
      assert.ok(/function mineOk\(d\)/.test(rules) && /allow write: if isOwner\(uid\) && healthOk\(request\.resource\.data\) && mineOk\(request\.resource\.data\)/.test(rules), "userPrivate accepts only the known mine shape");
      assert.ok(/hasOnly\(\['phone', 'firstName', 'lastName', 'about'\]\)/.test(rules) && /hasOnly\(\['gender', 'hand', 'position', 'homeCourtId', 'daysFree', 'timeFrom', 'timeTo'\]\)/.test(rules));
      assert.ok(/match \/userPrivate\/\{uid\} \{\s*allow read: if isOwner\(uid\);/.test(rules), "only the owner reads it");
      // i18n
      var i18n = read("js/i18n.js"); assert.strictEqual((i18n.match(/^\s+pollLegacyReadOnly:/gm) || []).length, 2, "pollLegacyReadOnly in EN + Lao");
      assert.ok(!/\beval\s*\(|new Function/.test(pr) && !/\b(confirm|prompt|alert)\s*\(/.test(pr.replace(/askYes|askConfirm/g, "")), "no eval, no native dialogs");
      console.log("audit v231 OK");
    }, 30);
  }, 30);
})();
