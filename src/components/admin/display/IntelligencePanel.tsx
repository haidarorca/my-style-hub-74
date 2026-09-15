/**
 * Onglet « Intelligence » : santé du système de personnalisation.
 * Toutes les valeurs proviennent des données réelles (aucun chiffre simulé).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  events_7d: number;
  events_total: number;
  favorites_total: number;
  active_profiles: number;
  top_products: Array<{ id: string; name: string; views_count: number; events_7d: number }>;
  top_categories: Array<{ id: string; name: string; events_7d: number }>;
}

export function IntelligencePanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reco-admin-stats"],
    staleTime: 60_000,
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await (supabase as any).rpc("reco_admin_stats");
      if (error) throw error;
      return data as Stats;
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Statistiques indisponibles pour le moment.
      </p>
    );
  }

  const kpis = [
    { label: "Événements (7 jours)", value: data?.events_7d ?? 0 },
    { label: "Événements au total", value: data?.events_total ?? 0 },
    { label: "Profils actifs (30 j)", value: data?.active_profiles ?? 0 },
    { label: "Favoris enregistrés", value: data?.favorites_total ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-bold">{k.value.toLocaleString("fr-FR")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Produits les plus consultés</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.top_products ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Pas encore de données.</p>
            )}
            {(data?.top_products ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="shrink-0 font-semibold text-muted-foreground">
                  {p.events_7d} act. / {p.views_count} vues
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Catégories tendances (7 jours)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.top_categories ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Pas encore de données.</p>
            )}
            {(data?.top_categories ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 font-semibold text-muted-foreground">{c.events_7d}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Les recommandations s'appuient sur ces signaux : consultations, recherches, ajouts au panier,
        favoris et achats, pondérés par leur ancienneté. L'historique reste privé et n'est jamais
        affiché aux visiteurs.
      </p>
    </div>
  );
}
