// Belt-and-suspenders client-side cleanup for installed PWAs.
//
// Most users will be cleaned by the kill-switch service workers at /sw.js
// and /service-worker.js. But if a user's browser never refetches an old
// SW script (e.g. it was already in a terminated state), this routine
// guarantees on every fresh page load that:
//   1. No service worker remains registered for this origin.
//   2. No Cache Storage entries remain.
//
// Safe to run unconditionally — no-ops if nothing is registered.

export function runPwaCleanup(): void {
  if (typeof window === "undefined") return;

  // Unregister any service workers that managed to register in the past.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister().catch(() => {
            // ignore
          });
        });
      })
      .catch(() => {
        // ignore
      });
  }

  // Drop any leftover Cache Storage entries from prior PWA caching strategies.
  if ("caches" in window) {
    caches
      .keys()
      .then((names) => {
        names.forEach((name) => {
          caches.delete(name).catch(() => {
            // ignore
          });
        });
      })
      .catch(() => {
        // ignore
      });
  }
}
