import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";

type Member = {
  id: string;
  name: string;
  price: number;
  group_option_label: string | null;
  group_position: number | null;
  status: string;
};

/**
 * Sélecteur d'articles d'un même groupe (famille commerciale).
 * Chaque option est un produit réel : cliquer change de fiche produit.
 */
export function GroupSelector({
  groupId,
  currentProductId,
  className,
}: {
  groupId: string;
  currentProductId: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["product-group-public", groupId],
    queryFn: async () => {
      const [g, m] = await Promise.all([
        supabase.from("product_groups").select("name, criterion_label").eq("id", groupId).maybeSingle(),
        supabase
          .from("products")
          .select("id, name, name_i18n, price, group_option_label, group_option_label_i18n, group_position, status")
          .eq("group_id", groupId)
          .eq("status", "approved")
          .order("group_position", { ascending: true }),
      ]);
      return {
        group: g.data as { name: string; criterion_label: string } | null,
        members: (m.data ?? []) as Member[],
      };
    },
    staleTime: 60_000,
  });

  const members = data?.members ?? [];
  if (members.length < 2) return null;

  return (
    <div className={cn("rounded-xl border bg-card p-3", className)}>
      <div className="text-xs font-semibold text-muted-foreground">
        {data?.group?.criterion_label || "Modèle"}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {members.map((m) => {
          const active = m.id === currentProductId;
          return (
            <Link
              key={m.id}
              to="/product/$productId"
              params={{ productId: m.id }}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs transition-colors",
                active ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted",
              )}
            >
              <span className="block">{pickI18n(m.group_option_label, (m as any).group_option_label_i18n, lang) || pickI18n(m.name, (m as any).name_i18n, lang)}</span>
              <span className="block text-[11px] text-muted-foreground">
                {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(m.price ?? 0))} FCFA
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
