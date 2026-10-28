/* Run: node tests/ui-five-v257.test.js — v257: Payments is the last Home card, the stepper line stays between the circles,
   partners + rest balance sit behind the Fairness button (a sheet), the winner view for 2 and 3 places, the winner card art */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
function seeded(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function uids(n) { var a = []; for (var i = 0; i < n; i++) a.push("u" + i); return a; }
var css = fs.readFileSync("css/styles.css", "utf8"), home = fs.readFileSync("js/home.js", "utf8");

// ---- 1. Home: Payments is the last card, so its dot is the last dot ----
(function () {
  var seg = home.slice(home.indexOf("var cards = [];"), home.indexOf("cards = cards.filter"));
  var order = ["_homePlayCard", "_homeSpendCard", "_homeRatingCard", "homeHealthCardHtml", "_homePayCard"].map(function (k) { return seg.indexOf(k); });
  assert.ok(order.every(function (x) { return x >= 0; }), "all five cards are listed");
  assert.deepStrictEqual(order.slice().sort(function (a, b) { return a - b; }), order, "Play, Spending, Rating, Health, then Payments last");
  assert.ok(/hs-dots-nav[\s\S]*cards\.map/.test(home), "the dots are built from the same list");
})();

// ---- 2. Stepper: line only between circles; circles are opaque ----
(function () {
  var line = css.match(/\.tn-li \+ \.tn-li::before \{[^}]*\}/)[0];
  assert.ok(/left: calc\(-50% \+ var\(--tnc\) \/ 2 \+ \d+px\)/.test(line) && /right: calc\(50% \+ var\(--tnc\) \/ 2 \+ \d+px\)/.test(line), "the segment starts and ends at the circle edges (centre -/+ half the circle), not at the centres: " + line);
  var lock = css.match(/\.tn-s\.lock \.tn-c \{[^}]*\}/)[0];
  assert.ok(!/transparent/.test(lock) && /background: var\(--card\)/.test(lock), "locked circles have an opaque fill");
  assert.ok(!/\.tn-c \{[^}]*background: transparent/.test(css) && /\.tn-c \{[^}]*background: var\(--card\)/.test(css), "every circle has the card colour as its fill");
  assert.ok(/\.tn-c \{[^}]*width: var\(--tnc, 38px\)/.test(css) && /@media \(max-width: 380px\) \{ \.tn-steps \{ --tnc: 34px/.test(css), "one size variable drives circle and line (38px, 34px on narrow phones)");
  assert.ok(/\.tn-s \{ position: relative; z-index: 1;/.test(css), "circles sit above the line");
})();

// ---- tournament scaffold ----
var ic = { console: console, localStorage: { getItem: function () { return "en"; } }, document: {}, window: {} };
vm.createContext(ic); vm.runInContext(fs.readFileSync("js/i18n.js", "utf8"), ic);
var names = {}; uids(24).forEach(function (u) { names[u] = "Player " + u; });
var els = {}, keyHandlers = {}, body = { classList: { add: function () {}, remove: function () {} }, appendChild: function (e) { els[e.id] = e; } };
var ctx = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, Object: Object, Array: Array, Promise: Promise, String: String, Number: Number,
  t: function (k) { return ic.t(k); }, escapeHtml: function (v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }, icon: function (n) { return "<i:" + n + ">"; }, jsq: String,
  plainUserName: function (u) { return u ? u.displayName : "?"; }, findUser: function (u) { return { displayName: names[u] || u }; }, getUserName: function (u) { return names[u] || u; }, avatarHtml: function (u) { return "<av " + u + ">"; },
  canEditSessionDetails: function () { return true; }, canEditBill: function () { return true; }, fmtDate: String, askConfirm: function () {}, currentGroup: { name: "Godsmash Club" }, currentGroupId: "g1",
  document: { getElementById: function (id) { return els[id] || null; }, body: body, addEventListener: function (k, f) { keyHandlers[k] = f; }, removeEventListener: function (k) { delete keyHandlers[k]; }, activeElement: null, contains: function () { return true; },
    createElement: function () { return { id: "", className: "", _h: "", set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, remove: function () { delete els[this.id]; }, querySelector: function () { return { focus: function () {} }; } }; } },
  lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
["js/tournament.js", "js/sharecard.js", "js/hallfame.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });
function playAll(T) { var k = 0; while (!ctx.tourRotDone(T) && k++ < 400) { var g = ctx.tourNext(T); ctx.tourApply(T, g, 21, 15); } ctx.tourDraw(T, seeded(5)); k = 0; while (ctx.tourNext(T) && k++ < 40) { var g2 = ctx.tourNext(T); ctx.tourApply(T, g2, 21, 15); } return T; }

// ---- 3. Fairness: gone from the main screen, behind one button, opens a sheet with both ----
(function () {
  var T = ctx.tourNew(uids(8), seeded(3));
  assert.ok(ctx.tourTabParts(T, 0).indexOf("meet") < 0 && ctx.tourTabParts(T, 0).indexOf("rest") < 0 && ctx.tourTabParts(T, 0).indexOf("fair") >= 0, "rotation tab: the Fairness button instead of the two grids");
  ctx.lastSessions = [{ id: "S", players: uids(8), createdBy: "u0", date: "2026-10-26", tourney: T }];
  var h = ctx._tnPanel(T, 0, ctx.tourNext(T), 0, true, ctx.lastSessions[0]);
  assert.ok(/data-act="fair"[^>]*aria-haspopup="dialog"/.test(h) && /Fairness: partners &amp; rest/.test(h), "a compact button with the label");
  assert.ok(!/tn-meetscroll|tn-rt"|Who meets who|Rest balance/.test(h), "no partner grid and no rest chart on the main screen");
  var attrs = { "data-act": "fair" }; ctx._tnSid = "S";
  vm.runInContext('_tnSid="S"', ctx);
  ctx._tnClick({ target: { closest: function () { return { getAttribute: function (k) { return attrs[k]; } }; } } });
  var sh = els.tnFairSheet; assert.ok(sh, "the click opens the sheet");
  assert.ok(/role="dialog" aria-modal="true" aria-labelledby="tnFairT"/.test(sh.innerHTML), "an accessible dialog");
  assert.ok(/Who meets who/.test(sh.innerHTML) && /Rest balance/.test(sh.innerHTML) && /data-fact="close"/.test(sh.innerHTML), "both blocks and a close button are in the sheet");
  assert.strictEqual((sh.innerHTML.match(/tabindex="0" role="region"/g) || []).length, 2, "both wide grids scroll inside the sheet and can be reached by keyboard");
  assert.ok(keyHandlers.keydown, "Esc/Tab handler is on"); ctx._tnFairClose(); assert.ok(!els.tnFairSheet && !keyHandlers.keydown, "closing removes the sheet and the handler");
  // rest chart: the name column is fixed and clipped with an ellipsis, so bars never cover a name
  assert.ok(/\.tn-rr \{[^}]*grid-template-columns: 104px repeat\(var\(--g\)/.test(css), "fixed name column");
  assert.ok(/\.tn-rr \.tn-nm \{[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/.test(css), "long names are cut with an ellipsis");
  assert.ok(/\.tn-rr \.tn-who \{[^}]*max-width: 104px[^}]*overflow: hidden/.test(css), "the name never grows past the column");
})();

// ---- 4. Winner view: 3 places (8 players) and 2 places (4 players) ----
(function () {
  var T8 = playAll(ctx.tourNew(uids(8), seeded(3)));
  ctx.lastSessions = [{ id: "W8", players: uids(8), createdBy: "u0", date: "2026-10-26", tourney: T8 }];
  var h = ctx._tnWinner(T8, "W8");
  assert.strictEqual((h.match(/data-place="/g) || []).length, 3, "three places");
  assert.ok(h.indexOf("tn-pl p2") < h.indexOf("tn-pl p1") && h.indexOf("tn-pl p1") < h.indexOf("tn-pl p3"), "2nd left, 1st middle, 3rd right");
  assert.ok(/tn-crown3d/.test(h) && /tn-conf/.test(h) && /Godsmash Club/.test(h) && /2026-10-26/.test(h) && /tn-gp">21–15/.test(h) && /tn-wscore/.test(h), "crown, confetti, group, date, per-game score pills");
  assert.ok(!/class="tn-pod two"/.test(h));
  var T4 = playAll(ctx.tourNew(uids(4), seeded(4)));
  ctx.lastSessions = [{ id: "W4", players: uids(4), createdBy: "u0", date: "2026-10-26", tourney: T4 }];
  var h4 = ctx._tnWinner(T4, "W4");
  assert.strictEqual((h4.match(/data-place="/g) || []).length, 2, "two places with 4 players");
  assert.ok(/class="tn-pod two"/.test(h4) && !/data-place="3"/.test(h4) && !/undefined|NaN/.test(h4), "no 3rd place, no holes");
  assert.ok(/prefers-reduced-motion: reduce\) \{ \.tn-conf i \{ animation: none/.test(css), "confetti is still when motion is reduced");
  // winner card canvas: records the place numbers it draws
  function rec() {
    var texts = [], grad = { addColorStop: function () {} };
    var c = new Proxy({}, { get: function (o, k) { if (k === "measureText") return function (s) { return { width: String(s).length * 12 }; }; if (k === "createLinearGradient" || k === "createRadialGradient") return function () { return grad; };
      if (k === "fillText") return function (s) { texts.push(String(s)); }; return o[k] || function () {}; }, set: function (o, k, v) { o[k] = v; return true; } });
    return { texts: texts, cv: { getContext: function () { return c; }, width: 0, height: 0 } };
  }
  [[T8, "W8", 3], [T4, "W4", 2]].forEach(function (x) {
    ctx.lastSessions = [{ id: x[1], players: uids(x[0].n), createdBy: "u0", date: "2026-10-26", tourney: x[0] }];
    var d = ctx.shareTournamentNow(x[1]); assert.ok(d, "a record for " + x[1]);
    ["story", "square"].forEach(function (fmt) {
      var r = rec(); ctx.drawTournamentCard(r.cv, d, "default", fmt);
      assert.strictEqual(r.cv.height, fmt === "square" ? 1350 : 1920, "same sizes as before");
      var places = ["1", "2", "3"].filter(function (n) { return r.texts.indexOf(n) >= 0; });
      assert.strictEqual(places.length, x[2], x[1] + " " + fmt + ": steps drawn for " + x[2] + " places, got " + places);
      assert.ok(r.texts.some(function (s) { return /^21–15$/.test(s); }) && r.texts.indexOf("Godsmash Club") >= 0, "game pills and the group name are on the card");
    });
  });
})();
console.log("ui-five-v257 OK");
