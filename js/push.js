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
  return _enablePushRun();
}
function _enablePushRun() {
  _pushLog = [];
  var el = document.getElementById("pushLog");
  if (el) el.style.display = "block";
  _plog(true, "Device: " + (_isIos() ? "iPhone/iPad" : "other") + (_isStandalone() ? ", home-screen app" : ", browser tab"));
  if (!pushSupported()) { _plog(false, "Push not supported in this browser"); return Promise.resolve(); }
  _plog(true, "Push supported");

  return Notification.requestPermission().then(function (perm) {
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
    try { localStorage.setItem("pushOn_" + currentUser.uid, "1"); localStorage.setItem("pushToken_" + currentUser.uid, token); } catch (e) {}
    showToast(t("pushOn") + " ✔");
    setTimeout(renderSettings, 1500);
    pbRefresh();
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
    try { localStorage.removeItem("pushOn_" + currentUser.uid); localStorage.removeItem("pushToken_" + currentUser.uid); } catch (e) {}
    renderSettings();
    pbRefresh();
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
      '<button type="button" class="tgl' + (on ? ' on' : '') + '" role="switch" aria-checked="' + on + '" aria-label="' + t("pushTitle") + '" onclick="' + (on ? 'disablePush()' : 'enablePush()') + '"><i></i></button></div>';
    if (on) html += '<div class="nav-row push-test"><span class="nav-row-ico">' + icon("bell", 20) + '</span>' +
      '<span class="nav-row-text"><b>' + t("pushLocalTest") + '</b><small id="pushLocalResult">' + t("pushHintShort") + '</small></span>' +
      '<button type="button" class="btn-primary" onclick="localTestPush()">' + icon("check", 16) + ' ' + t("pushTestBtn") + '</button></div>';
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

/* ---------- v274: push bell (this phone's state) + notification log ----------
   The header button next to the in-app bell shows On / Off / Blocked / Not supported; tap = a sheet with the
   explanation, the action and the log. The log is userPrivate/{uid}/pushLog (written by push/send.js,
   read here once per open: orderBy at desc, limit 20, no live listener). */

/** "on" | "off" | "blocked" | "unsupported" (iOS outside the Home Screen counts as unsupported, with its own hint) */
function pbState() {
  var st = pushState();
  return st === "needsHomeScreen" ? "unsupported" : st;
}

function pbSeenKey() { return "pushLogSeen_" + (currentUser ? currentUser.uid : ""); }
function pbSeen() { try { return parseInt(localStorage.getItem(pbSeenKey()), 10) || 0; } catch (e) { return 0; } }
function pbMarkSeen(ms) { try { localStorage.setItem(pbSeenKey(), String(ms || Date.now())); } catch (e) {} }

var _pbLatest = 0, _pbLatestUid = "";
/** Redraws the header button (cheap, local). First call per sign-in also reads the newest log entry (1 read) for the dot. */
function pbRefresh() {
  var btn = document.getElementById("pushBell");
  if (!btn || !currentUser) return;
  var st = pbState();
  btn.setAttribute("data-st", st);
  btn.setAttribute("aria-label", t("pbLabel") + ": " + t("pbSt_" + st));
  btn.title = t("pbLabel") + ": " + t("pbSt_" + st);
  var dot = document.getElementById("pushBellNew");
  if (dot) dot.style.display = _pbLatest > pbSeen() ? "" : "none";
  if (_pbLatestUid !== currentUser.uid && typeof fsdb !== "undefined") {
    _pbLatestUid = currentUser.uid;
    fsdb.collection("userPrivate").doc(currentUser.uid).collection("pushLog").orderBy("at", "desc").limit(1).get().then(function (snap) {
      if (!snap.empty) { _pbLatest = pbAtMs(snap.docs[0].data().at); pbRefresh(); }
    }).catch(function () {});
  }
}

function pbAtMs(x) { return x && typeof x.toMillis === "function" ? x.toMillis() : typeof x === "number" ? x : 0; }

function pbClose() {
  var el = document.getElementById("pushSheet");
  if (!el) return;
  document.removeEventListener("keydown", pbKey, true);
  el.classList.add("out"); el.style.pointerEvents = "none";
  setTimeout(function () { el.remove(); }, 160);
}
function pbKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); pbClose(); } }

/** Opens (or redraws) the sheet. note = a one-line result shown under the text (e.g. turning on failed) */
function pbOpen(note) {
  var st = pbState(), old = document.getElementById("pushSheet");
  var text = t("pbText_" + st), extra = "", acts = "";
  if (st === "unsupported" && pushState() === "needsHomeScreen") text = t("pushIos");
  if (st === "blocked") extra = '<ul class="pb-how"><li>' + t("pbHowAndroid") + '</li><li>' + t("pbHowSamsung") + '</li><li>' + t("pbHowIos") + '</li></ul>';
  if (st === "off") acts = '<button type="button" class="btn-primary" onclick="pbTurnOn()">' + t("pbTurnOn") + '</button>';
  if (st === "on") acts = '<button type="button" class="ask-no" onclick="pbTurnOff()">' + t("pbTurnOff") + '</button>';
  if (st === "blocked") acts = '<button type="button" class="btn-primary" onclick="pbOpen()">' + t("pbCheckAgain") + '</button>';
  var html = '<div class="sheet pb-sheet" role="dialog" aria-modal="true" aria-labelledby="pbT"><div class="sheet-grab"></div>' +
    '<div class="sheet-title" id="pbT"><span class="pb-st" data-st="' + st + '"></span> ' + t("pbLabel") + ': ' + t("pbSt_" + st) + '</div>' +
    '<div class="sheet-body">' + text + '</div>' + extra +
    (note ? '<div class="pb-note" role="status">' + escapeHtml(note) + '</div>' : '') +
    '<div class="ask-btns">' + acts + '<button type="button" class="ask-no" onclick="pbLogOpen()">' + icon("bell", 16) + ' ' + t("pbLogLink") + '</button>' +
    '<button type="button" class="ask-no" onclick="pbClose()">' + t("close") + '</button></div></div>';
  if (old) { old.innerHTML = html; return; }
  var el = document.createElement("div");
  el.id = "pushSheet"; el.className = "sheet-wrap"; el.innerHTML = html;
  el.onclick = function (e) { if (e.target === el) pbClose(); };
  document.addEventListener("keydown", pbKey, true);
  document.body.appendChild(el);
  var f = el.querySelector("button"); if (f) f.focus();
}

