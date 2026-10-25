/* ============================================================
   auth.js — Email + password authentication with email verification
   Firebase Auth COMPAT SDK (global `firebase` object)
   Depends on: firebase-config.js (auth, fsdb),
               app.js (showAppPage, showAuthPage, showToast, initApp)
   ============================================================ */

var currentUser = null;
var currentUserProfile = null;

var actionCodeSettings = {
  url: window.location.origin + window.location.pathname,
  handleCodeInApp: true
};

/** Show / hide the password while typing it */
function togglePw() {
  var i = document.getElementById("loginPassword"), b = document.getElementById("pwToggle");
  if (!i) return;
  var show = i.type === "password";
  i.type = show ? "text" : "password";
  if (b) { b.setAttribute("data-i18n", show ? "hidePw" : "showPw"); b.textContent = t(show ? "hidePw" : "showPw"); }
}

/* ---------- Login / Register mode ---------- */
var authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  var reg = document.getElementById("registerFields");
  if (reg) reg.style.display = mode === "register" ? "" : "none";
  var confirmPw = document.getElementById("regPasswordConfirmGroup");
  if (confirmPw) confirmPw.style.display = mode === "register" ? "" : "none";
  var forgot = document.getElementById("forgotPwLink");
  if (forgot) forgot.style.display = mode === "login" ? "" : "none";
  var tl = document.getElementById("authTabLogin");
  var tr = document.getElementById("authTabRegister");
  if (tl) tl.classList.toggle("active", mode === "login");
  if (tr) tr.classList.toggle("active", mode === "register");
  var btn = document.getElementById("authSubmitBtn");
  if (btn) btn.textContent = t(mode === "register" ? "createAccount" : "signIn");
  var pw = document.getElementById("loginPassword");
  if (pw) pw.setAttribute("autocomplete", mode === "register" ? "new-password" : "current-password");
}

/** Firebase error code → message in the user's language */
function authErrorMessage(error) {
  var map = {
    "auth/invalid-email": "errInvalidEmail",
    "auth/missing-password": "errPasswordShort",
    "auth/weak-password": "errPasswordShort",
    "auth/email-already-in-use": "errEmailInUse",
    "auth/invalid-credential": "errWrongLogin",
    "auth/invalid-login-credentials": "errWrongLogin",
    "auth/wrong-password": "errWrongLogin",
    "auth/user-not-found": "errWrongLogin",
    "auth/too-many-requests": "errTooMany",
    "auth/network-request-failed": "errNetwork",
    "auth/operation-not-allowed": "errPasswordDisabled"
  };
  return map[error && error.code] ? t(map[error.code]) : ((error && error.message) || String(error));
}

/* ---------- Sign in / Register with email + password ---------- */
function submitAuth() {
  var email = (document.getElementById("loginEmail").value || "").trim();
  var password = document.getElementById("loginPassword").value || "";
  if (!email) { showToast(t("enterEmail")); return; }
  if (password.length < 6) { showToast(t("errPasswordShort")); return; }

  var btn = document.getElementById("authSubmitBtn");
  if (btn) btn.disabled = true;
  var done = function () { if (btn) btn.disabled = false; };

  if (authMode === "login") {
    auth.signInWithEmailAndPassword(email, password)
      .then(done)
      .catch(function (error) { done(); showToast(authErrorMessage(error)); });
    return;
  }

  // Register
  var name = (document.getElementById("regName").value || "").trim();
  var ph = readPhone("regPhone");
  if (!ph.ok) { done(); showToast(t("phoneInvalid")); return; }
  var phone = ph.value;
  var password2 = document.getElementById("regPasswordConfirm").value || "";
  if (!name) { done(); showToast(t("displayName")); return; }
  if (password !== password2) { done(); showToast(t("errPasswordMismatch")); return; }

  // Remember the name until the profile document is written
  try { localStorage.setItem("pendingProfile", JSON.stringify({ email: email.toLowerCase(), name: name, phone: phone || null })); } catch (e) {}

  auth.createUserWithEmailAndPassword(email, password)
    .then(function (cred) {
      done();
      return cred.user.sendEmailVerification(actionCodeSettings);
    })
    .catch(function (error) { done(); showToast(authErrorMessage(error)); });
}

