import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Store } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { ShopProductsTable } from "@/components/shop/ShopProductsTable";
import { ShopOverviewCards } from "@/components/shop/ShopOverviewCards";
import { getShopOverview } from "@/lib/shop-management.functions";

export const Route = createFileRoute("/vendor/products/")({
  component: VendorProductsList,
});

function VendorProductsList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const fetchOverview = useServerFn(getShopOverview);

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["shop-overview", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchOverview({ data: { shopId: user!.id } }),
    staleTime: 60_000,
  });

  if (!user) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Store className="h-5 w-5" /> Gestion Boutique
          </h1>
          <p className="text-xs text-muted-foreground">{overview?.shop_name ?? ""}</p>
        </div>
        <Link to="/vendor/products/new">
          <Button size="sm" className="rounded-full">
            <Plus className="mr-1 h-4 w-4" /> {t("vendor.list.add")}
          </Button>
        </Link>
      </div>

      <ShopOverviewCards overview={overview ?? null} loading={loadingOverview} />

      <ShopProductsTable shopId={user.id} editTo="/vendor/products/$productId/edit" />
    </div>
  );
}
