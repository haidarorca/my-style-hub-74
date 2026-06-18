// ═══════════════════════════════════════════════════════════════
// OrderDrawer — Fiche commande (pas de dialogs internes)
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, MapPin, CreditCard, MessageCircle, Package, Truck, CheckCircle, Ban, User, History, TrendingUp, Calendar, ShieldAlert, ListOrdered, ChevronRight, AlertTriangle, Home } from "lucide-react";
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
import { SubOrdersPanel } from "./SubOrdersPanel";
import { RelatedSubOrdersStrip } from "./RelatedSubOrdersStrip";
import { ArticlesPanel } from "./ArticlesPanel";
import { SubOrderProfitabilityPanel } from "./SubOrderProfitabilityPanel";
import { WorkflowControlPanel } from "./WorkflowControlPanel";
import { getPendingFinancialActions } from "@/cockpit/lib/article-states";
import { aggregateOrder, buildNextActionBannerPayload } from "@/cockpit/lib/order-aggregate";
import { deriveSubOrders } from "@/cockpit/lib/sub-orders";
import type { OrderArticle, ArticleStatus } from "@/cockpit/lib/article-states";
import type { StockBreakSubmit } from "./StockBreakDialog";
import { EventTimeline } from "./EventTimeline";
import { SubOrderBadges } from "./SubOrderBadges";
import { EventCaptureDialog } from "./EventCaptureDialog";
import type { SubOrderHistory } from "@/cockpit/hooks/useSubOrderHistories";

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
  /** Phase 2 : scope du drawer à UNE boutique. Si défini, articles/workflow/financials sont filtrés. */
  vendorId?: string;
  /** Phase 2 : navigation vers une autre boutique de la même commande mère. */
  onVendorChange?: (vendorId: string) => void;
  /** Phase B : historique métier de la sous-commande affichée. */
  subOrderHistory?: SubOrderHistory;
  subOrderHistoryLoading?: boolean;
}

