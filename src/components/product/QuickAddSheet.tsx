import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/use-cart";
import { EditableLabel } from "@/components/admin/EditableLabel";
import { useI18n } from "@/hooks/use-i18n";
import { useDisplayPriceLines } from "@/hooks/use-display-prices";
import { pickI18n } from "@/lib/i18n/localized";

interface Variant {
  id: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  price_override: number | null;
}

interface Props {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAddSheet({ productId, open, onOpenChange }: Props) {
  const { addToCart } = useCart();
  const { lang, t } = useI18n();
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const { data } = useQuery({
    queryKey: ["product-quick", productId],
    enabled: !!productId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_i18n, price, code, product_images(url), product_variants(*)")
        .eq("id", productId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (open) {
      setSize(null);
      setColor(null);
      setQty(1);
    }
  }, [open, productId]);

  const variants = (data?.product_variants ?? []) as Variant[];
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

  const needsSize = sizes.length > 0 && !size;
  const needsColor = colors.length > 0 && !color;
  const canAdd = !needsSize && !needsColor && (variants.length === 0 || !!matchedVariant);

  const onConfirm = async () => {
    if (!data) return;
    setSubmitting(true);
    const ok = await addToCart({
      productId: data.id,
      variantId: matchedVariant?.id ?? null,
      quantity: qty,
    });
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  const priceLines = useMemo(
    () => data ? [{ productId: data.id, variantId: matchedVariant?.id ?? null }] : [],
    [data, matchedVariant?.id],
  );
  const displayPriceLines = useDisplayPriceLines(priceLines);
  const priceKey = data ? `${data.id}:${matchedVariant?.id ?? ""}` : "";
  const img = (data?.product_images as { url: string }[] | null)?.[0]?.url;
  const price = displayPriceLines.get(priceKey)?.final_price ?? matchedVariant?.price_override ?? data?.price ?? 0;
  const productName = data ? pickI18n(data.name, (data as any).name_i18n, lang) : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">{t("product.add_to_cart")}</SheetTitle>
        </SheetHeader>

        {data && (
          <div className="mt-3 space-y-4">
            <div className="flex gap-3">
              <div className="h-20 w-20 overflow-hidden rounded-lg bg-muted">
                {img && <img src={img} alt={productName} className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1">
                <p className="line-clamp-2 text-sm font-medium">{productName}</p>
                <p className="mt-1 text-lg font-bold text-primary">
                  {Number(price).toLocaleString("fr-FR")} {t("misc.currency")}
                </p>
              </div>
            </div>

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
                          : "border-border bg-background"
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
                <p className="mb-1.5 text-xs font-semibold">{t("product.color")}</p>
                <div className="flex flex-wrap gap-2">
                  {colors.map(([c, hex]) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${
                        color === c ? "border-primary" : "border-border"
                      }`}
                    >
                      {hex && (
                        <span
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: hex }}
                        />
                      )}
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold">{t("product.quantity")}</p>
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

            <Button
              className="h-12 w-full rounded-full text-sm font-semibold"
              disabled={!canAdd || submitting}
              onClick={onConfirm}
            >
              {needsSize ? t("product.choose_size") : needsColor ? t("product.choose_color") : <EditableLabel uiKey="product.add_to_cart" defaultLabel={t("product.add_to_cart")} defaultSize="md" />}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
