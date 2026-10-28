/* Run: node tests/push-cheap-v250.test.js — v250: the two-phase push sender (push/runner.js) sends EXACTLY
   the same pushes, in the same run, as the old always-full sender, and reads far less when idle.
   No network, no firebase-admin: an in-memory Firestore implements the few queries the runner uses.
   "Old sender" = runOnce(..., {legacy: true}): full load + collectMessages + trash purge on every run. */
const assert = require("assert");
const path = require("path");
const { runOnce, loadData, localDay } = require(path.join(__dirname, "..", "push", "runner.js"));
const { computeLedger } = require(path.join(__dirname, "..", "push", "events.js"));

/* ---------------- in-memory Firestore ---------------- */
class Ts { constructor(m) { this.m = m; } toMillis() { return this.m; } }
const clone = (v) => (v instanceof Ts ? new Ts(v.m) : Array.isArray(v) ? v.map(clone) : v && typeof v === "object" ? Object.keys(v).reduce((o, k) => ((o[k] = clone(v[k])), o), {}) : v);
const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
function deepMerge(dst, src) { // Firestore set(..., {merge: true}): nested maps merge, everything else replaces
  Object.keys(src).forEach((k) => {
    const v = src[k];
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Ts)) { dst[k] = dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k]) ? dst[k] : {}; deepMerge(dst[k], v); }
    else dst[k] = v;
  });
  return dst;
}
function matches(doc, c) {
  const x = getPath(doc, c.f);
  if (x === undefined || x === null) return false;
  const wantTs = c.v && typeof c.v === "object" && !Array.isArray(c.v) && "ts" in c.v;
  const val = wantTs ? c.v.ts : c.v;
  if (c.op === "in") return val.includes(x);
  // Firestore compares values of the same type only: a number never matches a Timestamp
  if (wantTs ? !(x instanceof Ts) : typeof x !== typeof val) return false;
  const a = x instanceof Ts ? x.m : x;
  return c.op === ">" ? a > val : c.op === ">=" ? a >= val : c.op === "<" ? a < val : a === val;
}
class FakeStore {
  constructor() { this.c = {}; this.state = undefined; }
  col(n) { return (this.c[n] = this.c[n] || new Map()); }
  put(n, id, data) { this.col(n).set(id, data); return data; }
  doc(n, id) { return this.col(n).get(id); }
  async getState() { return this.state ? clone(this.state) : undefined; }
  async setState(p) { this.state = deepMerge(this.state || {}, clone(p)); }
  async all(n) { return [...this.col(n)].map(([id, data]) => ({ id, data: clone(data) })); }
  async query(n, anyOf) { return [...this.col(n)].filter(([, d]) => anyOf.some((c) => matches(d, c))).map(([id, data]) => ({ id, data: clone(data) })); }
  async getByIds(n, ids) { return ids.map((id) => ({ id, data: this.col(n).has(id) ? clone(this.col(n).get(id)) : null })); }
  async purgeTrash(cut) { let k = 0; for (const [id, d] of [...this.col("trash")]) if (d.deletedAt < cut) { this.col("trash").delete(id); k++; } return k; }
}

/* ---------------- tiny helpers ---------------- */
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
const bangkok = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h - 7, mi || 0);
const iso = (t) => localDay(t);
const sig = (msgs) => msgs.map((m) => [m.uid, m.title, m.body, m.link, m.tag || ""].join(" | "));

