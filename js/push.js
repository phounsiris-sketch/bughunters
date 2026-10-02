/* ============================================================
   push.js — Web push (Firebase Cloud Messaging), app side.
   Saves this device's push token to pushTokens/{uid}; a scheduled
   GitHub Action (push/send.js) reads new events and sends the pushes.
   ============================================================ */

function pushSupported() {
  return !!(PUSH_VAPID_KEY && "Notification" in window && "serviceWorker" in navigator &&
    typeof firebase.messaging === "function" && firebase.messaging.isSupported && firebase.messaging.isSupported());
}

function _isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function _isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

/** "on" | "off" | "blocked" | "unsupported" | "needsHomeScreen" */
function pushState() {
  if (_isIos() && !_isStandalone()) return "needsHomeScreen";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try { return localStorage.getItem("pushOn_" + currentUser.uid) === "1" && Notification.permission === "granted" ? "on" : "off"; }
  catch (e) { return "off"; }
}

function enablePush() {
  if (!pushSupported()) { showToast(t("pushUnsupported")); return; }
  Notification.requestPermission().then(function (perm) {
    if (perm !== "granted") { showToast(t("pushBlocked")); renderSettings(); return; }
    return navigator.serviceWorker.ready.then(function (reg) {
      return firebase.messaging().getToken({ vapidKey: PUSH_VAPID_KEY, serviceWorkerRegistration: reg });
    }).then(function (token) {
      if (!token) throw new Error("No token");
      var data = { lang: currentLang, updatedAt: Date.now(), tokens: {} };
      data.tokens[token] = { at: Date.now(), ua: navigator.userAgent.slice(0, 120) };
      return fsdb.collection("pushTokens").doc(currentUser.uid).set(data, { merge: true }).then(function () {
        localStorage.setItem("pushOn_" + currentUser.uid, "1");
        localStorage.setItem("pushToken_" + currentUser.uid, token);
        showToast(t("pushOn") + " ✔");
        renderSettings();
      });
    });
  }).catch(function (error) { showToast(_permError(error)); });
}

function disablePush() {
  var token = null;
  try { token = localStorage.getItem("pushToken_" + currentUser.uid); } catch (e) {}
  var update = {};
  if (token) update["tokens." + token] = firebase.firestore.FieldValue.delete();
  var job = token ? fsdb.collection("pushTokens").doc(currentUser.uid).update(update).catch(function () {}) : Promise.resolve();
  job.then(function () {
    try { return firebase.messaging().deleteToken(); } catch (e) { return null; }
  }).catch(function () {}).then(function () {
    localStorage.removeItem("pushOn_" + currentUser.uid);
    localStorage.removeItem("pushToken_" + currentUser.uid);
    renderSettings();
  });
}

/** Settings → Profile card */
function pushSettingsCard() {
  if (!PUSH_VAPID_KEY) return "";
  var st = pushState();
  var html = '<div class="card"><div class="card-title">' + icon("bell", 14) + ' ' + t("pushTitle") + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' + t("pushHint") + '</div>';
  if (st === "on") {
    html += '<div class="settings-item"><div class="settings-label" style="color:var(--accent)">✔ ' + t("pushOn") + '</div>' +
      '<button class="edit-btn" onclick="disablePush()">' + t("pushTurnOff") + '</button></div>';
  } else if (st === "off") {
    html += '<button class="btn-primary" onclick="enablePush()">' + icon("bell", 16) + ' ' + t("pushTurnOn") + '</button>';
  } else {
    html += '<div class="perm-note">' + t(st === "blocked" ? "pushBlocked" : st === "needsHomeScreen" ? "pushIos" : "pushUnsupported") + '</div>';
  }
  return html + '</div>';
}

/** Links in pushes: #session=ID, #polls, #payments */
function openFromHash() {
  var h = location.hash || "";
  if (!h || !currentUser) return;
  history.replaceState(null, "", location.pathname);
  var m = h.match(/^#session=([\w-]+)/);
  if (m) showSessionDetail(m[1]);
  else if (h === "#polls") showPage("polls");
  else if (h === "#payments") showPage("payments");
}
window.addEventListener("hashchange", openFromHash);

// Keep showing pushes while the app is open (FCM only auto-shows in background)
try {
  if (pushSupported()) {
    firebase.messaging().onMessage(function (payload) {
      var n = payload.notification || {};
      showToast((n.title ? n.title + " — " : "") + (n.body || ""));
      if (typeof updateNotifications === "function") updateNotifications();
    });
  }
} catch (e) {}
