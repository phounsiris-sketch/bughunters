/* Run: node tests/matches-all-v248.test.js — v248: All matches redesign (avatars, score pills, segmented filters, singular "1 game", no W/L chip) */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var ids = ["me", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];
var ctx = { console: console, GROUPS_ON: true, currentGroupId: "g", currentUser: { uid: "me" }, localStorage: { getItem: function () { return null; }, setItem: function () {} },
  t: function (k) { return ({ oneGame: "1 game", gamesWord: "games" })[k] || k; }, getUserName: function (u) { return u === "me" ? "Me" : u.toUpperCase(); }, escapeHtml: function (x) { return String(x); }, icon: function (n) { return "<i>" + n + "</i>"; },
  jsq: function (v) { return String(v).replace(/[^A-Za-z0-9_\-]/g, ""); },
  _todayIso: function () { return "2026-10-28"; }, avatarHtml: function (u, s) { return "<i class=\"av\">" + u + s + "</i>"; }, personHtml: function (u) { return u; },
  findUser: function () { return {}; }, memberOf: function () { return null; }, normLevel: function (x) { return x || ""; }, levelBadgeHtml: function () { return ""; },
  byNameAZ: function (a) { return a.slice().sort(); }, fmtDate: function (d) { return d; }, plainUserName: function () { return "x"; }, setBreadcrumb: function () {}, refreshCurrentPage: function () {},
  weekdayShort: function (d) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]; }, monthShort: function (m) { return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]; },
  document: {}, setTimeout: setTimeout, lastSessions: [] };
