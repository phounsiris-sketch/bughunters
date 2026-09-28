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

/* ---------- Send magic link ---------- */
function sendLoginLink() {
  var emailInput = document.getElementById("loginEmail");
  var email = emailInput ? emailInput.value.trim() : "";
  if (!email) {
    showToast("Please enter your email");
    return;
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

/* ---------- Logout ---------- */
function logoutUser() {
  auth.signOut();
}

/* ---------- Dev bypass — skip login ---------- */
function devBypass() {
  currentUser = { uid: 'dev-user-001', email: 'dev@godsmash.local' };
  currentUserProfile = { email: 'dev@godsmash.local', displayName: 'Bob (Dev)', phone: null, avatarUrl: null };

  // Ensure user doc exists in Firestore
  fsdb.collection('users').doc(currentUser.uid).set({
    email: currentUser.email,
    displayName: currentUserProfile.displayName,
    phone: null,
    avatarUrl: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(function() {});

  showAppPage();
  initApp();
}

/* ---------- Initialise auth listener ---------- */
function initAuth() {
  // DEV BYPASS: skip Firebase auth, go straight to app
  // Remove this block once Firebase email link auth is working
  devBypass();
  return;

  handleEmailLinkSignIn();

  auth.onAuthStateChanged(function (user) {
    if (user) {
      currentUser = user;

      fsdb.collection("users").doc(user.uid).get()
        .then(function (doc) {
          if (doc.exists) {
            currentUserProfile = doc.data();
            showAppPage();
            initApp();
          } else {
            // Profile not yet created — show profile setup page
            var authContainer = document.getElementById("auth-container");
            var appContainer = document.getElementById("app-container");
            var loginPage = document.getElementById("login-page");
            var profilePage = document.getElementById("profile-page");

            if (authContainer) authContainer.style.display = "block";
            if (appContainer) appContainer.style.display = "none";
            if (loginPage) loginPage.style.display = "none";
            if (profilePage) profilePage.style.display = "block";
          }
        })
        .catch(function (error) {
          showToast(error.message);
        });
    } else {
      currentUser = null;
      currentUserProfile = null;
      showAuthPage();
    }
  });
}
