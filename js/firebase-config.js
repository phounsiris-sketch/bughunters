/* ============================================================
   firebase-config.js — Firebase COMPAT SDK initialisation
   Loaded AFTER the CDN script tags for firebase-app-compat,
   firebase-auth-compat, firebase-firestore-compat.
   ============================================================ */

var firebaseConfig = {
  apiKey: "AIzaSyC09Xv4oCPmQ4YLOFx7GW_FUDYJ7Qis5nI",
  authDomain: "godsmash-badminton.firebaseapp.com",
  projectId: "godsmash-badminton",
  storageBucket: "godsmash-badminton.firebasestorage.app",
  messagingSenderId: "433540643983",
  appId: "1:433540643983:web:7447507a2075f7838204fa",
  measurementId: "G-7MLBTFYHP2"
};

// Initialise Firebase app
firebase.initializeApp(firebaseConfig);

// Auth
var auth = firebase.auth();

// Firestore (named fsdb to avoid conflict with the db helper module)
var fsdb = firebase.firestore();

// Enable offline persistence with multi-tab synchronisation
fsdb.enablePersistence({ synchronizeTabs: true })
  .catch(function (err) {
    if (err.code === "failed-precondition") {
      console.warn("Firestore persistence failed: multiple tabs open.");
    } else if (err.code === "unimplemented") {
      console.warn("Firestore persistence not supported in this browser.");
    }
  });
