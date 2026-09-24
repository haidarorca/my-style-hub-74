/**
 * Module « Images sensibles » — indépendant.
 * Règle : Catégorie (ou un de ses parents) marquée sensible + genre (femme/homme).
 * Le visiteur voit l'image seulement si son genre (compte, ou confirmé sur
 * l'appareil) correspond. Sinon, l'image n'est JAMAIS chargée : placeholder.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type SensitiveGender = "femme" | "homme";
const STORAGE_KEY = "kz_confirmed_gender";
const EVENT = "kz-gender-confirmed";

type Row = { id: string; parent_id: string | null; sensitive_images: boolean; sensitive_gender: SensitiveGender | null };

/** Map catégorie → genre effectif (hérité du parent le plus proche marqué). */
function useSensitiveMap() {
  return useQuery({
    queryKey: ["sensitive-images", "rules"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("categories")
        .select("id, parent_id, sensitive_images, sensitive_gender");
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const out = new Map<string, SensitiveGender>();
      for (const r of rows) {
        let cur: Row | undefined = r;
        let guard = 0;
        while (cur && guard++ < 10) {
          if (cur.sensitive_images) {
            out.set(r.id, cur.sensitive_gender ?? "femme");
            break;
          }
          cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
        }
      }
      return out;
    },
  });
}

export function confirmGender(g: SensitiveGender) {
  try { localStorage.setItem(STORAGE_KEY, g); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

function useViewerGender(): { gender: SensitiveGender | null; fromAccount: boolean } {
  const { profile } = useAuth();
  const [local, setLocal] = useState<SensitiveGender | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        setLocal(v === "femme" || v === "homme" ? v : null);
      } catch { setLocal(null); }
    };
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(EVENT, read); window.removeEventListener("storage", read); };
  }, []);
  if (profile?.sex) return { gender: profile.sex, fromAccount: true };
  return { gender: local, fromAccount: false };
}

export interface SensitiveState {
  /** true = ne pas charger l'image. */
  hidden: boolean;
  /** true = règles pas encore chargées (ne rien charger, placeholder neutre). */
  pending: boolean;
  sensitive: boolean;
  canConfirm: boolean;
}

/** Décisions par produit (sensible, ou correction manuelle « non sensible »). */
function useProductMap() {
  return useQuery({
    queryKey: ["sensitive-images", "products"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out = new Map<string, SensitiveGender | null>();
      for (let from = 0; from < 20000; from += 1000) {
        const { data, error } = await (supabase as any)
          .from("product_image_sensitivity")
          .select("product_id, decision, audience, source")
          .or("decision.eq.sensitive,source.eq.MANUAL")
          .range(from, from + 999);
        if (error) throw error;
        for (const r of data ?? []) {
          if (r.decision === "sensitive") out.set(r.product_id, r.audience ?? "femme");
          else if (r.decision === "normal") out.set(r.product_id, null);
        }
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
}

export function useSensitiveImage(categoryId: string | null | undefined, productId?: string | null): SensitiveState {
  const { data, isLoading } = useSensitiveMap();
  const { data: pmap, isLoading: pLoading } = useProductMap();
  const { gender, fromAccount } = useViewerGender();
  return useMemo(() => {
    if (!categoryId && !productId) return { hidden: false, pending: false, sensitive: false, canConfirm: false };
    if (isLoading || !data || (productId && (pLoading || !pmap))) return { hidden: true, pending: true, sensitive: false, canConfirm: false };
    const target = productId && pmap!.has(productId) ? pmap!.get(productId) : categoryId ? data.get(categoryId) : undefined;
    if (!target) return { hidden: false, pending: false, sensitive: false, canConfirm: false };
    return { hidden: gender !== target, pending: false, sensitive: true, canConfirm: !fromAccount };
  }, [categoryId, productId, data, pmap, isLoading, pLoading, gender, fromAccount]);
}

/** Placeholder « Image masquée » (+ confirmation du genre si autorisée). */
export function MaskedImage({ withConfirm, compact }: { withConfirm?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (compact) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-3 text-center text-muted-foreground">
      <Lock className="h-5 w-5" />
      <span className="text-xs font-medium">Image masquée</span>
      {withConfirm && !open && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
          className="text-xs underline"
        >
          Cliquez pour afficher cette image et confirmer votre genre.
        </button>
      )}
      {withConfirm && open && (
        <div className="mt-1 space-y-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <p className="text-xs">Confirmez votre genre :</p>
          <div className="flex justify-center gap-2">
            {(["femme", "homme"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => confirmGender(g)}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground hover:border-primary"
              >
                {g === "femme" ? "Femme" : "Homme"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Miniature simple protégée (recherche, suggestions…). */
export function SensitiveThumb({ categoryId, productId, src, alt, className }: { categoryId?: string | null; productId?: string | null; src?: string | null; alt: string; className?: string }) {
  const s = useSensitiveImage(categoryId, productId);
  if (!src) return null;
  if (s.hidden) return s.pending ? null : <MaskedImage compact />;
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />;
}
