/* Run: node tests/ledger.test.js — computeLedger invariants on realistic and edge-case bills, money formatting */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var names = { a: "Ann", b: "Bob", c: "Cat", d: "Dan", e: "Eve", f: "Fay", ghost: "Ghost" };
var ctx = { console: console, currentUser: { uid: "a" }, lastSessions: [], GROUPS_ON: false, localStorage: { getItem: function () { return null; }, setItem: function () {} },
  t: function (k) { return k; }, getUserName: function (u) { return names[u] || "?"; }, escapeHtml: String, icon: function () { return ""; }, avatarHtml: function () { return ""; },
  fmtDate: String, fmtHours: String, weekdayShort: function () { return "Mon"; }, findUser: function (u) { return names[u] ? { displayName: names[u] } : null; },
  document: { addEventListener: function () {} }, setTimeout: setTimeout, canEditBill: function () { return true; }, canEditSessionDetails: function () { return true; },
  courtPrice: function (c) { return c.price; }, findCourt: function () { return null; } };
ctx.window = ctx; vm.createContext(ctx);
var app = fs.readFileSync("js/app.js", "utf8");
vm.runInContext(app.slice(app.indexOf("var CURRENCY ="), app.indexOf("/** \"200,000\"")), ctx);
vm.runInContext(fs.readFileSync("js/sessions.js", "utf8"), ctx);
function S(o) { return Object.assign({ id: "s", date: "2026-10-01", time: "17:00", duration: 2, calculated: true, groupId: "g", players: ["a", "b", "c", "d"], courtCost: 0, shuttleTotal: 0, otherCosts: [], dinner: null, settled: {} }, o); }
var cases = [
  ["plain court", S({ courtCost: 200000, courtPayer: "a" })],
  ["court+shuttle+dinner, different payers", S({ courtCost: 240000, courtPayer: "a", shuttleTotal: 95000, shuttlePayer: "b", dinner: { totalBill: 311000, paidBy: "c", diners: ["a", "c", "d"] } })],
  ["15% discount, uneven", S({ courtCost: 333333, courtPayer: "a", shuttleTotal: 77777, shuttlePayer: "b", discount: { type: "percent", value: 15 } })],
  ["discount bigger than the bill", S({ courtCost: 100000, courtPayer: "a", discount: { type: "amount", value: 500000 } })],
  ["discount on zero", S({ courtCost: 0, discount: { type: "percent", value: 20 } })],
  ["payer not playing", S({ courtCost: 300000, courtPayer: "ghost" })],
  ["other cost for a non-player", S({ courtCost: 100000, courtPayer: "a", otherCosts: [{ desc: "water", amount: 40000, paidBy: "b", forUid: "f" }] })],
  ["diner not in players", S({ courtCost: 100000, courtPayer: "a", dinner: { totalBill: 200000, paidBy: "a", diners: ["a", "e"] } })],
  ["two-way netting", S({ players: ["a", "b"], courtCost: 200000, courtPayer: "a", shuttleTotal: 190000, shuttlePayer: "b" })],
  ["7 players, thirds", S({ players: ["a", "b", "c", "d", "e", "f", "ghost"], courtCost: 100001, courtPayer: "a", shuttleTotal: 99999, shuttlePayer: "b" })],
  ["drink for one, bought by that one", S({ courtCost: 100000, courtPayer: "a", otherCosts: [{ desc: "drink", amount: 25000, paidBy: "b", forUid: "b" }] })]
];
cases.forEach(function (c) {
  var s = c[1], L = ctx.computeLedger(s), sum = 0, net = {};
  Object.keys(L.shares).forEach(function (u) { sum += L.shares[u].total; });
  assert.ok(Math.abs(sum - L.totals.grand) < 1e-6, c[0] + ": shares add up to the total");
  L.transfers.forEach(function (tr) {
    assert.notStrictEqual(tr.from, tr.to, c[0] + ": nobody pays themself");
    assert.ok(tr.amount > 0 && tr.amount % ctx.ROUND_TO === 0, c[0] + ": transfers are multiples of " + ctx.ROUND_TO);
    net[tr.from] = (net[tr.from] || 0) - tr.amount; net[tr.to] = (net[tr.to] || 0) + tr.amount;
  });
  assert.strictEqual(Object.keys(net).reduce(function (a, u) { return a + net[u]; }, 0), 0, c[0] + ": transfers net to zero");
  assert.strictEqual(ctx._grandOf(s), L.totals.grand, c[0] + ": list total == ledger total");
});
// a dinner nobody eats is not charged, so it is not in the total either
var empty = S({ courtCost: 100000, courtPayer: "a", dinner: { totalBill: 200000, paidBy: "a", diners: [] } });
assert.strictEqual(ctx._grandOf(empty), 100000, "dinner without diners is left out of the total");
// rounding is reported, not silent
var r13 = ctx.ledgerRounding(cases[9][1], ctx.computeLedger(cases[9][1]));
assert.ok(r13.length > 0 && r13.some(function (x) { return Math.abs(x.diff) >= 1; }), "rounding left over is reported for 7 players");
assert.strictEqual(ctx.ledgerRounding(cases[0][1], ctx.computeLedger(cases[0][1])).length, 0, "no rounding note when the split is even");
// money formatting edges
ctx.curSymbol = function () { return "₭"; };
assert.strictEqual(ctx.fmtLAK(-0.4), "0 ₭", "no -0");
assert.strictEqual(ctx.fmtShort(999950), "1M ₭", "never 1000K");
assert.strictEqual(ctx.fmtShort(999499), "999.5K ₭");
assert.strictEqual(ctx.fmtShort(1250000), "1.25M ₭");
assert.strictEqual(ctx.fmtShort(1e9), "1B ₭");
console.log("ledger OK");
