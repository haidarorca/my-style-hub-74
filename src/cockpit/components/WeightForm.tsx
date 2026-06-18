import { useState, useMemo } from "react";
import { Scale, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtF, calcVolumetricWeight, calcFreight, FREIGHT_RATE_PER_KG } from "@/cockpit/lib/workflow";
import type { WeighingRecord } from "@/cockpit/types";

interface Props {
  orderId: string;
  /** Fret déjà figé au checkout pour les articles à poids déclaré (FCFA). 0 si aucun. */
  declaredFreight?: number;
  onWeigh: (record: Omit<WeighingRecord, "id" | "timestamp">) => void;
}

type Mode = "global" | "per_item";

export function WeightForm({ orderId, declaredFreight = 0, onWeigh }: Props) {
  const [mode, setMode] = useState<Mode>("global");
  const [rate, setRate] = useState(String(FREIGHT_RATE_PER_KG));

  // ── Mode global ──
  const [realWeight, setRealWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  const volWeight = useMemo(() => {
    const l = parseFloat(length), w = parseFloat(width), h = parseFloat(height);
    if (!l || !w || !h) return 0;
    return calcVolumetricWeight(l, w, h);
  }, [length, width, height]);

  const realW = parseFloat(realWeight) || 0;
  const chargeableGlobal = Math.max(realW, volWeight);
  const ratePerKg = parseFloat(rate) || FREIGHT_RATE_PER_KG;
  const freightGlobal = calcFreight(chargeableGlobal, ratePerKg);

  // ── Mode per_item : liste de poids inconnus saisis article par article ──
  const [perItemWeights, setPerItemWeights] = useState<string[]>([""]);
  const perItemTotalKg = useMemo(
    () => perItemWeights.reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [perItemWeights],
  );
  const freightPerItem = calcFreight(perItemTotalKg, ratePerKg);

  const handleSubmitGlobal = () => {
    if (!realW || !chargeableGlobal) return;
    onWeigh({
      orderId,
      realWeightKg: realW,
      lengthCm: parseFloat(length) || 0,
      widthCm: parseFloat(width) || 0,
      heightCm: parseFloat(height) || 0,
      volumetricWeightKg: volWeight,
      chargeableWeightKg: chargeableGlobal,
      freightRatePerKg: ratePerKg,
      estimatedFreight: freightGlobal,
      finalFreight: freightGlobal + declaredFreight,
      weighedBy: "Admin",
    });
    setRealWeight(""); setLength(""); setWidth(""); setHeight("");
  };

  const handleSubmitPerItem = () => {
    if (perItemTotalKg <= 0) return;
    onWeigh({
      orderId,
      realWeightKg: Math.round(perItemTotalKg * 1000) / 1000,
      lengthCm: 0, widthCm: 0, heightCm: 0,
      volumetricWeightKg: 0,
      chargeableWeightKg: Math.round(perItemTotalKg * 1000) / 1000,
      freightRatePerKg: ratePerKg,
      estimatedFreight: freightPerItem,
      // Le fret total cumule le fret figé (déclaré) + le fret pesé (inconnu)
      finalFreight: freightPerItem + declaredFreight,
      weighedBy: "Admin",
    });
    setPerItemWeights([""]);
  };

  const totalFreightPreview = (mode === "global" ? freightGlobal : freightPerItem) + declaredFreight;

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3" onClick={e => e.stopPropagation()}>
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Scale className="h-4 w-4 text-orange-600" />Pesée
      </h3>

      {/* Toggle mode */}
      <div className="flex gap-1 bg-gray-100 rounded p-1">
        <button
          className={`flex-1 text-xs py-1.5 rounded ${mode === "global" ? "bg-white shadow font-semibold" : "text-gray-500"}`}
          onClick={() => setMode("global")}
        >Pesée globale</button>
        <button
          className={`flex-1 text-xs py-1.5 rounded ${mode === "per_item" ? "bg-white shadow font-semibold" : "text-gray-500"}`}
          onClick={() => setMode("per_item")}
        >Par article inconnu</button>
      </div>

      <div>
        <label className="text-[10px] text-gray-500">Tarif/kg (FCFA)</label>
        <Input type="number" value={rate} onChange={e => setRate(e.target.value)} className="h-9 text-sm" />
      </div>

      {declaredFreight > 0 && (
        <div className="text-[11px] bg-emerald-50 border border-emerald-200 rounded p-2 text-emerald-800">
          Fret déjà figé au checkout (articles à poids déclaré) : <b>{fmtF(declaredFreight)}</b>
        </div>
      )}

      {mode === "global" ? (
        <>
          <div className="grid grid-cols-1">
            <div><label className="text-[10px] text-gray-500">Poids réel (kg)</label><Input type="number" value={realWeight} onChange={e => setRealWeight(e.target.value)} className="h-9 text-sm" placeholder="Ex: 2.5" /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[10px] text-gray-500">Long (cm)</label><Input type="number" value={length} onChange={e => setLength(e.target.value)} className="h-9 text-sm" placeholder="L" /></div>
            <div><label className="text-[10px] text-gray-500">Larg (cm)</label><Input type="number" value={width} onChange={e => setWidth(e.target.value)} className="h-9 text-sm" placeholder="l" /></div>
            <div><label className="text-[10px] text-gray-500">Haut (cm)</label><Input type="number" value={height} onChange={e => setHeight(e.target.value)} className="h-9 text-sm" placeholder="H" /></div>
          </div>
          {(realW > 0 || volWeight > 0) && (
            <div className="bg-gray-50 rounded p-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Poids vol:</span><span className="font-medium">{volWeight.toFixed(3)} kg</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Poids facturé:</span><span className="font-bold text-orange-700">{chargeableGlobal.toFixed(3)} kg</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Fret pesé:</span><span className="font-medium">{fmtF(freightGlobal)}</span></div>
              {declaredFreight > 0 && (
                <div className="flex justify-between border-t pt-1"><span className="text-gray-500">Fret total:</span><span className="font-bold text-emerald-700">{fmtF(totalFreightPreview)}</span></div>
              )}
            </div>
          )}
          <Button size="sm" className="w-full h-10 bg-orange-600 hover:bg-orange-700" onClick={handleSubmitGlobal} disabled={!realW || !chargeableGlobal}>
            Enregistrer la pesée
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500">Saisir le poids réel de chaque article à poids inconnu :</div>
            {perItemWeights.map((v, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <span className="text-xs text-gray-500 w-12">Art. {idx + 1}</span>
                <Input
                  type="number"
                  step="0.01"
                  value={v}
                  onChange={e => setPerItemWeights(prev => prev.map((x, i) => i === idx ? e.target.value : x))}
                  className="h-9 text-sm flex-1"
                  placeholder="kg"
                />
                {perItemWeights.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setPerItemWeights(prev => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full h-9" onClick={() => setPerItemWeights(prev => [...prev, ""])}>
              <Plus className="h-3.5 w-3.5 mr-1" />Ajouter un article
            </Button>
          </div>
          {perItemTotalKg > 0 && (
            <div className="bg-gray-50 rounded p-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Poids inconnu total:</span><span className="font-bold text-orange-700">{perItemTotalKg.toFixed(3)} kg</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Fret inconnu calculé:</span><span className="font-medium">{fmtF(freightPerItem)}</span></div>
              {declaredFreight > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Fret déclaré (figé):</span><span className="font-medium">{fmtF(declaredFreight)}</span></div>
              )}
              <div className="flex justify-between border-t pt-1"><span className="text-gray-500">Fret total:</span><span className="font-bold text-emerald-700">{fmtF(totalFreightPreview)}</span></div>
            </div>
          )}
          <Button size="sm" className="w-full h-10 bg-orange-600 hover:bg-orange-700" onClick={handleSubmitPerItem} disabled={perItemTotalKg <= 0}>
            Enregistrer la pesée
          </Button>
        </>
      )}
    </div>
  );
}
