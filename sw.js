/* MVG — service worker v2 : l'app s'ouvre sans internet.
   Installation TOLÉRANTE : seul index.html est indispensable. Un fichier secondaire
   manquant ne bloque plus le mode hors ligne (il est réparé par l'app ensuite). */
const VERSION = 'mvg-v3';
const CRITICAL = ['index.html'];
const OPTIONAL = ['mvg_mobile.js', 'fonts.css', 'chart.umd.js', 'xlsx.full.min.js', 'manifest.webmanifest',
                  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const all = CRITICAL.concat(OPTIONAL);
    const ok = await Promise.all(all.map(async (u) => {
      try {
        const r = await fetch(u, { cache: 'reload' });
        if (!r.ok || r.redirected) return false;
        await cache.put(u, r);
        return true;
      } catch (_) { return false; }
    }));
    if (CRITICAL.some((u) => !ok[all.indexOf(u)])) throw new Error('index.html introuvable : installation annulée');
    await self.skipWaiting();
  })());
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
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = (await cache.match(req, { ignoreSearch: true })) || (isNav ? await cache.match('index.html') : null);
    const network = fetch(req).then((res) => {
      if (res && res.ok && !res.redirected) cache.put(isNav ? 'index.html' : req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    return res || new Response('<meta charset="utf-8"><body style="font:16px sans-serif;background:#070809;color:#e8e6e0;padding:30px"><h2>MVG — hors ligne</h2><p>Cette page n’est pas encore en mémoire. Ouvrez l’app une fois avec une connexion internet.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  })());
});
