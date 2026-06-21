// @ts-nocheck
/**
 * admin.index.tsx — ACTION CENTER
 * 
 * Le cerveau opérationnel de Kawzone Admin. Orienté ACTIONS, pas données.
 * L'opérateur ouvre cette page et sait immédiatement quoi faire.
 * 
 * Architecture: 5 sections priorisées
 * 1. Alertes critiques (si applicable)
 * 2. Priorités + Métriques clés (2 colonnes)
 * 3. Pipeline logistique
 * 4. Commandes récentes (OrderCards)
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  SmartCard,
  AlertBanner,
  OrderCard,
  DrawerPanel,
  MiniTimeline,
  getWorkflow,
} from "@/components/admin/premium";
import type { OrderCardData } from "@/components/admin/premium";
import {
  Zap, Truck, Scale, DollarSign, Package,
  Users, ShoppingBag, Percent, Clock,
  ArrowRight, Receipt, Phone, Ban, CheckCircle,
  Box, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useFormatDisplay } from "@/hooks/use-currencies";
import { getAdminStats } from "@/lib/admin-stats.functions";
import { getLogisticsStats } from "@/lib/admin-logistics.functions";
import { listLogisticsOrders } from "@/lib/admin-logistics.functions";
import { confirmShipmentPayment } from "@/lib/admin-logistics.functions";
import { getOrCreateShipmentAssessment } from "@/lib/shipment-assessments.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  component: ActionCenter,
});

/* ═══════════════════════════════════════════════════════════
   ACTION CENTER — Composant principal
   ═══════════════════════════════════════════════════════════ */

