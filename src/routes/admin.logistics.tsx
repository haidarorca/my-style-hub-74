/**
 * admin.logistics.tsx — Centre de Contrôle Logistique ERP
 * 
 * Architecture: Stats → Filtres → Tableau dense → Dialog timeline
 * Mobile: Cards condensées avec quick actions
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  listLogisticsOrders, confirmShipmentPayment,
  type LogisticsOrderRow,
} from "@/lib/admin-logistics.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, Scale, DollarSign, Package, Truck, Plane,
  ChevronLeft, ChevronRight, Loader2, Eye, CheckCircle,
  AlertCircle, CreditCard, Box, TrendingUp, Phone,
  ArrowRight, Clock, Warehouse, UserCheck, Ship,
  Ban, Banknote, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/logistics")({
  component: LogisticsControlCenter,
});

/* ═══════════════════════════════════════════════════════════
   CONFIGURATION STATUTS
   ═══════════════════════════════════════════════════════════ */

const OSL = (label: string, color: string) => ({ label, color });
const ORDER_S: Record<string, ReturnType<typeof OSL>> = {
  new: OSL("Nouvelle", "bg-amber-100 text-amber-700 border-amber-300"),
  confirmed: OSL("Confirmée", "bg-emerald-100 text-emerald-700 border-emerald-300"),
  delivered: OSL("Livrée", "bg-blue-100 text-blue-700 border-blue-300"),
  cancelled: OSL("Annulée", "bg-red-100 text-red-700 border-red-300"),
  refunded: OSL("Remboursée", "bg-gray-100 text-gray-600 border-gray-300"),
};
const LOG_S: Record<string, ReturnType<typeof OSL>> = {
  pending_arrival: OSL("Attente arrivée", "bg-gray-100 text-gray-600 border-gray-300"),
  awaiting_weighing: OSL("A peser", "bg-orange-100 text-orange-700 border-orange-300"),
  fees_calculated: OSL("Frais calc.", "bg-sky-100 text-sky-700 border-sky-300"),
  awaiting_client_validation: OSL("Attente client", "bg-purple-100 text-purple-700 border-purple-300"),
  validated: OSL("Validee", "bg-emerald-100 text-emerald-700 border-emerald-300"),
  rejected: OSL("Rejetee", "bg-red-100 text-red-700 border-red-300"),
  ready_to_ship: OSL("Prete", "bg-cyan-100 text-cyan-700 border-cyan-300"),
  shipped: OSL("Expediee", "bg-violet-100 text-violet-700 border-violet-300"),
};
const PAY_S: Record<string, ReturnType<typeof OSL>> = {
  pending: OSL("A payer", "bg-amber-100 text-amber-700 border-amber-300"),
  partial: OSL("Partiel", "bg-orange-100 text-orange-700 border-orange-300"),
  paid: OSL("Paye", "bg-blue-100 text-blue-700 border-blue-300"),
  confirmed: OSL("Confirme", "bg-emerald-100 text-emerald-700 border-emerald-300"),
  waived: OSL("Gratuit", "bg-gray-100 text-gray-500 border-gray-300"),
};

/* ═══════════════════════════════════════════════════════════
   STATS CARDS
   ═══════════════════════════════════════════════════════════ */

const STAT_CARDS = [
  { id: "to_weigh", label: "A peser", status: "awaiting_weighing", icon: Scale, bg: "bg-orange-50", border: "border-orange-200", iconColor: "text-orange-600" },
  { id: "awaiting_pay", label: "Attente paiement", paymentStatus: "pending", icon: DollarSign, bg: "bg-amber-50", border: "border-amber-200", iconColor: "text-amber-600" },
  { id: "to_ship", label: "A expedier", status: "validated", icon: Truck, bg: "bg-cyan-50", border: "border-cyan-200", iconColor: "text-cyan-600" },
  { id: "shipped", label: "Expediees", status: "shipped", icon: Plane, bg: "bg-violet-50", border: "border-violet-200", iconColor: "text-violet-600" },
];

/* ═══════════════════════════════════════════════════════════
   TIMELINE WORKFLOW
   ═══════════════════════════════════════════════════════════ */

