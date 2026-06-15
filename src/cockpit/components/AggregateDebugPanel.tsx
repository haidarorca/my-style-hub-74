// ═══════════════════════════════════════════════════════════════
// AggregateDebugPanel — Lecture opérationnelle de aggregateOrder()
//
// ▸ Affiche en un coup d'œil :
//   1. Action prioritaire + POURQUOI elle a été choisie + article moteur
//   2. Ce qui bloque / ce qui peut partir / ce qui attend (fournisseur, argent…)
//   3. Préparation pesée IMPORT (poids connu / estimé / inconnu — points d'entrée)
// ▸ Aucune action déclenchée : lecture pure du modèle.
// ═══════════════════════════════════════════════════════════════

import type { OrderArticle } from "@/cockpit/lib/article-states";
import {
  aggregateOrder, BUCKET_LABELS, BUCKET_COLORS, NEXT_ACTION_LABELS,
  type ArticleBucket, type WeightState,
} from "@/cockpit/lib/order-aggregate";
import { fmtF } from "@/cockpit/lib/workflow";
import { Sparkles, Target, Scale } from "lucide-react";

interface Props {
  articles: OrderArticle[] | undefined | null;
  orderStatus?: string;
}

const BUCKET_ORDER: ArticleBucket[] = [
  "blocked", "waiting_money", "waiting_supplier", "waiting_restock",
  "ready", "in_progress", "delivered", "cancelled",
];

// Buckets opérationnellement intéressants : on déplie les articles individuellement.
const OPERATIONAL_BUCKETS: ArticleBucket[] = [
  "blocked", "waiting_money", "waiting_supplier", "waiting_restock", "ready",
];

const WEIGHT_LABEL: Record<WeightState, string> = {
  known: "Poids connu",
  estimated: "Poids estimé",
  unknown: "Poids inconnu",
};

const WEIGHT_COLOR: Record<WeightState, string> = {
  known: "bg-emerald-100 text-emerald-800 border-emerald-200",
  estimated: "bg-amber-100 text-amber-800 border-amber-200",
  unknown: "bg-gray-200 text-gray-700 border-gray-300",
};

export function AggregateDebugPanel({ articles, orderStatus }: Props) {
  if (!articles || articles.length === 0) return null;
  const agg = aggregateOrder(articles, orderStatus);

  return (
    <div className="rounded-xl border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 to-violet-50 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
          aggregateOrder() — vue opérationnelle
        </span>
        <span className="text-[9px] text-indigo-500 ml-auto">v0.2</span>
      </div>

      {/* ── Action prioritaire : QUOI + POURQUOI + QUI ── */}
      <div className="bg-white/80 rounded-lg p-2.5 border border-indigo-200 space-y-1.5">
        <div className="text-[9px] uppercase text-indigo-500 font-bold tracking-wider">
          Action prioritaire
        </div>
        <div className="text-sm font-bold text-indigo-900">
          {NEXT_ACTION_LABELS[agg.next_action]}
        </div>
        <div className="text-[11px] text-indigo-700">{agg.next_action_reason}</div>
        <div className="text-[10px] text-indigo-600/80 italic border-l-2 border-indigo-200 pl-2">
          Pourquoi : {agg.next_action_why}
        </div>
        {agg.next_action_driver && (
          <div className="flex items-start gap-1.5 mt-1 bg-indigo-100/60 rounded px-2 py-1.5 border border-indigo-200">
            <Target className="h-3 w-3 text-indigo-700 mt-0.5 shrink-0" />
            <div className="text-[10px] text-indigo-900 min-w-0">
              <span className="font-bold">Article moteur : </span>
              <span className="truncate">{agg.next_action_driver.product_name}</span>
              <div className="text-indigo-700/80">{agg.next_action_driver.reason}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Compteurs synthétiques ── */}
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

      {/* ── Détail opérationnel par bucket ── */}
      <div className="space-y-1.5">
        {OPERATIONAL_BUCKETS.filter(b => agg.by_bucket[b].length > 0).map(b => (
          <div key={b} className="bg-white/70 rounded-lg border border-indigo-100 p-2 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${BUCKET_COLORS[b]}`}>
                {BUCKET_LABELS[b]}
              </span>
              <span className="text-[10px] text-gray-500">{agg.by_bucket[b].length} article(s)</span>
            </div>
            <ul className="space-y-0.5">
              {agg.by_bucket[b].map((row, i) => {
                const isDriver = agg.next_action_driver?.article_id === row.article.product_id;
                return (
                  <li key={i} className={`text-[11px] flex items-start gap-1.5 px-1.5 py-1 rounded ${isDriver ? "bg-indigo-100/70 border border-indigo-200" : ""}`}>
                    {isDriver && <Target className="h-3 w-3 text-indigo-700 mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 truncate">{row.article.product_name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{row.reason}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* ── Argent en attente ── */}
      {agg.pending_money.total_abs > 0 && (
        <div className="bg-amber-50 rounded-lg p-2 border border-amber-200 text-[11px] text-amber-900">
          <div className="font-bold mb-0.5">En attente de règlement</div>
          {agg.pending_money.refund > 0 && <div>↪ Remboursement : {fmtF(agg.pending_money.refund)}</div>}
          {agg.pending_money.credit > 0 && <div>↪ Crédit : {fmtF(agg.pending_money.credit)}</div>}
          {agg.pending_money.extra_payment > 0 && <div>↪ Complément à encaisser : {fmtF(agg.pending_money.extra_payment)}</div>}
        </div>
      )}

      {/* ── Préparation pesée IMPORT (squelette : non encore alimenté) ── */}
      {agg.weighing.applicable && (
        <div className="bg-white/70 rounded-lg p-2 border border-indigo-100 space-y-1">
          <div className="flex items-center gap-1.5">
            <Scale className="h-3 w-3 text-indigo-600" />
            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
              Pesée import ({agg.weighing.total_import_articles})
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["known", "estimated", "unknown"] as WeightState[])
              .filter(s => agg.weighing.by_state[s] > 0)
              .map(s => (
                <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border ${WEIGHT_COLOR[s]}`}>
                  {WEIGHT_LABEL[s]} : <b className="tabular-nums">{agg.weighing.by_state[s]}</b>
                </span>
              ))}
          </div>
          <div className="text-[9px] text-gray-500 italic">
            Points d'entrée prêts. Les champs poids ne sont pas encore branchés sur l'article.
          </div>
        </div>
      )}

      {/* ── Drapeaux ── */}
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
    </div>
  );
}
