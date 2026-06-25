// ============================================================
// InspectionPanel — KawZone Cockpit
// Formulaire d'inspection du produit retourné
// Etape CRITIQUE : la fourche decisionnelle du workflow retour
// ============================================================

import { useState } from "react";
import { Search, Camera, Package, Scale, Ruler, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export type InspectionCondition =
  | "new_sealed" | "new_opened" | "like_new" | "good" | "fair"
  | "damaged_functional" | "damaged_unfunctional" | "incomplete" | "wrong_product" | "counterfeit";

export type InspectionDisposition =
  | "restock_as_new" | "restock_as_used" | "send_to_repair"
  | "return_to_supplier" | "destroy" | "donate" | "pending_decision";

interface InspectionPanelProps {
  caseId: string;
  onSubmit: (data: InspectionData) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export interface InspectionData {
  condition: InspectionCondition;
  disposition: InspectionDisposition;
  actualWeightG?: number;
  actualDimensionsCm?: number[];
  accessoriesPresent: string[];
  accessoriesMissing: string[];
  serialNumber?: string;
  packagingCondition?: "original_intact" | "original_damaged" | "original_missing" | "replacement";
  photos: string[];
  findings?: string;
  clientFault: boolean;
  inspectionCost: number;
  inspectionCostPayer: "client" | "kawzone" | "vendor" | "supplier";
}

const CONDITIONS: { value: InspectionCondition; label: string; severity: "good" | "medium" | "bad" }[] = [
  { value: "new_sealed", label: "Neuf, scellé", severity: "good" },
  { value: "new_opened", label: "Neuf, ouvert", severity: "good" },
  { value: "like_new", label: "Comme neuf", severity: "good" },
  { value: "good", label: "Bon état", severity: "good" },
  { value: "fair", label: "État moyen", severity: "medium" },
  { value: "damaged_functional", label: "Endommagé, fonctionnel", severity: "medium" },
  { value: "damaged_unfunctional", label: "Endommagé, non fonctionnel", severity: "bad" },
  { value: "incomplete", label: "Incomplet", severity: "bad" },
  { value: "wrong_product", label: "Mauvais produit", severity: "bad" },
  { value: "counterfeit", label: "Contrefaçon", severity: "bad" },
];

const DISPOSITIONS: { value: InspectionDisposition; label: string; description: string }[] = [
  { value: "restock_as_new", label: "Remise en stock (neuf)", description: "Le produit est remis en vente comme neuf" },
  { value: "restock_as_used", label: "Remise en stock (occasion)", description: "Le produit est vendu en occasion / déstockage" },
  { value: "send_to_repair", label: "Envoi en réparation", description: "Le produit sera réparé avant revente" },
  { value: "return_to_supplier", label: "Retour fournisseur", description: "Le produit est renvoyé au fournisseur" },
  { value: "destroy", label: "Destruction", description: "Le produit sera détruit (certificat requis)" },
  { value: "donate", label: "Don", description: "Le produit est donné à une association" },
  { value: "pending_decision", label: "Décision différée", description: "Expertise nécessaire avant décision" },
];

export function InspectionPanel({ caseId, onSubmit, onCancel, loading }: InspectionPanelProps) {
  const [condition, setCondition] = useState<InspectionCondition>("new_opened");
  const [disposition, setDisposition] = useState<InspectionDisposition>("restock_as_new");
  const [actualWeightG, setActualWeightG] = useState<string>("");
  const [serialNumber, setSerialNumber] = useState("");
  const [packagingCondition, setPackagingCondition] = useState<InspectionData["packagingCondition"]>("original_intact");
  const [findings, setFindings] = useState("");
  const [clientFault, setClientFault] = useState(false);
  const [inspectionCost, setInspectionCost] = useState("0");
  const [inspectionCostPayer, setInspectionCostPayer] = useState<InspectionData["inspectionCostPayer"]>("kawzone");
  const [photos, setPhotos] = useState<string[]>([]);

  const handleSubmit = () => {
    onSubmit({
      condition,
      disposition,
      actualWeightG: actualWeightG ? parseInt(actualWeightG) : undefined,
      serialNumber: serialNumber || undefined,
      packagingCondition,
      photos,
      findings: findings || undefined,
      clientFault,
      accessoriesPresent: [],
      accessoriesMissing: [],
      inspectionCost: parseFloat(inspectionCost) || 0,
      inspectionCostPayer,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Inspection du produit retourné
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* État du produit */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">État du produit</Label>
          <div className="grid grid-cols-2 gap-2">
            {CONDITIONS.map((c) => (
              <button
                key={c.value}
                onClick={() => setCondition(c.value)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  condition === c.value
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-muted hover:border-primary/30"
                } ${
                  c.severity === "good" ? "hover:bg-green-50" :
                  c.severity === "medium" ? "hover:bg-yellow-50" :
                  "hover:bg-red-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Mesures */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Scale className="h-3 w-3" /> Poids réel (g)
            </Label>
            <Input
              type="number"
              value={actualWeightG}
              onChange={(e) => setActualWeightG(e.target.value)}
              placeholder="Ex: 450"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Hash className="h-3 w-3" /> N° de série
            </Label>
            <Input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Numéro de série"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Emballage */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Package className="h-3 w-3" /> État de l'emballage
          </Label>
          <Select value={packagingCondition} onValueChange={(v) => setPackagingCondition(v as InspectionData["packagingCondition"])}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="original_intact">Original intact</SelectItem>
              <SelectItem value="original_damaged">Original endommagé</SelectItem>
              <SelectItem value="original_missing">Original manquant</SelectItem>
              <SelectItem value="replacement">Emballage de remplacement</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Décision */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Décision de disposition</Label>
          <div className="space-y-2">
            {DISPOSITIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDisposition(d.value)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  disposition === d.value
                    ? "border-primary bg-primary/10"
                    : "border-muted hover:border-primary/30"
                }`}
              >
                <p className="text-xs font-medium">{d.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{d.description}</p>
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Frais d'inspection */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Frais d'inspection (XOF)</Label>
            <Input
              type="number"
              value={inspectionCost}
              onChange={(e) => setInspectionCost(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payé par</Label>
            <Select value={inspectionCostPayer} onValueChange={(v) => setInspectionCostPayer(v as InspectionData["inspectionCostPayer"])}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kawzone">KawZone</SelectItem>
                <SelectItem value="vendor">Vendeur</SelectItem>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="supplier">Fournisseur</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Faute client */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="client-fault"
            checked={clientFault}
            onChange={(e) => setClientFault(e.target.checked)}
            className="rounded"
          />
          <Label htmlFor="client-fault" className="text-xs cursor-pointer">
            Faute du client (impacte la répartition des coûts)
          </Label>
        </div>

        <Separator />

        {/* Constats */}
        <div className="space-y-1.5">
          <Label className="text-xs">Constats détaillés</Label>
          <Textarea
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            placeholder="Décrivez l'état du produit, les dommages observés, les pièces manquantes..."
            rows={3}
            className="text-xs"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1"
            size="sm"
          >
            <Search className="h-3.5 w-3.5 mr-1.5" />
            Enregistrer l'inspection
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} size="sm">
              Annuler
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
