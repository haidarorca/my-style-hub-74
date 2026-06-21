// Picker dialog allowing operators to assign a shipping service to an order
// when none was chosen at checkout. Reads the active services from the
// admin-managed grid and persists via assignOrderShippingService.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Truck, Loader2 } from "lucide-react";
import { fmtF } from "@/cockpit/lib/workflow";
import {
  listEnabledShippingServices,
  assignOrderShippingService,
} from "@/lib/shipping-services.functions";
import { toast } from "sonner";

interface Props {
  open: boolean;
  orderId: string;
  /** Si fourni, l'assignation cible cette évaluation (sous-commande) et met
   *  à jour `order_shipment_assessments.shipping_service_id` + snapshot. */
  assessmentId?: string | null;
  /** ID du service actuellement rattaché — pré-sélectionné dans la liste. */
  currentServiceId?: string | null;
  onClose: () => void;
  onAssigned?: () => void;
}

export function ShippingServicePickerDialog({
  open,
  orderId,
  assessmentId,
  currentServiceId,
  onClose,
  onAssigned,
}: Props) {
  const list = useServerFn(listEnabledShippingServices);
  const assign = useServerFn(assignOrderShippingService);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(currentServiceId ?? null);

  const { data: services, isLoading } = useQuery({
    queryKey: ["enabled-shipping-services"],
    queryFn: () => list(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (shipping_service_id: string) =>
      assign({
        data: {
          order_id: orderId,
          shipping_service_id,
          ...(assessmentId ? { assessment_id: assessmentId } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Mode d'expédition mis à jour");
      qc.invalidateQueries();
      onAssigned?.();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Échec de la mise à jour"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            {currentServiceId ? "Modifier le mode d'expédition" : "Choisir un service d'expédition"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-6 text-gray-500 text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />Chargement…
            </div>
          )}
          {!isLoading && (services ?? []).length === 0 && (
            <div className="text-sm text-gray-500 text-center py-6">
              Aucun service actif. L'admin doit en activer un dans la grille tarifaire.
            </div>
          )}
          {(services ?? []).map((s: any) => {
            const isSel = selectedId === s.id;
            const unit = s.pricing_unit ?? "kg";
            // Inférer la catégorie de transport depuis le nom du service
            // (le schéma n'a pas de colonne dédiée). Sert uniquement à
            // afficher une icône claire — aucune logique métier dépendante.
            const n = String(s.name ?? "").toLowerCase();
            let icon = "📦", kind = "Transport";
            if (/avion|air|aerien|aérien/.test(n)) { icon = "✈️"; kind = "Avion"; }
            else if (/express|rapide|prio/.test(n)) { icon = "🚀"; kind = "Express"; }
            else if (/maritime|bateau|sea|mer/.test(n)) { icon = "🚢"; kind = "Maritime"; }
            else if (/local|livraison|domicile/.test(n)) { icon = "🚚"; kind = "Local"; }
            // Délai estimé : "7 jours", "5 à 10 jours", "≈ 4 mois"
            const dMin = s.delay_min_days as number | null;
            const dMax = s.delay_max_days as number | null;
            const fmtDelay = (d: number) => d >= 60 ? `${Math.round(d / 30)} mois` : `${d} j`;
            let delayLabel: string | null = null;
            if (dMin != null && dMax != null && dMin !== dMax) delayLabel = `${fmtDelay(dMin)} – ${fmtDelay(dMax)}`;
            else if (dMin != null) delayLabel = fmtDelay(dMin);
            else if (dMax != null) delayLabel = fmtDelay(dMax);

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left border rounded-lg p-3 transition ${
                  isSel ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{s.name}</div>
                      <div className="text-[11px] text-gray-500">{kind}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-blue-700 whitespace-nowrap">
                    {fmtF(Number(s.price_per_kg))} / {unit}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
                  {delayLabel && (
                    <span>⏱ Délai estimé : <b className="text-gray-800">{delayLabel}</b></span>
                  )}
                  {(s.source_country_flag || s.source_country_name) && (
                    <span>
                      {s.source_country_flag ?? "🌍"} Départ :{" "}
                      <b className="text-gray-800">{s.source_country_name ?? "—"}</b>
                    </span>
                  )}
                </div>
                {s.description && (
                  <div className="text-xs text-gray-500 mt-1">{s.description}</div>
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button
            onClick={() => selectedId && mutation.mutate(selectedId)}
            disabled={!selectedId || mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {currentServiceId ? "Mettre à jour" : "Rattacher à la commande"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
