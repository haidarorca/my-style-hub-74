// ═══════════════════════════════════════════════════════════════
// AggregateDebugPanel — Première visualisation de aggregateOrder()
//
// ▸ Panneau lisible posé HAUT dans le drawer, qui montre exactement
//   ce que le futur moteur calcule à partir de la commande affichée.
// ▸ Aucune action : c'est une lecture pure du modèle.
// ▸ Sera progressivement absorbé par les vraies sections (ready / blocked /
//   waiting_*) du Cockpit une fois le modèle stabilisé.
// ═══════════════════════════════════════════════════════════════

import type { OrderArticle } from "@/cockpit/lib/article-states";
import {
  aggregateOrder, BUCKET_LABELS, BUCKET_COLORS, NEXT_ACTION_LABELS,
  type ArticleBucket,
} from "@/cockpit/lib/order-aggregate";
import { fmtF } from "@/cockpit/lib/workflow";
import { Sparkles } from "lucide-react";

interface Props {
  articles: OrderArticle[] | undefined | null;
  orderStatus?: string;
}

const BUCKET_ORDER: ArticleBucket[] = [
  "blocked", "waiting_money", "ready", "waiting_supplier",
  "waiting_restock", "in_progress", "delivered", "cancelled",
];

export function AggregateDebugPanel({ articles, orderStatus }: Props) {
  if (!articles || articles.length === 0) return null;
  const agg = aggregateOrder(articles, orderStatus);

  return (
    <div className="rounded-xl border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 to-violet-50 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
          aggregateOrder() v0.1
        </span>
        <span className="text-[9px] text-indigo-500 ml-auto">live preview</span>
      </div>

      {/* Action prioritaire calculée */}
      <div className="bg-white/70 rounded-lg p-2.5 border border-indigo-200">
        <div className="text-[9px] uppercase text-indigo-500 font-bold tracking-wider">
          Action prioritaire (next_action)
        </div>
        <div className="mt-0.5 text-sm font-bold text-indigo-900">
          {NEXT_ACTION_LABELS[agg.next_action]}
        </div>
        <div className="text-[11px] text-indigo-700">{agg.next_action_reason}</div>
      </div>

      {/* Compteurs par bucket */}
      <div className="grid grid-cols-2 gap-1.5">
        {BUCKET_ORDER.filter(b => agg.counters[b] > 0).map(b => (
          <div
            key={b}
            className={`rounded-md px-2 py-1.5 border text-[11px] flex items-center justify-between ${BUCKET_COLORS[b]}`}
          >
            <span className="font-medium truncate">{BUCKET_LABELS[b]}</span>
            <span className="font-bold tabular-nums">{agg.counters[b]}</span>
          </div>
        ))}
      </div>

      {/* Argent en attente */}
      {agg.pending_money.total_abs > 0 && (
        <div className="bg-amber-50 rounded-lg p-2 border border-amber-200 text-[11px] text-amber-900">
          <div className="font-bold mb-0.5">En attente de règlement</div>
          {agg.pending_money.refund > 0 && <div>↪ Remboursement : {fmtF(agg.pending_money.refund)}</div>}
          {agg.pending_money.credit > 0 && <div>↪ Crédit : {fmtF(agg.pending_money.credit)}</div>}
          {agg.pending_money.extra_payment > 0 && <div>↪ Complément à encaisser : {fmtF(agg.pending_money.extra_payment)}</div>}
        </div>
      )}

      {/* Drapeaux */}
      <div className="flex flex-wrap gap-1">
        {agg.flags.can_ship_today && (
          <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">
            ✓ Peut partir aujourd'hui
          </span>
        )}
        {agg.flags.has_blocking && (
          <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">
            ⚠ Bloquée
          </span>
        )}
        {agg.flags.all_delivered && (
          <span className="text-[10px] bg-green-700 text-white px-1.5 py-0.5 rounded font-bold">
            ✓ Tout livré
          </span>
        )}
        {agg.flags.fully_cancelled && (
          <span className="text-[10px] bg-gray-700 text-white px-1.5 py-0.5 rounded font-bold">
            ✕ Annulée
          </span>
        )}
      </div>

      {/* Détail article → bucket (ce qui vient de l'agrégateur) */}
      <details className="text-[11px]">
        <summary className="cursor-pointer text-indigo-700 font-medium select-none">
          Voir le classement article par article (source : aggregateOrder)
        </summary>
        <div className="mt-1.5 space-y-1">
          {agg.articles.map((row, i) => (
            <div key={i} className="flex items-start gap-2 bg-white/60 rounded px-2 py-1 border border-indigo-100">
              <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${BUCKET_COLORS[row.bucket]}`}>
                {BUCKET_LABELS[row.bucket]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-gray-800">{row.article.product_name}</div>
                <div className="text-[10px] text-gray-500 truncate">{row.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
