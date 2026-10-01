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
  bar.textContent = "\u26A0 " + msg;
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

// ── Dinner (sub-collection) ─────────────────────────────────

function dbSetDinner(sessionId, data) {
  return fsdb.collection("sessions").doc(sessionId)
    .collection("dinner").doc("info")
    .set(data);
}

function dbGetDinner(sessionId, callback) {
  return fsdb.collection("sessions").doc(sessionId)
    .collection("dinner").doc("info")
    .onSnapshot(function (doc) {
      if (doc.exists) {
        var d = doc.data();
        d.id = doc.id;
        callback(d);
      } else {
        callback(null);
      }
    }, dbOnError);
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
