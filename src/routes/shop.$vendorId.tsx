import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Store, BadgeCheck, Clock, MapPin, Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { ProductCard } from "@/components/product/ProductCard";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSchedule, summarizeSchedule, isOpenNow, type ScheduleLabels } from "@/lib/shop-hours";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";

export const Route = createFileRoute("/shop/$vendorId")({
  component: ShopPage,
});


function ShopPage() {
  const { vendorId } = Route.useParams();
  const { t, lang } = useI18n();
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const [selL1, setSelL1] = useState<string | null>(null);
  const [selL2, setSelL2] = useState<string | null>(null);
  const [selL3, setSelL3] = useState<string | null>(null);

  const { data: vendor } = useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", vendorId)
        .maybeSingle();
      return data as Record<string, unknown> | null;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["vendor-products", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_i18n, price, code, category_id, product_images(url)")
        .eq("vendor_id", vendorId)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allCats } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, name_i18n, level, parent_id, position")
        .order("position");
      return (data ?? []) as Array<{ id: string; name: string; name_i18n: any; level: number; parent_id: string | null; position: number | null }>;
    },
  });


  // Build map + used-category sets including ancestors
  const { usedL1, usedL2, usedL3, productCatToL1, productCatToL2 } = useMemo(() => {
    const map = new Map<string, { id: string; name: string; name_i18n?: any; level: number; parent_id: string | null }>();
    (allCats ?? []).forEach((c) => map.set(c.id, c));
    const u1 = new Set<string>();
    const u2 = new Set<string>();
    const u3 = new Set<string>();
    const toL1 = new Map<string, string>(); // any cat id -> its L1 ancestor
    const toL2 = new Map<string, string>(); // any cat id -> its L2 ancestor (if any)
    (products ?? []).forEach((p) => {
      const cid = (p as { category_id: string | null }).category_id;
      if (!cid) return;
      let cur = map.get(cid);
      let l1: string | null = null;
      let l2: string | null = null;
      let l3: string | null = null;
      while (cur) {
        if (cur.level === 1) l1 = cur.id;
        if (cur.level === 2) l2 = cur.id;
        if (cur.level === 3) l3 = cur.id;
        cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
      }
      if (l1) { u1.add(l1); toL1.set(cid, l1); }
      if (l2) { u2.add(l2); toL2.set(cid, l2); }
      if (l3) u3.add(l3);
    });
    return { usedL1: u1, usedL2: u2, usedL3: u3, productCatToL1: toL1, productCatToL2: toL2 };
  }, [allCats, products]);

  const l1List = (allCats ?? []).filter((c) => c.level === 1 && usedL1.has(c.id));
  const l2List = selL1
    ? (allCats ?? []).filter((c) => c.level === 2 && c.parent_id === selL1 && usedL2.has(c.id))
    : [];
  const l3List = selL2
    ? (allCats ?? []).filter((c) => c.level === 3 && c.parent_id === selL2 && usedL3.has(c.id))
    : [];

  const filteredProducts = (products ?? []).filter((p) => {
    const cid = (p as { category_id: string | null }).category_id;
    if (!selL1) return true;
    if (!cid) return false;
    if (selL3) return cid === selL3;
    if (selL2) return productCatToL2.get(cid) === selL2 || cid === selL2;
    return productCatToL1.get(cid) === selL1 || cid === selL1;
  });

  const v = vendor ?? {};
  const shopName = (v.shop_name as string) || (v.full_name as string) || "Boutique";
  const desc = v.shop_description as string | undefined;
  const hours = v.shop_hours as string | undefined;
  const address = v.address as string | undefined;
  const logo = v.shop_logo_url as string | undefined;
  const banner = v.shop_banner_url as string | undefined;
  const hideContact = !!v.hide_contact_publicly || v.vendor_mode === "commission";
  const whatsapp = hideContact ? "" : ((v.shop_whatsapp as string) || (v.phone as string) || "");
  const schedule = normalizeSchedule(v.shop_hours_schedule);
  const scheduleSummary = summarizeSchedule(schedule);
  const openNow = isOpenNow(schedule);
  const verified = !!v.is_verified;
  const productCount = products?.length ?? 0;

  const waLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, je vous contacte au sujet de votre boutique ${shopName}.`)}`
    : null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 pb-safe">
        <div className="mt-2"><BackButton fallbackTo="/" /></div>

        {/* Banner + logo */}
        <section className="mt-2 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div
            className="relative h-32 w-full bg-gradient-to-br from-primary/60 to-accent/60 sm:h-40"
            style={banner ? { backgroundImage: `url(${banner})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          />
          <div className="px-4 pb-4">
            <div className="-mt-10 flex items-end gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow">
                {logo ? (
                  <img src={logo} alt={shopName} className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate text-lg font-extrabold">{shopName}</h1>
                  {verified && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <BadgeCheck className="h-3 w-3" /> Vérifié
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{productCount} produit{productCount > 1 ? "s" : ""}</p>
              </div>
            </div>

            {desc && <p className="mt-3 text-sm text-foreground/80">{desc}</p>}

            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              {address && <div className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{address}</span></div>}
            </div>

            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white shadow active:scale-[0.99]"
              >
                <Phone className="h-4 w-4" /> Contacter sur WhatsApp
              </a>
            )}
          </div>
        </section>

        {l1List.length > 0 && (
          <section className="mt-5 space-y-2">
            <div className="-mx-3 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2 pb-1">
                <CatChip active={!selL1} onClick={() => { setSelL1(null); setSelL2(null); setSelL3(null); }}>Tout</CatChip>
                {l1List.map((c) => (
                  <CatChip key={c.id} active={selL1 === c.id} onClick={() => { setSelL1(c.id); setSelL2(null); setSelL3(null); }}>
                    {c.name}
                  </CatChip>
                ))}
              </div>
            </div>
            {l2List.length > 0 && (
              <div className="-mx-3 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-2 pb-1">
                  {l2List.map((c) => (
                    <CatChip key={c.id} active={selL2 === c.id} onClick={() => { setSelL2(selL2 === c.id ? null : c.id); setSelL3(null); }} small>
                      {c.name}
                    </CatChip>
                  ))}
                </div>
              </div>
            )}
            {l3List.length > 0 && (
              <div className="-mx-3 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-2 pb-1">
                  {l3List.map((c) => (
                    <CatChip key={c.id} active={selL3 === c.id} onClick={() => setSelL3(selL3 === c.id ? null : c.id)} small>
                      {c.name}
                    </CatChip>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="mt-4">
          <h2 className="mb-3 text-base font-bold">
            {selL1 ? "Produits" : "Tous les produits"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">({filteredProducts.length})</span>
          </h2>
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredProducts.map((p) => (
                <ProductCard key={p.id} product={p} onQuickAdd={setQuickAdd} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {selL1 ? "Aucun produit dans cette catégorie." : "Cette boutique n'a aucun produit pour l'instant."}
            </p>
          )}
        </section>


        {/* Discreet schedule footer */}
        <section className="mt-8 mb-6 rounded-xl border bg-muted/30 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Horaires d'ouverture</span>
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                openNow ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${openNow ? "bg-emerald-500" : "bg-muted-foreground/60"}`} />
              {openNow ? "Ouvert" : "Fermé"}
            </span>
          </div>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {scheduleSummary.map((row, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{row.label}</span>
                <span className={row.value === "Fermé" ? "text-muted-foreground/70" : "text-foreground/80"}>{row.value}</span>
              </li>
            ))}
          </ul>
          {hours && <p className="mt-2 text-[11px] italic text-muted-foreground">{hours}</p>}
        </section>
      </main>
      <QuickAddSheet
        productId={quickAdd}
        open={!!quickAdd}
        onOpenChange={(o) => !o && setQuickAdd(null)}
      />
    </div>
  );
}

function CatChip({
  children, active, onClick, small,
}: { children: React.ReactNode; active?: boolean; onClick?: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border transition active:scale-[0.98] ${
        small ? "px-3 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs"
      } ${
        active
          ? "border-primary bg-primary text-primary-foreground font-semibold"
          : "border-border bg-card text-foreground/80 hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
