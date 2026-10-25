// UNPLUG — service worker (v169): primero la copia guardada (abre al instante, aun con mala señal) y en segundo plano se baja la versión nueva.
// Cuando la página nueva ya quedó guardada y es distinta de la que se está usando, se avisa a la app ("Actualización lista · reabre"); se usa al reabrir.
// __unplug_meta guarda { served: firma de la página que se abrió, ready: firma de la más nueva en caché }. Firma = ETag o, sin ETag, tamaño + hash del texto.
// served se escribe en cuanto la página sale de la caché (no al terminar la descarga en segundo plano); la app además recuerda la firma de SU página.
const CACHE = 'unplug-v3';
const META = () => new Request(self.registration.scope + '__unplug_meta');
const PAGE = () => new Request(self.registration.scope);
async function sig(res){ const et = res.headers.get('etag'); if (et) return 'e:' + et; const txt = await res.clone().text(); let h = 0x811c9dc5; for (let i = 0; i < txt.length; i++){ h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'h:' + txt.length + ':' + h.toString(36); }
async function readMeta(c){ try { const r = await c.match(META()); return r ? await r.json() : {}; } catch (_) { return {}; } }
async function writeMeta(c, m){ await c.put(META(), new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } })); }
async function notify(){ const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); for (const cl of all) cl.postMessage({ type: 'unplug-update' }); }
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil((async () => {
  const c = await caches.open(CACHE); const old = await caches.match(PAGE(), { ignoreSearch: true }); /* la copia del service worker anterior sirve si no hay red */
  try { const r = await fetch(new Request(self.registration.scope, { cache: 'reload' })); if (r && r.ok){ await c.put(PAGE(), r.clone()); await writeMeta(c, { served: await sig(r), ready: await sig(r) }); return; } } catch (_) {}
  if (old) await c.put(PAGE(), old);
})()); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE && k.startsWith('unplug-')) await caches.delete(k); await self.clients.claim(); })()); });
/* la página (navegación o index.html): de la caché; en segundo plano, la red. Lo demás (mismo origen): red con respaldo de la caché */
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return; const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate' || url.href === self.registration.scope || url.pathname.endsWith('/index.html');
  if (!isPage){ e.respondWith((async () => { const c = await caches.open(CACHE); try { const r = await fetch(req); if (r && r.ok) c.put(req, r.clone()); return r; } catch (_) { return (await c.match(req, { ignoreSearch: true })) || Response.error(); } })()); return; }
  e.respondWith((async () => {
    const c = await caches.open(CACHE); const hit = (await c.match(PAGE())) || (await c.match(req, { ignoreSearch: true }));
    const fresh = (async () => { try { const r = await fetch(new Request(self.registration.scope, { cache: 'no-cache' })); if (!r || !r.ok) return null; return r; } catch (_) { return null; } })();
    if (hit){
      const copy = hit.clone(); /* la respuesta sale ya hacia la página: la firma se saca de una copia */
      /* served se anota YA (antes de esperar la red): con mala señal la página revisa a los 4 s y debe comparar contra la que de verdad abrió, no contra la anterior */
      e.waitUntil((async () => { const s0 = await sig(copy); { const m = await readMeta(c); m.served = s0; if (!m.ready) m.ready = s0; await writeMeta(c, m); }
        const r = await fresh; if (!r) return; const s = await sig(r), m = await readMeta(c); m.ready = s; if (s !== s0){ await c.put(PAGE(), r.clone()); await writeMeta(c, m); await notify(); return; } await writeMeta(c, m); })());
      return hit;
    }
    const r = await fresh; if (r){ e.waitUntil((async () => { await c.put(PAGE(), r.clone()); const s = await sig(r); await writeMeta(c, { served: s, ready: s }); })()); return r; }
    return Response.error();
  })());
});