function ActionCenter() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();

  const [selectedOrder, setSelectedOrder] = useState<OrderCardData | null>(null);

  const fetchStats = useServerFn(getAdminStats);
  const fetchLogisticsStats = useServerFn(getLogisticsStats);
  const fetchRecentOrders = useServerFn(listLogisticsOrders);
  const confirmPay = useServerFn(confirmShipmentPayment);
  const createAssessmentFn = useServerFn(getOrCreateShipmentAssessment);

  /* ── Queries ── */
  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });

  const logisticsStats = useQuery({
    queryKey: ["admin", "logistics-stats"],
    queryFn: () => fetchLogisticsStats({ data: {} }),
    staleTime: 60_000,
  });

  const recentOrders = useQuery({
    queryKey: ["admin", "recent-orders"],
    queryFn: () =>
      fetchRecentOrders({
        data: {
          page: 1, pageSize: 6, q: "",
          orderStatus: "", logisticsStatus: "", paymentStatus: "",
          orderType: "", hasRemaining: null, dateFrom: null, dateTo: null,
        },
      }),
    staleTime: 30_000,
  });

  /* ── Mutations ── */
  const paymentMutation = useMutation({
    mutationFn: ({ assessmentId, amount }: { assessmentId: string; amount: number }) =>
      confirmPay({ data: { assessmentId, amountConfirmed: amount } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] });
      toast.success("Paiement confirmé");
      setSelectedOrder(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assessmentMutation = useMutation({
    mutationFn: (orderId: string) => createAssessmentFn({ data: { order_id: orderId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics-stats"] });
      toast.success("Évaluation créée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Zap className="h-12 w-12 mb-4 opacity-20" />
        <p className="text-sm">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  const gs = stats.data;
  const ls = logisticsStats.data;
  const rows = (recentOrders.data?.rows ?? []) as Array<Record<string, unknown>>;

  /* ── Alertes prioritaires ── */
  const alerts = buildAlerts(ls);

  return (
    <div className="space-y-6 pb-safe">
      {/* ═════ HEADER PERSONNALISÉ ═════ */}
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Zap className="h-7 w-7 text-primary" />
          Action Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bonjour, {user?.email?.split("@")[0] ?? "Admin"} · Voici vos priorités aujourd&apos;hui
        </p>
      </header>

      {/* ═════ ALERTES CRITIQUES ═════ */}
      {alerts.length > 0 && (
        <section className="space-y-2">
          {alerts.map((alert) => (
            <AlertBanner
              key={alert.id}
              severity={alert.severity}
              title={alert.title}
              description={alert.description}
              action={alert.action}
              onDismiss={() => {}}
            />
          ))}
        </section>
      )}

      {/* ═════ PRIORITÉS + MÉTRIQUES ═════ */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Colonne gauche : Priorités (3/5) */}
        <div className="lg:col-span-3 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Vos priorités
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Urgences */}
            {(ls?.urgent ?? 0) > 0 && (
              <SmartCard
                title="Urgences"
                value={ls?.urgent}
                icon={AlertTriangle}
                iconColor="text-destructive"
                iconBg="bg-destructive/10"
                trend={{ value: "> 14 jours", positive: false }}
                actions={[{ label: "Traiter maintenant", onClick: () => { }, variant: "primary" }]}
                delay={0}
              />
            )}

            {/* À peser */}
            <SmartCard
              title="À peser"
              value={ls?.to_weigh}
              icon={Scale}
              iconColor="text-orange-400"
              iconBg="bg-orange-500/10"
              actions={[{ label: "Voir", onClick: () => { }, variant: "secondary" }]}
              delay={50}
            />

            {/* Paiements */}
            <SmartCard
              title="Paiements en attente"
              value={ls?.awaiting_payment}
              icon={DollarSign}
              iconColor="text-warning"
              iconBg="bg-warning/10"
              actions={[{ label: "Relancer", onClick: () => { }, variant: "secondary" }]}
              delay={100}
            />

            {/* À expédier */}
            <SmartCard
              title="À expédier"
              value={ls?.to_ship}
              icon={Truck}
              iconColor="text-sky-400"
              iconBg="bg-sky-500/10"
              actions={[{ label: "Voir", onClick: () => { }, variant: "secondary" }]}
              delay={150}
            />
          </div>
        </div>

        {/* Colonne droite : Métriques (2/5) */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" />
            Métriques clés
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <MiniKPI label="Commandes" value={gs?.orders?.total} icon={ShoppingBag} color="text-primary" />
            <MiniKPI label="Vendeurs" value={gs?.vendors?.active} icon={Users} color="text-emerald-400" />
            <MiniKPI label="Revenu 30j" value={gs ? `${(gs.orders.revenue_30d / 1000).toFixed(0)}k` : undefined} icon={DollarSign} color="text-warning" />
            <MiniKPI label="Expédiées" value={ls?.shipped} icon={Package} color="text-violet-400" />
          </div>

          {/* Reste à payer */}
          {ls && ls.total_remaining > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-destructive shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Reste à payer global</p>
                <p className="text-lg font-semibold font-bold text-destructive">{ls.total_remaining.toLocaleString("fr-FR")} FCFA</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═════ PIPELINE LOGISTIQUE ═════ */}
      {ls && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3">
            <Truck className="h-3.5 w-3.5" />
            Pipeline logistique
          </h2>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-end gap-3 h-20">
              {[
                { label: "À peser", count: ls.to_weigh, color: "bg-orange-500" },
                { label: "Paiement", count: ls.awaiting_payment, color: "bg-warning" },
                { label: "Partiel", count: ls.partial_payment ?? 0, color: "bg-sky-500" },
                { label: "À expédier", count: ls.to_ship, color: "bg-cyan-500" },
                { label: "Expédiées", count: ls.shipped, color: "bg-violet-500" },
              ].map((bar) => {
                const maxCount = Math.max(ls.to_weigh + ls.awaiting_payment + ls.partial_payment + ls.to_ship + ls.shipped, 1);
                const height = Math.max((bar.count / maxCount) * 100, 8);
                return (
                  <div key={bar.label} className="flex flex-col items-center gap-1.5 flex-1 group cursor-pointer">
                    <span className="text-sm font-bold">{bar.count}</span>
                    <div
                      className={cn("w-full rounded-t-md transition-all duration-500 group-hover:opacity-80", bar.color)}
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[9px] text-muted-foreground text-center leading-tight">{bar.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═════ COMMANDES RÉCENTES ═════ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" />
            Commandes récentes
          </h2>
          <Button asChild variant="ghost" size="sm" className="text-xs h-7">
            <Link to="/admin/orders">Tout voir <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Box className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm">Aucune commande récente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((row: any, i) => (
              <OrderCard
                key={row.order_id ?? row.id}
                order={mapToOrderCard(row)}
                onView={() => setSelectedOrder(mapToOrderCard(row))}
                onCreateAssessment={() => assessmentMutation.mutate(row.order_id ?? row.id)}
                delay={i * 50}
              />
            ))}
          </div>
        )}
      </section>

      {/* ═════ DRAWER DÉTAIL ═════ */}
      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onConfirmPayment={(assessmentId, amount) =>
            paymentMutation.mutate({ assessmentId, amount })
          }
          onCreateAssessment={() =>
            assessmentMutation.mutate(selectedOrder.orderId)
          }
          isCreatingAssessment={assessmentMutation.isPending}
          isConfirmingPayment={paymentMutation.isPending}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MINI KPI — Petit composant métrique
   ═══════════════════════════════════════════════════════════ */

function MiniKPI({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value?: number | string;
  icon: typeof ShoppingBag;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        <p className="text-base font-bold leading-tight">{value ?? "—"}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ORDER DETAIL DRAWER — Contenu du drawer
   ═══════════════════════════════════════════════════════════ */

function OrderDetailDrawer({
  order,
  onClose,
  onConfirmPayment,
  onCreateAssessment,
  isCreatingAssessment,
  isConfirmingPayment,
}: {
  order: OrderCardData;
  onClose: () => void;
  onConfirmPayment: (assessmentId: string, amount: number) => void;
  onCreateAssessment: () => void;
  isCreatingAssessment: boolean;
  isConfirmingPayment: boolean;
}) {
  const workflow = getWorkflow(order.orderType);
  // Mappe le logistics_status vers un index de workflow
  const statusIndex = getWorkflowStepIndex(order.orderType, order.logisticsStatus ?? order.status);

  const daysPending = order.daysPending ?? 0;
  const isUrgent = daysPending > 14;

  return (
    <DrawerPanel
      isOpen={true}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">#{order.orderId.slice(0, 8)}</span>
          <span className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold",
            order.orderType === "import" ? "bg-sky-500/10 border-sky-500/20 text-sky-400" :
              order.orderType === "mixed" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
          )}>
            {order.orderType.toUpperCase()}
          </span>
        </span>
      }
      subtitle={
        <span>
          {order.customerName} {order.customerPhone && `· ${order.customerPhone}`}
        </span>
      }
    >
      <div className="space-y-5">
        {/* Urgence */}
        {isUrgent && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
            <Zap className="h-3.5 w-3.5" />
            {daysPending} jours d&apos;attente — Action requise
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Workflow {order.orderType === "import" ? "(Complet)" : order.orderType === "mixed" ? "(Hybride)" : "(Simple)"}
          </p>
          <MiniTimeline steps={workflow} currentStep={statusIndex} />
        </div>

        {/* Financier */}
        <div className="rounded-xl border border-border bg-secondary/50 p-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Financier</p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Produits</span>
            <span className="font-medium">{fmtN(order.total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Frais transport</span>
            <span>{fmtN(order.shippingFees)}</span>
          </div>
          <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
            <span>Reste à payer</span>
            <span className={(order.remaining ?? 0) > 0 ? "text-destructive" : "text-success"}>
              {fmtN(order.remaining)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!order.assessmentId && order.orderType !== "local" && (
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onCreateAssessment}
              disabled={isCreatingAssessment}
            >
              <Scale className="h-4 w-4 mr-1.5" /> Créer évaluation
            </Button>
          )}

          {order.assessmentId && (order.remaining ?? 0) > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onConfirmPayment(order.assessmentId!, order.remaining ?? 0)}
              disabled={isConfirmingPayment}
            >
              <Receipt className="h-4 w-4 mr-1.5" /> Confirmer paiement
            </Button>
          )}

          {order.customerPhone && (
            <Button size="sm" variant="outline" asChild>
              <a href={`https://wa.me/${order.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                <Phone className="h-4 w-4 mr-1.5" /> WhatsApp
              </a>
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={onClose}>
            <Ban className="h-4 w-4 mr-1.5" /> Fermer
          </Button>
        </div>
      </div>
    </DrawerPanel>
  );
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function buildAlerts(ls: { urgent: number; blocked: number; awaiting_payment: number } | undefined) {
  const alerts: Array<{
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    action?: { label: string; onClick: () => void };
  }> = [];

  if (ls) {
    if (ls.urgent > 0) {
      alerts.push({
        id: "urgent",
        severity: "critical",
        title: `${ls.urgent} commande${ls.urgent > 1 ? "s" : ""} urgente${ls.urgent > 1 ? "s" : ""}`,
        description: `Bloquée${ls.urgent > 1 ? "s" : ""} depuis plus de 14 jours — action immédiate requise`,
        action: { label: "Traiter", onClick: () => { } },
      });
    }
    if (ls.awaiting_payment > 0) {
      alerts.push({
        id: "payment",
        severity: "warning",
        title: `${ls.awaiting_payment} paiement${ls.awaiting_payment > 1 ? "s" : ""} en attente`,
        description: `Client${ls.awaiting_payment > 1 ? "s" : ""} en attente de confirmation`,
        action: { label: "Relancer", onClick: () => { } },
      });
    }
  }

  return alerts;
}

function mapToOrderCard(row: Record<string, unknown>): OrderCardData {
  const orderType = String(row.order_type ?? "local");
  return {
    id: String(row.order_id ?? row.id ?? ""),
    orderId: String(row.order_id ?? row.id ?? ""),
    customerName: String(row.customer_name ?? "—"),
    customerPhone: (row.customer_phone as string) ?? null,
    status: String(row.order_status ?? row.status ?? "new"),
    orderType: orderType === "import" || orderType === "mixed" || orderType === "local" ? orderType as "local" | "import" | "mixed" : "local",
    total: Number(row.order_total ?? row.total ?? 0),
    remaining: Number(row.amount_remaining ?? 0) || undefined,
    shippingFees: Number(row.total_shipping_fees ?? 0) || undefined,
    logisticsStatus: (row.logistics_status as string) ?? null,
    paymentStatus: (row.payment_status as string) ?? null,
    daysPending: Number(row.days_pending ?? 0) || undefined,
    isCommission: Boolean(row.is_commission ?? false),
    createdAt: String(row.order_created_at ?? row.created_at ?? ""),
    assessmentId: (row.assessment_id as string) ?? null,
  };
}

function getWorkflowStepIndex(orderType: string, status: string): number {
  if (orderType === "local") {
    const map: Record<string, number> = { new: 0, confirmed: 1, delivered: 2 };
    return map[status] ?? 0;
  }
  if (orderType === "mixed") {
    const map: Record<string, number> = { new: 0, confirmed: 1, evaluation: 2, shipped: 3, delivered: 4 };
    return map[status] ?? 0;
  }
  // import
  const map: Record<string, number> = {
    pending_arrival: 0, new: 0,
    awaiting_weighing: 1, warehouse: 1,
    fees_calculated: 2, weighing: 2,
    awaiting_client_validation: 3, sent: 3,
    payment_pending: 4, payment: 4,
    validated: 5,
    ready_to_ship: 6, shipped: 6,
    delivered: 7,
  };
  return map[status] ?? 0;
}

function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}