const WORKFLOW_STEPS = [
  { key: "order", label: "Commande", icon: Package, color: "bg-amber-500" },
  { key: "warehouse", label: "Entrepot", icon: Warehouse, color: "bg-gray-500" },
  { key: "weighing", label: "Pesee", icon: Scale, color: "bg-orange-500" },
  { key: "sent", label: "Envoye client", icon: ArrowRight, color: "bg-purple-500" },
  { key: "payment", label: "Paiement", icon: Banknote, color: "bg-emerald-500" },
  { key: "validation", label: "Valide", icon: UserCheck, color: "bg-cyan-500" },
  { key: "shipping", label: "Expedie", icon: Ship, color: "bg-violet-500" },
  { key: "delivered", label: "Livre", icon: CheckCircle, color: "bg-blue-500" },
];

function WorkflowTimeline({ row }: { row: LogisticsOrderRow }) {
  // Determine which steps are active based on row status
  const getStepState = (stepKey: string): "done" | "active" | "pending" => {
    const ls = row.logistics_status;
    const ps = row.payment_status;
    const os = row.order_status;
    switch (stepKey) {
      case "order": return "done";
      case "warehouse": return ls && ls !== "pending_arrival" ? "done" : os === "confirmed" ? "active" : "pending";
      case "weighing": return ls && ["fees_calculated", "awaiting_client_validation", "validated", "ready_to_ship", "shipped"].includes(ls) ? "done" : ls === "awaiting_weighing" ? "active" : "pending";
      case "sent": return ls && ["awaiting_client_validation", "validated", "ready_to_ship", "shipped"].includes(ls) ? "done" : ls === "fees_calculated" ? "active" : "pending";
      case "payment": return ps === "confirmed" ? "done" : ps === "paid" ? "active" : ps === "partial" ? "active" : "pending";
      case "validation": return ls && ["validated", "ready_to_ship", "shipped"].includes(ls) ? "done" : ls === "awaiting_client_validation" ? "active" : "pending";
      case "shipping": return ls === "shipped" ? "done" : ls === "ready_to_ship" ? "active" : "pending";
      case "delivered": return os === "delivered" ? "done" : ls === "shipped" ? "active" : "pending";
      default: return "pending";
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        {WORKFLOW_STEPS.map((step, i) => {
          const state = getStepState(step.key);
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex flex-col items-center gap-1 relative z-10">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all",
                state === "done" ? `${step.color} text-white border-transparent` :
                state === "active" ? `bg-white ${step.color.replace("bg-", "border-")} ${step.color.replace("bg-", "text-")}` :
                "bg-gray-100 border-gray-300 text-gray-400"
              )}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className={cn("text-[9px] font-medium text-center w-14 leading-tight",
                state === "done" ? "text-gray-900" : state === "active" ? "text-gray-700" : "text-gray-400"
              )}>{step.label}</span>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div className={cn("absolute top-4 left-1/2 w-full h-0.5 -z-10",
                  state === "done" ? "bg-emerald-400" : "bg-gray-200"
                )} style={{ width: "calc(100% + 8px)", left: "50%" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT PRINCIPAL
   ═══════════════════════════════════════════════════════════ */

function LogisticsControlCenter() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<LogisticsOrderRow | null>(null);
  const pageSize = 25;

  // Build filters from active stat card
  const extraFilters = (() => {
    const c = STAT_CARDS.find((s) => s.id === activeCard);
    if (!c) return {};
    return {
      ...(c.status ? { logisticsStatus: c.status } : {}),
      ...(c.paymentStatus ? { paymentStatus: c.paymentStatus } : {}),
    };
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-logistics", page, search, activeCard],
    queryFn: async () =>
      listLogisticsOrders({
        data: { page, pageSize, q: search, orderStatus: "", ...extraFilters, dateFrom: null, dateTo: null },
      }),
    enabled: isAdmin,
  });

  const confirmPay = useMutation({
    mutationFn: async ({ paymentId, amount }: { paymentId: string; amount: number }) => {
      await confirmShipmentPayment({ data: { paymentId, amountConfirmed: amount } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-logistics"] }); toast({ title: "Paiement confirme" }); setDetailRow(null); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Truck className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">Acces reserve aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Centre de Controle Logistique
          </h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} commande{total > 1 ? "s" : ""} · ERP Logistique
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Client, telephone, N° commande, tracking…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STAT_CARDS.map((s) => {
          const Icon = s.icon;
          const active = activeCard === s.id;
          return (
            <button key={s.id} onClick={() => { setActiveCard(active ? null : s.id); setPage(1); }}
              className={cn("rounded-xl border p-3 text-left transition-all hover:shadow-md",
                s.bg, s.border, active && "ring-2 ring-primary ring-offset-1")}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn("h-4 w-4", s.iconColor)} />
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold">
                {isLoading ? <span className="inline-block h-6 w-12 animate-pulse rounded bg-muted" /> :
                  rows.filter((r) => {
                    if (s.status && r.logistics_status !== s.status) return false;
                    if (s.paymentStatus && r.payment_status !== s.paymentStatus) return false;
                    return true;
                  }).length || "—"}
              </p>
            </button>
          );
        })}
      </div>

      {/* RESTE A PAYER GLOBAL */}
      <div className="flex items-center gap-2 rounded-lg border bg-red-50 border-red-200 px-3 py-2">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <span className="text-sm text-red-700">
          Reste a payer global : <strong>{rows.reduce((s, r) => s + (r.amount_remaining ?? 0), 0).toLocaleString("fr-FR")} FCFA</strong>
          {" "}sur {rows.filter((r) => (r.amount_remaining ?? 0) > 0).length} commande(s)
        </span>
      </div>

      {/* DESKTOP: TABLEAU DENSE */}
      <div className="hidden md:block rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/60">
                {["Commande","Client","Statut","Logistique","Paiement","Produits","Total","Frais","Paye","Reste","Tracking",""].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={12} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="py-8 text-center text-muted-foreground"><Box className="h-8 w-8 mx-auto mb-2 opacity-30" />Aucune commande</td></tr>
              ) : rows.map((r) => (
                <tr key={r.order_id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-1.5"><span className="font-mono">#{r.order_id.slice(0, 8)}</span><p className="text-[9px] text-muted-foreground">{fmtD(r.order_created_at)}</p></td>
                  <td className="px-2 py-1.5"><p className="font-medium">{r.customer_name ?? "—"}</p><p className="text-[9px] text-muted-foreground">{r.customer_phone ?? "—"}</p></td>
                  <td className="px-2 py-1.5">{r.order_status && <SB config={ORDER_S[r.order_status]} />}</td>
                  <td className="px-2 py-1.5">{r.logistics_status && <SB config={LOG_S[r.logistics_status]} />}</td>
                  <td className="px-2 py-1.5">{r.payment_status && <SB config={PAY_S[r.payment_status]} />}</td>
                  <td className="px-2 py-1.5 text-right">{r.item_count}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{fmtN(r.order_total)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtN(r.total_shipping_fees)}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-600">{fmtN(r.amount_paid)}</td>
                  <td className="px-2 py-1.5 text-right"><span className={cn("font-medium", (r.amount_remaining ?? 0) > 0 ? "text-red-600" : "text-emerald-600")}>{fmtN(r.amount_remaining)}</span></td>
                  <td className="px-2 py-1.5">{r.tracking_number ? <span className="font-mono text-[9px]">{r.tracking_number}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setDetailRow(r)}><Eye className="h-3 w-3" /></Button>
                      {r.customer_phone && (
                        <a href={`https://wa.me/${r.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-emerald-50 text-emerald-600"><Phone className="h-3 w-3" /></a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">Page {page}/{totalPages} · {total} resultats</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-3 w-3" /></Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="h-3 w-3" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE: CARDS CONDENSEES */}
      <div className="md:hidden space-y-3">
        {rows.map((r) => (
          <MobileLogisticsCard key={r.order_id} row={r} onView={() => setDetailRow(r)} />
        ))}
      </div>

      {/* DIALOG DETAIL + TIMELINE */}
      {detailRow && (
        <Dialog open onOpenChange={() => setDetailRow(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto gap-0 p-0">
            <DialogHeader className="p-4 pb-3 border-b">
              <DialogTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Commande #{detailRow.order_id.slice(0, 8)}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">{detailRow.customer_name} · {detailRow.customer_phone}</p>
            </DialogHeader>

            <div className="p-4 space-y-5">
              {/* Timeline */}
              <section>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-3">Workflow</p>
                <WorkflowTimeline row={detailRow} />
              </section>

              {/* Statuts */}
              <div className="flex flex-wrap gap-2">
                {detailRow.order_status && <SB config={ORDER_S[detailRow.order_status]} />}
                {detailRow.logistics_status && <SB config={LOG_S[detailRow.logistics_status]} />}
                {detailRow.payment_status && <SB config={PAY_S[detailRow.payment_status]} />}
              </div>

              {/* Financier */}
              <section className="rounded-xl border bg-muted/30 p-3 space-y-2">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Financier</p>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Produits</span><span>{fmtN(detailRow.order_total)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Frais transport</span><span>{fmtN(detailRow.total_shipping_fees)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paye</span><span className="text-emerald-600">{fmtN(detailRow.amount_paid)}</span></div>
                <div className="border-t pt-1 flex justify-between font-bold text-sm"><span>Reste a payer</span><span className={(detailRow.amount_remaining ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}>{fmtN(detailRow.amount_remaining)}</span></div>
              </section>

              {/* Poids */}
              {detailRow.real_weight_kg && (
                <section className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Scale className="h-3.5 w-3.5" />
                  Poids reel: {detailRow.real_weight_kg} kg
                  {detailRow.volumetric_weight_kg && ` · Volumetrique: ${detailRow.volumetric_weight_kg} kg`}
                </section>
              )}

              {/* Tracking */}
              {detailRow.tracking_number && (
                <section className="flex items-center gap-2 text-xs">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{detailRow.tracking_number}</span>
                  {detailRow.carrier_name && <span className="text-muted-foreground">({detailRow.carrier_name})</span>}
                </section>
              )}

              {/* Dates */}
              <section className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {detailRow.warehouse_received_at && <div>Reception: {fmtD(detailRow.warehouse_received_at)}</div>}
                {detailRow.weighed_at && <div>Pesee: {fmtD(detailRow.weighed_at)}</div>}
                {detailRow.shipped_at && <div>Expedition: {fmtD(detailRow.shipped_at)}</div>}
                {detailRow.estimated_arrival_at && <div>Arrivee est.: {fmtD(detailRow.estimated_arrival_at)}</div>}
              </section>

              {/* Actions */}
              <section className="flex flex-wrap gap-2 pt-2 border-t">
                {(detailRow.payment_status === "pending" || detailRow.payment_status === "partial") && (detailRow.amount_remaining ?? 0) > 0 && (
                  <Button size="sm" onClick={() => confirmPay.mutate({ paymentId: detailRow.order_id, amount: detailRow.amount_remaining ?? 0 })} disabled={confirmPay.isPending}>
                    <Receipt className="h-4 w-4 mr-1" /> Confirmer paiement
                  </Button>
                )}
                {detailRow.customer_phone && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`https://wa.me/${detailRow.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                      <Phone className="h-4 w-4 mr-1" /> WhatsApp client
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDetailRow(null)}><Ban className="h-4 w-4 mr-1" /> Fermer</Button>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MOBILE CARD
   ═══════════════════════════════════════════════════════════ */

function MobileLogisticsCard({ row, onView }: { row: LogisticsOrderRow; onView: () => void }) {
  const hasRemaining = (row.amount_remaining ?? 0) > 0;
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs">#{row.order_id.slice(0, 8)}</span>
          <p className="text-xs font-medium">{row.customer_name ?? "—"}</p>
        </div>
        <div className="flex gap-1">
          {row.order_status && <SB config={ORDER_S[row.order_status]} />}
          {row.logistics_status && <SB config={LOG_S[row.logistics_status]} />}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Produits: {row.item_count}</span>
        <span className="font-medium">{fmtN(row.order_total)}</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Frais transport</span>
        <span>{fmtN(row.total_shipping_fees)}</span>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Reste a payer</span>
        <span className={cn("font-bold", hasRemaining ? "text-red-600" : "text-emerald-600")}>{fmtN(row.amount_remaining)}</span>
      </div>

      {row.tracking_number && (
        <div className="flex items-center gap-1 text-xs">
          <Truck className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[10px]">{row.tracking_number}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={onView}>
          <Eye className="h-3 w-3 mr-1" /> Details
        </Button>
        {row.customer_phone && (
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1" asChild>
            <a href={`https://wa.me/${row.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
              <Phone className="h-3 w-3 mr-1" /> WhatsApp
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function SB({ config }: { config: { label: string; color: string } }) {
  return <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium border", config.color)}>{config.label}</span>;
}

function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

function fmtD(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
