import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { STOCK_BREAK_ACTIONS } from "@/cockpit/lib/article-states";
import type { StockBreakAction } from "@/cockpit/lib/article-states";

interface Props {
  open: boolean;
  productName: string;
  variantLabel: string | null;
  onClose: () => void;
  onConfirm: (data: { reason: string; action: StockBreakAction }) => void;
}

export function StockBreakDialog({ open, productName, variantLabel, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<StockBreakAction>("wait_restock");

  if (!open) return null;

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm({ reason: reason.trim(), action });
    setReason("");
    setAction("wait_restock");
  };

  return (
    <div className="absolute inset-0 z-[80] bg-white flex flex-col animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h3 className="text-sm font-bold">Rupture de stock</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        {/* Produit concerné */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="text-[10px] text-red-500 font-semibold uppercase">Produit concerné</div>
          <div className="text-sm font-bold text-gray-900 mt-0.5">{productName}</div>
          {variantLabel && <div className="text-xs text-gray-500">{variantLabel}</div>}
        </div>

        {/* Motif */}
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1.5">Motif de la rupture *</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ex: Fournisseur en rupture, délai inconnu..."
            className="w-full border rounded-xl p-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
          />
        </div>

        {/* Action proposée */}
        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1.5">Action proposée au client *</label>
          <div className="space-y-1.5">
            {STOCK_BREAK_ACTIONS.map(a => (
              <button
                key={a.key}
                onClick={() => setAction(a.key)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                  action === a.key
                    ? "border-orange-500 bg-orange-50 text-orange-700 font-semibold"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-4 shrink-0 space-y-2">
        <button
          onClick={handleConfirm}
          disabled={!reason.trim()}
          className="w-full h-12 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirmer la rupture
        </button>
        <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
          Annuler
        </button>
      </div>
    </div>
  );
}
