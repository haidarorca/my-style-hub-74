// ═══════════════════════════════════════════════════════════════
// InspectionPanel — KawZone Cockpit
// Formulaire d'inspection produit retourné
// Enregistre le rapport d'inspection + décision de disposition
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { Search, Camera, Package, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InspectionCondition, PackagingCondition, Disposition } from "@/lib/return-management.functions";

interface InspectionPanelProps {
  caseId: string;
  returnShipmentId?: string | null;
  onSubmit?: (data: InspectionFormData) => void;
  className?: string;
}

export interface InspectionFormData {
  case_id: string;
  return_shipment_id?: string | null;
  condition: InspectionCondition;
  actual_weight_g: number | null;
  actual_dimensions_cm: number[] | null;
  accessories_present: string[];
  accessories_missing: string[];
  serial_number: string | null;
  packaging_condition: PackagingCondition | null;
  disposition: Disposition;
  findings: string | null;
  recommended_action: string | null;
  client_fault: boolean;
  inspection_cost: number;
  photos: string[];
}

const CONDITIONS: { value: InspectionCondition; label: string; severity: "good" | "warning" | "critical" }[] = [
  { value: "new_sealed", label: "Neuf, scellé", severity: "good" },
  { value: "new_opened", label: "Neuf, ouvert", severity: "good" },
  { value: "like_new", label: "Comme neuf", severity: "good" },
  { value: "good", label: "Bon état", severity: "good" },
  { value: "fair", label: "État moyen", severity: "warning" },
  { value: "damaged_functional", label: "Endommagé, fonctionnel", severity: "warning" },
  { value: "damaged_unfunctional", label: "Endommagé, non fonctionnel", severity: "critical" },
  { value: "incomplete", label: "Incomplet", severity: "critical" },
  { value: "wrong_product", label: "Mauvais produit", severity: "critical" },
  { value: "counterfeit", label: "Contrefaçon", severity: "critical" },
];

const DISPOSITIONS: { value: Disposition; label: string; description: string }[] = [
  { value: "restock_as_new", label: "Remise en stock neuf", description: "Produit revendable à prix plein" },
  { value: "restock_as_used", label: "Remise en stock occasion", description: "Produit revendable avec dépréciation" },
  { value: "send_to_repair", label: "Envoi en réparation", description: "Réparation possible, coût à estimer" },
  { value: "return_to_supplier", label: "Retour fournisseur", description: "Avoir CNY attendu (30-90 jours)" },
  { value: "destroy", label: "Destruction", description: "Perte totale, documentation requise" },
  { value: "donate", label: "Don", description: "Décharge fiscale possible" },
  { value: "pending_decision", label: "Décision différée", description: "Expertise nécessaire" },
];

const PACKAGING: { value: PackagingCondition; label: string }[] = [
  { value: "original_intact", label: "Original intact" },
  { value: "original_damaged", label: "Original endommagé" },
  { value: "original_missing", label: "Original manquant" },
  { value: "replacement", label: "Emballage de remplacement" },
];

export function InspectionPanel({ caseId, returnShipmentId, onSubmit, className }: InspectionPanelProps) {
  const [condition, setCondition] = useState<InspectionCondition | "">("");
  const [disposition, setDisposition] = useState<Disposition | "">("");
  const [packaging, setPackaging] = useState<PackagingCondition | "">("");
  const [findings, setFindings] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [weight, setWeight] = useState("");
  const [clientFault, setClientFault] = useState(false);
  const [inspectionCost, setInspectionCost] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!condition || !disposition) return;
    setSubmitting(true);
    onSubmit?.({
      case_id: caseId,
      return_shipment_id: returnShipmentId ?? null,
      condition,
      actual_weight_g: weight ? parseInt(weight, 10) : null,
      actual_dimensions_cm: null,
      accessories_present: [],
      accessories_missing: [],
      serial_number: serialNumber || null,
      packaging_condition: packaging || null,
      disposition,
      findings: findings || null,
      recommended_action: null,
      client_fault: clientFault,
      inspection_cost: parseFloat(inspectionCost) || 0,
      photos: [],
    });
    setTimeout(() => setSubmitting(false), 500);
  };

  const selectedCondition = CONDITIONS.find((c) => c.value === condition);
  const canSubmit = condition !== "" && disposition !== "";

  return (
    <div className={cn("rounded-lg border bg-card shadow-sm", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Search className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Rapport d&apos;inspection</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* État du produit */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">État constaté du produit</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {CONDITIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCondition(c.value)}
                className={cn(
                  "text-left text-xs px-2.5 py-1.5 rounded-md border transition-colors",
                  condition === c.value
                    ? c.severity === "good"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : c.severity === "warning"
                        ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-red-500 bg-red-50 text-red-700"
                    : "border-muted bg-background hover:bg-muted/50",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Détails physiques */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Poids réel (g)</Label>
            <Input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="ex: 450"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">N° de série</Label>
            <Input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="SN..."
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Emballage */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-1">
            <Package className="h-3 w-3" />
            État de l&apos;emballage
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {PACKAGING.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPackaging(p.value)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-md border transition-colors",
                  packaging === p.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted bg-background hover:bg-muted/50",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Faute client */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="client-fault"
            checked={clientFault}
            onChange={(e) => setClientFault(e.target.checked)}
            className="rounded border-muted"
          />
          <Label htmlFor="client-fault" className="text-xs cursor-pointer flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            Faute du client (impacte le remboursement)
          </Label>
        </div>

        {/* Décision de disposition */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Décision de disposition</Label>
          <div className="space-y-1">
            {DISPOSITIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDisposition(d.value)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md border transition-colors flex items-center justify-between",
                  disposition === d.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted bg-background hover:bg-muted/50",
                )}
              >
                <div>
                  <span className="text-xs font-medium">{d.label}</span>
                  <p className="text-[10px] text-muted-foreground">{d.description}</p>
                </div>
                {disposition === d.value && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* Constats */}
        <div className="space-y-1.5">
          <Label className="text-xs">Constats détaillés</Label>
          <Textarea
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            placeholder="Décrivez l'état du produit, les anomalies constatées..."
            className="min-h-[60px] text-xs"
          />
        </div>

        {/* Frais d'inspection */}
        <div className="space-y-1.5">
          <Label className="text-xs">Frais d&apos;inspection (XOF)</Label>
          <Input
            type="number"
            value={inspectionCost}
            onChange={(e) => setInspectionCost(e.target.value)}
            className="h-8 text-xs w-32"
          />
        </div>

        {/* Photos */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Camera className="h-3 w-3" />
            Photos
          </Label>
          <div className="border border-dashed rounded-md p-4 text-center text-xs text-muted-foreground">
            Upload photos à implémenter (Supabase Storage)
          </div>
        </div>

        {/* Submit */}
        <Button
          size="sm"
          className="w-full"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
        >
          <Check className="h-3.5 w-3.5 mr-1.5" />
          {submitting ? "Enregistrement..." : "Enregistrer l&apos;inspection"}
        </Button>

        {!canSubmit && (
          <p className="text-[10px] text-muted-foreground text-center">
            Sélectionnez l&apos;état du produit et la disposition pour valider
          </p>
        )}
      </div>
    </div>
  );
}
