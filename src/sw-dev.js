const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_PREFIX = "flagiq-runtime-";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const APP_SHELL_PATHS = new Set(["/", "/index.html"]);

const isHttpRequest = (request) => request?.url?.startsWith("http");

const normalizePath = (pathname) => {
  if (!pathname) return "/";
  return pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || !isHttpRequest(request)) return;

  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const isAppShellRoute = request.mode === "navigate" || APP_SHELL_PATHS.has(path);

  if (isAppShellRoute) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request, { cache: "no-store" });
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse =
            (await cache.match(request)) ||
            (await cache.match("/index.html")) ||
            (await cache.match("/"));
          if (cachedResponse) return cachedResponse;
          throw error;
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        throw error;
      }
    })()
  );
});
