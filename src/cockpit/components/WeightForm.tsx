import { useState, useMemo, useEffect } from "react";
import { Scale, Package as PkgIcon, AlertTriangle, Truck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtF, calcVolumetricWeight, calcFreight } from "@/cockpit/lib/workflow";
import type { WeighingRecord } from "@/cockpit/types";

export interface UnknownItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  variantLabel?: string | null;
  quantity: number;
}

export interface ShippingServiceLite {
  id: string;
  name: string;
  price_per_kg: number;
  pricing_unit?: "kg" | "m3" | null;
  description?: string | null;
}

interface Props {
  orderId: string;
  /** Fret déjà figé au checkout pour les articles à poids déclaré (FCFA). 0 si aucun. */
  declaredFreight?: number;
  /** ID de l'évaluation logistique : nécessaire pour persister le fret pesé. */
  assessmentId?: string | null;
  /** Liste des articles à PESER (produits sans poids déclaré uniquement). */
  unknownItems?: UnknownItem[];
  /** Service d'expédition choisi par le client / assigné par l'admin (lecture seule). */
  shippingService?: ShippingServiceLite | null;
  /** Callback à appeler quand l'opérateur doit choisir un service (commande sans service). */
  onPickShippingService?: () => void;
  onWeigh: (record: Omit<WeighingRecord, "id" | "timestamp"> & { assessmentId?: string | null }) => void;
}

type Mode = "global" | "per_item";

