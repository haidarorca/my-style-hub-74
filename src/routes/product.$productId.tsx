import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Store, Flag, ChevronLeft, Upload, X, ShieldCheck, AlertTriangle, Ruler } from "lucide-react";
import { warrantyLabel } from "@/lib/warranty";
import { isClothingContext, getMeasurementFields, hasAnyMeasurement } from "@/lib/clothing-categories";
import { fitTypeOption } from "@/lib/fit-types";

import { EditableLabel } from "@/components/admin/EditableLabel";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useI18n } from "@/hooks/use-i18n";
import { useDisplayPriceLines } from "@/hooks/use-display-prices";
import { useFormatDisplay } from "@/hooks/use-currencies";
import { pickI18n } from "@/lib/i18n/localized";
import { ReviewsSection } from "@/components/product/ReviewsSection";
import { SimilarProducts } from "@/components/product/SimilarProducts";
import { DeliveryAvailabilityBadge } from "@/components/product/DeliveryAvailabilityBadge";
import { EstimatedShippingPanel } from "@/components/product/EstimatedShippingPanel";
import { useEstimatedShipping } from "@/hooks/use-estimated-shipping";
import { ProductGallery } from "@/components/images/ProductGallery";

export const Route = createFileRoute("/product/$productId")({
  component: ProductPage,
  loader: async ({ params }) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("products")
        .select("id, name, description, price, product_images(url)")
        .eq("id", params.productId)
        .eq("status", "approved")
        .maybeSingle();
      return { seo: data ?? null };
    } catch {
      return { seo: null };
    }
  },
  head: ({ params, loaderData }) => {
    const seo = (loaderData as { seo?: { name?: string; description?: string | null; price?: number | null; product_images?: Array<{ url: string }> } | null } | undefined)?.seo;
    const name = seo?.name ?? "Produit";
    const title = `${name} — Kawzone`;
    const desc = (seo?.description ?? `${name} disponible sur Kawzone, votre marketplace au Sénégal.`).slice(0, 160);
    const img = seo?.product_images?.[0]?.url;
    const url = `https://kawzone.com/product/${params.productId}`;
    const meta = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:url", content: url },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ];
    if (img) {
      meta.push({ property: "og:image", content: img });
      meta.push({ name: "twitter:image", content: img });
    }
    const scripts: Array<{ type: string; children: string }> = [];
    if (seo) {
      scripts.push({
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name,
          description: desc,
          image: img ? [img] : undefined,
          offers: seo.price != null ? {
            "@type": "Offer",
            price: seo.price,
            priceCurrency: "XOF",
            availability: "https://schema.org/InStock",
            url,
          } : undefined,
        }),
      });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: url }],
      scripts,
    };
  },
});

interface Variant {
  id: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  price_override: number | null;
  image_url: string | null;
}

interface Customization {
  id: string;
  type: string; // 'image' | 'name' | 'logo'
  image_size_message: string | null;
  allow_all_fonts: boolean | null;
  allowed_fonts: string[] | null;
  allow_all_colors: boolean | null;
  allowed_colors: string[] | null;
}

