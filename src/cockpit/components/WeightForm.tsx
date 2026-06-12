// @ts-nocheck
import { useState } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateFreight, fmtF } from "@/cockpit/lib/workflow";

interface Props {
  orderId: string;
  currentFreight: number;
  onWeightRecorded: (orderId: string, freight: number) => void;
}

export function WeightForm({ orderId, currentFreight, onWeightRecorded }: Props) {
  const [realWeight, setRealWeight] = useState("");
  const [volWeight, setVolWeight] = useState("");
  const [ratePerKg, setRatePerKg] = useState("7500");

  const handleSubmit = () => {
    const real = parseFloat(realWeight);
    const vol = parseFloat(volWeight);
    const rate = parseFloat(ratePerKg) || 7500;

    if (!real || real <= 0 || !vol || vol <= 0) {
      alert("Veuillez saisir les deux poids");
      return;
    }

    const freight = calculateFreight(real, vol, rate);
    onWeightRecorded(orderId, freight);
    setRealWeight("");
    setVolWeight("");
  };

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <Scale className="h-4 w-4 text-orange-600" />
        <span className="text-sm font-semibold">Peser le colis</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">Poids reel (kg)</label>
          <Input type="number" step="0.1" placeholder="ex: 5.2" value={realWeight} onChange={e => setRealWeight(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Poids volumetrique (kg)</label>
          <Input type="number" step="0.1" placeholder="ex: 6.1" value={volWeight} onChange={e => setVolWeight(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      <div className="mt-2">
        <label className="text-xs text-gray-500">Tarif/kg (FCFA)</label>
        <Input type="number" value={ratePerKg} onChange={e => setRatePerKg(e.target.value)} className="h-9 text-sm" />
      </div>

      {realWeight && volWeight && (
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm">
          <div className="font-semibold text-amber-800">
            Fret estime: {fmtF(calculateFreight(parseFloat(realWeight) || 0, parseFloat(volWeight) || 0, parseFloat(ratePerKg) || 7500))}
          </div>
          <div className="text-xs text-amber-600">
            MAX({parseFloat(realWeight).toFixed(1)}, {parseFloat(volWeight).toFixed(1)}) × {parseFloat(ratePerKg).toLocaleString()} F
          </div>
        </div>
      )}

      <Button size="sm" className="w-full mt-2 h-9 bg-orange-600 hover:bg-orange-700" onClick={handleSubmit} disabled={!realWeight || !volWeight}>
        Calculer et enregistrer
      </Button>
    </div>
  );
}
