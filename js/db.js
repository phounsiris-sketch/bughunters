/* ============================================================
   db.js — Firestore CRUD (COMPAT API)
   Uses global `fsdb` from firebase-config.js
   ============================================================ */

// Surface database errors (permission denied, offline, bad project) instead of failing silently
var _dbErrorShown = false;
function _dbTxt(key, fallback) { var v = typeof t === "function" ? t(key) : key; return v && v !== key ? v : fallback; }
/** One slim bar for the first database error (v232): says what happened, Retry reloads, x dismisses. A network error clears itself when the phone is back online. */
function dbOnError(err, where) {
  console.error("Firestore error" + (where ? " (" + where + ")" : "") + ":", err);
  if (_dbErrorShown) return;
  _dbErrorShown = true;
  var perm = !!(err && err.code === "permission-denied"), tag = where ? " [" + where + "]" : "";
  var msg = perm
    ? _dbTxt("dbErrPerm", "The database refused this request") + tag + ". " + _dbTxt("dbErrPermHint", "Check the rules and your sign-in.")
    : _dbTxt("dbErrNet", "Cannot reach the database") + tag + ".";
  var bar = document.createElement("div");
  bar.id = "dbErrBar"; bar.className = "db-err"; bar.setAttribute("role", "alert"); bar.setAttribute("data-kind", perm ? "perm" : "net");
  var span = document.createElement("span"); span.textContent = msg;
  var retry = document.createElement("button"); retry.type = "button"; retry.className = "db-err-retry"; retry.textContent = _dbTxt("dbRetry", "Retry");
  retry.onclick = function () { window.location.reload(); };
  var x = document.createElement("button"); x.type = "button"; x.className = "db-err-x"; x.setAttribute("aria-label", _dbTxt("dbDismiss", "Dismiss")); x.textContent = "\u00D7";
  x.onclick = function () { bar.remove(); };
  bar.appendChild(span); bar.appendChild(retry); bar.appendChild(x);
  document.body.appendChild(bar);
}
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("online", function () {
    var b = document.getElementById("dbErrBar");
    if (b && b.getAttribute("data-kind") === "net") { b.remove(); _dbErrorShown = false; }   // the listeners reconnect by themselves
  });
}

// ── Courts ──────────────────────────────────────────────────

function dbGetCourts(callback) {
  return fsdb.collection("courts")
    .orderBy("name")
    .onSnapshot(function (snap) {
      var courts = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        courts.push(d);
      });
      callback(courts);
    }, function (e) { dbOnError(e, "courts"); });
}

function dbAddCourt(data) {
  return fsdb.collection("courts").add(data);
}

function dbUpdateCourt(id, data) {
  return fsdb.collection("courts").doc(id).update(data);
}

function dbDeleteCourt(id) {
  return fsdb.collection("courts").doc(id).delete();
}

// ── Shuttlecocks ────────────────────────────────────────────

function _byName(a, b) { return String(a.name || "").localeCompare(String(b.name || "")); }
function _byCreatedDesc(a, b) {
  var ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
  var tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
  return tb - ta;
}

function dbGetShuttlecocks(callback) {
  // Per group; sorted here so no composite index is needed
  return groupScoped(fsdb.collection("shuttlecocks"))
    .onSnapshot(function (snap) {
      var brands = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        brands.push(d);
      });
      callback(brands.sort(_byName));
    }, function (e) { dbOnError(e, "shuttlecocks"); });
}

function dbAddShuttlecock(data) {
  return fsdb.collection("shuttlecocks").add(withGroup(data));
}

function dbUpdateShuttlecock(id, data) {
  return fsdb.collection("shuttlecocks").doc(id).update(data);
}

function dbDeleteShuttlecock(id) {
  return fsdb.collection("shuttlecocks").doc(id).delete();
}

// ── Users ───────────────────────────────────────────────────

