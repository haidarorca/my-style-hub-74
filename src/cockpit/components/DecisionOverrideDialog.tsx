import { useState } from "react";
import { X, ShieldAlert, ArrowRight } from "lucide-react";
import { STOCK_BREAK_ACTIONS, getReplaceImpact } from "@/cockpit/lib/article-states";
import type { OrderArticle, StockBreakAction } from "@/cockpit/lib/article-states";
import type { StockBreakSubmit } from "./StockBreakDialog";

/* ═══════════════════════════════════════════════════════════════
   DecisionOverrideDialog — écran de confirmation Super Admin
   Affiche AVANT / APRÈS et exige un motif. Aucune modification
   silencieuse n'est possible.
   ═══════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean;
  article: OrderArticle | null;
  newDecision: StockBreakSubmit | null;
  adminName: string;
  onClose: () => void;
  onConfirm: (overrideReason: string) => void;
}

const actionLabel = (a: StockBreakAction) =>
  STOCK_BREAK_ACTIONS.find(x => x.key === a)?.label ?? a;

function decisionLine(decision: { action: StockBreakAction; diff_handling?: string; replacement?: { product_name: string; new_unit_price: number } }, article: OrderArticle) {
  const lines: { k: string; v: string }[] = [{ k: "Action", v: actionLabel(decision.action) }];
  if (decision.action === "replace" && decision.replacement) {
    lines.push({ k: "Remplacement", v: `${decision.replacement.product_name} @ ${decision.replacement.new_unit_price.toLocaleString("fr-FR")} FCFA` });
    const fakeArt: OrderArticle = { ...article, stock_break: { ...(article.stock_break ?? { reason: "", action: "replace", action_label: "", resolved: true, created_at: "" }), action: "replace", replacement: decision.replacement } };
    const imp = getReplaceImpact(fakeArt);
    if (imp) lines.push({ k: "Impact", v: `${imp.delta >= 0 ? "+" : ""}${imp.delta.toLocaleString("fr-FR")} FCFA` });
  }
  if (decision.diff_handling) lines.push({ k: "Traitement diff.", v: decision.diff_handling });
  return lines;
}

export function DecisionOverrideDialog({ open, article, newDecision, adminName, onClose, onConfirm }: Props) {
  const [overrideReason, setOverrideReason] = useState("");
  if (!open || !article || !newDecision) return null;

  const oldSb = article.stock_break!;
  const oldLines = decisionLine({ action: oldSb.action, diff_handling: oldSb.diff_handling, replacement: oldSb.replacement }, article);
  const newLines = decisionLine(newDecision, article);

  return (
    <div className="absolute inset-0 z-[90] bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 sticky top-0 bg-white">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <h3 className="text-sm font-bold">Modification d'une décision validée</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 -mr-2">
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4 pb-24">
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-[12px] text-amber-900">
          ⚠ Vous modifiez une décision déjà validée. Chaque modification est tracée dans l'historique d'audit avec votre nom et la date.
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold text-gray-500 mb-1">Article</div>
          <div className="text-sm font-bold">{article.product_name}</div>
          {article.variant_label && <div className="text-xs text-gray-500">{article.variant_label}</div>}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
          <div className="bg-gray-50 border rounded-xl p-3 space-y-1">
            <div className="text-[10px] font-bold text-gray-500 uppercase">Avant</div>
            {oldLines.map(l => (
              <div key={l.k} className="text-[11px]"><span className="text-gray-500">{l.k} :</span> <strong>{l.v}</strong></div>
            ))}
            <div className="text-[10px] text-gray-400 italic pt-1">Motif : {oldSb.reason}</div>
          </div>
          <div className="flex items-center"><ArrowRight className="h-5 w-5 text-amber-500" /></div>
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-1">
            <div className="text-[10px] font-bold text-violet-700 uppercase">Après</div>
            {newLines.map(l => (
              <div key={l.k} className="text-[11px]"><span className="text-gray-500">{l.k} :</span> <strong>{l.v}</strong></div>
            ))}
            <div className="text-[10px] text-gray-400 italic pt-1">Motif : {newDecision.reason}</div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 text-[11px] text-gray-600 space-y-0.5">
          <div>Responsable : <strong>{adminName}</strong></div>
          <div>Date : <strong>{new Date().toLocaleString("fr-FR")}</strong></div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1.5">Motif de la modification *</label>
          <textarea
            value={overrideReason}
            onChange={e => setOverrideReason(e.target.value)}
            placeholder="Pourquoi modifier cette décision ?"
            className="w-full border rounded-xl p-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>
      </div>

      <div className="border-t p-4 shrink-0 space-y-2 sticky bottom-0 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => overrideReason.trim() && onConfirm(overrideReason.trim())}
          disabled={!overrideReason.trim()}
          className="w-full h-12 bg-amber-600 text-white rounded-xl font-semibold text-sm hover:bg-amber-700 disabled:opacity-40"
        >
          Confirmer la modification
        </button>
        <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
          Annuler
        </button>
      </div>
    </div>
  );
}
