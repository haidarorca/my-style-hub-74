// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   OrderDrawer — Fiche commande complete
   
   Features:
   - Finances calculees depuis paiements locaux
   - Workflow IMPORT : barre de progression 10 etapes
   - Annulation avec verification (checkCanCancel)
   - Stats paiements (nombre, total, dernier, premier)
   - Timeline complete
   ═══════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Phone, MapPin, CreditCard, MessageCircle, Package, Truck, CheckCircle, Ban,
  User, History, TrendingUp, Calendar, AlertTriangle, ShieldAlert, Info
} from "lucide-react";
import {
  fmtF, waLink, STATUS_COLORS, mapStatus,
  IMPORT_WORKFLOW_STEPS, getImportStepIndex, checkCanCancel, REFUND_LABELS
} from "@/cockpit/lib/workflow";
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

  // Etat annulation
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelRefundType, setCancelRefundType] = useState<string>("");

  if (!order) return null;

  const status = mapStatus(order);
  const isLocal = !order.shipping_service_id && order.order_type !== "import";
  const isImport = !isLocal;

  /* ── Finances ── */
  const orderTotal = order.order_total ?? 0;
  const shippingFees = order.total_shipping_fees ?? 0;
  const grandTotal = orderTotal + shippingFees;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, grandTotal - totalPaid);
  const isPaid = remaining <= 0 && grandTotal > 0;

  /* ── Annulation ── */
  const cancelCheck = checkCanCancel(order, totalPaid);

  /* ── Workflow IMPORT ── */
  const importStep = isImport ? getImportStepIndex(order.logistics_status) : -1;
  const importTotalSteps = IMPORT_WORKFLOW_STEPS.length;

  const waMessage = `Bonjour ${order.customer_name ?? ""}, concernant votre commande #${orderIndex + 1}`;
  const shortUuid = order.order_id?.slice(0, 12) ?? "";

  /* ── Stats paiements ── */
  const sortedPayments = [...payments].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const firstPayment = sortedPayments[0];
  const lastPayment = sortedPayments[sortedPayments.length - 1];

  /* ── Label de statut detaille ── */
  const statusLabel = isImport && order.logistics_status
    ? `${getImportStepIndex(order.logistics_status) + 1}/${importTotalSteps} ${order.logistics_status.replace(/_/g, " ")}`
    : (() => { const s = mapStatus(order); return s; })();

  return (
    <Sheet open={!!order} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        <div className="p-4 space-y-4">

          {/* ═══ HEADER ═══ */}
          <SheetHeader className="pb-2">
            <div className="space-y-1">
              <SheetTitle className="text-xl">Commande #{orderIndex + 1}</SheetTitle>
              <div className="font-mono text-[11px] text-gray-400">ORD-{shortUuid}</div>
              <div className="flex gap-2 pt-1 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${isLocal ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
                  {isLocal ? "LOCAL" : "IMPORT"}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[status] ?? ""}`}>
                  {statusLabel}
                </Badge>
              </div>
            </div>
          </SheetHeader>

          {/* ═══ WORKFLOW IMPORT — Barre de progression ═══ */}
          {isImport && (
            <div className="bg-indigo-50 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Workflow IMPORT
              </h3>
              {/* Barre de progression */}
              <div className="w-full bg-indigo-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.max(5, ((importStep + 1) / importTotalSteps) * 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-indigo-600 text-center">
                Etape {importStep + 1} sur {importTotalSteps} : {IMPORT_WORKFLOW_STEPS[importStep]?.label ?? "Inconnu"}
              </div>
              {/* Steps visuels */}
              <div className="flex gap-1 flex-wrap">
                {IMPORT_WORKFLOW_STEPS.map((step, i) => (
                  <div
                    key={step.key}
                    className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      i <= importStep
                        ? i === importStep
                          ? "bg-indigo-600 text-white font-bold"
                          : "bg-indigo-200 text-indigo-800"
                        : "bg-gray-200 text-gray-400"
                    }`}
                    title={step.label}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ CLIENT ═══ */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><User className="h-4 w-4" /> Client</h3>
            <div className="text-sm font-medium">{order.customer_name ?? "—"}</div>
            {order.customer_phone && (
              <div className="flex items-center gap-1.5 text-sm flex-wrap">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <a href={`tel:${order.customer_phone}`} className="text-blue-600 hover:underline">{order.customer_phone}</a>
                <a href={waLink(order.customer_phone, waMessage)} target="_blank" rel="noopener noreferrer"
                  className="ml-2 text-emerald-600 text-xs flex items-center gap-0.5 bg-emerald-50 px-2 py-0.5 rounded-full">
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
                <div className="text-sm font-bold text-emerald-700">Paye en totalite</div>
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
          {isImport && (
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
          <div className="space-y-2 pt-2 pb-4">
            {/* Confirmation (LOCAL et IMPORT) */}
            {status === "new" && (
              <>
                <Button size="sm" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" onClick={() => onStatusChange(order.order_id ?? "", "confirmed", adminName)}>
                  <CheckCircle className="h-4 w-4 mr-1.5" /> Confirmer la commande
                </Button>
                <Button size="sm" variant="outline" className="w-full h-10 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowCancelDialog(true)}>
                  <Ban className="h-4 w-4 mr-1.5" /> Annuler la commande
                </Button>
              </>
            )}

            {/* Workflow IMPORT — actions contextuelles */}
            {isImport && status === "confirmed" && (
              <>
                <Button size="sm" className="w-full h-11 bg-cyan-600 hover:bg-cyan-700" onClick={() => onStatusChange(order.order_id ?? "", "ordered_from_supplier", adminName)}>
                  <Package className="h-4 w-4 mr-1.5" /> Commander chez le fournisseur
                </Button>
                <Button size="sm" variant="outline" className="w-full h-10 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowCancelDialog(true)}>
                  <Ban className="h-4 w-4 mr-1.5" /> Annuler
                </Button>
              </>
            )}
            {isImport && order.logistics_status === "ordered_from_supplier" && (
              <Button size="sm" className="w-full h-11 bg-teal-600 hover:bg-teal-700" onClick={() => onStatusChange(order.order_id ?? "", "received_at_agent", adminName)}>
                <Package className="h-4 w-4 mr-1.5" /> Marquer recue chez l'agent
              </Button>
            )}
            {isImport && order.logistics_status === "received_at_agent" && (
              <Button size="sm" className="w-full h-11 bg-orange-600 hover:bg-orange-700" onClick={() => onStatusChange(order.order_id ?? "", "awaiting_weighing", adminName)}>
                <ShieldAlert className="h-4 w-4 mr-1.5" /> A peser
              </Button>
            )}

            {/* Pret → Expedie (LOCAL et IMPORT) */}
            {status === "ready" && (
              <Button size="sm" className="w-full h-11 bg-indigo-600 hover:bg-indigo-700" onClick={() => onStatusChange(order.order_id ?? "", "shipped", adminName)}>
                <Truck className="h-4 w-4 mr-1.5" /> Expedier
              </Button>
            )}

            {/* Expedie → Livree */}
            {status === "shipped" && (
              <Button size="sm" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" onClick={() => onStatusChange(order.order_id ?? "", "delivered", adminName)}>
                <CheckCircle className="h-4 w-4 mr-1.5" /> Marquer livree
              </Button>
            )}
          </div>

          {/* ═══ DIALOGUE D'ANNULATION ═══ */}
          {showCancelDialog && (
            <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCancelDialog(false)}>
              <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Annuler la commande
                </h3>

                {!cancelCheck.canCancel ? (
                  <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
                    {cancelCheck.reason}
                  </div>
                ) : (
                  <>
                    {/* Warnings */}
                    {cancelCheck.warnings.length > 0 && (
                      <div className="space-y-1">
                        {cancelCheck.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded p-2">
                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            {w}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Montant paye */}
                    {cancelCheck.paidAmount > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-500">Montant paye : </span>
                        <span className="font-bold">{fmtF(cancelCheck.paidAmount)}</span>
                      </div>
                    )}

                    {/* Raison */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Raison de l'annulation</label>
                      <Input
                        placeholder="Ex: Client a annule, produit indisponible..."
                        value={cancelReason}
                        onChange={e => setCancelReason(e.target.value)}
                        className="text-sm h-9"
                      />
                    </div>

                    {/* Type de remboursement */}
                    {cancelCheck.refundOptions.length > 1 && (
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Type de remboursement</label>
                        <Select value={cancelRefundType} onValueChange={setCancelRefundType}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Choisir..." />
                          </SelectTrigger>
                          <SelectContent>
                            {cancelCheck.refundOptions.map(opt => (
                              <SelectItem key={opt} value={opt}>{REFUND_LABELS[opt]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}

                {/* Boutons */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 h-10" onClick={() => setShowCancelDialog(false)}>
                    Retour
                  </Button>
                  {cancelCheck.canCancel && (
                    <Button
                      variant="destructive"
                      className="flex-1 h-10"
                      disabled={!cancelReason.trim()}
                      onClick={() => {
                        onStatusChange(order.order_id ?? "", "cancelled", adminName);
                        setShowCancelDialog(false);
                        setCancelReason("");
                        setCancelRefundType("");
                      }}
                    >
                      <Ban className="h-4 w-4 mr-1" /> Confirmer l'annulation
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </SheetContent>
    </Sheet>
  );
}
