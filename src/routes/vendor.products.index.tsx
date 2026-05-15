import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { pickI18n } from "@/lib/i18n/localized";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/vendor/products/")({
  component: VendorProductsList,
});

function VendorProductsList() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", ar: "ar" };
  const locale = localeMap[lang] ?? "fr-FR";

  const { data: products } = useQuery({
    queryKey: ["vendor-products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_i18n, code, price, status, rejection_reason, product_images(url)")
        .eq("vendor_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const statusLabel = (s: string) =>
    s === "approved" ? t("vendor.list.status.approved")
    : s === "rejected" ? t("vendor.list.status.rejected")
    : t("vendor.list.status.pending");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("vendor.list.title")}</h1>
        <Link to="/vendor/products/new">
          <Button size="sm" className="rounded-full">
            <Plus className="mr-1 h-4 w-4" /> {t("vendor.list.add")}
          </Button>
        </Link>
      </div>

      {!products || products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("vendor.list.empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {products.map((p: any) => {
            const img = (p.product_images as { url: string }[] | null)?.[0]?.url;
            const displayName = pickI18n(p.name, p.name_i18n, lang);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {img && <img src={img} alt={displayName} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("vendor.list.code")} {p.code} • {Number(p.price).toLocaleString(locale)} FCFA
                  </div>
                  {p.rejection_reason && (
                    <div className="mt-1 text-xs text-destructive">{t("vendor.list.reason")} : {p.rejection_reason}</div>
                  )}
                </div>
                <Badge
                  variant={
                    p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"
                  }
                >
                  {statusLabel(p.status)}
                </Badge>
                <Link to="/vendor/products/$productId/edit" params={{ productId: p.id }}>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title={t("vendor.list.edit")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
