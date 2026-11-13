/* Offline app shell. vite.config.ts fills in the file list and version at build time. */
const PRECACHE = __PRECACHE__;
const SHELL = "shell-__VERSION__";
const RUNTIME = "runtime-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== SHELL && name !== RUNTIME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** Serve the saved copy at once and refresh it in the background. */
function staleWhileRevalidate(request) {
  return caches.open(RUNTIME).then((cache) => cache.match(request).then((saved) => {
    const fresh = fetch(request).then((response) => {
      if (response.ok || response.type === "opaque") void cache.put(request, response.clone());
      return response;
    });
    if (!saved) return fresh;
    fresh.catch(() => undefined);
    return saved;
  }));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  // API data is saved by the app itself (src/lib/offlineCache.ts), never here.
  if (sameOrigin && url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/uploads/") || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (!sameOrigin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html", { cacheName: SHELL })));
    return;
  }
  event.respondWith(caches.match(request, { cacheName: SHELL }).then((saved) => saved || fetch(request)));
});
