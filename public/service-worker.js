// Kill-switch service worker (alternate legacy path).
// Some older PWA setups registered the SW at /service-worker.js instead of
// /sw.js. We ship the same cleanup logic here so installed apps using either
// path get unregistered and their caches wiped.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();

      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch (_) {
        // ignore
      }

      try {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        await Promise.all(
          clients.map((client) => {
            try {
              const url = new URL(client.url);
              url.searchParams.set("sw-cleanup", Date.now().toString());
              return client.navigate(url.toString());
            } catch (_) {
              return undefined;
            }
          }),
        );
      } catch (_) {
        // ignore
      }

      try {
        await self.registration.unregister();
      } catch (_) {
        // ignore
      }
    })(),
  );
});