function dbGetUsers(callback) {
  return fsdb.collection("users")
    .orderBy("displayName")
    .onSnapshot(function (snap) {
      var users = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        users.push(d);
      });
      callback(users);
    }, function (e) { dbOnError(e, "users"); });
}

function dbGetUser(uid) {
  return fsdb.collection("users").doc(uid).get()
    .then(function (doc) {
      if (doc.exists) {
        var d = doc.data();
        d.id = doc.id;
        return d;
      }
      return null;
    });
}

/** Friend without an account, added by hand */
function dbAddManualPlayer(data) {
  withGroup(data);
  data.manual = true;
  data.createdBy = currentUser ? currentUser.uid : null;
  data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  return fsdb.collection("users").add(data);
}

function dbDeleteManualPlayer(uid) {
  return fsdb.collection("users").doc(uid).delete();
}

function dbUpdateUser(uid, data) {
  return fsdb.collection("users").doc(uid).set(data, { merge: true });
}

// ── Polls ───────────────────────────────────────────────────

function dbGetPolls(callback) {
  return groupScoped(fsdb.collection("polls"))
    .onSnapshot(function (snap) {
      var polls = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        polls.push(d);
      });
      callback(polls.sort(_byCreatedDesc));
    }, function (e) { dbOnError(e, "polls"); });
}

function dbCreatePoll(data) {
  withGroup(data);
  data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  return fsdb.collection("polls").add(data);
}

function dbUpdatePoll(id, data) {
  return fsdb.collection("polls").doc(id).update(data);
}

// ── Sessions ────────────────────────────────────────────────

function dbGetSessions(callback) {
  return groupScoped(fsdb.collection("sessions"))
    .onSnapshot(function (snap) {
      var sessions = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        sessions.push(d);
      });
      callback(sessions.sort(_byCreatedDesc));
    }, function (e) { dbOnError(e, "sessions"); });
}

function dbCreateSession(data) {
  withGroup(data);
  data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  return fsdb.collection("sessions").add(data);
}

function dbUpdateSession(id, data) {
  return fsdb.collection("sessions").doc(id).update(data);
}

function dbDeleteSession(id) {
  return fsdb.collection("sessions").doc(id).delete();
}

// ── QR Codes (settings singleton) ───────────────────────────

function dbGetQrCodes(callback) {
  return fsdb.collection("settings").doc("qrCodes")
    .onSnapshot(function (doc) {
      if (doc.exists) {
        callback(doc.data());
      } else {
        callback(null);
      }
    }, function (e) { dbOnError(e, "settings"); });
}

function dbSetQrCodes(data) {
  return fsdb.collection("settings").doc("qrCodes")
    .set(data, { merge: true });
}

// ── Shared cache (one listener per collection for the whole app) ──

// users / courts = the current group's roster and courts; allUsers / allCourts = everyone / the directory
var DB_CACHE = { users: [], allUsers: [], courts: [], allCourts: [], groupCourts: null, shuttlecocks: [], qrCodes: null, app: {}, restaurants: [], reviews: [] };
var _dbCacheUnsubs = [];

/**
 * Subscribe once to the small reference collections. `onChange(key)` is
 * called whenever one of them updates so the current page can re-render.
 */
