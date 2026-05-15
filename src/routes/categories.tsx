import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Catégories — Kawzone" },
      { name: "description", content: "Parcourez toutes les catégories de produits sur Kawzone." },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories", "all-tree"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, logo_url, parent_id, level")
        .order("level")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const level1 = (categories ?? []).filter((c) => c.level === 1);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-3 pt-2">
        <BackButton fallbackTo="/" />
        <h1 className="mt-1 text-xl font-extrabold">Catégories</h1>
        <p className="text-xs text-muted-foreground">Toutes les catégories du site</p>

        {isLoading ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : (
          <ul className="mt-4 space-y-2">
            {level1.map((cat) => {
              const subs = (categories ?? []).filter((c) => c.parent_id === cat.id);
              return (
                <li key={cat.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <Link
                    to="/c/$categoryId"
                    params={{ categoryId: cat.id }}
                    className="flex items-center gap-3 p-3 hover:bg-accent"
                  >
                    {cat.logo_url ? (
                      <img src={cat.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-base font-bold">
                        {cat.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{cat.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {subs.length} sous-catégorie{subs.length > 1 ? "s" : ""}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                  {subs.length > 0 && (
                    <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-border px-3 py-2">
                      {subs.map((s) => (
                        <Link
                          key={s.id}
                          to="/c/$categoryId"
                          params={{ categoryId: s.id }}
                          className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-accent"
                        >
                          {s.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
            {level1.length === 0 && (
              <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Aucune catégorie disponible.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
