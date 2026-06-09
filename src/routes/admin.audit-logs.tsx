// @ts-nocheck
/**
 * admin.audit-logs.tsx — Journal d'audit administratif
 * Super admin uniquement. Historique complet des actions admin avec filtres.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { listAdminAuditLogs, getAuditLogActions, type AuditLogRow } from "@/lib/admin-audit.functions";
import { AdminTabs, AdminTabList, AdminTabTrigger, AdminTabContent } from "@/components/admin/AdminTabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, ShieldCheck, Clock, User, ArrowRightLeft, ChevronLeft, ChevronRight,
  FilterX, Eye, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/audit-logs")({
  component: AuditLogsPage,
});

const TARGET_LABELS: Record<string, string> = {
  product: "Produit",
  order: "Commande",
  vendor: "Vendeur",
  category: "Catégorie",
  report: "Signalement",
  settings: "Paramètres",
};

const ACTION_COLORS: Record<string, string> = {
  "product.approve": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "product.reject": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "product.delete": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "product.archive": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "vendor.activate": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "vendor.suspend": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "vendor.block": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "order.status_change": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const TABS = [
  { value: "all", label: "Toutes" },
  { value: "product", label: "Produits" },
  { value: "order", label: "Commandes" },
  { value: "vendor", label: "Vendeurs" },
  { value: "report", label: "Signalements" },
];

function AuditLogsPage() {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailLog, setDetailLog] = useState<AuditLogRow | null>(null);
  const pageSize = 25;

  const { data: logPage, isLoading } = useQuery({
    queryKey: ["admin-audit-logs", tab, search, page],
    queryFn: async () =>
      listAdminAuditLogs({
        data: {
          page,
          pageSize,
          action: "",
          targetType: tab === "all" ? "" : tab,
          q: search,
          dateFrom: null,
          dateTo: null,
        },
      }),
    enabled: isSuperAdmin,
  });

  const { data: allActions } = useQuery({
    queryKey: ["admin-audit-actions"],
    queryFn: async () => getAuditLogActions({ data: undefined }),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ShieldCheck className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Accès réservé aux super administrateurs.</p>
      </div>
    );
  }

  const logs = logPage?.rows ?? [];
  const total = logPage?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const resetFilters = () => {
    setTab("all");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Journal d&apos;audit
          </h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} action{total > 1 ? "s" : ""} enregistrée{total > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (email, action, ID…)"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          {(tab !== "all" || search) && (
            <Button variant="ghost" size="icon" onClick={resetFilters} title="Réinitialiser les filtres">
              <FilterX className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tabs par type de cible */}
      <AdminTabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
        <AdminTabList>
          {TABS.map((t) => (
            <AdminTabTrigger key={t.value} value={t.value}>
              {t.label}
            </AdminTabTrigger>
          ))}
        </AdminTabList>

        <AdminTabContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Chargement…</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 opacity-30" />
              Aucun log trouvé
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <AuditLogRowCard key={log.id} log={log} onView={() => setDetailLog(log)} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-xs text-muted-foreground">
                Page {page} / {totalPages} · {total} résultats
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </AdminTabContent>
      </AdminTabs>

      {/* Detail Dialog */}
      {detailLog && (
        <Dialog open onOpenChange={() => setDetailLog(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <span className={cn("px-2 py-0.5 rounded text-xs font-medium", ACTION_COLORS[detailLog.action] ?? "bg-muted")}>
                  {detailLog.action_label ?? detailLog.action}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Admin</p>
                  <p className="font-medium">{detailLog.actor_email ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Date</p>
                  <p className="font-medium">{new Date(detailLog.created_at).toLocaleString("fr-FR")}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Cible</p>
                  <p className="font-medium">{TARGET_LABELS[detailLog.target_type ?? ""] ?? detailLog.target_type ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">ID Cible</p>
                  <p className="font-medium text-xs font-mono break-all">{detailLog.target_id ?? "—"}</p>
                </div>
              </div>

              {(detailLog.old_values && Object.keys(detailLog.old_values).length > 0) && (
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-1">Anciennes valeurs</p>
                  <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
                    {JSON.stringify(detailLog.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {(detailLog.new_values && Object.keys(detailLog.new_values).length > 0) && (
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-1">Nouvelles valeurs</p>
                  <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
                    {JSON.stringify(detailLog.new_values, null, 2)}
                  </pre>
                </div>
              )}

              {(detailLog.details && Object.keys(detailLog.details).length > 0) && (
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-1">Détails</p>
                  <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
                    {JSON.stringify(detailLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function AuditLogRowCard({ log, onView }: { log: AuditLogRow; onView: () => void }) {
  const colorClass = ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground";

  return (
    <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={onView}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 h-2 w-2 rounded-full shrink-0", colorClass.split(" ")[0])} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colorClass)}>
                {log.action_label ?? log.action}
              </span>
              {log.target_type && (
                <Badge variant="outline" className="text-[10px] h-5">
                  {TARGET_LABELS[log.target_type] ?? log.target_type}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {log.actor_email ?? "Système"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(log.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
              </span>
              {log.target_id && (
                <span className="font-mono text-[10px] truncate max-w-[120px]">
                  {log.target_id}
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); onView(); }}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
