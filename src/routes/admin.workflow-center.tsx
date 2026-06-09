import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Zap,
  Search,
  X,
  AlertTriangle,
  Clock,
  DollarSign,
  Package,
  Truck,
  CheckCircle2,
  Filter,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { useWorkflowOrders } from "@/hooks/use-workflow-orders";
import { WorkflowTable } from "@/components/workflow";
import { WorkflowDrawer } from "@/components/workflow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WorkflowRow, WorkflowFilterKey } from "@/types/workflow";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/workflow-center")({
  component: WorkflowCenter,
});

/* ═══════════════════════════════════════════════════════════════
   WORKFLOW CENTER — COCKPIT OPERATIONNEL KAWZONE
   ═══════════════════════════════════════════════════════════════ */

function WorkflowCenter() {
  const { rows, counts, applySearch, isLoading, error } = useWorkflowOrders();

  /* ── États ──────────────────────────────────────────── */
  const [activeFilter, setActiveFilter] = useState<WorkflowFilterKey>("actions");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRow, setSelectedRow] = useState<WorkflowRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["urgent", "payment", "to_weigh", "waiting_client", "to_ship", "to_confirm"])
  );

  /* ── Filtre combiné ─────────────────────────────────── */
  const filteredRows = useMemo(() => {
    let result = rows;

    /* 1. Masquer les terminées par défaut */
    if (!showArchived) {
      result = result.filter(
        (r) =>
          r.logistics_status !== "delivered" &&
          r.logistics_status !== "shipped"
      );
    }

    /* 2. Filtre rapide actif */
    switch (activeFilter) {
      case "actions":
        result = result.filter(
          (r) =>
            r.logistics_status === "awaiting_weighing" ||
            r.logistics_status === "rejected" ||
            r.logistics_status === "fees_calculated" ||
            (r.logistics_status === "validated" &&
              (r.amount_remaining ?? 0) > 0) ||
            (r.logistics_status === "ready_to_ship" &&
              !r.tracking_number) ||
            (r.order_type === "local" &&
              (r.logistics_status === "new" ||
                r.logistics_status === null))
        );
        break;
      case "urgent":
        result = result.filter(
          (r) =>
            r.logistics_status === "awaiting_weighing" &&
            r.days_pending > 7
        );
        break;
      case "payment":
        result = result.filter(
          (r) =>
            (r.payment_status === "pending" ||
              r.payment_status === "partial") &&
            (r.amount_remaining ?? 0) > 0
        );
        break;
      case "to_weigh":
        result = result.filter(
          (r) => r.logistics_status === "awaiting_weighing"
        );
        break;
      case "waiting_client":
        result = result.filter(
          (r) => r.logistics_status === "awaiting_client_validation"
        );
        break;
      case "to_ship":
        result = result.filter((r) =>
          ["validated", "ready_to_ship"].includes(r.logistics_status ?? "")
        );
        break;
      /* "all" = pas de filtre */
    }

    /* 3. Recherche textuelle */
    if (searchTerm.trim()) {
      result = applySearch(result, searchTerm);
    }

    return result;
  }, [rows, activeFilter, searchTerm, showArchived, applySearch]);

  /* ── Groupes par statut ─────────────────────────────── */
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; color: string; rows: WorkflowRow[] }[] = [
      { key: "urgent", label: "🔴 Urgences", color: "text-red-600 bg-red-50 border-red-200", rows: [] },
      { key: "payment", label: "💰 Paiements manquants", color: "text-amber-600 bg-amber-50 border-amber-200", rows: [] },
      { key: "to_weigh", label: "⚖️ À peser", color: "text-orange-600 bg-orange-50 border-orange-200", rows: [] },
      { key: "waiting_client", label: "👤 Attente client", color: "text-blue-600 bg-blue-50 border-blue-200", rows: [] },
      { key: "to_ship", label: "🚚 Prêtes à expédier", color: "text-emerald-600 bg-emerald-50 border-emerald-200", rows: [] },
      { key: "to_confirm", label: "✅ À confirmer", color: "text-purple-600 bg-purple-50 border-purple-200", rows: [] },
      { key: "in_progress", label: "⏳ En cours", color: "text-gray-600 bg-gray-50 border-gray-200", rows: [] },
    ];

    for (const row of filteredRows) {
      const ls = row.logistics_status;
      const rem = row.amount_remaining ?? 0;

      if (ls === "awaiting_weighing" && row.days_pending > 7) {
        groups[0].rows.push(row); /* urgent */
      } else if (rem > 0 && (row.payment_status === "pending" || row.payment_status === "partial")) {
        groups[1].rows.push(row); /* payment */
      } else if (ls === "awaiting_weighing") {
        groups[2].rows.push(row); /* to_weigh */
      } else if (ls === "awaiting_client_validation") {
        groups[3].rows.push(row); /* waiting_client */
      } else if (ls === "validated" || ls === "ready_to_ship") {
        groups[4].rows.push(row); /* to_ship */
      } else if (row.order_type === "local" && (ls === "new" || ls === null)) {
        groups[5].rows.push(row); /* to_confirm — local non confirmée */
      } else {
        groups[6].rows.push(row); /* in_progress — confirmed local, fees_calculated, etc. */
      }
    }

    return groups.filter((g) => g.rows.length > 0);
  }, [filteredRows]);

  /* ── KPI top-level ──────────────────────────────────── */
  const kpi = useMemo(() => {
    const urg = rows.filter(
      (r) => r.logistics_status === "awaiting_weighing" && r.days_pending > 7
    ).length;
    const pay = rows.filter(
      (r) =>
        (r.payment_status === "pending" || r.payment_status === "partial") &&
        (r.amount_remaining ?? 0) > 0
    ).length;
    const weigh = rows.filter(
      (r) => r.logistics_status === "awaiting_weighing"
    ).length;
    const ship = rows.filter((r) =>
      ["validated", "ready_to_ship"].includes(r.logistics_status ?? "")
    ).length;
    const confirm = rows.filter(
      (r) => r.order_type === "local" && (r.logistics_status === "new" || r.logistics_status === null)
    ).length;
    const totalDebt = rows.reduce((s, r) => s + (r.amount_remaining ?? 0), 0);
    return { urg, pay, weigh, ship, confirm, totalDebt };
  }, [rows]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* ── RENDU ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" richColors />

      {/* ═══ EN-TÊTE COCKPIT ═══ */}
      <div className="border-b bg-card sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              <h1 className="text-lg font-bold">Workflow Center</h1>
              <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                COCKPIT
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setShowArchived(!showArchived)}
              >
                {showArchived ? (
                  <EyeOff className="h-3 w-3 mr-1" />
                ) : (
                  <Eye className="h-3 w-3 mr-1" />
                )}
                {showArchived ? "Masquer terminées" : "Afficher terminées"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {rows.length} commandes ·{" "}
                {fmtF(kpi.totalDebt)} dette totale
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
        {/* ═══ KPI CARDS ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            label="Urgences"
            value={kpi.urg}
            color="border-red-200 bg-red-50"
            active={activeFilter === "urgent"}
            onClick={() => setActiveFilter("urgent")}
          />
          <KpiCard
            icon={<DollarSign className="h-4 w-4 text-amber-500" />}
            label="Paiements"
            value={kpi.pay}
            color="border-amber-200 bg-amber-50"
            active={activeFilter === "payment"}
            onClick={() => setActiveFilter("payment")}
          />
          <KpiCard
            icon={<Package className="h-4 w-4 text-orange-500" />}
            label="À peser"
            value={kpi.weigh}
            color="border-orange-200 bg-orange-50"
            active={activeFilter === "to_weigh"}
            onClick={() => setActiveFilter("to_weigh")}
          />
          <KpiCard
            icon={<Truck className="h-4 w-4 text-emerald-500" />}
            label="À expédier"
            value={kpi.ship}
            color="border-emerald-200 bg-emerald-50"
            active={activeFilter === "to_ship"}
            onClick={() => setActiveFilter("to_ship")}
          />
          <KpiCard
            icon={<CheckCircle2 className="h-4 w-4 text-purple-500" />}
            label="À confirmer"
            value={kpi.confirm}
            color="border-purple-200 bg-purple-50"
            active={activeFilter === "actions"}
            onClick={() => setActiveFilter("actions")}
          />
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50">
            <div className="shrink-0">
              <span className="text-xs text-muted-foreground">Dette</span>
              <div className="text-lg font-bold">{fmtF(kpi.totalDebt)}</div>
            </div>
          </div>
        </div>

        {/* ═══ BARRE FILTRES + RECHERCHE ═══ */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Recherche */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Rechercher nom, téléphone, ID, tracking, montant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9 h-9 text-sm"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Filtres rapides */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "actions" as WorkflowFilterKey, label: "Actions", icon: <Zap className="h-3 w-3" /> },
              { key: "all" as WorkflowFilterKey, label: "Toutes", icon: <CheckCircle2 className="h-3 w-3" /> },
              { key: "urgent" as WorkflowFilterKey, label: "Urgences", icon: <AlertTriangle className="h-3 w-3" /> },
              { key: "payment" as WorkflowFilterKey, label: "Paiements", icon: <DollarSign className="h-3 w-3" /> },
              { key: "to_weigh" as WorkflowFilterKey, label: "À peser", icon: <Package className="h-3 w-3" /> },
              { key: "waiting_client" as WorkflowFilterKey, label: "Attente client", icon: <Clock className="h-3 w-3" /> },
              { key: "to_ship" as WorkflowFilterKey, label: "À expédier", icon: <Truck className="h-3 w-3" /> },
            ].map((f) => (
              <Button
                key={f.key}
                variant={activeFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(f.key)}
                className={cn(
                  "h-8 text-xs rounded-full px-3 gap-1",
                  activeFilter === f.key && "bg-primary text-primary-foreground"
                )}
              >
                {f.icon}
                {f.label}
                {counts[f.key] > 0 && (
                  <span className="ml-1 text-[10px] font-bold bg-white/20 px-1.5 rounded-full">
                    {counts[f.key]}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* ═══ RÉSULTAT ═══ */}
        {searchTerm && (
          <div className="text-xs text-muted-foreground">
            {filteredRows.length} résultat{filteredRows.length > 1 ? "s" : ""} pour "{searchTerm}"
          </div>
        )}

        {/* ═══ LOADING / ERROR ═══ */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Chargement des commandes…
          </div>
        )}
        {error && (
          <div className="text-center py-12 text-red-600 text-sm">
            Erreur : {error instanceof Error ? error.message : "Inconnue"}
          </div>
        )}

        {/* ═══ TABLEAU GROUPÉ ═══ */}
        {!isLoading && !error && (
          <div className="space-y-4">
            {grouped.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                <p className="text-sm font-medium">Aucune action requise</p>
                <p className="text-xs mt-1">Toutes les commandes sont à jour.</p>
              </div>
            ) : (
              grouped.map((group) => (
                <div
                  key={group.key}
                  className={cn(
                    "rounded-lg border overflow-hidden",
                    group.color.split(" ")[2] /* border color */
                  )}
                >
                  {/* En-tête de groupe */}
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold",
                      group.color.split(" ")[1] /* bg color */
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={group.color.split(" ")[0]}>
                        {group.label}
                      </span>
                      <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full">
                        {group.rows.length}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        !expandedGroups.has(group.key) && "-rotate-90"
                      )}
                    />
                  </button>

                  {/* Rows du groupe */}
                  {expandedGroups.has(group.key) && (
                    <div className="bg-card">
                      <WorkflowTable
                        rows={group.rows}
                        onViewDetail={setSelectedRow}
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Drawer */}
      <WorkflowDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

/* ── KPI Card ──────────────────────────────────────────── */
function KpiCard({
  icon,
  label,
  value,
  color,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all",
        color,
        active && "ring-2 ring-primary ring-offset-1"
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-xl font-bold leading-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </button>
  );
}

/* ── Formatter ─────────────────────────────────────────── */
function fmtF(n: number): string {
  if (!n) return "0 FCFA";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}
