import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

type Props = { children: ReactNode; thresholdMs?: number };

/**
 * Watches router pending state + a soft timer on every route change.
 * If a navigation/load takes longer than `thresholdMs`, surface a
 * recovery banner so the user can unblock the PWA without reinstalling.
 */
export function StuckLoadingDetector({ children, thresholdMs = 15_000 }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    setStuck(false);
    const id = window.setTimeout(() => setStuck(true), thresholdMs);
    return () => window.clearTimeout(id);
  }, [pathname, isLoading, thresholdMs]);

  const handleReset = () => {
    setStuck(false);
    queryClient.cancelQueries();
    queryClient.invalidateQueries();
    router.invalidate();
  };

  return (
    <>
      {stuck && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">Chargement plus long que prévu</div>
            <div className="text-xs opacity-80">Si la page reste bloquée, relancez sans recharger toute l'application.</div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Réinitialiser cette page
          </button>
        </div>
      )}
      {children}
    </>
  );
}
