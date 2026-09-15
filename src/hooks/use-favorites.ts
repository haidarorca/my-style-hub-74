/**
 * Favoris client. Un produit ne peut jamais être enregistré deux fois
 * (contrainte de clé primaire côté base).
 *
 * Visiteur non connecté : l'intention est mémorisée localement puis rejouée
 * automatiquement après la connexion.
 */
import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTracker } from "@/hooks/use-tracker";

const PENDING_KEY = "dk-pending-favorites";

function readPending(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch {
    return [];
  }
}

function writePending(ids: string[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* ignore */
  }
}

export function useFavorites() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const track = useTracker();

  const { data: favorites } = useQuery({
    queryKey: ["favorites", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("favorites")
        .select("product_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<{ product_id: string }>).map((r) => r.product_id);
    },
  });

  const ids = favorites ?? [];

  const add = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await (supabase as any)
        .from("favorites")
        .insert({ user_id: user!.id, product_id: productId });
      // 23505 = déjà en favori : ce n'est pas une erreur pour l'utilisateur.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: (_d, productId) => {
      track("favorite", { productId });
      void qc.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await (supabase as any)
        .from("favorites")
        .delete()
        .eq("user_id", user!.id)
        .eq("product_id", productId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  // Rejoue les favoris enregistrés avant connexion.
  useEffect(() => {
    if (!user?.id) return;
    const pending = readPending();
    if (pending.length === 0) return;
    void (async () => {
      for (const product_id of pending) {
        await (supabase as any).from("favorites").insert({ user_id: user.id, product_id });
      }
      writePending([]);
      void qc.invalidateQueries({ queryKey: ["favorites"] });
    })();
  }, [user?.id, qc]);

  const isFavorite = useCallback((productId: string) => ids.includes(productId), [ids]);

  const toggle = useCallback(
    (productId: string) => {
      if (!user?.id) {
        const pending = readPending();
        writePending([...pending, productId]);
        return { needsLogin: true } as const;
      }
      if (ids.includes(productId)) remove.mutate(productId);
      else add.mutate(productId);
      return { needsLogin: false } as const;
    },
    [user?.id, ids, add, remove],
  );

  return { ids, isFavorite, toggle, isPending: add.isPending || remove.isPending };
}
