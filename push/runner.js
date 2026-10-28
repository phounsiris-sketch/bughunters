/* One run of the push sender, without Firebase (v250).
   send.js gives it a `store` (Firestore through firebase-admin) and a
   `deliver` function (FCM); tests give it an in-memory store.

   Two phases:
     1. cheap: a handful of small queries decide whether anything relevant
        changed since state.lastRun or is due now. Idle run = ~10-20 reads.
     2. full: the same load + collectMessages as before v250 (loadData below).
   Messages are produced ONLY by collectMessages (events.js), so text,
   recipients and timing cannot differ; phase 1 only decides "run it or not".
   Every phase-1 check is a superset of what collectMessages can react to.

   store interface (all async):
     getState() -> object | undefined        setState(patch)  // merge, like set(..., {merge:true})
     all(coll) -> [{id, data}]
     query(coll, anyOf) -> [{id, data}]      // anyOf = [{f, op, v}], a doc matches when ANY clause matches
     getByIds(coll, ids) -> [{id, data|null}]
     purgeTrash(cutoffMs) -> number of removed docs
   A clause value {ts: ms} means a Firestore Timestamp. */
const { collectMessages, watchInfo, ms, sessionStart, pollCloseMs, VOTE_SETTLE } = require("./events");

const TZ_OFFSET_H = 7;  // Vientiane / Bangkok (UTC+7)
const REMIND_HOUR = 9;  // daily payment reminder from 9:00
const TRASH_DAYS = 30;  // Recently deleted keeps items this long
const POLL_DAYS = 45;     // polls created in the last 45 days (+ every open poll)
const SESSION_DAYS = 180; // sessions played in the last 180 days (bills, payments, reminders)
const WATCH_RECENT_DAYS = 14; // unpaid sessions this young are re-read by id on every idle run
const KEYS_PER_QUERY = 27;    // Firestore allows 30 OR branches per query; 3 are used by billAt + date in [today, tomorrow]
const HOUR = 3600e3;

const cost = (docs) => Math.max(1, docs.length); // Firestore bills an empty query as 1 read
const withId = (d) => Object.assign({ id: d.id }, d.data);
const localDay = (t) => new Date(t + TZ_OFFSET_H * HOUR).toISOString().slice(0, 10);

/** Phase 2 load: live data only (unchanged since before v250) */
async function loadData(store, now) {
  const fromDay = localDay(now - SESSION_DAYS * 86400e3);
  const cut = now - POLL_DAYS * 86400e3;
  const [users, open, recent, sessions, tokens, members, groups, games, invites] = await Promise.all([
    store.all("users"),
    store.query("polls", [{ f: "status", op: "in", v: ["draft", "open"] }]),
    store.query("polls", [{ f: "createdAt", op: ">=", v: { ts: cut } }]),
    store.query("sessions", [{ f: "date", op: ">=", v: fromDay }]),
    store.all("pushTokens"),
    store.all("members"),
    store.all("groups"),
    store.query("openGames", [{ f: "createdAt", op: ">=", v: cut }]),
    store.query("invites", [{ f: "createdAt", op: ">=", v: cut }])
  ]);
  const reads = [users, open, recent, sessions, tokens, members, groups, games, invites].reduce((a, l) => a + l.length, 0);
  const byId = {};
  [open, recent].forEach((l) => l.forEach((d) => (byId[d.id] = withId(d))));
  const userMap = {}; users.forEach((d) => (userMap[d.id] = d.data));
  const groupMap = {}; groups.forEach((d) => (groupMap[d.id] = d.data));
  const tk = {}, langs = {};
  tokens.forEach((d) => { tk[d.id] = Object.keys(d.data.tokens || {}); langs[d.id] = d.data.lang; });
  return {
    users: userMap, polls: Object.values(byId), sessions: sessions.map(withId), tokens: tk, langs, reads,
    members: members.length ? members.map((d) => d.data) : null, // null before the move to groups
    groups: groupMap, openGames: games.map(withId), invites: invites.map(withId)
  };
}

/** "Game in 1 hour" reminders already sent (forget after 2 days) */
function pruneStartSent(state, now) {
  const out = {};
  Object.entries(state.startSent || {}).forEach(([id, at]) => { if (now - at < 2 * 86400e3) out[id] = at; });
  return out;
}

/* ---------------- phase 1: is anything due? ---------------- */

/** Reason (string) why this poll may produce a push, or null. Mirrors collectMessages. */
function pollReason(p, since, now, voteSent) {
  const isNew = (t) => t > since && t <= now;
  const open = p.status === "draft" || p.status === "open";
  if (open && isNew(ms(p.createdAt))) return "new poll";
  if (p.status === "confirmed" && isNew(ms(p.confirmedAt))) return "poll confirmed";
  if (p.status === "cancelled" && isNew(ms(p.cancelledAt))) return "poll cancelled";
  if (!open) return null;
  if (isNew(ms(p.reachedAt))) return "poll full";
  const announced = (voteSent || {})[p.id] || {};
  if (p.voteLog) {
    const due = Object.keys(p.voteLog).some((u) => {
      const v = p.voteLog[u];
      if (!v || !v.at || v.at > now - VOTE_SETTLE) return false; // not settled yet: looked at again next run
      return announced.hasOwnProperty(u) ? announced[u] !== v.a : v.a !== -1;
    });
    if (due) return "votes settled";
  }
  const closesAt = pollCloseMs(p);
  if (closesAt) {
    if (isNew(closesAt - 3 * HOUR) && now < closesAt) return "voting closes soon";
    if (isNew(closesAt)) return "voting closed";
  }
  return null;
}

