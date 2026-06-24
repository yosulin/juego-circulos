const CACHE = 'juego-circulos-v2.0';
const ASSETS = [
  '/juego-circulos/',
  '/juego-circulos/index.html',
  '/juego-circulos/manifest.json',
  '/juego-circulos/icon-192.png',
  '/juego-circulos/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Borrar TODAS las cachés antiguas al activar la nueva versión
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = e.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (isHTML) {
    // Network-first para HTML: siempre intenta la red, cae en caché solo si falla
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first para iconos, manifest, etc.
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