/* ---------- Spam guard: one e-mail request per minute ---------- */
var MAIL_COOLDOWN_S = 60;
function _mailWait(kind) {
  var at = 0;
  try { at = parseInt(localStorage.getItem("godsmash_mail_" + kind), 10) || 0; } catch (e) {}
  return Math.max(0, Math.ceil((at + MAIL_COOLDOWN_S * 1000 - Date.now()) / 1000));
}
function _mailMark(kind) { try { localStorage.setItem("godsmash_mail_" + kind, String(Date.now())); } catch (e) {} }
/** Count down on a button (or link) so people see why it is off */
function _mailCountdown(el, kind, label) {
  if (!el) return;
  if (el._cd) clearInterval(el._cd);
  var tick = function () {
    var left = _mailWait(kind);
    if (left <= 0) { el.disabled = false; el.classList.remove("cooling"); el.textContent = label; if (el._cd) clearInterval(el._cd); el._cd = null; return; }
    el.disabled = true; el.classList.add("cooling"); el.textContent = label + " (" + left + "s)";
  };
  tick();
  if (_mailWait(kind) > 0) el._cd = setInterval(tick, 1000);
}

function sendPasswordReset() {
  var wait = _mailWait("reset");
  if (wait > 0) { showToast(t("mailWait").replace("{n}", wait)); return; }
  var email = (document.getElementById("loginEmail").value || "").trim();
  if (!email) { showToast(t("enterEmailFirst")); document.getElementById("loginEmail").focus(); return; }
  _mailMark("reset");                                   // count from the press, so errors can not be spammed either
  _mailCountdown(document.getElementById("forgotPwLink"), "reset", t("forgotPassword"));
  auth.sendPasswordResetEmail(email, actionCodeSettings)
    .then(function () { showToast(t("resetSent")); })
    .catch(function (error) { showToast(authErrorMessage(error)); });
}

/* ---------- "Check your email" screen for unverified accounts ---------- */
function _showVerifyScreen(user) {
  _resetAuthScreens();
  document.getElementById("login-page").style.display = "none";
  document.getElementById("verify-page").style.display = "";
  document.getElementById("verifyEmail").textContent = user.email || "";
  _mailCountdown(document.querySelector('#verify-page [onclick="resendVerification()"]'), "verify", t("resendEmail"));
  showAuthPage();
}

function resendVerification() {
  if (!auth.currentUser) return;
  var wait = _mailWait("verify");
  if (wait > 0) { showToast(t("mailWait").replace("{n}", wait)); return; }
  _mailMark("verify");
  _mailCountdown(document.querySelector('#verify-page [onclick="resendVerification()"]'), "verify", t("resendEmail"));
  auth.currentUser.sendEmailVerification(actionCodeSettings)
    .then(function () { showToast(t("verificationSent")); })
    .catch(function (error) { showToast(authErrorMessage(error)); });
}

function checkVerified() {
  var user = auth.currentUser;
  if (!user) return;
  user.reload().then(function () {
    if (auth.currentUser.emailVerified) _afterSignIn(auth.currentUser);
    else showToast(t("notVerifiedYet"));
  }).catch(function (error) { showToast(authErrorMessage(error)); });
}

/* ---------- Handle incoming email link ---------- */
function handleEmailLinkSignIn() {
  if (!auth.isSignInWithEmailLink(window.location.href)) return;

  var email = null;
  try { email = localStorage.getItem("emailForSignIn"); } catch (e) {}
  var finish = function (addr) {
    if (!addr) return;
    auth.signInWithEmailLink(addr, window.location.href)
      .then(function () {
        try { localStorage.removeItem("emailForSignIn"); } catch (e) {}
        history.replaceState(null, "", window.location.pathname);
      })
      .catch(function (error) {
        history.replaceState(null, "", window.location.pathname);
        showToast(error.code === "auth/invalid-action-code" ? t("linkExpired") : error.message);
      });
  };
  if (email) finish(email);
  else askConfirm({ title: t("confirmEmailPrompt"), kind: "ask", input: t("emailLabel"), inputType: "email", yes: t("confirm") }, finish);   // our own sheet, never window.prompt
}

