import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { previewDisplayPrice } from "@/lib/shop-management.functions";
import { useI18n } from "@/hooks/use-i18n";

interface Props {
  vendorId: string | null | undefined;
  basePrice: number | string;
  categoryId?: string | null;
}

/**
 * Shows the buyer-facing final price (commission included) for a given
 * base price. Updates live (debounced) as the seller types.
 */
export function CommissionPricePreview({ vendorId, basePrice, categoryId }: Props) {
  const fetcher = useServerFn(previewDisplayPrice);
  const { lang } = useI18n();
  const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", ar: "ar" };
  const locale = localeMap[lang] ?? "fr-FR";

  const [result, setResult] = useState<{
    base_price: number; final_price: number; commission_rate: number; commission_amount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const priceNum = typeof basePrice === "number" ? basePrice : Number(basePrice);

  useEffect(() => {
    if (!vendorId || !Number.isFinite(priceNum) || priceNum <= 0) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetcher({
          data: { vendorId, basePrice: priceNum, categoryId: categoryId ?? null },
        });
        if (!cancelled) setResult(res);
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [vendorId, priceNum, categoryId, fetcher]);

  if (!vendorId || !Number.isFinite(priceNum) || priceNum <= 0) return null;
  if (!result) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {loading ? "Calcul du prix client…" : ""}
      </p>
    );
  }

  if (result.commission_rate === 0 || result.commission_amount === 0) {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Prix affiché au client : <span className="font-semibold text-foreground">{result.final_price.toLocaleString(locale)} FCFA</span>
      </p>
    );
  }

  return (
    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
      <Sparkles className="h-3 w-3" />
      Prix affiché au client :{" "}
      <span className="font-bold">{result.final_price.toLocaleString(locale)} FCFA</span>{" "}
      <span className="text-muted-foreground">
        (commission +{result.commission_rate}% incluse)
      </span>
    </p>
  );
}
