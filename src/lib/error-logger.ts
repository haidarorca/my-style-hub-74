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

let installed = false;
export function installGlobalErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const maybeDisableAdminOcr = (message: string) => {
    if (!/ocr|variant|createobjecturl|filereader|canvas|image/i.test(message)) return;
    try {
      const failures = Number(localStorage.getItem("admin:ocr-failures") ?? "0") + 1;
      localStorage.setItem("admin:ocr-failures", String(failures));
      if (failures >= 2 || window.innerWidth < 640) localStorage.setItem("admin:ocr-disabled", "1");
    } catch {
      /* ignore */
    }
  };

  window.addEventListener("error", (e) => {
    const message = e.message || String(e.error ?? "Unknown error");
    logError({
      type: "error",
      message,
      stack: e.error?.stack,
      source: e.filename,
      url: window.location.href,
    });
    maybeDisableAdminOcr(message);
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
    maybeDisableAdminOcr(message);
  });
}
