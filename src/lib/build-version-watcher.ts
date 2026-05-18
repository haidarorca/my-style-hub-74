// Lightweight build-version checker.
//
// Strategy: fetch the current HTML and extract the hashed asset URLs Vite
// emits (e.g. /assets/index-AbCd1234.js). If the set differs from what is
// currently loaded in the page, a new build is live → show a refresh toast.
//
// No service worker, no /version.json endpoint. Works because the Lovable
// proxy serves HTML with Cache-Control: no-cache, so this fetch always hits
// the latest build.

import { toast } from "sonner";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = "kawzone:build-fingerprint";

let started = false;
let notified = false;
let initialFingerprint: string | null = null;

function isHashedAsset(url: string): boolean {
  return url.includes("/assets/") || url.includes("/_build/");
}

function currentFingerprint(): string {
  if (typeof document === "undefined") return "";
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
    .map((s) => s.getAttribute("src") || "")
    .filter(isHashedAsset);
  const styles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'))
    .map((l) => l.getAttribute("href") || "")
    .filter(isHashedAsset);
  return [...scripts, ...styles].sort().join("|");
}

async function remoteFingerprint(): Promise<string | null> {
  try {
    const res = await fetch(`/?_v=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const scripts = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))
      .map((m) => m[1])
      .filter(isHashedAsset);
    const styles = Array.from(html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi))
      .map((m) => m[1])
      .filter(isHashedAsset);
    const styles2 = Array.from(html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi))
      .map((m) => m[1])
      .filter(isHashedAsset);
    return [...scripts, ...styles, ...styles2].sort().join("|");
  } catch {
    return null;
  }
}

function isStandalonePwa(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    // iOS Safari
    if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  } catch {
    // ignore
  }
  return false;
}

const HARD_RELOAD_KEY = "kawzone:hard-reload-at";

async function hardReloadFresh() {
  try {
    const last = Number(sessionStorage.getItem(HARD_RELOAD_KEY) || "0");
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(HARD_RELOAD_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    // ignore
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
    }
  } catch {
    // ignore
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

function showUpdateToast() {
  if (notified) return;
  notified = true;
  toast("Une nouvelle version est disponible", {
    description: "Rechargez la page pour profiter des dernières mises à jour.",
    duration: Infinity,
    action: {
      label: "Recharger",
      onClick: () => {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
        void hardReloadFresh();
      },
    },
  });
}

async function checkOnce() {
  if (notified) return;
  if (!initialFingerprint) return;
  const remote = await remoteFingerprint();
  if (!remote) return;
  if (remote !== initialFingerprint) {
    // In an installed PWA the user has no easy way to refresh manually.
    // Silently hard-reload onto the new build instead of showing a toast.
    if (isStandalonePwa()) {
      void hardReloadFresh();
      return;
    }
    showUpdateToast();
  }
}

export function startBuildVersionWatcher(): void {
  if (started) return;
  if (typeof window === "undefined") return;
  // Skip in Lovable preview / iframe contexts to avoid noisy toasts in the editor.
  try {
    if (window.self !== window.top) return;
  } catch {
    return;
  }
  const host = window.location.hostname;
  if (host.includes("lovableproject.com") || host.includes("id-preview--")) return;

  started = true;
  initialFingerprint = currentFingerprint();
  if (!initialFingerprint) return;

  // Installed PWAs need to detect a new deploy immediately on launch — the
  // user has no address bar to refresh manually. Kick a check right away on
  // standalone, otherwise wait 15s so it doesn't compete with first paint.
  const kick = () => {
    void checkOnce();
  };
  if (isStandalonePwa()) {
    setTimeout(kick, 500);
  } else {
    setTimeout(kick, 15_000);
  }
  setInterval(kick, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
  });
  window.addEventListener("focus", kick);
  window.addEventListener("online", kick);
}
