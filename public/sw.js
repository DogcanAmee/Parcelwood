// Parcelwood service worker: lets the web game open and play offline after the first visit.
// - Pages: network first, fall back to the cached copy when offline.
// - Built assets (hashed names), item art and icons: cache first.
// - Everything else (Supabase, Stripe) always goes to the network and is never cached.
// Bump on each release so old hashed files are dropped (activate deletes every other cache).
const VERSION = 'pw-v3';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function cacheable(url) {
  return url.origin === self.location.origin && /\/(assets|items|icons|residents|ui)\//.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Keep only a real page as the offline copy, never an error or a redirect.
          if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./', copy)); }
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }
  if (cacheable(url)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
