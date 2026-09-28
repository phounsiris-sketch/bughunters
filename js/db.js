/* ============================================================
   db.js — Firestore CRUD (COMPAT API)
   Uses global `fsdb` from firebase-config.js
   ============================================================ */

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
    });
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
    });
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
    });
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
    });
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
    });
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
    });
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
    });
}

function dbSetQrCodes(data) {
  return fsdb.collection("settings").doc("qrCodes")
    .set(data, { merge: true });
}