ctx.window = ctx; vm.createContext(ctx);
["js/stats.js", "js/stats-core.js", "js/matches-all.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }); });

/* ---- top 3 + last 3 slicing ---- */

/* ---- fake games: 10 players, many pairs; I play a lot ---- */
var M = [], n = 0;
function G(a, b, wa, date, sid, extra) { var m = { id: "m" + (n++), date: date, sessionId: sid, teamA: a, teamB: b, games: wa ? [{ a: 21, b: 15 }] : [{ a: 15, b: 21 }], createdAt: n }; if (extra) for (var k in extra) m[k] = extra[k]; return m; }
for (var i = 0; i < 9; i++) for (var j = i + 1; j < 10 && j < i + 3; j++) M.push(G([ids[i], ids[j]], [ids[(i + 4) % 10], ids[(j + 4) % 10]], (i + j) % 3 !== 0, "2026-09-" + ("0" + (i + 1)).slice(-2)));
// my games across days and sessions
M.push(G(["me", "p1"], ["p2", "p3"], true, "2026-10-24", "s1"), G(["me", "p4"], ["p2", "p3"], false, "2026-10-24", "s1"), G(["me", "p1"], ["p5", "p6"], true, "2026-10-24", "s1", { tid: "s1", tstage: "rot" }),
  G(["p2", "p3"], ["me", "p1"], true, "2026-10-24"), G(["me", "p1"], ["p2", "p3"], true, "2026-10-21", "s2"), G(["me"], ["p7"], true, "2026-10-21", "s2", {}));
M[M.length - 1].games = [{ a: 21, b: 18 }, { a: 18, b: 21 }, { a: 21, b: 19 }];
M.push({ id: "undecided", date: "2026-10-22", teamA: ["me", "p1"], teamB: ["p2", "p3"], games: [] });
ctx.lastMatches = M.sort(function (a, b) { return a.date.localeCompare(b.date) || a.createdAt - b.createdAt; });
ctx.lastSessions = [{ id: "s1", courtName: "Sport Center", time: "19:00", duration: 2 }, { id: "s2", courtName: "Dongdok", time: "18:00", duration: 1.5 }];
ctx._statsCache = null;

var box = { innerHTML: "" };
ctx.document = { getElementById: function (id) { return id === "matchesAllContent" ? box : null; } };
ctx.maPeriod = "all"; ctx.renderMatchesAll();
var h = box.innerHTML;
var cnt = function (re, s) { return (s.match(re) || []).length; };

/* avatars: two lines per game, one avatar per player */
assert.ok(/ma-avs/.test(h) && /class="av"/.test(h), "avatars in the rows");
assert.ok(/ma-team me/.test(h) && /ma-team them/.test(h), "my team and the opponents on their own lines");
assert.strictEqual(cnt(/class="ma-team me"/g, h), cnt(/class="ma-team them"/g, h), "one line per side");
var single = ctx.maGames("me").filter(function (g) { return g.mine.length === 1; })[0];
var sh = ctx._maGameHtml(single, "me", true);
assert.strictEqual(cnt(/class="av"/g, sh), 2, "singles: one avatar per side");
assert.ok(/<b>Me<\/b>/.test(h), "viewed player first and bold");

/* score pills, colour bar, no W/L chip */
assert.ok(/ma-pt won/.test(h) && /ma-pt lost/.test(h), "winning points in a won pill, losing side muted");
assert.ok(/ma-game w/.test(h) && /ma-game l/.test(h) && /ma-bar/.test(h), "left bar per result");
assert.ok(!/class="wl /.test(h), "no W/L chip");
var multi = ctx.maGames("me").filter(function (g) { return (g.m.games || []).length === 3; })[0];
var mh = ctx._maScoreHtml(multi);
assert.strictEqual(cnt(/ma-pt/g, mh), 6, "3 sets x 2 sides");
assert.strictEqual(cnt(/ma-pt won/g, mh), 3, "one winner per set");
assert.ok(/--sets:3/.test(mh));
assert.ok(!/<small>/.test(h.split("ma-game")[1] || ""), "no rating change in the row");

/* games with no session: expandable detail, others open the session */
assert.ok(/maToggleGame\(this\)/.test(h) && /class="ma-det" hidden/.test(h), "detail for games without a session");
assert.ok(/showSessionDetail\('s1','games'\)/.test(h), "session games still open the Games tab");

/* segmented controls, equal slots */
assert.strictEqual(cnt(/class="ma-seg s4"/g, h), 1, "period: 4 slots");
assert.strictEqual(cnt(/class="ma-seg s3"/g, h), 1, "result: 3 slots");
assert.strictEqual(cnt(/class="ma-segb/g, h), 7);
assert.strictEqual(cnt(/aria-pressed="(true|false)"/g, h), 7, "every segment is a pressed-state button");
assert.strictEqual(cnt(/<label class="ma-sel"><small>/g, h), 3, "type / partner / opponent with captions");
assert.ok(/ma-pick-av/.test(h), "picker has the player's avatar");

/* singular */
assert.strictEqual(ctx.maGamesN(1), "1 game"); assert.strictEqual(ctx.maGamesN(5), "5 games"); assert.strictEqual(ctx.maGamesN(0), "0 games");
var one = ctx.maFilter(ctx.maGames("me"), { from: "2026-10-21", result: "all", type: "singles", partner: "", opp: "" });
assert.strictEqual(one.length, 1);
ctx.maPeriod = "all"; ctx.maType = "singles"; ctx.renderMatchesAll();
assert.ok(/1 game ·/.test(box.innerHTML) && !/1 games/.test(box.innerHTML), "1 game, not 1 games");
assert.ok(/maGameOne/.test(box.innerHTML), "summary label singular");

/* session header: tag and W-L stay in the one flex line (no wrap) */
var css = fs.readFileSync("css/styles.css", "utf8");
assert.ok(/\.ma-sh \{[^}]*flex-wrap: nowrap/.test(css) && /\.ma-r \{[^}]*flex: none/.test(css) && /\.ma-stt \{[^}]*text-overflow: ellipsis/.test(css));

/* strings */
var i18n = fs.readFileSync("js/i18n.js", "utf8");
["maP30Short", "maTypeCap", "maGameOne", "oneGame"].forEach(function (k) {
  assert.strictEqual(cnt(new RegExp("^\\s+" + k + ":", "gm"), i18n), 2, k + " in EN and LA");
});
console.log("matches-all-v248 ok");
