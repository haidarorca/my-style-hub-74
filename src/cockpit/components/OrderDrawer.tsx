// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   OrderDrawer — Fiche commande avec finances, paiements, timeline
   ═══════════════════════════════════════════════════════════════ */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, MapPin, CreditCard, MessageCircle, Package, Truck, CheckCircle, Ban, User, History, TrendingUp, Calendar } from "lucide-react";
import { fmtF, waLink, STATUS_LABELS, STATUS_COLORS, mapStatus } from "@/cockpit/lib/workflow";
import { PaymentForm } from "./PaymentForm";
import { WeightForm } from "./WeightForm";
import { PaymentHistory } from "./PaymentHistory";
import { Timeline } from "./Timeline";
import { useAuth } from "@/hooks/use-auth";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { PaymentRecord, AuditEntry } from "@/cockpit/hooks/useRealOrders";

interface Props {
  order: LogisticsOrderRow | null;
  orderIndex: number;
  payments: PaymentRecord[];
  audit: AuditEntry[];
  onClose: () => void;
  onPayment: (orderId: string, amount: number, method: string, reference: string, adminName: string) => void;
  onWeightRecorded: (orderId: string, freight: number) => void;
  onStatusChange: (orderId: string, status: string, adminName: string) => void;
}

export function OrderDrawer({ order, orderIndex, payments, audit, onClose, onPayment, onWeightRecorded, onStatusChange }: Props) {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";

  if (!order) return null;

  const status = mapStatus(order);
  const isLocal = !order.shipping_service_id && order.order_type !== "import";

  /* ── Calculs financiers depuis les paiements locaux ── */
  const orderTotal = order.order_total ?? 0;
  const shippingFees = order.total_shipping_fees ?? 0;
  const grandTotal = orderTotal + shippingFees;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, grandTotal - totalPaid);
  const isPaid = remaining <= 0 && grandTotal > 0;

  const waMessage = `Bonjour ${order.customer_name ?? ""}, concernant votre commande #${orderIndex + 1}`;
  const shortUuid = order.order_id?.slice(0, 12) ?? "";

  /* ── Stats paiements ── */
  const sortedPayments = [...payments].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const firstPayment = sortedPayments[0];
  const lastPayment = sortedPayments[sortedPayments.length - 1];

  return (
    <Sheet open={!!order} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        <div className="p-4 space-y-4">

          {/* ═══ HEADER ═══ */}
          <SheetHeader className="pb-2">
            <div className="space-y-1">
              <SheetTitle className="text-xl">Commande #{orderIndex + 1}</SheetTitle>
              <div className="font-mono text-[11px] text-gray-400">ORD-{shortUuid}</div>
              <div className="flex gap-2 pt-1">
                <Badge variant="outline" className={`text-[10px] ${isLocal ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
                  {isLocal ? "LOCAL" : "IMPORT"}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[status]}`}>
                  {STATUS_LABELS[status]}
                </Badge>
              </div>
            </div>
          </SheetHeader>

          {/* ═══ CLIENT ═══ */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><User className="h-4 w-4" /> Client</h3>
            <div className="text-sm font-medium">{order.customer_name ?? "—"}</div>
            {order.customer_phone && (
              <div className="flex items-center gap-1.5 text-sm flex-wrap">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <a href={`tel:${order.customer_phone}`} className="text-blue-600 hover:underline">{order.customer_phone}</a>
                <a href={waLink(order.customer_phone, waMessage)} target="_blank" rel="noopener noreferrer" className="ml-2 text-emerald-600 text-xs flex items-center gap-0.5 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </a>
              </div>
            )}
            {order.destination_address && (
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <MapPin className="h-3.5 w-3.5" /> {order.destination_address}
              </div>
            )}
          </div>

          {/* ═══ FINANCES ═══ */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><CreditCard className="h-4 w-4" /> Finances</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded p-2 text-center">
                <div className="text-[10px] text-gray-500">Produits</div>
                <div className="text-sm font-bold">{fmtF(orderTotal)}</div>
              </div>
              <div className="bg-white rounded p-2 text-center">
                <div className="text-[10px] text-gray-500">Fret</div>
                <div className="text-sm font-bold">{fmtF(shippingFees)}</div>
              </div>
              <div className="bg-white rounded p-2 text-center border-2 border-gray-200">
                <div className="text-[10px] text-gray-500 font-semibold">TOTAL</div>
                <div className="text-sm font-bold">{fmtF(grandTotal)}</div>
              </div>
              <div className="bg-emerald-50 rounded p-2 text-center">
                <div className="text-[10px] text-emerald-600">Paye</div>
                <div className="text-sm font-bold text-emerald-700">{fmtF(totalPaid)}</div>
              </div>
            </div>
            {!isPaid ? (
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-red-600">Reste a payer</div>
                <div className="text-xl font-bold text-red-700">{fmtF(remaining)}</div>
              </div>
            ) : grandTotal > 0 ? (
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <div className="text-sm font-bold text-emerald-700">✓ Paye en totalite</div>
                <div className="text-xs text-emerald-600">{fmtF(totalPaid)} / {fmtF(grandTotal)}</div>
              </div>
            ) : null}
          </div>

          {/* ═══ STATS PAIEMENTS ═══ */}
          {payments.length > 0 && (
            <div className="bg-white border rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-emerald-600" /> Recapitulatif paiements</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-[10px] text-gray-500">Nombre</div>
                  <div className="text-lg font-bold">{payments.length}</div>
                </div>
                <div className="bg-emerald-50 rounded p-2">
                  <div className="text-[10px] text-emerald-600">Total paye</div>
                  <div className="text-lg font-bold text-emerald-700">{fmtF(totalPaid)}</div>
                </div>
                {lastPayment && (
                  <div className="bg-blue-50 rounded p-2">
                    <div className="text-[10px] text-blue-600">Dernier</div>
                    <div className="text-sm font-bold text-blue-700">{fmtF(lastPayment.amount)}</div>
                  </div>
                )}
                {firstPayment && (
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-[10px] text-gray-500">Premier paiement</div>
                    <div className="text-xs font-medium">
                      {new Date(firstPayment.timestamp).toLocaleDateString("fr-FR")} {new Date(firstPayment.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ HISTORIQUE DES PAIEMENTS ═══ */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><History className="h-4 w-4" /> Historique des paiements ({payments.length})</h3>
            <PaymentHistory payments={payments} />
          </div>

          {/* ═══ TIMELINE ═══ */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Timeline</h3>
            <Timeline order={order} payments={payments} audit={audit} />
          </div>

          {/* ═══ LOGISTIQUE IMPORT ═══ */}
          {!isLocal && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><Package className="h-4 w-4" /> Logistique</h3>
              {order.real_weight_kg ? <div className="text-sm">Poids reel: <span className="font-medium">{order.real_weight_kg} kg</span></div> : null}
              {order.volumetric_weight_kg ? <div className="text-sm">Poids volumetrique: <span className="font-medium">{order.volumetric_weight_kg} kg</span></div> : null}
              {order.total_shipping_fees ? (
                <div className="text-sm font-medium">Fret: {fmtF(order.total_shipping_fees)}</div>
              ) : (
                <div className="text-sm text-gray-500">Fret non calcule</div>
              )}
              {order.tracking_number && (
                <div className="text-sm flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{order.tracking_number}</span>
                </div>
              )}
            </div>
          )}

          {/* ═══ FORMULAIRE PESÉE ═══ */}
          {status === "to_weigh" && (
            <WeightForm orderId={order.order_id ?? ""} currentFreight={order.total_shipping_fees ?? 0} onWeightRecorded={onWeightRecorded} />
          )}

          {/* ═══ FORMULAIRE PAIEMENT ═══ */}
          {remaining > 0 && status !== "cancelled" && (
            <PaymentForm balance={remaining} orderId={order.order_id ?? ""} adminName={adminName} onPayment={onPayment} />
          )}

          <Separator />

          {/* ═══ ACTIONS RAPIDES ═══ */}
          <div className="flex gap-2 pt-2 pb-4">
            {status === "new" && (
              <>
                <Button size="sm" className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700" onClick={() => onStatusChange(order.order_id ?? "", "confirmed", adminName)}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Confirmer
                </Button>
                <Button size="sm" variant="destructive" className="flex-1 h-11" onClick={() => onStatusChange(order.order_id ?? "", "cancelled", adminName)}>
                  <Ban className="h-4 w-4 mr-1" /> Annuler
                </Button>
              </>
            )}
            {status === "ready" && (
              <Button size="sm" className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700" onClick={() => onStatusChange(order.order_id ?? "", "shipped", adminName)}>
                <Truck className="h-4 w-4 mr-1" /> Expedier
              </Button>
            )}
            {status === "shipped" && (
              <Button size="sm" className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700" onClick={() => onStatusChange(order.order_id ?? "", "delivered", adminName)}>
                <CheckCircle className="h-4 w-4 mr-1" /> Marquer livree
              </Button>
            )}
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
