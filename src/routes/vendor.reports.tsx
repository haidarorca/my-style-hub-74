import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, Search, Package, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vendor/reports")({
  component: VendorReports,
});

const PAGE_SIZE = 15;
const STATUS_LABEL: Record<string, string> = { open: "Ouvert", reviewed: "Traité", dismissed: "Ignoré" };

function VendorReports() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "product" | "vendor">("all");
  const [status, setStatus] = useState<"all" | "open" | "reviewed" | "dismissed">("all");
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [search, type, status]);

  const { data: productIds = [] } = useQuery({
    queryKey: ["vendor-product-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id").eq("vendor_id", user!.id);
      return (data ?? []).map((p: any) => p.id) as string[];
    },
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["vendor-reports", user?.id, { search: search.trim(), type, status, page, n: productIds.length }],
    enabled: !!user,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("product_reports")
        .select("id, reason, reason_category, report_type, status, created_at, product_id, vendor_id, product:products(id, name, code)", { count: "exact" })
        .order("created_at", { ascending: false });

      // Scope: reports about THIS vendor or about products owned by them
      const filters: string[] = [`vendor_id.eq.${user!.id}`];
      if (productIds.length > 0) filters.push(`product_id.in.(${productIds.join(",")})`);
      q = q.or(filters.join(","));

      if (type !== "all") q = q.eq("report_type", type);
      if (status !== "all") q = q.eq("status", status);
      if (search.trim()) {
        const esc = search.trim().replace(/[%,()]/g, " ");
        q = q.or(`reason.ilike.%${esc}%,reason_category.ilike.%${esc}%`);
      }

      const from = page * PAGE_SIZE;
      const { data: rows, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: rows ?? [], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Signalements</h1>
        <span className="text-xs text-muted-foreground">{total} résultat{total > 1 ? "s" : ""}{isFetching && !isLoading ? " · …" : ""}</span>
      </div>

      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher motif…" className="pl-8" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="product">Produit</SelectItem>
                <SelectItem value="vendor">Vendeur</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="open">Ouvert</SelectItem>
                <SelectItem value="reviewed">Traité</SelectItem>
                <SelectItem value="dismissed">Ignoré</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun signalement.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r: any) => {
            const isVendor = r.report_type === "vendor";
            return (
              <Card key={r.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      {isVendor ? <Store className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                      {isVendor ? "Sur votre boutique" : "Sur un produit"}
                    </Badge>
                    {r.reason_category && (
                      <Badge variant="secondary" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />{r.reason_category}
                      </Badge>
                    )}
                    <Badge variant={r.status === "open" ? "destructive" : "secondary"}>{STATUS_LABEL[r.status]}</Badge>
                    <span className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  {!isVendor && r.product && (
                    <div className="text-sm font-semibold">{r.product.name} <span className="text-xs text-muted-foreground">· Code {r.product.code}</span></div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{r.reason}</p>
                  {!isVendor && r.product && (
                    <div>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/vendor/products/$productId/edit" params={{ productId: r.product.id }}>
                          Modifier le produit
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Page {page + 1} / {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Préc.</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Suiv.</Button>
          </div>
        </div>
      )}
    </div>
  );
}
