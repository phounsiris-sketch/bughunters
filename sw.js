// Web push (sent through Firebase Cloud Messaging). We show the banner
// ourselves for every message — with the app open or closed — so iPhone
// never sees a "silent" push (iOS revokes push for apps that do that).
self.addEventListener('push', function (e) {
  var msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch (err) { msg = { notification: { body: e.data ? e.data.text() : '' } }; }
  var n = msg.notification || (msg.data && msg.data.title ? msg.data : {}) || {};
  var link = (msg.fcmOptions && msg.fcmOptions.link) || (msg.data && msg.data.link) || './';
  e.waitUntil(self.registration.showNotification(n.title || 'Godsmash', {
    body: n.body || '',
    tag: link,
    renotify: true,
    data: { link: link }
  }));
});

// Tapping a notification opens (or focuses) the app at the right page
self.addEventListener('notificationclick', function (e) {
  var link = (e.notification.data && e.notification.data.link) || './';
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) {
        return list[i].focus().then(function (c) { return c.navigate ? c.navigate(link) : c; });
      }
    }
    return clients.openWindow(link);
  }));
});

var CACHE_NAME = 'godsmash-v16';
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
