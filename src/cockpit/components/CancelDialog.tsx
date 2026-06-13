import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkCanCancel, REFUND_LABELS, fmtF } from "@/cockpit/lib/workflow";
import type { RefundType } from "@/cockpit/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, refundType: RefundType) => void;
  paidAmount: number;
  status: string;
  kzNumber: string;
}

export function CancelDialog({ open, onClose, onConfirm, paidAmount, status, kzNumber }: Props) {
  const [reason, setReason] = useState("");
  const [refundType, setRefundType] = useState<RefundType>("no_refund");

  // Réinitialiser les champs quand le dialog s'ouvre
  useEffect(() => {
    if (open) {
      setReason("");
      setRefundType("no_refund");
    }
  }, [open]);

  if (!open) return null;
  const check = checkCanCancel(status, paidAmount);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ isolation: "isolate" }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl mx-4 w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <h3 className="text-lg font-bold">Annuler {kzNumber}</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded-full hover:bg-gray-100"><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="px-5 pb-4 space-y-3">
          {!check.canCancel ? (
            <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">{check.reason}</div>
          ) : (
            <>
              {check.warnings.map((w, i) => <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded p-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{w}</div>)}
              {check.paidAmount > 0 && <div className="text-sm"><span className="text-gray-500">Payé: </span><span className="font-bold">{fmtF(check.paidAmount)}</span></div>}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Motif d'annulation *</label>
                <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: Client a annulé..." className="h-10 text-sm" autoFocus />
              </div>
              {check.refundOptions.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Remboursement</label>
                  <div className="grid grid-cols-2 gap-2">
                    {check.refundOptions.map(opt => (
                      <button key={opt} onClick={() => setRefundType(opt)} className={`text-xs py-2 px-2 rounded-lg border text-center transition-colors ${refundType === opt ? "bg-orange-100 border-orange-300 text-orange-800 font-semibold" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
                        {REFUND_LABELS[opt]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t flex gap-3">
          <Button variant="outline" className="flex-1 h-11 text-sm" onClick={onClose}>Retour</Button>
          {check.canCancel && (
            <Button
              variant="destructive"
              className="flex-1 h-11 text-sm"
              onClick={() => {
                if (!reason.trim()) {
                  alert("Veuillez saisir un motif d'annulation.");
                  return;
                }
                onConfirm(reason, refundType);
              }}
            >
              Confirmer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
