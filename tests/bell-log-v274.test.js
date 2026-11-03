/* Run: node tests/bell-log-v274.test.js — v274: push bell states + notification log (rules, sender doc, client rendering, i18n).
   No version number is hard-coded here. */
var fs = require("fs"), vm = require("vm"), assert = require("assert");

/* ---- sender doc (pure) ---- */
var pl = require("../push/pushlog");
assert.strictEqual(pl.pushKind("https://x.github.io/app/#session=abc"), "session");
assert.strictEqual(pl.pushKind("#payments"), "payment");
assert.strictEqual(pl.pushKind("https://x/#polls"), "poll");
assert.strictEqual(pl.pushKind("#public"), "game");
assert.strictEqual(pl.pushKind("#buddies"), "invite");
assert.strictEqual(pl.pushKind("#group=g1"), "group");
assert.strictEqual(pl.pushKind("https://x/"), "other");
var d = pl.pushLogDoc({ uid: "u", title: "T", body: "B", link: "https://x.github.io/app/#session=s1" }, { successCount: 1, failureCount: 1 }, "AT", "EXP");
assert.deepStrictEqual(Object.keys(d).sort(), ["at", "body", "err", "expireAt", "kind", "link", "ok", "title"]);
assert.strictEqual(d.link, "#session=s1"); assert.strictEqual(d.ok, true); assert.strictEqual(d.err, ""); assert.strictEqual(d.at, "AT");
var f = pl.pushLogDoc({ title: "T", body: "B", link: "#polls" }, { successCount: 0, failureCount: 2, firstError: "messaging/registration-token-not-registered" }, "AT", "EXP");
assert.strictEqual(f.ok, false); assert.ok(f.err.length > 0 && f.err.length <= 80);
assert.ok(pl.pushLogDoc({ title: "x".repeat(999), body: "y".repeat(999), link: "#a" }, { successCount: 1 }, 1, 2).title.length <= 160);

/* sender wiring: writes only, batched, never stops the sender, no read of pushLog */
var send = fs.readFileSync("push/send.js", "utf8");
assert.ok(/collection\("pushLog"\)\.doc\(\)/.test(send) && /b\.set\(/.test(send) && /i \+= 400/.test(send), "batched set() on an auto-id doc");
assert.ok(!/pushLog"\)[^;]*\.get\(/.test(send), "the sender never reads the log");
assert.ok(/try \{[\s\S]*pushLog[\s\S]*\} catch/.test(send), "a log failure does not stop the sender");

/* ---- rules ---- */
var rules = fs.readFileSync("firestore.rules", "utf8");
var m = rules.match(/match \/userPrivate\/\{uid\} \{([\s\S]*?)\n    \}\n/);
assert.ok(m, "userPrivate block");
assert.ok(/allow read: if isOwner\(uid\);/.test(m[1]) && /allow write: if isOwner\(uid\) && healthOk\(request\.resource\.data\) && mineOk/.test(m[1]), "owner-only health/mine rules unchanged");
var sub = m[1].match(/match \/pushLog\/\{logId\} \{([\s\S]*?)\}/);
assert.ok(sub, "pushLog subcollection rule");
assert.ok(/allow read: if isOwner\(uid\);/.test(sub[1]) && /allow write: if false;/.test(sub[1]) && !/isAuth\(\)\s*;/.test(sub[1]), "owner reads, nobody writes");

/* ---- client ---- */
var push = fs.readFileSync("js/push.js", "utf8");
var store = {}, docs = [], calls = [];
function query(path) {
  var q = { orderBy: function (f, dir) { calls.push("orderBy " + f + " " + dir); return q; }, limit: function (n) { calls.push("limit " + n); return q; },
    get: function () { calls.push("get " + path); return Promise.resolve({ empty: !docs.length, docs: docs.map(function (x) { return { data: function () { return x; } }; }) }); } };
  return q;
}
var ctx = { console: console, setTimeout: setTimeout, Promise: Promise, Date: Date,
  localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } },
  t: function (k) { return "[" + k + "]"; }, escapeHtml: function (s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); },
  icon: function (n) { return "<i>" + n + "</i>"; }, fmtDate: function (k) { return "D" + k; }, currentUser: { uid: "u1" },
  fsdb: { collection: function (c) { return { doc: function (id) { return { collection: function (s) { return query(c + "/" + id + "/" + s); } }; } }; } },
  document: { getElementById: function () { return null; } }, window: { addEventListener: function () {}, matchMedia: function () { return { matches: false }; } },
  navigator: { userAgent: "x" }, location: { hash: "" }, PUSH_VAPID_KEY: "k", Notification: { permission: "default" }, firebase: {} };
ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(push, ctx);

// the four states
function st(setup) { var c = ctx; setup(c); return vm.runInContext("pbState()", c); }
ctx.pushSupported = function () { return true; };
ctx.Notification.permission = "default"; assert.strictEqual(vm.runInContext("pbState()", ctx), "off");
ctx.Notification.permission = "denied"; assert.strictEqual(vm.runInContext("pbState()", ctx), "blocked");
ctx.Notification.permission = "granted"; store["pushOn_u1"] = "1"; assert.strictEqual(vm.runInContext("pbState()", ctx), "on");
delete store["pushOn_u1"]; assert.strictEqual(vm.runInContext("pbState()", ctx), "off", "granted but not subscribed = off");
ctx.pushSupported = function () { return false; }; assert.strictEqual(vm.runInContext("pbState()", ctx), "unsupported");
ctx.pushSupported = function () { return true; };
ctx.navigator.userAgent = "iPhone"; assert.strictEqual(vm.runInContext("pbState()", ctx), "unsupported", "iOS outside the Home Screen");
ctx.navigator.userAgent = "x";