function sessionReason(s, since, now, startSent) {
  const isNew = (t) => t > since && t <= now;
  if (s.calculated && isNew(ms(s.billAt))) return "bill ready";
  if (Object.values(s.settledAt || {}).some((t) => isNew(ms(t)))) return "payment marked paid";
  const start = sessionStart(s);
  if (start && !startSent[s.id] && start - now > 0 && start - now <= HOUR) return "game starts within 1 hour";
  return null;
}

function gameReason(g, since, now, startSent) {
  const isNew = (t) => t > since && t <= now;
  if (Object.keys(g.log || {}).some((u) => g.log[u] && g.log[u].a === "join" && isNew(g.log[u].at))) return "open game joined";
  if (g.status === "full" && isNew(g.fullAt)) return "open game full";
  if (g.status === "cancelled" && isNew(g.cancelledAt)) return "open game cancelled";
  const start = sessionStart(g);
  if (g.status !== "cancelled" && start && !startSent["g_" + g.id] && start - now > 0 && start - now <= HOUR) return "open game starts within 1 hour";
  return null;
}

/** Small queries only. Returns { reasons: [...], reads } (reasons empty = nothing to do). */
async function phase1(store, state, now) {
  const since = state.lastRun;
  const isNew = (t) => t > since && t <= now;
  const startSent = pruneStartSent(state, now);
  const d0 = localDay(now), d1 = localDay(now + HOUR); // sessions starting within the next hour are dated today, or tomorrow just before midnight
  const days = d0 === d1 ? [d0] : [d0, d1];
  let reads = 0;
  const reasons = [];
  const keys = state.watchKeys || [];
  const [polls, sessions, games, invites, members] = await Promise.all([
    store.query("polls", [
      { f: "status", op: "in", v: ["draft", "open"] },   // open polls: votes, deadline, enough players
      { f: "createdAt", op: ">", v: { ts: since } },     // new poll
      { f: "confirmedAt", op: ">", v: since },
      { f: "cancelledAt", op: ">", v: since }
    ]),
    store.query("sessions", [
      { f: "billAt", op: ">", v: since },                // bill ready
      { f: "date", op: "in", v: days },                  // game in 1 hour
      ...keys.slice(0, KEYS_PER_QUERY).map((k) => ({ f: "settledAt." + k, op: ">", v: since })) // payment marked paid
    ]),
    store.query("openGames", [
      { f: "status", op: "in", v: ["open", "full"] },    // joins, full, game in 1 hour
      { f: "cancelledAt", op: ">", v: since }
    ]),
    store.query("invites", [{ f: "createdAt", op: ">", v: since }, { f: "respondedAt", op: ">", v: since }]),
    store.query("members", [{ f: "joinedAt", op: ">", v: since }, { f: "approvedAt", op: ">", v: since }])
  ]);
  [polls, sessions, games, invites, members].forEach((l) => (reads += cost(l)));
  // payment keys beyond the first query: 30 per extra query
  for (let i = KEYS_PER_QUERY; i < keys.length; i += 30) {
    const more = await store.query("sessions", keys.slice(i, i + 30).map((k) => ({ f: "settledAt." + k, op: ">", v: since })));
    reads += cost(more);
    more.forEach((d) => { if (!sessions.some((x) => x.id === d.id)) sessions.push(d); });
  }

  // voteSent only matters for open polls (same pruning as the full run)
  const openIds = new Set(polls.filter((d) => d.data.status === "draft" || d.data.status === "open").map((d) => d.id));
  const voteSent = {};
  Object.entries(state.voteSent || {}).forEach(([id, m]) => { if (openIds.has(id)) voteSent[id] = m; });

  polls.forEach((d) => { const r = pollReason(withId(d), since, now, voteSent); if (r) reasons.push(r); });
  games.forEach((d) => { const r = gameReason(withId(d), since, now, startSent); if (r) reasons.push(r); });
  invites.forEach((d) => {
    const i = d.data;
    if ((i.status === "pending" && isNew(i.createdAt)) || (i.status === "accepted" && isNew(i.respondedAt))) reasons.push("invite");
  });
  members.forEach((d) => {
    const m = d.data;
    if ((m.status === "pending" && isNew(m.joinedAt)) || (m.status === "active" && isNew(m.approvedAt))) reasons.push("group join request / approval");
  });
  const seen = new Set();
  sessions.forEach((d) => { seen.add(d.id); const r = sessionReason(withId(d), since, now, startSent); if (r) reasons.push(r); });

  // Recent sessions with an unpaid transfer, read by id (edits there can create payment keys we do not know yet)
  const watch = (state.watch || []).filter((id) => !seen.has(id));
  if (watch.length) {
    const docs = await store.getByIds("sessions", watch);
    reads += watch.length;
    docs.forEach((d) => {
      if (!d.data) { reasons.push("watched session removed"); return; }
      const r = sessionReason(withId(d), since, now, startSent);
      if (r) reasons.push(r);
    });
  }
  return { reasons, reads };
}

