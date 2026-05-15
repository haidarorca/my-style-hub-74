import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Store, Flag, ChevronLeft, Upload, X } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { ReviewsSection } from "@/components/product/ReviewsSection";
import { SimilarProducts } from "@/components/product/SimilarProducts";

export const Route = createFileRoute("/product/$productId")({
  component: ProductPage,
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

const DEFAULT_FONTS = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Impact", "Pacifico", "Lobster", "Bebas Neue"];
const DEFAULT_COLORS = ["#000000", "#ffffff", "#e11d48", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

function ProductPage() {
  const { productId } = Route.useParams();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const [reportReason, setReportReason] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
          `id, name, code, designation, description, price, vendor_id, category_id,
           product_images(url, position),
           product_variants(*),
           product_customizations(*),
           profiles:vendor_id(full_name, shop_name)`,
        )
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const variants = (data?.product_variants ?? []) as Variant[];
  const images = (data?.product_images ?? []) as { url: string; position: number | null }[];
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

  const price = matchedVariant?.price_override ?? data?.price ?? 0;
  const needsSize = sizes.length > 0 && !size;
  const needsColor = colors.length > 0 && !color;
  const needsCustomImage = !!imageCustom && !customImageFile;
  const needsCustomText = !!textCustom && !customText.trim();
  const canAdd =
    !needsSize && !needsColor && !needsCustomImage && !needsCustomText &&
    (variants.length === 0 || !!matchedVariant);

  const onAdd = async () => {
    if (!data) return;
    if (!user) {
      toast.error("Connectez-vous pour ajouter au panier");
      return;
    }
    setSubmitting(true);
    try {
      const customization: Record<string, unknown> = {};
      if (imageCustom && customImageFile) {
        const ext = customImageFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/${data.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("customization-uploads")
          .upload(path, customImageFile);
        if (upErr) {
          toast.error(upErr.message);
          setSubmitting(false);
          return;
        }
        const url = supabase.storage.from("customization-uploads").getPublicUrl(path).data.publicUrl;
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
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onReport = async () => {
    if (!user) {
      toast.error("Connectez-vous pour signaler");
      return;
    }
    if (reportReason.trim().length < 5) {
      toast.error("Précisez la raison du signalement");
      return;
    }
    const { error } = await supabase.from("product_reports").insert({
      product_id: productId,
      reporter_id: user.id,
      reason: reportReason.trim(),
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Signalement envoyé");
      setReportOpen(false);
      setReportReason("");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <p className="p-6 text-center text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <p className="p-6 text-center text-sm">Produit introuvable.</p>
      </div>
    );
  }

  const profile = (data as any).profiles;
  const shopName = profile?.shop_name || profile?.full_name || "Boutique";

  return (
    <div className="min-h-screen bg-background pb-28">
      <AppHeader />
      <main className="mx-auto max-w-3xl">
        <div className="px-3 pt-2">
          <BackButton fallbackTo="/" />
        </div>
        {/* Gallery — swipeable */}
        {(() => {
          const variantImg = color ? variants.find((v) => v.color === color && v.image_url)?.image_url : null;
          const urls = images.map((i) => i.url);
          const galleryUrls = variantImg
            ? [variantImg, ...urls.filter((u) => u !== variantImg)]
            : urls;
          return (
            <ProductGallery
              urls={galleryUrls}
              alt={data.name}
              activeIndex={imgIdx}
              onIndexChange={setImgIdx}
            />
          );
        })()}

        <div className="space-y-4 px-4 py-3">
          <div>
            <p className="text-xl font-extrabold text-primary">
              {Number(price).toLocaleString("fr-FR")} FCFA
            </p>
            <h1 className="mt-1 text-base font-semibold">{data.name}</h1>
            <p className="text-xs text-muted-foreground">Code : {data.code}</p>
            {data.designation && (
              <p className="mt-1 text-xs text-muted-foreground">{data.designation}</p>
            )}
          </div>

          {sizes.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold">Taille</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`min-w-12 rounded-md border px-3 py-1.5 text-sm ${
                      size === s ? "border-primary bg-primary text-primary-foreground" : "border-border"
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
              <p className="mb-1.5 text-xs font-semibold">Couleur / Modèle</p>
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
                        <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: hex }} />
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
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Personnalisation</p>

              {imageCustom && (
                <div>
                  <p className="mb-1 text-xs font-semibold">Votre image</p>
                  {imageCustom.image_size_message && (
                    <p className="mb-2 text-[11px] text-muted-foreground">{imageCustom.image_size_message}</p>
                  )}
                  {customImageFile ? (
                    <div className="relative inline-block">
                      <img src={URL.createObjectURL(customImageFile)} alt="" className="h-24 w-24 rounded-lg object-cover" />
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
                      Choisir
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
                    <p className="mb-1 text-xs font-semibold">Votre texte</p>
                    <Input
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Saisissez le texte à imprimer"
                      maxLength={60}
                    />
                  </div>

                  {(textCustom.allow_all_fonts || (textCustom.allowed_fonts && textCustom.allowed_fonts.length > 0)) && (
                    <div>
                      <p className="mb-1 text-xs font-semibold">Police</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(textCustom.allow_all_fonts ? DEFAULT_FONTS : textCustom.allowed_fonts ?? []).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setCustomFont(f)}
                            className={`rounded-md border px-2 py-1 text-xs ${
                              customFont === f ? "border-primary bg-primary text-primary-foreground" : "border-border"
                            }`}
                            style={{ fontFamily: f }}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(textCustom.allow_all_colors || (textCustom.allowed_colors && textCustom.allowed_colors.length > 0)) && (
                    <div>
                      <p className="mb-1 text-xs font-semibold">Couleur du texte</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(textCustom.allow_all_colors ? DEFAULT_COLORS : textCustom.allowed_colors ?? []).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setCustomColor(c)}
                            className={`h-7 w-7 rounded-full border-2 ${
                              customColor === c ? "border-primary ring-2 ring-primary/30" : "border-border"
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
                        style={{ fontFamily: customFont || undefined, color: customColor || undefined }}
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
            <p className="mb-1.5 text-xs font-semibold">Quantité</p>
            <div className="inline-flex items-center rounded-md border border-border">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setQty(Math.max(1, qty - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-sm font-semibold">{qty}</span>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setQty(qty + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {data.description && (
            <div>
              <p className="mb-1 text-xs font-semibold">Description</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.description}</p>
            </div>
          )}

          {/* Boutique */}
          <Link
            to="/shop/$vendorId"
            params={{ vendorId: data.vendor_id }}
            className="block rounded-xl border border-border bg-card p-3 hover:bg-accent"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Boutique
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
                <Store className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{shopName}</p>
                <p className="text-xs text-muted-foreground">Voir tous ses produits →</p>
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
                <Flag className="h-3.5 w-3.5" /> Signaler ce produit
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Signaler ce produit</DialogTitle>
              </DialogHeader>
              <Textarea
                placeholder="Précisez la raison…"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={4}
              />
              <Button onClick={onReport} className="rounded-full">
                Envoyer le signalement
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </main>

      {/* Bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-3xl gap-2 px-3 py-3">
          <Link to="/cart" className="shrink-0">
            <Button variant="outline" className="h-12 rounded-full">
              Panier
            </Button>
          </Link>
          <Button
            className="h-12 flex-1 rounded-full text-sm font-semibold"
            disabled={!canAdd || submitting}
            onClick={onAdd}
          >
            {needsSize ? "Choisir une taille" : needsColor ? "Choisir une couleur" : needsCustomImage ? "Ajouter votre image" : needsCustomText ? "Saisir votre texte" : "Ajouter au panier"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ProductGalleryProps {
  urls: string[];
  alt: string;
  activeIndex: number;
  onIndexChange: (i: number) => void;
}

function ProductGallery({ urls, alt, activeIndex, onIndexChange }: ProductGalleryProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => onIndexChange(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onIndexChange]);

  useEffect(() => {
    if (!api) return;
    if (api.selectedScrollSnap() !== activeIndex) {
      api.scrollTo(activeIndex);
    }
  }, [api, activeIndex]);

  if (urls.length === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        <Link
          to="/"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <Carousel setApi={setApi} opts={{ loop: false, align: "start" }}>
        <CarouselContent className="ml-0">
          {urls.map((url, i) => (
            <CarouselItem key={`${url}-${i}`} className="pl-0 basis-full">
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                <img
                  src={url}
                  alt={`${alt} ${i + 1}`}
                  className="h-full w-full object-cover select-none"
                  draggable={false}
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <Link
        to="/"
        className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      {urls.length > 1 && (
        <>
          <div className="absolute right-3 top-3 z-10 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur">
            {activeIndex + 1} / {urls.length}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {urls.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeIndex ? "w-5 bg-primary" : "w-1.5 bg-background/70"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

