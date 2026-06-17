import { useState, useMemo, useRef, useEffect } from "react";
import { X, AlertTriangle, RefreshCw, Wallet, Repeat, Clock, PackageMinus, Check, ArrowLeft } from "lucide-react";
import { STOCK_BREAK_ACTIONS, getReplaceVariant } from "@/cockpit/lib/article-states";
import type { StockBreakAction } from "@/cockpit/lib/article-states";

/* ═══════════════════════════════════════════════════════════════
   StockBreakDialog v3 — décision de rupture avec sous-flux replace
   ═══════════════════════════════════════════════════════════════ */

export interface StockBreakSubmit {
  reason: string;
  action: StockBreakAction;
  replacement?: { product_name: string; new_unit_price: number };
  diff_handling?: "extra_payment" | "refund" | "credit";
}

interface Props {
  open: boolean;
  productName: string;
  variantLabel: string | null;
  /** Prix unitaire original (sert au calcul d'impact pour replace). */
  unitPrice?: number;
  quantity?: number;
  /** Montant déjà payé sur la commande. Si 0, on ne propose pas Rembourser/Créditer. */
  paidAmount?: number;
  /** Préselection pour mode override Super Admin. */
  initialReason?: string;
  initialAction?: StockBreakAction;
  onClose: () => void;
  onConfirm: (data: StockBreakSubmit) => void;
}

const ACTION_ICONS: Record<StockBreakAction, React.ElementType> = {
  // legacy (toujours affichés pendant la transition)
  refund: Wallet,
  credit: RefreshCw,
  replace: Repeat,
  wait_restock: Clock,
  partial_ship: PackageMinus,
  // canoniques (icônes provisoires, le dialog sera refondu au Commit 2)
  cancel: PackageMinus,
  replace_same: Repeat,
  replace_higher: Repeat,
  replace_lower: Repeat,
  partial_delivery: PackageMinus,
};

