/* Turns Firestore data into push messages. Pure: no Firebase calls, so it
   can be tested on its own. Reuses the app's ledger maths (js/sessions.js)
   so amounts match what people see in the app. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Load ROUND_TO + computeLedger from the app
const src = fs.readFileSync(path.join(__dirname, "..", "js", "sessions.js"), "utf8");
const start = src.indexOf("var ROUND_TO");
const end = src.indexOf("/** Transfers in this session that have not been marked as paid */");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src.slice(start, end), ctx);
const computeLedger = ctx.computeLedger;

const TEXT = {
  en: {
    newPollT: "🏸 New poll", newPollB: "{name}: {date} {time} at {court} — Join or Skip?",
    confirmedT: "✅ Plan confirmed", confirmedB: "{date} {time} at {court}. See you there!",
    cancelledT: "❌ Plan cancelled", cancelledB: "{name} cancelled {date} {time} at {court}",
    billT: "🧾 Bill ready", billOwe: "{date}: you owe {amount}. Tap to pay.", billNone: "{date}: nothing for you to pay.",
    paidT: "💸 Payment received", paidB: "{name} paid you {amount}",
    remindT: "⏰ Payment reminder", remindB: "You still owe {list} — {amount} in total. Tap to pay.",
    startT: "⏰ Game in 1 hour — get ready!", startB: "Badminton {time} at {court} ({min} min to go)",
    voteT: "🗳️ New answers · {date}", voteB: "{list} · {n}/{min} joining",
    join: "Join", skip: "Skip", cleared: "removed",
    closeSoonT: "⏰ Voting closes in 3 hours", closeSoonB: "{date} {time} at {court} — Join or Skip? Answer now",
    closedT: "🔒 Voting closed · {date}", closedCreatorB: "{n}/{min} joined — tap to confirm or cancel the plan", closedB: "{n}/{min} joined — waiting for {name} to confirm",
    fullT: "🎉 Enough players · {date}", fullCreatorB: "{n}/{min} joined — tap to confirm the plan", fullB: "{n}/{min} joined — waiting for {name} to confirm",
    gameJoinT: "🏸 {list} joined your game", gameJoinB: "{date} {time} at {court} · {n}/{slots} players",
    gameFullT: "✅ Game full — it's on!", gameFullB: "{date} {time} at {court} · {n} players",
    gameCancelT: "❌ Game cancelled", gameCancelB: "{name} cancelled {date} {time} at {court}",
    reqT: "👋 Join request · {group}", reqB: "{name} asked to join{msg}",
    approvedT: "🎉 Welcome to {group}", approvedB: "Your request was approved — tap to open the group"
  },
  la: {
    newPollT: "🏸 ໂຫວດໃໝ່", newPollB: "{name}: {date} {time} ທີ່ {court} — ມາ ຫຼື ບໍ່ມາ?",
    confirmedT: "✅ ຢືນຢັນແຜນແລ້ວ", confirmedB: "{date} {time} ທີ່ {court}. ພົບກັນ!",
    cancelledT: "❌ ຍົກເລີກແຜນແລ້ວ", cancelledB: "{name} ຍົກເລີກ {date} {time} ທີ່ {court}",
    billT: "🧾 ບິນພ້ອມແລ້ວ", billOwe: "{date}: ທ່ານຕ້ອງຈ່າຍ {amount}. ແຕະເພື່ອຈ່າຍ.", billNone: "{date}: ທ່ານບໍ່ຕ້ອງຈ່າຍ.",
    paidT: "💸 ໄດ້ຮັບເງິນແລ້ວ", paidB: "{name} ຈ່າຍໃຫ້ທ່ານ {amount}",
    remindT: "⏰ ແຈ້ງເຕືອນຈ່າຍເງິນ", remindB: "ທ່ານຍັງຄ້າງ {list} — ລວມ {amount}. ແຕະເພື່ອຈ່າຍ.",
    startT: "⏰ ອີກ 1 ຊົ່ວໂມງຫຼິ້ນແລ້ວ — ກຽມພ້ອມ!", startB: "ແບດມິນຕັນ {time} ທີ່ {court} (ອີກ {min} ນາທີ)",
    voteT: "🗳️ ຄຳຕອບໃໝ່ · {date}", voteB: "{list} · ມາ {n}/{min} ຄົນ",
    join: "ມາ", skip: "ບໍ່ມາ", cleared: "ຍົກເລີກ",
    closeSoonT: "⏰ ອີກ 3 ຊົ່ວໂມງປິດໂຫວດ", closeSoonB: "{date} {time} ທີ່ {court} — ມາ ຫຼື ບໍ່ມາ? ຕອບດຽວນີ້",
    closedT: "🔒 ປິດໂຫວດແລ້ວ · {date}", closedCreatorB: "ມາ {n}/{min} ຄົນ — ແຕະເພື່ອຢືນຢັນ ຫຼື ຍົກເລີກແຜນ", closedB: "ມາ {n}/{min} ຄົນ — ລໍຖ້າ {name} ຢືນຢັນ",
    fullT: "🎉 ຄົນພໍແລ້ວ · {date}", fullCreatorB: "ມາ {n}/{min} ຄົນ — ແຕະເພື່ອຢືນຢັນແຜນ", fullB: "ມາ {n}/{min} ຄົນ — ລໍຖ້າ {name} ຢືນຢັນ",
    gameJoinT: "🏸 {list} ເຂົ້າຮ່ວມເກມຂອງທ່ານ", gameJoinB: "{date} {time} ທີ່ {court} · {n}/{slots} ຄົນ",
    gameFullT: "✅ ເກມເຕັມແລ້ວ — ຫຼິ້ນແນ່ນອນ!", gameFullB: "{date} {time} ທີ່ {court} · {n} ຄົນ",
    gameCancelT: "❌ ເກມຖືກຍົກເລີກ", gameCancelB: "{name} ຍົກເລີກ {date} {time} ທີ່ {court}",
    reqT: "👋 ຄຳຂໍເຂົ້າຮ່ວມ · {group}", reqB: "{name} ຂໍເຂົ້າຮ່ວມ{msg}",
    approvedT: "🎉 ຍິນດີຕ້ອນຮັບສູ່ {group}", approvedB: "ຄຳຂໍຂອງທ່ານຖືກອະນຸມັດແລ້ວ — ແຕະເພື່ອເປີດກຸ່ມ"
  }
};