/* ---------------- one run ---------------- */

/**
 * @param opts { appUrl, deliver(messages, tokens) -> {sent, failed}, legacy: true = the pre-v250 behaviour
 *               (full run every time, trash purge every time; used by the equivalence test) }
 * @returns { status: "init"|"idle"|"full", messages, reads, phase1Reads, reasons, line }
 */
async function runOnce(store, now, opts) {
  opts = opts || {};
  const state = (await store.getState()) || {};
  let reads = 1; // the state document
  if (!state.lastRun) {
    await store.setState({ lastRun: now });
    return { status: "init", messages: [], reads, phase1Reads: reads, reasons: [], line: "Initialised; pushes start from now." };
  }

  const local = new Date(now + TZ_OFFSET_H * HOUR);
  const today = local.toISOString().slice(0, 10);
  const remind = local.getUTCHours() >= REMIND_HOUR && state.lastReminder !== today;

  // Phase 1
  let reasons = [];
  if (opts.legacy) reasons = ["legacy"];
  else if (remind) reasons = ["daily payment reminder"];
  else if (!Array.isArray(state.watch) || !Array.isArray(state.watchKeys)) reasons = ["first run of v250 (building the list of unpaid sessions)"];
  else {
    try {
      const p = await phase1(store, state, now);
      reads += p.reads; reasons = p.reasons;
    } catch (e) {
      reasons = ["phase 1 failed, running full (" + (e && e.message ? e.message : e) + ")"];
    }
  }
  const phase1Reads = reads;
  const trashDue = opts.legacy || state.lastTrash !== today;

  async function purge() {
    if (!trashDue) return 0;
    const n = await store.purgeTrash(now - TRASH_DAYS * 86400e3);
    reads += cost({ length: n });
    return n;
  }

  if (!reasons.length) {
    const removed = await purge();
    const patch = { lastRun: now };
    if (trashDue) patch.lastTrash = today;
    await store.setState(patch);
    return { status: "idle", messages: [], reads, phase1Reads, reasons, line: `phase1 reads ${phase1Reads} · nothing to do` + (removed ? ` · trash: removed ${removed} item(s) older than ${TRASH_DAYS} days` : "") };
  }

  // Phase 2: the full load and collectMessages, as before v250
  const data = await loadData(store, now);
  reads += data.reads;
  const startSent = pruneStartSent(state, now);
  const openPolls = new Set(data.polls.filter((p) => p.status === "draft" || p.status === "open").map((p) => p.id));
  const voteSent = {};
  Object.entries(state.voteSent || {}).forEach(([id, m]) => { if (openPolls.has(id)) voteSent[id] = m; });

  const all = collectMessages({ users: data.users, polls: data.polls, sessions: data.sessions, langs: data.langs, members: data.members, groups: data.groups, openGames: data.openGames, invites: data.invites },
    state.lastRun, now, { remind, appUrl: opts.appUrl || "", startSent, voteSent });
  all.forEach((m) => {
    if (m.startOf) startSent[m.startOf] = now;
    if (m.voteAnnounce) { const v = m.voteAnnounce; (voteSent[v.pollId] = voteSent[v.pollId] || {})[v.voter] = v.a; }
  });
  const messages = all.filter((m) => !m.voteAnnounce);
  const res = opts.deliver ? await opts.deliver(messages, data.tokens) : { sent: 0, failed: 0 };

  const removed = await purge();
  const w = watchInfo({ sessions: data.sessions, groups: data.groups }, localDay(now - WATCH_RECENT_DAYS * 86400e3));
  await store.setState({
    lastRun: now, lastReminder: remind ? today : (state.lastReminder || null), startSent, voteSent,
    watch: w.ids, watchKeys: w.keys,
    lastTrash: trashDue ? today : (state.lastTrash || null)
  });
  const line = `phase1 reads ${phase1Reads} · full run (${reasons.slice(0, 4).join(", ")}${reasons.length > 4 ? ", ..." : ""}): read ${data.reads} docs (${data.polls.length} polls, ${data.sessions.length} sessions) · events: ${messages.length}, pushes sent: ${res.sent}, failed: ${res.failed}${remind ? ", daily payment reminder sent" : ""}`
    + (removed ? ` · trash: removed ${removed} item(s) older than ${TRASH_DAYS} days` : "");
  return { status: "full", messages, reads, phase1Reads, reasons, line };
}

module.exports = { runOnce, loadData, phase1, pollReason, sessionReason, gameReason, localDay, TZ_OFFSET_H, REMIND_HOUR };
