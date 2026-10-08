/* ============================================================
   perms.js — Who may do what. Mirrors firestore.rules, which is
   where permissions are actually enforced; the UI only hides
   actions a user is not allowed to take.
   ============================================================ */

var SUPER_ADMIN_EMAIL = "phounsiri.s@aidctech.com.la";

// Permissions the Super Admin can grant to each player
var PERMISSIONS = [
  { key: "createPoll",  icon: "vote" },  // manage everyone's polls (own polls need nothing)
  { key: "editSession", icon: "calendar" },        // details of any session; delete any session
  { key: "editBill",    icon: "bill" },        // costs, payers, dinner, payments of any session
  { key: "editConfig",  icon: "settings" }         // courts, cocks, manual players, settings
];

function isSuperAdmin() {
  return !!(currentUser && currentUser.email && currentUser.emailVerified !== false &&
    currentUser.email.toLowerCase() === SUPER_ADMIN_EMAIL);
}

/** Does the signed-in user have permission `key`? */
function can(key) {
  if (isSuperAdmin()) return true;
  if (typeof GROUPS_ON !== "undefined" && GROUPS_ON) {
    // Rights come from my membership in the current group
    var m = myMember();
    if (!m || m.status !== "active") return false;
    return m.role === "owner" || m.role === "admin" || !!(m.perms && m.perms[key]);
  }
  var perms = currentUserProfile && currentUserProfile.perms;
  return !!(perms && perms[key]);
}

/** Permission map of any player (for the roster) */
function userPerms(u) {
  if (u && u.email && u.email.toLowerCase() === SUPER_ADMIN_EMAIL) return "super";
  return (u && u.perms) || {};
}

/** Keep currentUserProfile.perms in sync when the Super Admin changes them */
function syncMyPerms() {
  if (!currentUser || (typeof GROUPS_ON !== "undefined" && GROUPS_ON)) return;
  var me = findUser(currentUser.uid);
  if (me && currentUserProfile) currentUserProfile.perms = me.perms || {};
}

function dbSetUserPerm(uid, key, value) {
  var data = { perms: {} };
  data.perms[key] = !!value;
  return fsdb.collection("users").doc(uid).set(data, { merge: true });
}

/* ---------- Ownership: creators always manage their own items ---------- */
function _isMine(item) {
  return !!(item && currentUser && item.createdBy === currentUser.uid);
}

/** Confirm / cancel / answer-for-others on a poll */
function canManagePoll(poll) { return can("createPoll") || _isMine(poll); }

/** Date, time, court, players of a session */
function canEditSessionDetails(s) { return can("editSession") || _isMine(s); }

/** Costs, payers, dinner, payments of a session */
function canEditBill(s) { return can("editBill") || _isMine(s); }

function canDeleteSession(s) { return can("editSession") || _isMine(s); }