/* ---------------- world ---------------- */
const USERS = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"];
function baseWorld(store, T0, r) {
  USERS.forEach((u, i) => store.put("users", u, { displayName: "User" + (i + 1), email: u + "@x.com", blocked: u === "u3" ? ["u4"] : [] }));
  store.put("users", "mx", { displayName: "Manual", manual: true, groupId: "g1" });
  USERS.forEach((u, i) => store.put("pushTokens", u, { lang: i % 3 === 2 ? "la" : "en", tokens: { ["tok-" + u]: 1 } }));
  store.put("groups", "g1", { name: "Godsmash", currency: "LAK", ownerId: "u1" });
  store.put("groups", "g2", { name: "Thai crew", currency: "THB", ownerId: "u5" });
  const mem = (gid, uid, role, status, extra) => store.put("members", gid + "_" + uid, Object.assign({ gid, uid, role, status, perms: {}, joinedAt: T0 - 90 * DAY }, extra));
  ["u1", "u2", "u3", "u4", "u5", "u6"].forEach((u, i) => mem("g1", u, i === 0 ? "owner" : i === 1 ? "admin" : "member", "active"));
  ["u5", "u6", "u7", "u8"].forEach((u, i) => mem("g2", u, i === 0 ? "owner" : "member", "active"));
  // old data: the sender must keep reading it in the full run and keep ignoring it for events
  for (let i = 0; i < 40; i++) {
    const d = iso(T0 - (10 + i * 4) * DAY), players = ["u1", "u2", "u3", "u4"].slice(0, 2 + (i % 3));
    const s = { groupId: i % 5 === 0 ? "g2" : "g1", date: d, time: "18:00", courtName: "C" + i, players, createdAt: new Ts(T0 - (11 + i * 4) * DAY), calculated: i % 7 !== 0, courtCost: 100000 + i * 5000, courtPayer: players[0], settled: {}, settledAt: {}, billAt: T0 - (10 + i * 4) * DAY };
    if (s.calculated) { const L = computeLedger(s); L.transfers.forEach((tr, k) => { if ((i + k) % 3 !== 0) { s.settled[tr.key] = true; s.settledAt[tr.key] = s.billAt + HOUR; } }); }
    store.put("sessions", "old" + i, s);
  }
  for (let i = 0; i < 12; i++) store.put("polls", "oldpoll" + i, { answers: true, status: i % 2 ? "confirmed" : "cancelled", groupId: "g1", createdBy: "u1", date: iso(T0 - (20 + i * 6) * DAY), time: "18:00", courtName: "C", responses: { u1: 0, u2: 0 }, createdAt: new Ts(T0 - (21 + i * 6) * DAY), confirmedAt: T0 - (20 + i * 6) * DAY, cancelledAt: T0 - (20 + i * 6) * DAY });
  // an open poll made 50 days ago (outside the 45-day window, but open polls are always loaded)
  store.put("polls", "ancient", { answers: true, status: "open", groupId: "g1", createdBy: "u2", date: iso(T0 + 2 * DAY), time: "19:00", courtName: "Old", responses: {}, createdAt: new Ts(T0 - 50 * DAY) });
  for (let i = 0; i < 8; i++) store.put("openGames", "oldgame" + i, { hostId: "u1", status: "cancelled", date: iso(T0 - 5 * DAY), time: "18:00", courtName: "C", slots: 4, players: ["u1"], log: {}, createdAt: T0 - (6 + i) * DAY, cancelledAt: T0 - (5 + i) * DAY });
  for (let i = 0; i < 5; i++) store.put("invites", "oldinv" + i, { from: "u1", to: "u2", status: "accepted", date: iso(T0 - 3 * DAY), time: "18:00", createdAt: T0 - (4 + i) * DAY, respondedAt: T0 - (3 + i) * DAY });
  for (let i = 0; i < 6; i++) store.put("trash", "tr" + i, { deletedAt: T0 - (24 + i * 2) * DAY, kind: "session" }); // aged 24..34 days: crosses 30 during the run
  store.state = { lastRun: T0, startSent: {}, voteSent: {} };
  // one unpaid old session so the watch list is not empty
  store.put("sessions", "debt0", { groupId: "g1", date: iso(T0 - 3 * DAY), time: "18:00", courtName: "D", players: ["u1", "u2", "u3"], calculated: true, courtCost: 150000, courtPayer: "u1", settled: {}, settledAt: {}, billAt: T0 - 3 * DAY, createdAt: new Ts(T0 - 4 * DAY) });
  void r;
}

