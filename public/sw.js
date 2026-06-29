/* Samadhan service worker — installability + a safe offline app shell.
 * Cache-first for same-origin static assets (Vite hashes filenames, so this is
 * safe); network-first for navigations (fresh shell online, cached when offline).
 * NEVER caches /api/* or cross-origin (Firebase, image hosts). Versioned cache
 * is purged on activate so each deploy rolls cleanly. */
const CACHE = 'samadhan-shell-v1';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave Firebase/image hosts alone
  if (url.pathname.startsWith('/api/')) return;     // never cache the API

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('/offline.html'))
    )
  );
});
