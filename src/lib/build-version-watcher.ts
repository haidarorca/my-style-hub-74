// ═══════════════════════════════════════════════════════════════
// Gestion des versions de KawZone (site + application installée).
//
// Chaque publication porte une version unique (__KAWZONE_VERSION__,
// ex. 2026.09.24.165512), compilée à la fois dans le code du navigateur et
// dans le serveur. /api/public/version renvoie la version publiée, sans
// cache. Si elle diffère de celle du code chargé → la page recharge sur la
// nouvelle version (HTML + JS + CSS cohérents, serveur à jour).
//
// Quand :
//  • au lancement de l'application installée (immédiatement),
//  • au retour au premier plan (l'appli installée reste souvent en mémoire
//    des heures avec l'ancien code : c'était la cause des bugs),
//  • au retour du réseau, et toutes les 5 minutes.
// Rechargement automatique si c'est sans risque (appli installée, retour au
// premier plan, ou onglet caché) ; sinon message « Mettre à jour ».
//
// Le rechargement ne touche jamais au localStorage / sessionStorage /
// IndexedDB (connexion, panier, langue, préférences conservés).
// ═══════════════════════════════════════════════════════════════

import { toast } from "sonner";

export const APP_VERSION: string = typeof __KAWZONE_VERSION__ === "string" ? __KAWZONE_VERSION__ : "dev";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const RELOAD_GUARD_KEY = "kawzone:update-reload-at";
const DIAG_KEY = "kawzone:pwa-diag";

export interface PwaDiag {
  installedVersion: string;
  availableVersion: string | null;
  lastCheckAt: string | null;
  lastUpdateAt: string | null;
  lastUpdateFrom: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export function readPwaDiag(): PwaDiag {
  let d: Partial<PwaDiag> = {};
  try { d = JSON.parse(localStorage.getItem(DIAG_KEY) || "{}"); } catch { /* ignore */ }
  return {
    installedVersion: APP_VERSION,
    availableVersion: d.availableVersion ?? null,
    lastCheckAt: d.lastCheckAt ?? null,
    lastUpdateAt: d.lastUpdateAt ?? null,
    lastUpdateFrom: d.lastUpdateFrom ?? null,
    lastError: d.lastError ?? null,
    lastErrorAt: d.lastErrorAt ?? null,
  };
}
function writeDiag(patch: Partial<PwaDiag>) {
  try { localStorage.setItem(DIAG_KEY, JSON.stringify({ ...readPwaDiag(), ...patch })); } catch { /* ignore */ }
}

export function isStandalonePwa(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  } catch { /* ignore */ }
  return false;
}

export async function fetchAvailableVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/api/public/version?t=${Date.now()}`, { cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    const j = (await res.json()) as { version?: string };
    return typeof j.version === "string" ? j.version : null;
  } catch {
    return null;
  }
}

/** Recharge sur la nouvelle version (une fois par 30 s max, sans toucher aux données locales). */
export function reloadToLatest(reason: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || "0");
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch { /* ignore */ }
  writeDiag({ lastUpdateAt: new Date().toISOString(), lastUpdateFrom: `${APP_VERSION} (${reason})` });
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
  return true;
}

let started = false;
let pending: string | null = null;
let toastShown = false;

function isStaleCodeError(msg: string): boolean {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading CSS chunk|Unable to preload CSS|Server function info not found/i.test(msg);
}

async function check(trigger: "launch" | "resume" | "online" | "interval") {
  if (!navigator.onLine) return;
  const available = await fetchAvailableVersion();
  writeDiag({ lastCheckAt: new Date().toISOString(), ...(available ? { availableVersion: available } : {}) });
  if (!available || available === APP_VERSION) return;
  pending = available;
  // Sans risque : lancement / retour au premier plan / appli installée / onglet caché.
  if (trigger === "launch" || trigger === "resume" || isStandalonePwa() || document.visibilityState === "hidden") {
    reloadToLatest(`${trigger} → ${available}`);
    return;
  }
  if (!toastShown) {
    toastShown = true;
    toast("Une nouvelle version de Kawzone est disponible.", {
      duration: Infinity,
      action: { label: "Mettre à jour", onClick: () => reloadToLatest(`bouton → ${available}`) },
    });
  }
}

export function startBuildVersionWatcher(): void {
  if (started || typeof window === "undefined") return;
  try { if (window.self !== window.top) return; } catch { return; }
  const host = window.location.hostname;
  if (host.includes("lovableproject.com") || host.includes("id-preview--") || APP_VERSION === "dev") return;
  started = true;

  // Ancien morceau de code introuvable après une publication → recharger.
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    writeDiag({ lastError: "Fichier de l'ancienne version introuvable", lastErrorAt: new Date().toISOString() });
    reloadToLatest("fichier obsolète");
  });
  const onErr = (msg: string) => {
    if (!isStaleCodeError(msg)) return;
    writeDiag({ lastError: msg.slice(0, 300), lastErrorAt: new Date().toISOString() });
    reloadToLatest("code obsolète");
  };
  window.addEventListener("unhandledrejection", (e) => onErr(String((e.reason as Error)?.message ?? e.reason ?? "")));
  window.addEventListener("error", (e) => onErr(String(e.message ?? "")));

  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      // Une mise à jour en attente s'applique pendant que l'appli est cachée.
      if (pending) reloadToLatest(`arrière-plan → ${pending}`);
    } else if (hiddenAt) {
      void check("resume");
    }
  });
  window.addEventListener("online", () => void check("online"));
  setInterval(() => void check("interval"), CHECK_INTERVAL_MS);
  void check("launch");
}