/** Apply one concrete operation (same operation to both stores) */
function apply(st, op) {
  const t = op.t;
  switch (op.k) {
    case "newPoll": st.put("polls", op.id, Object.assign({ answers: true, status: "open", groupId: op.gid, createdBy: op.by, date: op.date, time: op.time, courtName: "Court " + op.id, minPlayers: op.min, responses: {}, createdAt: new Ts(t) }, op.closesAt ? { closesAt: op.closesAt } : {})); break;
    case "vote": {
      const p = st.doc("polls", op.pid); if (!p || (p.status !== "open" && p.status !== "draft")) break;
      if (op.a === -1) delete p.responses[op.uid]; else p.responses[op.uid] = op.a;
      (p.voteLog = p.voteLog || {})[op.uid] = { a: op.a, at: t, by: op.by };
      if (!p.reachedAt && Object.keys(p.responses).filter((u) => p.responses[u] === 0).length >= p.minPlayers) p.reachedAt = t;
      break;
    }
    case "confirm": {
      const p = st.doc("polls", op.pid); if (!p || p.status !== "open") break;
      const players = Object.keys(p.responses).filter((u) => p.responses[u] === 0);
      Object.assign(p, { status: "confirmed", confirmedPlayers: players, sessionId: op.sid, confirmedAt: t });
      st.put("sessions", op.sid, { groupId: p.groupId, date: p.date, time: p.time, courtName: p.courtName, players, pollId: op.pid, createdBy: p.createdBy, createdAt: new Ts(t), calculated: false, settled: {}, settledAt: {} });
      break;
    }
    case "cancelPoll": { const p = st.doc("polls", op.pid); if (p && p.status === "open") Object.assign(p, { status: "cancelled", cancelledAt: t, cancelledBy: op.by }); break; }
    case "calc": {
      const s = st.doc("sessions", op.sid); if (!s) break;
      const pl = s.players.length ? s.players : ["u1", "u2"];
      Object.assign(s, { players: pl, calculated: true, courtCost: op.cost, courtPayer: pl[0], shuttleTotal: op.shuttle, shuttlePayer: pl[pl.length - 1], billAt: t, settled: {}, settledAt: {}, status: "active" });
      break;
    }
    case "settle": { const s = st.doc("sessions", op.sid); if (!s) break; const L = computeLedger(s); const tr = L.transfers[op.i % Math.max(1, L.transfers.length)]; if (tr) { s.settled = s.settled || {}; s.settledAt = s.settledAt || {}; s.settled[tr.key] = true; s.settledAt[tr.key] = t; } break; }
    case "unsettle": { const s = st.doc("sessions", op.sid); if (!s) break; const ks = Object.keys(s.settled || {}); if (ks.length) { const k = ks[op.i % ks.length]; delete s.settled[k]; delete (s.settledAt || {})[k]; } break; }
    case "swap": { const s = st.doc("sessions", op.sid); if (!s || !s.players.length) break; const i = op.i % s.players.length; if (!s.players.includes(op.to)) s.players[i] = op.to; break; }
    case "newGame": st.put("openGames", op.id, { hostId: op.host, status: "open", date: op.date, time: op.time, courtName: "Pub " + op.id, slots: op.slots, players: [op.host], waitlist: [], log: {}, createdAt: t }); break;
    case "joinGame": {
      const g = st.doc("openGames", op.gid); if (!g || (g.status !== "open" && g.status !== "full") || g.players.includes(op.uid)) break;
      if (g.players.length < g.slots) { g.players.push(op.uid); g.log[op.uid] = { a: "join", at: t }; if (g.players.length >= g.slots && g.status !== "full") { g.status = "full"; g.fullAt = t; } }
      break;
    }
    case "cancelGame": { const g = st.doc("openGames", op.gid); if (g && g.status !== "cancelled") Object.assign(g, { status: "cancelled", cancelledAt: t }); break; }
    case "invite": st.put("invites", op.id, { from: op.from, to: op.to, status: "pending", message: op.msg, date: op.date, time: op.time, courtName: "Court", createdAt: t }); break;
    case "respond": { const i = st.doc("invites", op.id); if (i && i.status === "pending") Object.assign(i, { status: op.status, respondedAt: t }); break; }
    case "request": st.put("members", op.gid + "_" + op.uid, { gid: op.gid, uid: op.uid, role: "member", perms: {}, status: "pending", joinedAt: t, message: op.msg }); break;
    case "approve": { const m = st.doc("members", op.gid + "_" + op.uid); if (m && m.status === "pending") Object.assign(m, { status: "active", approvedAt: t }); break; }
    case "trash": st.put("trash", op.id, { deletedAt: t, kind: "poll" }); break;
    case "delSession": st.col("sessions").delete(op.sid); break;
    default: throw new Error("unknown op " + op.k);
  }
}

