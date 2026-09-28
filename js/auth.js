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
  localStorage.removeItem('dev_player');
  currentUser = null;
  currentUserProfile = null;
  showAuthPage();
  // Also sign out Firebase if authenticated
  try { auth.signOut(); } catch(e) {}
}

/* ---------- Dev bypass — simple name/password login ---------- */
var DEV_PASSWORD = 'smash2024';

var DEV_PLAYERS = [
  { uid: 'player-joung', name: 'Joung' },
  { uid: 'player-bob', name: 'Bob' },
  { uid: 'player-mee', name: 'Mee' },
  { uid: 'player-ton', name: 'Ton' },
  { uid: 'player-john', name: 'John' },
  { uid: 'player-nith', name: 'Nith' },
  { uid: 'player-bird', name: 'Bird' },
  { uid: 'player-na', name: 'Na' },
  { uid: 'player-bua', name: 'Bua' }
];

var DEV_COURTS = [
  { name: 'Joung Court', location: 'Vientiane', pricePerHour: 200 },
  { name: 'Bob Court', location: 'Vientiane', pricePerHour: 150 }
];

var DEV_SHUTTLECOCKS = [
  { name: 'RSL', pricePerTube: 120, cocksPerTube: 12 },
  { name: 'Yonex', pricePerTube: 150, cocksPerTube: 12 }
];

function devLogin() {
  var nameSelect = document.getElementById('devNameSelect');
  var passInput = document.getElementById('devPassword');
  var selectedName = nameSelect ? nameSelect.value : '';
  var password = passInput ? passInput.value : '';

  if (!selectedName) { showToast('Select your name'); return; }
  if (password !== DEV_PASSWORD) { showToast('Wrong password'); return; }

  var player = DEV_PLAYERS.find(function(p) { return p.name === selectedName; });
  if (!player) return;

  currentUser = { uid: player.uid, email: player.name.toLowerCase() + '@godsmash.local' };
  currentUserProfile = { email: currentUser.email, displayName: player.name, phone: null, avatarUrl: null };

  // Save selected player for auto-login
  localStorage.setItem('dev_player', selectedName);

  // Seed all players, courts, shuttlecocks into Firestore
  seedFirestoreData();

  showAppPage();
  initApp();
}

function seedFirestoreData() {
  // Seed all players as users
  DEV_PLAYERS.forEach(function(p) {
    fsdb.collection('users').doc(p.uid).set({
      email: p.name.toLowerCase() + '@godsmash.local',
      displayName: p.name,
      phone: null,
      avatarUrl: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(function() {});
  });

  // Seed courts (check if empty first)
  fsdb.collection('courts').get().then(function(snap) {
    if (snap.empty) {
      DEV_COURTS.forEach(function(c) {
        fsdb.collection('courts').add(c).catch(function() {});
      });
    }
  }).catch(function() {});

  // Seed shuttlecocks
  fsdb.collection('shuttlecocks').get().then(function(snap) {
    if (snap.empty) {
      DEV_SHUTTLECOCKS.forEach(function(s) {
        fsdb.collection('shuttlecocks').add(s).catch(function() {});
      });
    }
  }).catch(function() {});
}

function devAutoLogin() {
  var saved = localStorage.getItem('dev_player');
  if (!saved) return false;

  var player = DEV_PLAYERS.find(function(p) { return p.name === saved; });
  if (!player) return false;

  currentUser = { uid: player.uid, email: player.name.toLowerCase() + '@godsmash.local' };
  currentUserProfile = { email: currentUser.email, displayName: player.name, phone: null, avatarUrl: null };
  return true;
}

/* ---------- Initialise auth listener ---------- */
function initAuth() {
  // DEV BYPASS: use simple name/password login
  // Remove this block once Firebase email link auth is working
  if (devAutoLogin()) {
    showAppPage();
    initApp();
    return;
  }
  // Show bypass login form
  showAuthPage();
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
