/** Minimal service worker so Restman meets installability criteria. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Do not replay requests. A passthrough fetch() doubled Next.js RSC
// prefetches, and those extra calls were the ones returning 503.
self.addEventListener("fetch", () => {});
