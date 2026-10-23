/* Run: node tests/health.test.js — personal zones, live-score minutes, estimate maths, rules bounds and EN + LA texts */
var fs = require("fs"), vm = require("vm"), assert = require("assert");
var src = fs.readFileSync("js/health.js", "utf8"), i18n = fs.readFileSync("js/i18n.js", "utf8"), ls = fs.readFileSync("js/livescore.js", "utf8"), rules = fs.readFileSync("firestore.rules", "utf8");
var ctx = { t: function (k) { return k; } }; vm.createContext(ctx); vm.runInContext(src, ctx);

// zones are personal: same formula, different bodies, different bpm
var a = ctx.healthZones({ restHr: 62 }, 35), b = ctx.healthZones({ restHr: 74 }, 52);
assert.deepStrictEqual(JSON.stringify(a[2]), JSON.stringify({ id: "Z3", lo: 147, hi: 160 }), "Ton Z3");
assert.deepStrictEqual(JSON.stringify(b[2]), JSON.stringify({ id: "Z3", lo: 143, hi: 152 }), "Noi Z3");
assert.notStrictEqual(a[4].hi, b[4].hi, "Z5 differs by person");
assert.strictEqual(ctx.healthMaxHr({}, 35), 184); assert.strictEqual(ctx.healthMaxHr({ maxHr: 190 }, 35), 190, "entered max wins"); assert.strictEqual(ctx.healthMaxHr({}, null), null);
assert.strictEqual(ctx.healthZones({}, null), null, "no max, no zones");
assert.strictEqual(ctx.healthZones({}, 35)[0].lo, Math.round(.5 * 184), "without resting rate: share of max");

// matches: only games I played, only with minutes
var T0 = Date.UTC(2026, 9, 23, 11, 0, 0);
var mk = function (i, minutes, sa, sb, side) { return { sessionId: "s1", minutes: minutes, startAt: T0 + i * 20 * 60000, endAt: T0 + (i * 20 + minutes) * 60000, createdAt: T0 + i, teamA: side === "A" ? ["me", "x"] : ["y", "z"], teamB: side === "A" ? ["y", "z"] : ["me", "x"], games: [{ a: sa, b: sb }] }; };
var ms = [mk(0, 14, 21, 15, "A"), mk(1, 19, 21, 19, "B"), { sessionId: "s1", minutes: null, teamA: ["me"], teamB: ["q"], games: [{ a: 21, b: 5 }] }, { sessionId: "s1", minutes: 12, teamA: ["a"], teamB: ["b"], games: [{ a: 21, b: 9 }] }];
var d = ctx.healthForSession({ weightKg: 70, restHr: 62 }, 35, "me", ms, { duration: 3 });
assert.strictEqual(d.segs.length, 2, "untimed and others' matches left out"); assert.strictEqual(d.onCourt, 33);
assert.strictEqual(d.segs[1].margin, 2); assert.ok(d.segs[1].close && !d.segs[0].close);
assert.strictEqual(d.segs[1].mine, 19, "my side's points"); assert.ok(!d.segs[1].won, "lost 19-21");
assert.ok(d.kcal.total > d.kcal.active && d.kcal.active > 0);
var ref = ctx.healthKcal(70, 145, 180); assert.strictEqual(ref.total, 1035, "145 min play, 10 warm-up, 25 rest at 70 kg"); assert.strictEqual(ref.active, 825);
// no weight: no calories but still zones/curve
assert.strictEqual(ctx.healthForSession({}, 35, "me", ms, { duration: 3 }).kcal, null);
assert.strictEqual(ctx.healthForSession({}, null, "me", ms, { duration: 3 }).pts, undefined, "no max, no curve");
// closer game peaks higher than a blowout, and every player's curve stays inside own range
var close = ctx.healthSeries(62, 184, [{ s: 10, e: 25, len: 15, margin: 1, close: true }], 40), easy = ctx.healthSeries(62, 184, [{ s: 10, e: 25, len: 15, margin: 11, close: false }], 40);
var avg = function (p) { var q = p.filter(function (x) { return x[0] >= 10 && x[0] < 25; }); return q.reduce(function (s, x) { return s + x[1]; }, 0) / q.length; };
assert.ok(avg(close) > avg(easy) + 5, "close games raise heart rate");
var other = ctx.healthSeries(74, 172, [{ s: 10, e: 25, len: 15, margin: 1, close: true }], 40);
assert.ok(Math.max.apply(null, other.map(function (x) { return x[1]; })) <= 172 && Math.max.apply(null, close.map(function (x) { return x[1]; })) <= 184);
assert.ok(avg(other) < avg(close), "a lower max gives lower bpm");

