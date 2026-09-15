import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_DISPLAY,
  normalizeDisplay,
  type DisplayConfig,
} from "@/lib/display/display-config";

export interface DisplayPresetRow {
  id: string;
  scope: "global" | "category" | "product";
  scope_id: string | null;
  config: unknown;
}

export function useDisplayPresets() {
  return useQuery({
    queryKey: ["display-presets"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("display_presets")
        .select("id, scope, scope_id, config");
      if (error) throw error;
      return (data ?? []) as DisplayPresetRow[];
    },
  });
}

/**
 * Résolution en cascade : produit > catégorie > global > défaut.
 */
export function useResolveDisplay() {
  const { data: presets } = useDisplayPresets();

  const global = normalizeDisplay(
    presets?.find((p) => p.scope === "global")?.config,
    DEFAULT_DISPLAY,
  );

  const resolve = useCallback(
    (productId?: string | null, categoryId?: string | null): DisplayConfig => {
      let cfg = global;
      if (categoryId) {
        const cat = presets?.find((p) => p.scope === "category" && p.scope_id === categoryId);
        if (cat) cfg = normalizeDisplay(cat.config, cfg);
      }
      if (productId) {
        const prod = presets?.find((p) => p.scope === "product" && p.scope_id === productId);
        if (prod) cfg = normalizeDisplay(prod.config, cfg);
      }
      return cfg;
    },
    [presets, global],
  );

  return { global, resolve, presets: presets ?? [] };
}
