/* ============================================================
   perms.js — Who may do what. Mirrors firestore.rules, which is
   where permissions are actually enforced; the UI only hides
   actions a user is not allowed to take.
   ============================================================ */

var SUPER_ADMIN_EMAIL = "phounsiri.s@aidctech.com.la";

// Permissions the Super Admin can grant to each player
var PERMISSIONS = [
  { key: "createPoll",  icon: "🗳️" },  // create / confirm / cancel polls
  { key: "editSession", icon: "📅" },        // session details, create / delete sessions
  { key: "editBill",    icon: "🧾" },        // costs, payers, dinner, payments
  { key: "editConfig",  icon: "⚙️" }         // courts, cocks, manual players, settings
];

function isSuperAdmin() {
  return !!(currentUser && currentUser.email && currentUser.emailVerified !== false &&
    currentUser.email.toLowerCase() === SUPER_ADMIN_EMAIL);
}

/** Does the signed-in user have permission `key`? */
function can(key) {
  if (isSuperAdmin()) return true;
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
  if (!currentUser) return;
  var me = dbFindById(DB_CACHE.users, currentUser.uid);
  if (me && currentUserProfile) currentUserProfile.perms = me.perms || {};
  var fab = document.getElementById("fab");
  if (fab && typeof currentPage !== "undefined") fab.style.display = (currentPage === "polls" && can("createPoll")) ? "" : "none";
}

function dbSetUserPerm(uid, key, value) {
  var data = { perms: {} };
  data.perms[key] = !!value;
  return fsdb.collection("users").doc(uid).set(data, { merge: true });
}
