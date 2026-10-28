/* Scheduled sender, run by .github/workflows/push.yml every ~5 minutes.
   Reads Firestore with a service account (GitHub secret
   FIREBASE_SERVICE_ACCOUNT), finds events since the last run and sends
   web pushes through Firebase Cloud Messaging. */
const admin = require("firebase-admin");
const { Filter } = require("firebase-admin/firestore");
const { runOnce } = require("./runner");

const APP_URL = process.env.APP_URL || "https://phounsiris-sketch.github.io/bughunters/";
/* v250: runner.js does the two-phase run (a few small queries first, the full
   load only when something is due). This file only talks to Firebase. */

/** Firebase Admin: the service account in CI, or the local emulator in tests */
function initAdmin() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-godsmash" });
  } else {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return admin.firestore();
}

/** The runner's store, on top of Firestore */
function adminStore(db) {
  const stateRef = db.collection("pushState").doc("main");
  const val = (v) => (v && typeof v === "object" && "ts" in v ? admin.firestore.Timestamp.fromMillis(v.ts) : v);
  const one = (coll, c) => db.collection(coll).where(c.f, c.op, val(c.v));
  const pack = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  return {
    async getState() { return (await stateRef.get()).data(); },
    async setState(patch) { await stateRef.set(patch, { merge: true }); },
    async all(coll) { return pack(await db.collection(coll).get()); },
    async query(coll, anyOf) {
      if (anyOf.length === 1) return pack(await one(coll, anyOf[0]).get());
      try {
        // one OR query (billed by documents returned)
        return pack(await db.collection(coll).where(Filter.or(...anyOf.map((c) => Filter.where(c.f, c.op, val(c.v))))).get());
      } catch (e) {
        // OR not accepted for some reason: one query per clause, merged (still far cheaper than reading everything)
        console.log(`  (${coll}: OR query failed: ${e.message}; using ${anyOf.length} queries)`);
        const merged = {};
        for (const c of anyOf) pack(await one(coll, c).get()).forEach((d) => (merged[d.id] = d));
        return Object.values(merged);
      }
    },
    async getByIds(coll, ids) {
      const snaps = await db.getAll(...ids.map((id) => db.collection(coll).doc(id)));
      return snaps.map((s) => ({ id: s.id, data: s.exists ? s.data() : null }));
    },
    async purgeTrash(cutoff) {
      const old = await db.collection("trash").where("deletedAt", "<", cutoff).get();
      for (const d of old.docs) await d.ref.delete();
      return old.size;
    }
  };
}

/** Sends the messages through FCM; forgets devices that uninstalled / revoked permission */
function makeDeliver(db) {
  return async function deliver(messages, tokens) {
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
    for (const uid of Object.keys(dead)) {
      const upd = {};
      dead[uid].forEach((tk) => (upd["tokens." + tk] = admin.firestore.FieldValue.delete()));
      await db.collection("pushTokens").doc(uid).update(upd).catch(() => {});
    }
    return { sent, failed };
  };
}

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.log("FIREBASE_SERVICE_ACCOUNT secret not set — nothing to do.");
    return;
  }
  const db = initAdmin();
  if (process.env.PUSH_TEST === "true") return sendTest(db);
  const out = await runOnce(adminStore(db), Date.now(), { appUrl: APP_URL, deliver: makeDeliver(db) });
  console.log(out.line);
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
