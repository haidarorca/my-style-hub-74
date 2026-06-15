// ═══════════════════════════════════════════════════════════════
// SubOrderCard — Carte sous-commande boutique (Phase 2).
// 1 carte = 1 boutique d'une commande mère = 1 dossier opérationnel.
// ═══════════════════════════════════════════════════════════════

import { Store, AlertTriangle, Wallet, CheckCircle2, Ban } from "lucide-react";
import { fmtF, fmtDateTime } from "@/cockpit/lib/workflow";
import { NEXT_ACTION_LABELS } from "@/cockpit/lib/order-aggregate";
import type { SubOrderRow } from "@/cockpit/hooks/useSubOrderRows";

interface Props {
  row: SubOrderRow;
  onClick: () => void;
}

export function SubOrderCard({ row, onClick }: Props) {
  const a = row.aggregate;
  const blocked = a.counters.blocked > 0;
  const money = a.pending_money.total_abs > 0;
  const ready = a.flags.can_ship_today;
  const done = a.flags.all_delivered;
  const vendorDeleted = row.vendor_id === "unknown";

  const tone =
    blocked ? "border-l-red-500 bg-red-50/40"
    : money ? "border-l-amber-500 bg-amber-50/40"
    : ready ? "border-l-emerald-500 bg-emerald-50/40"
    : done ? "border-l-gray-300 bg-gray-50/40"
    : "border-l-slate-300 bg-white";

  const kindLabel =
    row.kind === "local" ? "LOCAL"
    : row.kind === "import" ? "IMPORT"
    : "LOC+IMP";
  const kindClass =
    row.kind === "local" ? "bg-emerald-100 text-emerald-700"
    : row.kind === "import" ? "bg-indigo-100 text-indigo-700"
    : "bg-slate-100 text-slate-700";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-gray-100 border-l-4 hover:bg-gray-50 transition-colors ${tone}`}
    >
      <div className="flex items-start gap-2">
        <div className="shrink-0">
          <div className="font-mono text-[10px] font-bold text-gray-700">{row.label}</div>
          <div className="text-[8px] text-gray-400">{row.order.order_id?.slice(-4)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <Store className="h-3 w-3 text-gray-500 shrink-0" />
            <span className="text-xs font-bold truncate">{row.vendor_name}</span>
            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${kindClass}`}>{kindLabel}</span>
            {vendorDeleted && (
              <span className="text-[8px] uppercase font-bold bg-gray-700 text-white px-1 rounded inline-flex items-center gap-0.5">
                <Ban className="h-2.5 w-2.5" />supp.
              </span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 truncate">
            {row.order.customer_name ?? "—"} · {fmtDateTime(row.order.order_created_at)}
          </div>
          <div className="text-[10px] text-gray-600 italic mt-0.5 truncate">
            {NEXT_ACTION_LABELS[a.next_action]}
            {a.next_action_driver && ` — ${a.next_action_driver.product_name}`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold">{fmtF(row.financials.product_total)}</div>
          <div className="text-[9px] text-gray-500">{row.financials.article_count} art.</div>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            {blocked && (
              <span className="text-[9px] font-bold bg-red-600 text-white px-1 rounded inline-flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />{a.counters.blocked}
              </span>
            )}
            {money && (
              <span className="text-[9px] font-bold bg-amber-500 text-white px-1 rounded">€</span>
            )}
            {ready && !blocked && !money && (
              <span className="text-[9px] font-bold bg-emerald-600 text-white px-1 rounded inline-flex items-center gap-0.5">
                <CheckCircle2 className="h-2.5 w-2.5" />prêt
              </span>
            )}
          </div>
          {row.total > 1 && (
            <div className="text-[8px] text-indigo-600 font-bold mt-0.5">
              {row.index}/{row.total} boutiques
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