// log rendering: empty, grouped by day, escaped, link only when it is a plain hash
assert.ok(/pbLogEmpty/.test(vm.runInContext("pbLogHtml([])", ctx)), "empty state");
var now = Date.now();
var html = vm.runInContext("pbLogHtml(" + JSON.stringify([
  { at: now, kind: "poll", title: "<b>x</b>", body: "b", link: "#polls", ok: true, err: "" },
  { at: now - 1000, kind: "session", title: "T2", body: "B2", link: "javascript:alert(1)", ok: false, err: "e" },
  { at: now - 2 * 86400e3, kind: "weird", title: "T3", body: "B3", link: "", ok: true, err: "" }]) + ")", ctx);
assert.ok(html.indexOf("<b>x</b>") < 0 && html.indexOf("&#60;b&#62;") >= 0, "title is escaped");
assert.strictEqual((html.match(/class="pb-day"/g) || []).length, 2, "two day groups");
assert.strictEqual((html.match(/onclick="pbLogGo\(/g) || []).length, 1, "only the plain #hash link is tappable");
assert.ok(/pbNotDelivered/.test(html) && /<i>bell<\/i>/.test(html), "failed marker; unknown kind falls back to the bell");

// unseen dot: first refresh reads one newest entry; a newer one than last-seen shows the dot
var shown = {};
var els = { pushBell: { setAttribute: function () {}, title: "" }, pushBellNew: { style: {} } };
ctx.document.getElementById = function (id) { return els[id] || null; };
docs = [{ at: { toMillis: function () { return 5000; } } }];
vm.runInContext("pbRefresh()", ctx);
return_later();
function return_later() {
  setTimeout(function () {
    assert.deepStrictEqual(calls, ["orderBy at desc", "limit 1", "get userPrivate/u1/pushLog"], "one-doc probe: " + calls.join(","));
    assert.strictEqual(els.pushBellNew.style.display, "", "dot shown: newer than last seen");
    calls.length = 0; store["pushLogSeen_u1"] = "9000";
    vm.runInContext("pbRefresh()", ctx);
    assert.strictEqual(calls.length, 0, "no second read in the same sign-in");
    assert.strictEqual(els.pushBellNew.style.display, "none", "dot hidden once seen");
    // opening the log: one get(), orderBy at desc, limit 20
    calls.length = 0; docs = [];
    els.pushSheet = { innerHTML: "" };
    vm.runInContext("pbLogOpen()", ctx);
    setTimeout(function () {
      assert.deepStrictEqual(calls, ["orderBy at desc", "limit 20", "get userPrivate/u1/pushLog"], "log open: " + calls.join(","));
      assert.ok(/pbLogEmpty/.test(els.pushSheet.innerHTML), "empty state in the sheet");
      finish();
    }, 20);
  }, 20);
}

function finish() {
  /* ---- wiring + i18n + hygiene ---- */
  var idx = fs.readFileSync("index.html", "utf8");
  assert.ok(/id="pushBell"[^>]*onclick="pbOpen\(\)"/.test(idx), "bell button in the app header");
  assert.ok(/pbRefresh/.test(fs.readFileSync("js/app.js", "utf8")), "refresh hook");
  var ictx = { console: console, localStorage: { getItem: function () { return null; }, setItem: function () {} } }; ictx.window = ictx; vm.createContext(ictx);
  vm.runInContext(fs.readFileSync("js/i18n.js", "utf8") + "\n;this.__tr = translations;", ictx);
  var en = ictx.__tr.en, la = ictx.__tr.la;
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(la).sort(), "EN and LA keys match");
  var used = {};
  (push.match(/t\("(pb[A-Za-z_]+)"\)/g) || []).forEach(function (x) { used[x.slice(3, -2)] = 1; });
  ["on", "off", "blocked", "unsupported"].forEach(function (s) { used["pbSt_" + s] = 1; used["pbText_" + s] = 1; });
  Object.keys(used).forEach(function (k) { assert.ok(en[k] && la[k], "i18n " + k); });
  var ic = {}; vm.createContext(ic); vm.runInContext(fs.readFileSync("js/icons.js", "utf8"), ic);
  vm.runInContext("PB_KIND_ICON", ctx); Object.values(vm.runInContext("PB_KIND_ICON", ctx)).forEach(function (n) { assert.ok(vm.runInContext("SOLAR", ic)[n], "icon " + n); });
  assert.ok(!/confirm\(|alert\(|prompt\(/.test(push.replace(/askConfirm|askYes/g, "")), "no native dialogs in push.js");
  var css = fs.readFileSync("css/styles.css", "utf8");
  assert.ok(!/prefers-color-scheme/.test(css), "no prefers-color-scheme");
  assert.strictEqual(fs.readFileSync("js/app.js", "utf8").match(/APP_VERSION = "(v\d+)"/)[1], fs.readFileSync("sw.js", "utf8").match(/godsmash-(v\d+)/)[1], "APP_VERSION and CACHE_NAME agree");
  console.log("bell-log-v274 OK");
}
