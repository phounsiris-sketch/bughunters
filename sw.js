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
    tag: (msg.data && msg.data.tag) || link, // same tag replaces the previous banner
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

var CACHE_NAME = 'godsmash-v261';
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
  './js/motion.js',
  './js/stats-core.js',
  './js/matches-all.js',
  './js/courtsmap.js',
  './js/dashboard.js',
  './js/subscription.js',
  './js/ui.js',
  './js/home.js',
  './js/livescore.js',
  './js/games.js',
  './js/splash.js',
  './js/settings.js',
  './js/payments.js',
  './js/notify.js',
  './js/trash.js',
  './js/people.js',
  './js/push.js',
  './js/icons-solar-bold.js',
  './js/icons-sets.js',
  './js/icons.js',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/select.js',
  './js/datepicker.js',
  './js/groups.js',
  './js/maps.js',
  './js/restaurants.js',
  './js/public.js',
  './js/stats.js',
  './js/sharecard.js',
  './js/sharecard-health.js',
  './js/health.js',
  './js/health-ui.js',
  './js/fx.js',
  './js/profile.js',
  './js/social.js',
  './js/tournament.js',
  './js/hallfame.js',
  './js/vendor/qrcode/qrcode.js',   // the invite QR is drawn offline too (v232)
  './js/vendor/leaflet/leaflet.js',
  './js/vendor/leaflet/leaflet.css',
  './js/app.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    // 'reload': fetch fresh files, not the browser's 10 minute copy, so a new version never installs old scripts
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(ASSETS.map(function(u) { return cache.add(new Request(u, { cache: 'reload' })); }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME && n !== 'godsmash-tiles'; })
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

  // Network-first for app assets (so new deploys show up), cache as offline fallback.
  // Our own files skip the browser's HTTP cache (GitHub Pages allows 10 min),
  // revalidating instead, so a new version shows on the next open.
  if (e.request.method !== 'GET') return;
  if (/photon\.komoot\.io|nominatim\.openstreetmap\.org/.test(e.request.url)) return;   // place search: always live, never cached
  var own = new URL(e.request.url).origin === self.location.origin;
  // Map tiles: their own small cache (at most 250 tiles), not the app cache
  if (/tile\.openstreetmap\.org/.test(e.request.url)) {
    e.respondWith(caches.open('godsmash-tiles').then(function (tc) {
      return tc.match(e.request).then(function (hit) {
        if (hit) return hit;
        return fetch(e.request).then(function (resp) {
          tc.put(e.request, resp.clone()).then(function () { return tc.keys(); }).then(function (ks) { if (ks.length > 250) tc.delete(ks[0]); });
          return resp;
        });
      });
    }).catch(function () { return Response.error(); }));
    return;
  }
  // Our own files: cache first, then update in the background (v218). The app opens from this phone with no network round trips
  // (it used to ask the server about every one of its ~50 files on each start); a new version is downloaded by the new
  // service worker (cache: 'reload' above) and replaces this cache, and the page reloads once when it takes over.
  function store(resp) {
    if (resp && resp.ok && resp.status === 200 && e.request.url.indexOf('oobCode') < 0) {
      var clone = resp.clone();
      caches.open(CACHE_NAME).then(function(cache) { return cache.put(e.request, clone); }).catch(function() {});
    }
    return resp;
  }
  var key = e.request.mode === 'navigate' ? './index.html' : e.request;
  e.respondWith(
    caches.match(key, { ignoreSearch: e.request.mode === 'navigate' }).then(function(cached) {
      var net = fetch(own ? new Request(e.request, { cache: 'no-cache' }) : e.request).then(store);
      if (cached && own) { e.waitUntil(net.catch(function() {})); return cached; }
      return net.catch(function() {
        // Offline: open the app shell for page loads only, never in place of a script
        return cached || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
      });
    })
  );
});
