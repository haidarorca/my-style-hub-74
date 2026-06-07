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
import { Loader2, CheckCircle, Send, Truck, PackageCheck, RotateCcw, Phone, CreditCard, Receipt } from "lucide-react";
import { updateShipmentAssessment, confirmShipmentPayment } from "@/lib/admin-logistics.functions";
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
    if (!autoCalc || chargeableWeight <= 0) return 0;
    const pricePerKg = 10000; // fallback - à remplacer par le vrai prix du service
    return Math.round(chargeableWeight * pricePerKg);
  }, [autoCalc, chargeableWeight]);

  const validateWeighing = useMutation({
    mutationFn: async () => {
      if (!row.assessment_id) throw new Error("Pas d'évaluation");
      await updateShipmentAssessment({
        data: {
          assessment_id: row.assessment_id,
          real_weight_kg: parseFloat(realWeight),
          volumetric_weight_kg: volumetricWeight,
          length_cm: parseFloat(length),
          width_cm: parseFloat(width),
          height_cm: parseFloat(height),
          air_freight_fee: estimatedFees > 0 ? estimatedFees : undefined,
          status: "fees_calculated",
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-orders"] });
      toast.success("Pesée validée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!row.assessment_id) throw new Error("Pas d'évaluation");
      await updateShipmentAssessment({
        data: { assessment_id: row.assessment_id, status: status as any },
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

  const confirmPayment = useMutation({
    mutationFn: async () => {
      if (!row.assessment_id) throw new Error("Pas d'évaluation");
      await confirmShipmentPayment({
        data: {
          assessmentId: row.assessment_id,
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

  // ─── FORMULAIRE PESÉE ───────────────────────────
  if (ls === "awaiting_weighing") {
    return (
      <div className="space-y-3 pt-2">
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
          <span>Calcul auto des frais</span>
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
            disabled={validateWeighing.isPending || !realWeight}
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
    return (
      <div className="pt-2 space-y-2">
        <p className="text-xs text-muted-foreground">
          Frais calculés : {fmtF(row.total_shipping_fees ?? 0)}
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
            className="h-8 text-xs w-40"
          />
          <Button size="sm" onClick={() => updateStatus.mutate("shipped")}>
            <Truck className="h-3.5 w-3.5 mr-1" />
            Marquer expédié
          </Button>
        </div>
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
