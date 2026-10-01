/* ============================================================
   auth.js — Email-link (passwordless) authentication
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
  var tl = document.getElementById("authTabLogin");
  var tr = document.getElementById("authTabRegister");
  if (tl) tl.classList.toggle("active", mode === "login");
  if (tr) tr.classList.toggle("active", mode === "register");
  var btn = document.getElementById("sendLinkBtn");
  if (btn) btn.textContent = t(mode === "register" ? "sendRegisterLink" : "sendLink");
  var msg = document.getElementById("otpSentMsg");
  if (msg) msg.style.display = "none";
}

/* ---------- Send magic link ---------- */
function sendLoginLink() {
  var emailInput = document.getElementById("loginEmail");
  var email = emailInput ? emailInput.value.trim() : "";
  if (!email) {
    showToast(t("enterEmail"));
    return;
  }

  if (authMode === "register") {
    var regName = (document.getElementById("regName").value || "").trim();
    var regPhone = (document.getElementById("regPhone").value || "").trim();
    if (!regName) {
      showToast(t("displayName"));
      return;
    }
    try {
      localStorage.setItem("pendingProfile", JSON.stringify({ email: email.toLowerCase(), name: regName, phone: regPhone || null }));
    } catch (e) {}
  }

  var btn = document.getElementById("sendLinkBtn");
  if (btn) btn.disabled = true;

  auth.sendSignInLinkToEmail(email, actionCodeSettings)
    .then(function () {
      localStorage.setItem("emailForSignIn", email);
      var otpMsg = document.getElementById("otpSentMsg");
      if (otpMsg) otpMsg.style.display = "block";
      if (btn) btn.disabled = false;
    })
    .catch(function (error) {
      showToast(error.message);
      if (btn) btn.disabled = false;
    });
}

/* ---------- Handle incoming email link ---------- */
function handleEmailLinkSignIn() {
  if (!auth.isSignInWithEmailLink(window.location.href)) return;

  var email = localStorage.getItem("emailForSignIn");
  if (!email) {
    email = window.prompt("Please provide your email for confirmation");
  }
  if (!email) return;

  auth.signInWithEmailLink(email, window.location.href)
    .then(function () {
      localStorage.removeItem("emailForSignIn");
      history.replaceState(null, "", window.location.pathname);
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

/* ---------- Save profile (first-time) ---------- */
function saveProfile() {
  var nameInput = document.getElementById("profileName");
  var phoneInput = document.getElementById("profilePhone");
  var displayName = nameInput ? nameInput.value.trim() : "";
  var phone = phoneInput ? phoneInput.value.trim() : "";

  if (!displayName) {
    showToast("Please enter your name");
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
      showAppPage();
    })
    .catch(function (error) {
      showToast(error.message);
    });
}

/* ---------- Create profile from the Register form (after email confirmed) ---------- */
function _createProfileFromPending(user) {
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
      seedFirestoreData();
      showAppPage();
      initApp();
    })
    .catch(function (error) { showToast(error.message); });
  return true;
}

/* ---------- Logout ---------- */
function logoutUser() {
  currentUser = null;
  currentUserProfile = null;
  showAuthPage();
  try { auth.signOut(); } catch(e) {}
}

/* ---------- Default courts / shuttlecocks (seeded once if empty) ---------- */

var DEFAULT_COURTS = [
  { name: 'Joung Court', location: 'Vientiane', pricePerHour: 200 },
  { name: 'Bob Court', location: 'Vientiane', pricePerHour: 150 }
];

var DEFAULT_SHUTTLECOCKS = [
  { name: 'RSL', pricePerTube: 120, cocksPerTube: 12 },
  { name: 'Yonex', pricePerTube: 150, cocksPerTube: 12 }
];

function seedFirestoreData() {
  // Seed courts
  fsdb.collection('courts').get().then(function(snap) {
    if (snap.empty) {
      DEFAULT_COURTS.forEach(function(c) {
        fsdb.collection('courts').add(c).catch(function() {});
      });
    }
  }).catch(function() {});

  // Seed shuttlecocks
  fsdb.collection('shuttlecocks').get().then(function(snap) {
    if (snap.empty) {
      DEFAULT_SHUTTLECOCKS.forEach(function(s) {
        fsdb.collection('shuttlecocks').add(s).catch(function() {});
      });
    }
  }).catch(function() {});
}

/* ---------- Initialise auth listener ---------- */
function initAuth() {
  handleEmailLinkSignIn();

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      currentUser = null;
      currentUserProfile = null;
      showAuthPage();
      return;
    }
    currentUser = user;

    fsdb.collection("users").doc(user.uid).get()
      .then(function (doc) {
        if (doc.exists) {
          currentUserProfile = doc.data();
          seedFirestoreData();
          showAppPage();
          initApp();
        } else if (_createProfileFromPending(user)) {
          // Registered via the Register tab: profile created from the saved form
        } else {
          // First sign-in: ask for display name (email is now confirmed)
          document.getElementById("login-page").style.display = "none";
          document.getElementById("profile-page").style.display = "block";
          showAuthPage();
        }
      })
      .catch(function (error) {
        showToast(error.message);
      });
  });
}
