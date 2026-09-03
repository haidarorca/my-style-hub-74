import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CameraOff, Home, Keyboard, Loader2, ScanLine, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScanner, videoPointFromClient } from "@/lib/kawscan/useScanner";
import { ACCESS_STATE_MESSAGES, formatKawscanPrice, unitLabel } from "@/lib/kawscan/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/kawscan/store/$slug")({
  head: () => ({
    meta: [
      { title: "Scanner un produit — KawScan" },
      { name: "description", content: "Scannez un produit pour voir son prix immédiatement." },
      { property: "og:title", content: "Scanner un produit — KawScan" },
      { property: "og:description", content: "Scannez un produit pour voir son prix immédiatement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StoreScanner,
});

type StoreInfo = {
  id: string;
  name: string;
  display_name: string | null;
  logo_url: string | null;
  currency_code: string;
  show_home_button: boolean;
  show_back_button: boolean;
  show_kawzone_link: boolean;
  show_kawzone_logo: boolean;
  access_state: string;
};

type LookupResult = {
  error?: string;
  code?: string;
  name?: string | null;
  unit?: string;
  price?: number;
  promo?: boolean;
  promo_price?: number | null;
  effective_price?: number;
  currency?: string;
  tiers?: { label: string; price: number }[];
};

function StoreScanner() {
  const { slug } = Route.useParams();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [ring, setRing] = useState<{ left: number; top: number; id: number } | null>(null);


  const storeQuery = useQuery({
    queryKey: ["kawscan-store", slug],
    queryFn: async (): Promise<StoreInfo | null> => {
      const { data, error } = await supabase.rpc("kawscan_public_store", { _slug: slug });
      if (error) throw error;
      const rows = (data ?? []) as unknown as StoreInfo[];
      return rows[0] ?? null;
    },
  });

  const store = storeQuery.data;
  const canScan = store?.access_state === "ok";

  const lookup = useCallback(
    async (code: string) => {
      setBusy(true);
      try {
        const { data, error } = await supabase.rpc("kawscan_lookup", { _slug: slug, _code: code });
        if (error) throw error;
        setResult(data as unknown as LookupResult);
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(40);
      } catch {
        setResult({ error: "lookup_failed" });
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  const scanner = useScanner(lookup, Boolean(canScan) && !result);

  const handleTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = videoPointFromClient(scanner.videoRef.current, e.clientX, e.clientY);
    if (!p) return;
    scanner.focusAt(p.x, p.y);
    setRing({ left: p.left, top: p.top, id: Date.now() });
  };


  useEffect(() => {
    document.body.style.background = "#000";
    return () => {
      document.body.style.background = "";
    };
  }, []);

  if (storeQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!store) {
    return <BlockedScreen title="Magasin introuvable" message={ACCESS_STATE_MESSAGES.store_not_found} />;
  }

  if (!canScan) {
    return (
      <BlockedScreen
        title={store.display_name || store.name}
        message={ACCESS_STATE_MESSAGES[store.access_state] ?? "Ce magasin n'est pas disponible."}
      />
    );
  }

  const currency = store.currency_code;

  return (
    <div className="relative min-h-screen bg-black text-white">
      {/* Barre supérieure minimale, entièrement paramétrable par l'admin */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 p-4">
        {store.show_back_button && (
          <button onClick={() => window.history.back()} aria-label="Retour" className="rounded-full bg-white/10 p-2">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {store.show_home_button && (
          <Link to="/" aria-label="Accueil" className="rounded-full bg-white/10 p-2">
            <Home className="h-5 w-5" />
          </Link>
        )}
        <div className="flex items-center gap-2 truncate">
          {store.logo_url && <img src={store.logo_url} alt="" className="h-7 w-7 rounded-full object-cover" />}
          <span className="truncate text-sm font-semibold">{store.display_name || store.name}</span>
        </div>
      </div>

      {/* Caméra */}
      <div className="relative h-screen w-full overflow-hidden" onPointerDown={handleTap}>
        <video ref={scanner.videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-52 w-72 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
        </div>
        {ring && (
          <div
            key={ring.id}
            className="pointer-events-none absolute z-10 h-24 w-24 -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in rounded-full border-2 border-white"
            style={{ left: ring.left, top: ring.top }}
          />
        )}


        {scanner.state === "denied" && (
          <Overlay
            icon={<CameraOff className="h-8 w-8" />}
            title="Caméra refusée"
            message="Autorisez l'accès à la caméra dans les réglages de votre navigateur, puis rechargez la page."
            action={<Button onClick={() => window.location.reload()}>Recharger</Button>}
          />
        )}
        {(scanner.state === "unsupported" || scanner.state === "error") && (
          <Overlay
            icon={<CameraOff className="h-8 w-8" />}
            title="Caméra indisponible"
            message={scanner.error ?? "Votre navigateur ne permet pas le scan. Saisissez le code à la main."}
            action={<Button onClick={() => setManualOpen(true)}>Saisir le code</Button>}
          />
        )}

        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 p-6">
          <p className="text-center text-sm text-white/80">
            Placez le code dans le cadre — touchez l'écran sur le code pour faire la mise au point
          </p>

          <div className="flex gap-3">
            {scanner.torchAvailable && (
              <Button variant="secondary" onClick={() => void scanner.toggleTorch()}>
                <Zap className="mr-2 h-4 w-4" /> {scanner.torchOn ? "Flash activé" : "Flash"}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setManualOpen((v) => !v)}>
              <Keyboard className="mr-2 h-4 w-4" /> Saisir le code
            </Button>
          </div>
          {manualOpen && (
            <form
              className="flex w-full max-w-sm gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manual.trim()) void lookup(manual.trim());
              }}
            >
              <Input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Code du produit"
                inputMode="numeric"
                className="bg-white text-black"
              />
              <Button type="submit" disabled={busy}>OK</Button>
            </form>
          )}
        </div>
      </div>

      {/* Résultat */}
      {result && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/70 p-4" onClick={() => setResult(null)}>
          <div className="rounded-2xl bg-white p-6 text-center text-black" onClick={(e) => e.stopPropagation()}>
            {result.error ? (
              <>
                <h2 className="text-lg font-semibold">Code non reconnu</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {ACCESS_STATE_MESSAGES[result.error] ?? "Impossible de lire ce code. Réessayez."}
                </p>
              </>
            ) : (
              <>
                {result.name && <p className="text-lg font-medium">{result.name}</p>}
                {result.promo && (
                  <p className="text-base text-muted-foreground line-through">
                    {formatKawscanPrice(result.price ?? 0, result.currency ?? currency)}
                  </p>
                )}
                <p className="mt-1 text-5xl font-extrabold tracking-tight">
                  {formatKawscanPrice(result.effective_price ?? 0, result.currency ?? currency)}
                </p>
                {result.unit && result.unit !== "piece" && (
                  <p className="mt-1 text-xl font-medium text-muted-foreground">/ {unitLabel(result.unit)}</p>
                )}
                {result.tiers && result.tiers.length > 0 && (
                  <div className="mt-4 divide-y rounded-lg border text-left">
                    {result.tiers.map((t) => (
                      <div key={t.label} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>{t.label}</span>
                        <span className="font-semibold">
                          {formatKawscanPrice(t.price, result.currency ?? currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <Button className="mt-6 h-12 w-full text-base" onClick={() => setResult(null)}>
              <ScanLine className="mr-2 h-5 w-5" /> Scanner un autre produit
            </Button>
          </div>
        </div>
      )}

      {store.show_kawzone_link && (
        <a
          href="/"
          className="absolute bottom-1 left-0 right-0 z-10 text-center text-[11px] text-white/50"
        >
          Propulsé par Kawzone
        </a>
      )}
    </div>
  );
}

function Overlay({ icon, title, message, action }: { icon: React.ReactNode; title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 px-8 text-center">
      <div className="text-white">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-white/70">{message}</p>
      {action}
    </div>
  );
}

function BlockedScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