function pbTurnOn() {
  // the permission prompt must start from this tap, so enablePush runs right here
  var p = enablePush();
  Promise.resolve(p).then(function () {
    pbRefresh();
    pbOpen(pbState() === "on" ? "" : t("pbFail"));
  });
}
function pbTurnOff() { disablePush(); setTimeout(function () { pbOpen(); }, 400); }

/** kind -> icon name (all existing icons) */
var PB_KIND_ICON = { poll: "polls", session: "sessions", payment: "wallet", game: "calendar", invite: "users", group: "users", other: "bell" };

function pbDayKey(ms) { var d = new Date(ms); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function pbDayLabel(key) {
  var now = Date.now();
  if (key === pbDayKey(now)) return t("today");
  if (key === pbDayKey(now - 86400e3)) return t("pbYesterday");
  return fmtDate(key);
}
function pbTime(ms) { var d = new Date(ms); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

/** Log rows [{at(ms), kind, title, body, link, ok, err}] (newest first) -> HTML grouped by day. Every text is escaped. */
function pbLogHtml(items) {
  if (!items.length) return '<div class="pb-empty">' + t("pbLogEmpty") + '</div>';
  var html = "", day = "";
  items.forEach(function (it, i) {
    var k = pbDayKey(it.at);
    if (k !== day) { day = k; html += '<div class="pb-day">' + escapeHtml(pbDayLabel(k)) + '</div>'; }
    var go = /^#[\w=-]{1,100}$/.test(it.link || "");
    html += '<' + (go ? 'button type="button" onclick="pbLogGo(' + i + ')"' : 'div') + ' class="pb-item' + (it.ok ? '' : ' bad') + '">' +
      '<span class="pb-ico">' + icon(PB_KIND_ICON[it.kind] || "bell", 18) + '</span>' +
      '<span class="pb-txt"><b>' + escapeHtml(it.title) + '</b><span>' + escapeHtml(it.body) + '</span>' +
      '<small>' + pbTime(it.at) + ' · ' + (it.ok ? t("pbDelivered") : t("pbNotDelivered")) + '</small></span></' + (go ? 'button' : 'div') + '>';
  });
  return html;
}

var _pbItems = [];
/** The log sheet: one get() of the newest 20 (about 20 reads) */
function pbLogOpen() {
  var body = '<div class="pb-empty">' + t("loading") + '</div>';
  var el = document.getElementById("pushSheet");
  var shell = function (inner) {
    return '<div class="sheet pb-sheet" role="dialog" aria-modal="true" aria-labelledby="pbT"><div class="sheet-grab"></div>' +
      '<div class="sheet-title" id="pbT">' + t("pbLogLink") + '</div><div class="sheet-body">' + t("pbLogHint") + '</div>' +
      '<div class="pb-list">' + inner + '</div>' +
      '<div class="ask-btns"><button type="button" class="ask-no" onclick="pbOpen()">' + t("back") + '</button>' +
      '<button type="button" class="ask-no" onclick="pbClose()">' + t("close") + '</button></div></div>';
  };
  if (!el) { pbOpen(); el = document.getElementById("pushSheet"); }
  el.innerHTML = shell(body);
  var uid = currentUser.uid;
  fsdb.collection("userPrivate").doc(uid).collection("pushLog").orderBy("at", "desc").limit(20).get().then(function (snap) {
    var box = document.getElementById("pushSheet"); if (!box || !currentUser || currentUser.uid !== uid) return;
    _pbItems = snap.docs.map(function (d) {
      var x = d.data();
      return { at: pbAtMs(x.at) || Date.now(), kind: x.kind || "other", title: x.title || "", body: x.body || "", link: x.link || "", ok: x.ok !== false, err: x.err || "" };
    });
    if (_pbItems.length) { _pbLatest = Math.max(_pbLatest, _pbItems[0].at); pbMarkSeen(_pbItems[0].at); pbRefresh(); }
    box.innerHTML = shell(pbLogHtml(_pbItems));
  }).catch(function () {
    var box = document.getElementById("pushSheet"); if (!box) return;
    box.innerHTML = shell('<div class="pb-empty pb-err" role="alert">' + t("pbLogErr") + '<br><button type="button" class="btn-primary" onclick="pbLogOpen()">' + t("pbRetry") + '</button></div>');
  });
}

function pbLogGo(i) {
  var it = _pbItems[i]; if (!it || !/^#[\w=-]{1,100}$/.test(it.link || "")) return;
  pbClose();
  if (location.hash === it.link) openFromHash(); else location.hash = it.link;   // hashchange -> openFromHash
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
