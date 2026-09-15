/**
 * Tracking comportemental — point d'entrée unique.
 *
 * Toutes les surfaces du site émettent leurs événements via `useTracker()`.
 * Aucun autre système de suivi ne doit être créé.
 */
import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EVENT_WEIGHTS, getAnonId } from "@/lib/reco/engine";

export type TrackType =
  | "view"
  | "search"
  | "category_view"
  | "card_click"
  | "add_to_cart"
  | "remove_from_cart"
  | "purchase"
  | "favorite"
  | "reco_click"
  | "dwell";

export interface TrackPayload {
  productId?: string | null;
  categoryId?: string | null;
  query?: string | null;
  dwellMs?: number | null;
}

/** Anti-spam : un même événement n'est envoyé qu'une fois par session. */
const sent = new Set<string>();

export function useTracker() {
  const { user } = useAuth();

  return useCallback(
    (type: TrackType, payload: TrackPayload = {}) => {
      if (typeof window === "undefined") return;
      const anonId = getAnonId();
      const dedupeKey = `${type}:${payload.productId ?? ""}:${payload.categoryId ?? ""}:${payload.query ?? ""}`;
      // Les événements "faibles" (vue, consultation catégorie) sont dédoublonnés
      // pour ne pas gonfler artificiellement les statistiques (refresh, retour arrière).
      if (type === "view" || type === "category_view" || type === "dwell") {
        if (sent.has(dedupeKey)) return;
        sent.add(dedupeKey);
      }
      void (supabase as any)
        .from("user_events")
        .insert({
          user_id: user?.id ?? null,
          anon_id: anonId,
          type,
          product_id: payload.productId ?? null,
          category_id: payload.categoryId ?? null,
          query: payload.query ? payload.query.slice(0, 120) : null,
          dwell_ms: payload.dwellMs ?? null,
          weight: EVENT_WEIGHTS[type] ?? 1,
        })
        .then(undefined, () => {
          /* le tracking ne doit jamais casser l'expérience */
        });
    },
    [user?.id],
  );
}

/** Enregistre une consultation produit (une seule fois par session). */
export function useTrackProductView(productId?: string | null, categoryId?: string | null) {
  const track = useTracker();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!productId || done.current === productId) return;
    done.current = productId;
    track("view", { productId, categoryId });
  }, [productId, categoryId, track]);
}
