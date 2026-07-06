/**
 * service-worker.js — EquitySight PWA Service Worker
 *
 * Cache-first strategy for static assets (CSS, JS, fonts, images).
 * Network-first for HTML pages and API calls.
 * Provides offline fallback for cached pages.
 */

const CACHE_NAME = 'equitysight-v26';
const API_CACHE_NAME = 'equitysight-api-v1';
const STATIC_ASSETS = [
  '/offline.html',
  '/shared.css',
  '/app.css',
  '/tools.css',
  '/index.css',
  '/about.css',
  '/contact.css',
  '/site-init.js',
  '/error-capture.js',
  '/portfolio.js',
  '/portfolio.css',
  '/auth-nav.js',
  '/auth-nav-loader.js',
  '/footer.js',
  '/market-rate.js',
  '/favicon.svg',
  '/manifest.json',
  // Authenticated app bundle — pre-cache so first sign-in doesn't pay the
  // cold-fetch cost for ~330 KB of JS + CSS. Sign-in flow on /login already
  // has <link rel="prefetch"> hints for these, but pre-caching here covers
  // users who arrive at /app via the sidebar nav from other pages.
  '/app.js',
  '/app-init.js',
  '/app-events.js',
  '/onboarding.js',
  // Calculator landing + all 14 tool HTML pages — enables first-visit offline
  // access so a user can open any calculator without a prior online visit. The
  // HTMLs stay small (~30 KB each); install cost ~400 KB. Individual tool JS
  // files are cached on-demand by the static-asset pattern below.
  '/tools/',
  '/tools/stamp-duty-calculator',
  '/tools/cost-of-purchase-calculator',
  '/tools/deposit-calculator',
  '/tools/first-home-buyer-grants-calculator',
  '/tools/borrowing-power-calculator',
  '/tools/loan-serviceability-calculator',
  '/tools/mortgage-repayment-calculator',
  '/tools/interest-only-vs-principal-calculator',
  '/tools/mortgage-stress-calculator',
  '/tools/rental-yield-calculator',
  '/tools/capital-gains-calculator',
  '/tools/equity-release-calculator',
  '/tools/house-flip-calculator',
  '/tools/renovation-cost-calculator',
  '/tools/listing-price-checker',
  '/tools/auction-budget-calculator',
  '/tools/land-tax-calculator',
  '/tools/property-cashflow-calculator'
];

// Idempotent GET endpoints that benefit from stale-while-revalidate so the
// page renders instantly from cache while fresh data is fetched in the
// background. Match against `url.pathname + url.search` (full GET URL).
const SWR_API_PATTERNS = [
  /^\/\.netlify\/functions\/market-data(\?|$)/,
];

// Install — pre-cache essential static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Bypass the HTTP cache on (re)install so a version bump always re-fetches
      // FRESH assets. Otherwise the 1-day HTTP cache lets the SW re-cache stale
      // CSS/JS after a deploy (new HTML + old CSS = broken layouts on returning
      // devices). {cache:'reload'} forces a network fetch, self-healing them.
      return cache.addAll(STATIC_ASSETS.map(function(u){ return new Request(u, { cache: 'reload' }); }));
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', function(event) {
  var keep = [CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return keep.indexOf(name) === -1; })
          .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — cache-first for static assets, network-first for everything else
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Stale-while-revalidate for whitelisted API endpoints. Returns cached
  // response immediately (so suburb pages render instantly when offline or on
  // flaky mobile data) while a fresh response is fetched and stored for next
  // time. The API cache is segregated from the static-asset cache so it can
  // be evicted independently.
  var pathQuery = url.pathname + url.search;
  if (SWR_API_PATTERNS.some(function(re){ return re.test(pathQuery); })) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var networkPromise = fetch(event.request).then(function(response) {
            if (response && response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(function() { return cached; });
          // Return cached immediately if present; otherwise wait for network.
          return cached || networkPromise;
        });
      })
    );
    return;
  }

  // Skip all other Netlify Functions (auth, scenarios, etc.)
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
        // Network failed (offline). Serve the cached page if we have it,
        // otherwise the branded offline fallback (pre-cached on install).
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/offline.html');
        });
      })
    );
    return;
  }
});
