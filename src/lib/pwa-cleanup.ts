// Belt-and-suspenders client-side cleanup for installed PWAs and
// browsers that kept an old service worker / cache from a previous build.
//
// Symptom we are fixing: users land on the site and see an empty / old
// shell (no categories, no products). Cause: a previously-registered
// service worker keeps serving a stale HTML+JS bundle from Cache Storage.
//
// Strategy:
//   1. On every page load, unregister any service worker still attached
//      to this origin.
//   2. Wipe every entry in Cache Storage.
//   3. If we actually found something to clean (SW registration OR
//      non-empty caches), force ONE hard reload onto a fresh network
//      response so the user immediately sees the live build.
//   4. Guard with sessionStorage so we never reload twice in a row.

const RELOAD_GUARD_KEY = "kawzone:pwa-cleanup-reloaded-at";

function alreadyReloadedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || "0");
    return Date.now() - last < 60_000;
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function hardReload() {
  if (alreadyReloadedRecently()) return;
  markReloaded();
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

export function runPwaCleanup(): void {
  if (typeof window === "undefined") return;

  void (async () => {
    let didCleanup = false;

    if ("serviceWorker" in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) {
          didCleanup = true;
          await Promise.all(
            registrations.map((r) => r.unregister().catch(() => undefined)),
          );
        }
      } catch {
        // ignore
      }
    }

    if ("caches" in window) {
      try {
        const names = await caches.keys();
        if (names.length > 0) {
          didCleanup = true;
          await Promise.all(names.map((n) => caches.delete(n).catch(() => undefined)));
        }
      } catch {
        // ignore
      }
    }

    if (didCleanup) hardReload();
  })();
}
