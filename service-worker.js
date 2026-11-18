/**
 * service-worker.js — EquitySight PWA Service Worker
 *
 * Cache-first strategy for static assets (CSS, JS, fonts, images).
 * Network-first for HTML pages and API calls.
 * Provides offline fallback for cached pages.
 */

const CACHE_NAME = 'equitysight-v54';
const API_CACHE_NAME = 'equitysight-api-v1';
const STATIC_ASSETS = [
  '/offline.html',
  '/shared.css',
  '/tools.css',
  '/index.css',
  '/about.css',
  '/contact.css',
  '/site-init.js',
  '/error-capture.js',
  '/auth-nav.js',
  '/auth-nav-loader.js',
  '/footer.js',
  '/market-rate.js',
  '/favicon.svg',
  '/manifest.json',
  // The First Home Journey: page, styles, script and the suburb dataset it
  // searches, so the journey opens and works without a connection.
  '/journey',
  '/journey.css',
  '/journey.js',
  '/journey-suburbs.json',
  // Calculator landing page, the shared calculator script and every calculator
  // page (18 calculators + 8 state stamp-duty pages). Each page's own script
  // (/tools/<name>.js) is cached the first time that calculator is opened, by
  // the static-asset rule below. The parked /app and /portfolio bundles are
  // deliberately NOT pre-cached; they are cached on demand like any other asset.
  '/tools/',
  '/tools/tool-page.js',
  '/tools/stamp-duty-calculator',
  '/tools/stamp-duty-calculator-nsw',
  '/tools/stamp-duty-calculator-vic',
  '/tools/stamp-duty-calculator-qld',
  '/tools/stamp-duty-calculator-wa',
  '/tools/stamp-duty-calculator-sa',
  '/tools/stamp-duty-calculator-tas',
  '/tools/stamp-duty-calculator-act',
  '/tools/stamp-duty-calculator-nt',
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

// Data files served network-first with a cache fallback. JSON is not covered by
// the cache-first static rule (it would go stale until the next version bump),
// so without this the pre-cached copy would never be used offline.
const NETWORK_FIRST_DATA = ['/journey-suburbs.json'];

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

  // Network-first with cache fallback for whitelisted same-origin data files.
  if (url.origin === self.location.origin && NETWORK_FIRST_DATA.indexOf(url.pathname) !== -1) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(url.pathname, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(url.pathname);
      })
    );
    return;
  }

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
        // ignoreSearch: a deep link such as /journey?near=... falls back to
        // the cached /journey page rather than the offline notice.
        return caches.match(event.request, { ignoreSearch: true }).then(function(cached) {
          return cached || caches.match('/offline.html');
        });
      })
    );
    return;
  }
});
