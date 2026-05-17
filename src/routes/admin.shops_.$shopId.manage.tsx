import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Store, PackagePlus, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ShopOverviewCards } from "@/components/shop/ShopOverviewCards";
import { ShopProductsTable } from "@/components/shop/ShopProductsTable";
import { getShopOverview } from "@/lib/shop-management.functions";

export const Route = createFileRoute("/admin/shops_/$shopId/manage")({
  component: AdminShopManagePage,
});

function AdminShopManagePage() {
  const { shopId } = Route.useParams();
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const fetchOverview = useServerFn(getShopOverview);

  useEffect(() => {
    if (!loading && !isAdmin) router.navigate({ to: "/" });
  }, [loading, isAdmin, router]);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["shop-overview", shopId],
    queryFn: () => fetchOverview({ data: { shopId } }),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild size="icon" variant="ghost">
            <Link to="/admin/shops"><ChevronLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <Store className="h-5 w-5" /> {overview?.shop_name ?? "Boutique"}
            </h1>
            <p className="text-xs text-muted-foreground">Gestion complète de la boutique admin</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/shop/$vendorId" params={{ vendorId: shopId }}>
              <ShoppingBag className="mr-1 h-4 w-4" /> Voir publiquement
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/admin/shops/$shopId/products/new" params={{ shopId }}>
              <PackagePlus className="mr-1 h-4 w-4" /> Nouveau produit
            </Link>
          </Button>
        </div>
      </div>

      <ShopOverviewCards overview={overview ?? null} loading={isLoading} />

      <ShopProductsTable
        shopId={shopId}
        editTo="/admin/products/$productId/edit"
        newTo={{ to: "/admin/shops/$shopId/products/new", params: { shopId } }}
      />
    </div>
  );
}
