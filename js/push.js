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

var _pushLog = [];
function _plog(ok, msg) {
  _pushLog.push((ok ? "✔ " : "✖ ") + msg);
  var el = document.getElementById("pushLog");
  if (el) el.textContent = _pushLog.join("\n");
}

function enablePush() {
  _pushLog = [];
  var el = document.getElementById("pushLog");
  if (el) el.style.display = "block";
  _plog(true, "Device: " + (_isIos() ? "iPhone/iPad" : "other") + (_isStandalone() ? ", home-screen app" : ", browser tab"));
  if (!pushSupported()) { _plog(false, "Push not supported in this browser"); return; }
  _plog(true, "Push supported");

  Notification.requestPermission().then(function (perm) {
    _plog(perm === "granted", "Permission: " + perm);
    if (perm !== "granted") throw { code: "permission-" + perm, message: t("pushBlocked") };
    return navigator.serviceWorker.ready;
  }).then(function (reg) {
    _plog(true, "Service worker ready (" + reg.scope + ")");
    return firebase.messaging().getToken({ vapidKey: PUSH_VAPID_KEY, serviceWorkerRegistration: reg });
  }).then(function (token) {
    if (!token) throw { code: "no-token", message: "Firebase returned no token" };
    _plog(true, "Got device token");
    var data = { lang: currentLang, updatedAt: Date.now(), tokens: {} };
    data.tokens[token] = { at: Date.now(), ua: navigator.userAgent.slice(0, 120) };
    return fsdb.collection("pushTokens").doc(currentUser.uid).set(data, { merge: true }).then(function () { return token; });
  }).then(function (token) {
    _plog(true, "Saved to Firestore (pushTokens)");
    localStorage.setItem("pushOn_" + currentUser.uid, "1");
    localStorage.setItem("pushToken_" + currentUser.uid, token);
    showToast(t("pushOn") + " ✔");
    setTimeout(renderSettings, 1500);
  }).catch(function (error) {
    _plog(false, "Error: " + ((error && error.code) || "") + " — " + ((error && error.message) || error));
  });
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

/** Settings → Notifications card */
/** Notification rows for Settings (icon, title, one short line, a switch) */
function pushSettingsRows() {
  if (!PUSH_VAPID_KEY) return "";
  var st = pushState(), html = "";
  if (st === "on" || st === "off") {
    var on = st === "on";
    html += '<div class="nav-row"><span class="nav-row-ico">' + icon("bell", 20) + '</span>' +
      '<span class="nav-row-text"><b>' + t("pushTitle") + '</b><small>' + t(on ? "pushOn" : "pushHintShort") + '</small></span>' +
      '<button type="button" class="sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + on + '" aria-label="' + t("pushTitle") + '" onclick="' + (on ? 'disablePush()' : 'enablePush()') + '"><i></i></button></div>';
    if (on) html += '<button type="button" class="nav-row" onclick="localTestPush()"><span class="nav-row-ico">' + icon("check", 20) + '</span>' +
      '<span class="nav-row-text"><b>' + t("pushLocalTest") + '</b><small id="pushLocalResult">' + t("pushHintShort") + '</small></span>' + icon("chevron", 16) + '</button>';
    else html += '<pre id="pushLog" class="push-log" style="display:none"></pre>';
  } else {
    html += '<div class="nav-row"><span class="nav-row-ico">' + icon("warning", 20) + '</span><span class="nav-row-text"><b>' + t("pushTitle") + '</b><small>' +
      t(st === "blocked" ? "pushBlocked" : st === "needsHomeScreen" ? "pushIos" : "pushUnsupported") + '</small></span></div>';
  }
  return html;
}

function pushSettingsCard() {
  var rows = pushSettingsRows();
  return rows ? '<div class="card nav-rows">' + rows + '</div>' : "";
}

/** Shows a notification straight from this phone (no server) to test banners. */
function localTestPush() {
  var out = document.getElementById("pushLocalResult");
  navigator.serviceWorker.ready.then(function (reg) {
    return reg.showNotification(t("pushLocalTitle"), { body: t("pushLocalBody"), tag: "local-test", data: { link: "./" } });
  }).then(function () { if (out) out.textContent = t("pushLocalSent"); })
    .catch(function (e) { if (out) out.textContent = "\u2716 " + ((e && e.message) || e); });
}

/** Links in pushes: #session=ID, #polls, #payments */
function openFromHash() {
  var h = location.hash || "";
  if (!h || !currentUser) return;
  if (/^#join=/.test(h)) return; // invite links: groups.js
  history.replaceState(history.state, "", location.pathname);
  var m = h.match(/^#session=([\w-]+)/);
  var g = h.match(/^#group=([\w-]+)/);
  if (m) showSessionDetail(m[1]);
  else if (g && typeof switchGroup === "function" && myMemberships[g[1]]) switchGroup(g[1]);
  else if (h === "#polls") showPage("polls");
  else if (h === "#payments") showPage("payments");
  else if (h === "#public") showPage("public");
  else if (h === "#buddies") { publicTab = "buddies"; showPage("public"); }
  else if (h === "#settings") showPage(GROUPS_ON && currentGroupId ? "group-members" : "settings");
}
window.addEventListener("hashchange", openFromHash);

// The service worker (sw.js) shows every push itself, app open or closed.
