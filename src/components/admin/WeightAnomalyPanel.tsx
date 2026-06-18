// ═══════════════════════════════════════════════════════════════
// WeightAnomalyPanel — File des commandes en anomalie poids
//
// Affiche uniquement les commandes dont weight_status === "anomaly"
// et non résolues. Permet à l'admin de trancher rapidement.
// ═══════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, ChevronDown, Loader2, Check, MessageSquare, Ban, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { listLogisticsOrders, type LogisticsOrderRow } from "@/lib/admin-logistics.functions";
import { getOrCreateShipmentAssessment } from "@/lib/shipment-assessments.functions";
import { resolveWeightAnomaly } from "@/lib/weight-anomalies.functions";
import { getWeightAnomaly } from "@/lib/logistics-rules";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} FCFA`;

type Action = "accept_loss" | "contact_client" | "cancel_order" | "modify_fees";

export function WeightAnomalyPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listLogisticsOrders);
  const getOrCreate = useServerFn(getOrCreateShipmentAssessment);
  const resolve = useServerFn(resolveWeightAnomaly);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["weight-anomalies"],
    queryFn: async () => {
      // On récupère la première page (taille large) puis on filtre côté client.
      // Les anomalies sont rares, ce coût est négligeable.
      const r = await list({
        data: { page: 1, pageSize: 100, q: "", orderStatus: "", logisticsStatus: "", paymentStatus: "", orderType: "", hasRemaining: null, dateFrom: null, dateTo: null, includeArchived: false },
      });
      return r;
    },
    refetchInterval: 60_000,
  });

  const anomalies = useMemo<LogisticsOrderRow[]>(() => {
    return (data?.rows ?? []).filter((r) => r.weight_status === "anomaly");
  }, [data]);

  const mut = useMutation({
    mutationFn: async ({ orderId, action }: { orderId: string; action: Action }) => {
      const assessment = await getOrCreate({ data: { order_id: orderId } });
      await resolve({
        data: {
          assessment_id: (assessment as any).id,
          order_id: orderId,
          action,
          note: note || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Anomalie résolue");
      qc.invalidateQueries({ queryKey: ["weight-anomalies"] });
      qc.invalidateQueries({ queryKey: ["admin-logistics"] });
      setExpandedId(null);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des anomalies poids…
      </div>
    );
  }
  if (anomalies.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50/50 overflow-hidden">
      <div className="flex items-center gap-2 bg-red-100 px-3 py-2">
        <AlertCircle className="h-4 w-4 text-red-700" />
        <h3 className="text-sm font-bold text-red-900">
          Vérification requise — {anomalies.length} anomalie{anomalies.length > 1 ? "s" : ""} de poids
        </h3>
      </div>
      <div className="divide-y divide-red-200">
        {anomalies.map((row) => {
          const a = getWeightAnomaly(row.declared_weight_kg, row.real_weight_kg);
          const sign = a.diffPct > 0 ? "+" : "";
          const isOpen = expandedId === row.order_id;
          return (
            <div key={row.order_id} className="bg-white">
              <button
                type="button"
                onClick={() => { setExpandedId(isOpen ? null : row.order_id); setNote(""); }}
                className="w-full px-3 py-2.5 text-left hover:bg-red-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      #{row.order_id.slice(0, 8)} · {row.customer_name ?? "Client"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Déclaré <b>{Number(row.declared_weight_kg ?? 0).toFixed(2)} kg</b> · Réel <b>{Number(row.real_weight_kg ?? 0).toFixed(2)} kg</b>
                      <span className="ml-1.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-red-800 font-semibold">
                        écart {sign}{(a.diffPct * 100).toFixed(0)}% ({sign}{a.diffKg.toFixed(2)} kg)
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-red-200 bg-red-50/50 px-3 py-3 space-y-2">
                  <div className="text-[11px] text-muted-foreground">
                    Total produits : {fmt(row.order_total)}
                  </div>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Note interne (facultatif)"
                    rows={2}
                    className="text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ orderId: row.order_id, action: "accept_loss" })}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Accepter la perte
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ orderId: row.order_id, action: "contact_client" })}
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1" /> Contacter le client
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ orderId: row.order_id, action: "cancel_order" })}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" /> Annuler la commande
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
