import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Store, Flag, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
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

  const { data, isLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          `id, name, code, designation, description, price, vendor_id, category_id,
           product_images(url, position),
           product_variants(*),
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
  const canAdd = !needsSize && !needsColor && (variants.length === 0 || !!matchedVariant);

  const onAdd = async () => {
    if (!data) return;
    setSubmitting(true);
    await addToCart({
      productId: data.id,
      variantId: matchedVariant?.id ?? null,
      quantity: qty,
    });
    setSubmitting(false);
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
        {/* Gallery — show variant image if a color/model with image is selected */}
        {(() => {
          const variantImg = color ? variants.find((v) => v.color === color && v.image_url)?.image_url : null;
          const displayUrl = variantImg ?? images[imgIdx]?.url;
          return (
            <div className="relative aspect-square w-full overflow-hidden bg-muted">
              {displayUrl ? (
                <img src={displayUrl} alt={data.name} className="h-full w-full object-cover" />
              ) : null}
              <Link
                to="/"
                className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </div>
          );
        })()}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto p-3">
            {images.map((im, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${
                  i === imgIdx ? "border-primary" : "border-transparent"
                }`}
              >
                <img src={im.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

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
            {needsSize ? "Choisir une taille" : needsColor ? "Choisir une couleur" : "Ajouter au panier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
