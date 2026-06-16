// ═══════════════════════════════════════════════════════════════
// EventTimeline — Frise métier d'une sous-commande.
//   Événement (cause) → Décision (réponse) → Mouvement (conséquence)
//
// Append-only : on affiche tout, jamais d'édition. Les décisions
// qui en remplacent d'autres (supersedes) sont marquées.
// ═══════════════════════════════════════════════════════════════

import { History, ArrowRight, Loader2 } from "lucide-react";
import {
  EVENT_LABELS,
  DECISION_LABELS,
  MOVEMENT_LABELS,
  type OrderEvent,
  type OrderDecision,
  type FinancialMovement,
} from "@/cockpit/lib/events";
import type { SubOrderHistory } from "@/cockpit/hooks/useSubOrderHistories";
import { fmtF, fmtDateTime } from "@/cockpit/lib/workflow";

interface Props {
  history?: SubOrderHistory;
  isLoading?: boolean;
}

export function EventTimeline({ history, isLoading }: Props) {
  return (
    <div className="bg-white border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <History className="h-4 w-4 text-gray-600" />
        <h3 className="text-sm font-semibold">Historique métier</h3>
        <span className="text-[10px] text-gray-400 ml-auto">
          Événement → Décision → Mouvement
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
        </div>
      )}

      {!isLoading && (!history || history.events.length === 0) && (
        <div className="text-xs text-gray-400 italic py-2">
          Aucun événement métier enregistré pour cette sous-commande.
        </div>
      )}

      {history && history.events.length > 0 && (
        <ol className="space-y-2.5">
          {history.events.map((ev) => (
            <EventRow
              key={ev.id}
              event={ev}
              decisions={history.decisions.filter((d) => d.event_id === ev.id)}
              movements={history.movements}
              allDecisions={history.decisions}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function EventRow({
  event,
  decisions,
  movements,
  allDecisions,
}: {
  event: OrderEvent;
  decisions: OrderDecision[];
  movements: FinancialMovement[];
  allDecisions: OrderDecision[];
}) {
  const supersededIds = new Set(
    allDecisions.map((d) => d.supersedes_decision_id).filter(Boolean) as string[],
  );

  return (
    <li className="border-l-2 border-blue-400 pl-2.5">
      <div className="text-[11px] font-semibold text-blue-900 flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
        {EVENT_LABELS[event.event_type]}
        <span className="text-[10px] font-normal text-gray-400 ml-auto">
          {fmtDateTime(event.created_at)}
        </span>
      </div>
      {event.reason && (
        <div className="text-[11px] text-gray-700 mt-0.5 italic">« {event.reason} »</div>
      )}

      {decisions.length === 0 && (
        <div className="text-[10px] text-amber-700 mt-1 italic">
          Aucune décision encore prise → action Kawzone attendue.
        </div>
      )}

      {decisions.map((dec) => {
        const decMovements = movements.filter((m) => m.decision_id === dec.id);
        const isSuperseded = supersededIds.has(dec.id);
        return (
          <div key={dec.id} className={`mt-1.5 ml-2 ${isSuperseded ? "opacity-50" : ""}`}>
            <div className="text-[11px] text-gray-800 flex items-center gap-1">
              <ArrowRight className="h-3 w-3 text-purple-500 shrink-0" />
              <span className="font-medium">{DECISION_LABELS[dec.decision_type]}</span>
              {isSuperseded && (
                <span className="text-[9px] text-gray-500 italic">(remplacée)</span>
              )}
              <span className="text-[10px] text-gray-400 ml-auto">
                {fmtDateTime(dec.created_at)}
              </span>
            </div>
            {dec.rationale && (
              <div className="text-[11px] text-gray-600 ml-4 italic">« {dec.rationale} »</div>
            )}
            {decMovements.length === 0 ? (
              ["issue_refund", "issue_credit_note", "apply_penalty"].includes(dec.decision_type) && (
                <div className="text-[10px] text-amber-700 ml-4 mt-0.5 italic">
                  Mouvement financier non encore enregistré.
                </div>
              )
            ) : (
              <ul className="ml-4 mt-0.5 space-y-0.5">
                {decMovements.map((m) => (
                  <li key={m.id} className="text-[11px] text-gray-700 flex items-center gap-1.5">
                    <ArrowRight className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span className="font-medium">{MOVEMENT_LABELS[m.movement_type]}</span>
                    <span
                      className={`text-[10px] font-bold ${
                        m.direction === "credit" ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {m.direction === "credit" ? "+" : "−"}{fmtF(m.amount)}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {m.cost_attribution}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {fmtDateTime(m.occurred_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </li>
  );
}