/** Draw concrete operations looking at the (old-sender) world */
function drawOps(r, st, t, ctr) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const ids = (n, f) => [...st.col(n)].filter(([, d]) => f(d)).map(([id]) => id);
  const ops = [];
  const kinds = ["newPoll", "vote", "vote", "vote", "vote", "vote", "confirm", "cancelPoll", "calc", "settle", "settle", "unsettle", "swap", "newGame", "joinGame", "joinGame", "cancelGame", "invite", "respond", "request", "approve", "trash", "delSession"];
  const k = pick(kinds), uid = pick(USERS), by = r() < 0.2 ? pick(USERS) : uid;
  const day = iso(t + Math.floor(r() * 3) * DAY), time = pick(["07:00", "17:30", "18:00", "19:30", "21:00", "00:30"]);
  const skew = r() < 0.15 ? -Math.floor(r() * 90e3) : 0; // client clocks run a little behind
  const o = { k, t: t + skew };
  const openPolls = ids("polls", (p) => p.status === "open"), allSess = ids("sessions", () => true), openG = ids("openGames", (g) => g.status !== "cancelled");
  if (k === "newPoll") Object.assign(o, { id: "p" + ++ctr.n, gid: r() < 0.7 ? "g1" : "g2", by: pick(["u1", "u2", "u5"]), date: day, time, min: pick([2, 3, 4]), closesAt: r() < 0.5 ? t + Math.floor((2 + r() * 28) * HOUR) : 0 });
  else if (k === "vote") { if (!openPolls.length) return ops; Object.assign(o, { pid: pick(openPolls), uid, by, a: pick([0, 0, 1, -1]) }); }
  else if (k === "confirm") { if (!openPolls.length) return ops; Object.assign(o, { pid: pick(openPolls), sid: "s" + ++ctr.n }); }
  else if (k === "cancelPoll") { if (!openPolls.length || r() < 0.5) return ops; Object.assign(o, { pid: pick(openPolls), by: pick(USERS) }); }
  else if (k === "calc") { const c = ids("sessions", (s) => s.date >= iso(t - 6 * DAY)); if (!c.length) return ops; Object.assign(o, { sid: pick(c), cost: pick([100000, 240000, 330000]), shuttle: pick([0, 90000, 120000]) }); }
  else if (k === "settle" || k === "unsettle") { if (!allSess.length) return ops; Object.assign(o, { sid: pick(allSess.slice(-14).concat(["debt0"])), i: Math.floor(r() * 5) }); }
  else if (k === "swap") { if (!allSess.length) return ops; Object.assign(o, { sid: pick(allSess.slice(-10)), i: Math.floor(r() * 4), to: pick(USERS) }); }
  else if (k === "newGame") Object.assign(o, { id: "gm" + ++ctr.n, host: pick(["u1", "u3", "u7"]), date: day, time, slots: pick([2, 3, 4]) });
  else if (k === "joinGame") { if (!openG.length) return ops; Object.assign(o, { gid: pick(openG), uid }); }
  else if (k === "cancelGame") { if (!openG.length || r() < 0.5) return ops; Object.assign(o, { gid: pick(openG) }); }
  else if (k === "invite") { const to = pick(USERS); if (to === uid) return ops; Object.assign(o, { id: "iv" + ++ctr.n, from: uid, to, msg: r() < 0.5 ? "play?" : "", date: day, time }); }
  else if (k === "respond") { const pend = ids("invites", (i) => i.status === "pending"); if (!pend.length) return ops; Object.assign(o, { id: pick(pend), status: pick(["accepted", "accepted", "ignored"]) }); }
  else if (k === "request") Object.assign(o, { gid: pick(["g1", "g2"]), uid: pick(["u7", "u8", "u1"]), msg: r() < 0.5 ? "hi" : "" });
  else if (k === "approve") { const pend = ids("members", (m) => m.status === "pending"); if (!pend.length) return ops; const m = st.doc("members", pick(pend)); Object.assign(o, { gid: m.gid, uid: m.uid }); }
  else if (k === "trash") Object.assign(o, { id: "t" + ++ctr.n, t: t - Math.floor(r() * 33) * DAY });
  else if (k === "delSession") { if (r() < 0.7 || !allSess.length) return ops; o.sid = pick(allSess.slice(-8)); }
  ops.push(o);
  return ops;
}

