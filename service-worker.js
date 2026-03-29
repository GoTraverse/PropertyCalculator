/**
 * service-worker.js — EquitySight PWA Service Worker
 *
 * Cache-first strategy for static assets (CSS, JS, fonts, images).
 * Network-first for HTML pages and API calls.
 * Provides offline fallback for cached pages.
 */

const CACHE_NAME = 'equitysight-v1';
const STATIC_ASSETS = [
  '/shared.css',
  '/app.css',
  '/tools.css',
  '/site-init.js',
  '/error-capture.js',
  '/auth-nav.js',
  '/footer.js',
  '/shared-calcs.js',
  '/favicon.svg',
  '/manifest.json'
];

// Install — pre-cache essential static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — cache-first for static assets, network-first for everything else
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests and API calls
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/.netlify/')) return;

  // Cache-first for static assets (CSS, JS, fonts, images, SVGs)
  if (/\.(css|js|woff2?|ttf|svg|png|jpe?g|webp|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML pages
  if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/404.html');
        });
      })
    );
    return;
  }
});
