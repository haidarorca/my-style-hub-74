// Kill-switch service worker.
// Purpose: cleanly remove any previously-installed service worker on user
// devices, purge stale caches, and force-reload open windows so the app
// always serves the latest deployed build.
//
// Do NOT add caching logic here. The Lovable proxy already revalidates HTML
// on every navigation; a caching SW is what caused stale installed PWAs in
// the first place.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();

      // Wipe every Cache Storage entry left by any previous SW.
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch (_) {
        // ignore
      }

      // Force every controlled window to reload onto a fresh network response.
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

      // Finally, remove ourselves so future visits hit the network directly.
      try {
        await self.registration.unregister();
      } catch (_) {
        // ignore
      }
    })(),
  );
});

// No fetch handler — let every request go straight to the network.
