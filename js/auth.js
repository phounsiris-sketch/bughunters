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

function sendPasswordReset() {
  var email = (document.getElementById("loginEmail").value || "").trim();
  if (!email) { showToast(t("enterEmailFirst")); document.getElementById("loginEmail").focus(); return; }
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
  showAuthPage();
}

function resendVerification() {
  if (!auth.currentUser) return;
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

  var email = localStorage.getItem("emailForSignIn");
  if (!email) {
    email = window.prompt(t("confirmEmailPrompt"));
  }
  if (!email) return;

  auth.signInWithEmailLink(email, window.location.href)
    .then(function () {
      localStorage.removeItem("emailForSignIn");
      history.replaceState(null, "", window.location.pathname);
    })
    .catch(function (error) {
      history.replaceState(null, "", window.location.pathname);
      showToast(error.code === "auth/invalid-action-code" ? t("linkExpired") : error.message);
    });
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
      if (!saveOnly) _enterApp();
    })
    .catch(function (error) { showToast(error.message); });
  return true;
}

/* ---------- Enter the app once the profile exists ---------- */
function _enterApp() {
  // Find my groups first (before the migration the app runs as one group)
  loadGroupContext().then(function () {
    if (!GROUPS_ON) seedFirestoreData();
    startGroupListeners();
    initApp();       // starts the shared data cache
    showAppPage();   // navigates to the dashboard
    updateHeaderGroup();
    if (GROUPS_ON && !currentGroupId) showPage("groups");
    else loadSessions();  // sessions feed badges, notifications and My payments
    if (GROUPS_ON && joinFromHash()) return; // invite link
    if (typeof openFromHash === "function") setTimeout(openFromHash, 400); // link from a push
  });
}

/* ---------- Show the sign-in form (not the profile form) ---------- */
function _resetAuthScreens() {
  var login = document.getElementById("login-page");
  var profile = document.getElementById("profile-page");
  var verify = document.getElementById("verify-page");
  if (login) login.style.display = "";
  if (profile) profile.style.display = "none";
  if (verify) verify.style.display = "none";
  // Back to a clean "Sign in" form
  ["loginPassword", "regPasswordConfirm"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  setAuthMode("login");
}

/* ---------- Logout ---------- */
function logoutUser() {
  if (typeof stopGroupListeners === "function") stopGroupListeners();
  GROUPS_ON = false; currentGroupId = null; currentGroup = null;
  if (typeof stopPolls === "function") stopPolls();
  if (typeof stopSessions === "function") stopSessions();
  if (typeof dbStopCache === "function") dbStopCache();
  currentUser = null;
  currentUserProfile = null;
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
