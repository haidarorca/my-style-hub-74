import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type VariantLike = { color?: string | null; size?: string | null; cj_options?: Record<string, string> | null };
type Row = { kind: string; src_norm: string; tr: Record<string, string> };

const norm = (s: string) => s.trim().toLowerCase();
const OPTION_FR: Record<string, string> = { size: "Taille", color: "Couleur", colour: "Couleur", style: "Style", model: "Modèle", quantity: "Quantité", material: "Matière" };

/**
 * Traductions des noms/valeurs d'options de variantes depuis le dictionnaire
 * partagé du Centre de traduction. Retourne toujours le texte original si
 * aucune traduction n'existe (les valeurs sélectionnées restent inchangées).
 */
export function useOptionDictionary(variants: VariantLike[], lang: string) {
  const { values, names } = useMemo(() => {
    const v = new Set<string>(); const n = new Set<string>();
    for (const x of variants) {
      if (x.color) v.add(norm(x.color));
      if (x.size) v.add(norm(x.size));
      for (const [k, val] of Object.entries(x.cj_options ?? {})) { n.add(norm(k)); if (typeof val === "string") v.add(norm(val)); }
    }
    return { values: [...v].slice(0, 300), names: [...n].slice(0, 50) };
  }, [variants]);

  const { data } = useQuery({
    queryKey: ["opt-dict", values.join("|"), names.join("|")],
    enabled: values.length + names.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const all = [...new Set([...values, ...names])];
      const { data } = await (supabase as any).from("translation_dictionary").select("kind, src_norm, tr").in("src_norm", all);
      return (data ?? []) as Row[];
    },
  });

  return useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const r of data ?? []) map.set(`${r.kind}:${r.src_norm}`, r.tr);
    const tv = (s: string) => map.get(`opt_value:${norm(s)}`)?.[lang]?.trim() || s;
    const tn = (s: string) => map.get(`opt_name:${norm(s)}`)?.[lang]?.trim() || (lang === "fr" ? OPTION_FR[norm(s)] ?? s.trim() : s.trim());
    return { tv, tn };
  }, [data, lang]);
}
