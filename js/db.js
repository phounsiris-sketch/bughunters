/* ============================================================
   db.js — Firestore CRUD (COMPAT API)
   Uses global `fsdb` from firebase-config.js
   ============================================================ */

// Surface database errors (permission denied, offline, bad project) instead of failing silently
var _dbErrorShown = false;
function dbOnError(err) {
  console.error("Firestore error:", err);
  if (_dbErrorShown) return;
  _dbErrorShown = true;
  var msg = (err && err.code === "permission-denied")
    ? "Database blocked this request (permission-denied). Check Firestore rules and sign-in."
    : "Cannot connect to database: " + ((err && err.message) || err);
  var bar = document.createElement("div");
  bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 14px;background:#b91c1c;color:#fff;font-size:13px;text-align:center";
  bar.textContent = msg;
  if (typeof icon === "function") bar.insertAdjacentHTML("afterbegin", icon("warning", 14) + " ");
  bar.onclick = function () { bar.remove(); };
  document.body.appendChild(bar);
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
    }, dbOnError);
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

function dbGetShuttlecocks(callback) {
  return fsdb.collection("shuttlecocks")
    .orderBy("name")
    .onSnapshot(function (snap) {
      var brands = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        brands.push(d);
      });
      callback(brands);
    }, dbOnError);
}

function dbAddShuttlecock(data) {
  return fsdb.collection("shuttlecocks").add(data);
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
    }, dbOnError);
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
  return fsdb.collection("polls")
    .orderBy("createdAt", "desc")
    .onSnapshot(function (snap) {
      var polls = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        polls.push(d);
      });
      callback(polls);
    }, dbOnError);
}

function dbCreatePoll(data) {
  data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  return fsdb.collection("polls").add(data);
}

function dbUpdatePoll(id, data) {
  return fsdb.collection("polls").doc(id).update(data);
}

// ── Sessions ────────────────────────────────────────────────

function dbGetSessions(callback) {
  return fsdb.collection("sessions")
    .orderBy("createdAt", "desc")
    .onSnapshot(function (snap) {
      var sessions = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        d.id = doc.id;
        sessions.push(d);
      });
      callback(sessions);
    }, dbOnError);
}

function dbGetSession(id) {
  return fsdb.collection("sessions").doc(id).get()
    .then(function (doc) {
      if (doc.exists) {
        var d = doc.data();
        d.id = doc.id;
        return d;
      }
      return null;
    });
}

function dbCreateSession(data) {
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
    }, dbOnError);
}

function dbSetQrCodes(data) {
  return fsdb.collection("settings").doc("qrCodes")
    .set(data, { merge: true });
}

// ── Shared cache (one listener per collection for the whole app) ──

var DB_CACHE = { users: [], courts: [], shuttlecocks: [], qrCodes: null, app: {} };
var _dbCacheUnsubs = [];

/**
 * Subscribe once to the small reference collections. `onChange(key)` is
 * called whenever one of them updates so the current page can re-render.
 */
function dbStartCache(onChange) {
  dbStopCache();
  _dbCacheUnsubs.push(dbGetUsers(function (u) { DB_CACHE.users = u; onChange("users"); }));
  _dbCacheUnsubs.push(dbGetCourts(function (c) { DB_CACHE.courts = c; onChange("courts"); }));
  _dbCacheUnsubs.push(dbGetShuttlecocks(function (b) { DB_CACHE.shuttlecocks = b; onChange("shuttlecocks"); }));
  _dbCacheUnsubs.push(dbGetQrCodes(function (q) { DB_CACHE.qrCodes = q; onChange("qrCodes"); }));
  _dbCacheUnsubs.push(fsdb.collection("settings").doc("app").onSnapshot(function (doc) {
    DB_CACHE.app = doc.exists ? doc.data() : {};
    onChange("app");
  }, dbOnError));
}

function dbStopCache() {
  for (var i = 0; i < _dbCacheUnsubs.length; i++) {
    if (typeof _dbCacheUnsubs[i] === "function") _dbCacheUnsubs[i]();
  }
  _dbCacheUnsubs = [];
}

function dbFindById(list, id) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

// ── Group settings (settings/app) ───────────────────────────
// { minPlayers, defaultCourtPayer, defaultShuttlePayer }

function appSetting(key, fallback) {
  var v = DB_CACHE.app ? DB_CACHE.app[key] : undefined;
  return v === undefined || v === null || v === "" ? fallback : v;
}

function dbSetAppSettings(data) {
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
