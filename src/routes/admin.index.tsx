import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, FolderTree, Flag, Clock, PackageCheck, ArrowRight, Inbox } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

function useCount(table: string, filter?: { col: string; val: string }) {
  return useQuery({
    queryKey: ["count", table, filter?.col, filter?.val],
    queryFn: async () => {
      let q = supabase.from(table as never).select("id", { count: "exact", head: true });
      if (filter) q = (q as never as { eq: (c: string, v: string) => typeof q }).eq(filter.col, filter.val);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function Dashboard() {
  const products = useCount("products");
  const pending = useCount("products", { col: "status", val: "pending" });
  const categories = useCount("categories");
  const reports = useCount("product_reports", { col: "status", val: "open" });
  const vendors = useQuery({
    queryKey: ["count-vendors"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "vendeur");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const tiles = [
    { label: "Produits", value: products.data, icon: Package, color: "text-primary" },
    { label: "À valider", value: pending.data, icon: Clock, color: "text-amber-600" },
    { label: "Catégories", value: categories.data, icon: FolderTree, color: "text-blue-600" },
    { label: "Vendeurs", value: vendors.data, icon: Users, color: "text-emerald-600" },
    { label: "Signalements ouverts", value: reports.data, icon: Flag, color: "text-destructive" },
  ];

  const vendorStats = useQuery({
    queryKey: ["admin", "vendor-stats"],
    queryFn: async () => {
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, profiles:profiles!inner(shop_name, full_name, email)")
        .eq("role", "vendeur");
      if (rErr) throw rErr;
      const list = (roles ?? []) as unknown as Array<{
        user_id: string;
        profiles: { shop_name: string | null; full_name: string | null; email: string | null } | null;
      }>;
      const ids = list.map((v) => v.user_id);
      let countsByVendor: Record<string, { total: number; approved: number; pending: number }> = {};
      if (ids.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("vendor_id, status")
          .in("vendor_id", ids);
        for (const p of prods ?? []) {
          const v = (p as { vendor_id: string }).vendor_id;
          const s = (p as { status: string }).status;
          countsByVendor[v] ??= { total: 0, approved: 0, pending: 0 };
          countsByVendor[v].total += 1;
          if (s === "approved") countsByVendor[v].approved += 1;
          if (s === "pending") countsByVendor[v].pending += 1;
        }
      }
      return list.map((v) => ({
        user_id: v.user_id,
        name: v.profiles?.shop_name || v.profiles?.full_name || v.profiles?.email || "—",
        email: v.profiles?.email,
        ...(countsByVendor[v.user_id] ?? { total: 0, approved: 0, pending: 0 }),
      }));
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Tableau de bord</h1>

      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <PackageCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Validation des produits</div>
            <div className="text-xs text-muted-foreground">
              {pending.data ?? 0} produit{(pending.data ?? 0) > 1 ? "s" : ""} en attente — approuver ou rejeter
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/admin/products">Ouvrir <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{t.label}</CardTitle>
              <t.icon className={`h-4 w-4 ${t.color}`} />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold">{t.value ?? "—"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Vendeurs et leurs produits</CardTitle></CardHeader>
        <CardContent>
          {!vendorStats.data ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : vendorStats.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun vendeur.</p>
          ) : (
            <ul className="divide-y">
              {vendorStats.data.map((v) => (
                <li key={v.user_id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{v.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{v.email}</div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <div className="text-center"><div className="font-bold">{v.total}</div><div className="text-muted-foreground">total</div></div>
                    <div className="text-center"><div className="font-bold text-emerald-600">{v.approved}</div><div className="text-muted-foreground">publiés</div></div>
                    <div className="text-center"><div className="font-bold text-amber-600">{v.pending}</div><div className="text-muted-foreground">en attente</div></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
