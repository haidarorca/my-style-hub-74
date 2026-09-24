import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Store, Flag, ChevronLeft, Upload, X, ShieldCheck, AlertTriangle, Ruler, Video, Heart } from "lucide-react";
import { QuantityInput } from "@/components/ui/quantity-input";
import { warrantyLabel } from "@/lib/warranty";
import { isClothingContext, getMeasurementFields, hasAnyMeasurement } from "@/lib/clothing-categories";
import { fitTypeOption } from "@/lib/fit-types";
import { formatComposition, type CompositionItem } from "@/lib/textile-materials";
import { SEASONS, GENDERS, AGE_GROUPS, CARE_INSTRUCTIONS, labelOf } from "@/lib/clothing-attributes";
import { parseVideoUrl } from "@/lib/product-video";

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
import { SensitiveThumb } from "@/lib/sensitive-images";
import { toReadableText, type ProductSpec } from "@/lib/cj/description";
import { DeliveryToConfirmNotice } from "@/components/shared/DeliveryNotice";
import { GroupSelector } from "@/components/product/GroupSelector";
import { useTracker, useTrackProductView } from "@/hooks/use-tracker";
import { useFavorites } from "@/hooks/use-favorites";
import { RecommendationBlock } from "@/components/product/RecommendationBlock";
import { useRecommendations } from "@/hooks/use-recommendations";
import { ShareButton } from "@/components/share/ShareButton";

