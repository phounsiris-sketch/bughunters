/* One-off admin job: merge one player into another (all sessions, polls,
   payments, QR codes, phone, default payers), then remove the old player.
   Run from .github/workflows/merge-players.yml:
     FROM / INTO = display name or user id, APPLY = "true" to write
   Without APPLY it only prints what would change (dry run).
   Every changed document is first copied to trash/ (Recently deleted), so
   the Super Admin can restore it for 30 days. */
const admin = require("firebase-admin");

const SUPER_EMAIL = "phounsiri.s@aidctech.com.la";

function isPlain(v) { return v && typeof v === "object" && (v.constructor === Object || Array.isArray(v)); }

/** Replace user id `a` with `b` everywhere in plain data ("x__y" keys too).
    On a key clash the existing value of `b` wins; arrays are de-duplicated. */
function swap(v, a, b) {
  const key = (k) => k.split("__").map((p) => (p === a ? b : p)).join("__");
  if (typeof v === "string") return v === a ? b : v;
  if (Array.isArray(v)) {
    const out = [];
    v.map((x) => swap(x, a, b)).forEach((x) => { if (typeof x !== "string" || out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  if (isPlain(v)) {
    const out = {};
    Object.keys(v).forEach((k) => { if (key(k) === k) out[k] = swap(v[k], a, b); });
    Object.keys(v).forEach((k) => { const nk = key(k); if (nk !== k && !(nk in out)) out[nk] = swap(v[k], a, b); });
    return out;
  }
  return v; // numbers, booleans, Timestamps…
}

function mentions(v, a) {
  if (typeof v === "string") return v === a || v.split("__").indexOf(a) >= 0;
  if (Array.isArray(v)) return v.some((x) => mentions(x, a));
  if (isPlain(v)) return Object.keys(v).some((k) => k.split("__").indexOf(a) >= 0 || mentions(v[k], a));
  return false;
}

async function main() {
  const apply = process.env.APPLY === "true";
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();

  const users = (await db.collection("users").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const find = (q) => {
    const byId = users.filter((u) => u.id === q);
    if (byId.length) return byId;
    return users.filter((u) => (u.displayName || "").trim().toLowerCase() === (q || "").trim().toLowerCase());
  };
  const fromList = find(process.env.FROM), intoList = find(process.env.INTO);
  console.log("Players:", users.map((u) => `${u.displayName}${u.manual ? " (manual)" : ""} [${u.id}]`).join(", "));
  if (fromList.length !== 1 || intoList.length !== 1) {
    throw new Error(`Need exactly one match each — FROM "${process.env.FROM}": ${fromList.length}, INTO "${process.env.INTO}": ${intoList.length}`);
  }
  const from = fromList[0], into = intoList[0];
  if (from.id === into.id) throw new Error("FROM and INTO are the same player");
  const superUser = users.find((u) => (u.email || "").toLowerCase() === SUPER_EMAIL);
  const by = superUser ? superUser.id : into.id;
  console.log(`\n${apply ? "MERGING" : "DRY RUN"}: ${from.displayName}${from.manual ? " (manual)" : ""} [${from.id}]  →  ${into.displayName}${into.manual ? " (manual)" : ""} [${into.id}]\n`);

  const label = (kind, d) => `Before merge ${from.displayName}→${into.displayName} · ${kind} ${d.date || ""} ${d.courtName || ""}`.trim();
  const changes = []; // { ref, before, after, kind, text }

  for (const col of ["sessions", "polls"]) {
    for (const doc of (await db.collection(col).get()).docs) {
      const d = doc.data();
      if (!mentions(d, from.id)) continue;
      const after = swap(d, from.id, into.id);
      const both = col === "sessions" && (d.players || []).includes(from.id) && (d.players || []).includes(into.id);
      changes.push({ ref: doc.ref, before: d, after, kind: col === "sessions" ? "session" : "poll",
        text: `${col === "sessions" ? "Session" : "Poll"} ${d.date || ""} ${d.time || ""} ${d.courtName || ""}${both ? "  ⚠ both played — counts once after merge, split changes" : ""}` });
    }
  }
  const settingsRef = db.collection("settings").doc("app");
  const settings = (await settingsRef.get()).data() || {};
  if (mentions(settings, from.id)) changes.push({ ref: settingsRef, before: settings, after: swap(settings, from.id, into.id), kind: "backup", text: "Group settings (default payer)" });

  // QR codes and phone: copy only what INTO doesn't have yet
  const qrFrom = (await db.collection("qrcodes").doc(from.id).get()).data() || {};
  const qrIntoRef = db.collection("qrcodes").doc(into.id);
  const qrInto = (await qrIntoRef.get()).data() || {};
  const qrCopy = {};
  ["main", "court", "shuttle", "dinner"].forEach((k) => { if (qrFrom[k] && !qrInto[k]) qrCopy[k] = qrFrom[k]; });
  const phoneCopy = from.phone && !into.phone ? from.phone : null;

  changes.forEach((c) => console.log("  • " + c.text));
  console.log(`\nSessions: ${changes.filter((c) => c.kind === "session").length}, polls: ${changes.filter((c) => c.kind === "poll").length}` +
    `, settings: ${changes.some((c) => c.kind === "backup") ? "yes" : "no"}, QR copied: ${Object.keys(qrCopy).join(", ") || "none"}, phone copied: ${phoneCopy ? "yes" : "no"}`);
  console.log(`Then ${from.displayName} is removed (kept in Recently deleted for 30 days).`);

  if (!apply) { console.log("\nDry run only — nothing was changed."); return; }

  const now = Date.now();
  const backup = (kind, collection, docId, data, text) => db.collection("trash").add({
    kind, collection, docId, data, label: text, deletedBy: by, deletedAt: now
  });
  for (const c of changes) {
    await backup(c.kind, c.ref.parent.id, c.ref.id, c.before, label(c.kind === "backup" ? "settings" : c.kind, c.before));
    await c.ref.set(c.after);
  }
  if (Object.keys(qrCopy).length) {
    if (Object.keys(qrInto).length) await backup("qr", "qrcodes", into.id, qrInto, `Before merge · QR of ${into.displayName}`);
    await qrIntoRef.set(qrCopy, { merge: true });
  }
  if (phoneCopy) await db.collection("users").doc(into.id).set({ phone: phoneCopy }, { merge: true });
  if (Object.keys(qrFrom).length) {
    await backup("qr", "qrcodes", from.id, qrFrom, `QR of ${from.displayName} (merged)`);
    await db.collection("qrcodes").doc(from.id).delete();
  }
  const { id, ...fromData } = from;
  await backup("player", "users", from.id, fromData, `${from.displayName} (merged into ${into.displayName})`);
  await db.collection("users").doc(from.id).delete();
  console.log(`\nDone: ${from.displayName} merged into ${into.displayName}.`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
