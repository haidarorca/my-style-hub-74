import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function isHashedAsset(url: string): boolean {
  return url.includes("/assets/") || url.includes("/_build/");
}

function currentFingerprint(): string {
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
      .map((m) => m[1]).filter(isHashedAsset);
    const styles = Array.from(html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi))
      .map((m) => m[1]).filter(isHashedAsset);
    const styles2 = Array.from(html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi))
      .map((m) => m[1]).filter(isHashedAsset);
    return [...scripts, ...styles, ...styles2].sort().join("|");
  } catch {
    return null;
  }
}

async function purgeAndReload() {
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch { /* ignore */ }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
    }
  } catch { /* ignore */ }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

interface Props {
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  fullWidth?: boolean;
}

export function UpdateAppButton({ variant = "outline", className, fullWidth }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    const toastId = toast.loading("Recherche de mise à jour en cours…");
    try {
      const local = currentFingerprint();
      const remote = await remoteFingerprint();

      if (remote && local && remote === local) {
        toast.success("Votre application est déjà à jour.", { id: toastId });
        setLoading(false);
        // Still offer a hard refresh in case state is stuck
        return;
      }

      toast.success("Application mise à jour avec succès. La page va se recharger.", {
        id: toastId,
        duration: 2000,
      });
      setTimeout(() => { void purgeAndReload(); }, 1200);
    } catch {
      toast.error("Impossible de vérifier la mise à jour. Rechargement…", { id: toastId });
      setTimeout(() => { void purgeAndReload(); }, 1200);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      onClick={handleClick}
      disabled={loading}
      className={`${fullWidth ? "w-full" : ""} ${className ?? ""}`}
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Vérification…" : "Mettre à jour l'application"}
    </Button>
  );
}