/* ---------------- the equivalence simulation ---------------- */
async function simulate(seed, opts) {
  const r = rng(seed);
  const T0 = bangkok(2026, 10, 24, 22, 0), END = T0 + (opts.days || 4) * DAY;
  const oldS = new FakeStore(), newS = new FakeStore();
  baseWorld(oldS, T0, r); baseWorld(newS, T0, r);
  const ctr = { n: 0 };
  let now = T0 + 5 * MIN, n = 0;
  const stats = { runs: 0, idle: 0, full: 0, events: 0, oldReads: 0, newReads: 0, idleNew: 0, idleOld: 0, titles: {}, withMsgs: 0 };
  const delivered = [];
  const deliver = async (msgs) => { delivered.push(...msgs); return { sent: msgs.length, failed: 0 }; };
  let lastNow = T0;
  while (now < END) {
    // operations since the last run, some "during" this run (after `now`, before the queries finish)
    const la = r() < 0.15 ? Math.floor(r() * 4000) + 1 : 0;
    const quiet = opts.quiet || 0.4; // chance that nothing happens between two runs
    const bursts = r() < quiet ? 0 : r() < 0.8 ? 1 : 2 + Math.floor(r() * 5);
    const opts2 = [];
    for (let i = 0; i < bursts; i++) {
      const t = lastNow + Math.floor(r() * (now + la - lastNow));
      drawOps(r, oldS, t, ctr).forEach((o) => opts2.push(o));
    }
    // a burst of quick taps on one poll (Yes/No/Yes) right before a run
    if (r() < (opts.quiet ? 0.01 : 0.12)) {
      const open = [...oldS.col("polls")].filter(([, p]) => p.status === "open").map(([id]) => id);
      if (open.length) { const pid = open[Math.floor(r() * open.length)], u = USERS[Math.floor(r() * 8)]; [0, 1, 0].forEach((a, j) => opts2.push({ k: "vote", pid, uid: u, by: u, a, t: now - (3 - j) * MIN + Math.floor(r() * 3 * MIN) })); }
    }
    opts2.sort((a, b) => a.t - b.t);
    opts2.forEach((o) => { apply(oldS, o); apply(newS, o); });

    const a = await runOnce(oldS, now, { appUrl: "https://x/", deliver, legacy: true });
    const b = await runOnce(newS, now, { appUrl: "https://x/", deliver });
    stats.runs++;
    assert.deepStrictEqual(sig(b.messages), sig(a.messages), `seed ${seed} run ${n} at ${new Date(now).toISOString()}: pushes differ\n old: ${sig(a.messages).join("\n      ")}\n new: ${sig(b.messages).join("\n      ")}\n new run: ${b.line}`);
    if (b.status === "idle") assert.strictEqual(a.messages.length, 0, "idle run skipped real events");
    a.messages.forEach((m) => { const key = m.title; stats.titles[key] = (stats.titles[key] || 0) + 1; });
    stats.events += a.messages.length; if (a.messages.length) stats.withMsgs++;
    stats[b.status === "idle" ? "idle" : "full"]++;
    stats.oldReads += a.reads; stats.newReads += b.reads;
    if (b.status === "idle") { stats.idleNew += b.reads; stats.idleOld += a.reads; }
    // same announcements recorded (open polls) and same reminder / start bookkeeping, as seen by the next run
    const openIds = [...newS.col("polls")].filter(([, p]) => p.status === "open").map(([id]) => id);
    openIds.forEach((id) => assert.deepStrictEqual((newS.state.voteSent || {})[id] || {}, (oldS.state.voteSent || {})[id] || {}, "voteSent of " + id));
    assert.strictEqual(newS.state.lastRun, oldS.state.lastRun);
    assert.strictEqual(newS.state.lastReminder || null, oldS.state.lastReminder || null, "lastReminder");
    Object.keys(oldS.state.startSent || {}).forEach((id) => { if (now - oldS.state.startSent[id] < DAY) assert.strictEqual(newS.state.startSent[id], oldS.state.startSent[id], "startSent " + id); });
    // trash: once a day is enough, and after the day's first run both agree
    if (newS.state.lastTrash === localDay(now) && b.line.indexOf("trash") >= 0) assert.deepStrictEqual([...newS.col("trash").keys()].sort(), [...oldS.col("trash").keys()].sort(), "trash after daily purge");
    [...newS.col("trash")].forEach(([id, d]) => { if (!oldS.col("trash").has(id)) assert.ok(d.deletedAt < now - 30 * DAY, "only expired trash may linger"); });
    assert.ok([...oldS.col("trash").keys()].every((id) => newS.col("trash").has(id)), "new sender never purges more");
    lastNow = now; n++;
    now += (r() < 0.06 ? 20 + Math.floor(r() * 70) : 4 + Math.floor(r() * 7)) * MIN + Math.floor(r() * 30e3);
  }
  void delivered;
  return stats;
}

/* ---------------- scripted scenarios (absolute expectations) ---------------- */
async function scenario(name, setup, steps) {
  const T0 = bangkok(2026, 10, 24, 12, 0);
  const st = new FakeStore(); baseWorld(st, T0, rng(1));
  const old = new FakeStore(); baseWorld(old, T0, rng(1));
  st.state.watch = ["debt0"]; st.state.watchKeys = ["u1__u2", "u1__u3"]; // as after one full run
  st.state.lastReminder = old.state.lastReminder = iso(T0); st.state.lastTrash = iso(T0);
  const got = [];
  const deliver = async (m) => { got.push(...m); return { sent: m.length, failed: 0 }; };
  const ctx = { T0, st, old, now: T0, run: null };
  ctx.op = (o) => { apply(st, o); apply(old, o); };
  ctx.run = async (t) => {
    ctx.now = t; got.length = 0;
    const b = await runOnce(st, t, { deliver, appUrl: "" }), a = await runOnce(old, t, { legacy: true, deliver: async () => ({ sent: 0, failed: 0 }) });
    assert.deepStrictEqual(sig(b.messages), sig(a.messages), name + ": same pushes as the old sender at " + new Date(t).toISOString());
    return b;
  };
  await setup(ctx);
  await steps(ctx);
}
const titles = (b) => b.messages.map((m) => m.title);

