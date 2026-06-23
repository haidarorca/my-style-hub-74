// ═══════════════════════════════════════════════════════════════
// ProductDetailDrawer — Fiche détail produit (pure présentation).
// Ouvert au clic sur une ligne article. Affiche toutes les infos
// disponibles (image, variante, prix, fournisseur, statut, historique).
// Aucune logique métier, aucun appel serveur.
// ═══════════════════════════════════════════════════════════════

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Package, Tag, Palette, Ruler, Truck, Store, Calendar, CheckCircle2, AlertTriangle, Box } from "lucide-react";
import { fmtF, fmtDateTime } from "@/cockpit/lib/workflow";
import {
  ARTICLE_STATUS_COLORS, ARTICLE_STATUS_LABELS,
  getArticleStatusLabel, STOCK_BREAK_ACTIONS,
} from "@/cockpit/lib/article-states";
import type { OrderArticle } from "@/cockpit/lib/article-states";

interface Props {
  article: OrderArticle | null;
  freightFee?: number;
  onClose: () => void;
}

export function ProductDetailDrawer({ article, freightFee, onClose }: Props) {
  if (!article) return null;
  const a = article;
  const isBreak = a.stock_break && !a.stock_break.resolved;
  const partial = (a.delivered_qty ?? 0) > 0 && (a.delivered_qty ?? 0) < a.quantity;

  return (
    <Sheet open={!!article} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto p-0">
        <div className="p-4 space-y-3">
          <SheetHeader className="pb-1">
            <SheetTitle className="text-base leading-tight">{a.product_name}</SheetTitle>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                a.is_import ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"
              }`}>
                {a.is_import ? `IMPORT ${a.origin_country_flag ?? ""} ${a.origin_country ?? ""}`.trim() : "LOCAL"}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ARTICLE_STATUS_COLORS[a.status]}`}>
                {getArticleStatusLabel(a)}
              </span>
              {a.line_kind === "IMPORT_KNOWN_WEIGHT" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">Poids déclaré</span>
              )}
              {a.line_kind === "IMPORT_UNKNOWN_WEIGHT" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">Poids inconnu</span>
              )}
            </div>
          </SheetHeader>

          {/* Image principale */}
          <div className="w-full aspect-square max-h-64 bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center">
            {a.product_image ? (
              <img src={a.product_image} alt={a.product_name} className="w-full h-full object-cover" />
            ) : (
              <Package className="h-16 w-16 text-gray-300" />
            )}
          </div>

          {/* Alerte rupture / partiel */}
          {isBreak && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Rupture en cours</div>
                <div className="text-[11px] mt-0.5">{a.stock_break?.reason}</div>
                <div className="text-[11px] mt-0.5">
                  Action prévue : {STOCK_BREAK_ACTIONS.find(s => s.key === a.stock_break!.action)?.label}
                </div>
              </div>
            </div>
          )}
          {partial && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-xs text-teal-800">
              Livré partiellement : {a.delivered_qty}/{a.quantity}
            </div>
          )}

          {/* Identité produit */}
          <Section title="Identité produit" icon={Tag}>
            <Row label="Nom" value={a.product_name} />
            <Row label="Réf. interne" value={a.product_id} mono />
            {a.variant_id && <Row label="Variante" value={a.variant_label ?? a.variant_id} />}
            {a.color && <Row label="Couleur" value={a.color} icon={Palette} />}
            {a.size && <Row label="Taille" value={a.size} icon={Ruler} />}
          </Section>

          {/* Quantité & prix */}
          <Section title="Quantité & prix" icon={Box}>
            <Row label="Quantité" value={`x${a.quantity}`} />
            <Row label="Prix unitaire" value={fmtF(a.unit_price)} />
            <Row label="Total ligne" value={fmtF(a.line_total)} bold />
            {a.delivered_qty != null && a.delivered_qty > 0 && (
              <Row label="Quantité livrée" value={`${a.delivered_qty} / ${a.quantity}`} />
            )}
          </Section>

          {/* Logistique / Import */}
          {(a.is_import || freightFee) && (
            <Section title="Logistique & import" icon={Truck}>
              {a.origin_country && <Row label="Pays origine" value={`${a.origin_country_flag ?? ""} ${a.origin_country}`.trim()} />}
              {a.line_kind && <Row label="Catégorie" value={a.line_kind} mono />}
              {a.freight_fee != null && a.freight_fee > 0 && (
                <Row label="Fret figé (checkout)" value={fmtF(a.freight_fee)} />
              )}
            </Section>
          )}

          {/* Fournisseur / boutique */}
          {(a.vendor_name || a.shop_type_label) && (
            <Section title="Fournisseur" icon={Store}>
              {a.vendor_name && <Row label="Boutique" value={a.vendor_name} />}
              {a.shop_type_label && <Row label="Type" value={a.shop_type_label} />}
              {a.commission_rate != null && a.commission_rate > 0 && (
                <Row label="Commission" value={`${(a.commission_rate * 100).toFixed(1)}%`} />
              )}
              {a.commission_amount != null && a.commission_amount > 0 && (
                <Row label="Montant commission" value={fmtF(a.commission_amount)} />
              )}
            </Section>
          )}

          {/* Statut & version */}
          <Section title="Statut article" icon={CheckCircle2}>
            <Row label="Statut courant" value={ARTICLE_STATUS_LABELS[a.status]} />
            {a.updated_by && <Row label="Modifié par" value={a.updated_by} />}
            {a.updated_at && <Row label="Modifié le" value={fmtDateTime(a.updated_at)} />}
          </Section>

          {/* Historique */}
          {a.status_history && a.status_history.length > 0 && (
            <Section title="Historique article" icon={Calendar}>
              <ol className="space-y-1.5">
                {a.status_history.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold">{ARTICLE_STATUS_LABELS[h.status]}</div>
                      <div className="text-gray-500">{fmtDateTime(h.at)} — {h.by}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <div className="pb-4" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
      <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-gray-500" />
        {title}
      </h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label, value, mono, bold, icon: Icon,
}: { label: string; value: string; mono?: boolean; bold?: boolean; icon?: any }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-gray-500 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className={`text-right ${mono ? "font-mono text-[10px]" : ""} ${bold ? "font-bold" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
