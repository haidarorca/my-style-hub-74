// ═══════════════════════════════════════════════════════════════
// BulkReturnBar — Action groupée Retour / Annulation multi-articles.
// Affichée en bas du panneau articles quand on est en mode sélection.
// Création atomique d'un seul dossier contenant tous les articles
// sélectionnés (RPC `open_return_case_for_items`).
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { openReturnCaseForArticles, type ReturnKind } from "@/lib/returns.functions";
import { Undo2, XCircle, AlertTriangle, X } from "lucide-react";

type SelectedItem = { product_id: string; variant_id?: string | null };

interface Props {
  orderId: string;
  selected: SelectedItem[];
  onClose: () => void;
}

export function BulkReturnBar({ orderId, selected, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReturnKind>("return");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const createFn = useServerFn(openReturnCaseForArticles);

  const submit = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          order_id: orderId,
          kind,
          articles: selected.map((s) => ({ product_id: s.product_id, variant_id: s.variant_id ?? null })),
          reason_note: reason.trim() || null,
        },
      });
      navigate({ to: "/admin/returns/$caseId", params: { caseId: res.id } });
    } catch (e: any) {
      alert(e?.message ?? "Erreur");
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-10 mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 shadow-lg p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-bold text-amber-900 inline-flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" />
          {selected.length} article{selected.length > 1 ? "s" : ""} sélectionné{selected.length > 1 ? "s" : ""}
        </div>
        <button
          onClick={onClose}
          className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Quitter
        </button>
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          disabled={selected.length === 0}
          className="w-full px-3 py-2.5 rounded-lg bg-amber-600 text-white text-[12px] font-bold disabled:opacity-60 min-h-[40px]"
        >
          Créer un dossier groupé
        </button>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setKind("return")}
              className={`px-2 py-2 rounded border text-[12px] inline-flex items-center justify-center gap-1 ${
                kind === "return" ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200"
              }`}
            >
              <Undo2 className="h-3.5 w-3.5" /> Retour
            </button>
            <button
              onClick={() => setKind("cancellation")}
              className={`px-2 py-2 rounded border text-[12px] inline-flex items-center justify-center gap-1 ${
                kind === "cancellation" ? "bg-rose-600 text-white border-rose-600" : "bg-white border-slate-200"
              }`}
            >
              <XCircle className="h-3.5 w-3.5" /> Annulation
            </button>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Motif commun à tous les articles (optionnel)"
            className="w-full px-2 py-1.5 border rounded text-[12px]"
          />
          <button
            onClick={submit}
            disabled={busy}
            className="w-full px-3 py-2 rounded bg-amber-600 text-white text-[12px] font-semibold disabled:opacity-60 min-h-[40px]"
          >
            {busy ? "Création…" : `Créer le dossier (${selected.length} article${selected.length > 1 ? "s" : ""})`}
          </button>
        </div>
      )}
    </div>
  );
}
