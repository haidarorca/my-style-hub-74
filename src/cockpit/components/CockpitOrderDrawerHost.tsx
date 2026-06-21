// ═══════════════════════════════════════════════════════════════
// CockpitOrderDrawerHost — Wiring partagé du OrderDrawer Cockpit.
//
// Réutilisé par :
//   - src/cockpit/pages/Dashboard.tsx       (Cockpit historique)
//   - src/routes/admin.commandes.tsx        (Vue Commandes globale)
//
// Une seule source de vérité pour : handlers de statut/paiement/pesée,
// états par article, assessment scopé, historique métier, dialogs internes.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState } from "react";
import type { LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import { OrderDrawer } from "./OrderDrawer";
import { CancelDialog } from "./CancelDialog";
import { CloseConfirmDialog } from "./CloseConfirmDialog";
import { OrderItemsPanel } from "./OrderItemsPanel";
import { useArticleStates } from "@/cockpit/hooks/useArticleStates";
import { useSubAssessments } from "@/cockpit/hooks/useSubAssessments";
import { useSubOrderHistories, getHistory } from "@/cockpit/hooks/useSubOrderHistories";
import { getOrderNumber } from "@/cockpit/lib/orderNumbers";
import type { ArticleStatus, StockBreakAction, StockBreakDecision, Settlement } from "@/cockpit/lib/article-states";
import type { useRealOrders } from "@/cockpit/hooks/useRealOrders";

type RealOrders = ReturnType<typeof useRealOrders>;

interface Props {
  realOrders: RealOrders;
  selectedOrder: LogisticsOrderRow | null;
  selectedSubKey: string | undefined;
  onSubOrderChange: (key: string | undefined) => void;
  onClose: () => void;
  adminName: string;
}

export function CockpitOrderDrawerHost({
  realOrders, selectedOrder, selectedSubKey, onSubOrderChange, onClose, adminName,
}: Props) {
  const {
    orders, getPayments, getTotalPaid, getAudit, addPayment, editPayment, deletePayment,
    getWeighings, addWeighing, updateStatus, cancelOrder, getOrderFinancials, getSubOrderStatus,
  } = realOrders;

  const [showCancel, setShowCancel] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showItemsPanel, setShowItemsPanel] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Articles scopés à la commande sélectionnée.
  const articlesHook = useArticleStates(
    selectedOrder?.order_id ?? null,
    selectedOrder?.logistics_status ?? undefined,
  );
  const selectedArticles = selectedOrder ? articlesHook.articles : undefined;

  // Assessment + historique scopés à l'ordre sélectionné uniquement.
  const focusedIds = useMemo(
    () => (selectedOrder?.order_id ? [selectedOrder.order_id] : []),
    [selectedOrder?.order_id],
  );
  const { getAssessment } = useSubAssessments(focusedIds);
  const { data: historyMap, isLoading: historyLoading } = useSubOrderHistories(focusedIds);

  // ── Handlers articles (identiques à Dashboard) ──
  const handleStockBreak = useCallback((productId: string, data: { reason: string; action: StockBreakAction }) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art) return;
    const last_valid_status = art.status !== "no_stock" ? art.status : art.stock_break?.last_valid_status;
    const decision: StockBreakDecision = {
      reason: data.reason, action: data.action, action_label: data.action,
      resolved: true, created_at: new Date().toISOString(), last_valid_status,
    };
    void articlesHook.mutate({
      product_id: productId, variant_id: art.variant_id,
      patch: { status: "no_stock", stock_break: decision },
      audit_action: `stock_break.${data.action}`, expected_version: art.version,
    });
  }, [selectedArticles, articlesHook]);

  const handleResumeRestock = useCallback((productId: string) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art || !art.stock_break || art.stock_break.action !== "wait_restock") return;
    const memorized = art.stock_break.last_valid_status;
    const fallback: ArticleStatus = art.is_import ? "received" : "available";
    const target: ArticleStatus = memorized ?? fallback;
    const newSb: StockBreakDecision = {
      ...art.stock_break,
      resumed_at: new Date().toISOString(),
      resumed_by: adminName,
    };
    void articlesHook.mutate({
      product_id: productId, variant_id: art.variant_id,
      patch: { status: target, stock_break: newSb },
      audit_action: "stock_break.resume_restock", expected_version: art.version,
    });
  }, [selectedArticles, articlesHook, adminName]);

  const handleArticleStatusChange = useCallback((productId: string, status: ArticleStatus) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art) return;
    void articlesHook.mutate({
      product_id: productId, variant_id: art.variant_id,
      patch: { status },
      audit_action: `status.${status}`, expected_version: art.version,
    });
  }, [selectedArticles, articlesHook]);

  const handlePartialDeliver = useCallback((productId: string, qty: number) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art) return;
    const newDelivered = (art.delivered_qty ?? 0) + qty;
    const fullyDelivered = newDelivered >= art.quantity;
    void articlesHook.mutate({
      product_id: productId, variant_id: art.variant_id,
      patch: { delivered_qty: newDelivered, status: fullyDelivered ? "delivered" : art.status },
      audit_action: "partial_deliver", expected_version: art.version,
    });
  }, [selectedArticles, articlesHook]);

  const handleSettleFinancial = useCallback((productId: string, data: { type: Settlement["type"]; amount: number; cost_attribution: Settlement["cost_attribution"]; method?: string; reference?: string; note?: string; shared_split?: Settlement["shared_split"] }) => {
    const art = selectedArticles?.find(a => a.product_id === productId);
    if (!art) return;
    const settlement: Settlement = {
      type: data.type, amount: data.amount,
      cost_attribution: data.cost_attribution, shared_split: data.shared_split,
      method: data.method, reference: data.reference, note: data.note,
      processed_at: new Date().toISOString(), processed_by: adminName,
    };
    void articlesHook.mutate({
      product_id: productId, variant_id: art.variant_id,
      patch: { settlement },
      audit_action: `settlement.${data.type}`, expected_version: art.version,
    });
  }, [selectedArticles, articlesHook, adminName]);

  // ── Données dérivées du drawer ──
  const selectedIndex = useMemo(
    () => selectedOrder ? orders.findIndex(o => o.order_id === selectedOrder.order_id) : 0,
    [selectedOrder, orders],
  );
  const selPayments = selectedOrder ? getPayments(selectedOrder.order_id ?? "") : [];
  const selAudit = selectedOrder ? getAudit(selectedOrder.order_id ?? "") : [];
  const selWeighings = selectedOrder ? getWeighings(selectedOrder.order_id ?? "") : [];
  const selTotalPaid = selectedOrder ? getTotalPaid(selectedOrder.order_id ?? "") : 0;
  const selFinancials = selectedOrder
    ? getOrderFinancials(selectedOrder)
    : { productTotal: 0, freight: 0, grandTotal: 0, paid: 0, remaining: 0 };

  // ── Handlers exposés au drawer ──
  const handleStatus = (orderId: string, status: string, _admin: string, subOrderKey?: string | null) => {
    updateStatus(orderId, status, _admin || adminName, subOrderKey ?? null);
    setHasChanges(false);
  };
  const handlePayment = (orderId: string, amount: number, method: string, reference: string, _admin: string) => {
    addPayment(orderId, amount, method, reference, _admin || adminName);
    setHasChanges(false);
  };
  const handleWeigh = (record: Parameters<typeof addWeighing>[0]) => {
    addWeighing(record); setHasChanges(false);
  };

  const doCancel = useCallback((reason: string, refundType: string) => {
    if (!selectedOrder) return;
    cancelOrder(selectedOrder.order_id ?? "", reason, refundType as any, adminName);
    setShowCancel(false);
    onSubOrderChange(undefined);
    onClose();
  }, [selectedOrder, cancelOrder, adminName, onClose, onSubOrderChange]);

  const handleCloseDrawer = useCallback(() => {
    setShowItemsPanel(false);
    if (hasChanges) setShowCloseConfirm(true);
    else { onSubOrderChange(undefined); onClose(); }
  }, [hasChanges, onClose, onSubOrderChange]);

  const confirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    setHasChanges(false);
    onSubOrderChange(undefined);
    onClose();
  }, [onClose, onSubOrderChange]);

  if (!selectedOrder) return null;

  const subAss = selectedSubKey && selectedOrder.order_id
    ? getAssessment(selectedOrder.order_id, selectedSubKey)
    : null;
  const effectiveSubStatus = selectedSubKey && selectedOrder.order_id
    ? (getSubOrderStatus(selectedOrder.order_id, selectedSubKey, selectedOrder.logistics_status ?? null) ?? selectedOrder.logistics_status ?? "new")
    : null;
  const subVendorId = selectedSubKey ? selectedSubKey.split("::")[0] : null;

  return (
    <OrderDrawer
      order={selectedOrder}
      orderIndex={selectedIndex}
      payments={selPayments}
      audit={selAudit}
      weighings={selWeighings}
      financials={selFinancials}
      onClose={handleCloseDrawer}
      onPayment={handlePayment}
      onEditPayment={editPayment}
      onDeletePayment={deletePayment}
      onWeigh={handleWeigh}
      onStatusChange={handleStatus}
      onRequestCancel={() => setShowCancel(true)}
      onViewItems={() => setShowItemsPanel(true)}
      onFormInteraction={() => setHasChanges(true)}
      articles={selectedArticles}
      onStockBreak={handleStockBreak}
      onArticleStatusChange={handleArticleStatusChange}
      onPartialDeliver={handlePartialDeliver}
      onSettleFinancial={handleSettleFinancial}
      onResumeRestock={handleResumeRestock}
      subOrderKey={selectedSubKey}
      onSubOrderChange={(k) => onSubOrderChange(k)}
      subAssessment={subAss ? { id: subAss.id, air_freight_fee: subAss.air_freight_fee, status: subAss.status, shipping_service_id: subAss.shipping_service_id } : null}
      effectiveSubStatus={effectiveSubStatus}
      subOrderHistory={getHistory(historyMap, selectedOrder.order_id ?? "", subVendorId)}
      subOrderHistoryLoading={historyLoading}
      dialogs={
        <>
          {showItemsPanel && (
            <OrderItemsPanel orderId={selectedOrder.order_id ?? ""} onClose={() => setShowItemsPanel(false)} />
          )}
          <CancelDialog
            open={showCancel}
            onClose={() => setShowCancel(false)}
            onConfirm={doCancel}
            paidAmount={selTotalPaid}
            status={selectedOrder.logistics_status ?? "new"}
            kzNumber={getOrderNumber(selectedOrder.order_id ?? "")}
          />
          <CloseConfirmDialog
            open={showCloseConfirm}
            onStay={() => setShowCloseConfirm(false)}
            onLeave={confirmClose}
          />
        </>
      }
    />
  );
}
