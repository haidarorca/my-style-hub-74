import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle, Send, Truck, PackageCheck, RotateCcw, Phone, CreditCard, Receipt, ScanLine, AlertTriangle } from "lucide-react";
import { updateShipmentAssessment, confirmShipmentPayment, updateShipmentTracking } from "@/lib/admin-logistics.functions";
import { getOrCreateShipmentAssessment, verifyDeclaredWeight } from "@/lib/shipment-assessments.functions";
import { getOrderItems } from "@/lib/cockpit-payments.functions";
import { useQuery } from "@tanstack/react-query";
import { useShippingServices } from "@/hooks/use-shipping-services";
import { fmtF } from "@/lib/workflow.config";
import type { WorkflowRow } from "@/types/workflow";

interface Props {
  row: WorkflowRow;
}

export function WorkflowExpandedForm({ row }: Props) {
  const qc = useQueryClient();
  const ls = row.logistics_status;
  const [realWeight, setRealWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [autoCalc, setAutoCalc] = useState(true);
  const [tracking, setTracking] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(String(row.amount_remaining ?? ""));
  const [selectedServiceId, setSelectedServiceId] = useState(row.shipping_service_id ?? "");

  const { services, findById } = useShippingServices();

  // Prix du service : soit celui sélectionné, soit celui déjà en base
  const activeService = useMemo(() => {
    if (selectedServiceId) return findById(selectedServiceId);
    if (row.shipping_service_id) return findById(row.shipping_service_id);
    return undefined;
  }, [selectedServiceId, row.shipping_service_id, findById]);

  const pricePerKg = activeService?.price_per_kg ?? 0;

  const volumetricWeight = useMemo(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    return l > 0 && w > 0 && h > 0 ? (l * w * h) / 5000 : 0;
  }, [length, width, height]);

  const chargeableWeight = useMemo(() => {
    const rw = parseFloat(realWeight) || 0;
    return Math.max(rw, volumetricWeight);
  }, [realWeight, volumetricWeight]);

  const estimatedFees = useMemo(() => {
    if (!autoCalc || chargeableWeight <= 0 || pricePerKg <= 0) return 0;
    return Math.round(chargeableWeight * pricePerKg);
  }, [autoCalc, chargeableWeight, pricePerKg]);

  /* ═── Mutation ensureAssessment : cree l'evaluation si absente ── */
  const ensureAssessment = useMutation({
    mutationFn: async () => {
      const result = await getOrCreateShipmentAssessment({
        data: { order_id: row.order_id },
      });
      return result.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow-orders"] }),
    onError: (e: Error) => toast.error("Erreur création évaluation : " + e.message),
  });

  /* Helper : retourne assessment_id existant ou cree un nouveau */
  const getAssessmentId = async (): Promise<string> => {
    if (row.assessment_id) return row.assessment_id;
    return await ensureAssessment.mutateAsync();
  };

  const validateWeighing = useMutation({
    mutationFn: async () => {
      const assessmentId = await getAssessmentId();
      const payload: Record<string, unknown> = {
        assessment_id: assessmentId,
        real_weight_kg: parseFloat(realWeight),
        volumetric_weight_kg: volumetricWeight,
        length_cm: parseFloat(length),
        width_cm: parseFloat(width),
        height_cm: parseFloat(height),
        air_freight_fee: estimatedFees > 0 ? estimatedFees : undefined,
        status: "fees_calculated",
      };
      // Sauvegarder le service sélectionné s'il diffère
      if (selectedServiceId && selectedServiceId !== row.shipping_service_id) {
        payload.shipping_service_id = selectedServiceId;
      }
      await updateShipmentAssessment({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-orders"] });
      toast.success("Pesée validée — frais calculés");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const assessmentId = await getAssessmentId();
      await updateShipmentAssessment({
        data: { assessment_id: assessmentId, status: status as any },
      });
    },
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["workflow-orders"] });
      const labels: Record<string, string> = {
        ready_to_ship: "Prêt à embarquer",
        shipped: "Expédié",
        awaiting_weighing: "Retour à la pesée",
      };
      toast.success(labels[status] || "Statut mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTrackingAndShip = useMutation({
    mutationFn: async () => {
      const assessmentId = await getAssessmentId();
      // Étape 1 : sauvegarder le tracking
      if (tracking.trim()) {
        await updateShipmentTracking({
          data: {
            assessmentId: assessmentId,
            trackingNumber: tracking.trim(),
            shippedAt: new Date().toISOString(),
          },
        });
      }
      // Étape 2 : mettre à jour le statut
      await updateShipmentAssessment({
        data: { assessment_id: assessmentId, status: "shipped" as any },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-orders"] });
      toast.success("Expédié — tracking enregistré");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmPayment = useMutation({
    mutationFn: async () => {
      const assessmentId = await getAssessmentId();
      await confirmShipmentPayment({
        data: {
          assessmentId: assessmentId,
          amount: parseFloat(paymentAmount),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-orders"] });
      toast.success("Paiement confirmé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const whatsappUrl = row.customer_phone
    ? `https://wa.me/${row.customer_phone.replace(/\D/g, "")}`
    : null;

  // ─── SÉLECTEUR DE SERVICE TRANSPORT ─────────────────
  const ServiceSelector = () => (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground">Service transport</label>
      {activeService ? (
        <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5">
          <span className="text-xs font-medium">{activeService.name}</span>
          <span className="text-[10px] text-muted-foreground">{activeService.price_per_kg.toLocaleString("fr-FR")} FCFA/kg</span>
        </div>
      ) : (
        <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Choisir un service…" />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.name} — {s.price_per_kg.toLocaleString("fr-FR")} FCFA/kg
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  // ─── FORMULAIRE PESÉE ───────────────────────────
  /* ═── WORKFLOW LOCAL (3 etapes) ─────────────────────────────── */
  if (row.order_type === "local") {
    if (ls === "new" || ls === null || ls === undefined) {
      return (
        <div className="pt-2 space-y-2">
          <p className="text-xs text-muted-foreground">Commande locale — en attente de confirmation</p>
          <Button size="sm" onClick={() => updateStatus.mutate("confirmed")}>
            <CheckCircle className="h-3.5 w-3.5 mr-1" />
            Confirmer commande
          </Button>
        </div>
      );
    }
    if (ls === "confirmed") {
      return (
        <div className="pt-2 space-y-2">
          <p className="text-xs text-muted-foreground">Commande locale — prête pour livraison</p>
          <Button size="sm" onClick={() => updateStatus.mutate("delivered")}>
            <PackageCheck className="h-3.5 w-3.5 mr-1" />
            Marquer livrée
          </Button>
        </div>
      );
    }
    if (ls === "delivered") {
      return (
        <div className="pt-2">
          <span className="text-xs text-emerald-600 font-medium">Commande livrée</span>
        </div>
      );
    }
    return (
      <div className="pt-2">
        <span className="text-xs text-muted-foreground">Statut : {ls}</span>
      </div>
    );
  }

  /* ═── WORKFLOW IMPORT / MIXTE (7 etapes) ────────────────────── */
  if (ls === "awaiting_weighing") {
    return (
      <div className="space-y-3 pt-2">
        <ServiceSelector />

        <div className="grid grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Poids (kg)</label>
            <Input type="number" step="0.1" value={realWeight} onChange={(e) => setRealWeight(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">L (cm)</label>
            <Input type="number" value={length} onChange={(e) => setLength(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">l (cm)</label>
            <Input type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">h (cm)</label>
            <Input type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-[11px] cursor-pointer">
          <Checkbox checked={autoCalc} onCheckedChange={(v) => setAutoCalc(!!v)} />
          <span>Calcul auto des frais ({pricePerKg > 0 ? `${pricePerKg.toLocaleString("fr-FR")} FCFA/kg` : "choisissez un service"})</span>
        </label>

        {volumetricWeight > 0 && (
          <div className="text-xs space-y-0.5 bg-muted/30 rounded p-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Volumétrique</span>
              <span>{volumetricWeight.toFixed(2)} kg</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Facturable</span>
              <span className="text-orange-600">{chargeableWeight.toFixed(2)} kg</span>
            </div>
            {estimatedFees > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Frais estimés</span>
                <span>{fmtF(estimatedFees)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => validateWeighing.mutate()}
            disabled={validateWeighing.isPending || !realWeight || (pricePerKg <= 0 && autoCalc)}
          >
            {validateWeighing.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
            )}
            Valider pesée
          </Button>
          {whatsappUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Phone className="h-3.5 w-3.5 mr-1" />
                WhatsApp
              </a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── FRAIS CALCULÉS ──────────────────────────────
  if (ls === "fees_calculated") {
    // Circuit B — poids déclaré : vérification interne (saisie article par article).
    if (row.weight_status === "declared" || row.weight_status === "anomaly") {
      return <VerifyWeightForm row={row} />;
    }
    // Circuit A — poids inconnu : envoi au client.
    return (
      <div className="pt-2 space-y-2">
        <p className="text-xs text-muted-foreground">
          Frais calculés : {fmtF(row.total_shipping_fees ?? 0)}
          {activeService && (
            <span className="ml-1">({activeService.name} · {activeService.price_per_kg.toLocaleString("fr-FR")} FCFA/kg)</span>
          )}
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => updateStatus.mutate("awaiting_client_validation")}>
            <Send className="h-3.5 w-3.5 mr-1" />
            Envoyer au client
          </Button>
          {whatsappUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Phone className="h-3.5 w-3.5 mr-1" />
                WhatsApp
              </a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── VALIDÉE ─────────────────────────────────────
  if (ls === "validated") {
    const remaining = row.amount_remaining ?? 0;
    return (
      <div className="pt-2 space-y-2">
        {remaining > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded p-2">
            <Receipt className="h-4 w-4 text-red-500 shrink-0" />
            <div className="text-xs">
              <span className="font-medium text-red-700">{fmtF(remaining)} restants</span>
              <span className="text-muted-foreground ml-1">· Paiement incomplet</span>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => updateStatus.mutate("ready_to_ship")}>
            <PackageCheck className="h-3.5 w-3.5 mr-1" />
            Prêt à embarquer
          </Button>
          {remaining > 0 && (
            <Button size="sm" variant="outline" onClick={() => confirmPayment.mutate()}>
              <CreditCard className="h-3.5 w-3.5 mr-1" />
              Confirmer {fmtF(parseFloat(paymentAmount) || remaining)}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── PRÊT À EXPÉDIER ─────────────────────────────
  if (ls === "ready_to_ship") {
    return (
      <div className="pt-2 space-y-2">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="N° tracking"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            className="h-8 text-xs w-52"
          />
          <Button
            size="sm"
            onClick={() => saveTrackingAndShip.mutate()}
            disabled={saveTrackingAndShip.isPending}
          >
            {saveTrackingAndShip.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Truck className="h-3.5 w-3.5 mr-1" />
            )}
            Marquer expédié
          </Button>
        </div>
        {tracking.trim() === "" && (
          <p className="text-[10px] text-amber-600">
            Sans tracking, le client ne pourra pas suivre son colis.
          </p>
        )}
      </div>
    );
  }

  // ─── REJETÉE ─────────────────────────────────────
  if (ls === "rejected") {
    return (
      <div className="pt-2">
        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("awaiting_weighing")}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Revenir à pesée
        </Button>
      </div>
    );
  }

  // ─── ATTENTE CLIENT ──────────────────────────────
  if (ls === "awaiting_client_validation") {
    return (
      <div className="pt-2 flex gap-2">
        <span className="text-xs text-muted-foreground flex items-center">
          Attente validation client
        </span>
        {whatsappUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Phone className="h-3.5 w-3.5 mr-1" />
              Relancer
            </a>
          </Button>
        )}
      </div>
    );
  }

  return null;
}
