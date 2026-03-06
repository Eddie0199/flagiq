// Temporary kill-switch service worker.
// We keep the file so existing registrations can update to this version,
// clear stale caches, and unregister themselves.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      const clients = await self.clients.matchAll({ type: "window" });
      await Promise.all(
        clients.map((client) => client.navigate(client.url).catch(() => null))
      );
      await self.registration.unregister();
    })()
  );
});
