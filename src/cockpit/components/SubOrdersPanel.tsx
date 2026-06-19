// ═══════════════════════════════════════════════════════════════
// SubOrdersPanel — Vue par sous-commande boutique (Phase 1.5).
//
// Devient l'unité principale d'affichage : une carte par vendeur,
// avec son workflow propre, ses compteurs propres, sa next_action.
// Le concept MIXTE disparaît au profit du libellé "KZ-XXX · i/N".
// ═══════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { Store, Package, AlertTriangle, Wallet, CheckCircle2, Layers, Ban } from "lucide-react";
import { deriveSubOrders } from "@/cockpit/lib/sub-orders";
import { fmtF } from "@/cockpit/lib/workflow";
import { NEXT_ACTION_LABELS } from "@/cockpit/lib/order-aggregate";
import type { OrderArticle } from "@/cockpit/lib/article-states";

interface Props {
  articles: OrderArticle[] | undefined | null;
  orderStatus?: string;
  motherOrderId?: string;
  /** Affiche le panel même quand il n'y a qu'une seule sub_order. */
  alwaysShow?: boolean;
  /** Quand l'utilisateur clique sur une sous-commande. */
  onSelectSubOrder?: (subOrderKey: string) => void;
}

export function SubOrdersPanel({ articles, orderStatus, motherOrderId, alwaysShow = false, onSelectSubOrder }: Props) {
  const subs = useMemo(
    () => deriveSubOrders(articles, orderStatus, motherOrderId),
    [articles, orderStatus, motherOrderId],
  );

  if (subs.length === 0) return null;
  if (!alwaysShow && subs.length === 1) return null;

  return (
    <div className="bg-white border-2 border-indigo-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Layers className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-bold text-indigo-900">
          {subs.length > 1
            ? `${subs.length} sous-commandes boutiques`
            : "Sous-commande boutique"}
        </h3>
      </div>
      {subs.length > 1 && (
        <p className="text-[10px] text-gray-500 leading-snug">
          Le client voit 1 commande. Opérationnellement : {subs.length} flux indépendants,
          chacun avec son propre workflow et ses propres actions.
        </p>
      )}

      <div className="space-y-2 pt-1">
        {subs.map((s) => {
          const a = s.aggregate;
          const blocked = a.counters.blocked > 0;
          const money = a.pending_money.total_abs > 0;
          const ready = a.flags.can_ship_today;
          const done = a.flags.all_delivered;
          const vendorDeleted = s.vendor_id === "unknown";

          const toneBorder =
            blocked ? "border-red-300 bg-red-50"
            : money ? "border-amber-300 bg-amber-50"
            : ready ? "border-emerald-300 bg-emerald-50"
            : done ? "border-gray-200 bg-gray-50"
            : "border-slate-200 bg-white";

          const kindLabel =
            s.kind === "local" ? "LOCAL"
            : s.kind === "import" ? "IMPORT"
            : "LOCAL + IMPORT";
          const kindClass =
            s.kind === "local" ? "bg-emerald-100 text-emerald-700"
            : s.kind === "import" ? "bg-indigo-100 text-indigo-700"
            : "bg-slate-100 text-slate-700";

          return (
            <div
              key={s.sub_order_key}
              className={`border rounded-lg p-2.5 ${toneBorder} ${onSelectSubOrder ? "cursor-pointer hover:shadow-sm transition-shadow" : ""}`}
              onClick={() => onSelectSubOrder?.(s.sub_order_key)}
            >
              {/* Header sub_order : KZ-XXX · i/N + nom boutique */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 min-w-0">
                  <Store className="h-3.5 w-3.5 text-gray-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] font-bold text-gray-500">{s.label}</div>
                    <div className="text-xs font-bold truncate flex items-center gap-1 flex-wrap">
                      <span className="truncate">{s.vendor_name}</span>
                      {vendorDeleted && (
                        <span className="text-[8px] uppercase font-bold bg-gray-700 text-white px-1 py-0.5 rounded inline-flex items-center gap-0.5">
                          <Ban className="h-2.5 w-2.5" />
                          Boutique supprimée
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${kindClass}`}>
                        {kindLabel}
                      </span>
                      <span>·</span>
                      <span>{s.financials.article_count} art.</span>
                      <span>·</span>
                      <span>{fmtF(s.financials.product_total)}</span>
                    </div>
                  </div>
                </div>
                {/* Pastille statut */}
                <div className="shrink-0">
                  {blocked ? (
                    <span className="text-[9px] font-bold uppercase bg-red-600 text-white px-1.5 py-0.5 rounded">
                      bloqué
                    </span>
                  ) : money ? (
                    <span className="text-[9px] font-bold uppercase bg-amber-500 text-white px-1.5 py-0.5 rounded">
                      à régler
                    </span>
                  ) : ready ? (
                    <span className="text-[9px] font-bold uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                      prêt
                    </span>
                  ) : done ? (
                    <span className="text-[9px] font-bold uppercase bg-gray-500 text-white px-1.5 py-0.5 rounded">
                      livré
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase bg-slate-400 text-white px-1.5 py-0.5 rounded">
                      en cours
                    </span>
                  )}
                </div>
              </div>

              {/* Compteurs */}
              <div className="grid grid-cols-4 gap-1 mt-2">
                <Mini icon={Package} value={s.financials.article_count} label="art." />
                {a.counters.blocked > 0 && (
                  <Mini icon={AlertTriangle} value={a.counters.blocked} label="bloqué" tone="red" />
                )}
                {a.pending_money.total_abs > 0 && (
                  <Mini icon={Wallet} value={fmtF(a.pending_money.total_abs)} label="à régler" tone="amber" />
                )}
                {a.counters.delivered > 0 && (
                  <Mini icon={CheckCircle2} value={a.counters.delivered} label="livré" tone="emerald" />
                )}
              </div>

              {/* Next action */}
              <div className="mt-2 text-[10px] text-gray-600 italic border-t border-current/10 pt-1.5">
                <span className="font-semibold not-italic text-gray-700">
                  Action :
                </span>{" "}
                {NEXT_ACTION_LABELS[a.next_action]}
                {a.next_action_driver && ` — ${a.next_action_driver.product_name}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Mini({
  icon: Icon, value, label, tone = "slate",
}: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  tone?: "slate" | "red" | "amber" | "emerald";
}) {
  const toneClass = {
    slate: "text-gray-700",
    red: "text-red-700",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
  }[tone];
  return (
    <div className={`text-[10px] ${toneClass} flex items-center gap-1`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="font-bold">{value}</span>
      <span className="text-gray-500 truncate">{label}</span>
    </div>
  );
}
