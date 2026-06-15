// ═══════════════════════════════════════════════════════════════
// OrderDrawer — Fiche commande (pas de dialogs internes)
// ═══════════════════════════════════════════════════════════════

import { useMemo } from "react";
import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, MapPin, CreditCard, MessageCircle, Package, Truck, CheckCircle, Ban, User, History, TrendingUp, Calendar, ShieldAlert, ListOrdered, ChevronRight, AlertTriangle, Layers, Home } from "lucide-react";
import { STATUS_COLORS, fmtF, waLink, isImport, getImportStepIndex, IMPORT_STEPS, getNextStep, canMarkDelivered, canMarkShipped, canMarkPreparing } from "@/cockpit/lib/workflow";
import { getOrderNumber, getTechnicalRef } from "@/cockpit/lib/orderNumbers";
import { PaymentForm } from "./PaymentForm";
import { WeightForm } from "./WeightForm";
import { PaymentHistory } from "./PaymentHistory";
import { OrderAuditTimeline } from "./OrderAuditTimeline";
import { PartialDeliveryBanner } from "./PartialDeliveryBanner";
import { RestockWaitingPanel } from "./RestockWaitingPanel";
import { PendingFinancialActions } from "./PendingFinancialActions";
import type { SettlementInput } from "./PendingFinancialActions";
import { useAuth } from "@/hooks/use-auth";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import type { PaymentRecord, AuditEntry, WeighingRecord } from "@/cockpit/types";
import { NextActionBanner } from "./NextActionBanner";
import { AggregateDebugPanel } from "./AggregateDebugPanel";
import { ArticlesPanel } from "./ArticlesPanel";
import { WorkflowControlPanel } from "./WorkflowControlPanel";
import { getNextActionForOrder, getPendingFinancialActions } from "@/cockpit/lib/article-states";
import type { OrderArticle, ArticleStatus } from "@/cockpit/lib/article-states";
import type { StockBreakSubmit } from "./StockBreakDialog";

interface OrderFinancials {
  productTotal: number;
  freight: number;
  grandTotal: number;
  paid: number;
  remaining: number;
}

interface Props {
  order: LogisticsOrderRow | null;
  orderIndex: number;
  payments: PaymentRecord[];
  audit: AuditEntry[];
  weighings: WeighingRecord[];
  financials: OrderFinancials;
  dialogs?: React.ReactNode;
  onClose: () => void;
  onPayment: (orderId: string, amount: number, method: string, reference: string, adminName: string) => void;
  onEditPayment?: (id: string, u: { amount?: number; method?: string; reference?: string }) => void;
  onDeletePayment?: (id: string) => void;
  onWeigh: (record: Omit<WeighingRecord, "id" | "timestamp">) => void;
  onStatusChange: (orderId: string, status: string, adminName: string) => void;
  onRequestCancel?: () => void;
  onViewItems?: () => void;
  onFormInteraction?: () => void;
  // ─── Gestion article par article ───
  articles?: OrderArticle[];
  onStockBreak?: (productId: string, data: StockBreakSubmit) => void;
  onArticleStatusChange?: (productId: string, status: ArticleStatus) => void;
  onPartialDeliver?: (productId: string, qty: number) => void;
  onOverrideDecision?: (productId: string, data: StockBreakSubmit, overrideReason: string) => void;
  onSettleFinancial?: (productId: string, data: SettlementInput) => void;
  onResumeRestock?: (productId: string) => void;
}

