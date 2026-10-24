/* Run: node tests/poll-manage.test.js — whoever runs polls can edit and delete a poll in any state (open, completed, cancelled) */
var fs = require("fs"), assert = require("assert");
var src = fs.readFileSync("js/polls.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), rules = fs.readFileSync("firestore.rules", "utf8");
assert.ok(/if \(isCreator\) \{\s*html \+= '<details class="poll-manage">/.test(src), "the manage block is not limited to open polls");
assert.ok(/onclick="deletePoll\(/.test(src) && /function deletePoll\(/.test(src), "delete button + function");
assert.ok(/trashDoc\("poll", "polls"/.test(src), "delete goes to Recently deleted (undo)");
assert.ok(/poll\.answers \|\| !isOpen/.test(src), "completed polls can be edited");
["deletePoll", "deletePollConfirm"].forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
assert.ok(/match \/polls\/\{pollId\}[\s\S]*allow delete: if canIn\('createPoll'/.test(rules), "rules let poll managers delete");
console.log("poll-manage OK");
