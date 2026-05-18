import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearErrorLog, logError } from "@/lib/error-logger";

type Props = {
  children: ReactNode;
  label?: string;
  /** When this value changes, the boundary auto-resets (e.g. pass pathname). */
  resetKey?: string | number | null;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = {
  error: Error | null;
  info: ErrorInfo | null;
  lastResetKey: string | number | null;
};

/** Detect "stale chunk after deploy" errors — common cause of PWA blank screens. */
function isChunkLoadError(error: Error): boolean {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return (
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|Loading CSS chunk/i.test(
      msg,
    )
  );
}

async function hardReloadForNewBuild() {
  try {
    const key = "kawzone:chunk-recover-at";
    const last = Number(sessionStorage.getItem(key) || "0");
    // Only attempt once per 30s to avoid reload loops.
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // ignore
  }
  try {
    if (typeof caches !== "undefined") {
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
  return true;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null, lastResetKey: this.props.resetKey ?? null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Auto-reset when the resetKey (e.g. route pathname) changes.
    if (props.resetKey !== state.lastResetKey) {
      return { error: null, info: null, lastResetKey: props.resetKey ?? null };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError({
      type: "manual",
      message: `${this.props.label ?? "UI"}: ${error.message}`,
      stack: `${error.stack ?? ""}\n${info.componentStack ?? ""}`,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
    this.props.onError?.(error, info);
    this.setState({ info });

    // Stale chunk after a fresh deploy → hard-reload onto the new build.
    if (isChunkLoadError(error)) {
      void hardReloadForNewBuild();
    }
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const chunkError = isChunkLoadError(this.state.error);

    return (
      <div className="min-h-[70vh] bg-background px-4 py-6 text-foreground">
        <div className="mx-auto max-w-xl space-y-4 rounded-lg border bg-card p-4 shadow-card">
          <div>
            <h1 className="text-lg font-semibold">
              {chunkError ? "Mise à jour en cours…" : "Application stabilisée"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {chunkError
                ? "Nouvelle version détectée. L'application se recharge automatiquement."
                : "Une erreur a été interceptée avant l'écran blanc. Vous pouvez réessayer ou revenir à l'accueil."}
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <div className="font-medium">Erreur</div>
            <div className="mt-1 break-words text-muted-foreground">
              {this.state.error.message || "Erreur inconnue"}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Réessayer
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground"
            >
              Accueil
            </a>
            <button
              type="button"
              onClick={() => void hardReloadForNewBuild()}
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium text-foreground"
            >
              Recharger l'app
            </button>
            <button
              type="button"
              onClick={clearErrorLog}
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              Effacer logs
            </button>
          </div>
        </div>
      </div>
    );
  }
}
