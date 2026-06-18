// ═══════════════════════════════════════════════════════════════
// EstimatedShippingPanel — Affiche le coût total estimé sur la
// page produit pour les articles import à poids connu.
//
// - Liste les modes de transport disponibles (Maritime, Avion, Express…)
// - Pour chaque mode : prix transport + délai (jamais FCFA/kg ni CBM)
// - Affiche le TOTAL ESTIMÉ (produit + transport le moins cher)
// - Message client adapté au statut (déclaré / vérifié / inconnu)
// ═══════════════════════════════════════════════════════════════
import { Plane, Check } from "lucide-react";
import { useEstimatedShipping, formatDelay } from "@/hooks/use-estimated-shipping";
import type { EstimatedShippingProduct } from "@/hooks/use-estimated-shipping";

interface Props {
  product: EstimatedShippingProduct;
  productPrice: number | null;
}

export function EstimatedShippingPanel({ product, productPrice }: Props) {
  const est = useEstimatedShipping(product);

  if (!est.isIntl) return null;

  // Cas A : article international SANS poids déclaré → message "après pesée".
  if (!est.canEstimate) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Le coût du transport sera calculé après réception et pesée du colis par notre équipe logistique.
      </div>
    );
  }

  // Cas B : poids déclaré → on affiche le total estimé + la grille des modes.
  const cheapest = est.cheapest!;
  const total =
    productPrice != null ? Math.round(Number(productPrice) + cheapest.price) : null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
      {total != null && (
        <div className="bg-emerald-100/60 px-3 py-2.5 border-b border-emerald-200">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Total estimé (produit + transport)
          </p>
          <p className="mt-0.5 text-2xl font-extrabold text-emerald-900">
            {total.toLocaleString("fr-FR")} FCFA
          </p>
        </div>
      )}

      <div className="p-3 space-y-2">
        <p className="text-[11px] font-semibold flex items-center gap-1.5 text-emerald-800">
          <Plane className="h-3.5 w-3.5" /> Choisissez votre mode de transport
        </p>
        <div className="space-y-1.5">
          {est.options.map((opt) => {
            const isCheapest = opt.service.id === cheapest.service.id;
            return (
              <div
                key={opt.service.id}
                className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
                  isCheapest
                    ? "border-emerald-400 bg-white"
                    : "border-emerald-200/60 bg-white/60"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                    {opt.service.name}
                    {isCheapest && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        <Check className="h-2.5 w-2.5" /> RECOMMANDÉ
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-emerald-700/80">
                    {formatDelay(opt.delayMin, opt.delayMax)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-emerald-900">
                    {opt.price.toLocaleString("fr-FR")} FCFA
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-emerald-700/80 pt-1 leading-snug">
          Le coût du transport affiché est calculé à partir des informations fournies par le vendeur
          et sera vérifié par notre équipe logistique à la réception. Vous pourrez choisir votre
          mode définitif au moment du panier.
        </p>
      </div>
    </div>
  );
}