function dbStartCache(onChange) {
  dbStopCache();
  _dbCacheUnsubs.push(dbGetUsers(function (u) { DB_CACHE.allUsers = u; if (typeof profileApplyMine === "function") profileApplyMine(); rebuildGroupCache(); onChange("users"); }));
  _dbCacheUnsubs.push(dbGetCourts(function (c) { DB_CACHE.allCourts = c; rebuildGroupCache(); if (typeof ensureGroupCourts === "function") ensureGroupCourts(); onChange("courts"); }));
  // Restaurants + reviews: a quiet error handler, so an app opened before the rules are published does not show the red bar
  var restErr = function (e) { console.warn("restaurants:", e && e.code); };
  _dbCacheUnsubs.push(fsdb.collection("restaurants").onSnapshot(function (snap) {
    DB_CACHE.restaurants = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
    onChange("restaurants");
  }, restErr));
  _dbCacheUnsubs.push(fsdb.collection("restaurantReviews").onSnapshot(function (snap) {
    DB_CACHE.reviews = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
    onChange("reviews");
  }, restErr));
  if (GROUPS_ON && !currentGroupId) return; // no group yet: nothing group-specific to load
  _dbCacheUnsubs.push(dbGetShuttlecocks(function (b) { DB_CACHE.shuttlecocks = b; onChange("shuttlecocks"); }));
  if (!GROUPS_ON) {
    _dbCacheUnsubs.push(dbGetQrCodes(function (q) { DB_CACHE.qrCodes = q; onChange("qrCodes"); }));
    _dbCacheUnsubs.push(fsdb.collection("settings").doc("app").onSnapshot(function (doc) {
      DB_CACHE.app = doc.exists ? doc.data() : {};
      onChange("app");
    }, function (e) { dbOnError(e, "settings"); }));
  }
}

function dbStopCache() {
  for (var i = 0; i < _dbCacheUnsubs.length; i++) {
    if (typeof _dbCacheUnsubs[i] === "function") _dbCacheUnsubs[i]();
  }
  _dbCacheUnsubs = [];
}

/** Any player by id: the current roster first, then everyone (other groups, public games) */
function findUser(uid) {
  return dbFindById(DB_CACHE.users, uid) || dbFindById(DB_CACHE.allUsers || [], uid);
}

/** Any court by id: the group's own courts (also by the directory court they
    were copied from — old sessions point there), then the public directory */
function findCourt(id) {
  if (!id) return null;
  var c = dbFindById(DB_CACHE.courts, id);
  if (c) return c;
  var gc = DB_CACHE.groupCourts || [];
  for (var i = 0; i < gc.length; i++) if (gc[i].sourceId === id) return gc[i];
  return dbFindById(DB_CACHE.allCourts || [], id);
}

function dbFindById(list, id) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

// ── Group settings (groups/{gid}; settings/app before groups) ──
// { minPlayers, defaultCourtPayer, defaultShuttlePayer }

function appSetting(key, fallback) {
  var src = GROUPS_ON ? currentGroup : DB_CACHE.app;
  var v = src ? src[key] : undefined;
  return v === undefined || v === null || v === "" ? fallback : v;
}

function dbSetAppSettings(data) {
  if (GROUPS_ON) return fsdb.collection("groups").doc(currentGroupId).update(data);
  return fsdb.collection("settings").doc("app").set(data, { merge: true });
}

// ── Personal payment QR codes (qrcodes/{uid}) ───────────────
// { court: dataUrl, shuttle: dataUrl, dinner: dataUrl } — kept out of the
// users collection so the roster stays small.

var QR_TYPES = ["court", "shuttle", "dinner"]; // optional extras per payment type
// qrcodes/{uid}.main is the person's one payment QR; a type QR overrides it.

/** The QR to show for paying `type` (court / shuttle / dinner) */
function qrFor(qr, type) {
  return (type && qr[type]) || qr.main || qr.court || qr.shuttle || qr.dinner || null;
}

/** Extras that differ from the main QR: [{ type, url }] */
function qrExtras(qr) {
  var main = qrFor(qr, null);
  return QR_TYPES.filter(function (k) { return qr[k] && qr[k] !== main; }).map(function (k) { return { type: k, url: qr[k] }; });
}
var _qrCache = {};

function dbGetUserQr(uid) {
  if (_qrCache[uid]) return Promise.resolve(_qrCache[uid]);
  return fsdb.collection("qrcodes").doc(uid).get().then(function (doc) {
    _qrCache[uid] = doc.exists ? doc.data() : {};
    return _qrCache[uid];
  }).catch(function () { return {}; });
}

function dbSetUserQr(uid, type, dataUrl) {
  var data = {};
  data[type] = dataUrl || null;
  delete _qrCache[uid];
  return fsdb.collection("qrcodes").doc(uid).set(data, { merge: true });
}
