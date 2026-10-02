/* Scheduled sender, run by .github/workflows/push.yml every ~5 minutes.
   Reads Firestore with a service account (GitHub secret
   FIREBASE_SERVICE_ACCOUNT), finds events since the last run and sends
   web pushes through Firebase Cloud Messaging. */
const admin = require("firebase-admin");
const { collectMessages } = require("./events");

const APP_URL = process.env.APP_URL || "https://phounsiris-sketch.github.io/bughunters/";
const TZ_OFFSET_H = 7; // Vientiane (UTC+7), for the weekly reminder

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log("FIREBASE_SERVICE_ACCOUNT secret not set — nothing to do.");
    return;
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const now = Date.now();

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

  // Weekly reminder: Sunday after 10:00 Vientiane time, once per Sunday
  const local = new Date(now + TZ_OFFSET_H * 3600e3);
  const today = local.toISOString().slice(0, 10);
  const remind = local.getUTCDay() === 0 && local.getUTCHours() >= 10 && state.lastReminder !== today;

  const messages = collectMessages({ users, polls, sessions, langs }, state.lastRun, now, { remind, appUrl: APP_URL });
  let sent = 0, failed = 0;
  const dead = {}; // uid -> [bad tokens]

  for (const m of messages) {
    const list = tokens[m.uid] || [];
    if (!list.length) continue;
    const res = await admin.messaging().sendEachForMulticast({
      tokens: list,
      notification: { title: m.title, body: m.body },
      webpush: { fcmOptions: { link: m.link }, notification: { tag: m.link } }
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

  await stateRef.set({ lastRun: now, lastReminder: remind ? today : (state.lastReminder || null) }, { merge: true });
  console.log(`events: ${messages.length}, pushes sent: ${sent}, failed: ${failed}${remind ? ", weekly reminder sent" : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
