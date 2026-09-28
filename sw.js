var CACHE_NAME = 'godsmash-v2';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/firebase-config.js',
  './js/i18n.js',
  './js/router.js',
  './js/db.js',
  './js/storage.js',
  './js/auth.js',
  './js/polls.js',
  './js/sessions.js',
  './js/dinner.js',
  './js/dashboard.js',
  './js/settings.js',
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

  // Cache-first for app assets
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(resp) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        return resp;
      });
    }).catch(function() {
      return caches.match('./index.html');
    })
  );
});
