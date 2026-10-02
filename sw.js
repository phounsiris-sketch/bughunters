// Background push (Firebase Cloud Messaging). Wrapped so the app still
// works offline if the SDK can't be fetched.
try {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js'
  );
  firebase.initializeApp({
    apiKey: 'AIzaSyC09Xv4oCPmQ4YLOFx7GW_FUDYJ7Qis5nI',
    authDomain: 'godsmash-badminton.firebaseapp.com',
    projectId: 'godsmash-badminton',
    storageBucket: 'godsmash-badminton.firebasestorage.app',
    messagingSenderId: '433540643983',
    appId: '1:433540643983:web:7447507a2075f7838204fa'
  });
  // Messages carry `notification` + `fcmOptions.link`: the SDK shows them
  // and opens the link (e.g. .../#session=ID) when tapped
  firebase.messaging();
} catch (e) {}

var CACHE_NAME = 'godsmash-v10';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/firebase-config.js',
  './js/i18n.js',
  './js/router.js',
  './js/db.js',
  './js/perms.js',
  './js/storage.js',
  './js/auth.js',
  './js/polls.js',
  './js/sessions.js',
  './js/dashboard.js',
  './js/settings.js',
  './js/payments.js',
  './js/notify.js',
  './js/push.js',
  './js/icons.js',
  './js/select.js',
  './js/datepicker.js',
  './js/app.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Network-first for Firebase API calls
  if (e.request.url.indexOf('firestore.googleapis.com') >= 0 ||
      e.request.url.indexOf('identitytoolkit.googleapis.com') >= 0 ||
      e.request.url.indexOf('securetoken.googleapis.com') >= 0) {
    e.respondWith(
      fetch(e.request).catch(function() { return caches.match(e.request); })
    );
    return;
  }

  // Network-first for app assets (so new deploys show up), cache as offline fallback
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(resp) {
      var clone = resp.clone();
      caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
      return resp;
    }).catch(function() {
      return caches.match(e.request).then(function(cached) {
        return cached || caches.match('./index.html');
      });
    })
  );
});