export function StockBreakDialog({
  open, productName, variantLabel, unitPrice = 0, quantity = 1, paidAmount = 0,
  initialReason, initialAction, onClose, onConfirm,
}: Props) {
  const availableActions = useMemo(() => {
    if (paidAmount <= 0) return STOCK_BREAK_ACTIONS.filter(a => a.key !== "refund" && a.key !== "credit");
    return STOCK_BREAK_ACTIONS;
  }, [paidAmount]);

  const [reason, setReason] = useState(initialReason ?? "");
  const [action, setAction] = useState<StockBreakAction>(initialAction ?? availableActions[0]?.key ?? "wait_restock");
  // Sous-écran replace
  const [step, setStep] = useState<"choose" | "replace">("choose");
  const [replaceName, setReplaceName] = useState("");
  const [replacePrice, setReplacePrice] = useState<string>(String(unitPrice));
  const [diffHandling, setDiffHandling] = useState<"refund" | "credit">("refund");

  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!open || step !== "choose") return;
    const el = actionRefs.current[action];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [action, open, step]);

  if (!open) return null;

  const newPriceNum = parseFloat(replacePrice) || 0;
  const variant = getReplaceVariant(unitPrice, newPriceNum);
  const delta = (newPriceNum - unitPrice) * quantity;
  const replaceReady = replaceName.trim().length > 0 && newPriceNum > 0;

  const handleConfirm = () => {
    if (!reason.trim()) return;
    if (action === "replace") {
      if (step === "choose") { setStep("replace"); return; }
      if (!replaceReady) return;
      const submit: StockBreakSubmit = {
        reason: reason.trim(),
        action: "replace",
        replacement: { product_name: replaceName.trim(), new_unit_price: newPriceNum },
      };
      if (variant === "replace_higher") submit.diff_handling = "extra_payment";
      else if (variant === "replace_lower") submit.diff_handling = diffHandling;
      onConfirm(submit);
      return;
    }
    onConfirm({ reason: reason.trim(), action });
  };

  return (
    <div className="absolute inset-0 z-[80] bg-white flex flex-col animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2">
          {step === "replace" ? (
            <button onClick={() => setStep("choose")} className="p-1 -ml-1 rounded-full hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-500" />
          )}
          <h3 className="text-sm font-bold">{step === "replace" ? "Produit de remplacement" : "Rupture de stock"}</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 -mr-2">
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4 pb-24">
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="text-[10px] text-red-500 font-semibold uppercase">Produit concerné</div>
          <div className="text-sm font-bold text-gray-900 mt-0.5">{productName}</div>
          {variantLabel && <div className="text-xs text-gray-500">{variantLabel}</div>}
          {unitPrice > 0 && (
            <div className="text-[11px] text-gray-500 mt-1">
              {quantity} × {unitPrice.toLocaleString("fr-FR")} FCFA = {(unitPrice * quantity).toLocaleString("fr-FR")} FCFA
            </div>
          )}
        </div>

        {step === "choose" && (
          <>
            {paidAmount <= 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-700">
                Aucun paiement enregistré : remboursement et crédit non proposés.
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1.5">Motif de la rupture *</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ex: Fournisseur en rupture, délai inconnu..."
                className="w-full border rounded-xl p-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-2">Action proposée au client *</label>
              <div className="space-y-2">
                {availableActions.map(a => {
                  const Icon = ACTION_ICONS[a.key];
                  const selected = action === a.key;
                  return (
                    <button
                      key={a.key}
                      ref={el => { actionRefs.current[a.key] = el; }}
                      onClick={() => setAction(a.key)}
                      aria-pressed={selected}
                      className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-xl border-2 text-sm transition-all ${
                        selected
                          ? "border-orange-500 bg-orange-50 text-orange-800 font-bold shadow-[0_0_0_3px_rgba(249,115,22,0.15)]"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <span className={`shrink-0 h-9 w-9 grid place-items-center rounded-full ${selected ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 min-w-0">{a.label}</span>
                      {selected && (
                        <span className="shrink-0 h-6 w-6 grid place-items-center rounded-full bg-orange-500 text-white">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {step === "replace" && (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1.5">Nom du produit de remplacement *</label>
              <input
                value={replaceName}
                onChange={e => setReplaceName(e.target.value)}
                placeholder="Ex: Chemise bleue M"
                className="w-full h-11 border rounded-xl px-3 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1.5">Nouveau prix unitaire (FCFA) *</label>
              <input
                type="number"
                inputMode="numeric"
                value={replacePrice}
                onChange={e => setReplacePrice(e.target.value)}
                className="w-full h-11 border rounded-xl px-3 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
              />
            </div>

            {replaceReady && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-1.5 text-[12px]">
                <div className="font-bold text-violet-900 uppercase text-[10px]">Impact financier</div>
                <div className="flex justify-between"><span className="text-gray-600">Article original</span><span>{(unitPrice * quantity).toLocaleString("fr-FR")} FCFA</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Article remplaçant</span><span>{(newPriceNum * quantity).toLocaleString("fr-FR")} FCFA</span></div>
                <div className="flex justify-between font-bold pt-1 border-t border-violet-200">
                  <span>Variation</span>
                  <span className={variant === "replace_higher" ? "text-red-700" : variant === "replace_lower" ? "text-emerald-700" : "text-gray-700"}>
                    {variant === "replace_higher" ? "+" : ""}{delta.toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
                {variant === "replace_higher" && (
                  <div className="bg-amber-100 border border-amber-300 rounded-lg p-2 mt-2 text-amber-800">
                    ⚠ Complément à encaisser : <strong>{delta.toLocaleString("fr-FR")} FCFA</strong>
                  </div>
                )}
                {variant === "replace_lower" && (
                  <div className="mt-2 space-y-2">
                    <div className="text-gray-700 font-medium">Comment traiter la différence ({Math.abs(delta).toLocaleString("fr-FR")} FCFA) ?</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setDiffHandling("refund")}
                        className={`px-3 py-2.5 rounded-lg border-2 text-xs font-semibold ${diffHandling === "refund" ? "border-rose-500 bg-rose-50 text-rose-800" : "border-gray-200 bg-white text-gray-600"}`}
                      >💸 À rembourser</button>
                      <button
                        onClick={() => setDiffHandling("credit")}
                        className={`px-3 py-2.5 rounded-lg border-2 text-xs font-semibold ${diffHandling === "credit" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-gray-200 bg-white text-gray-600"}`}
                      >🪙 À créditer</button>
                    </div>
                    <div className="text-[10px] text-gray-500 italic">Aucun mouvement automatique : un admin devra valider l'action.</div>
                  </div>
                )}
                {variant === "replace_same" && (
                  <div className="text-emerald-700 mt-1">Aucun ajustement financier requis.</div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t p-4 shrink-0 space-y-2 sticky bottom-0 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          onClick={handleConfirm}
          disabled={!reason.trim() || (step === "replace" && !replaceReady)}
          className="w-full h-12 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {action === "replace" && step === "choose" ? "Continuer →" : "Confirmer la rupture"}
        </button>
        <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
          Annuler
        </button>
      </div>
    </div>
  );
}
