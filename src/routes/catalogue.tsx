// Catalogue public avec filtres professionnels (matière, couleur, taille,
// pays d'expédition, prix, stock, catégorie) — filtrage côté serveur.
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { SlidersHorizontal, X, Search as SearchIcon, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProductCard, type ProductCardProduct } from "@/components/product/ProductCard";
import { ProductPricesProvider } from "@/components/product/ProductPricesProvider";
import { ProductGridSkeleton } from "@/components/product/ProductCardSkeleton";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { PRODUCT_CARD_SELECT } from "@/lib/product-select";
import { supabase } from "@/integrations/supabase/client";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const arr = fallback(z.array(z.string()), []).default([]);
const schema = z.object({
  q: fallback(z.string(), "").default(""),
  cat: fallback(z.string(), "").default(""),
  mat: arr,
  col: arr,
  size: arr,
  country: arr,
  min: fallback(z.number().optional(), undefined),
  max: fallback(z.number().optional(), undefined),
  stock: fallback(z.boolean(), false).default(false),
  sort: fallback(z.string(), "new").default("new"),
});
type S = z.infer<typeof schema>;

export const Route = createFileRoute("/catalogue")({
  validateSearch: zodValidator(schema),
  head: () => ({
    meta: [
      { title: "Catalogue et filtres — Kawzone" },
      { name: "description", content: "Parcourez tout le catalogue Kawzone et filtrez par catégorie, matière, couleur, taille, prix et pays d'expédition." },
      { property: "og:title", content: "Catalogue et filtres — Kawzone" },
      { property: "og:description", content: "Trouvez vite le bon produit : filtres par matière, couleur, taille, prix et pays." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CataloguePage,
});

type Facet = { k: string; n: number; label?: string; flag?: string };
type Result = { ids: string[]; total: number; price: { min: number | null; max: number | null }; materials: Facet[]; colors: Facet[]; sizes: Facet[]; countries: Facet[] };

const COLOR_HEX: Record<string, string> = {
  Noir: "#111", Blanc: "#fff", Gris: "#9ca3af", Bleu: "#2563eb", Rose: "#f472b6", Rouge: "#dc2626", Vert: "#16a34a",
  Jaune: "#facc15", Orange: "#f97316", Violet: "#8b5cf6", Marron: "#92400e", Beige: "#e7d3b0", "Doré": "#d4a017", "Argenté": "#c0c0c0",
  Multicolore: "conic-gradient(red, orange, yellow, green, blue, purple, red)",
};
const SORTS: Record<string, string> = { new: "Nouveautés", popular: "Populaires", price_asc: "Prix croissant", price_desc: "Prix décroissant" };
const PAGE = 40;

function useCategories() {
  return useQuery({
    queryKey: ["catalogue-categories"],
    staleTime: 600_000,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, name_i18n, parent_id, level").order("position");
      return data ?? [];
    },
  });
}

function CataloguePage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/catalogue" });
  const { lang } = useI18n();
  const { vendorIds } = useDeliverableVendorIds();
  const { data: cats = [] } = useCategories();
  const [open, setOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [q, setQ] = useState(s.q);

  const set = (patch: Partial<S>) => navigate({ search: (prev: S) => ({ ...prev, ...patch }), replace: true });
  const toggle = (key: "mat" | "col" | "size" | "country", v: string) => {
    const cur = s[key];
    set({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<S>);
  };

  // Catégorie choisie + toutes ses descendantes.
  const catIds = useMemo(() => {
    if (!s.cat) return [] as string[];
    const out = new Set([s.cat]);
    let grew = true;
    while (grew) { grew = false; for (const c of cats) if (c.parent_id && out.has(c.parent_id) && !out.has(c.id)) { out.add(c.id); grew = true; } }
    return [...out];
  }, [s.cat, cats]);
  const catName = (id: string) => { const c = cats.find((x) => x.id === id); return c ? pickI18n(c.name, c.name_i18n, lang as any) : ""; };

  const filters = {
    q: s.q, categories: catIds, materials: s.mat, colors: s.col, sizes: s.size, countries: s.country,
    minPrice: s.min ?? null, maxPrice: s.max ?? null, inStock: s.stock, sort: s.sort,
    vendors: vendorIds && vendorIds.length ? vendorIds : null,
  };

  const res = useInfiniteQuery({
    queryKey: ["catalogue", filters],
    enabled: !s.cat || cats.length > 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await (supabase.rpc as any)("shop_catalog", { _f: { ...filters, limit: PAGE, offset: pageParam } });
      if (error) throw error;
      const r = data as Result;
      let products: ProductCardProduct[] = [];
      if (r.ids.length) {
        const { data: rows } = await supabase.from("products").select(PRODUCT_CARD_SELECT).in("id", r.ids)
          .order("position", { referencedTable: "product_images", ascending: true });
        const byId = new Map((rows ?? []).map((p: any) => [p.id, p]));
        products = r.ids.map((id) => byId.get(id)).filter(Boolean) as ProductCardProduct[];
      }
      return { ...r, products, offset: pageParam };
    },
    getNextPageParam: (last) => (last.offset + PAGE < last.total ? last.offset + PAGE : undefined),
  });
  const first = res.data?.pages[0];
  const products = res.data?.pages.flatMap((p) => p.products) ?? [];
  const total = first?.total ?? 0;

  const chips: Array<{ label: string; clear: () => void }> = [
    ...(s.q ? [{ label: `« ${s.q} »`, clear: () => { setQ(""); set({ q: "" }); } }] : []),
    ...(s.cat ? [{ label: catName(s.cat), clear: () => set({ cat: "" }) }] : []),
    ...s.mat.map((v) => ({ label: v, clear: () => toggle("mat", v) })),
    ...s.col.map((v) => ({ label: v, clear: () => toggle("col", v) })),
    ...s.size.map((v) => ({ label: `Taille ${v}`, clear: () => toggle("size", v) })),
    ...s.country.map((v) => ({ label: first?.countries.find((c) => c.k === v)?.label ?? "Pays", clear: () => toggle("country", v) })),
    ...(s.min != null || s.max != null ? [{ label: `${s.min ?? 0} – ${s.max ?? "∞"} FCFA`, clear: () => set({ min: undefined, max: undefined }) }] : []),
    ...(s.stock ? [{ label: "En stock", clear: () => set({ stock: false }) }] : []),
  ];
  const resetAll = () => { setQ(""); navigate({ search: { q: "", cat: "", mat: [], col: [], size: [], country: [], stock: false, sort: s.sort } as any, replace: true }); };

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl space-y-3 px-3 py-4 sm:px-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">Catalogue</h1>
            <p className="text-sm text-muted-foreground">{res.isLoading ? "Recherche…" : `${total.toLocaleString("fr-FR")} produit${total > 1 ? "s" : ""}`}</p>
          </div>
        </div>

        <div className="sticky top-0 z-20 -mx-3 flex gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:px-2">
          <form className="relative min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() }); }}>
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans le catalogue" className="h-9 pl-8" />
          </form>
          <Select value={s.sort} onValueChange={(v) => set({ sort: v })}>
            <SelectTrigger className="h-9 w-[130px] shrink-0 sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SORTS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Button className="h-9 shrink-0 gap-1.5" aria-label="Filtrer" onClick={() => setOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Filtrer</span>
            {chips.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-foreground px-1 text-[11px] font-bold text-primary">{chips.length}</span>}
          </Button>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c, i) => (
              <button key={i} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-1 text-xs font-medium">
                {c.label}<X className="h-3 w-3" />
              </button>
            ))}
            <button onClick={resetAll} className="px-1 text-xs font-medium text-primary underline">Tout effacer</button>
          </div>
        )}

        {res.isLoading ? <ProductGridSkeleton count={8} /> : products.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">Aucun produit ne correspond à ces filtres.</p>
            <Button variant="link" onClick={resetAll}>Effacer les filtres</Button>
          </div>
        ) : (
          <ProductPricesProvider productIds={products.map((p) => p.id)}>
            <div className="grid-products">
              {products.map((p) => <ProductCard key={p.id} product={p} onQuickAdd={setQuickAdd} />)}
            </div>
          </ProductPricesProvider>
        )}
        {res.hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => res.fetchNextPage()} disabled={res.isFetchingNextPage}>
              {res.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}Voir plus de produits
            </Button>
          </div>
        )}
      </main>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4"><SheetTitle>Filtres</SheetTitle></SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <Section title="Catégorie">
              <CategoryPicker cats={cats} lang={lang} value={s.cat} onChange={(v) => set({ cat: v })} />
            </Section>
            <Section title="Prix (FCFA)">
              <PriceRange min={s.min} max={s.max} onApply={(min, max) => set({ min, max })} />
            </Section>
            <Section title="Disponibilité">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={s.stock} onCheckedChange={(v) => set({ stock: !!v })} />En stock uniquement</label>
            </Section>
            {!!first?.materials.length && (
              <Section title="Matière">
                <div className="flex flex-wrap gap-1.5">{first.materials.map((m) => <Chip key={m.k} active={s.mat.includes(m.k)} onClick={() => toggle("mat", m.k)}>{m.k} <span className="opacity-60">{m.n}</span></Chip>)}</div>
              </Section>
            )}
            {!!first?.colors.length && (
              <Section title="Couleur">
                <div className="flex flex-wrap gap-1.5">{first.colors.map((c) => (
                  <Chip key={c.k} active={s.col.includes(c.k)} onClick={() => toggle("col", c.k)}>
                    <span className="h-3.5 w-3.5 rounded-full border" style={{ background: COLOR_HEX[c.k] ?? "transparent" }} />{c.k} <span className="opacity-60">{c.n}</span>
                  </Chip>
                ))}</div>
              </Section>
            )}
            {!!first?.sizes.length && (
              <Section title="Taille">
                <div className="flex flex-wrap gap-1.5">{first.sizes.map((z) => <Chip key={z.k} active={s.size.includes(z.k)} onClick={() => toggle("size", z.k)}>{z.k}</Chip>)}</div>
              </Section>
            )}
            {!!first?.countries.length && (
              <Section title="Pays d'expédition">
                <div className="flex flex-wrap gap-1.5">{first.countries.map((c) => <Chip key={c.k} active={s.country.includes(c.k)} onClick={() => toggle("country", c.k)}>{c.flag} {c.label} <span className="opacity-60">{c.n}</span></Chip>)}</div>
              </Section>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t p-3">
            <Button variant="outline" onClick={resetAll}>Tout effacer</Button>
            <Button onClick={() => setOpen(false)}>Voir {total.toLocaleString("fr-FR")} produit{total > 1 ? "s" : ""}</Button>
          </div>
        </SheetContent>
      </Sheet>
      <QuickAddSheet productId={quickAdd} open={!!quickAdd} onOpenChange={(o) => !o && setQuickAdd(null)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>{children}</section>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-foreground/40")}>{children}</button>
  );
}

function PriceRange({ min, max, onApply }: { min?: number; max?: number; onApply: (a?: number, b?: number) => void }) {
  const [a, setA] = useState(min?.toString() ?? "");
  const [b, setB] = useState(max?.toString() ?? "");
  const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Number(v)));
  return (
    <div className="flex items-center gap-2">
      <Input inputMode="numeric" placeholder="Min" value={a} onChange={(e) => setA(e.target.value)} className="h-9" />
      <span className="text-muted-foreground">–</span>
      <Input inputMode="numeric" placeholder="Max" value={b} onChange={(e) => setB(e.target.value)} className="h-9" />
      <Button size="sm" variant="secondary" onClick={() => onApply(num(a), num(b))}>OK</Button>
    </div>
  );
}

function CategoryPicker({ cats, lang, value, onChange }: { cats: any[]; lang: string; value: string; onChange: (v: string) => void }) {
  const name = (c: any) => pickI18n(c.name, c.name_i18n, lang as any);
  const chain = useMemo(() => {
    const out: any[] = [];
    let cur = cats.find((c) => c.id === value);
    while (cur) { out.unshift(cur); cur = cats.find((c) => c.id === cur.parent_id); }
    return out;
  }, [cats, value]);
  const children = cats.filter((c) => (value ? c.parent_id === value : !c.parent_id));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button className={cn("font-medium", value ? "text-primary underline" : "")} onClick={() => onChange("")}>Toutes</button>
        {chain.map((c) => <span key={c.id} className="flex items-center gap-1">›<button className={cn("font-medium", c.id !== value && "text-primary underline")} onClick={() => onChange(c.id)}>{name(c)}</button></span>)}
      </div>
      {children.length > 0 && <div className="flex flex-wrap gap-1.5">{children.map((c) => <Chip key={c.id} active={false} onClick={() => onChange(c.id)}>{name(c)}</Chip>)}</div>}
    </div>
  );
}
