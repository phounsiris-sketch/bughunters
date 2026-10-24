/* Run: node tests/poll-manage.test.js — whoever runs polls can edit and delete a poll in any state (open, completed, cancelled) */
var fs = require("fs"), assert = require("assert");
var src = fs.readFileSync("js/polls.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), rules = fs.readFileSync("firestore.rules", "utf8");
assert.ok(/if \(isCreator\) \{\s*html \+= '<details class="poll-manage"( open)?>/.test(src), "the manage block is not limited to open polls");
assert.ok(/onclick="deletePoll\(/.test(src) && /function deletePoll\(/.test(src), "delete button + function");
assert.ok(/trashDoc\("poll", "polls"/.test(src), "delete goes to Recently deleted (undo)");
assert.ok(/poll\.answers \|\| !isOpen/.test(src), "completed polls can be edited");
["deletePoll", "deletePollConfirm"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
assert.ok(/match \/polls\/\{pollId\}[\s\S]*allow delete: if canIn\('createPoll'/.test(rules), "rules let poll managers delete");
console.log("poll-manage OK");

// v204: a tap on "Confirm plan" asks first; other one-tap destructive actions ask too; live score shows the full name
assert.ok(/onclick="askConfirmPoll\(/.test(src) && !/onclick="confirmPoll\(/.test(src), "the Confirm plan button asks first (only the deadline auto-confirm calls confirmPoll)");
assert.ok(/function askConfirmPoll\([\s\S]*askConfirm\(/.test(src));
["groups.js:approveMember", "groups.js:cancelJoinRequest", "groups.js:removeGroupLogo", "settings.js:removeAvatar", "social.js:withdrawInvite"].forEach(function (x) {
  var f = x.split(":")[0], n = x.split(":")[1], s = fs.readFileSync("js/" + f, "utf8"), i = s.indexOf("function " + n + "("), body = s.slice(i, i + 420);
  assert.ok(i >= 0 && /askYes\(/.test(body), n + " asks first");
});
var lsSrc = fs.readFileSync("js/livescore.js", "utf8");
assert.ok(/function lsEditTeams\(\) \{ _lsGuard\(/.test(lsSrc) && /function lsPickSession[\s\S]*_lsGuard\(/.test(lsSrc), "live score: changing teams / game with a score counted asks first");
var css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(/\.ls-half \.ls-chip > span:last-child \{[^}]*white-space: normal/.test(css), "live score names wrap instead of being cut with an ellipsis");
["confirmPlanAsk", "confirmApproveMember", "confirmCancelRequest", "confirmRemovePhoto", "confirmWithdrawInvite", "confirmRemoveSale", "lsLoseScoreConfirm"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
console.log("confirmations OK");

// v205: take back a confirmed poll
assert.ok(/onclick="unconfirmPoll\(/.test(src) && /function unconfirmPoll\([\s\S]*noAuto: true[\s\S]*trashDoc\("session", "sessions"/.test(src), "confirmed poll: remove the session and reopen, without auto re-confirm");
assert.ok(/p\.noAuto\) return/.test(src), "a poll taken back by hand is not auto-confirmed again");
assert.ok(/pl\.status === "confirmed" && pl\.sessionId === sessionId/.test(fs.readFileSync("js/sessions.js", "utf8")), "deleting the session by hand reopens its poll");
["unconfirmPoll", "unconfirmPollAsk", "unconfirmPollYes", "pollReopened"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
console.log("unconfirm OK");
