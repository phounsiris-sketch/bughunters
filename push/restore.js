/* Restore from a backup.json made by backup.js.
   COLLECTIONS = "all" or a comma list (e.g. "sessions,polls").
   Without APPLY=true it only prints what it would write (dry run).
   Documents in the backup are written back with the same id (overwriting
   the current version); documents that are not in the backup are left alone. */
const fs = require("fs");
const admin = require("firebase-admin");

function initAdmin() {
  if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-godsmash" });
  else admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return admin.firestore();
}

function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if (Object.keys(v).length === 1 && typeof v.__ts === "number") return admin.firestore.Timestamp.fromMillis(v.__ts);
    const o = {}; Object.keys(v).forEach((k) => (o[k] = revive(v[k]))); return o;
  }
  return v;
}

async function main() {
  const apply = process.env.APPLY === "true";
  const file = process.env.BACKUP_FILE || "backup.json";
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const want = (process.env.COLLECTIONS || "all").split(",").map((s) => s.trim()).filter(Boolean);
  const names = Object.keys(data.collections).filter((c) => want.includes("all") || want.includes(c));
  console.log(`Backup from ${new Date(data.exportedAt).toISOString()} — ${apply ? "RESTORING" : "DRY RUN"}: ${names.join(", ") || "(nothing matches)"}`);
  const db = initAdmin();
  let total = 0;
  for (const c of names) {
    const docs = data.collections[c];
    const ids = Object.keys(docs);
    console.log(`  ${c}: ${ids.length} document(s)`);
    total += ids.length;
    if (!apply) continue;
    for (let i = 0; i < ids.length; i += 400) {
      const batch = db.batch();
      ids.slice(i, i + 400).forEach((id) => batch.set(db.collection(c).doc(id), revive(docs[id])));
      await batch.commit();
    }
  }
  console.log(apply ? `Done: ${total} document(s) written.` : `Dry run only — nothing was changed (${total} document(s) would be written).`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
