import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "kawzone.install_banner_dismissed_at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 14; // 14 jours

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_MS;
  } catch {
    return false;
  }
}

export function InstallAppBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [samsung, setSamsung] = useState(false);

  const openInChrome = () => {
    const { host, pathname, search } = window.location;
    window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent("https://play.google.com/store/apps/details?id=com.android.chrome")};end`;
  };

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS ne supporte pas beforeinstallprompt : on affiche une aide manuelle
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos) {
      timer = setTimeout(() => {
        setIosHint(true);
        setVisible(true);
      }, 2500);
    }
    // Samsung Internet fabrique une application signalée par Play Protect :
    // on propose d'installer via Chrome à la place.
    if (/SamsungBrowser/i.test(ua) && /Android/i.test(ua)) {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      timer = setTimeout(() => {
        setSamsung(true);
        setVisible(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Sécurité supplémentaire : si l'app passe en mode installé, on cache
  useEffect(() => {
    if (!visible) return;
    const mq = window.matchMedia("(display-mode: standalone)");
    const handler = () => mq.matches && setVisible(false);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "accepted") setVisible(false);
    else dismiss();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] px-3 pt-[env(safe-area-inset-top)] animate-in slide-in-from-top duration-500">
      <div className="mx-auto mt-2 max-w-2xl overflow-hidden rounded-2xl border border-primary/20 shadow-2xl">
        <div className="gradient-primary flex items-center gap-3 p-3 text-primary-foreground">
          <img
            src="/icon-192.png"
            alt="KawZone"
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl bg-background/10 shadow-md"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold leading-tight">Installer KawZone</p>
            <p className="text-[11px] leading-snug opacity-90">
              {iosHint
                ? "Appuyez sur Partager puis « Sur l’écran d’accueil »"
                : "L’application sur votre téléphone : plus rapide, sans navigateur."}
            </p>
          </div>
          {iosHint ? (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-background/20 px-3 py-2 text-xs font-bold">
              <Share className="h-4 w-4" />
              Partager
            </div>
          ) : (
            <Button
              onClick={samsung ? openInChrome : install}
              size="sm"
              variant="secondary"
              className="shrink-0 rounded-full px-4 font-extrabold shadow-md"
            >
              <Download className="mr-1 h-4 w-4" />
              {samsung ? "Ouvrir Chrome" : "Installer"}
            </Button>
          )}
          <button
            onClick={dismiss}
            aria-label="Fermer"
            className="shrink-0 rounded-full p-1 opacity-80 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default InstallAppBanner;
