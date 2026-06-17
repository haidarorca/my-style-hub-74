// @ts-nocheck
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, MapPin, Package, CreditCard, Calendar, MessageCircle, Truck, CheckCircle, Ban } from "lucide-react";
import { fmtF, STATUS_COLORS, STATUS_LABELS, whatsappLink } from "@/admin1/lib/admin1.config";
import { PaymentForm } from "./PaymentForm";

interface Props {
  order: any;
  onClose: () => void;
}

export function OrderDrawer({ order, onClose }: Props) {
  if (!order) return null;
  return (
    <Sheet open={!!order} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <DrawerContent order={order} onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}

function DrawerContent({ order, onClose }: { order: any; onClose: () => void }) {

  const waLink = whatsappLink(order.customer_phone,
    `Bonjour ${order.customer_name}, concernant votre commande ${order.order_number} (${fmtF(order.total_due)}). Status: ${STATUS_LABELS[order.status]}. `
  );

  return (
    <div className="space-y-5 py-4">
      <SheetHeader>
        <div className="flex items-center justify-between">
          <div>
            <SheetTitle className="text-lg">{order.order_number}</SheetTitle>
            <div className="flex gap-1 mt-1">
              <Badge variant="outline" className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
              <Badge variant="outline" className="text-[10px]">{order.order_type.toUpperCase()}</Badge>
            </div>
          </div>
        </div>
      </SheetHeader>

      {/* Client */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Phone className="h-4 w-4" /> Client</h3>
        <div className="text-sm font-medium">{order.customer_name}</div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          <a href={`tel:${order.customer_phone}`} className="hover:text-indigo-600 hover:underline">{order.customer_phone}</a>
        </div>
        {order.customer_address && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {order.customer_address}
          </div>
        )}
        <a href={waLink} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium mt-1">
          <MessageCircle className="h-4 w-4" /> Ouvrir WhatsApp
        </a>
      </div>

      {/* Finances */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><CreditCard className="h-4 w-4" /> Finances</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded-lg p-2">
            <div className="text-xs text-gray-500">Produits</div>
            <div className="text-sm font-bold">{fmtF(order.total_product_amount)}</div>
          </div>
          <div className="bg-white rounded-lg p-2">
            <div className="text-xs text-gray-500">Fret</div>
            <div className="text-sm font-bold">{fmtF(order.shipping_fees)}</div>
          </div>
          <div className="bg-white rounded-lg p-2">
            <div className="text-xs text-gray-500">Total du</div>
            <div className="text-sm font-bold">{fmtF(order.total_due)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-50 rounded-lg p-2 text-center">
            <div className="text-xs text-emerald-600">Paye</div>
            <div className="text-sm font-bold text-emerald-700">{fmtF(order.total_paid)}</div>
          </div>
          <div className={order.balance > 0 ? "bg-red-50 rounded-lg p-2 text-center" : "bg-emerald-50 rounded-lg p-2 text-center"}>
            <div className={order.balance > 0 ? "text-xs text-red-600" : "text-xs text-emerald-600"}>Solde</div>
            <div className={order.balance > 0 ? "text-sm font-bold text-red-700" : "text-sm font-bold text-emerald-700"}>
              {fmtF(order.balance)}
            </div>
          </div>
        </div>
      </div>

      {/* Historique paiements */}
      {order.payments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Historique des paiements</h3>
          {order.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2 text-sm">
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-medium">{fmtF(p.amount)}</span>
                <Badge variant="outline" className="text-[10px]">{p.method}</Badge>
              </div>
              <span className="text-xs text-gray-500">{new Date(p.recorded_at).toLocaleDateString("fr-FR")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Colis */}
      {order.packages.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Package className="h-4 w-4" /> Colis</h3>
          {order.packages.map((pkg) => (
            <div key={pkg.id} className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <Badge variant="outline" className="text-[10px]">{pkg.package_type.toUpperCase()}</Badge>
                {pkg.tracking_number && <span className="font-mono text-xs">{pkg.tracking_number}</span>}
              </div>
              {pkg.weight_kg && <div>Poids: {pkg.weight_kg} kg (vol: {pkg.volumetric_weight_kg} kg)</div>}
              {pkg.freight_cost > 0 && <div>Fret: {fmtF(pkg.freight_cost)}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Paiement */}
      {order.balance > 0 && order.status !== "cancelled" && (
        <PaymentForm order={order} onPayment={() => {}} />
      )}

      <Separator />

      {/* Dates */}
      <div className="text-xs text-gray-500 space-y-1">
        <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Creee: {new Date(order.created_at).toLocaleString("fr-FR")}</div>
        {order.confirmed_at && <div className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" /> Confirmee: {new Date(order.confirmed_at).toLocaleString("fr-FR")}</div>}
        {order.delivered_at && <div className="flex items-center gap-1"><Truck className="h-3 w-3 text-emerald-500" /> Livree: {new Date(order.delivered_at).toLocaleString("fr-FR")}</div>}
      </div>

      {/* Actions contextuelles */}
      <div className="flex gap-2 pt-2">
        {order.status === "new" && (
          <>
            <Button size="sm" className="flex-1" onClick={() => console.log("confirmer", order.id)}>
              <CheckCircle className="h-4 w-4 mr-1" /> Confirmer
            </Button>
            <Button size="sm" variant="destructive" className="flex-1" onClick={() => console.log("annuler", order.id)}>
              <Ban className="h-4 w-4 mr-1" /> Annuler
            </Button>
          </>
        )}
        {order.status === "ready_to_ship" && (
          <Button size="sm" className="flex-1" onClick={() => console.log("livrer", order.id)}>
            <Truck className="h-4 w-4 mr-1" /> Marquer livree
          </Button>
        )}
      </div>
    </div>
  );
}
