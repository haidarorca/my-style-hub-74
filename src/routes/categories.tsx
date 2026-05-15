import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";

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
  const { lang, t } = useI18n();
  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories", "all-tree", lang],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, name_i18n, slug, logo_url, parent_id, level")
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
      <div className="page-container pt-2">
        <BackButton fallbackTo="/" />
        <h1 className="mt-1 text-xl font-extrabold">{t("categories.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("categories.subtitle")}</p>

        {isLoading ? (
          <ul className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                <div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-2 w-1/4 animate-pulse rounded bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-4 space-y-2">
            {level1.map((cat) => {
              const subs = (categories ?? []).filter((c) => c.parent_id === cat.id);
              const catName = pickI18n(cat.name, cat.name_i18n, lang);
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
                        {catName.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{catName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {subs.length} {t(subs.length > 1 ? "categories.subcategories_plural" : "categories.subcategories")}
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
                          {pickI18n(s.name, s.name_i18n, lang)}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
            {level1.length === 0 && (
              <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t("categories.empty")}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