export const Route = createFileRoute("/product/$productId")({
  component: ProductPage,
  // `variant` pré-sélectionne une variante, `edit` modifie une ligne de panier
  // existante au lieu d'en créer une nouvelle.
  validateSearch: (
    search: Record<string, unknown>,
  ): { variant?: string; edit?: string; qty?: number } => ({
    variant: typeof search.variant === "string" ? search.variant : undefined,
    edit: typeof search.edit === "string" ? search.edit : undefined,
    qty: Number(search.qty) > 0 ? Math.round(Number(search.qty)) : undefined,
  }),
  loader: async ({ params }) => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("products")
        .select("id, name, description, price, product_images(url, position)")
        .order("position", { referencedTable: "product_images", ascending: true })
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
      { property: "og:site_name", content: "Kawzone" },
      { property: "og:locale", content: "fr_FR" },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ];
    // Aperçu social : image composée côté serveur (photo + nom + prix + marque).
    const ogImage = `https://kawzone.com/api/public/og/product/${params.productId}`;
    meta.push({ property: "og:image", content: ogImage });
    meta.push({ property: "og:image:width", content: "800" });
    meta.push({ property: "og:image:height", content: "420" });
    meta.push({ name: "twitter:image", content: ogImage });
    if (img) {
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
  supplier_sku?: string | null;
  image_url: string | null;
  measurements?: Record<string, number> | null;
  /** Disponibilité déclarée par le fournisseur (false = épuisé chez le fournisseur). */
  supplier_available?: boolean | null;
  supplier_stock?: number | null;
  cj_options?: Record<string, string> | null;
  /** Données logistiques de la variante (prioritaires sur le produit). */
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
}

/** Une variante est commandable tant que le fournisseur ne l'a pas déclarée épuisée. */
const isVariantAvailable = (v: Variant) => v.supplier_available !== false && v.supplier_stock !== 0;

/** Libellé réel d'une dimension CJ (Size → Taille, Color → Couleur, autre → tel quel). */
const OPTION_FR: Record<string, string> = { size: "Taille", color: "Couleur", colour: "Couleur", style: "Style", model: "Modèle", quantity: "Quantité", material: "Matière" };
const optionLabel = (n: string) => OPTION_FR[n.trim().toLowerCase()] ?? n.trim();

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
  const { variant: presetVariantId, edit: editLineId, qty: presetQty } = Route.useSearch();
  const { user } = useAuth();
  const { addToCart, updateLine } = useCart();
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
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

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
           specifications, stock_status, weight_kg, length_cm, width_cm, height_cm, brand, brand_id, warranty_days, is_fragile, min_order_qty, video_url, origin_country_id, fit_type, material, material_composition, material_composition_items, season, gender, age_group, care_instructions,

           group_id, group_option_label,
           product_images(url, position),
           product_variants(*),
           product_customizations(*),
           categories:category_id(name, slug),
           brands:brand_id(name),
           origin_country:countries!products_origin_country_id_fkey(name, flag_emoji),
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
  const categoryName: string | null = (() => {
    const c = (data as any)?.categories;
    if (!c) return null;
    if (Array.isArray(c)) return c[0]?.name ?? null;
    return (c as any)?.name ?? null;
  })();
  const fitInfo = fitTypeOption((data as any)?.fit_type ?? null);
  const isClothing = isClothingContext(categoryName, (data as any)?.name ?? null);
  const measurementFields = useMemo(
    () => getMeasurementFields(categoryName, (data as any)?.name ?? null),
    [categoryName, data],
  );



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

  // Options en rupture : une taille est en rupture si aucune variante disponible
  // ne l'offre pour la couleur choisie (et inversement). Affichées, non sélectionnables.
  const soldOutSizes = useMemo(
    () =>
      new Set(
        sizes.filter(
          (s) => !variants.some((v) => v.size === s && (!color || colors.length === 0 || v.color === color) && isVariantAvailable(v)),
        ),
      ),
    [sizes, variants, color, colors.length],
  );
  const soldOutColors = useMemo(
    () =>
      new Set(
        colors
          .map(([c]) => c)
          .filter((c) => !variants.some((v) => v.color === c && (!size || sizes.length === 0 || v.size === size) && isVariantAvailable(v))),
      ),
    [colors, variants, size, sizes.length],
  );
  // Libellés des options à partir des vrais noms CJ (jamais inventés).
  const { sizeLabel, colorLabel } = useMemo(() => {
    const names = variants.map((v) => v.cj_options).find((o) => o && Object.keys(o).length > 0);
    if (!names) return { sizeLabel: null as string | null, colorLabel: null as string | null };
    const keys = Object.keys(names).filter((k) => k !== "Option");
    const sizeKey = keys.find((k) => /size|尺码|尺寸|码/i.test(k));
    const others = keys.filter((k) => k !== sizeKey);
    return {
      sizeLabel: sizeKey ? optionLabel(sizeKey) : null,
      colorLabel: others.length ? others.map(optionLabel).join(" / ") : null,
    };
  }, [variants]);
  const allSoldOut = variants.length > 0 && variants.every((v) => !isVariantAvailable(v));

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
  const track = useTracker();
  const favorites = useFavorites();
  const navigate = useNavigate();

  // Profil d'intérêt : consultation produit (une fois par session).
  useTrackProductView(data?.id ?? null, (data as any)?.category_id ?? null);

  const { data: complementary, isLoading: complementaryLoading } = useRecommendations({
    context: "product",
    exclude: data?.id ? [data.id] : [],
    limit: 8,
    enabled: !!data?.id,
  });

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

  // Pré-sélection depuis le panier (bouton « Modifier ») : variante + quantité.
  useEffect(() => {
    if (!presetVariantId || variants.length === 0) return;
    const v = variants.find((x) => x.id === presetVariantId);
    if (!v) return;
    setSize(v.size ?? null);
    setColor(v.color ?? null);
    if (presetQty && presetQty > 0) setQty(presetQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetVariantId, presetQty, variants.length]);


  // Estimation transport pour la fiche (mode poids connu)
  const shippingEstProduct = useMemo(() => data ? ({
    weight_kg: (data as any).weight_kg,
    length_cm: (data as any).length_cm,
    width_cm: (data as any).width_cm,
    height_cm: (data as any).height_cm,
    vendor_source_country_id: ((data as any).profiles?.source_country_id ?? null) as string | null,
  }) : null, [data]);
  // La variante sélectionnée et la quantité entrent dans le calcul :
  // poids/volume total = données de la variante × quantité.
  const shippingEst = useEstimatedShipping(shippingEstProduct, matchedVariant ?? null, qty);
  const selectedShippingOption = useMemo(
    () => shippingEst.options.find((o: any) => o.service.id === selectedShippingServiceId) ?? shippingEst.cheapest,
    [shippingEst, selectedShippingServiceId],
  );
  // Prix consolidé affiché au client : produit + transport choisi si poids connu intl.
  const displayPrice = useMemo(() => {
    if (resolvedFinalPrice == null) return null;
    if (shippingEst.isIntl && shippingEst.canEstimate && selectedShippingOption) {
      // Produit × quantité + transport recalculé pour cette quantité.
      return Math.round(Number(resolvedFinalPrice) * qty + selectedShippingOption.price);
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
    (variants.length === 0 || (!!matchedVariant && isVariantAvailable(matchedVariant))) &&
    !allSoldOut;

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
      if (editLineId) {
        // Modification d'une ligne existante : même ligne mise à jour.
        const ok = await updateLine(editLineId, {
          variantId: matchedVariant?.id ?? null,
          quantity: qty,
          customization: Object.keys(customization).length > 0 ? customization : null,
        });
        if (ok) navigate({ to: "/cart" });
      } else {
        await addToCart({
          productId: data.id,
          variantId: matchedVariant?.id ?? null,
          quantity: qty,
          customization: Object.keys(customization).length > 0 ? customization : null,
          shippingServiceId: selectedShippingServiceId,
        });
      }
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
    <div className="min-h-screen bg-background pb-[calc(7rem+var(--bottom-nav-total))] md:pb-28">
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
              categoryId={(data as any).category_id ?? null}
            />
          );
        })()}

        <div className="space-y-4 px-4 py-3">
          <div>
            {displayPrice !== null ? (
              <>
                <p className="text-xl font-extrabold text-primary">
                  {Number(displayPrice) > 0 ? (
                    <>
                      {!matchedVariant && variants.length > 1 && (
                        <span className="mr-1 text-xs font-normal text-muted-foreground">À partir de</span>
                      )}
                      {fmt(Number(displayPrice))}
                    </>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">Prix à définir</span>
                  )}
                </p>
                {transportIncluded ? (
                  <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                    Transport inclus — modifiable au panier
                  </p>
                ) : (
                  <DeliveryToConfirmNotice className="mt-2" />
                )}
              </>
            ) : (
              <Skeleton className="h-7 w-32" />
            )}
            {variants.length > 0 && (
              <p
                className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold ${
                  allSoldOut || (matchedVariant && !isVariantAvailable(matchedVariant))
                    ? "text-destructive"
                    : (data as any).stock_status === "low"
                      ? "text-warning"
                      : "text-success"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-current" />
                {allSoldOut
                  ? "Rupture de stock"
                  : matchedVariant && !isVariantAvailable(matchedVariant)
                    ? "Cette variante est en rupture de stock"
                    : (data as any).stock_status === "low"
                      ? "Stock limité"
                      : "En stock"}
              </p>
            )}
            <h1 className="mt-1 text-base font-semibold">{productName}</h1>
            <p className="text-xs text-muted-foreground">
              {t("product.code")} : {matchedVariant?.supplier_sku || data.code}
            </p>
            {productDesignation && !/[\u3400-\u9fff]/.test(productDesignation) && (
              <p className="mt-1 text-xs text-muted-foreground">{productDesignation}</p>
            )}
            <div className="mt-3">
              {(() => {
                const oc = (data as any).origin_country;
                const ocObj = Array.isArray(oc) ? oc[0] : oc;
                const vendorSrc = ((data as any).profiles?.source_country_id ??
                  (Array.isArray((data as any).profiles) ? (data as any).profiles[0]?.source_country_id : null)) as string | null;
                // Heuristique : produit importé si vendeur international connu, sinon local.
                const originType: "local" | "import" | null = vendorSrc
                  ? "import"
                  : ocObj?.name
                  ? "local"
                  : null;
                const originLabel = ocObj?.name
                  ? `${ocObj.flag_emoji ? ocObj.flag_emoji + " " : ""}${ocObj.name}`
                  : null;
                return (
                  <ShareButton
                    variant="cta"
                    product={{
                      id: data.id,
                      name: productName,
                      imageUrl: data.product_images?.[0]?.url ?? null,
                      priceLabel: displayPrice !== null ? fmt(Number(displayPrice)) : `${data.price} XOF`,
                      shopName,
                      originType,
                      originLabel,
                    }}
                  />
                );
              })()}

              {/* Favori — uniquement sur la fiche produit */}
              <button
                type="button"
                onClick={() => {
                  const res = favorites.toggle(data.id);
                  if (res.needsLogin) {
                    toast.info("Connectez-vous pour retrouver vos favoris.");
                    void navigate({ to: "/login" });
                  }
                }}
                aria-pressed={favorites.isFavorite(data.id)}
                aria-label={favorites.isFavorite(data.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                className="ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent active:scale-95"
              >
                <Heart className={`h-5 w-5 ${favorites.isFavorite(data.id) ? "fill-primary text-primary" : ""}`} />
              </button>
            </div>

            {(data as any).group_id ? (
              <GroupSelector groupId={(data as any).group_id} currentProductId={data.id} className="mt-3" />
            ) : null}
          </div>

          {(warrantyText || isFragile || fitInfo || (isClothing && variants.some((v) => hasAnyMeasurement(v.measurements)))) && (
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
              {fitInfo && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800"
                >
                  {fitInfo.label} — {fitInfo.description}
                </span>
              )}
              {isClothing && variants.some((v) => hasAnyMeasurement(v.measurements)) && (
                <button
                  type="button"
                  onClick={() => setSizeGuideOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                >
                  <Ruler className="h-3.5 w-3.5" /> 📏 Guide des tailles
                </button>
              )}
            </div>
          )}

          {fitInfo && (
            <p className="text-[11px] text-muted-foreground">{fitInfo.description}</p>
          )}

          {(() => {
            const items = ((data as any).material_composition_items ?? []) as CompositionItem[];
            const compoText = items.length > 0
              ? formatComposition(items)
              : ((data as any).material_composition as string | null) ?? null;
            const matPrimary = (data as any).material as string | null;
            const brandObj = (data as any).brands;
            const brandName = brandObj
              ? (Array.isArray(brandObj) ? brandObj[0]?.name : brandObj.name)
              : ((data as any).brand as string | null);
            const seasonLbl = labelOf(SEASONS, (data as any).season);
            const genderLbl = labelOf(GENDERS, (data as any).gender);
            const ageLbl = labelOf(AGE_GROUPS, (data as any).age_group);
            const careArr = ((data as any).care_instructions ?? []) as string[];
            const careLabels = careArr.map((v) => labelOf(CARE_INSTRUCTIONS, v)).filter(Boolean) as string[];
            const showMaterial = !!compoText || !!matPrimary;
            const showCloth = isClothing && (seasonLbl || genderLbl || ageLbl || careLabels.length > 0);
            const oc = (data as any).origin_country;
            const ocObj = Array.isArray(oc) ? oc[0] : oc;
            const originName: string | null = ocObj?.name ?? null;
            const originFlag: string | null = ocObj?.flag_emoji ?? null;
            const minQ = Math.max(1, Math.round(Number((data as any).min_order_qty ?? 1) || 1));
            if (!brandName && !showMaterial && !showCloth && !originName && minQ <= 1) return null;
            return (
              <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                {brandName && (
                  <p className="text-sm"><span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Marque : </span><span className="font-semibold">{brandName}</span></p>
                )}
                {originName && (
                  <p className="text-sm">🌍 <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Fabriqué en </span><span className="font-semibold">{originFlag ? originFlag + " " : ""}{originName}</span></p>
                )}
                {minQ > 1 && (
                  <p className="text-sm">📦 <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Quantité minimale : </span><span className="font-semibold">{minQ} unités</span></p>
                )}
                {showMaterial && (
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Matière</p>
                    {matPrimary && <p className="text-sm font-semibold">{matPrimary}</p>}
                    {compoText && <p className="text-xs text-muted-foreground">Composition : {compoText}</p>}
                  </div>
                )}
                {showCloth && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Détails vêtement</p>
                    <div className="flex flex-wrap gap-1.5">
                      {seasonLbl && <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px]">🗓 {seasonLbl}</span>}
                      {genderLbl && <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px]">👤 {genderLbl}</span>}
                      {ageLbl && <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px]">🎂 {ageLbl}</span>}
                    </div>
                    {careLabels.length > 0 && (
                      <ul className="ml-4 list-disc text-[11px] text-muted-foreground">
                        {careLabels.map((l) => <li key={l}>{l}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {(() => {
            const video = parseVideoUrl((data as any).video_url);
            if (!video || !video.embedUrl) return null;
            return (
              <div className="space-y-1.5">
                <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Video className="h-3 w-3" /> Vidéo produit
                </p>
                <div className="overflow-hidden rounded-xl border bg-black aspect-video">
                  {video.provider === "direct" ? (
                    <video src={video.embedUrl} controls className="h-full w-full" />
                  ) : (
                    <iframe
                      src={video.embedUrl}
                      title="Vidéo produit"
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )}
                </div>
              </div>
            );
          })()}

          <Dialog open={sizeGuideOpen} onOpenChange={setSizeGuideOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Ruler className="h-4 w-4" /> Guide des tailles
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Mesures réelles fournies par le vendeur (en cm). Choisissez la taille la plus proche de vos mensurations.
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 text-left">
                      <tr>
                        <th className="p-2">Taille</th>
                        {variants.some((v) => v.color) && <th className="p-2">Variante</th>}
                        {measurementFields.map((f) => (
                          <th key={f.key} className="p-2 whitespace-nowrap">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {variants
                        .filter((v) => hasAnyMeasurement(v.measurements))
                        .map((v) => (
                          <tr key={v.id} className="border-t">
                            <td className="p-2 font-semibold">{v.size ?? "—"}</td>
                            {variants.some((x) => x.color) && (
                              <td className="p-2 text-muted-foreground">{v.color ?? "—"}</td>
                            )}
                            {measurementFields.map((f) => {
                              const n = Number((v.measurements as any)?.[f.key]);
                              return (
                                <td key={f.key} className="p-2 whitespace-nowrap">
                                  {Number.isFinite(n) && n > 0 ? `${n} cm` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {fitInfo && (
                  <p className="text-[11px] text-muted-foreground">
                    <b>Coupe :</b> {fitInfo.label} — {fitInfo.description}
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>


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
            variant={
              matchedVariant
                ? {
                    weight_kg: (matchedVariant as any).weight_kg,
                    length_cm: (matchedVariant as any).length_cm,
                    width_cm: (matchedVariant as any).width_cm,
                    height_cm: (matchedVariant as any).height_cm,
                  }
                : null
            }
            quantity={qty}
            productPrice={resolvedFinalPrice}
            selectedServiceId={selectedShippingServiceId}
            onSelectService={setSelectedShippingServiceId}
          />


          {sizes.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold">{sizeLabel ?? t("product.size")}</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const out = soldOutSizes.has(s);
                  return (
                    <button
                      key={s}
                      disabled={out}
                      onClick={() => setSize(s)}
                      title={out ? "Rupture de stock" : undefined}
                      aria-label={out ? `${s} — Rupture de stock` : undefined}
                      className={`min-w-12 rounded-md border px-3 py-1.5 text-sm ${
                        out
                          ? "cursor-not-allowed border-border/60 text-muted-foreground line-through opacity-60"
                          : size === s
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                      }`}
                    >
                      {s}
                      {out && <span className="ml-1 text-[10px] no-underline">· Rupture</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {colors.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold">{colorLabel ?? t("product.color_model")}</p>
              <div className="flex flex-wrap gap-2">
                {colors.map(([c, hex]) => {
                  const vImg = variants.find((v) => v.color === c && v.image_url)?.image_url;
                  const out = soldOutColors.has(c);
                  return (
                    <button
                      key={c}
                      disabled={out}
                      title={out ? "Rupture de stock" : undefined}
                      aria-label={out ? `${c} — Rupture de stock` : undefined}
                      onClick={() => setColor(c)}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${
                        out
                          ? "cursor-not-allowed border-border/60 text-muted-foreground line-through opacity-60"
                          : color === c
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border"
                      }`}
                    >
                      {vImg ? (
                        <span className="h-5 w-5 overflow-hidden rounded border border-border">
                          <SensitiveThumb categoryId={(data as any).category_id ?? null} src={vImg} alt="" className="h-full w-full object-cover" />
                        </span>
                      ) : hex ? (
                        <span
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: hex }}
                        />
                      ) : null}
                      {c}
                      {out && <span className="text-[10px]">· Rupture</span>}
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
            <QuantityInput
              value={qty}
              min={minOrderQty}
              onChange={(next) => {
                if (next < minOrderQty) {
                  toast.error(`Quantité minimale de commande : ${minOrderQty} unité${minOrderQty > 1 ? "s" : ""}.`);
                  return;
                }
                setQty(next);
              }}
            />
            {minOrderQty > 1 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Quantité minimale de commande : {minOrderQty} unités.
              </p>
            )}
          </div>


          {toReadableText(productDescription) && (
            <div>
              <p className="mb-1 text-xs font-semibold">{t("product.description")}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {toReadableText(productDescription)}
              </p>
            </div>
          )}

          {(() => {
            // Caractéristiques : données fournisseur structurées + logistique de la variante.
            const specs = (Array.isArray((data as any).specifications) ? (data as any).specifications : []) as ProductSpec[];
            const src = matchedVariant ?? (variants.length === 1 ? variants[0] : null);
            const w = src?.weight_kg ?? (data as any).weight_kg;
            const L = src?.length_cm ?? (data as any).length_cm;
            const W = src?.width_cm ?? (data as any).width_cm;
            const H = src?.height_cm ?? (data as any).height_cm;
            const rows: { label: string; value: string }[] = specs
              .filter((sp) => sp.value)
              .map((sp) => ({ label: sp.label, value: sp.value }));
            if (w) rows.push({ label: "Poids", value: w < 1 ? `${Math.round(w * 1000)} g` : `${Number(w).toLocaleString("fr-FR")} kg` });
            if (L && W && H) rows.push({ label: "Dimensions (L × l × h)", value: `${L} × ${W} × ${H} cm` });
            const tables = specs.filter((sp) => sp.rows && sp.rows.length);
            if (!rows.length && !tables.length) return null;
            return (
              <div>
                <p className="mb-1.5 text-xs font-semibold">Caractéristiques</p>
                {rows.length > 0 && (
                  <dl className="divide-y divide-border rounded-xl border border-border text-sm">
                    {rows.map((r) => (
                      <div key={r.label} className="grid grid-cols-[40%_1fr] gap-2 px-3 py-2">
                        <dt className="text-muted-foreground">{r.label}</dt>
                        <dd className="font-medium break-words">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {tables.map((tb) => (
                  <div key={tb.label} className="mt-3">
                    <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{tb.label}</p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <tbody>
                          {tb.rows!.map((row, i) => (
                            <tr key={i} className={i === 0 ? "bg-muted font-semibold" : "border-t border-border"}>
                              {row.map((cell, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{cell}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

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

        {/* Complémentaires — moteur de recommandations central */}
        <RecommendationBlock
          title="🧰 Vous pourriez aussi en avoir besoin"
          subtitle="Produits souvent utiles avec celui-ci"
          products={complementary}
          isLoading={complementaryLoading}
        />
      </main>

      {/* Bottom bar */}
      <div
        className="kz-above-nav fixed inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur"
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
            {allSoldOut ? (
              "Rupture de stock"
            ) : matchedVariant && !isVariantAvailable(matchedVariant) ? (
              "Variante en rupture"
            ) : needsSize ? (
              t("product.choose_size")
            ) : needsColor ? (
              t("product.choose_color")
            ) : needsCustomImage ? (
              t("product.add_image")
            ) : needsCustomText ? (
              t("product.enter_text")
            ) : editLineId ? (
              "Mettre à jour l'article"
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
