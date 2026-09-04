/* Overhead service worker: app shell precache, cache-first for our own static assets,
   network-first for the API, and hands-off for map/terrain tiles (browser + CDN cache those). */
const VERSION = 'overhead-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];
const OWN_ASSET = /^\/(assets|icons)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // tiles, terrain, feeds: not ours to cache
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;
  if (OWN_ASSET.test(url.pathname)) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // navigation & bundles: network first, fall back to the shell
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && (e.request.mode === 'navigate' || url.pathname.startsWith('/assets/'))) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('/index.html'))));
});
self.addEventListener('push', (e) => {
  let data = { title: 'Overhead', body: 'Something is overhead.' };
  try { data = { ...data, ...e.data.json() }; } catch { /* plain text */ }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, tag: data.tag, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const icao = e.notification.data && e.notification.data.icao24;
  e.waitUntil(self.clients.openWindow(icao ? `/?select=${icao}` : '/'));
});
