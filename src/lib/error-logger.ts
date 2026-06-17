// Lightweight client-side error logger with a hard cap.
// Persists in localStorage so devs/admins can inspect after refresh.

export type LoggedError = {
  ts: number;
  type: "error" | "unhandledrejection" | "manual";
  message: string;
  stack?: string;
  url?: string;
  source?: string;
};

const KEY = "app:error-log";
const MAX_ENTRIES = 50;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20; // stop logging if >20 errors in 10s to avoid loops
let recent: number[] = [];

function read(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LoggedError[]) : [];
  } catch {
    return [];
  }
}

function write(list: LoggedError[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    // quota — drop everything and retry once
    try {
      localStorage.removeItem(KEY);
      localStorage.setItem(KEY, JSON.stringify(list.slice(-10)));
    } catch {
      /* give up */
    }
  }
}

function shouldThrottle(): boolean {
  const now = Date.now();
  recent = recent.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) return true;
  recent.push(now);
  return false;
}

export function logError(entry: Omit<LoggedError, "ts">) {
  if (shouldThrottle()) return;
  const list = read();
  list.push({ ...entry, ts: Date.now() });
  write(list);
}

export function getErrorLog(): LoggedError[] {
  return read();
}

export function clearErrorLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// Detect stale-chunk errors from a previous deploy whose hashed JS/CSS files
// no longer exist on the server. On installed PWAs and devices with aggressive
// caching this leaves users on a blank page after deploy. We auto-recover by
// purging caches and hard-reloading once (guarded via sessionStorage to avoid
// reload loops).
const STALE_RELOAD_KEY = "kawzone:stale-chunk-reload-at";
const STALE_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "Loading chunk",
  "Loading CSS chunk",
  "ChunkLoadError",
];

function looksLikeStaleChunkError(message: string): boolean {
  if (!message) return false;
  return STALE_PATTERNS.some((p) => message.includes(p));
}

async function purgeAndReload() {
  try {
    const last = Number(sessionStorage.getItem(STALE_RELOAD_KEY) || "0");
    if (Date.now() - last < 30_000) return; // already tried recently
    sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
  } catch {
    // ignore — still try to reload
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

let installed = false;
export function installGlobalErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    const message = e.message || String(e.error ?? "Unknown error");
    logError({
      type: "error",
      message,
      stack: e.error?.stack,
      source: e.filename,
      url: window.location.href,
    });
    if (looksLikeStaleChunkError(message) || looksLikeStaleChunkError(e.error?.stack ?? "")) {
      void purgeAndReload();
    }
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason: any = e.reason;
    const message = reason?.message ?? String(reason);
    logError({
      type: "unhandledrejection",
      message,
      stack: reason?.stack,
      url: window.location.href,
    });
    if (looksLikeStaleChunkError(message) || looksLikeStaleChunkError(reason?.stack ?? "")) {
      void purgeAndReload();
    }
  });
}