// live score: minutes count from the first point, not from the previous save
var w = vm.runInContext("(function(){" + ls.match(/function lsGameWindow\([\s\S]*?\n}\n/)[0] + "; return lsGameWindow;})()", vm.createContext({}));
var now = 1e12; var r = w({ firstAt: now - 14 * 60000, startedAt: now - 19 * 60000 }, now);
assert.strictEqual(r.minutes, 14, "rest before the first point is not counted"); assert.strictEqual(r.startAt, now - 14 * 60000);
assert.strictEqual(w({ startedAt: now - 5 * 60000 }, now).minutes, 5, "old saved games without firstAt fall back");
assert.strictEqual(w({ firstAt: now - 400 * 60000 }, now).minutes, 180, "capped"); assert.strictEqual(w({ firstAt: now }, now).minutes, 1, "at least a minute");

// workouts, ranges
var sessions = [{ id: "s1", date: "2026-10-22", time: "18:00", duration: 3 }, { id: "s2", date: "2026-10-12", time: "19:00", duration: 2 }];
var m2 = [mk(0, 14, 21, 15, "A"), mk(1, 19, 21, 19, "B")];
var all = ms.concat(m2.map(function (m) { var c = JSON.parse(JSON.stringify(m)); c.sessionId = "s2"; return c; }));
var ws = ctx.healthWorkouts({ weightKg: 70, restHr: 62 }, 35, "me", all, sessions);
assert.strictEqual(ws.length, 2); assert.strictEqual(ws[0].sid, "s1", "newest first"); assert.strictEqual(ws[0].time, "18:00"); assert.ok(ws[0].kcal > 0 && ws[0].avg > 62 && ws[0].avg < 184, "average bpm stays between resting and max: " + ws[0].avg);
ws.forEach(function (w) { w.d.pts.forEach(function (p) { assert.ok(p[1] >= 62 && p[1] <= 184, "curve inside resting..max: " + p[1]); }); });
var wk = ctx.healthRangeBounds("week", 0, new Date(2026, 9, 23));   // Friday 23 Oct 2026
assert.strictEqual(wk.from, "2026-10-19"); assert.strictEqual(wk.to, "2026-10-25"); assert.strictEqual(wk.buckets.length, 7);
var sw = ctx.healthRangeSummary(ws, wk); assert.strictEqual(sw.sessions, 1); assert.strictEqual(sw.totalMin, ws[0].totalMin); assert.strictEqual(sw.buckets[3].min, ws[0].totalMin, "Thursday 22 Oct bucket");
var mo = ctx.healthRangeSummary(ws, ctx.healthRangeBounds("month", 0, new Date(2026, 9, 23))); assert.strictEqual(mo.sessions, 2); assert.strictEqual(mo.buckets.length, 31);
assert.strictEqual(ctx.healthRangeSummary(ws, ctx.healthRangeBounds("week", -1, new Date(2026, 9, 23))).sessions, 1, "previous week holds 12 Oct");
var yr = ctx.healthRangeSummary(ws, ctx.healthRangeBounds("year", 0, new Date(2026, 9, 23))); assert.strictEqual(yr.buckets.length, 12); assert.strictEqual(yr.buckets[9].min, mo.totalMin, "October bucket");
assert.strictEqual(ctx.healthRangeSummary(ws, ctx.healthRangeBounds("week", 3, new Date(2026, 9, 23))).sessions, 0);

// rules and texts
assert.ok(/function healthOk\(d\)/.test(rules) && /allow write: if isOwner\(uid\) && healthOk\(request\.resource\.data\)/.test(rules), "userPrivate rules bound the health fields");
var uiSrc = fs.readFileSync("js/health-ui.js", "utf8");
var keys = (src + uiSrc).match(/t\("(health[A-Za-z0-9]+|hShort|minShort|gamesWord|shareMyCard|navHome|navDashboard)"\)/g) || [];
keys = keys.map(function (x) { return x.slice(3, -2); });
var keysOld = (src.match(/t\("(health[A-Za-z0-9]+|hShort|minShort|gamesWord)"\)/g) || []).map(function (x) { return x.slice(3, -2); });
keys.concat(["healthSexNone", "healthSexM", "healthSexF"]).forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
console.log("health OK");