async function scenarios() {
  const T0 = bangkok(2026, 10, 24, 12, 0);
  // 1. vote settles across runs and is never lost or repeated
  await scenario("vote settle", (c) => { c.st.state.lastRun = T0; c.old.state.lastRun = T0; },
    async (c) => {
      c.op({ k: "newPoll", id: "pv", gid: "g1", by: "u1", date: iso(T0 + 2 * DAY), time: "18:00", min: 4, closesAt: 0, t: T0 + 1 * MIN });
      let b = await c.run(T0 + 2 * MIN); assert.strictEqual(b.status, "full"); assert.ok(b.messages.some((m) => /New poll/.test(m.title)), "new poll pushed once");
      b = await c.run(T0 + 7 * MIN); assert.strictEqual(b.status, "idle", "nothing new: idle"); assert.ok(b.reads <= 30, "idle reads " + b.reads + " " + b.line + " " + JSON.stringify(b.reasons));
      c.op({ k: "vote", pid: "pv", uid: "u2", by: "u2", a: 0, t: T0 + 8 * MIN });
      b = await c.run(T0 + 10 * MIN); assert.strictEqual(b.messages.length, 0, "vote not settled after 2 min"); assert.strictEqual(b.status, "idle");
      b = await c.run(T0 + 12 * MIN); assert.strictEqual(b.messages.length, 0, "settles after 5 min: 4 min is too early"); assert.strictEqual(b.status, "idle");
      b = await c.run(T0 + 14 * MIN); assert.strictEqual(b.status, "full", "settled vote found on the next run, no state needed"); assert.ok(b.messages.some((m) => m.tag === "votes-pv"), "vote push");
      b = await c.run(T0 + 20 * MIN); assert.strictEqual(b.messages.length, 0, "announced only once"); assert.strictEqual(b.status, "idle");
      // Yes then No inside the settle window: one push with the final answer
      c.op({ k: "vote", pid: "pv", uid: "u3", by: "u3", a: 0, t: T0 + 21 * MIN }); c.op({ k: "vote", pid: "pv", uid: "u3", by: "u3", a: 1, t: T0 + 22 * MIN });
      b = await c.run(T0 + 24 * MIN); assert.strictEqual(b.messages.length, 0);
      b = await c.run(T0 + 28 * MIN); const vm = b.messages.filter((m) => m.tag === "votes-pv"); assert.ok(vm.length > 0 && vm.every((m) => /Skip|ບໍ່ມາ/.test(m.body)), "final answer announced: " + vm.map((m) => m.body));
    });
  // 2. poll created during a run (written after `now`) is found by the next run, not lost
  await scenario("created during a run", () => {}, async (c) => {
    c.op({ k: "newPoll", id: "pr", gid: "g1", by: "u1", date: iso(T0 + DAY), time: "18:00", min: 4, closesAt: 0, t: T0 + 10 * MIN + 2000 });
    let b = await c.run(T0 + 10 * MIN); assert.strictEqual(b.messages.length, 0, sig(b.messages).join(" ## ") + b.line); assert.strictEqual(b.status, "idle");
    b = await c.run(T0 + 15 * MIN); assert.ok(b.messages.some((m) => /New poll/.test(m.title)), "found on the next run"); assert.strictEqual(b.status, "full");
  });
  // 3. start reminder window
  await scenario("start reminder", () => {}, async (c) => {
    c.op({ k: "newPoll", id: "ps", gid: "g1", by: "u1", date: iso(T0), time: "19:00", min: 2, closesAt: 0, t: T0 + 1 * MIN });
    c.op({ k: "vote", pid: "ps", uid: "u1", by: "u1", a: 0, t: T0 + 2 * MIN }); c.op({ k: "vote", pid: "ps", uid: "u2", by: "u2", a: 0, t: T0 + 3 * MIN });
    c.op({ k: "confirm", pid: "ps", sid: "ss", t: T0 + 20 * MIN });
    await c.run(T0 + 30 * MIN);
    const start = bangkok(2026, 10, 24, 19, 0);
    let b = await c.run(start - 75 * MIN); assert.ok(!b.messages.some((m) => /Session in 1 hour/.test(m.title)), "75 min before: too early");
    b = await c.run(start - 55 * MIN); assert.strictEqual(b.messages.filter((m) => /Session in 1 hour/.test(m.title)).length, 2, "both players reminded"); assert.strictEqual(b.status, "full");
    b = await c.run(start - 45 * MIN); assert.strictEqual(b.messages.length, 0, "once only"); assert.strictEqual(b.status, "idle");
  });
  // 4. daily reminder at 9:00 Bangkok, once a day; unpaid session read in the idle runs
  await scenario("daily reminder", () => {}, async (c) => {
    let b = await c.run(bangkok(2026, 10, 25, 8, 55)); assert.strictEqual(b.status, "idle");
    b = await c.run(bangkok(2026, 10, 25, 9, 2)); assert.ok(b.messages.some((m) => /Payment reminder/.test(m.title)), "reminder at 9:00"); assert.strictEqual(b.status, "full");
    b = await c.run(bangkok(2026, 10, 25, 9, 8)); assert.strictEqual(b.status, "idle", "not again the same day");
    b = await c.run(bangkok(2026, 10, 26, 9, 1)); assert.ok(b.messages.some((m) => /Payment reminder/.test(m.title)), "next day again");
  });
  // 5. bills and payments (also for a session that is not today's)
  await scenario("bill and payment", () => {}, async (c) => {
    c.op({ k: "calc", sid: "debt0", cost: 300000, shuttle: 60000, t: T0 + 5 * MIN });
    let b = await c.run(T0 + 8 * MIN); assert.ok(b.messages.some((m) => /Bill ready/.test(m.title)), "bill pushed");
    b = await c.run(T0 + 14 * MIN); assert.strictEqual(b.status, "idle");
    c.op({ k: "settle", sid: "debt0", i: 0, t: T0 + 16 * MIN });
    b = await c.run(T0 + 19 * MIN); assert.ok(b.messages.some((m) => /Payment received/.test(m.title)), "payment pushed from the watched (unpaid) session"); assert.strictEqual(b.status, "full");
    // a player swap (no bill timestamp) followed by a payment is still seen: the session is read by id
    c.op({ k: "swap", sid: "debt0", i: 1, to: "u6", t: T0 + 21 * MIN });
    c.op({ k: "settle", sid: "debt0", i: 1, t: T0 + 22 * MIN });
    b = await c.run(T0 + 25 * MIN);
  });
  // 6. open games, invites, join requests
  await scenario("games invites groups", () => {}, async (c) => {
    c.op({ k: "newGame", id: "gx", host: "u1", date: iso(T0 + DAY), time: "18:00", slots: 2, t: T0 + MIN });
    c.op({ k: "invite", id: "ivx", from: "u1", to: "u2", msg: "hi", date: iso(T0 + DAY), time: "18:00", t: T0 + MIN });
    c.op({ k: "request", gid: "g1", uid: "u7", msg: "hello", t: T0 + MIN });
    let b = await c.run(T0 + 5 * MIN); assert.ok(b.messages.some((m) => /invited you/.test(m.title)) && b.messages.some((m) => /Join request/.test(m.title)), "invite + request");
    c.op({ k: "joinGame", gid: "gx", uid: "u4", t: T0 + 6 * MIN }); c.op({ k: "respond", id: "ivx", status: "accepted", t: T0 + 6 * MIN }); c.op({ k: "approve", gid: "g1", uid: "u7", t: T0 + 6 * MIN });
    b = await c.run(T0 + 10 * MIN); const ts = titles(b).join(" / "); assert.ok(/joined your session/.test(ts) && /Session full/.test(ts) && /accepted/.test(ts) && /Welcome/.test(ts), ts);
    c.op({ k: "cancelGame", gid: "gx", t: T0 + 11 * MIN });
    b = await c.run(T0 + 15 * MIN); assert.ok(/Session cancelled/.test(titles(b).join()), "game cancelled");
    b = await c.run(T0 + 20 * MIN); assert.strictEqual(b.status, "idle");
  });
  // 7. idle run costs a handful of reads; first run after the update builds the watch list; init
  await scenario("idle cost", () => {}, async (c) => {
    const full = await c.run(T0 + 10 * MIN); // nothing due
    assert.strictEqual(full.status, "idle");
    assert.ok(full.reads <= 20, "idle reads " + full.reads);
    assert.ok(full.line.startsWith("phase1 reads ") && /nothing to do/.test(full.line), full.line);
    delete c.st.state.watchKeys;
    const boot = await c.run(T0 + 20 * MIN); assert.strictEqual(boot.status, "full"); assert.ok(Array.isArray(c.st.state.watch), "watch list built");
  });
  const fresh = new FakeStore(); const init = await runOnce(fresh, T0, {}); assert.strictEqual(init.status, "init"); assert.strictEqual(fresh.state.lastRun, T0);
  // phase 1 failing never loses events: falls back to the full run
  const bad = new FakeStore(); baseWorld(bad, T0, rng(2)); bad.state.watch = []; bad.state.watchKeys = []; bad.state.lastReminder = iso(T0); const q = bad.query.bind(bad);
  bad.query = async (n, a) => { if (a.length > 1) throw new Error("boom"); return q(n, a); };
  const fb = await runOnce(bad, T0 + 5 * MIN, {}); assert.strictEqual(fb.status, "full"); assert.ok(/phase 1 failed/.test(fb.reasons[0]));
}

