/* One-off admin job: turn today's single group into the first group of the
   new multi-group app. Run from .github/workflows/migrate-groups.yml.
     GROUP_NAME = name of the first group (default "Bughunters")
     APPLY = "true" to write; otherwise a dry run that only prints the plan.
   Safe to run again: it only fills in what is missing.

   It creates
     groups/main          name, private, invite-only, Vientiane, LAK, Lao,
                          settings from settings/app, court prices from courts
     groupSecrets/main    the invite code
     members/main_<uid>   every registered player (the app owner = owner;
                          old permissions move onto the membership)
   and adds groupId "main" to polls, sessions, shuttlecocks, trash and manual
   players, adds createdBy to courts, and moves receipt photos out of
   sessions into images/. */
const admin = require("firebase-admin");
const crypto = require("crypto");

const SUPER_EMAIL = "phounsiri.s@aidctech.com.la";
const GID = "main";

function initAdmin() {
  if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-godsmash" });
  else admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return admin.firestore();
}

function code() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6)).map((b) => abc[b % abc.length]).join("");
}

async function main() {
  const apply = process.env.APPLY === "true";
  const name = (process.env.GROUP_NAME || "Bughunters").trim() || "Bughunters";
  const db = initAdmin();
  const now = Date.now();
  const writes = []; // [ref, data, merge, label]
  const plan = (ref, data, label, merge = true) => writes.push([ref, data, merge, label]);

  const [usersSnap, courtsSnap, settingsDoc, groupDoc, secretDoc] = await Promise.all([
    db.collection("users").get(), db.collection("courts").get(),
    db.collection("settings").doc("app").get(), db.collection("groups").doc(GID).get(), db.collection("groupSecrets").doc(GID).get()
  ]);
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const owner = users.find((u) => (u.email || "").toLowerCase() === SUPER_EMAIL);
  const settings = settingsDoc.exists ? settingsDoc.data() : {};

  // 1. The group
  if (!groupDoc.exists) {
    const courtPrices = {};
    courtsSnap.forEach((d) => { const p = d.data().pricePerHour; if (p > 0) courtPrices[d.id] = p; });
    plan(db.collection("groups").doc(GID), {
      name, type: "private", joinMode: "invite", city: "Vientiane", currency: "LAK", lang: "la",
      description: "", ownerId: owner ? owner.id : null, createdAt: now,
      minPlayers: settings.minPlayers || 4,
      defaultCourtPayer: settings.defaultCourtPayer || null,
      defaultShuttlePayer: settings.defaultShuttlePayer || null,
      courtPrices
    }, `group "${name}" with ${Object.keys(courtPrices).length} court price(s)`, false);
  }
  if (!secretDoc.exists) plan(db.collection("groupSecrets").doc(GID), { inviteCode: code() }, "invite code", false);

  // 2. Memberships
  const memberSnap = await db.collection("members").where("gid", "==", GID).get();
  const isMember = new Set(memberSnap.docs.map((d) => d.data().uid));
  users.filter((u) => !u.manual && !isMember.has(u.id)).forEach((u) => {
    const isOwner = owner && u.id === owner.id;
    plan(db.collection("members").doc(GID + "_" + u.id), {
      gid: GID, uid: u.id, role: isOwner ? "owner" : "member", perms: u.perms || {}, status: "active", joinedAt: now
    }, `member ${u.displayName || u.id}${isOwner ? " (owner)" : Object.keys(u.perms || {}).filter((k) => u.perms[k]).length ? " with rights" : ""}`, false);
  });
  users.filter((u) => u.manual && !u.groupId).forEach((u) => plan(db.collection("users").doc(u.id), { groupId: GID }, `manual player ${u.displayName}`));

  // 3. groupId on group data
  for (const col of ["polls", "sessions", "shuttlecocks", "trash"]) {
    const snap = await db.collection(col).get();
    let n = 0;
    snap.forEach((d) => { if (!d.data().groupId) { n++; plan(d.ref, { groupId: GID }, null); } });
    if (n) writes.push([null, null, null, `${col}: groupId on ${n} document(s)`]);
  }

  // 4. Courts: shared directory needs a creator
  courtsSnap.forEach((d) => { if (!d.data().createdBy) plan(d.ref, { createdBy: owner ? owner.id : "system" }, null); });

  // 5. Receipt photos out of sessions
  const sessions = await db.collection("sessions").get();
  let moved = 0;
  for (const d of sessions.docs) {
    const r = d.data().dinner && d.data().dinner.receiptUrl;
    if (typeof r === "string" && r.indexOf("data:") === 0) {
      moved++;
      const img = db.collection("images").doc();
      plan(img, { data: r, kind: "receipt", createdBy: d.data().createdBy || (owner ? owner.id : "system"), createdAt: now }, null, false);
      plan(d.ref, { dinner: Object.assign({}, d.data().dinner, { receiptUrl: "img:" + img.id }) }, null);
    }
  }
  if (moved) writes.push([null, null, null, `receipts: ${moved} photo(s) moved to images/`]);

  writes.filter((w) => w[3]).forEach((w) => console.log("  • " + w[3]));
  const real = writes.filter((w) => w[0]);
  console.log(`\n${real.length} write(s). ${owner ? "Owner: " + (owner.displayName || owner.email) : "⚠ app owner account not found — group has no owner"}`);
  if (!apply) { console.log("Dry run only — nothing was changed. Tick \"apply\" to migrate."); return; }
  for (let i = 0; i < real.length; i += 400) {
    const batch = db.batch();
    real.slice(i, i + 400).forEach(([ref, data, merge]) => batch.set(ref, data, { merge }));
    await batch.commit();
  }
  const secret = (await db.collection("groupSecrets").doc(GID).get()).data();
  console.log(`\nDone. Invite code for "${name}": ${secret && secret.inviteCode}`);
  console.log("Next: publish the new firestore.rules in the Firebase console, then reopen the app.");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
