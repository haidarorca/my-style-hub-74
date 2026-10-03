import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ExploreHit } from "@/lib/cj-center.functions";
import { qualityFromHit, QUALITY_LABEL } from "@/lib/cj/quality";
import { landedCost, fcfa } from "@/lib/cj/landed-cost";

const NA = "Donnée non disponible";

/**
 * Comparaison côte à côte, uniquement avec les données réellement reçues de CJ.
 * Les fiches complètes déjà ouvertes (cache) enrichissent la comparaison sans
 * nouvel appel CJ. Jamais de note, d'avis ou de délai inventés.
 */
export function CjCompareDialog({ open, onClose, hits, usdRate }: { open: boolean; onClose: () => void; hits: ExploreHit[]; usdRate: number | null }) {
  const qc = useQueryClient();
  const cols = hits.slice(0, 6).map((h) => {
    const d = (qc.getQueryData(["cj-detail", h.pid]) as any)?.detail ?? null;
    const v0 = d?.variants?.find((v: any) => v.lengthCm && v.widthCm && v.heightCm) ?? null;
    const weight = d?.maxWeightKg ?? h.weightKg;
    const lc = landedCost({ priceUsd: d?.minPrice ?? h.price, weightKg: weight, lengthCm: v0?.lengthCm, widthCm: v0?.widthCm, heightCm: v0?.heightCm, usdToXof: usdRate });
    return { h, d, lc, weight, q: qualityFromHit({ ...h, weightKg: weight }) };
  });
  const rows: Array<[string, (c: (typeof cols)[number]) => string]> = [
    ["Qualité KawZone", (c) => QUALITY_LABEL[c.q.level]],
    ["Fournisseur", (c) => c.d?.supplierName ?? NA],
    ["Supplier ID", (c) => c.d?.supplierId ?? NA],
    ["Prix CJ", (c) => c.d?.minPrice != null ? (c.d.minPrice === c.d.maxPrice ? `${c.d.minPrice} USD` : `${c.d.minPrice} – ${c.d.maxPrice} USD`) : c.h.price != null ? `${c.h.price} USD` : NA],
    ["Stock", (c) => (c.d?.totalStock ?? c.h.stock) != null ? String(c.d?.totalStock ?? c.h.stock) : NA],
    ["Poids", (c) => c.weight != null ? `${c.weight} kg` : NA],
    ["Variantes", (c) => (c.d?.variantCount ?? c.h.variantCount) != null ? String(c.d?.variantCount ?? c.h.variantCount) : NA],
    ["Entrepôt vérifié", (c) => c.d?.verifiedWarehouse == null ? NA : c.d.verifiedWarehouse ? "Oui" : "Non"],
    ["Délai annoncé", (c) => c.d?.deliveryCycle ?? NA],
    ["Prix en FCFA", (c) => fcfa(c.lc.priceXof)],
    ["Fret avion", (c) => fcfa(c.lc.freightAvion)],
    ["Coût Dakar avion", (c) => fcfa(c.lc.totalAvion)],
    ["Coût Dakar rapide", (c) => fcfa(c.lc.totalRapide)],
    ["Données manquantes", (c) => c.lc.missing.join(" · ") || "—"],
  ];
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-6xl overflow-auto">
      <DialogHeader><DialogTitle>Comparer les produits / fournisseurs</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">Seules les données transmises par CJ sont affichées. Ouvrez l'aperçu d'un produit pour charger sa fiche complète (fournisseur, dimensions, délai). Aucune note ni avis : CJ ne les fournit pas.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs">
        <thead><tr><th className="w-40" />{cols.map((c) => <th key={c.h.pid} className="p-2 text-left align-top font-medium">{c.h.image ? <img src={c.h.image} alt="" className="mb-1 h-16 w-16 rounded object-cover" /> : null}<span className="line-clamp-2">{c.h.name ?? "Sans nom"}</span>{!c.d && <span className="mt-1 block font-normal text-muted-foreground">Fiche complète non chargée</span>}</th>)}</tr></thead>
        <tbody>{rows.map(([label, fn]) => <tr key={label} className="border-t"><td className="p-2 text-muted-foreground">{label}</td>{cols.map((c) => <td key={c.h.pid} className="p-2">{fn(c)}</td>)}</tr>)}</tbody>
      </table></div>
    </DialogContent>
  </Dialog>;
}