export function WeightForm({
  orderId,
  declaredFreight = 0,
  assessmentId,
  unknownItems = [],
  shippingService,
  onPickShippingService,
  onWeigh,
}: Props) {
  const [mode, setMode] = useState<Mode>("global");

  // ── Tarif/kg : lecture seule, provient EXCLUSIVEMENT de shipping_services. ──
  // Aucun champ de saisie n'est exposé à l'opérateur (logique métier KawZone).
  const ratePerKg = Number(shippingService?.price_per_kg ?? 0);
  const hasService = !!shippingService && ratePerKg > 0;

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
  const freightGlobal = calcFreight(chargeableGlobal, ratePerKg);

  // ── Mode per_item : map id → { real_kg, l_cm, w_cm, h_cm } ──
  type PerItemInput = { real: string; l: string; w: string; h: string };
  const blankPI: PerItemInput = { real: "", l: "", w: "", h: "" };
  const [perItemInputs, setPerItemInputs] = useState<Record<string, PerItemInput>>({});
  useEffect(() => {
    setPerItemInputs(prev => {
      const next: Record<string, PerItemInput> = {};
      for (const it of unknownItems) next[it.id] = prev[it.id] ?? { ...blankPI };
      return next;
    });
  }, [unknownItems]);

  const perItemBreakdown = useMemo(() => {
    return unknownItems.map((it) => {
      const inp = perItemInputs[it.id] ?? blankPI;
      const real = parseFloat(inp.real) || 0;
      const l = parseFloat(inp.l) || 0;
      const w = parseFloat(inp.w) || 0;
      const h = parseFloat(inp.h) || 0;
      const vol = l > 0 && w > 0 && h > 0 ? calcVolumetricWeight(l, w, h) : 0;
      const chargeable = Math.max(real, vol);
      const qty = it.quantity || 1;
      return { id: it.id, real, vol, chargeable, qty, totalChargeable: chargeable * qty };
    });
  }, [unknownItems, perItemInputs]);

  const perItemTotalKg = useMemo(
    () => perItemBreakdown.reduce((s, b) => s + b.totalChargeable, 0),
    [perItemBreakdown],
  );
  const perItemRealTotalKg = useMemo(
    () => perItemBreakdown.reduce((s, b) => s + b.real * b.qty, 0),
    [perItemBreakdown],
  );
  const perItemVolTotalKg = useMemo(
    () => perItemBreakdown.reduce((s, b) => s + b.vol * b.qty, 0),
    [perItemBreakdown],
  );
  const freightPerItem = calcFreight(perItemTotalKg, ratePerKg);
  const perItemReady = perItemBreakdown.length > 0 && perItemBreakdown.every(b => b.real > 0);

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
      // Tarif & fret : 0 tant qu'aucun service n'est rattaché — recalculés
      // automatiquement lorsque l'opérateur rattache un service.
      freightRatePerKg: ratePerKg,
      estimatedFreight: freightGlobal,
      finalFreight: freightGlobal,
      weighedBy: "Admin",
    });
    setRealWeight(""); setLength(""); setWidth(""); setHeight("");
  };

  const handleSubmitPerItem = () => {
    if (!perItemReady) return;
    onWeigh({
      orderId,
      assessmentId: assessmentId ?? null,
      realWeightKg: Math.round(perItemRealTotalKg * 1000) / 1000,
      lengthCm: 0, widthCm: 0, heightCm: 0,
      volumetricWeightKg: Math.round(perItemVolTotalKg * 1000) / 1000,
      chargeableWeightKg: Math.round(perItemTotalKg * 1000) / 1000,
      freightRatePerKg: ratePerKg,
      estimatedFreight: freightPerItem,
      finalFreight: freightPerItem,
      weighedBy: "Admin",
      perItemWeights: perItemBreakdown.reduce((acc, b) => {
        acc[b.id] = {
          real_kg: b.real,
          l_cm: parseFloat(perItemInputs[b.id]?.l || "0") || 0,
          w_cm: parseFloat(perItemInputs[b.id]?.w || "0") || 0,
          h_cm: parseFloat(perItemInputs[b.id]?.h || "0") || 0,
          chargeable_kg: b.chargeable,
        };
        return acc;
      }, {} as Record<string, { real_kg: number; l_cm: number; w_cm: number; h_cm: number; chargeable_kg: number }>),
    } as any);
    setPerItemInputs({});
  };

  const totalFreightPreview = (mode === "global" ? freightGlobal : freightPerItem) + declaredFreight;

  // NOTE : la pesée n'est JAMAIS bloquée par l'absence de service d'expédition.
  // C'est une étape logistique (réception colis). Le choix du transporteur est
  // une étape commerciale distincte. Si aucun service n'est rattaché, on
  // affiche un bandeau d'information + bouton "Choisir un service" mais on
  // laisse l'opérateur saisir le poids et les dimensions. Les frais sont alors
  // recalculés automatiquement dès qu'un service est rattaché.


  return (
    <div className="bg-white border rounded-lg p-3 space-y-3" onClick={e => e.stopPropagation()}>
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Scale className="h-4 w-4 text-orange-600" />Pesée
      </h3>

      {/* Bloc TARIF : lecture seule. Deux états — service rattaché ou non. */}
      {hasService ? (
        <div className="bg-blue-50 border border-blue-200 rounded p-2.5 space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-blue-700 flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />Mode d'expédition (choix client)
            </span>
            <span className="font-semibold text-blue-900">{shippingService!.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-blue-700 flex items-center gap-1">
              <Lock className="h-3 w-3" />Tarif appliqué
            </span>
            <span className="font-bold text-blue-900">
              {fmtF(ratePerKg)} / {shippingService!.pricing_unit ?? "kg"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="text-[10px] text-blue-700/80 italic">
              Tarif issu de la grille admin. Non modifiable manuellement.
            </div>
            {onPickShippingService && (
              <button
                type="button"
                onClick={onPickShippingService}
                className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline-offset-2 hover:underline"
              >
                Modifier
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-900 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold mb-0.5">Mode d'expédition non défini</div>
              <div className="text-[11px]">
                Vous pouvez peser le colis maintenant (étape logistique).
                Les frais seront calculés automatiquement dès qu'un mode
                d'expédition sera défini.
              </div>
            </div>
          </div>
          {onPickShippingService && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 border-amber-300 text-amber-900 hover:bg-amber-100"
              onClick={onPickShippingService}
            >
              <Truck className="h-3.5 w-3.5 mr-1.5" />Choisir le mode d'expédition
            </Button>
          )}
        </div>
      )}



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
              <div className="flex justify-between"><span className="text-gray-500">Poids réel:</span><span className="font-medium">{realW.toFixed(3)} kg</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Poids vol:</span><span className="font-medium">{volWeight.toFixed(3)} kg</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Poids facturable:</span><span className="font-bold text-orange-700">{chargeableGlobal.toFixed(3)} kg</span></div>
              <div className="flex justify-between border-t pt-1"><span className="text-gray-500">Montant calculé:</span>{hasService ? <span className="font-bold text-emerald-700">{fmtF(freightGlobal)}</span> : <span className="text-amber-700 text-xs italic">à calculer (service requis)</span>}</div>
              {declaredFreight > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Fret total:</span><span className="font-bold text-emerald-700">{fmtF(totalFreightPreview)}</span></div>
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
              <div className="text-[11px] text-gray-500">Saisir le poids réel de chaque article. Dimensions facultatives (poids volumétrique pris si supérieur).</div>
              <div className="space-y-2">
                {unknownItems.map((it) => {
                  const inp = perItemInputs[it.id] ?? { real: "", l: "", w: "", h: "" };
                  const setField = (k: keyof typeof inp, v: string) =>
                    setPerItemInputs(prev => ({ ...prev, [it.id]: { ...inp, [k]: v } }));
                  const bd = perItemBreakdown.find(b => b.id === it.id);
                  return (
                    <div key={it.id} className="border rounded-md p-2 bg-gray-50 space-y-2">
                      <div className="flex gap-2 items-center">
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
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        <div>
                          <label className="text-[10px] text-gray-500">Poids réel *</label>
                          <Input type="number" step="0.01" value={inp.real}
                            onChange={e => setField("real", e.target.value)}
                            className="h-8 text-xs" placeholder="kg" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">L (cm)</label>
                          <Input type="number" value={inp.l}
                            onChange={e => setField("l", e.target.value)}
                            className="h-8 text-xs" placeholder="L" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">l (cm)</label>
                          <Input type="number" value={inp.w}
                            onChange={e => setField("w", e.target.value)}
                            className="h-8 text-xs" placeholder="l" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">H (cm)</label>
                          <Input type="number" value={inp.h}
                            onChange={e => setField("h", e.target.value)}
                            className="h-8 text-xs" placeholder="H" />
                        </div>
                      </div>
                      {bd && (bd.vol > 0 || bd.chargeable > 0) && (
                        <div className="text-[10px] text-gray-600 flex justify-between">
                          <span>Vol: {bd.vol.toFixed(3)} kg</span>
                          <span>Facturable: <b className="text-orange-700">{bd.chargeable.toFixed(3)} kg</b> × {bd.qty}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {perItemTotalKg > 0 && (
                <div className="bg-gray-50 rounded p-2 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Poids réel total:</span><span className="font-medium">{perItemRealTotalKg.toFixed(3)} kg</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Poids volumétrique total:</span><span className="font-medium">{perItemVolTotalKg.toFixed(3)} kg</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Poids facturable total:</span><span className="font-bold text-orange-700">{perItemTotalKg.toFixed(3)} kg</span></div>
                  <div className="flex justify-between border-t pt-1"><span className="text-gray-500">Montant calculé:</span>{hasService ? <span className="font-bold text-emerald-700">{fmtF(freightPerItem)}</span> : <span className="text-amber-700 text-xs italic">à calculer (service requis)</span>}</div>
                  {declaredFreight > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Fret déclaré (figé):</span><span className="font-medium">{fmtF(declaredFreight)}</span></div>
                  )}
                  {declaredFreight > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Fret total:</span><span className="font-bold text-emerald-700">{fmtF(totalFreightPreview)}</span></div>
                  )}
                </div>
              )}
              <Button size="sm" className="w-full h-10 bg-orange-600 hover:bg-orange-700" onClick={handleSubmitPerItem} disabled={!perItemReady}>
                Enregistrer la pesée
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