/* loadData still reads exactly what the old sender read (independent filter written from the raw data) */
async function loadCheck() {
  const T0 = bangkok(2026, 10, 24, 12, 0), st = new FakeStore(); baseWorld(st, T0, rng(3));
  const d = await loadData(st, T0);
  const polls = [...st.col("polls")].filter(([, p]) => p.status === "open" || p.status === "draft" || p.createdAt.m >= T0 - 45 * DAY).map(([id]) => id).sort();
  assert.deepStrictEqual(d.polls.map((p) => p.id).sort(), polls);
  assert.deepStrictEqual(d.sessions.map((s) => s.id).sort(), [...st.col("sessions")].filter(([, s]) => s.date >= iso(T0 - 180 * DAY)).map(([id]) => id).sort());
  assert.deepStrictEqual(d.openGames.map((g) => g.id).sort(), [...st.col("openGames")].filter(([, g]) => g.createdAt >= T0 - 45 * DAY).map(([id]) => id).sort());
  assert.strictEqual(d.members.length, st.col("members").size);
}

(async () => {
  await loadCheck();
  await scenarios();
  const sum = async (seeds, o) => {
    const tot = { runs: 0, idle: 0, full: 0, events: 0, oldReads: 0, newReads: 0, idleNew: 0, idleOld: 0, titles: {} };
    for (let s = 1; s <= seeds; s++) {
      const st = await simulate(s * (o.quiet ? 7 : 1), o);
      Object.keys(tot).forEach((k) => { if (k === "titles") Object.keys(st.titles).forEach((t) => (tot.titles[t] = (tot.titles[t] || 0) + st.titles[t])); else tot[k] += st[k]; });
    }
    return tot;
  };
  const dense = await sum(30, { days: 4 });            // stress: something happens in most intervals
  const quiet = await sum(10, { days: 4, quiet: 0.93 }); // like real life: a few events a day
  const tot = dense;
  // every kind of push appeared somewhere in the simulation (so equality above is not vacuous)
  const want = [/New poll/, /New answers/, /Voting closes/, /Voting closed/, /Enough players/, /Plan confirmed/, /Plan cancelled/, /Bill ready/, /Payment received/, /Payment reminder/, /Session in 1 hour/, /joined your session/, /Session full/, /Session cancelled/, /Join request/, /Welcome/, /invited you/, /accepted your invite/];
  const seen = Object.keys(tot.titles);
  want.forEach((re) => assert.ok(seen.some((t) => re.test(t)), "never exercised: " + re + " in " + seen.join(" ; ")));
  assert.ok(quiet.idle > quiet.full * 3, "quiet days: most runs are idle");
  assert.ok(quiet.idleNew * 4 < quiet.idleOld, `idle runs read far less (${quiet.idleNew} vs ${quiet.idleOld})`);
  assert.ok(quiet.newReads * 4 < quiet.oldReads, `quiet-day reads drop (${quiet.newReads} vs ${quiet.oldReads})`);
  assert.ok(dense.newReads < dense.oldReads, "even a very busy timeline reads less");
  console.log(`push-cheap-v250 OK: ${dense.runs + quiet.runs} simulated runs x2 senders (40 timelines), ${dense.events + quiet.events} pushes identical in the same runs, all 18 push kinds covered`
    + `\n  busy timelines: ${dense.idle} idle / ${dense.full} full runs, reads ${dense.oldReads} -> ${dense.newReads}`
    + `\n  quiet timelines: ${quiet.idle} idle / ${quiet.full} full runs, reads ${quiet.oldReads} -> ${quiet.newReads}; idle run avg ${(quiet.idleNew / quiet.idle).toFixed(1)} reads (old sender ${(quiet.idleOld / quiet.idle).toFixed(1)})`);
})().catch((e) => { console.error(e); process.exit(1); });
