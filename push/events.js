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
    remindT: "⏰ Payment reminder", remindB: "You still owe {amount} in total. Tap to see who to pay."
  },
  la: {
    newPollT: "🏸 ໂຫວດໃໝ່", newPollB: "{name}: {date} {time} ທີ່ {court} — ມາ ຫຼື ບໍ່ມາ?",
    confirmedT: "✅ ຢືນຢັນແຜນແລ້ວ", confirmedB: "{date} {time} ທີ່ {court}. ພົບກັນ!",
    billT: "🧾 ບິນພ້ອມແລ້ວ", billOwe: "{date}: ທ່ານຕ້ອງຈ່າຍ {amount}. ແຕະເພື່ອຈ່າຍ.", billNone: "{date}: ທ່ານບໍ່ຕ້ອງຈ່າຍ.",
    paidT: "💸 ໄດ້ຮັບເງິນແລ້ວ", paidB: "{name} ຈ່າຍໃຫ້ທ່ານ {amount}",
    remindT: "⏰ ແຈ້ງເຕືອນຈ່າຍເງິນ", remindB: "ທ່ານຍັງຄ້າງຈ່າຍທັງໝົດ {amount}. ແຕະເພື່ອເບິ່ງ."
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
 * @param opts { remind: boolean, appUrl }
 * @returns [{ uid, title, body, link }]
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

  const owedTotal = {};
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
      if (!settled[tr.key]) owedTotal[tr.from] = (owedTotal[tr.from] || 0) + tr.amount;
    });
  });

  if (opts.remind) {
    Object.keys(owedTotal).forEach((uid) => {
      out.push({ uid, title: T(uid).remindT, body: fill(T(uid).remindB, { amount: fmtLAK(owedTotal[uid]) }), link: link("#payments") });
    });
  }
  // Manual players can't receive pushes
  return out.filter((m) => data.users[m.uid] && !data.users[m.uid].manual);
}

module.exports = { collectMessages, computeLedger };
