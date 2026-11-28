// UNPLUG — service worker (v223). build.py lo genera desde sw.tpl.js con la huella del build: cada build cambia sus bytes y el navegador lo trata como versión nueva.
// v210: la versión nueva se instala y ESPERA (sin skipWaiting automático): la partida en curso nunca cambia de código a media jugada.
// La app avisa «Hay una versión nueva · Actualizar»; al tocarlo guarda, manda SKIP_WAITING y recarga cuando cambia el service worker que la controla.
// Cada build tiene su propia caché (unplug-<huella>) con SU página; al activarse borra las anteriores (incluida la unplug-v3 de v209 y su __unplug_meta).
const BUILD = 'bcb6040bb320';
const CACHE = 'unplug-' + BUILD;
const PAGE = () => new Request(self.registration.scope);
/* v182: sólo se guarda una respuesta que de verdad es la app: 200, text/html, más de 1 MB y con la marca de versión. v210: y con la huella de ESTE build:
   si el servidor todavía entrega la página anterior junto con este sw.js, la instalación falla y el navegador lo reintenta en la siguiente revisión */
async function good(r){ try { if (!r || !r.ok) return false; if (!/text\/html/i.test(r.headers.get('content-type') || '')) return false; const t = await r.clone().text(); return t.length > 1048576 && t.indexOf('UNPLUG · v') >= 0 && t.indexOf(BUILD) >= 0; } catch (_) { return false; } }
self.addEventListener('install', e => { e.waitUntil((async () => {
  const r = await fetch(new Request(self.registration.scope, { cache: 'reload' }));
  if (!(await good(r))) throw new Error('UNPLUG: la página no es de este build');
  await (await caches.open(CACHE)).put(PAGE(), r);
})()); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE && k.startsWith('unplug-')) await caches.delete(k); await self.clients.claim(); })()); });
/* la app pide el cambio (SKIP_WAITING) sólo cuando el jugador toca «Actualizar»; GET_BUILD le dice qué build espera, para no avisar de la versión que ya corre */
self.addEventListener('message', e => { const d = e.data || {};
  if (d.type === 'SKIP_WAITING') e.waitUntil(self.skipWaiting());
  else if (d.type === 'GET_BUILD' && e.source) e.source.postMessage({ type: 'BUILD', build: BUILD });
});
/* la página (navegación o index.html): la copia de este build, al instante y sin red. Lo demás (mismo origen): red con respaldo de la caché */
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return; const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate' || url.href === self.registration.scope || url.pathname.endsWith('/index.html');
  if (!isPage){ e.respondWith((async () => { const c = await caches.open(CACHE); try { const r = await fetch(req); if (r && r.ok) c.put(req, r.clone()); return r; } catch (_) { return (await c.match(req, { ignoreSearch: true })) || Response.error(); } })()); return; }
  e.respondWith((async () => {
    const c = await caches.open(CACHE); const hit = await c.match(PAGE()); if (hit) return hit;
    /* sin copia (el sistema vació la caché): la red; se guarda sólo si es la página de este build */
    try { const r = await fetch(new Request(self.registration.scope, { cache: 'no-cache' })); if (await good(r)) e.waitUntil(c.put(PAGE(), r.clone())); return r; } catch (_) { return Response.error(); }
  })());
});
