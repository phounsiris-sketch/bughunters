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

// Web Push certificate (public key) from Firebase console →
// Project settings → Cloud Messaging → Web Push certificates.
// Leave empty until generated; the push switch stays hidden.
var PUSH_VAPID_KEY = "BNjkBm6heoRkA-hr1ZcJ_zcTKhhXDpOt4sfHjPtyZtZxXBqfiDBVFRvmB0lwjrLzN46Vur3r4Kr2b4wBVKIehzQ";

// Initialise Firebase app
firebase.initializeApp(firebaseConfig);

// Auth
var auth = firebase.auth();

// Firestore (named fsdb to avoid conflict with the db helper module)
var fsdb = firebase.firestore();

// Live connection: iPad / iPhone Safari can hold Firestore's streaming connection in a buffer, so a score update (live score
// watch screen) arrives late or in bursts. Plain long-polling answers each update at once there; elsewhere the SDK picks the
// better transport by itself. Must run before any other Firestore call.
(function () {
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  try { fsdb.settings(ios ? { experimentalForceLongPolling: true, merge: true } : { experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
})();

// Keep the sign-in across restarts (LOCAL = survives closing the tab); falls back by itself if storage is blocked
try {
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (err) {
    console.warn("Auth persistence not available:", err && err.code);
  });
} catch (e) {}

// iPad / iPhone Safari: IndexedDB can hang or be wiped, which froze sign-in and dropped the session.
// There Firestore runs without its offline cache (data is still live, just not kept offline).
var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Enable offline persistence with multi-tab synchronisation (not on iOS, see above)
if (!IS_IOS) {
  fsdb.enablePersistence({ synchronizeTabs: true })
    .catch(function (err) {
      if (err.code === "failed-precondition") {
        console.warn("Firestore persistence failed: multiple tabs open.");
      } else if (err.code === "unimplemented") {
        console.warn("Firestore persistence not supported in this browser.");
      }
    });
}
