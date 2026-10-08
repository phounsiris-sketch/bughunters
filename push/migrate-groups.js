/* One-off admin job: turn today's single group into the first group of the
   new multi-group app. Run from .github/workflows/migrate-groups.yml.
     GROUP_NAME = name of the first group (default "Bughunters")
     TARGET_GROUP = id or name of a group that already exists (one made in
                    the app). The old data then goes into that group instead
                    of a new "main" group. Empty + exactly one group = that
                    group; empty + several groups = refuses and lists them.
     APPLY = "true" to write; otherwise a dry run that only prints the plan.
   Safe to run again: it only fills in what is missing.
   The log never shows the invite code or people's names (Actions logs of a
   public repo are public).

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
let GID = "main";

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

  // 0. Which group: an existing one (TARGET_GROUP) or a new "main"
  const groupsSnap = await db.collection("groups").get();
  const groups = groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const target = (process.env.TARGET_GROUP || "").trim();
  const listGroups = async () => {
    console.log("Groups in the app:");
    for (const g of groups) {
      const n = (await db.collection("members").where("gid", "==", g.id).get()).size;
      console.log(`  • id "${g.id}"  name "${g.name || ""}"  ${n} member(s)`);
    }
  };
  if (target) {
    const hit = groups.filter((g) => g.id === target);
    const byName = hit.length ? hit : groups.filter((g) => (g.name || "").trim().toLowerCase() === target.toLowerCase());
    if (byName.length !== 1) {
      await listGroups();
      throw new Error(byName.length ? `${byName.length} groups are named "${target}" — use the group id instead` : `no group with id or name "${target}"`);
    }
    GID = byName[0].id;
    console.log(`Target: existing group "${byName[0].name}" (id ${GID})\n`);
  } else if (groups.length === 1 && groups[0].id !== "main") {
    // Only one group (made in the app) — that is where the old data goes
    GID = groups[0].id;
    console.log(`Target: the only group, "${groups[0].name}" (id ${GID})\n`);
  } else if (groups.some((g) => g.id !== "main")) {
    await listGroups();
    throw new Error("more than one group exists — run again with target_group set to the group that should get the old data");
  }

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
  if (groupDoc.exists && GID !== "main") {
    // Existing group: add the old court prices and payers it doesn't have yet
    const g = groupDoc.data(), cur = g.courtPrices || {}, add = {};
    courtsSnap.forEach((d) => { const p = d.data().pricePerHour; if (p > 0 && cur[d.id] == null) add[d.id] = p; });
    const upd = {};
    if (Object.keys(add).length) upd.courtPrices = add;
    if (!g.defaultCourtPayer && settings.defaultCourtPayer) upd.defaultCourtPayer = settings.defaultCourtPayer;
    if (!g.defaultShuttlePayer && settings.defaultShuttlePayer) upd.defaultShuttlePayer = settings.defaultShuttlePayer;
    if (Object.keys(upd).length) plan(groupDoc.ref, upd, `group: ${Object.keys(add).length} court price(s) added${upd.defaultCourtPayer || upd.defaultShuttlePayer ? ", default payers set" : ""}`);
  }
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
  // A new group's owner is the app owner; an existing group keeps its owner
  const ownerUid = groupDoc.exists ? groupDoc.data().ownerId : owner && owner.id;
  const newMembers = users.filter((u) => !u.manual && !isMember.has(u.id));
  newMembers.forEach((u) => {
    plan(db.collection("members").doc(GID + "_" + u.id), {
      gid: GID, uid: u.id, role: u.id === ownerUid ? "owner" : "member", perms: u.perms || {}, status: "active", joinedAt: now
    }, null, false);
  });
  const withRights = newMembers.filter((u) => Object.keys(u.perms || {}).some((k) => u.perms[k])).length;
  if (newMembers.length) writes.push([null, null, null, `members: ${newMembers.length} player(s) added${withRights ? ` (${withRights} keep their rights)` : ""}, ${isMember.size} already in`]);
  const manual = users.filter((u) => u.manual && !u.groupId);
  manual.forEach((u) => plan(db.collection("users").doc(u.id), { groupId: GID }, null));
  if (manual.length) writes.push([null, null, null, `manual players: ${manual.length} put in the group`]);

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
  console.log(`\n${real.length} write(s).${!groupDoc.exists && !owner ? " ⚠ app owner account not found — group has no owner" : ""}`);
  if (!apply) { console.log("Dry run only — nothing was changed. Tick \"apply\" to migrate."); return; }
  for (let i = 0; i < real.length; i += 400) {
    const batch = db.batch();
    real.slice(i, i + 400).forEach(([ref, data, merge]) => batch.set(ref, data, { merge }));
    await batch.commit();
  }
  console.log(`\nDone. Old data is now in group id ${GID}. The invite link is in the app: Settings → Group.`);
  console.log("Next: make sure the new firestore.rules are published in the Firebase console, then reopen the app.");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
