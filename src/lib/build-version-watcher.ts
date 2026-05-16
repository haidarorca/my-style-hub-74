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

function currentFingerprint(): string {
  if (typeof document === "undefined") return "";
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
    .map((s) => s.getAttribute("src") || "")
    .filter((src) => src.includes("/assets/") || src.includes("/_build/"))
    .sort();
  return scripts.join("|");
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
    const matches = Array.from(
      html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi),
    )
      .map((m) => m[1])
      .filter((src) => src.includes("/assets/") || src.includes("/_build/"))
      .sort();
    return matches.join("|");
  } catch {
    return null;
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
        window.location.reload();
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

  // First check shortly after mount, then on an interval, and whenever the
  // user comes back to the tab.
  const kick = () => {
    void checkOnce();
  };
  setTimeout(kick, 15_000);
  setInterval(kick, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
  });
  window.addEventListener("focus", kick);
  window.addEventListener("online", kick);
}
