/* MVG — service worker : l'app s'ouvre sans internet.
   Stratégie : on sert le cache tout de suite, et on met à jour en arrière-plan. */
const VERSION = 'mvg-v1';
const SHELL = [
  './', 'index.html', 'fonts.css', 'chart.umd.js', 'xlsx.full.min.js', 'mvg_mobile.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GitHub (synchro) etc. : jamais intercepté

  const isNav = req.mode === 'navigate';
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = (await cache.match(req, { ignoreSearch: true })) || (isNav ? await cache.match('index.html') : null);
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(isNav ? 'index.html' : req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      return res || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
