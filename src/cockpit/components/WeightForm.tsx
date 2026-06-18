import { useState, useMemo, useEffect } from "react";
import { Scale, Plus, Trash2, Package as PkgIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtF, calcVolumetricWeight, calcFreight, FREIGHT_RATE_PER_KG } from "@/cockpit/lib/workflow";
import type { WeighingRecord } from "@/cockpit/types";

export interface UnknownItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  variantLabel?: string | null;
  quantity: number;
}

interface Props {
  orderId: string;
  /** Fret déjà figé au checkout pour les articles à poids déclaré (FCFA). 0 si aucun. */
  declaredFreight?: number;
  /** ID de l'évaluation logistique : nécessaire pour persister le fret pesé. */
  assessmentId?: string | null;
  /** Liste des articles à PESER (produits sans poids déclaré uniquement). */
  unknownItems?: UnknownItem[];
  onWeigh: (record: Omit<WeighingRecord, "id" | "timestamp"> & { assessmentId?: string | null }) => void;
}

type Mode = "global" | "per_item";

export function WeightForm({ orderId, declaredFreight = 0, assessmentId, unknownItems = [], onWeigh }: Props) {
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

  // ── Mode per_item : map id → poids en kg ──
  const [perItemWeights, setPerItemWeights] = useState<Record<string, string>>({});
  useEffect(() => {
    // Initialiser/synchroniser quand la liste change
    setPerItemWeights(prev => {
      const next: Record<string, string> = {};
      for (const it of unknownItems) next[it.id] = prev[it.id] ?? "";
      return next;
    });
  }, [unknownItems]);

  const perItemTotalKg = useMemo(
    () => Object.values(perItemWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [perItemWeights],
  );
  const freightPerItem = calcFreight(perItemTotalKg, ratePerKg);

  const handleSubmitGlobal = () => {
    if (!realW || !chargeableGlobal) return;
    onWeigh({
      orderId,
      assessmentId: assessmentId ?? null,
      realWeightKg: realW,
      lengthCm: parseFloat(length) || 0,
      widthCm: parseFloat(width) || 0,
      heightCm: parseFloat(height) || 0,
      volumetricWeightKg: volWeight,
      chargeableWeightKg: chargeableGlobal,
      freightRatePerKg: ratePerKg,
      estimatedFreight: freightGlobal,
      finalFreight: freightGlobal, // fret pesé uniquement ; le déclaré reste figé sur les items
      weighedBy: "Admin",
    });
    setRealWeight(""); setLength(""); setWidth(""); setHeight("");
  };

  const handleSubmitPerItem = () => {
    if (perItemTotalKg <= 0) return;
    onWeigh({
      orderId,
      assessmentId: assessmentId ?? null,
      realWeightKg: Math.round(perItemTotalKg * 1000) / 1000,
      lengthCm: 0, widthCm: 0, heightCm: 0,
      volumetricWeightKg: 0,
      chargeableWeightKg: Math.round(perItemTotalKg * 1000) / 1000,
      freightRatePerKg: ratePerKg,
      estimatedFreight: freightPerItem,
      finalFreight: freightPerItem,
      weighedBy: "Admin",
    });
    setPerItemWeights({});
  };

  const totalFreightPreview = (mode === "global" ? freightGlobal : freightPerItem) + declaredFreight;

  return (
    <div className="bg-white border rounded-lg p-3 space-y-3" onClick={e => e.stopPropagation()}>
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Scale className="h-4 w-4 text-orange-600" />Pesée
      </h3>

      <div className="flex gap-1 bg-gray-100 rounded p-1">
        <button
          className={`flex-1 text-xs py-1.5 rounded ${mode === "global" ? "bg-white shadow font-semibold" : "text-gray-500"}`}
          onClick={() => setMode("global")}
        >Pesée globale</button>
        <button
          className={`flex-1 text-xs py-1.5 rounded ${mode === "per_item" ? "bg-white shadow font-semibold" : "text-gray-500"}`}
          onClick={() => setMode("per_item")}
          disabled={unknownItems.length === 0}
          title={unknownItems.length === 0 ? "Aucun article à poids inconnu" : ""}
        >Par article inconnu ({unknownItems.length})</button>
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
          {unknownItems.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-3 bg-gray-50 rounded">
              Aucun article à poids inconnu pour cette commande.
            </div>
          ) : (
            <>
              <div className="text-[11px] text-gray-500">Saisir le poids réel de chaque article à poids inconnu :</div>
              <div className="space-y-2">
                {unknownItems.map((it) => (
                  <div key={it.id} className="flex gap-2 items-center border rounded-md p-2 bg-gray-50">
                    <div className="h-12 w-12 shrink-0 rounded bg-white border overflow-hidden flex items-center justify-center">
                      {it.imageUrl
                        ? <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                        : <PkgIcon className="h-5 w-5 text-gray-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{it.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {it.variantLabel ? `${it.variantLabel} · ` : ""}Qté {it.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={perItemWeights[it.id] ?? ""}
                        onChange={e => setPerItemWeights(prev => ({ ...prev, [it.id]: e.target.value }))}
                        className="h-9 text-sm w-20"
                        placeholder="kg"
                      />
                      <span className="text-[10px] text-gray-500">kg</span>
                    </div>
                  </div>
                ))}
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
        </>
      )}
    </div>
  );
}
