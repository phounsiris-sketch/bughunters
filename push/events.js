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
    billT: "🧾 Bill ready", billOwe: "{date}: you owe {amount}. Tap to pay.", billNone: "{date}: nothing for you to pay.",
    paidT: "💸 Payment received", paidB: "{name} paid you {amount}",
    remindT: "⏰ Payment reminder", remindB: "You still owe {list} — {amount} in total. Tap to pay.",
    startT: "⏰ Game in 1 hour — get ready!", startB: "Badminton {time} at {court} ({min} min to go)",
    voteT: "🗳️ New answers · {date}", voteB: "{list} · {n}/{min} joining",
    join: "Join", skip: "Skip", cleared: "removed",
    fullT: "🎉 Enough players · {date}", fullCreatorB: "{n}/{min} joined — tap to confirm the plan", fullB: "{n}/{min} joined — waiting for {name} to confirm"
  },
  la: {
    newPollT: "🏸 ໂຫວດໃໝ່", newPollB: "{name}: {date} {time} ທີ່ {court} — ມາ ຫຼື ບໍ່ມາ?",
    confirmedT: "✅ ຢືນຢັນແຜນແລ້ວ", confirmedB: "{date} {time} ທີ່ {court}. ພົບກັນ!",
    billT: "🧾 ບິນພ້ອມແລ້ວ", billOwe: "{date}: ທ່ານຕ້ອງຈ່າຍ {amount}. ແຕະເພື່ອຈ່າຍ.", billNone: "{date}: ທ່ານບໍ່ຕ້ອງຈ່າຍ.",
    paidT: "💸 ໄດ້ຮັບເງິນແລ້ວ", paidB: "{name} ຈ່າຍໃຫ້ທ່ານ {amount}",
    remindT: "⏰ ແຈ້ງເຕືອນຈ່າຍເງິນ", remindB: "ທ່ານຍັງຄ້າງ {list} — ລວມ {amount}. ແຕະເພື່ອຈ່າຍ.",
    startT: "⏰ ອີກ 1 ຊົ່ວໂມງຫຼິ້ນແລ້ວ — ກຽມພ້ອມ!", startB: "ແບດມິນຕັນ {time} ທີ່ {court} (ອີກ {min} ນາທີ)",
    voteT: "🗳️ ຄຳຕອບໃໝ່ · {date}", voteB: "{list} · ມາ {n}/{min} ຄົນ",
    join: "ມາ", skip: "ບໍ່ມາ", cleared: "ຍົກເລີກ",
    fullT: "🎉 ຄົນພໍແລ້ວ · {date}", fullCreatorB: "ມາ {n}/{min} ຄົນ — ແຕະເພື່ອຢືນຢັນແຜນ", fullB: "ມາ {n}/{min} ຄົນ — ລໍຖ້າ {name} ຢືນຢັນ"
  }
};

const MONTHS = {
  en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
  la: ["ມັງກອນ","ກຸມພາ","ມີນາ","ເມສາ","ພຶດສະພາ","ມິຖຸນາ","ກໍລະກົດ","ສິງຫາ","ກັນຍາ","ຕຸລາ","ພະຈິກ","ທັນວາ"]
};
const fmtDate = (iso, lang) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00Z"); return d.getUTCDate() + " " + MONTHS[lang === "la" ? "la" : "en"][d.getUTCMonth()]; };
const fmtLAK = (n) => Math.round(n || 0).toLocaleString("en-US") + " ₭";
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

  data.polls.forEach((p) => {
    const info = pollInfo(p);
    const open = p.status === "draft" || p.status === "open";
    const min = parseInt(p.minPlayers, 10) || 4;
    const joins = Object.keys(info.responses).filter((u) => info.responses[u] === 0);
    // New answers since the last run → one combined push to the poll creator
    if (open && p.voteLog && p.createdBy) {
      const fresh = Object.keys(p.voteLog).filter((u) => {
        const v = p.voteLog[u];
        return v && isNew(v.at) && u !== p.createdBy && v.by !== p.createdBy;
      });
      if (fresh.length) {
        const c = p.createdBy, L = T(c);
        const list = fresh.map((u) => {
          const a = p.voteLog[u].a;
          return name(u) + " " + (a === 0 ? L.join : a === -1 ? L.cleared : L.skip);
        }).join(", ");
        out.push({ uid: c, title: fill(L.voteT, { date: fmtDate(info.date, L_(c)) }),
          body: fill(L.voteB, { list, n: joins.length, min }), link: link("#polls") });
      }
    }
    // Enough players for the first time → creator (to confirm) and those joining
    if (open && isNew(ms(p.reachedAt))) {
      new Set([p.createdBy, ...joins]).forEach((uid) => {
        if (!uid) return;
        const L = T(uid);
        out.push({ uid, title: fill(L.fullT, { date: fmtDate(info.date, L_(uid)) }),
          body: fill(uid === p.createdBy ? L.fullCreatorB : L.fullB, { n: joins.length, min, name: name(p.createdBy) }),
          link: link("#polls") });
      });
    }
    if (isNew(ms(p.createdAt)) && (p.status === "draft" || p.status === "open")) {
      Object.keys(data.users).forEach((uid) => {
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
  });

  const owed = {}; // from -> to -> amount still unpaid
  data.sessions.forEach((s) => {
    if (!s.calculated) return;
    const L = computeLedger(s);
    const settled = s.settled || {};
    if (isNew(ms(s.billAt))) {
      const people = new Set([...(s.players || []), ...Object.keys(L.shares)]);
      people.forEach((uid) => {
        const owe = L.transfers.filter((tr) => tr.from === uid).reduce((a, tr) => a + tr.amount, 0);
        out.push({ uid, title: T(uid).billT, body: fill(owe ? T(uid).billOwe : T(uid).billNone, { date: fmtDate(s.date, L_(uid)), amount: fmtLAK(owe) }), link: link("#session=" + s.id) });
      });
    }
    const at = s.settledAt || {};
    L.transfers.forEach((tr) => {
      if (settled[tr.key] && isNew(ms(at[tr.key]))) {
        out.push({ uid: tr.to, title: T(tr.to).paidT, body: fill(T(tr.to).paidB, { name: name(tr.from), amount: fmtLAK(tr.amount) }), link: link("#session=" + s.id) });
      }
      if (!settled[tr.key]) {
        owed[tr.from] = owed[tr.from] || {};
        owed[tr.from][tr.to] = (owed[tr.from][tr.to] || 0) + tr.amount;
      }
    });
  });

  // Daily payment reminder (every morning until it is marked paid)
  if (opts.remind) {
    Object.keys(owed).forEach((uid) => {
      const to = owed[uid];
      const total = Object.values(to).reduce((a, b) => a + b, 0);
      const list = Object.keys(to).map((r) => name(r) + " " + fmtLAK(to[r])).join(", ");
      out.push({ uid, title: T(uid).remindT, body: fill(T(uid).remindB, { list, amount: fmtLAK(total) }), link: link("#payments") });
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
  // Manual players can't receive pushes
  return out.filter((m) => data.users[m.uid] && !data.users[m.uid].manual);
}

/** Session start in ms — date + time are Vientiane / Bangkok time (UTC+7) */
function sessionStart(s) {
  if (!s.date || !s.time) return 0;
  const [y, m, d] = s.date.split("-").map(Number);
  const [hh, mm] = s.time.split(":").map(Number);
  if (!y || isNaN(hh)) return 0;
  return Date.UTC(y, m - 1, d, hh - 7, mm || 0);
}

module.exports = { collectMessages, computeLedger, sessionStart };