export function OrderDrawer({ order, orderIndex, payments, audit, weighings, financials, dialogs, onClose, onPayment, onEditPayment, onDeletePayment, onWeigh, onStatusChange, onRequestCancel, onViewItems, onFormInteraction, articles, onStockBreak, onArticleStatusChange, onPartialDeliver, onOverrideDecision, onSettleFinancial, onResumeRestock, vendorId, onVendorChange, subOrderHistory, subOrderHistoryLoading }: Props) {
  const { profile } = useAuth();
  const adminName = profile?.full_name ?? profile?.email ?? "Admin";
  const [showEventCapture, setShowEventCapture] = useState(false);
  if (!order) return null;

  const status = order.logistics_status ?? "new";
  const kz = getOrderNumber(order.order_id ?? "");
  const tech = getTechnicalRef(order.order_id ?? "");

  // ─── Phase 2 : SCOPE BOUTIQUE ───
  // Toutes les sous-commandes sœurs (pour navigation et libellé).
  const allSubs = useMemo(
    () => deriveSubOrders(articles, status, order.order_id ?? undefined),
    [articles, status, order.order_id],
  );
  const currentSub = vendorId ? allSubs.find(s => s.vendor_id === vendorId) : undefined;
  // Articles affichés dans ce drawer : filtré par vendeur si scope actif.
  const scopedArticles = useMemo(
    () => vendorId ? (articles ?? []).filter(a => (a.vendor_id ?? "unknown") === vendorId) : articles,
    [articles, vendorId],
  );
  const siblings = useMemo(
    () => allSubs.map(s => ({
      vendor_id: s.vendor_id, vendor_name: s.vendor_name,
      index: s.index, total: s.total, label: s.label,
    })),
    [allSubs],
  );
  const isScoped = !!vendorId && !!currentSub;
  // Libellé : "KZ-000101 · 2/3 — Boutique B" quand scopé.
  const headerLabel = isScoped ? currentSub!.label : kz;
  const headerVendor = isScoped ? currentSub!.vendor_name : null;

  // Finances : pro-rata du sous-total produits quand scopé.
  const productShare = isScoped && financials.productTotal > 0
    ? currentSub!.financials.product_total / financials.productTotal
    : 1;
  const ot = isScoped ? currentSub!.financials.product_total : financials.productTotal;
  const sf = isScoped ? Math.round(financials.freight * productShare) : financials.freight;
  const gt = ot + sf;
  const tp = Math.round(financials.paid * (isScoped ? productShare : 1));
  const rem = Math.max(0, gt - tp);
  const paidFull = rem <= 0 && gt > 0;
  const waMsg = `Bonjour ${order.customer_name ?? ""}, concernant votre commande ${order.order_id ?? ""}`;
  const sortedP = useMemo(() => [...payments].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()), [payments]);
  const firstP = sortedP[0];
  const lastP = sortedP[sortedP.length - 1];

  // ─── Type opérationnel du contenu affiché (scope-aware) ───
  const hasLocal = !!scopedArticles && scopedArticles.some(a => a.is_local);
  const hasImport = !!scopedArticles && scopedArticles.some(a => a.is_import);
  const isLocalOrder = !!scopedArticles && hasLocal && !hasImport;
  const isImportOrder = !!scopedArticles && !hasLocal && hasImport;
  const isImportFallback = !scopedArticles && isImport(order);
  // Quand scopé : pas de "multi-vendor" dans ce drawer (par définition c'est UNE boutique).
  const isMultiVendor = !isScoped && !!articles && new Set(articles.map(a => a.vendor_id ?? "unknown")).size > 1;
  const imp = isImportOrder || isImportFallback;
  const stepIdx = imp ? getImportStepIndex(status) : -1;
  const label = imp && stepIdx >= 0 ? `${stepIdx + 1}/${IMPORT_STEPS.length} ${IMPORT_STEPS[stepIdx]?.label}` : (status === "new" ? "À confirmer" : status);

  // Agrégateur — sur les articles scopés.
  const agg = useMemo(() => aggregateOrder(scopedArticles, status), [scopedArticles, status]);
  const nextActionInfo = scopedArticles ? buildNextActionBannerPayload(agg) : null;

  // Prochaine étape dans le circuit métier (Circuit B si poids déclaré).
  const weightStatus = (order as any).weight_status as string | null | undefined;
  const nextStep = getNextStep(status, imp, weightStatus);


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
              <SheetTitle className="text-xl">{headerLabel}</SheetTitle>
              {headerVendor && (
                <div className="text-sm font-semibold text-indigo-700">{headerVendor}</div>
              )}
              <div className="font-mono text-[11px] text-gray-400">{tech}</div>
              <div className="flex gap-2 pt-1 flex-wrap items-center">
                {isScoped ? (
                  <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">
                    Sous-commande boutique
                  </Badge>
                ) : isMultiVendor ? (
                  <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">
                    Multi-boutiques
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

          {/* ─── Phase 2 : Strip de navigation vers les sœurs (uniquement quand scopé) ─── */}
          {isScoped && onVendorChange && (
            <RelatedSubOrdersStrip
              siblings={siblings}
              currentVendorId={vendorId!}
              onSelect={onVendorChange}
            />
          )}

          {/* ─── Phase B : Badges métier (boutique/produit supprimé, risque, attente) ─── */}
          {isScoped && (
            <div className="px-1">
              <SubOrderBadges history={subOrderHistory} />
            </div>
          )}

          {/* ─── Rentabilité & responsabilité Kawzone (scopé uniquement) ─── */}
          {isScoped && currentSub && (
            <SubOrderProfitabilityPanel sub={currentSub} articles={scopedArticles ?? []} />
          )}

          {/* ─── Phase B : Historique métier (Événement → Décision → Mouvement) ─── */}
          {isScoped && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowEventCapture(true)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1"
                >
                  + Enregistrer un événement
                </button>
              </div>
              <EventTimeline history={subOrderHistory} isLoading={subOrderHistoryLoading} />
            </div>
          )}
          {isScoped && vendorId && order.order_id && (
            <EventCaptureDialog
              open={showEventCapture}
              onClose={() => setShowEventCapture(false)}
              orderId={order.order_id}
              vendorId={vendorId}
              motherOrderIds={[order.order_id]}
            />
          )}


          {/* Agrégateur (debug) — sur les articles scopés. */}
          <AggregateDebugPanel articles={scopedArticles} orderStatus={status} />

          {/* Liste interne des sous-commandes — n'apparaît QUE si pas scopé et multi-vendor. */}
          {!isScoped && (
            <SubOrdersPanel
              articles={articles}
              orderStatus={status}
              motherOrderId={order.order_id ?? undefined}
              alwaysShow={isMultiVendor}
            />
          )}

          {/* Action suivante */}
          {nextActionInfo && (
            <NextActionBanner action={nextActionInfo} onClick={nextStep ? () => handleStatusAndClose(order.order_id ?? "", nextStep.status, adminName) : undefined} />
          )}

          {/* Workflow : 1 par boutique. Masqué uniquement quand multi-vendor SANS scope. */}
          {(isScoped || !isMultiVendor) && (
            <WorkflowControlPanel
              orderId={order.order_id ?? undefined}
              status={status}
              isImport={!!(isImportOrder || isImportFallback)}
              isLocal={!!isLocalOrder}
              articles={scopedArticles}
              onStatusChange={(newStatus) => handleStatusAndClose(order.order_id ?? "", newStatus, adminName)}
            />
          )}

          <PartialDeliveryBanner articles={scopedArticles} aggregate={agg} />

          <RestockWaitingPanel articles={scopedArticles} orderStatus={status} onResumeRestock={onResumeRestock} />



          {/* ─── Actions financières en attente (matrice v3 — lève les *_pending) ─── */}
          {scopedArticles && onSettleFinancial && (
            <div id="cockpit-financial-actions">
              <PendingFinancialActions
                articles={scopedArticles}
                remainingToPay={rem}
                onSettle={onSettleFinancial}
              />
            </div>
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
          {scopedArticles && scopedArticles.length > 0 && (
            <ArticlesPanel
              articles={scopedArticles}
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
            // Rupture non résolue → lecture agrégateur (source unique)
            if (agg.flags.has_blocking) {
              const n = agg.counters.blocked;
              alerts.push({ tone: "red", title: `${n} rupture${n > 1 ? "s" : ""} non résolue${n > 1 ? "s" : ""}`, text: "Contactez le client pour valider l'action." });
            }
            // Commande bloquée depuis X jours (dimension temporelle — pas encore dans agg)
            if (order.order_created_at && !["delivered", "cancelled"].includes(status)) {
              const days = Math.floor((Date.now() - new Date(order.order_created_at).getTime()) / 86400000);
              if (days >= 7) {
                alerts.push({ tone: days >= 14 ? "red" : "amber", title: `Commande bloquée depuis ${days} jours`, text: `Statut actuel : ${status}. Relancez le flux.` });
              }
            }
            // Livraison partielle en cours → lecture agrégateur
            const partialCount = (scopedArticles ?? []).filter(a => (a.delivered_qty ?? 0) > 0 && (a.delivered_qty ?? 0) < a.quantity).length;
            if (partialCount > 0) {
              alerts.push({ tone: "blue", title: "Livraison partielle en cours", text: `${partialCount} article(s) partiellement livré(s).` });
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