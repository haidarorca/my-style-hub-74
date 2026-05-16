import { createFileRoute, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
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
  vendor: { id: string; shop_name: string | null; full_name: string | null } | null;
  reporter: { id: string; full_name: string | null; email: string | null } | null;
};

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
  open: "Ouvert",
  reviewed: "Traité",
  dismissed: "Ignoré",
};

function ReportsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "product" | "vendor">("all");
  const [status, setStatus] = useState<"all" | "open" | "reviewed" | "dismissed">("open");
  const [reason, setReason] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["admin", "reports", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reports")
        .select(`
          id, reason, reason_category, report_type, status, created_at, order_id, reporter_id, vendor_id,
          product:products(id, name, code),
          vendor:profiles!product_reports_vendor_id_fkey(id, shop_name, full_name),
          reporter:profiles!product_reports_reporter_id_fkey(id, full_name, email)
        `)
        .order("created_at", { ascending: false });
      if (error) {
        // Fallback without explicit FK aliases if relation names differ
        const { data: d2, error: e2 } = await supabase
          .from("product_reports")
          .select("id, reason, reason_category, report_type, status, created_at, order_id, reporter_id, vendor_id, product:products(id, name, code)")
          .order("created_at", { ascending: false });
        if (e2) throw e2;
        return (d2 ?? []) as unknown as ReportRow[];
      }
      return (data ?? []) as unknown as ReportRow[];
    },
  });

  const reasonCategories = useMemo(() => {
    const set = new Set<string>();
    (reports ?? []).forEach((r) => r.reason_category && set.add(r.reason_category));
    return Array.from(set).sort();
  }, [reports]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (reports ?? []).filter((r) => {
      if (type !== "all" && r.report_type !== type) return false;
      if (status !== "all" && r.status !== status) return false;
      if (reason !== "all" && r.reason_category !== reason) return false;
      if (!q) return true;
      return (
        r.reason?.toLowerCase().includes(q) ||
        r.product?.name?.toLowerCase().includes(q) ||
        r.product?.code?.toLowerCase().includes(q) ||
        r.vendor?.shop_name?.toLowerCase().includes(q) ||
        r.vendor?.full_name?.toLowerCase().includes(q) ||
        r.reporter?.email?.toLowerCase().includes(q) ||
        r.reporter?.full_name?.toLowerCase().includes(q)
      );
    });
  }, [reports, search, type, status, reason]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  async function setReportStatus(id: string, next: "reviewed" | "dismissed") {
    const { error } = await supabase.from("product_reports").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Signalement mis à jour");
    qc.invalidateQueries({ queryKey: ["admin", "reports"] });
  }

  const counts = useMemo(() => {
    const r = reports ?? [];
    return {
      total: r.length,
      open: r.filter((x) => x.status === "open").length,
      product: r.filter((x) => x.report_type === "product").length,
      vendor: r.filter((x) => x.report_type === "vendor").length,
    };
  }, [reports]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Signalements</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Total {counts.total}</Badge>
          <Badge variant="destructive">Ouverts {counts.open}</Badge>
          <Badge variant="outline">Produits {counts.product}</Badge>
          <Badge variant="outline">Vendeurs {counts.vendor}</Badge>
        </div>
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
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Rechercher (produit, vendeur, reporter, motif)…"
              className="pl-8"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={type} onValueChange={(v) => { setType(v as typeof type); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="product">Produit</SelectItem>
                <SelectItem value="vendor">Vendeur</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="open">Ouvert</SelectItem>
                <SelectItem value="reviewed">Traité</SelectItem>
                <SelectItem value="dismissed">Ignoré</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reason} onValueChange={(v) => { setReason(v); setPage(0); }}>
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
            Résultats <span className="text-muted-foreground font-normal">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : pageItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun signalement.</p>
          ) : (
            <ul className="divide-y">
              {pageItems.map((r) => {
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
                        {isVendor
                          ? (r.vendor?.shop_name ?? r.vendor?.full_name ?? "Vendeur")
                          : (r.product?.name ?? "Produit supprimé")}
                      </div>
                      {!isVendor && r.product && (
                        <div className="text-xs text-muted-foreground">Code {r.product.code}</div>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{r.reason}</p>
                      <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                        {r.reporter && (
                          <span>Par {r.reporter.full_name ?? r.reporter.email ?? r.reporter_id.slice(0, 8)}</span>
                        )}
                        {r.order_id && <span>· Commande {r.order_id.slice(0, 8)}</span>}
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
                      {isVendor && r.vendor && (
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

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 border-t pt-3 mt-2">
              <span className="text-xs text-muted-foreground">
                Page {safePage + 1} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" /> Préc.
                </Button>
                <Button size="sm" variant="outline" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
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
