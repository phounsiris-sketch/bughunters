/* Run: node tests/one-bell-v276.test.js — v276: one bell (push state + log as rows in the in-app list, one dot), "Game format". No version hard-coded. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var idx = fs.readFileSync("index.html", "utf8"), push = fs.readFileSync("js/push.js", "utf8"), notify = fs.readFileSync("js/notify.js", "utf8"), css = fs.readFileSync("css/styles.css", "utf8");

// A. a single bell button in the header
assert.strictEqual((idx.match(/data-icon="bell"/g) || []).length, 1, "one bell icon in index.html");
assert.ok(!/pushBell|pb-slash|pb-dot|pushBellNew/.test(idx + push + css + notify), "second button and its CSS/JS are gone");
assert.ok(/id="bellBadge"/.test(idx) && /id="bellDot"/.test(idx) && /onclick="toggleNotifications\(event\)"/.test(idx));

var store = {}, state = "off", els = {}, reads = 0;
var ctx = { console: console, setTimeout: setTimeout, Promise: Promise, Date: Date,
  localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } },
  t: function (k) { return "[" + k + "]"; }, icon: function (n) { return "<i>" + n + "</i>"; }, currentUser: { uid: "u1" },
  fsdb: { collection: function () { return { doc: function () { return { collection: function () { var q = { orderBy: function () { return q; }, limit: function () { return q; }, get: function () { reads++; return Promise.resolve({ empty: true, docs: [] }); } }; return q; } }; } }; } },
  document: { getElementById: function (id) { return els[id] || null; } }, window: { addEventListener: function () {}, matchMedia: function () { return { matches: false }; } },
  navigator: { userAgent: "x" }, location: { hash: "" }, PUSH_VAPID_KEY: "k", Notification: { permission: "default" }, firebase: {} };
ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(push, ctx);
ctx.pushSupported = function () { return true; };
function run(s) { return vm.runInContext(s, ctx); }

// badge / dot logic (pure)
assert.strictEqual(run('pbBellDot(0,"off",false)'), true, "Off -> dot");
assert.strictEqual(run('pbBellDot(0,"blocked",false)'), true, "Blocked -> dot");
assert.strictEqual(run('pbBellDot(0,"on",false)'), false, "On, nothing new -> no dot");
assert.strictEqual(run('pbBellDot(0,"unsupported",false)'), false, "Not supported -> no dot");
assert.strictEqual(run('pbBellDot(0,"on",true)'), true, "unseen log merges into the dot");
assert.strictEqual(run('pbBellDot(3,"off",true)'), false, "red count wins, no dot beside it");

// refresh drives the real elements; one read per sign-in
els.bellBadge = { style: { display: "none" } }; els.bellDot = { style: {} }; els.bellBtn = { attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; } };
run("pbRefresh()"); assert.strictEqual(els.bellDot.style.display, "", "off + count 0 -> dot shown");
assert.ok(/\[pbSt_off\]/.test(els.bellBtn.attrs["aria-label"]), "state in the accessible name, not colour only");
els.bellBadge.style.display = ""; run("pbRefresh()"); assert.strictEqual(els.bellDot.style.display, "none", "count shown -> dot hidden");
setTimeout(function () {
  assert.strictEqual(reads, 1, "only the v274 sign-in read: " + reads);

  // list top rows: state (dot + text) then the log link
  var rows = run("pbBellRows()");
  assert.ok(/class="pb-st" data-st="off"/.test(rows) && /\[pbThisPhone\]: \[pbSt_off\]/.test(rows), "This phone: Off with a state dot and text");
  assert.ok(/pbFromBell\(event,'state'\)/.test(rows) && /pbFromBell\(event,'log'\)/.test(rows) && /\[pbLogLink\]/.test(rows));
  ctx.Notification.permission = "denied"; assert.ok(/data-st="blocked"[\s\S]*pbSt_blocked/.test(run("pbBellRows()")));
  assert.ok(/pbBellRows\(\)/.test(notify) && /html \+= pbBellRows\(\)/.test(notify), "rendered at the top of the notification panel");
  assert.ok(/pbRefresh\(\)/.test(notify), "badge changes refresh the dot");

  // tapping a row closes the list and opens the existing sheets
  var closed = false, opened = [];
  els.notifPanel = { classList: { remove: function () { closed = true; } } };
  ctx.pbOpen = function () { opened.push("state"); }; ctx.pbLogOpen = function () { opened.push("log"); };
  run("pbFromBell(null,'state')"); run("pbFromBell(null,'log')");
  assert.ok(closed && opened.join() === "state,log");

  // B. Game format
  var ic = { console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } }; ic.window = ic; vm.createContext(ic);
  vm.runInContext(fs.readFileSync("js/i18n.js", "utf8") + "\n;this.__tr = translations;", ic);
  var en = ic.__tr.en, la = ic.__tr.la;
  assert.strictEqual(en.lsFormat, "Game format"); assert.ok(/ເກມ/.test(la.lsFormat) && !/ແມັດ/.test(la.lsFormat));
  assert.ok(/Match/.test(en.lsMatchScore || "Match") && !/Game/.test(en.lsMatchScore || ""), "match-level labels stay Match");
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(la).sort(), "EN and LA keys match");
  ["pbThisPhone", "pbNewLog"].forEach(function (k) { assert.ok(en[k] && la[k], k); });
  assert.ok(!/confirm\(|alert\(|prompt\(/.test(push.replace(/askConfirm|askYes/g, "")), "no native dialogs");
  assert.strictEqual(fs.readFileSync("js/app.js", "utf8").match(/APP_VERSION = "(v\d+)"/)[1], fs.readFileSync("sw.js", "utf8").match(/godsmash-(v\d+)/)[1]);
  console.log("one-bell-v276 OK");
}, 20);
