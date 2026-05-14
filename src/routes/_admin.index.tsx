import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Users, FolderTree, Flag, Clock } from "lucide-react";

export const Route = createFileRoute("/_admin/")({
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Tableau de bord</h1>
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
    </div>
  );
}
