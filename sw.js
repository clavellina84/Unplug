// UNPLUG — service worker: primero la red (siempre la versión más nueva); sin red, la copia guardada
const CACHE = 'unplug-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled([c.add(new Request(self.registration.scope, { cache: 'reload' })), c.add(new Request('./index.html', { cache: 'reload' }))]))); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(e.request, { signal: ctrl.signal }); clearTimeout(t);
      if (res && res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (_) {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match(self.registration.scope)) || (await cache.match('./index.html')) || Response.error();
    }
  })());
});
