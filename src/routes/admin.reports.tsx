import { createFileRoute, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { Search, Store, Package, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/admin/reports")({
  component: () => <PermissionGate perm="support"><ReportsPage /></PermissionGate>,
});

type ReportRow = {
  id: string;
  reason: string;
  reason_category: string | null;
  report_type: "product" | "vendor";
  status: "open" | "reviewed" | "dismissed";
  created_at: string;
  order_id: string | null;
  reporter_id: string;
  vendor_id: string | null;
  product: { id: string; name: string; code: string } | null;
};

const PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_LABEL: Record<string, string> = {
  open: "Ouvert",
  reviewed: "Traité",
  dismissed: "Ignoré",
};

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function ReportsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "product" | "vendor">("all");
  const [status, setStatus] = useState<"all" | "open" | "reviewed" | "dismissed">("open");
  const [reason, setReason] = useState<string>("all");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounced(search.trim());

  // Reset to first page when filters change
  useEffect(() => { setPage(0); }, [debouncedSearch, type, status, reason]);

  // Distinct reason categories (small list, lightweight)
  const { data: reasonCategories = [] } = useQuery({
    queryKey: ["admin", "reports", "reasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reports")
        .select("reason_category")
        .not("reason_category", "is", null)
        .limit(1000);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r.reason_category && set.add(r.reason_category));
      return Array.from(set).sort();
    },
    staleTime: 60_000,
  });

  // Aggregate counts (HEAD requests, no rows transferred)
  const { data: counts } = useQuery({
    queryKey: ["admin", "reports", "counts"],
    queryFn: async () => {
      const [total, open, product, vendor] = await Promise.all([
        supabase.from("product_reports").select("id", { count: "exact", head: true }),
        supabase.from("product_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("product_reports").select("id", { count: "exact", head: true }).eq("report_type", "product"),
        supabase.from("product_reports").select("id", { count: "exact", head: true }).eq("report_type", "vendor"),
      ]);
      return {
        total: total.count ?? 0,
        open: open.count ?? 0,
        product: product.count ?? 0,
        vendor: vendor.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  // Paginated, filtered query
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "reports", "page", { search: debouncedSearch, type, status, reason, page }],
    queryFn: async () => {
      let q = supabase
        .from("product_reports")
        .select(
          "id, reason, reason_category, report_type, status, created_at, order_id, reporter_id, vendor_id, product:products(id, name, code)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      if (type !== "all") q = q.eq("report_type", type);
      if (status !== "all") q = q.eq("status", status);
      if (reason !== "all") q = q.eq("reason_category", reason);

      if (debouncedSearch) {
        if (UUID_RE.test(debouncedSearch)) {
          q = q.or(
            `product_id.eq.${debouncedSearch},vendor_id.eq.${debouncedSearch},order_id.eq.${debouncedSearch},reporter_id.eq.${debouncedSearch}`
          );
        } else {
          const esc = debouncedSearch.replace(/[%,()]/g, " ");
          q = q.or(`reason.ilike.%${esc}%,reason_category.ilike.%${esc}%`);
        }
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ReportRow[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function setReportStatus(id: string, next: "reviewed" | "dismissed") {
    const { error } = await supabase.from("product_reports").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Signalement mis à jour");
    qc.invalidateQueries({ queryKey: ["admin", "reports"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Signalements</h1>
        {counts && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Total {counts.total}</Badge>
            <Badge variant="destructive">Ouverts {counts.open}</Badge>
            <Badge variant="outline">Produits {counts.product}</Badge>
            <Badge variant="outline">Vendeurs {counts.vendor}</Badge>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher motif ou ID (produit/vendeur/commande)…"
              className="pl-8"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="product">Produit</SelectItem>
                <SelectItem value="vendor">Vendeur</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="open">Ouvert</SelectItem>
                <SelectItem value="reviewed">Traité</SelectItem>
                <SelectItem value="dismissed">Ignoré</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Motif" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les motifs</SelectItem>
                {reasonCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Résultats <span className="text-muted-foreground font-normal">({total}){isFetching && !isLoading ? " · …" : ""}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun signalement.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => {
                const isVendor = r.report_type === "vendor";
                return (
                  <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          {isVendor ? <Store className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                          {isVendor ? "Vendeur" : "Produit"}
                        </Badge>
                        {r.reason_category && (
                          <Badge variant="secondary" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />{r.reason_category}
                          </Badge>
                        )}
                        <Badge variant={r.status === "open" ? "destructive" : "secondary"}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <div className="text-sm font-semibold">
                        {isVendor ? "Vendeur signalé" : (r.product?.name ?? "Produit supprimé")}
                      </div>
                      {!isVendor && r.product && (
                        <div className="text-xs text-muted-foreground">Code {r.product.code}</div>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{r.reason}</p>
                      <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                        <span>Par {r.reporter_id.slice(0, 8)}</span>
                        {r.order_id && <span>· Commande {r.order_id.slice(0, 8)}</span>}
                        {isVendor && r.vendor_id && <span>· Vendeur {r.vendor_id.slice(0, 8)}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
                      {!isVendor && r.product && (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/admin/products/$productId/edit" params={{ productId: r.product.id }}>
                            Produit
                          </Link>
                        </Button>
                      )}
                      {isVendor && r.vendor_id && (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/admin/vendors">Vendeur</Link>
                        </Button>
                      )}
                      {r.status === "open" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setReportStatus(r.id, "dismissed")}>Ignorer</Button>
                          <Button size="sm" onClick={() => setReportStatus(r.id, "reviewed")}>Traité</Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t pt-3 mt-2">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" /> Préc.
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Suiv. <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