/* ---------- Save profile (first-time) ---------- */
function saveProfile() {
  var nameInput = document.getElementById("profileName");
  var phoneInput = document.getElementById("profilePhone");
  var displayName = nameInput ? nameInput.value.trim() : "";
  var ph = readPhone("profilePhone");
  if (!ph.ok) { showToast(t("phoneInvalid")); return; }
  var phone = ph.value;

  if (!displayName) {
    showToast(t("displayName"));
    return;
  }

  fsdb.collection("users").doc(currentUser.uid).set({
    email: currentUser.email,
    displayName: displayName,
    phone: phone || null,
    avatarUrl: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })
    .then(function () {
      currentUserProfile = {
        email: currentUser.email,
        displayName: displayName,
        phone: phone || null,
        avatarUrl: null
      };
      if (typeof subMarkNeeded === "function") subMarkNeeded(currentUser.uid);   // new account: subscription step first
      _enterApp();
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

/* ---------- Create profile from the Register form (after email confirmed) ---------- */
function _createProfileFromPending(user, saveOnly) {
  var pending = null;
  try { pending = JSON.parse(localStorage.getItem("pendingProfile") || "null"); } catch (e) {}
  if (!pending || !pending.name || !user.email || pending.email !== user.email.toLowerCase()) return false;

  var profile = { email: user.email, displayName: pending.name, phone: pending.phone || null, avatarUrl: null };
  fsdb.collection("users").doc(user.uid).set(Object.assign({}, profile, {
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }))
    .then(function () {
      try { localStorage.removeItem("pendingProfile"); } catch (e) {}
      currentUserProfile = profile;
      if (typeof subMarkNeeded === "function") subMarkNeeded(user.uid);   // new account: subscription step first
      if (!saveOnly) _enterApp();
    })
    .catch(function (error) { showToast(error.message); });
  return true;
}

/* ---------- Enter the app once the profile exists ---------- */
function _enterApp() {
  // A new account pays (demo) before the app opens
  if (typeof subGate === "function" && subGate()) return;
  // Find my groups first (before the migration the app runs as one group)
  loadGroupContext().then(function () {
    try { _enterAppBody(); } catch (e) { _authFail("enter", e); }
  }).catch(function (e) { _authFail("groups", e); });
}

/** Never fail silently: say where it stopped (login looked dead on iPad) */
function _authFail(step, e) {
  try { console.error("[godsmash] sign-in stopped at " + step, e); } catch (x) {}
  var msg = (e && (e.message || e.code)) || String(e);
  showToast("Sign-in stopped (" + step + "): " + msg);
  try { showAuthPage(); } catch (x) {}
}

function _enterAppBody() {
  {
    if (!GROUPS_ON) seedFirestoreData();
    startGroupListeners();
    initApp();       // starts the shared data cache
    showAppPage();   // navigates to the dashboard
    updateHeaderGroup();
    if (GROUPS_ON && !currentGroupId) showPage("groups");
    else { loadSessions(); if (GROUPS_ON) loadMatches(); }
    if (GROUPS_ON) startInviteListeners();  // sessions feed badges, notifications and My payments
    if (GROUPS_ON && joinFromHash()) return; // invite link
    if (typeof openFromHash === "function") setTimeout(openFromHash, 400); // link from a push
  }
}

/* ---------- Show the sign-in form (not the profile form) ---------- */
function _resetAuthScreens() {
  var login = document.getElementById("login-page");
  var profile = document.getElementById("profile-page");
  var verify = document.getElementById("verify-page");
  var sub = document.getElementById("sub-page");
  if (sub) sub.style.display = "none";
  if (login) login.style.display = "";
  if (profile) profile.style.display = "none";
  if (verify) verify.style.display = "none";
  // Back to a clean "Sign in" form
  ["loginPassword", "regPasswordConfirm"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.value = ""; if (id === "loginPassword") el.type = "password"; }
  });
  setAuthMode("login");
  _mailCountdown(document.getElementById("forgotPwLink"), "reset", t("forgotPassword"));   // a countdown still running after a reload
}

/* ---------- Logout ---------- */
function logoutUser() {
  if (typeof stopGroupListeners === "function") stopGroupListeners();
  GROUPS_ON = false; currentGroupId = null; currentGroup = null;
  if (typeof stopPolls === "function") stopPolls();
  if (typeof stopSessions === "function") stopSessions();
  if (typeof liveWatchStop === "function") liveWatchStop();
  if (typeof stopMatches === "function") stopMatches();
  if (typeof stopInviteListeners === "function") stopInviteListeners();
  if (typeof dbStopCache === "function") dbStopCache();
  currentUser = null;
  currentUserProfile = null;
  if (typeof _myPrivate !== "undefined") _myPrivate = null;   // the next user must not see this user's health details / birthday
  if (typeof _hwMemo !== "undefined") _hwMemo = { m: null, s: null, p: null, list: [] };
  pageHistory = [];
  _resetAuthScreens();
  showAuthPage();
  try { auth.signOut(); } catch(e) {}
}

/* ---------- Default courts / shuttlecocks (seeded once if empty) ---------- */

var DEFAULT_COURTS = [
  { name: 'Joung Court', location: 'Vientiane', pricePerHour: 200000 },
  { name: 'Bob Court', location: 'Vientiane', pricePerHour: 150000 }
];

var DEFAULT_SHUTTLECOCKS = [
  { name: 'RSL', pricePerTube: 120000, cocksPerTube: 12 },
  { name: 'Yonex', pricePerTube: 150000, cocksPerTube: 12 }
];

// Real prices are at least tens of thousands of kip; anything below this was
// entered by the old version in thousands (K)
var LEGACY_K_LIMIT = 5000;

function seedFirestoreData() {
  // Seed courts; convert prices saved in thousands ("200" = 200,000 ₭) to full LAK
  fsdb.collection('courts').get().then(function(snap) {
    if (snap.empty) {
      DEFAULT_COURTS.forEach(function(c) {
        fsdb.collection('courts').add(c).catch(function() {});
      });
    }
    snap.forEach(function(doc) {
      var p = doc.data().pricePerHour;
      if (p > 0 && p < LEGACY_K_LIMIT) doc.ref.update({ pricePerHour: p * 1000 }).catch(function() {});
    });
  }).catch(function() {});

  // Seed shuttlecocks (same conversion)
  fsdb.collection('shuttlecocks').get().then(function(snap) {
    if (snap.empty) {
      DEFAULT_SHUTTLECOCKS.forEach(function(s) {
        fsdb.collection('shuttlecocks').add(s).catch(function() {});
      });
    }
    snap.forEach(function(doc) {
      var p = doc.data().pricePerTube;
      if (p > 0 && p < LEGACY_K_LIMIT) doc.ref.update({ pricePerTube: p * 1000 }).catch(function() {});
    });
  }).catch(function() {});
}

/* ---------- Initialise auth listener ---------- */
function initAuth() {
  handleEmailLinkSignIn(); // links sent by the earlier passwordless version

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      currentUser = null;
      currentUserProfile = null;
      _resetAuthScreens();
      showAuthPage();
      return;
    }
    if (!user.emailVerified) {
      // Write the profile now so the name isn't lost, then wait for the email
      _createProfileFromPending(user, true);
      _showVerifyScreen(user);
      return;
    }
    _afterSignIn(user);
  });
}

function _afterSignIn(user) {
  currentUser = user;
  // Watchdog: if nothing opened after 12 s, say so instead of showing a dead form
  setTimeout(function () {
    var lp = document.getElementById("login-page");
    if (currentUser && lp && lp.style.display !== "none" && lp.offsetParent !== null) showToast("Signed in, but the app did not open. Check the connection and reopen.");
  }, 12000);
  fsdb.collection("users").doc(user.uid).get()
    .then(function (doc) {
      if (doc.exists) {
        currentUserProfile = doc.data();
        _enterApp();
      } else if (_createProfileFromPending(user)) {
        // Registered via the Register tab: profile created from the saved form
      } else {
        // Signed in but no profile yet: ask for a display name
        _resetAuthScreens();
        document.getElementById("login-page").style.display = "none";
        document.getElementById("profile-page").style.display = "block";
        var nameEl = document.getElementById("profileName");
        if (nameEl && !nameEl.value && user.email) nameEl.value = user.email.split("@")[0];
        showAuthPage();
      }
    })
    .catch(function (error) { showToast(error.message); });
}
