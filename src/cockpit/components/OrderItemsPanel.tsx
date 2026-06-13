import { useState, useEffect } from "react";
import { X, Package, Store, User, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { getOrderItems } from "@/lib/cockpit-payments.functions";
import { fmtF } from "@/cockpit/lib/workflow";
import type { OrderItemDetail, OrderItemsResult } from "@/lib/cockpit-payments.functions";

interface Props {
  orderId: string;
  onClose: () => void;
}

export function OrderItemsPanel({ orderId, onClose }: Props) {
  const [data, setData] = useState<OrderItemsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emptyMsg, setEmptyMsg] = useState("");
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Aucune commande sélectionnée.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setEmptyMsg("");
    getOrderItems({ data: { order_id: orderId } })
      .then((result: any) => {
        console.log("[OrderItemsPanel] result:", result);
        if (result?.error) {
          setError("Erreur base de données : " + result.error);
        } else if (!result || !result.items || result.items.length === 0) {
          setEmptyMsg("Cette commande ne contient aucun article enregistré.");
          setData({ items: [], order_total: 0, vendor_summary: [] });
        } else {
          setData(result as OrderItemsResult);
        }
      })
      .catch((err) => {
        console.error("[OrderItemsPanel] Erreur:", err);
        setError("Impossible de charger les articles : " + (err?.message || "erreur inconnue"));
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-600" />
            <h3 className="text-base font-bold">Articles de la commande</h3>
            {data && <span className="text-xs text-gray-500">({data.items.length})</span>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Chargement...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {emptyMsg && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg p-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {emptyMsg}
            </div>
          )}

          {data && (
            <>
              {/* ─── Résumé vendeurs ─── */}
              {data.vendor_summary.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source des articles</h4>
                  {data.vendor_summary.map(v => (
                    <div key={v.vendor_id} className={`rounded-lg border p-3 ${v.is_admin ? "bg-purple-50 border-purple-200" : "bg-gray-50 border-gray-200"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {v.is_admin ? <Store className="h-4 w-4 text-purple-600" /> : <User className="h-4 w-4 text-blue-600" />}
                          <div>
                            <div className="text-sm font-semibold">{v.shop_name || v.vendor_name}</div>
                            <div className="text-[10px] text-gray-500">
                              {v.is_admin ? "Boutique Admin" : `Vendeur • ${v.item_count} article${v.item_count > 1 ? "s" : ""}`}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{fmtF(v.total)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ─── Liste des articles ─── */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Détail des articles</h4>
                {data.items.map((item, idx) => (
                  <OrderItemRow key={`${item.product_id}-${idx}`} item={item} />
                ))}
              </div>

              {/* ─── Total ─── */}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Total articles</span>
                  <span className="text-lg font-bold">{fmtF(data.order_total)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-3 shrink-0">
          <button onClick={onClose} className="w-full h-11 bg-orange-600 text-white rounded-lg font-medium text-sm hover:bg-orange-700">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderItemRow({ item }: { item: OrderItemDetail }) {
  return (
    <div className="flex items-start gap-3 bg-white border rounded-lg p-3">
      {/* Image */}
      <div className="shrink-0 w-14 h-14 bg-gray-100 rounded-lg overflow-hidden">
        {item.product_image ? (
          <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <Package className="h-6 w-6" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.product_name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-gray-500">Qty: <b>{item.quantity}</b></span>
          <span className="text-[10px] text-gray-400">×</span>
          <span className="text-[10px] text-gray-500">{fmtF(item.unit_price)}</span>
        </div>
        {item.vendor_name && (
          <div className="flex items-center gap-1 mt-0.5">
            {item.is_admin_shop ? (
              <Store className="h-3 w-3 text-purple-500" />
            ) : (
              <User className="h-3 w-3 text-blue-500" />
            )}
            <span className={`text-[10px] ${item.is_admin_shop ? "text-purple-600" : "text-blue-600"}`}>
              {item.shop_name || item.vendor_name}
            </span>
          </div>
        )}
        {item.commission_rate && (
          <div className="text-[10px] text-orange-500 mt-0.5">Commission: {item.commission_rate}%</div>
        )}
      </div>

      {/* Total ligne */}
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold">{fmtF(item.line_total)}</div>
      </div>
    </div>
  );
}