export function OrderDrawer({ order, orderIndex, payments, audit, weighings, financials, dialogs, onClose, onPayment, onEditPayment, onDeletePayment, onWeigh, onStatusChange, onRequestCancel, onViewItems, onFormInteraction, articles, onStockBreak, onArticleStatusChange, onPartialDeliver, onOverrideDecision, onSettleFinancial, onResumeRestock }: Props) {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";
  if (!order) return null;

  const status = order.logistics_status ?? "new";
  const kz = getOrderNumber(order.order_id ?? "");
  const tech = getTechnicalRef(order.order_id ?? "");
  // Finances centralisées — SEULE source de vérité
  const ot = financials.productTotal;
  const sf = financials.freight;
  const gt = financials.grandTotal;
  const tp = financials.paid;
  const rem = financials.remaining;
  const paidFull = rem <= 0 && gt > 0;
  const waMsg = `Bonjour ${order.customer_name ?? ""}, concernant votre commande ${order.order_id ?? ""}`;
  const sortedP = useMemo(() => [...payments].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()), [payments]);
  const firstP = sortedP[0];
  const lastP = sortedP[sortedP.length - 1];

  // ─── Type réel de la commande : SEULE source de vérité = articles (is_import / is_local).
  // Si articles non encore chargés, fallback prudent sur shipping_service_id.
  const hasLocal = !!articles && articles.some(a => a.is_local);
  const hasImport = !!articles && articles.some(a => a.is_import);
  const isMixte = !!articles && hasLocal && hasImport;
  const isLocalOrder = !!articles && hasLocal && !hasImport;
  const isImportOrder = !!articles && !hasLocal && hasImport;
  const isImportFallback = !articles && isImport(order);
  // `imp` = workflow import (mixte aussi traversent le flux import pour la partie importée)
  const imp = isMixte || isImportOrder || isImportFallback;
  const stepIdx = imp ? getImportStepIndex(status) : -1;
  const label = imp && stepIdx >= 0 ? `${stepIdx + 1}/${IMPORT_STEPS.length} ${IMPORT_STEPS[stepIdx]?.label}` : (status === "new" ? "À confirmer" : status);

  // ─── Action suivante intelligente ───
  const nextActionInfo = articles ? getNextActionForOrder(status, articles, rem, sf > 0) : null;

  // Prochaine étape dans le circuit métier
  const nextStep = getNextStep(status, imp);

  // Handler qui ferme le drawer après changement de statut
  const handleStatusAndClose = (orderId: string, newStatus: string, admin: string) => {
    onStatusChange(orderId, newStatus, admin);
    onClose();
  };

  return (
    <Sheet open={!!order} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        <div className="p-4 space-y-4">
          {/* Header */}
          <SheetHeader className="pb-2">
            <div className="space-y-1">
              <SheetTitle className="text-xl">{kz}</SheetTitle>
              <div className="font-mono text-[11px] text-gray-400">{tech}</div>
              <div className="flex gap-2 pt-1 flex-wrap">
                {isMixte ? (
                  <Badge variant="outline" className="text-[10px] bg-gradient-to-r from-indigo-50 to-emerald-50 text-indigo-700 border-indigo-200 font-bold">
                    <Layers className="h-3 w-3 mr-1" />MIXTE
                  </Badge>
                ) : isLocalOrder ? (
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">LOCAL</Badge>
                ) : isImportOrder || isImportFallback ? (
                  <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700">IMPORT</Badge>
                ) : null}
                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[status] ?? ""}`}>{label}</Badge>
              </div>
            </div>
          </SheetHeader>

          {/* ─── Action suivante ─── */}
          {nextActionInfo && (
            <NextActionBanner action={nextActionInfo} onClick={nextStep ? () => handleStatusAndClose(order.order_id ?? "", nextStep.status, adminName) : undefined} />
          )}

          {/* ─── Centre de contrôle du workflow (Option B) ─── */}
          <WorkflowControlPanel
            orderId={order.order_id ?? undefined}
            status={status}
            isImport={!!(isImportOrder || isImportFallback)}
            isLocal={!!isLocalOrder}
            isMixte={isMixte}
            articles={articles}
            onStatusChange={(newStatus) => handleStatusAndClose(order.order_id ?? "", newStatus, adminName)}
          />

          {/* ─── Livraison partielle (visible sans ouvrir les détails) ─── */}
          <PartialDeliveryBanner articles={articles} />

          {/* ─── Sous-processus : articles en attente de réapprovisionnement ─── */}
          <RestockWaitingPanel articles={articles} orderStatus={status} onResumeRestock={onResumeRestock} />


          {/* ─── Actions financières en attente (matrice v3 — lève les *_pending) ─── */}
          {articles && onSettleFinancial && (
            <PendingFinancialActions
              articles={articles}
              remainingToPay={rem}
              onSettle={onSettleFinancial}
            />
          )}



          {/* Client */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><User className="h-4 w-4" />Client</h3>
            <div className="text-sm font-medium">{order.customer_name ?? "—"}</div>
            {order.customer_phone && (
              <div className="flex items-center gap-1.5 text-sm flex-wrap">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <a href={`tel:${order.customer_phone}`} className="text-blue-600 hover:underline">{order.customer_phone}</a>
                <a href={waLink(order.customer_phone, waMsg)} target="_blank" rel="noopener noreferrer" className="ml-2 text-emerald-600 text-xs flex items-center gap-0.5 bg-emerald-50 px-2 py-0.5 rounded-full"><MessageCircle className="h-3 w-3" />WhatsApp</a>
              </div>
            )}
            {order.customer_address && <div className="flex items-center gap-1.5 text-sm text-gray-500"><MapPin className="h-3.5 w-3.5" />{order.customer_address}</div>}
          </div>

          {/* ─── Bouton : Voir les articles ─── */}
          {onViewItems && (
            <button onClick={onViewItems} className="w-full flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 hover:bg-orange-100 transition-colors">
              <div className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5 text-orange-600" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-orange-800">Voir les articles</div>
                  <div className="text-[10px] text-orange-600">Produits, quantités, vendeur, commission, variantes</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-orange-400" />
            </button>
          )}

          {/* ─── Gestion article par article (matrice v3) ─── */}
          {articles && articles.length > 0 && (
            <ArticlesPanel
              articles={articles}
              paidAmount={tp}
              orderStatus={status}
              onStockBreak={onStockBreak}
              onStatusChange={onArticleStatusChange}
              onPartialDeliver={onPartialDeliver}
              onOverrideDecision={onOverrideDecision}
            />
          )}

          {/* Finances — Vue détaillée avec split produits/fret */}
          {(() => {
            // Allocation FIFO : on impute d'abord aux produits, puis au fret
            const productPaid = Math.min(tp, ot);
            const freightPaid = Math.max(0, tp - ot);
            const productRem = Math.max(0, ot - productPaid);
            const freightRem = Math.max(0, sf - freightPaid);
            const showSplit = imp && sf > 0;
            return (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5"><CreditCard className="h-4 w-4" />Finances</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded p-2 text-center"><div className="text-[10px] text-gray-500">Produits</div><div className="text-sm font-bold">{fmtF(ot)}</div></div>
                  <div className="bg-white rounded p-2 text-center"><div className="text-[10px] text-gray-500">Fret</div><div className="text-sm font-bold">{fmtF(sf)}</div></div>
                  <div className="bg-white rounded p-2 text-center border-2 border-gray-200"><div className="text-[10px] text-gray-500 font-semibold">TOTAL</div><div className="text-sm font-bold">{fmtF(gt)}</div></div>
                  <div className="bg-emerald-50 rounded p-2 text-center"><div className="text-[10px] text-emerald-600">Payé</div><div className="text-sm font-bold text-emerald-700">{fmtF(tp)}</div></div>
                </div>
                {showSplit && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className={`rounded-lg p-2 border ${productRem === 0 ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
                      <div className="text-[10px] text-gray-500 font-semibold uppercase">Produits</div>
                      <div className="text-[11px] text-emerald-700">Payé : <span className="font-bold">{fmtF(productPaid)}</span></div>
                      <div className={`text-[11px] ${productRem > 0 ? "text-red-700 font-bold" : "text-gray-400"}`}>Reste : {fmtF(productRem)}</div>
                    </div>
                    <div className={`rounded-lg p-2 border ${freightRem === 0 ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
                      <div className="text-[10px] text-gray-500 font-semibold uppercase">Fret</div>
                      <div className="text-[11px] text-emerald-700">Payé : <span className="font-bold">{fmtF(freightPaid)}</span></div>
                      <div className={`text-[11px] ${freightRem > 0 ? "text-red-700 font-bold" : "text-gray-400"}`}>Reste : {fmtF(freightRem)}</div>
                    </div>
                  </div>
                )}
                {!paidFull ? <div className="bg-red-50 rounded-lg p-3 text-center"><div className="text-[10px] text-red-600">Reste à payer (total)</div><div className="text-xl font-bold text-red-700">{fmtF(rem)}</div></div>
                  : gt > 0 ? <div className="bg-emerald-50 rounded-lg p-3 text-center"><div className="text-sm font-bold text-emerald-700">Payé en totalité</div><div className="text-xs text-emerald-600">{fmtF(tp)} / {fmtF(gt)}</div></div> : null}
              </div>
            );
          })()}

          {/* ─── Alertes opérationnelles ─── */}
          {(() => {
            const alerts: { tone: "red" | "amber" | "blue"; title: string; text: string }[] = [];

            // Fret non payé avant expédition
            if (imp && sf > 0 && rem > 0 && ["ready", "ready_delivery", "payment_fees", "fees_calculated"].includes(status)) {
              alerts.push({ tone: "amber", title: "Fret import non payé", text: `Reste : ${fmtF(rem)}. Encaissez avant d'expédier.` });
            }
            // Rupture non résolue
            const breaks = (articles ?? []).filter(a => a.stock_break && !a.stock_break.resolved);
            if (breaks.length > 0) {
              alerts.push({ tone: "red", title: `${breaks.length} rupture${breaks.length > 1 ? "s" : ""} non résolue${breaks.length > 1 ? "s" : ""}`, text: "Contactez le client pour valider l'action." });
            }
            // Commande bloquée depuis X jours
            if (order.order_created_at && !["delivered", "cancelled"].includes(status)) {
              const days = Math.floor((Date.now() - new Date(order.order_created_at).getTime()) / 86400000);
              if (days >= 7) {
                alerts.push({ tone: days >= 14 ? "red" : "amber", title: `Commande bloquée depuis ${days} jours`, text: `Statut actuel : ${status}. Relancez le flux.` });
              }
            }
            // Livraison partielle en cours
            const partial = (articles ?? []).filter(a => (a.delivered_qty ?? 0) > 0 && (a.delivered_qty ?? 0) < a.quantity);
            if (partial.length > 0) {
              alerts.push({ tone: "blue", title: "Livraison partielle en cours", text: `${partial.length} article(s) partiellement livré(s).` });
            }

            if (alerts.length === 0) return null;
            const toneClass = (t: "red" | "amber" | "blue") =>
              t === "red" ? "bg-red-50 border-red-300 text-red-800"
              : t === "amber" ? "bg-amber-50 border-amber-300 text-amber-800"
              : "bg-blue-50 border-blue-300 text-blue-800";
            return (
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <div key={i} className={`border rounded-lg p-3 flex items-start gap-2 ${toneClass(a.tone)}`}>
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <div className="font-bold">{a.title}</div>
                      <div className="mt-0.5">{a.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Stats paiements */}
          {payments.length > 0 && (
            <div className="bg-white border rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-emerald-600" />Récapitulatif ({payments.length} paiements)</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-gray-50 rounded p-2"><div className="text-[10px] text-gray-500">Nombre</div><div className="text-lg font-bold">{payments.length}</div></div>
                <div className="bg-emerald-50 rounded p-2"><div className="text-[10px] text-emerald-600">Total payé</div><div className="text-lg font-bold text-emerald-700">{fmtF(tp)}</div></div>
                {lastP && <div className="bg-blue-50 rounded p-2"><div className="text-[10px] text-blue-600">Dernier</div><div className="text-sm font-bold text-blue-700">{fmtF(lastP.amount)}</div></div>}
                {firstP && <div className="bg-gray-50 rounded p-2"><div className="text-[10px] text-gray-500">Premier</div><div className="text-xs font-medium">{new Date(firstP.timestamp).toLocaleDateString("fr-FR")}</div></div>}
              </div>
            </div>
          )}

          {/* Historique paiements */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><History className="h-4 w-4" />Paiements ({payments.length})</h3>
            <div onClick={onFormInteraction}><PaymentHistory payments={payments} onEdit={onEditPayment} onDelete={onDeletePayment} locked={status === "delivered"} /></div>
          </div>

          {/* Historique d'audit unifié */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><Calendar className="h-4 w-4" />Historique</h3>
            <OrderAuditTimeline order={order} payments={payments} audit={audit} articles={articles} />
          </div>

          {/* Pesées */}
          {weighings.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><Package className="h-4 w-4" />Historique pesées</h3>
              {weighings.map(w => (
                <div key={w.id} className="text-xs bg-white rounded p-2">
                  <div className="font-medium">{w.chargeableWeightKg.toFixed(2)} kg facturé → {fmtF(w.finalFreight)}</div>
                  <div className="text-gray-500">Réel: {w.realWeightKg}kg / Vol: {w.volumetricWeightKg.toFixed(2)}kg</div>
                  <div className="text-gray-400">{new Date(w.timestamp).toLocaleDateString("fr-FR")} — {w.weighedBy}</div>
                </div>
              ))}
            </div>
          )}

          {/* Pesée */}
          {imp && status === "awaiting_weighing" && (
            <div onClick={onFormInteraction}><WeightForm orderId={order.order_id ?? ""} onWeigh={onWeigh} /></div>
          )}

          {/* Paiement */}
          {rem > 0 && status !== "cancelled" && (
            <div onClick={onFormInteraction}><PaymentForm balance={rem} orderId={order.order_id ?? ""} adminName={adminName} onPayment={onPayment} /></div>
          )}

          <Separator />

          {/* Action suivante (circuit métier) */}
          {nextStep && (
            <div className="pt-2 pb-2">
              <div className="text-[10px] text-gray-500 mb-1.5 text-center">Étape suivante : {nextStep.label}</div>
              <Button size="sm" className={`w-full h-12 ${nextStep.color} hover:opacity-90 text-white font-semibold`} onClick={() => handleStatusAndClose(order.order_id ?? "", nextStep.status, adminName)}>
                <CheckCircle className="h-5 w-5 mr-2" />{nextStep.actionLabel}
              </Button>
            </div>
          )}

          {/* Annuler (toujours disponible sauf si livrée/annulée) */}
          {onRequestCancel && status !== "delivered" && status !== "cancelled" && (
            <Button size="sm" variant="outline" className="w-full h-10 text-red-600 border-red-200 hover:bg-red-50 mt-2" onClick={onRequestCancel}>
              <Ban className="h-4 w-4 mr-1.5" />Annuler la commande
            </Button>
          )}

          <div className="pb-4" />
        </div>
        {/* Dialogs a l'interieur du SheetContent pour eviter inert de Radix */}
        {dialogs}
      </SheetContent>
    </Sheet>
  );
}