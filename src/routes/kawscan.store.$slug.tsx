import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CameraOff,
  Home,
  Loader2,
  ScanLine,
  Search,
  ScanSearch,
  Clock,
  Hash,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScanner, videoPointFromClient } from "@/lib/kawscan/useScanner";
import { ACCESS_STATE_MESSAGES, formatKawscanPrice, unitLabel } from "@/lib/kawscan/constants";
import { ZoneAnalyzer } from "@/components/kawscan/ZoneAnalyzer";
import type { ZoneAnalysis } from "@/lib/kawscan/zone-analysis";
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

type SearchHit = {
  id: string;
  code: string;
  name: string | null;
  unit: string;
  price: number;
  promo: boolean;
  promo_price: number | null;
  effective_price: number;
  currency: string;
};

/** Un produit sans nom n'est jamais « introuvable » : son code sert de nom. */
function productLabel(p: { name?: string | null; code?: string | null }) {
  const n = (p.name ?? "").trim();
  return n || p.code || "Produit";
}

/** Appel RPC générique (fonctions KawScan non typées dans le client généré). */
const rpc = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Recherches récentes, conservées localement par magasin. */
const recentKey = (slug: string) => `kawscan.recent.${slug}`;
function loadRecent(slug: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(recentKey(slug)) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
function saveRecent(slug: string, term: string): string[] {
  const value = term.trim();
  if (typeof window === "undefined" || value.length < 2) return loadRecent(slug);
  const next = [value, ...loadRecent(slug).filter((x) => x.toLowerCase() !== value.toLowerCase())].slice(0, 8);
  try {
    window.localStorage.setItem(recentKey(slug), JSON.stringify(next));
  } catch {
    /* stockage indisponible */
  }
  return next;
}


function StoreScanner() {
  const { slug } = Route.useParams();
  const router = useRouter();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [capturedFrame, setCapturedFrame] = useState<HTMLCanvasElement | null>(null);
  const [ring, setRing] = useState<{ left: number; top: number; id: number } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  /** Numéro de requête : seule la dernière réponse est affichée (pas de résultat périmé). */
  const searchSeq = useRef(0);

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

  // Le scanner est en pause pendant l'affichage d'un résultat ou d'une recherche.
  const scanner = useScanner(lookup, Boolean(canScan) && !result && !searchOpen && !capturedFrame);

  /** Recherche intelligente : nom, mots dans le désordre, fautes de frappe, code même partiel. */
  const runSearch = useCallback(
    async (q: string) => {
      const text = q.trim();
      const seq = ++searchSeq.current;
      if (text.length < 2) {
        setHits(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const { data, error } = await rpc("kawscan_search", { _slug: slug, _q: text, _limit: 30 });
        if (error) throw new Error(error.message);
        if (seq !== searchSeq.current) return;
        const payload = data as { results?: SearchHit[] } | null;
        setHits(payload?.results ?? []);
      } catch {
        if (seq === searchSeq.current) setHits([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    },
    [slug],
  );

  // Recherche différée pendant la frappe (économie réseau et batterie).
  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => void runSearch(query), 220);
    return () => clearTimeout(t);
  }, [query, searchOpen, runSearch]);

  useEffect(() => {
    if (searchOpen) setRecent(loadRecent(slug));
  }, [searchOpen, slug]);

  /** Ouvre un produit trouvé et mémorise la recherche. */
  const openHit = (hit: SearchHit) => {
    setRecent(saveRecent(slug, productLabel(hit) || hit.code));
    setSearchOpen(false);
    setQuery("");
    setHits(null);
    void lookup(hit.code);
  };

  const handleTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    const p = videoPointFromClient(scanner.videoRef.current, e.clientX, e.clientY);
    if (!p) return;
    scanner.focusAt(p.x, p.y);
    setRing({ left: p.left, top: p.top, id: Date.now() });
  };

  /** Capture ponctuelle haute définition, conservée uniquement en mémoire. */
  const openZoneAnalyzer = async () => {
    setOcrBusy(true);
    try {
      const frame = await scanner.captureFrame();
      if (frame) setCapturedFrame(frame);
      else setResult({ error: "code_not_found" });
    } finally {
      setOcrBusy(false);
    }
  };

  const releaseCapturedFrame = () => {
    setCapturedFrame((frame) => {
      if (frame) frame.width = frame.height = 0;
      return null;
    });
  };

  const handleZoneResult = (analysis: ZoneAnalysis) => {
    releaseCapturedFrame();
    if (!analysis) {
      setResult({ error: "code_not_found" });
      return;
    }
    if (analysis.kind === "barcode") {
      void lookup(analysis.value);
      return;
    }
    setQuery(analysis.value);
    setSearchOpen(true);
    void runSearch(analysis.value);
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void router.navigate({ to: "/" });
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
      {/* Barre supérieure : retour toujours disponible */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 pb-3"
        style={{ paddingTop: "calc(0.75rem + var(--safe-top, 0px))" }}
      >
        <button
          onClick={goBack}
          aria-label="Retour"
          className="flex h-10 items-center gap-1.5 rounded-full bg-white/15 pe-3.5 ps-3 text-sm font-semibold backdrop-blur transition-colors active:bg-white/25"
        >
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={1.75} />
          Retour
        </button>
        {store.show_home_button && (
          <Link
            to="/"
            aria-label="Accueil"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur"
          >
            <Home className="h-4.5 w-4.5" strokeWidth={1.75} />
          </Link>
        )}
        <div className="ms-auto flex min-w-0 items-center gap-2">
          {store.logo_url && <img src={store.logo_url} alt="" className="h-7 w-7 rounded-full object-cover" />}
          <span className="truncate text-sm font-semibold">{store.display_name || store.name}</span>
        </div>
      </div>

      {/* Caméra */}
      <div className="relative h-screen w-full overflow-hidden" onPointerDown={handleTap}>
        <video ref={scanner.videoRef} className="h-full w-full bg-black object-contain" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-[17rem] rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
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
            message={scanner.error ?? "Votre navigateur ne permet pas le scan. Recherchez le produit à la main."}
            action={<Button onClick={() => setSearchOpen(true)}>Rechercher un produit</Button>}
          />
        )}

        {/* Zone d'action basse : recherche + outils, compacte pour ne pas masquer la caméra */}
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 px-4 pt-4"
          style={{ paddingBottom: "calc(1.25rem + var(--safe-bottom, 0px))" }}
        >
          <p className="text-center text-xs text-white/70">
            Placez le code dans le cadre — touchez le code à l'écran pour la mise au point
          </p>

          {scanner.diagnostics && (
            <p className="text-center text-[10px] font-medium text-white/55" aria-label="Qualité caméra réelle">
              Caméra {scanner.diagnostics.width} × {scanner.diagnostics.height}
              {scanner.diagnostics.frameRate ? ` · ${Math.round(scanner.diagnostics.frameRate)} i/s` : ""}
            </p>
          )}

          <button
            onClick={() => {
              setSearchOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 80);
            }}
            className="flex h-12 w-full items-center gap-2.5 rounded-full bg-white px-4 text-start text-sm font-medium text-black shadow-lg"
          >
            <Search className="h-4.5 w-4.5 text-black/50" strokeWidth={1.75} />
            Rechercher un nom ou un code…
          </button>

          <div className="flex items-center justify-center gap-2">
            {scanner.torchAvailable && (
              <ToolButton onClick={() => void scanner.toggleTorch()} active={scanner.torchOn}>
                <Zap className="h-4 w-4" strokeWidth={1.75} /> Flash
              </ToolButton>
            )}
            <ToolButton onClick={() => void openZoneAnalyzer()} disabled={ocrBusy || scanner.state !== "running"}>
              {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" strokeWidth={1.75} />}
              Analyser une zone
            </ToolButton>
          </div>

          {scanner.zoomRange && scanner.zoomRange.max > scanner.zoomRange.min && (
            <input
              type="range"
              aria-label="Zoom"
              min={scanner.zoomRange.min}
              max={scanner.zoomRange.max}
              step={scanner.zoomRange.step}
              value={scanner.zoom}
              onChange={(e) => void scanner.setZoom(Number(e.target.value))}
              className="mx-auto w-48 accent-white"
            />
          )}
        </div>
      </div>

      {capturedFrame && (
        <ZoneAnalyzer source={capturedFrame} onCancel={releaseCapturedFrame} onResult={handleZoneResult} />
      )}

      {/* Recherche manuelle */}
      {searchOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
          <div
            className="flex items-center gap-2 border-b border-border px-3 pb-3"
            style={{ paddingTop: "calc(0.75rem + var(--safe-top, 0px))" }}
          >
            <button
              onClick={() => {
                setSearchOpen(false);
                setHits(null);
                setQuery("");
              }}
              aria-label="Fermer la recherche"
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom, marque ou code (même partiel)"
                className="h-11 w-full ps-9 pe-9"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Rechercher un produit"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch(query);
                  if (e.key === "Escape") setQuery("");
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setHits(null);
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Effacer la recherche"
                  className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* Code saisi en entier : accès direct au prix, sans passer par la liste */}
            {/^\d{6,}$/.test(query.trim()) && (
              <button
                onClick={() => {
                  const code = query.trim();
                  setRecent(saveRecent(slug, code));
                  setSearchOpen(false);
                  setQuery("");
                  setHits(null);
                  void lookup(code);
                }}
                className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3 text-start text-sm font-semibold text-primary"
              >
                <Hash className="h-4 w-4" strokeWidth={1.75} />
                Voir le prix du code {query.trim()}
              </button>
            )}

            {searching && (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}

            {!searching && hits && hits.length > 0 && (
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {hits.length} résultat{hits.length > 1 ? "s" : ""}
              </p>
            )}

            {!searching && hits?.length === 0 && query.trim().length >= 2 && (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">Aucun produit ne correspond à « {query.trim()} ».</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Essayez un mot plus court, une autre orthographe ou quelques chiffres du code.
                </p>
              </div>
            )}

            {!searching && !hits && (
              <div className="pt-2">
                {recent.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between px-1 pb-1.5">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Clock className="h-3 w-3" /> Recherches récentes
                      </span>
                      <button
                        onClick={() => {
                          try {
                            window.localStorage.removeItem(recentKey(slug));
                          } catch {
                            /* stockage indisponible */
                          }
                          setRecent([]);
                        }}
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        Effacer
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recent.map((term) => (
                        <button
                          key={term}
                          onClick={() => {
                            setQuery(term);
                            void runSearch(term);
                          }}
                          className="max-w-full truncate rounded-full border border-border bg-card px-3 py-1.5 text-xs"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Saisissez un nom (« Coca »), plusieurs mots (« casa 200 »), une orthographe approximative
                  ou quelques chiffres du code (« 0996 »).
                </p>
              </div>
            )}

            <ul className="space-y-2">
              {(hits ?? []).map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => openHit(h)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-start transition-colors hover:border-primary/30"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{productLabel(h)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{h.code}</span>
                    </span>
                    <span className="shrink-0 text-base font-extrabold text-primary">
                      {formatKawscanPrice(h.effective_price, h.currency ?? currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
                <Button variant="outline" className="mt-4 h-11 w-full" onClick={() => { setResult(null); setSearchOpen(true); }}>
                  <Search className="mr-2 h-4 w-4" /> Rechercher à la main
                </Button>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">{productLabel(result)}</p>
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
            <Button className="mt-6 h-12 w-full text-base" disabled={busy} onClick={() => setResult(null)}>
              <ScanLine className="mr-2 h-5 w-5" /> Scanner un autre produit
            </Button>
          </div>
        </div>
      )}

      {store.show_kawzone_link && !searchOpen && (
        <a href="/" className="absolute bottom-1 left-0 right-0 z-10 text-center text-[11px] text-white/50">
          Propulsé par Kawzone
        </a>
      )}
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 items-center gap-2 rounded-full px-4 text-xs font-semibold backdrop-blur transition-colors disabled:opacity-60 ${
        active ? "bg-white text-black" : "bg-white/15 text-white active:bg-white/25"
      }`}
    >
      {children}
    </button>
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
