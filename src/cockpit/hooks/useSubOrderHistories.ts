// ═══════════════════════════════════════════════════════════════
// useSubOrderHistories — Charge en batch les événements, décisions
// et mouvements financiers pour une liste de commandes mères, puis
// les regroupe par sous-commande (order_id + vendor_id).
//
// Pour chaque sous-commande on calcule également :
//  - `awaits` : qui est en attente (set d'AwaitsParty)
//  - `risk`   : niveau de risque + raisons
//
// Lecture seule. Utilise le client Supabase navigateur (RLS admin).
// ═══════════════════════════════════════════════════════════════

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeAwaits,
  computeRisk,
  type OrderEvent,
  type OrderDecision,
  type FinancialMovement,
  type RiskAssessment,
  type AwaitsParty,
} from "@/cockpit/lib/events";

export interface SubOrderHistory {
  events: OrderEvent[];
  decisions: OrderDecision[];
  movements: FinancialMovement[];
  awaits: Set<AwaitsParty>;
  risk: RiskAssessment;
}

export type SubOrderHistoryMap = Map<string, SubOrderHistory>;

const keyOf = (orderId: string, vendorId: string | null | undefined) =>
  `${orderId}::${vendorId ?? "unknown"}`;

export function useSubOrderHistories(orderIds: string[]) {
  const ids = [...new Set(orderIds.filter(Boolean))].sort();

  return useQuery({
    queryKey: ["sub-order-histories", ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<SubOrderHistoryMap> => {
      const { data: events, error: e1 } = await supabase
        .from("order_events")
        .select("*")
        .in("order_id", ids)
        .order("created_at", { ascending: true });
      if (e1) throw e1;

      const eventIds = (events ?? []).map((e) => e.id);
      const { data: decisions, error: e2 } = eventIds.length
        ? await supabase
            .from("order_decisions")
            .select("*")
            .in("event_id", eventIds)
            .order("created_at", { ascending: true })
        : { data: [], error: null };
      if (e2) throw e2;

      const decisionIds = (decisions ?? []).map((d) => d.id);
      const { data: movements, error: e3 } = decisionIds.length
        ? await supabase
            .from("financial_movements")
            .select("*")
            .in("decision_id", decisionIds)
            .order("occurred_at", { ascending: true })
        : { data: [], error: null };
      if (e3) throw e3;

      // Index décisions par event_id pour retrouver le vendor_id de chaque décision/mouvement
      const eventById = new Map<string, OrderEvent>();
      for (const e of (events ?? []) as OrderEvent[]) eventById.set(e.id, e);

      const decisionEventId = new Map<string, string>();
      for (const d of (decisions ?? []) as OrderDecision[]) decisionEventId.set(d.id, d.event_id);

      // Bucket par sous-commande
      const buckets = new Map<string, { events: OrderEvent[]; decisions: OrderDecision[]; movements: FinancialMovement[] }>();
      const ensure = (k: string) => {
        let b = buckets.get(k);
        if (!b) { b = { events: [], decisions: [], movements: [] }; buckets.set(k, b); }
        return b;
      };

      for (const e of (events ?? []) as OrderEvent[]) {
        ensure(keyOf(e.order_id, e.vendor_id)).events.push(e);
      }
      for (const d of (decisions ?? []) as OrderDecision[]) {
        const e = eventById.get(d.event_id);
        if (!e) continue;
        ensure(keyOf(e.order_id, e.vendor_id)).decisions.push(d);
      }
      for (const m of (movements ?? []) as FinancialMovement[]) {
        const eid = decisionEventId.get(m.decision_id);
        const e = eid ? eventById.get(eid) : undefined;
        if (!e) continue;
        ensure(keyOf(e.order_id, e.vendor_id)).movements.push(m);
      }

      const map: SubOrderHistoryMap = new Map();
      for (const [k, b] of buckets) {
        const lastEv = b.events.length ? b.events[b.events.length - 1] : null;
        const lastDe = b.decisions.length ? b.decisions[b.decisions.length - 1] : null;
        const lastMv = b.movements.length ? b.movements[b.movements.length - 1] : null;
        const lastActivityAt =
          [lastEv?.created_at, lastDe?.created_at, lastMv?.occurred_at]
            .filter(Boolean)
            .sort()
            .pop() ?? null;
        map.set(k, {
          ...b,
          awaits: computeAwaits(b.events, b.decisions, b.movements),
          risk: computeRisk({
            events: b.events,
            decisions: b.decisions,
            movements: b.movements,
            isOpen: true, // affinement futur : true si pas livré/annulé
            lastActivityAt,
          }),
        });
      }
      return map;
    },
  });
}

export function getHistory(
  map: SubOrderHistoryMap | undefined,
  orderId: string,
  vendorId: string | null | undefined,
): SubOrderHistory | undefined {
  return map?.get(keyOf(orderId, vendorId));
}