const DEFAULT_FONTS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Impact",
  "Pacifico",
  "Lobster",
  "Bebas Neue",
];
const DEFAULT_COLORS = [
  "#000000",
  "#ffffff",
  "#e11d48",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function ProductPage() {
  const { productId } = Route.useParams();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const { lang, t, dir } = useI18n();
  const fmt = useFormatDisplay();
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);


  const [reportReason, setReportReason] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedShippingServiceId, setSelectedShippingServiceId] = useState<string | null>(null);

  // Customization state
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [customText, setCustomText] = useState("");
  const [customFont, setCustomFont] = useState<string>("");
  const [customColor, setCustomColor] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          `id, name, name_i18n, code, designation, designation_i18n, description, description_i18n, price, vendor_id, category_id,
           weight_kg, length_cm, width_cm, height_cm, brand, warranty_days, is_fragile, min_order_qty, video_url, origin_country_id, fit_type,

           product_images(url, position),
           product_variants(*),
           product_customizations(*),
           categories:category_id(name, slug),
           profiles:vendor_id(full_name, shop_name, source_country_id)`,
        )
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const minOrderQty = Math.max(1, Math.round(Number((data as any)?.min_order_qty ?? 1) || 1));
  useEffect(() => {
    if (qty < minOrderQty) setQty(minOrderQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minOrderQty]);
  const warrantyText = warrantyLabel((data as any)?.warranty_days ?? null);
  const isFragile = !!(data as any)?.is_fragile;



  const variants = useMemo(
    () => (data?.product_variants ?? []) as Variant[],
    [data?.product_variants],
  );

  // Fire-and-forget: increment the private view counter (visible only to shop owner)
  useEffect(() => {
    if (!data?.id) return;
    void supabase.rpc("increment_product_view" as never, { _product_id: data.id } as never);
  }, [data?.id]);
  const customizations = (data?.product_customizations ?? []) as Customization[];
  const imageCustom = customizations.find((c) => c.type === "image") ?? null;
  const textCustom = customizations.find((c) => c.type === "name" || c.type === "logo") ?? null;
  const sizes = useMemo(
    () => Array.from(new Set(variants.map((v) => v.size).filter(Boolean) as string[])),
    [variants],
  );
  const colors = useMemo(() => {
    const map = new Map<string, string | null>();
    variants.forEach((v) => {
      if (v.color) map.set(v.color, v.color_hex);
    });
    return Array.from(map.entries());
  }, [variants]);

  const matchedVariant = useMemo(() => {
    if (variants.length === 0) return null;
    return variants.find(
      (v) => (sizes.length === 0 || v.size === size) && (colors.length === 0 || v.color === color),
    );
  }, [variants, size, color, sizes.length, colors.length]);

  useEffect(() => {
    if (matchedVariant?.image_url) setImgIdx(0);
  }, [matchedVariant?.image_url]);

  // Build gallery images: product images + variant images
  // MUST be declared AFTER matchedVariant to avoid Temporal Dead Zone (TDZ).
  // When a variant is selected, its image is prioritized (prepended).
  const images = useMemo(() => {
    const productImgs = (data?.product_images ?? []) as { url: string; position: number | null }[];
    const variantImgs = (data?.product_variants ?? []) as Variant[];

    // Collect unique variant images (excluding the matched variant — handled separately)
    const variantImageUrls = Array.from(
      new Set(variantImgs.filter((v) => v.image_url && v.id !== matchedVariant?.id).map((v) => v.image_url!))
    );

    // Start with matched variant image if available
    const galleryUrls: string[] = [];
    if (matchedVariant?.image_url) {
      galleryUrls.push(matchedVariant.image_url);
    }

    // Then product images (sorted by position)
    const sortedProductImgs = [...productImgs].sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    for (const img of sortedProductImgs) {
      if (!galleryUrls.includes(img.url)) galleryUrls.push(img.url);
    }

    // Then other variant images
    for (const url of variantImageUrls) {
      if (!galleryUrls.includes(url)) galleryUrls.push(url);
    }

    return galleryUrls;
  }, [data?.product_images, data?.product_variants, matchedVariant]);

  const priceLines = useMemo(
    () => (data ? [{ productId: data.id, variantId: matchedVariant?.id ?? null }] : []),
    [data, matchedVariant?.id],
  );
  const displayPriceLines = useDisplayPriceLines(priceLines);
  const priceKey = data ? `${data.id}:${matchedVariant?.id ?? ""}` : "";
  const resolvedFinalPrice = displayPriceLines.get(priceKey)?.final_price ?? null;

  // Estimation transport pour la fiche (mode poids connu)
  const shippingEstProduct = useMemo(() => data ? ({
    weight_kg: (data as any).weight_kg,
    length_cm: (data as any).length_cm,
    width_cm: (data as any).width_cm,
    height_cm: (data as any).height_cm,
    vendor_source_country_id: ((data as any).profiles?.source_country_id ?? null) as string | null,
  }) : null, [data]);
  const shippingEst = useEstimatedShipping(shippingEstProduct);
  const selectedShippingOption = useMemo(
    () => shippingEst.options.find((o: any) => o.service.id === selectedShippingServiceId) ?? shippingEst.cheapest,
    [shippingEst, selectedShippingServiceId],
  );
  // Prix consolidé affiché au client : produit + transport choisi si poids connu intl.
  const displayPrice = useMemo(() => {
    if (resolvedFinalPrice == null) return null;
    if (shippingEst.isIntl && shippingEst.canEstimate && selectedShippingOption) {
      return Math.round(Number(resolvedFinalPrice) + selectedShippingOption.price);
    }
    return Number(resolvedFinalPrice);
  }, [resolvedFinalPrice, shippingEst, selectedShippingOption]);
  const transportIncluded = shippingEst.isIntl && shippingEst.canEstimate && !!selectedShippingOption;
  const needsSize = sizes.length > 0 && !size;
  const needsColor = colors.length > 0 && !color;
  const needsCustomImage = !!imageCustom && !customImageFile;
  const needsCustomText = !!textCustom && !customText.trim();
  const canAdd =
    !needsSize &&
    !needsColor &&
    !needsCustomImage &&
    !needsCustomText &&
    (variants.length === 0 || !!matchedVariant);

  const onAdd = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const customization: Record<string, unknown> = {};
      if (imageCustom && customImageFile) {
        const ext = customImageFile.name.split(".").pop() || "jpg";
        const folder = user?.id ?? "guest";
        const path = `${folder}/${data.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("customization-uploads")
          .upload(path, customImageFile);
        if (upErr) {
          toast.error(upErr.message);
          setSubmitting(false);
          return;
        }
        const url = supabase.storage.from("customization-uploads").getPublicUrl(path)
          .data.publicUrl;
        customization.image_url = url;
      }
      if (textCustom && customText.trim()) {
        customization.text = customText.trim();
        if (customFont) customization.font = customFont;
        if (customColor) customization.color = customColor;
      }
      await addToCart({
        productId: data.id,
        variantId: matchedVariant?.id ?? null,
        quantity: qty,
        customization: Object.keys(customization).length > 0 ? customization : null,
        shippingServiceId: selectedShippingServiceId,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onReport = async () => {
    if (!user) {
      toast.error(t("product.report_login"));
      return;
    }
    if (reportReason.trim().length < 5) {
      toast.error(t("product.report_reason_required"));
      return;
    }
    const { error } = await supabase.from("product_reports").insert({
      product_id: productId,
      reporter_id: user.id,
      reason: reportReason.trim(),
    });
    if (error) toast.error(error.message);
    else {
      toast.success(t("product.report_sent"));
      setReportOpen(false);
      setReportReason("");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <p className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <p className="p-6 text-center text-sm">{t("product.not_found")}</p>
      </div>
    );
  }

  const profile = (data as any).profiles;
  const shopName = profile?.shop_name || profile?.full_name || "Boutique";
  const productName = pickI18n(data.name, (data as any).name_i18n, lang);
  const productDesignation = pickI18n(data.designation, (data as any).designation_i18n, lang);
  const productDescription = pickI18n(data.description, (data as any).description_i18n, lang);

  return (
    <div className="min-h-screen bg-background pb-28">
      <AppHeader />
      <main className="mx-auto max-w-3xl">
        <div className="px-3 pt-2">
          <BackButton fallbackTo="/" />
        </div>
        {/* Gallery — swipeable */}
        {(() => {
          // images already contains: matched variant image first, then product images, then other variant images
          // If a color is selected but no exact variant match, prioritize first variant with that color
          const colorVariantImg = color && !matchedVariant
            ? variants.find((v) => v.color === color && v.image_url)?.image_url
            : null;
          const galleryUrls = colorVariantImg && !images.includes(colorVariantImg)
            ? [colorVariantImg, ...images]
            : images;
          return (
            <ProductGallery
              urls={galleryUrls}
              alt={productName}
              activeIndex={imgIdx}
              onIndexChange={setImgIdx}
              dir={dir}
            />
          );
        })()}

        <div className="space-y-4 px-4 py-3">
          <div>
            {displayPrice !== null ? (
              <>
                <p className="text-xl font-extrabold text-primary">
                  {fmt(Number(displayPrice))}
                </p>
                {transportIncluded && (
                  <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                    Transport inclus — modifiable au panier
                  </p>
                )}
              </>
            ) : (
              <Skeleton className="h-7 w-32" />
            )}
            <h1 className="mt-1 text-base font-semibold">{productName}</h1>
            <p className="text-xs text-muted-foreground">
              {t("product.code")} : {data.code}
            </p>
            {productDesignation && (
              <p className="mt-1 text-xs text-muted-foreground">{productDesignation}</p>
            )}
          </div>

          {(warrantyText || isFragile) && (
            <div className="flex flex-wrap gap-2">
              {warrantyText && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  <ShieldCheck className="h-3.5 w-3.5" /> Garantie {warrantyText}
                </span>
              )}
              {isFragile && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" /> Fragile
                </span>
              )}
            </div>
          )}

          <DeliveryAvailabilityBadge vendorId={data.vendor_id} />


          <EstimatedShippingPanel
            product={{
              weight_kg: (data as any).weight_kg,
              length_cm: (data as any).length_cm,
              width_cm: (data as any).width_cm,
              height_cm: (data as any).height_cm,
              vendor_source_country_id:
                ((data as any).profiles?.source_country_id ??
                  (Array.isArray((data as any).profiles)
                    ? (data as any).profiles[0]?.source_country_id
                    : null)) ?? null,
            }}
            productPrice={resolvedFinalPrice}
            selectedServiceId={selectedShippingServiceId}
            onSelectService={setSelectedShippingServiceId}
          />


          {sizes.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold">{t("product.size")}</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`min-w-12 rounded-md border px-3 py-1.5 text-sm ${
                      size === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {colors.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold">{t("product.color_model")}</p>
              <div className="flex flex-wrap gap-2">
                {colors.map(([c, hex]) => {
                  const vImg = variants.find((v) => v.color === c && v.image_url)?.image_url;
                  return (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${
                        color === c ? "border-primary ring-2 ring-primary/30" : "border-border"
                      }`}
                    >
                      {vImg ? (
                        <span className="h-5 w-5 overflow-hidden rounded border border-border">
                          <img src={vImg} alt="" className="h-full w-full object-cover" />
                        </span>
                      ) : hex ? (
                        <span
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: hex }}
                        />
                      ) : null}
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(imageCustom || textCustom) && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                {t("product.personalization")}
              </p>

              {imageCustom && (
                <div>
                  <p className="mb-1 text-xs font-semibold">{t("product.your_image")}</p>
                  {imageCustom.image_size_message && (
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      {imageCustom.image_size_message}
                    </p>
                  )}
                  {customImageFile ? (
                    <div className="relative inline-block">
                      <img
                        src={URL.createObjectURL(customImageFile)}
                        alt=""
                        className="h-24 w-24 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setCustomImageFile(null)}
                        className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-accent">
                      <Upload className="h-5 w-5" />
                      {t("product.choose")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setCustomImageFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>
              )}

              {textCustom && (
                <div className="space-y-2">
                  <div>
                    <p className="mb-1 text-xs font-semibold">{t("product.your_text")}</p>
                    <Input
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder={t("product.text_placeholder")}
                      maxLength={60}
                    />
                  </div>

                  {(textCustom.allow_all_fonts ||
                    (textCustom.allowed_fonts && textCustom.allowed_fonts.length > 0)) && (
                    <div>
                      <p className="mb-1 text-xs font-semibold">{t("product.font")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(textCustom.allow_all_fonts
                          ? DEFAULT_FONTS
                          : (textCustom.allowed_fonts ?? [])
                        ).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setCustomFont(f)}
                            className={`rounded-md border px-2 py-1 text-xs ${
                              customFont === f
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border"
                            }`}
                            style={{ fontFamily: f }}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(textCustom.allow_all_colors ||
                    (textCustom.allowed_colors && textCustom.allowed_colors.length > 0)) && (
                    <div>
                      <p className="mb-1 text-xs font-semibold">{t("product.text_color")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(textCustom.allow_all_colors
                          ? DEFAULT_COLORS
                          : (textCustom.allowed_colors ?? [])
                        ).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setCustomColor(c)}
                            className={`h-7 w-7 rounded-full border-2 ${
                              customColor === c
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-border"
                            }`}
                            style={{ backgroundColor: c }}
                            aria-label={c}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {customText && (
                    <div className="rounded-lg border border-border bg-background p-3 text-center">
                      <p
                        className="break-words text-lg font-semibold"
                        style={{
                          fontFamily: customFont || undefined,
                          color: customColor || undefined,
                        }}
                      >
                        {customText}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold">{t("product.quantity")}</p>
            <div className="inline-flex items-center rounded-md border border-border">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  if (qty <= minOrderQty) {
                    toast.error(`Quantité minimale de commande : ${minOrderQty} unité${minOrderQty > 1 ? "s" : ""}.`);
                    return;
                  }
                  setQty(qty - 1);
                }}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-sm font-semibold">{qty}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setQty(qty + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {minOrderQty > 1 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Quantité minimale de commande : {minOrderQty} unités.
              </p>
            )}
          </div>


          {productDescription && (
            <div>
              <p className="mb-1 text-xs font-semibold">{t("product.description")}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {productDescription}
              </p>
            </div>
          )}

          {/* Boutique */}
          <Link
            to="/shop/$vendorId"
            params={{ vendorId: data.vendor_id }}
            className="block rounded-xl border border-border bg-card p-3 hover:bg-accent"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("product.shop")}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
                <Store className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{shopName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("product.see_vendor_products")} {dir === "rtl" ? "←" : "→"}
                </p>
              </div>
            </div>
          </Link>

          {/* Reviews */}
          <ReviewsSection productId={productId} />

          {/* Similar */}
          <SimilarProducts productId={productId} categoryId={(data as any).category_id ?? null} />

          <Dialog open={reportOpen} onOpenChange={setReportOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
                <Flag className="h-3.5 w-3.5" /> {t("product.report_product")}
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("product.report_product")}</DialogTitle>
              </DialogHeader>
              <Textarea
                placeholder={t("product.report_reason_placeholder")}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={4}
              />
              <Button onClick={onReport} className="rounded-full">
                {t("product.report_send")}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </main>

      {/* Bottom bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "var(--safe-bottom, 0px)" }}
      >
        <div className="mx-auto flex max-w-3xl gap-2 px-3 py-3">
          <Link to="/cart" className="shrink-0">
            <Button variant="outline" className="h-12 rounded-full">
              {t("nav.cart")}
            </Button>
          </Link>
          <Button
            className="h-12 flex-1 rounded-full text-sm font-semibold"
            disabled={!canAdd || submitting}
            onClick={onAdd}
          >
            {needsSize ? (
              t("product.choose_size")
            ) : needsColor ? (
              t("product.choose_color")
            ) : needsCustomImage ? (
              t("product.add_image")
            ) : needsCustomText ? (
              t("product.enter_text")
            ) : (
              <EditableLabel
                uiKey="product.add_to_cart"
                defaultLabel={t("product.add_to_cart")}
                defaultSize="md"
              />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ProductGallery est maintenant importe depuis @/components/images/ProductGallery
// avec lightbox integre, swipe navigation et support clavier
