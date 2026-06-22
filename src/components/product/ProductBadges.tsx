// Badges produits réutilisables : garantie, pays d'origine, matière,
// quantité minimale, guide des tailles. Utilisés sur la fiche produit
// et les cartes produit.

import { ShieldCheck, Globe2, Shirt, Package, Ruler } from "lucide-react";
import { warrantyLabel } from "@/lib/warranty";
import { primaryMaterial, type CompositionItem } from "@/lib/textile-materials";

export interface ProductBadgeInput {
  warranty_days?: number | null;
  origin_country_name?: string | null;
  origin_country_flag?: string | null;
  material?: string | null;
  material_composition_items?: CompositionItem[] | null;
  min_order_qty?: number | null;
  has_size_guide?: boolean | null;
}

export function deriveProductBadges(p: ProductBadgeInput) {
  const warranty = warrantyLabel(p.warranty_days ?? null);
  const country = p.origin_country_name
    ? `${p.origin_country_flag ? p.origin_country_flag + " " : ""}${p.origin_country_name}`
    : null;
  const mat = primaryMaterial(p.material_composition_items ?? null) ?? p.material ?? null;
  const minQ = Number(p.min_order_qty ?? 1);
  const minQty = Number.isFinite(minQ) && minQ > 1 ? Math.round(minQ) : null;
  const sizeGuide = !!p.has_size_guide;
  return { warranty, country, mat, minQty, sizeGuide };
}

export function ProductBadges({
  data,
  size = "sm",
  className = "",
}: {
  data: ProductBadgeInput;
  size?: "xs" | "sm";
  className?: string;
}) {
  const { warranty, country, mat, minQty, sizeGuide } = deriveProductBadges(data);
  if (!warranty && !country && !mat && !minQty && !sizeGuide) return null;
  const txt = size === "xs" ? "text-[9px]" : "text-[10px]";
  const pad = size === "xs" ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const ico = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";
  const base = `inline-flex items-center gap-1 rounded-full border bg-background ${pad} ${txt} font-medium`;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {warranty && (
        <span className={`${base} border-emerald-200 text-emerald-800`}>
          <ShieldCheck className={ico} /> {warranty}
        </span>
      )}
      {country && (
        <span className={`${base} border-sky-200 text-sky-800`}>
          <Globe2 className={ico} /> {country}
        </span>
      )}
      {mat && (
        <span className={`${base} border-amber-200 text-amber-800`}>
          <Shirt className={ico} /> {mat}
        </span>
      )}
      {minQty && (
        <span className={`${base} border-violet-200 text-violet-800`}>
          <Package className={ico} /> Min {minQty}
        </span>
      )}
      {sizeGuide && (
        <span className={`${base} border-primary/40 text-primary`}>
          <Ruler className={ico} /> Guide tailles
        </span>
      )}
    </div>
  );
}
