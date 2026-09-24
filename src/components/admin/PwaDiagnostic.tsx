import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { APP_VERSION, fetchAvailableVersion, isStandalonePwa, readPwaDiag, reloadToLatest, type PwaDiag } from "@/lib/build-version-watcher";

interface State {
  diag: PwaDiag;
  available: string | null;
  sw: string;
  caches: string;
  standalone: boolean;
  ua: string;
  platform: string;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR") : "—");

/** Diagnostic de l'application installée — réservé à l'administration. */
export function PwaDiagnostic() {
  const [s, setS] = useState<State | null>(null);
  async function load() {
    let sw = "Aucun (normal)";
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      if (regs?.length) sw = regs.map((r) => `${r.active?.scriptURL ?? "?"} (${r.active?.state ?? r.installing?.state ?? r.waiting?.state ?? "?"})`).join(", ");
    } catch { sw = "Indisponible"; }
    let cs = "Aucun (normal)";
    try { const k = await caches.keys(); if (k.length) cs = k.join(", "); } catch { cs = "Indisponible"; }
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    setS({
      diag: readPwaDiag(), available: await fetchAvailableVersion(), sw, caches: cs, standalone: isStandalonePwa(),
      ua: navigator.userAgent, platform: nav.userAgentData?.platform ?? navigator.platform ?? "—",
    });
  }
  useEffect(() => { void load(); }, []);
  const rows: Array<[string, string]> = s ? [
    ["Version chargée", APP_VERSION],
    ["Version publiée", s.available ?? "Injoignable"],
    ["État", s.available && s.available !== APP_VERSION ? "Mise à jour disponible" : "À jour"],
    ["Application installée", s.standalone ? "Oui (ouverte depuis l'icône)" : "Non (navigateur)"],
    ["Service Worker", s.sw],
    ["Cache applicatif", s.caches],
    ["Dernière vérification", fmt(s.diag.lastCheckAt)],
    ["Dernière mise à jour", s.diag.lastUpdateAt ? `${fmt(s.diag.lastUpdateAt)} — depuis ${s.diag.lastUpdateFrom}` : "—"],
    ["Dernière erreur de chargement", s.diag.lastError ? `${fmt(s.diag.lastErrorAt)} — ${s.diag.lastError}` : "Aucune"],
    ["Plateforme", s.platform],
    ["Navigateur", s.ua],
  ] : [];
  return (
    <Card>
      <CardHeader><CardTitle>Diagnostic de l'application (PWA)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!s ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[220px_1fr]">
            {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></div>)}
          </dl>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>Actualiser</Button>
          {s?.available && s.available !== APP_VERSION && <Button size="sm" onClick={() => reloadToLatest("admin")}>Mettre à jour maintenant</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
