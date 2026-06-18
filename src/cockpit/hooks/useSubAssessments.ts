// ═══════════════════════════════════════════════════════════════
// useSubAssessments — Charge les `order_shipment_assessments`
// pour un lot de commandes, indexés par (order_id, sub_order_key).
//
// Pour IMPORT_KNOWN_WEIGHT : l'assessment est créé au checkout avec
// air_freight_fee FIGÉ. Aucune pesée admin n'écrase ce montant.
//
// Pour IMPORT_UNKNOWN_WEIGHT : air_freight_fee = NULL tant qu'aucune
// pesée n'a été enregistrée. Le Cockpit affiche "En attente de pesée".
// ═══════════════════════════════════════════════════════════════

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SubAssessment {
  id: string;
  order_id: string;
  sub_order_key: string | null;
  status: string | null;
  real_weight_kg: number | null;
  volumetric_weight_kg: number | null;
  air_freight_fee: number | null;
  service_fee: number | null;
  extra_fees: number | null;
  weight_mode: string | null;
}

export function useSubAssessments(orderIds: string[]) {
  const ids = Array.from(new Set(orderIds.filter(Boolean)));
  const key = ids.join(",");

  const { data = [] } = useQuery({
    queryKey: ["sub-assessments", key],
    enabled: ids.length > 0,
    refetchInterval: 30000,
    queryFn: async (): Promise<SubAssessment[]> => {
      const { data, error } = await (supabase as any)
        .from("order_shipment_assessments")
        .select("id, order_id, sub_order_key, status, real_weight_kg, volumetric_weight_kg, air_freight_fee, service_fee, extra_fees, weight_mode")
        .in("order_id", ids);
      if (error) return [];
      return (data ?? []) as SubAssessment[];
    },
  });

  // Map par (order_id::sub_order_key).
  // Si sub_order_key est NULL (legacy), on indexe par order_id seul (compat).
  const byKey = new Map<string, SubAssessment>();
  const byOrder = new Map<string, SubAssessment[]>();
  for (const a of data) {
    const arr = byOrder.get(a.order_id) ?? [];
    arr.push(a);
    byOrder.set(a.order_id, arr);
    if (a.sub_order_key) byKey.set(`${a.order_id}::${a.sub_order_key}`, a);
  }

  /** Retourne l'assessment correspondant à (orderId, subKey).
   *  Fallback : si aucun assessment ne porte ce subKey mais qu'un assessment
   *  unique existe pour la commande (legacy), on le renvoie. */
  function getAssessment(orderId: string, subKey: string): SubAssessment | null {
    const direct = byKey.get(`${orderId}::${subKey}`);
    if (direct) return direct;
    const all = byOrder.get(orderId) ?? [];
    if (all.length === 1 && !all[0].sub_order_key) return all[0];
    return null;
  }

  return { assessments: data, byKey, byOrder, getAssessment };
}