const MONTHS = {
  en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  la: ["ມັງກອນ","ກຸມພາ","ມີນາ","ເມສາ","ພຶດສະພາ","ມິຖຸນາ","ກໍລະກົດ","ສິງຫາ","ກັນຍາ","ຕຸລາ","ພະຈິກ","ທັນວາ"]
};
const VOTE_SETTLE = 5 * 60e3; // wait until a vote has been stable for 5 minutes
const fmtDate = (iso, lang) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00Z"); return d.getUTCDate() + " " + MONTHS[lang === "la" ? "la" : "en"][d.getUTCMonth()]; };
const SYMBOL = { LAK: "₭", THB: "฿", USD: "$" };
const fmtLAK = (n, cur) => Math.round(n || 0).toLocaleString("en-US") + " " + (SYMBOL[cur] || "₭");
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? v[k] : ""));
const ms = (x) => (!x ? 0 : typeof x === "number" ? x : typeof x.toMillis === "function" ? x.toMillis() : x._seconds ? x._seconds * 1000 : 0);

function pollInfo(p) {
  if (p.answers) return { date: p.date, time: p.time, court: p.courtName, responses: p.responses || {} };
  const o = (p.options || [])[p.confirmedOption || 0] || {};
  const r = {};
  ((p.votes || {})[p.confirmedOption || 0] || []).forEach((u) => (r[u] = 0));
  return { date: o.date, time: o.time, court: o.courtName, responses: r };
}

/**
 * @param data { users:{uid:doc}, polls:[doc+id], sessions:[doc+id], langs:{uid:'en'|'la'} }
 * @param since last run (ms); @param now (ms)
 * @param opts { remind: boolean (daily payment reminder), appUrl,
 *                startSent: { sessionId: ms } sessions already reminded }
 * @returns [{ uid, title, body, link, startOf? }] — startOf = session id of a
 *          "game in 1 hour" reminder (the caller records it in startSent)
 */
