/* Scheduled sender, run by .github/workflows/push.yml every ~5 minutes.
   Reads Firestore with a service account (GitHub secret
   FIREBASE_SERVICE_ACCOUNT), finds events since the last run and sends
   web pushes through Firebase Cloud Messaging. */
const admin = require("firebase-admin");
const { collectMessages } = require("./events");

const APP_URL = process.env.APP_URL || "https://phounsiris-sketch.github.io/bughunters/";
const TZ_OFFSET_H = 7;  // Vientiane / Bangkok (UTC+7)
const REMIND_HOUR = 9;  // daily payment reminder from 9:00
const TRASH_DAYS = 30;  // Recently deleted keeps items this long

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log("FIREBASE_SERVICE_ACCOUNT secret not set — nothing to do.");
    return;
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const now = Date.now();

  if (process.env.PUSH_TEST === "true") return sendTest(db);

  const stateRef = db.collection("pushState").doc("main");
  const state = (await stateRef.get()).data() || {};
  if (!state.lastRun) {
    // First run: start from now, don't replay old events
    await stateRef.set({ lastRun: now });
    console.log("Initialised; pushes start from now.");
    return;
  }

  const [usersSnap, pollsSnap, sessionsSnap, tokensSnap] = await Promise.all([
    db.collection("users").get(), db.collection("polls").get(),
    db.collection("sessions").get(), db.collection("pushTokens").get()
  ]);
  const users = {}; usersSnap.forEach((d) => (users[d.id] = d.data()));
  const polls = pollsSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const sessions = sessionsSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  const tokens = {}, langs = {};
  tokensSnap.forEach((d) => { tokens[d.id] = Object.keys(d.data().tokens || {}); langs[d.id] = d.data().lang; });

  // Daily payment reminder: first run after 9:00 Bangkok time, once a day
  const local = new Date(now + TZ_OFFSET_H * 3600e3);
  const today = local.toISOString().slice(0, 10);
  const remind = local.getUTCHours() >= REMIND_HOUR && state.lastReminder !== today;

  // "Game in 1 hour" reminders already sent (forget after 2 days)
  const startSent = {};
  Object.entries(state.startSent || {}).forEach(([id, at]) => { if (now - at < 2 * 86400e3) startSent[id] = at; });

  // Votes already announced, per open poll (others are forgotten)
  const openPolls = new Set(polls.filter((p) => p.status === "draft" || p.status === "open").map((p) => p.id));
  const voteSent = {};
  Object.entries(state.voteSent || {}).forEach(([id, m]) => { if (openPolls.has(id)) voteSent[id] = m; });

  const all = collectMessages({ users, polls, sessions, langs }, state.lastRun, now, { remind, appUrl: APP_URL, startSent, voteSent });
  all.forEach((m) => {
    if (m.startOf) startSent[m.startOf] = now;
    if (m.voteAnnounce) { const v = m.voteAnnounce; (voteSent[v.pollId] = voteSent[v.pollId] || {})[v.voter] = v.a; }
  });
  const messages = all.filter((m) => !m.voteAnnounce);
  let sent = 0, failed = 0;
  const dead = {}; // uid -> [bad tokens]

  for (const m of messages) {
    const list = tokens[m.uid] || [];
    if (!list.length) continue;
    const res = await admin.messaging().sendEachForMulticast({
      tokens: list,
      notification: { title: m.title, body: m.body },
      // Same tag = the new banner replaces the previous one for that poll
      data: { tag: m.tag || m.link },
      webpush: { fcmOptions: { link: m.link }, notification: { tag: m.tag || m.link } }
    });
    res.responses.forEach((r, i) => {
      if (r.success) sent++;
      else {
        failed++;
        const code = r.error && r.error.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          (dead[m.uid] = dead[m.uid] || []).push(list[i]);
        }
      }
    });
  }

  // Forget devices that uninstalled / revoked permission
  for (const uid of Object.keys(dead)) {
    const upd = {};
    dead[uid].forEach((tk) => (upd["tokens." + tk] = admin.firestore.FieldValue.delete()));
    await db.collection("pushTokens").doc(uid).update(upd).catch(() => {});
  }

  // Recently deleted: remove entries older than 30 days for good
  const old = await db.collection("trash").where("deletedAt", "<", now - TRASH_DAYS * 86400e3).get();
  for (const d of old.docs) await d.ref.delete();
  if (old.size) console.log(`trash: removed ${old.size} item(s) older than ${TRASH_DAYS} days`);

  await stateRef.set({ lastRun: now, lastReminder: remind ? today : (state.lastReminder || null), startSent, voteSent }, { merge: true });
  console.log(`events: ${messages.length}, pushes sent: ${sent}, failed: ${failed}${remind ? ", daily payment reminder sent" : ""}`);
}

/** Manual test: one push to every registered device, nothing else changes */
async function sendTest(db) {
  const [tokensSnap, usersSnap] = await Promise.all([db.collection("pushTokens").get(), db.collection("users").get()]);
  const names = {}; usersSnap.forEach((d) => (names[d.id] = d.data().displayName || d.data().email || d.id));
  let devices = 0, sent = 0;
  for (const doc of tokensSnap.docs) {
    const list = Object.keys(doc.data().tokens || {});
    if (!list.length) continue;
    devices += list.length;
    const la = doc.data().lang === "la";
    const res = await admin.messaging().sendEachForMulticast({
      tokens: list,
      notification: {
        title: la ? "🧪 ທົດສອບການແຈ້ງເຕືອນ" : "🧪 Test notification",
        body: la ? "ຖ້າເຫັນຂໍ້ຄວາມນີ້, ການແຈ້ງເຕືອນໃຊ້ງານໄດ້ແລ້ວ 🎉" : "If you can see this, push notifications work 🎉"
      },
      webpush: { fcmOptions: { link: APP_URL } }
    });
    sent += res.successCount;
    const dead = {};
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error && r.error.code;
      console.log(`  ✗ ${names[doc.id]}: ${code}`);
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        dead["tokens." + list[i]] = admin.firestore.FieldValue.delete();
      }
    });
    if (Object.keys(dead).length) {
      await doc.ref.update(dead).catch(() => {});
      console.log(`  removed ${Object.keys(dead).length} expired device(s) of ${names[doc.id]}`);
    }
    console.log(`  ${names[doc.id]}: ${res.successCount}/${list.length} device(s)`);
  }
  console.log(devices ? `Test push sent to ${sent} of ${devices} device(s).` : "No devices have notifications on yet — turn them on in Settings first.");
}

main().catch((e) => { console.error(e); process.exit(1); });
