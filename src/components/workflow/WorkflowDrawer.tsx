import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { WorkflowStepBar } from "./WorkflowStepBar";
import { CustomerBadge } from "./CustomerBadge";
import {
  fmtF,
  fmtFees,
  fmtRemaining,
  getOrderTypeLabel,
  getDaysBadgeColor,
  getPaymentBadgeVariant,
} from "@/lib/workflow.config";
import type { WorkflowRow } from "@/types/workflow";
import { Phone, MapPin, Calendar, Package, Receipt, Truck } from "lucide-react";

interface Props {
  row: WorkflowRow | null;
  onClose: () => void;
}

export function WorkflowDrawer({ row, onClose }: Props) {
  if (!row) return null;

  const typeLabel = getOrderTypeLabel(row.order_type);
  const remainingInfo = fmtRemaining(row.amount_remaining);
  const paymentBadge = getPaymentBadgeVariant(row);
  const whatsappUrl = row.customer_phone
    ? `https://wa.me/${row.customer_phone.replace(/\D/g, "")}`
    : null;

  return (
    <Drawer open={!!row} onClose={onClose}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="border-b pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold text-white ${typeLabel.color}`}
            >
              {typeLabel.icon}
            </span>
            <DrawerTitle className="text-base">
              Commande {row.order_id?.slice(0, 12)}…
            </DrawerTitle>
            {row.days_pending > 0 && (
              <Badge
                className={`text-[10px] ${getDaysBadgeColor(row.days_pending)}`}
              >
                {row.days_pending}j
              </Badge>
            )}
          </div>
        </DrawerHeader>

        <div className="px-4 py-4 space-y-4 overflow-y-auto">
          {/* ── Client ────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase font-semibold text-muted-foreground">
              Client
            </h3>
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{row.customer_name ?? "—"}</span>
                {row.customer && <CustomerBadge customer={row.customer} />}
              </div>
              {row.customer_phone && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{row.customer_phone}</span>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:underline ml-2"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
              {row.customer_address && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>
                    {row.customer_address}
                    {row.customer_city ? `, ${row.customer_city}` : ""}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* ── Workflow ──────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase font-semibold text-muted-foreground">
              Workflow
            </h3>
            <WorkflowStepBar
              orderType={row.order_type}
              logisticsStatus={row.logistics_status}
            />
          </section>

          {/* ── Finances ──────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
              <Receipt className="h-3 w-3" />
              Finances
            </h3>
            <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Produits</span>
                <span className="font-medium">{fmtF(row.order_total ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frais transport</span>
                <span className="font-medium">{fmtFees(row.total_shipping_fees)}</span>
              </div>
              {row.air_freight_fee && row.air_freight_fee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>└ Avion</span>
                  <span>{fmtF(row.air_freight_fee)}</span>
                </div>
              )}
              {row.service_fee && row.service_fee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>└ Service</span>
                  <span>{fmtF(row.service_fee)}</span>
                </div>
              )}
              <div className="border-t pt-1 flex justify-between font-semibold text-sm">
                <span>Total</span>
                <span>
                  {fmtF((row.order_total ?? 0) + (row.total_shipping_fees ?? 0))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payé</span>
                <span className="font-medium text-emerald-700">
                  {fmtF(row.amount_paid)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reste</span>
                <span className={`font-bold ${remainingInfo.alert ? "text-red-600" : "text-emerald-700"}`}>
                  {remainingInfo.text}
                </span>
              </div>
              <div className="pt-1">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${paymentBadge.color}`}
                >
                  {paymentBadge.label}
                </Badge>
              </div>
            </div>
          </section>

          {/* ── Logistique ────────────────────────────── */}
          {(row.real_weight_kg || row.tracking_number) && (
            <section className="space-y-2">
              <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                <Truck className="h-3 w-3" />
                Logistique
              </h3>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1 text-xs">
                {row.real_weight_kg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Poids réel</span>
                    <span>{row.real_weight_kg} kg</span>
                  </div>
                )}
                {row.volumetric_weight_kg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Volumétrique</span>
                    <span>{row.volumetric_weight_kg} kg</span>
                  </div>
                )}
                {row.chargeable_weight_kg && (
                  <div className="flex justify-between font-medium">
                    <span>Facturable</span>
                    <span>{row.chargeable_weight_kg} kg</span>
                  </div>
                )}
                {row.tracking_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tracking</span>
                    <span className="font-mono">{row.tracking_number}</span>
                  </div>
                )}
                {row.tracking_url && (
                  <a
                    href={row.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Suivre le colis →
                  </a>
                )}
              </div>
            </section>
          )}

          {/* ── Dates ─────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Dates
            </h3>
            <div className="text-xs space-y-1 text-muted-foreground">
              {row.created_at && (
                <div className="flex justify-between">
                  <span>Création</span>
                  <span>{new Date(row.created_at).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
              {row.received_at && (
                <div className="flex justify-between">
                  <span>Réception</span>
                  <span>{new Date(row.received_at).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
              {row.weighed_at && (
                <div className="flex justify-between">
                  <span>Pesée</span>
                  <span>{new Date(row.weighed_at).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
              {row.shipped_at && (
                <div className="flex justify-between">
                  <span>Expédition</span>
                  <span>{new Date(row.shipped_at).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
            </div>
          </section>

          {/* ── Photo colis ───────────────────────────── */}
          {row.parcel_photo_url && (
            <section className="space-y-2">
              <h3 className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" />
                Photo du colis
              </h3>
              <img
                src={row.parcel_photo_url}
                alt="Colis"
                className="h-32 w-32 rounded-lg border object-cover"
              />
            </section>
          )}

          {/* ── Commentaire ───────────────────────────── */}
          {row.admin_comment && (
            <section className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h3 className="text-[10px] uppercase font-semibold text-amber-700">
                Commentaire admin
              </h3>
              <p className="text-xs text-amber-800 mt-1">{row.admin_comment}</p>
            </section>
          )}

          {/* ── Note client ───────────────────────────── */}
          {row.client_response_note && (
            <section className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <h3 className="text-[10px] uppercase font-semibold text-purple-700">
                Réponse client
              </h3>
              <p className="text-xs text-purple-800 mt-1">
                {row.client_response_note}
              </p>
            </section>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
