// ═══════════════════════════════════════════════════════════════
// ReturnArticleAction — Action 1-clic Retour / Annulation par article
//
// Affichée sous chaque carte article. Le dossier est créé pour CE
// seul article : pas de re-sélection, pas de risque d'erreur.
// La création est atomique côté serveur (RPC).
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { openReturnCaseForArticle, type ReturnKind } from "@/lib/returns.functions";
import { Undo2, XCircle, AlertTriangle } from "lucide-react";

export function ReturnArticleAction({
  orderId,
  productId,
  variantId,
}: {
  orderId: string;
  productId: string;
  variantId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReturnKind>("return");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const createFn = useServerFn(openReturnCaseForArticle);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          order_id: orderId,
          product_id: productId,
          variant_id: variantId ?? null,
          kind,
          reason_note: reason.trim() || null,
        },
      });
      navigate({ to: "/admin/returns/$caseId", params: { caseId: res.id } });
    } catch (e: any) {
      alert(e?.message ?? "Erreur");
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[12px] font-semibold hover:bg-amber-100 min-h-[40px]"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Retour / Annulation
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-amber-900">Nouveau dossier (cet article)</div>
        <button onClick={() => setOpen(false)} className="text-[11px] text-slate-500 hover:text-slate-800">
          Annuler
        </button>
      </div>
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
        placeholder="Motif (optionnel)"
        className="w-full px-2 py-1.5 border rounded text-[12px]"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="w-full px-3 py-2 rounded bg-amber-600 text-white text-[12px] font-semibold disabled:opacity-60 min-h-[40px]"
      >
        {busy ? "Création…" : "Créer le dossier"}
      </button>
    </div>
  );
}

// Compat : ancien export, désormais inutilisé au niveau commande.
export const OpenReturnCaseButton = () => null;
