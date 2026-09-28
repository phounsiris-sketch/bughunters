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
  localStorage.removeItem('dev_uid');
  localStorage.removeItem('dev_name');
  currentUser = null;
  currentUserProfile = null;
  showAuthPage();
  loadLoginPlayerList();
  try { auth.signOut(); } catch(e) {}
}

/* ---------- Simple player-pick login (no password) ---------- */

var DEFAULT_PLAYERS = [
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

var DEFAULT_COURTS = [
  { name: 'Joung Court', location: 'Vientiane', pricePerHour: 200 },
  { name: 'Bob Court', location: 'Vientiane', pricePerHour: 150 }
];

var DEFAULT_SHUTTLECOCKS = [
  { name: 'RSL', pricePerTube: 120, cocksPerTube: 12 },
  { name: 'Yonex', pricePerTube: 150, cocksPerTube: 12 }
];

function loadLoginPlayerList() {
  var select = document.getElementById('devNameSelect');
  if (!select) return;

  // Try loading from Firestore first, fallback to defaults
  fsdb.collection('users').orderBy('displayName').get().then(function(snap) {
    select.innerHTML = '<option value="">-- Who are you? --</option>';
    if (snap.empty) {
      // Seed default players and use them
      seedFirestoreData();
      DEFAULT_PLAYERS.forEach(function(p) {
        select.innerHTML += '<option value="' + p.uid + '">' + p.name + '</option>';
      });
    } else {
      snap.forEach(function(doc) {
        var d = doc.data();
        select.innerHTML += '<option value="' + doc.id + '">' + d.displayName + '</option>';
      });
    }
  }).catch(function() {
    // Firestore not available — use defaults
    select.innerHTML = '<option value="">-- Who are you? --</option>';
    DEFAULT_PLAYERS.forEach(function(p) {
      select.innerHTML += '<option value="' + p.uid + '">' + p.name + '</option>';
    });
  });
}

function devLogin() {
  var nameSelect = document.getElementById('devNameSelect');
  var selectedUid = nameSelect ? nameSelect.value : '';
  var selectedText = nameSelect ? nameSelect.options[nameSelect.selectedIndex].text : '';

  if (!selectedUid) { showToast('Select your name'); return; }

  currentUser = { uid: selectedUid, email: selectedText.toLowerCase().replace(/\s/g, '') + '@godsmash.local' };
  currentUserProfile = { email: currentUser.email, displayName: selectedText, phone: null, avatarUrl: null };

  localStorage.setItem('dev_uid', selectedUid);
  localStorage.setItem('dev_name', selectedText);

  showAppPage();
  initApp();
}

function showAddNewPlayer() {
  var name = prompt('Enter new player name:');
  if (!name || !name.trim()) return;
  name = name.trim();

  var uid = 'player-' + name.toLowerCase().replace(/\s/g, '-') + '-' + Date.now();

  fsdb.collection('users').doc(uid).set({
    email: name.toLowerCase().replace(/\s/g, '') + '@godsmash.local',
    displayName: name,
    phone: null,
    avatarUrl: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    // Add to select and auto-select
    var select = document.getElementById('devNameSelect');
    if (select) {
      var opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = name;
      select.appendChild(opt);
      select.value = uid;
    }
    showToast(name + ' added!');
  }).catch(function(e) {
    showToast('Error: ' + e.message);
  });
}

function seedFirestoreData() {
  // Seed players
  DEFAULT_PLAYERS.forEach(function(p) {
    fsdb.collection('users').doc(p.uid).set({
      email: p.name.toLowerCase() + '@godsmash.local',
      displayName: p.name,
      phone: null,
      avatarUrl: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(function() {});
  });

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

function devAutoLogin() {
  var savedUid = localStorage.getItem('dev_uid');
  var savedName = localStorage.getItem('dev_name');
  if (!savedUid || !savedName) return false;

  currentUser = { uid: savedUid, email: savedName.toLowerCase().replace(/\s/g, '') + '@godsmash.local' };
  currentUserProfile = { email: currentUser.email, displayName: savedName, phone: null, avatarUrl: null };
  return true;
}

/* ---------- Initialise auth listener ---------- */
function initAuth() {
  // No login — go straight to app
  currentUser = { uid: 'shared-user', email: 'shared@godsmash.local' };
  currentUserProfile = { email: 'shared@godsmash.local', displayName: 'Player', phone: null, avatarUrl: null };
  seedFirestoreData();
  showAppPage();
  initApp();
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
