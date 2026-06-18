import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Store, BadgeCheck, Clock, MapPin } from "lucide-react";
import { ContactActions } from "@/components/support/ContactActions";
import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { QuickAddSheet } from "@/components/product/QuickAddSheet";
import { ShopProductsExplorer, type ShopProduct } from "@/components/shop/ShopProductsExplorer";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSchedule, summarizeSchedule, isOpenNow, type ScheduleLabels } from "@/lib/shop-hours";
import { useI18n } from "@/hooks/use-i18n";
import { useDeliverableVendorIds } from "@/hooks/use-deliverable-vendors";

export const Route = createFileRoute("/shop/$vendorId")({
  component: ShopPage,
  loader: async ({ params }) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await (supabase as never as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } } } })
        .from("public_vendor_profiles")
        .select("id, shop_name, description, logo_url")
        .eq("id", params.vendorId)
        .maybeSingle();
      return { seo: data ?? null };
    } catch {
      return { seo: null };
    }
  },
  head: ({ params, loaderData }) => {
    const seo = (loaderData as { seo?: Record<string, unknown> | null } | undefined)?.seo;
    const name = (seo?.shop_name as string) ?? "Boutique";
    const title = `${name} — Kawzone`;
    const desc = ((seo?.description as string) ?? `Découvrez la boutique ${name} sur Kawzone.`).slice(0, 160);
    const img = seo?.logo_url as string | undefined;
    const url = `https://kawzone.com/shop/${params.vendorId}`;
    const meta = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ];
    if (img) {
      meta.push({ property: "og:image", content: img });
      meta.push({ name: "twitter:image", content: img });
    }
    return { meta, links: [{ rel: "canonical", href: url }] };
  },
});

function ShopPage() {
  const { vendorId } = Route.useParams();
  const { t } = useI18n();
  const [quickAdd, setQuickAdd] = useState<string | null>(null);

  const { data: vendor } = useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("public_vendor_profiles")
        .select("*")
        .eq("id", vendorId)
        .maybeSingle();
      return data as Record<string, unknown> | null;
    },
  });

  const { countryId, vendorIds: deliverableVendorIds } = useDeliverableVendorIds();
  const vendorDeliverable = !countryId || !deliverableVendorIds || deliverableVendorIds.includes(vendorId);

  const { data: products } = useQuery({
    queryKey: ["vendor-products", vendorId, countryId, vendorDeliverable],
    enabled: !countryId || deliverableVendorIds !== null,
    queryFn: async () => {
      if (!vendorDeliverable) return [] as ShopProduct[];
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, name_i18n, price, code, weight_kg, length_cm, width_cm, height_cm, profiles!products_vendor_id_fkey(source_country_id), category_id, created_at, product_images(url), product_variants(id, size, color, color_hex, stock, price_override)",
        )
        .eq("vendor_id", vendorId)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShopProduct[];
    },
  });

  const { data: allCats } = useQuery({
    queryKey: ["all-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, name_i18n, level, parent_id, position")
        .order("position");
      return (data ?? []) as Array<{ id: string; name: string; name_i18n: unknown; level: number; parent_id: string | null }>;
    },
  });

  const v = vendor ?? {};
  const shopName = (v.shop_name as string) || (v.full_name as string) || t("shop.fallback_name");
  const desc = v.shop_description as string | undefined;
  const hours = v.shop_hours as string | undefined;
  const address = v.address as string | undefined;
  const logo = v.shop_logo_url as string | undefined;
  const banner = v.shop_banner_url as string | undefined;
  const schedule = normalizeSchedule(v.shop_hours_schedule);
  const scheduleLabels: ScheduleLabels = {
    closed: t("shop.closed_day"),
    short: {
      mon: t("shop.day.mon"), tue: t("shop.day.tue"), wed: t("shop.day.wed"),
      thu: t("shop.day.thu"), fri: t("shop.day.fri"), sat: t("shop.day.sat"), sun: t("shop.day.sun"),
    },
  };
  const scheduleSummary = summarizeSchedule(schedule, scheduleLabels);
  const openNow = isOpenNow(schedule);
  const verified = !!v.is_verified;
  const productCount = products?.length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="page-container pb-safe">
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
                  <img src={logo} alt={shopName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate text-lg font-extrabold">{shopName}</h1>
                  {verified && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <BadgeCheck className="h-3 w-3" /> {t("shop.verified")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{productCount} {productCount > 1 ? t("shop.products_many") : t("shop.products_one")}</p>
              </div>
            </div>

            {desc && <p className="mt-3 text-sm text-foreground/80">{desc}</p>}

            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              {address && <div className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{address}</span></div>}
            </div>

            <div className="mt-4">
              <ContactActions vendorId={vendorId} productName={shopName} className="flex flex-wrap gap-2" />
            </div>
          </div>
        </section>

        <ShopProductsExplorer
          products={products ?? []}
          allCats={allCats ?? []}
          onQuickAdd={setQuickAdd}
        />

        {/* Discreet schedule footer */}
        <section className="mt-8 mb-6 rounded-xl border bg-muted/30 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">{t("shop.hours_title")}</span>
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                openNow ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${openNow ? "bg-emerald-500" : "bg-muted-foreground/60"}`} />
              {openNow ? t("shop.open_now") : t("shop.closed_now")}
            </span>
          </div>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {scheduleSummary.map((row, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{row.label}</span>
                <span className={row.value === t("shop.closed_day") ? "text-muted-foreground/70" : "text-foreground/80"}>{row.value}</span>
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
