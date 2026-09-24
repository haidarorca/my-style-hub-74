import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { quoteFreight, resolveItemLogistics, type FreightRule } from "@/lib/logistics/freight";

const fr = (n: number, d = 3) => n.toLocaleString("fr-FR", { maximumFractionDigits: d });

/**
 * Détail transparent du calcul transport (Entrepôt Chine → Sénégal),
 * avec EXACTEMENT le moteur utilisé par la fiche produit, le panier et la commande.
 */
export function FreightCalculator({ services }: { services: FreightRule[] }) {
  const [w, setW] = useState("0.767");
  const [l, setL] = useState("55");
  const [wi, setWi] = useState("30");
  const [h, setH] = useState("7");
  const [q, setQ] = useState("1");
  const logistics = resolveItemLogistics({ weight_kg: w, length_cm: l, width_cm: wi, height_cm: h });
  const qty = Math.max(1, Number(q) || 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Détail du calcul transport (Chine → Sénégal)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Poids et dimensions du colis emballé (données variante CJ). Même calcul que la fiche produit, le panier et la commande.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-5 gap-2 text-xs">
          {[["Poids kg", w, setW], ["L cm", l, setL], ["l cm", wi, setWi], ["H cm", h, setH], ["Qté", q, setQ]].map(([lab, v, set]: any) => (
            <label key={lab} className="space-y-1">
              <span className="text-muted-foreground">{lab}</span>
              <Input value={v} onChange={(e) => set(e.target.value)} inputMode="decimal" />
            </label>
          ))}
        </div>
        <div className="space-y-3">
          {services.map((s) => {
            const r = quoteFreight({ logistics, quantity: qty, rule: s });
            const retained = r.unit === "kg"
              ? (r.volumetricWeightKg > r.realWeightKg ? "volumétrique" : "réel")
              : "volume";
            return (
              <div key={s.id} className="rounded-lg border p-3 text-xs">
                <div className="mb-2 flex justify-between font-semibold text-sm">
                  <span>{s.name}</span>
                  <span>{r.ok ? `${fr(r.cost, 0)} FCFA` : "Incalculable"}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Poids réel</dt><dd>{fr(r.realWeightKg)} kg</dd>
                  <dt className="text-muted-foreground">Volume</dt><dd>{fr(r.totalCbm, 6)} m³</dd>
                  <dt className="text-muted-foreground">Poids volumétrique</dt>
                  <dd>{r.unit === "kg" && s.use_volumetric !== false ? `${fr(r.volumetricWeightKg)} kg (÷ ${r.volumetricDivisor})` : "non appliqué"}</dd>
                  <dt className="text-muted-foreground">Retenu pour facturation</dt>
                  <dd>{fr(r.billableQty)} {r.unit === "kg" ? "kg" : "m³"} ({retained}{r.minBillableQty > 0 ? `, min ${r.minBillableQty}` : ""})</dd>
                  <dt className="text-muted-foreground">Tarif</dt><dd>{r.rate != null ? `${fr(r.rate, 0)} FCFA/${r.unit === "kg" ? "kg" : "m³"}` : "—"}</dd>
                  <dt className="text-muted-foreground">Frais fixes</dt><dd>{fr(r.fixedFee, 0)} FCFA</dd>
                </dl>
                {!r.ok && <p className="mt-1 text-destructive">{r.reason}</p>}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
