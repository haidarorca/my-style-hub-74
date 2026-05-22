import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, X } from "lucide-react";

// Verifie l'empreinte des assets de la page courante vs celle servie
// par le proxy. On reutilise la meme logique que build-version-watcher
// pour ne pas dependre d'un Service Worker de cache (le projet en a
// volontairement supprime pour eviter les ecrans figes).

const CHECK_INTERVAL_MS = 60_000; // 1 min
const AUTO_RELOAD_DELAY_S = 10;

function isHashedAsset(url: string): boolean {
  return url.includes("/assets/") || url.includes("/_build/");
}

function currentFingerprint(): string {
  if (typeof document === "undefined") return "";
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
    .map((s) => s.getAttribute("src") || "")
    .filter(isHashedAsset);
  const styles = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
  )
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
    const styles = Array.from(
      html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi),
    )
      .map((m) => m[1])
      .filter(isHashedAsset);
    const styles2 = Array.from(
      html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi),
    )
      .map((m) => m[1])
      .filter(isHashedAsset);
    return [...scripts, ...styles, ...styles2].sort().join("|");
  } catch {
    return null;
  }
}

async function hardReload() {
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
      // Demande au SW kill-switch d'activer immediatement la nouvelle version
      regs.forEach((r) => {
        try {
          r.waiting?.postMessage({ type: "SKIP_WAITING" });
        } catch {
          // ignore
        }
      });
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

export default function AutoUpdatePrompt() {
  const [nouvelleVersion, setNouvelleVersion] = useState(false);
  const [compteur, setCompteur] = useState(AUTO_RELOAD_DELAY_S);
  const [visible, setVisible] = useState(true);
  const initialFp = useRef<string | null>(null);
  const compteurInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectuerMiseAJour = useCallback(() => {
    void hardReload();
  }, []);

  // 1. Initialise l'empreinte et lance la verification periodique
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.self !== window.top) return; // ignore iframe preview
    } catch {
      return;
    }
    const host = window.location.hostname;
    if (host.includes("lovableproject.com") || host.includes("id-preview--")) return;

    initialFp.current = currentFingerprint();
    if (!initialFp.current) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    // CORRECTION: try/catch pour eviter que le setInterval ne s'arrete sur erreur reseau
    const check = async () => {
      if (cancelled || nouvelleVersion) return;
      try {
        const remote = await remoteFingerprint();
        if (cancelled || !remote || !initialFp.current) return;
        if (remote !== initialFp.current) setNouvelleVersion(true);
      } catch {
        // Ignorer les erreurs reseau pendant la verification
      }
    };

    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // CORRECTION: Stocker le timeout pour le nettoyer dans le cleanup
    timeoutId = window.setTimeout(check, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearTimeout(timeoutId); // CORRECTION: Nettoyage du timeout initial
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [nouvelleVersion]);

  // 2. Compteur 10s avec reset sur activite
  const startCompteur = useCallback(() => {
    if (compteurInterval.current) clearInterval(compteurInterval.current);
    setCompteur(AUTO_RELOAD_DELAY_S);
    compteurInterval.current = setInterval(() => {
      setCompteur((prev) => {
        if (prev <= 1) {
          effectuerMiseAJour();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [effectuerMiseAJour]);

  useEffect(() => {
    if (!nouvelleVersion) return;
    startCompteur();
    const evenements = ["mousemove", "keydown", "click", "scroll", "touchstart", "input"];
    const reset = () => startCompteur();
    evenements.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));
    return () => {
      evenements.forEach((evt) => window.removeEventListener(evt, reset));
      if (compteurInterval.current) clearInterval(compteurInterval.current);
    };
  }, [nouvelleVersion, startCompteur]);

  const fermerBouton = () => setVisible(false);

  if (!nouvelleVersion || !visible) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 max-w-sm sm:bottom-4">
      <div className="animate-in slide-in-from-bottom-4 rounded-lg border border-primary/40 bg-primary px-4 py-3 text-primary-foreground shadow-2xl">
        <div className="flex items-start gap-3">
          <RefreshCw size={20} className="mt-0.5 animate-spin" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Nouvelle version disponible</p>
            <p className="mt-1 text-xs opacity-90">
              Mise a jour automatique dans{" "}
              <span className="font-bold">{compteur}s</span>
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={effectuerMiseAJour}
                className="rounded bg-background px-3 py-1.5 text-xs font-bold text-foreground transition hover:opacity-90"
              >
                Mettre a jour maintenant
              </button>
              <button
                onClick={fermerBouton}
                className="px-2 py-1.5 text-xs opacity-80 transition hover:opacity-100"
              >
                Plus tard
              </button>
            </div>
          </div>
          <button
            onClick={fermerBouton}
            className="opacity-70 hover:opacity-100"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/20">
          <div
            className="h-full bg-background transition-all duration-1000 ease-linear"
            style={{ width: `${(compteur / AUTO_RELOAD_DELAY_S) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
