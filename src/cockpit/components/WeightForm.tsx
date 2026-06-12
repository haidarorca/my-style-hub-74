import { useState, useMemo } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtF, calcVolumetricWeight, calcFreight, FREIGHT_RATE_PER_KG } from "@/cockpit/lib/workflow";
import type { WeighingRecord } from "@/cockpit/types";

interface Props {
  orderId: string;
  onWeigh: (record: Omit<WeighingRecord, "id" | "timestamp">) => void;
}

export function WeightForm({ orderId, onWeigh }: Props) {
  const [realWeight, setRealWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [rate, setRate] = useState(String(FREIGHT_RATE_PER_KG));

  const volWeight = useMemo(() => {
    const l = parseFloat(length), w = parseFloat(width), h = parseFloat(height);
    if (!l || !w || !h) return 0;
    return calcVolumetricWeight(l, w, h);
  }, [length, width, height]);

  const realW = parseFloat(realWeight) || 0;
  const chargeable = Math.max(realW, volWeight);
  const freight = calcFreight(chargeable, parseFloat(rate) || FREIGHT_RATE_PER_KG);

  const handleSubmit = () => {
    if (!realW || !chargeable) return;
    onWeigh({
      orderId,
      realWeightKg: realW,
      lengthCm: parseFloat(length) || 0,
      widthCm: parseFloat(width) || 0,
      heightCm: parseFloat(height) || 0,
      volumetricWeightKg: volWeight,
      chargeableWeightKg: chargeable,
      freightRatePerKg: parseFloat(rate) || FREIGHT_RATE_PER_KG,
      estimatedFreight: freight,
      finalFreight: freight,
      weighedBy: "Admin",
    });
    setRealWeight(""); setLength(""); setWidth(""); setHeight("");
  };

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-1.5"><Scale className="h-4 w-4 text-orange-600" />Pesée</h3>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-[10px] text-gray-500">Poids réel (kg)</label><Input type="number" value={realWeight} onChange={e => setRealWeight(e.target.value)} className="h-9 text-sm" placeholder="Ex: 2.5" /></div>
        <div><label className="text-[10px] text-gray-500">Tarif/kg (FCFA)</label><Input type="number" value={rate} onChange={e => setRate(e.target.value)} className="h-9 text-sm" /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className="text-[10px] text-gray-500">Long (cm)</label><Input type="number" value={length} onChange={e => setLength(e.target.value)} className="h-9 text-sm" placeholder="L" /></div>
        <div><label className="text-[10px] text-gray-500">Larg (cm)</label><Input type="number" value={width} onChange={e => setWidth(e.target.value)} className="h-9 text-sm" placeholder="l" /></div>
        <div><label className="text-[10px] text-gray-500">Haut (cm)</label><Input type="number" value={height} onChange={e => setHeight(e.target.value)} className="h-9 text-sm" placeholder="H" /></div>
      </div>
      {/* Résultats calculés */}
      {(realW > 0 || volWeight > 0) && (
        <div className="bg-gray-50 rounded p-2 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Poids vol:</span><span className="font-medium">{volWeight.toFixed(3)} kg</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Poids facturé:</span><span className="font-bold text-orange-700">{chargeable.toFixed(3)} kg</span></div>
          <div className="flex justify-between border-t pt-1"><span className="text-gray-500">Fret:</span><span className="font-bold text-emerald-700">{fmtF(freight)}</span></div>
        </div>
      )}
      <Button size="sm" className="w-full h-10 bg-orange-600 hover:bg-orange-700" onClick={handleSubmit} disabled={!realW || !chargeable}>
        Enregistrer la pesée
      </Button>
    </div>
  );
}
