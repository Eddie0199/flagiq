const CACHE_VERSION = "v57";
const ASSET_CACHE = `flagiq-assets-${CACHE_VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key.startsWith("flagiq-") && key !== ASSET_CACHE) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always go to network for HTML so new deploys get the latest index/app shell.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  // Cache hashed/static assets, but never fall back to index.html for these requests.
  const isStaticAsset =
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "worker" ||
    request.destination === "font" ||
    request.destination === "image";

  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);

      if (cached) {
        void fetch(request)
          .then((response) => {
            const contentType = response.headers.get("content-type") || "";
            if (response.ok && !contentType.includes("text/html")) {
              return cache.put(request, response.clone());
            }
            return null;
          })
          .catch(() => null);

        return cached;
      }

      const response = await fetch(request);
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && !contentType.includes("text/html")) {
        await cache.put(request, response.clone());
      }
      return response;
    })()
  );
});
