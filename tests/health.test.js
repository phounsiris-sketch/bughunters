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

// the workout card lives on the Dashboard only, no longer inside a session
var statsSrc = fs.readFileSync("js/stats.js", "utf8"), dashSrc = fs.readFileSync("js/dashboard.js", "utf8");
assert.ok(statsSrc.indexOf("healthCardHtml") < 0 && statsSrc.indexOf("healthWorkoutCardHtml") < 0, "the session Games tab no longer shows the workout card");
assert.ok(dashSrc.indexOf("healthLatestCardHtml") > 0, "the Dashboard shows my latest workout");
assert.ok(fs.readFileSync("js/home.js", "utf8").indexOf("healthLatestCardHtml") < 0, "not on Home");

// the Home card: this month by weeks of the month
var mw = ctx.healthMonthWeeks([{ date: "2026-10-02", totalMin: 100 }, { date: "2026-10-09", totalMin: 60 }, { date: "2026-10-12", totalMin: 30 }, { date: "2026-10-30", totalMin: 45 }, { date: "2026-09-30", totalMin: 999 }], new Date(2026, 9, 23));
assert.strictEqual(mw.length, 5, "October has 31 days: five blocks"); assert.deepStrictEqual(JSON.stringify(mw.map(function (w) { return w.min; })), JSON.stringify([100, 90, 0, 0, 45]), "minutes per block, other months left out");
assert.ok(mw[3].now && !mw[0].now, "today (23rd) is in the fourth block"); assert.strictEqual(mw[4].from, 29); assert.strictEqual(mw[4].to, 31);
assert.strictEqual(ctx.healthMonthWeeks([], new Date(2026, 1, 10)).length, 4, "February 2026 has exactly four blocks");

// heart rate trend points for the overview chart
var rng = ctx.healthRangeBounds("month", 0, new Date(2026, 9, 23)), tp = ctx.healthTrendPoints(ws, rng);
assert.strictEqual(tp.length, 2); assert.ok(tp[0].x < tp[1].x && tp[0].date === "2026-10-12" && tp[1].date === "2026-10-22", "oldest first, placed by date inside the month");
assert.ok(tp.every(function (p) { return p.x >= 0 && p.x <= 1 && p.avg < p.peak; }), "inside the range, average below peak");
assert.strictEqual(ctx.healthTrendPoints([], rng).length, 0, "no workouts, no points (the chart still draws its zone bands)");

// rules and texts
assert.ok(/function healthOk\(d\)/.test(rules) && /allow write: if isOwner\(uid\) && healthOk\(request\.resource\.data\)/.test(rules), "userPrivate rules bound the health fields");
var uiSrc = fs.readFileSync("js/health-ui.js", "utf8");
var keys = (src + uiSrc).match(/t\("(health[A-Za-z0-9]+|hShort|minShort|gamesWord|shareMyCard|navHome|navDashboard)"\)/g) || [];
keys = keys.map(function (x) { return x.slice(3, -2); });
var keysOld = (src.match(/t\("(health[A-Za-z0-9]+|hShort|minShort|gamesWord)"\)/g) || []).map(function (x) { return x.slice(3, -2); });
keys.concat(["healthSexNone", "healthSexM", "healthSexF"]).forEach(function (k) { assert.strictEqual((i18n.match(new RegExp("^\\s+" + k + ":", "gm")) || []).length, 2, k + " in EN + LA"); });
console.log("health OK");

// total duration = exact game minutes + rest (real gaps, or an estimate when no clock times were saved); booked hours are ignored
var GM = function (id, minutes, startAt, endAt) { return { id: id, minutes: minutes, teamA: ["me", "x"], teamB: ["y", "z"], startAt: startAt, endAt: endAt, games: [{ a: 21, b: 15 }] }; };
var est = ctx.healthSegments("me", [GM("1", 20), GM("2", 20), GM("3", 20)], { duration: 3 });
assert.strictEqual(est.onCourt, 60, "exact game minutes"); assert.strictEqual(est.playMin, 60 + 2 * ctx.HEALTH_REST_GAP_MIN, "plus an estimated rest between the 3 games"); assert.ok(est.playMin < 180, "a 3 h booking is not the duration");
var T0 = 1760000000000, mn = 60000, real = ctx.healthSegments("me", [GM("1", 20, T0, T0 + 20 * mn), GM("2", 20, T0 + 35 * mn, T0 + 55 * mn), GM("3", 20, T0 + 70 * mn, T0 + 90 * mn)], { duration: 3 });
assert.strictEqual(real.playMin, 90, "real clock times: first start to last end = 60 min of play + 30 min of real rest"); assert.strictEqual(real.onCourt, 60);
console.log("health total duration OK");