function collectMessages(data, since, now, opts) {
  opts = opts || {};
  const out = [];
  const name = (uid) => { const u = data.users[uid]; return (u && (u.displayName || (u.email || "").split("@")[0])) || "?"; };
  const L_ = (uid) => ((data.langs || {})[uid] === "la" ? "la" : "en");
  const T = (uid) => TEXT[L_(uid)];
  const link = (h) => (opts.appUrl || "") + h;
  const isNew = (t) => t > since && t <= now;
  // With groups, poll news goes only to members of that poll's group
  const byGroup = {};
  (data.members || []).forEach((m) => { if (m.status === "active") (byGroup[m.gid] = byGroup[m.gid] || []).push(m.uid); });
  const audience = (p) => (data.members && p.groupId ? (byGroup[p.groupId] || []) : Object.keys(data.users)).filter((u) => data.users[u]);
  const curOf = (gid) => { const g = (data.groups || {})[gid]; return (g && SYMBOL[g.currency] && g.currency) || "LAK"; };
  const roundFor = (gid) => (curOf(gid) === "LAK" ? 1000 : 1);

  data.polls.forEach((p) => {
    const info = pollInfo(p);
    const open = p.status === "draft" || p.status === "open";
    const min = parseInt(p.minPlayers, 10) || 4;
    const joins = Object.keys(info.responses).filter((u) => info.responses[u] === 0);
    // New answers → one combined push per poll to everyone (engagement period).
    // A vote is announced only after it has stayed the same for VOTE_SETTLE
    // (so fast Yes/No/Yes taps send one final answer), and only if it differs
    // from what was announced before (opts.voteSent = { pollId: { voter: a } }).
    const announced = (opts.voteSent || {})[p.id] || {};
    if (open && p.voteLog) {
      const settled = Object.keys(p.voteLog).filter((u) => {
        const v = p.voteLog[u];
        if (!v || !v.at || v.at > now - VOTE_SETTLE) return false;
        return announced.hasOwnProperty(u) ? announced[u] !== v.a : v.a !== -1;
      });
      if (settled.length) {
        settled.forEach((u) => out.push({ voteAnnounce: { pollId: p.id, voter: u, a: p.voteLog[u].a } }));
        audience(p).forEach((uid) => {
          if (data.users[uid].manual) return;
          const mine = settled.filter((u) => u !== uid && p.voteLog[u].by !== uid); // not your own taps
          if (!mine.length) return;
          const L = T(uid);
          const list = mine.map((u) => {
            const v = p.voteLog[u];
            const who = v.by && v.by !== u ? name(u) + " (" + name(v.by) + ")" : name(u);
            return who + " " + (v.a === 0 ? L.join : v.a === -1 ? L.cleared : L.skip);
          }).join(", ");
          out.push({ uid, tag: "votes-" + p.id, title: fill(L.voteT, { date: fmtDate(info.date, L_(uid)) }),
            body: fill(L.voteB, { list, n: joins.length, min }), link: link("#polls") });
        });
      }
    }
    // Voting deadline: reminder 3 h before to those who haven't answered,
    // then "voting closed" to the creator and everyone who answered
    const closesAt = pollCloseMs(p);
    if (open && closesAt) {
      if (isNew(closesAt - 3 * 3600e3) && now < closesAt) {
        audience(p).forEach((uid) => {
          if (data.users[uid].manual || info.responses.hasOwnProperty(uid)) return;
          const L = T(uid);
          out.push({ uid, tag: "closing-" + p.id, title: L.closeSoonT,
            body: fill(L.closeSoonB, { date: fmtDate(info.date, L_(uid)), time: info.time || "", court: info.court || "" }), link: link("#polls") });
        });
      }
      if (isNew(closesAt)) {
        new Set([p.createdBy, ...Object.keys(info.responses)]).forEach((uid) => {
          if (!uid || !data.users[uid] || data.users[uid].manual) return;
          const L = T(uid);
          out.push({ uid, tag: "closed-" + p.id, title: fill(L.closedT, { date: fmtDate(info.date, L_(uid)) }),
            body: fill(uid === p.createdBy ? L.closedCreatorB : L.closedB, { n: joins.length, min, name: name(p.createdBy) }), link: link("#polls") });
        });
      }
    }
    // Enough players for the first time → everyone (creator gets "tap to confirm")
    if (open && isNew(ms(p.reachedAt))) {
      audience(p).forEach((uid) => {
        if (data.users[uid].manual) return;
        const L = T(uid);
        out.push({ uid, tag: "full-" + p.id, title: fill(L.fullT, { date: fmtDate(info.date, L_(uid)) }),
          body: fill(uid === p.createdBy ? L.fullCreatorB : L.fullB, { n: joins.length, min, name: name(p.createdBy) }),
          link: link("#polls") });
      });
    }
    if (isNew(ms(p.createdAt)) && (p.status === "draft" || p.status === "open")) {
      audience(p).forEach((uid) => {
        if (uid === p.createdBy || data.users[uid].manual) return;
        out.push({ uid, title: T(uid).newPollT, body: fill(T(uid).newPollB, { name: name(p.createdBy), date: fmtDate(info.date, L_(uid)), time: info.time || "", court: info.court || "" }), link: link("#polls") });
      });
    }
    if (p.status === "confirmed" && isNew(ms(p.confirmedAt))) {
      const joined = p.confirmedPlayers || Object.keys(info.responses).filter((u) => info.responses[u] === 0);
      joined.forEach((uid) => {
        out.push({ uid, title: T(uid).confirmedT, body: fill(T(uid).confirmedB, { date: fmtDate(info.date, L_(uid)), time: info.time || "", court: info.court || "" }), link: link(p.sessionId ? "#session=" + p.sessionId : "#polls") });
      });
    }
    // Voting closed early by cancelling: tell everyone who answered
    if (p.status === "cancelled" && isNew(p.cancelledAt)) {
      const by = p.cancelledBy || p.createdBy;
      Object.keys(info.responses).forEach((uid) => {
        if (uid === by || !data.users[uid] || data.users[uid].manual) return;
        out.push({ uid, tag: "cancel-" + p.id, title: T(uid).cancelledT,
          body: fill(T(uid).cancelledB, { name: name(by), date: fmtDate(info.date, L_(uid)), time: info.time || "", court: info.court || "" }), link: link("#polls") });
      });
    }
  });

  const owed = {}; // from -> to -> amount still unpaid
  data.sessions.forEach((s) => {
    if (!s.calculated) return;
    ctx.ROUND_TO = roundFor(s.groupId);
    const cur = curOf(s.groupId);
    const L = computeLedger(s);
    const settled = s.settled || {};
    if (isNew(ms(s.billAt))) {
      const people = new Set([...(s.players || []), ...Object.keys(L.shares)]);
      people.forEach((uid) => {
        const owe = L.transfers.filter((tr) => tr.from === uid).reduce((a, tr) => a + tr.amount, 0);
        out.push({ uid, title: T(uid).billT, body: fill(owe ? T(uid).billOwe : T(uid).billNone, { date: fmtDate(s.date, L_(uid)), amount: fmtLAK(owe, cur) }), link: link("#session=" + s.id) });
      });
    }
    const at = s.settledAt || {};
    L.transfers.forEach((tr) => {
      if (settled[tr.key] && isNew(ms(at[tr.key]))) {
        out.push({ uid: tr.to, title: T(tr.to).paidT, body: fill(T(tr.to).paidB, { name: name(tr.from), amount: fmtLAK(tr.amount, cur) }), link: link("#session=" + s.id) });
      }
      if (!settled[tr.key]) {
        const k = tr.to + "|" + cur;
        owed[tr.from] = owed[tr.from] || {};
        owed[tr.from][k] = (owed[tr.from][k] || 0) + tr.amount;
      }
    });
  });

  // Daily payment reminder (every morning until it is marked paid)
  if (opts.remind) {
    Object.keys(owed).forEach((uid) => {
      const to = owed[uid];
      const totals = {};
      Object.keys(to).forEach((k) => { const c = k.split("|")[1]; totals[c] = (totals[c] || 0) + to[k]; });
      const list = Object.keys(to).map((k) => name(k.split("|")[0]) + " " + fmtLAK(to[k], k.split("|")[1])).join(", ");
      const amount = Object.keys(totals).map((c) => fmtLAK(totals[c], c)).join(" + ");
      out.push({ uid, title: T(uid).remindT, body: fill(T(uid).remindB, { list, amount }), link: link("#payments") });
    });
  }

  // Game starts within the next hour → remind its players once
  const startSent = opts.startSent || {};
  data.sessions.forEach((s) => {
    const start = sessionStart(s);
    if (!start || startSent[s.id]) return;
    const left = start - now;
    if (left <= 0 || left > 60 * 60e3) return;
    (s.players || []).forEach((uid) => {
      out.push({ uid, title: T(uid).startT, startOf: s.id,
        body: fill(T(uid).startB, { time: s.time || "", court: s.courtName || "", min: Math.max(1, Math.round(left / 60e3)) }),
        link: link("#session=" + s.id) });
    });
  });
  // Public open games: who joined (to the host), full (to everyone in it),
  // cancelled (to everyone who had joined), and "game in 1 hour"
  (data.openGames || []).forEach((g) => {
    const info = { date: g.date, time: g.time || "", court: g.courtName || "" };
    const players = g.players || [];
    const joins = Object.keys(g.log || {}).filter((u) => u !== g.hostId && g.log[u].a === "join" && isNew(g.log[u].at) && players.includes(u));
    if (joins.length && data.users[g.hostId] && g.status !== "cancelled") {
      const L = T(g.hostId);
      out.push({ uid: g.hostId, tag: "game-" + g.id, title: fill(L.gameJoinT, { list: joins.map(name).join(", ") }),
        body: fill(L.gameJoinB, Object.assign({ n: players.length, slots: g.slots, date: fmtDate(info.date, L_(g.hostId)) }, { time: info.time, court: info.court })),
        link: link("#public") });
    }
    if (g.status === "full" && isNew(g.fullAt)) {
      new Set([g.hostId, ...players]).forEach((uid) => {
        if (!data.users[uid]) return;
        out.push({ uid, tag: "game-" + g.id, title: T(uid).gameFullT,
          body: fill(T(uid).gameFullB, { date: fmtDate(info.date, L_(uid)), time: info.time, court: info.court, n: players.length }), link: link("#public") });
      });
    }
    if (g.status === "cancelled" && isNew(g.cancelledAt)) {
      new Set([...players, ...(g.waitlist || [])]).forEach((uid) => {
        if (uid === g.hostId || !data.users[uid]) return;
        out.push({ uid, tag: "game-" + g.id, title: T(uid).gameCancelT,
          body: fill(T(uid).gameCancelB, { name: name(g.hostId), date: fmtDate(info.date, L_(uid)), time: info.time, court: info.court }), link: link("#public") });
      });
    }
    const start = sessionStart(g);
    const key = "g_" + g.id;
    if (g.status !== "cancelled" && start && !startSent[key] && start - now > 0 && start - now <= 60 * 60e3) {
      new Set([g.hostId, ...players]).forEach((uid) => {
        if (!data.users[uid]) return;
        out.push({ uid, title: T(uid).startT, startOf: key,
          body: fill(T(uid).startB, { time: info.time, court: info.court, min: Math.max(1, Math.round((start - now) / 60e3)) }), link: link("#public") });
      });
    }
  });

  // Join requests (to the group's admins) and approvals (to the person)
  (data.members || []).forEach((m) => {
    const g = (data.groups || {})[m.gid];
    if (!g) return;
    if (m.status === "pending" && isNew(m.joinedAt)) {
      (data.members || []).filter((a) => a.gid === m.gid && a.status === "active" && (a.role === "owner" || a.role === "admin")).forEach((a) => {
        const L = T(a.uid);
        out.push({ uid: a.uid, tag: "req-" + m.gid, title: fill(L.reqT, { group: g.name || "" }),
          body: fill(L.reqB, { name: name(m.uid), msg: m.message ? ": “" + m.message + "”" : "" }), link: link("#settings") });
      });
    }
    if (m.status === "active" && isNew(m.approvedAt)) {
      const L = T(m.uid);
      out.push({ uid: m.uid, title: fill(L.approvedT, { group: g.name || "" }), body: L.approvedB, link: link("#group=" + m.gid) });
    }
  });

  // Manual players can't receive pushes; vote markers are for the caller
  return out.filter((m) => m.voteAnnounce || (data.users[m.uid] && !data.users[m.uid].manual));
}

/** Voting deadline of a poll in ms: closesAt, else midnight before the game
    day (Bangkok time), or game start when the poll was created after that */
function pollCloseMs(p) {
  if (p.closesAt) return p.closesAt;
  const date = p.date || ((p.options || [])[p.confirmedOption || 0] || {}).date;
  if (!date) return 0;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (p.time || "00:00").split(":").map(Number);
  const midnight = Date.UTC(y, m - 1, d) - 7 * 3600e3;
  const created = ms(p.createdAt);
  return created && created > midnight - 3600e3 ? Date.UTC(y, m - 1, d, hh || 0, mm || 0) - 7 * 3600e3 : midnight;
}

/** Session start in ms — date + time are Vientiane / Bangkok time (UTC+7) */
function sessionStart(s) {
  if (!s.date || !s.time) return 0;
  const [y, m, d] = s.date.split("-").map(Number);
  const [hh, mm] = s.time.split(":").map(Number);
  if (!y || isNaN(hh)) return 0;
  return Date.UTC(y, m - 1, d, hh - 7, mm || 0);
}

module.exports = { collectMessages, computeLedger, sessionStart, pollCloseMs };
