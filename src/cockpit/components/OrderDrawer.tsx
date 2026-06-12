// @ts-nocheck
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, MapPin, CreditCard, Calendar, MessageCircle, Package, Truck, CheckCircle, Ban, User } from "lucide-react";
import { fmtF, waLink, STATUS_LABELS, STATUS_COLORS, mapStatus } from "@/cockpit/lib/workflow";
import { PaymentForm } from "./PaymentForm";
import { WeightForm } from "./WeightForm";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";

interface Props {
  order: LogisticsOrderRow | null;
  onClose: () => void;
  onPayment: (orderId: string, amount: number, method: string, reference?: string) => void;
  onWeightRecorded: (orderId: string, freight: number) => void;
  onStatusChange: (orderId: string, status: string) => void;
}

export function OrderDrawer({ order, onClose, onPayment, onWeightRecorded, onStatusChange }: Props) {
  if (!order) return null;

  const status = mapStatus(order);
  const remaining = order.amount_remaining ?? 0;
  const isLocal = !order.shipping_service_id && order.order_type !== "import";
  const waMessage = `Bonjour ${order.customer_name ?? ""}, concernant votre commande (${order.order_id ?? ""})`;

  return (
    <Sheet open={!!order} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        <div className="p-4 space-y-4">
          {/* Header */}
          <SheetHeader className="pb-2">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-base">Commande {order.order_id}</SheetTitle>
              <Badge variant="outline" className={`text-[10px] ${isLocal ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
                {isLocal ? "LOCAL" : "IMPORT"}
              </Badge>
            </div>
            <Badge variant="outline" className={`text-[10px] w-fit ${STATUS_COLORS[status]}`}>
              {STATUS_LABELS[status]}
            </Badge>
          </SheetHeader>

          {/* Client */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><User className="h-4 w-4" /> Client</h3>
            <div className="text-sm font-medium">{order.customer_name ?? "—"}</div>
            {order.customer_phone && (
              <div className="flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <a href={`tel:${order.customer_phone}`} className="text-blue-600 hover:underline">{order.customer_phone}</a>
                <a href={waLink(order.customer_phone, waMessage)} target="_blank" rel="noopener noreferrer" className="ml-2 text-emerald-600 text-xs flex items-center gap-0.5">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              </div>
            )}
            {order.destination_address && (
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <MapPin className="h-3.5 w-3.5" /> {order.destination_address}
              </div>
            )}
          </div>

          {/* Finances */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><CreditCard className="h-4 w-4" /> Finances</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded p-2 text-center">
                <div className="text-xs text-gray-500">Produits</div>
                <div className="text-sm font-bold">{fmtF(order.order_total)}</div>
              </div>
              <div className="bg-white rounded p-2 text-center">
                <div className="text-xs text-gray-500">Fret</div>
                <div className="text-sm font-bold">{fmtF(order.total_shipping_fees)}</div>
              </div>
              <div className="bg-white rounded p-2 text-center">
                <div className="text-xs text-gray-500">Total</div>
                <div className="text-sm font-bold">{fmtF((order.order_total ?? 0) + (order.total_shipping_fees ?? 0))}</div>
              </div>
              <div className="bg-emerald-50 rounded p-2 text-center">
                <div className="text-xs text-emerald-600">Paye</div>
                <div className="text-sm font-bold text-emerald-700">{fmtF(order.amount_paid)}</div>
              </div>
            </div>
            {remaining > 0 ? (
              <div className="bg-red-50 rounded p-2 text-center">
                <div className="text-xs text-red-600">Reste a payer</div>
                <div className="text-lg font-bold text-red-700">{fmtF(remaining)}</div>
              </div>
            ) : (
              <div className="bg-emerald-50 rounded p-2 text-center">
                <div className="text-sm font-bold text-emerald-700">✓ Paye en totalite</div>
              </div>
            )}
          </div>

          {/* Logistique */}
          {!isLocal && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><Package className="h-4 w-4" /> Logistique</h3>
              {order.real_weight_kg && <div className="text-sm">Poids reel: {order.real_weight_kg} kg</div>}
              {order.volumetric_weight_kg && <div className="text-sm">Poids volumetrique: {order.volumetric_weight_kg} kg</div>}
              {order.total_shipping_fees ? (
                <div className="text-sm font-medium">Fret: {fmtF(order.total_shipping_fees)}</div>
              ) : (
                <div className="text-sm text-gray-500">Fret non calcule</div>
              )}
              {order.tracking_number && (
                <div className="text-sm flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5" />
                  <span className="font-mono text-xs">{order.tracking_number}</span>
                </div>
              )}
            </div>
          )}

          {/* Action: Peser (pour IMPORT en attente de pesee) */}
          {status === "to_weigh" && (
            <WeightForm orderId={order.order_id ?? ""} currentFreight={order.total_shipping_fees ?? 0} onWeightRecorded={onWeightRecorded} />
          )}

          {/* Action: Paiement */}
          {remaining > 0 && status !== "cancelled" && (
            <PaymentForm balance={remaining} orderId={order.order_id ?? ""} onPayment={onPayment} />
          )}

          <Separator />

          {/* Dates */}
          <div className="text-xs text-gray-500 space-y-1">
            {order.order_created_at && <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Creee: {new Date(order.order_created_at).toLocaleString("fr-FR")}</div>}
            {order.shipped_at && <div className="flex items-center gap-1"><Truck className="h-3 w-3 text-emerald-500" /> Expediee: {new Date(order.shipped_at).toLocaleString("fr-FR")}</div>}
          </div>

          {/* Actions rapides */}
          <div className="flex gap-2 pt-2">
            {status === "new" && (
              <>
                <Button size="sm" className="flex-1 h-10" onClick={() => onStatusChange(order.order_id ?? "", "confirmed")}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Confirmer
                </Button>
                <Button size="sm" variant="destructive" className="flex-1 h-10" onClick={() => onStatusChange(order.order_id ?? "", "cancelled")}>
                  <Ban className="h-4 w-4 mr-1" /> Annuler
                </Button>
              </>
            )}
            {status === "ready" && (
              <Button size="sm" className="flex-1 h-10" onClick={() => onStatusChange(order.order_id ?? "", "shipped")}>
                <Truck className="h-4 w-4 mr-1" /> Expedier
              </Button>
            )}
            {status === "shipped" && (
              <Button size="sm" className="flex-1 h-10" onClick={() => onStatusChange(order.order_id ?? "", "delivered")}>
                <CheckCircle className="h-4 w-4 mr-1" /> Marquer livree
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
