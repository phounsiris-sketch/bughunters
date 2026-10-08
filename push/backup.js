/* Backup: every Firestore collection to one JSON file (backup.json).
   Run by .github/workflows/backup.yml, which then gzips and encrypts it
   with the BACKUP_PASSWORD secret before keeping it as a run artifact.
   Timestamps are written as { "__ts": milliseconds }. */
const fs = require("fs");
const admin = require("firebase-admin");

function initAdmin() {
  if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-godsmash" });
  else admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return admin.firestore();
}

function plain(v) {
  if (v instanceof admin.firestore.Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => (o[k] = plain(v[k]))); return o; }
  return v;
}

async function main() {
  const db = initAdmin();
  const out = { exportedAt: Date.now(), collections: {} };
  const cols = await db.listCollections();
  for (const col of cols) {
    const snap = await col.get();
    const docs = {};
    snap.forEach((d) => (docs[d.id] = plain(d.data())));
    out.collections[col.id] = docs;
    console.log(`  ${col.id}: ${snap.size}`);
  }
  fs.writeFileSync(process.env.BACKUP_FILE || "backup.json", JSON.stringify(out));
  console.log(`Backup written: ${Object.keys(out.collections).length} collections`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
