import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Recherche — Kawzone" },
      { name: "description", content: "Recherchez des produits sur Kawzone." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const term = q.trim();

  const { data: results, isFetching } = useQuery({
    queryKey: ["search", term],
    enabled: term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, product_images(url)")
        .ilike("name", `%${term}%`)
        .eq("status", "approved")
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const empty = useMemo(() => term.length >= 2 && !isFetching && (results?.length ?? 0) === 0, [term, isFetching, results]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-3 pt-2">
        <BackButton fallbackTo="/" />
        <h1 className="mt-1 text-xl font-extrabold">Recherche</h1>

        <div className="mt-3 flex items-center gap-2 rounded-full bg-muted px-3 py-2">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un produit…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {term.length < 2 && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Tapez au moins 2 caractères pour rechercher.
          </p>
        )}

        {isFetching && term.length >= 2 && (
          <p className="mt-6 text-center text-sm text-muted-foreground">Recherche…</p>
        )}

        {empty && (
          <p className="mt-6 text-center text-sm text-muted-foreground">Aucun résultat pour « {term} ».</p>
        )}

        {results && results.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {results.map((p) => (
              <Link
                key={p.id}
                to="/product/$productId"
                params={{ productId: p.id }}
                className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:bg-accent"
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  {p.product_images?.[0]?.url ? (
                    <img src={p.product_images[0].url} alt={p.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-2">
                  <div className="line-clamp-2 text-xs font-semibold">{p.name}</div>
                  <div className="mt-1 text-sm font-bold text-primary">{p.price} FCFA</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
