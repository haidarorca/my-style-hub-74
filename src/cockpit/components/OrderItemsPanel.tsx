import { useState, useEffect } from "react";
import {
  X, Package, Store, ChevronRight, Loader2, AlertCircle,
  ShieldCheck, Users, ImageOff, Tag, Ruler, Palette, CircleDot,
} from "lucide-react";
import { getOrderItems } from "@/lib/cockpit-payments.functions";
import { fmtF } from "@/cockpit/lib/workflow";
import type { OrderItemDetail, OrderItemsResult } from "@/lib/cockpit-payments.functions";

interface Props {
  orderId: string;
  onClose: () => void;
}

// ─── Labels selon le type de boutique ───
function vendorLabel(isAdmin: boolean) {
  if (isAdmin) {
    return {
      title: "Boutique Officielle",
      subtitle: "Kawzone — Garantie & Qualité",
      icon: ShieldCheck,
      color: "text-purple-700",
      bg: "bg-purple-50 border-purple-200",
      badge: "text-purple-600 bg-purple-100",
    };
  }
  return {
    title: "Boutique Vendeur",
    subtitle: "Produit externe — Commission",
    icon: Users,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    badge: "text-blue-600 bg-blue-100",
  };
}

// ─── Badge de variante choisie ───
function VariantBadge({ label, color, colorHex }: { label: string | null; color: string | null; colorHex: string | null }) {
  if (!label && !color) return null;
  const display = label ?? color ?? "";
  return (
    <div className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full px-2 py-0.5 text-[10px] font-medium text-gray-700">
      {colorHex ? (
        <span className="w-2.5 h-2.5 rounded-full border border-gray-300 shrink-0" style={{ backgroundColor: colorHex }} />
      ) : (
        <Tag className="h-3 w-3 text-gray-400" />
      )}
      {display}
    </div>
  );
}

// ─── Séparateur variante détaillée ───
function VariantDetail({ size, color, colorHex }: { size: string | null; color: string | null; colorHex: string | null }) {
  if (!size && !color) return null;
  return (
    <div className="flex items-center gap-3">
      {size && (
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <Ruler className="h-4 w-4 text-gray-400" />
          <span>Taille: <b>{size}</b></span>
        </div>
      )}
      {color && (
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Palette className="h-4 w-4 text-gray-400" />
          <span>Couleur: <b>{color}</b></span>
          {colorHex && (
            <span className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: colorHex }} />
          )}
        </div>
      )}
    </div>
  );
}

export function OrderItemsPanel({ orderId, onClose }: Props) {
  const [data, setData] = useState<OrderItemsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emptyMsg, setEmptyMsg] = useState("");
  const [detailItem, setDetailItem] = useState<OrderItemDetail | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Aucune commande sélectionnée.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setEmptyMsg("");
    getOrderItems({ data: { order_id: orderId } })
      .then((result: any) => {
        if (result?.error) {
          setError("Erreur base de données : " + result.error);
        } else if (!result || !result.items || result.items.length === 0) {
          setEmptyMsg("Cette commande ne contient aucun article enregistré.");
          setData({ items: [], order_total: 0, vendor_summary: [] });
        } else {
          setData(result as OrderItemsResult);
        }
      })
      .catch((err) => {
        setError("Impossible de charger les articles : " + (err?.message || "erreur inconnue"));
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  // ═══════════════════════════════════════════════
  // DÉTAIL PRODUIT (plein écran)
  // ═══════════════════════════════════════════════
  if (detailItem) {
    const vLabel = vendorLabel(detailItem.is_admin_shop);
    const VIcon = vLabel.icon;
    return (
      <div className="fixed inset-0 z-[110] bg-white flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <button onClick={() => setDetailItem(null)} className="flex items-center gap-1 text-sm text-orange-600 font-medium">
            <ChevronRight className="h-4 w-4 rotate-180" />Retour
          </button>
          <h3 className="text-sm font-bold truncate max-w-[200px]">{detailItem.product_name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* ─── Galerie images (variante en premier) ─── */}
          {detailItem.all_images.length > 0 ? (
            <div className="space-y-2">
              <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden">
                <img src={detailItem.all_images[0]} alt={detailItem.product_name} className="w-full h-full object-cover" />
              </div>
              {detailItem.all_images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1">
                  {detailItem.all_images.map((img, i) => (
                    <div key={i} className="snap-start shrink-0 w-20 h-20 bg-gray-100 rounded-lg overflow-hidden">
                      <img src={img} alt={`${detailItem.product_name} ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center text-gray-300">
              <ImageOff className="h-16 w-16" />
            </div>
          )}

          {/* ─── Nom produit ─── */}
          <div>
            <h2 className="text-lg font-bold">{detailItem.product_name}</h2>
            {detailItem.designation && (
              <p className="text-sm text-gray-500 mt-0.5">{detailItem.designation}</p>
            )}
          </div>

          {/* ─── Description ─── */}
          {detailItem.description && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{detailItem.description}</p>
          )}

          {/* ─── Variante choisie ─── */}
          {(detailItem.size || detailItem.color) && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-orange-700 font-semibold text-sm">
                <CircleDot className="h-4 w-4" />
                Variante choisie
              </div>
              <VariantDetail size={detailItem.size} color={detailItem.color} colorHex={detailItem.color_hex} />
            </div>
          )}

          {/* ─── Source / Boutique ─── */}
          <div className={`rounded-lg border p-3 ${vLabel.bg}`}>
            <div className="flex items-center gap-2">
              <VIcon className={`h-5 w-5 ${vLabel.color}`} />
              <div>
                <div className={`text-sm font-semibold ${vLabel.color}`}>
                  {detailItem.shop_type_label ?? vLabel.title}
                </div>
                <div className="text-xs text-gray-500">{vLabel.subtitle}</div>
              </div>
            </div>
            {detailItem.shop_name && detailItem.shop_name !== "Source inconnue" && (
              <div className="mt-2 flex items-center gap-1 text-xs text-gray-600">
                <Store className="h-3.5 w-3.5" />
                {detailItem.shop_name}
                {detailItem.owner_name && detailItem.owner_name !== detailItem.shop_name && (
                  <span className="text-gray-400">— {detailItem.owner_name}</span>
                )}
              </div>
            )}
          </div>

          {/* ─── Quantité & Prix ─── */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Quantité</span>
              <span className="text-sm font-semibold">{detailItem.quantity}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Prix unitaire</span>
              <span className="text-sm font-semibold">{fmtF(detailItem.unit_price)}</span>
            </div>
            {detailItem.commission_rate && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Commission ({detailItem.commission_rate}%)</span>
                <span className="text-sm font-semibold text-orange-600">
                  {detailItem.commission_amount ? fmtF(detailItem.commission_amount) : `${detailItem.commission_rate}%`}
                </span>
              </div>
            )}
            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-sm font-bold">Total ligne</span>
              <span className="text-lg font-bold">{fmtF(detailItem.line_total)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // LISTE ARTICLES
  // ═══════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-600" />
            <h3 className="text-base font-bold">Articles de la commande</h3>
            {data && <span className="text-xs text-gray-500">({data.items.length})</span>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Chargement...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          {emptyMsg && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg p-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />{emptyMsg}
            </div>
          )}

          {data && (
            <>
              {/* ─── Résumé par boutique ─── */}
              {data.vendor_summary.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source des articles</h4>
                  {data.vendor_summary.map((v) => {
                    const label = vendorLabel(v.is_admin);
                    const VIcon = label.icon;
                    return (
                      <div key={v.vendor_id} className={`rounded-lg border p-3 ${label.bg}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <VIcon className={`h-4 w-4 ${label.color}`} />
                            <div>
                              <div className={`text-sm font-semibold ${label.color}`}>
                                {v.shop_type_label ?? label.title}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {v.shop_name} &bull; {v.item_count} article{v.item_count > 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm font-bold">{fmtF(v.total)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─── Liste des articles ─── */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Détail des articles</h4>
                {data.items.map((item, idx) => (
                  <button
                    key={`${item.product_id}-${idx}`}
                    onClick={() => setDetailItem(item)}
                    className="w-full flex items-start gap-3 bg-white border rounded-lg p-3 text-left hover:shadow-md transition-shadow"
                  >
                    {/* Image (variante en priorité) */}
                    <div className="shrink-0 w-14 h-14 bg-gray-100 rounded-lg overflow-hidden relative">
                      {item.product_image ? (
                        <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                      {/* Badge variante sur l'image */}
                      {(item.variant_label || item.color) && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5 truncate px-1">
                          {item.variant_label ?? item.color}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.product_name}</div>
                      {item.designation && (
                        <div className="text-[10px] text-gray-400 truncate">{item.designation}</div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">Qty: <b>{item.quantity}</b></span>
                        <span className="text-[10px] text-gray-400">&times;</span>
                        <span className="text-[10px] text-gray-500">{fmtF(item.unit_price)}</span>
                      </div>

                      {/* Variante choisie */}
                      {(item.variant_label || item.color) && (
                        <div className="mt-1">
                          <VariantBadge label={item.variant_label} color={item.color} colorHex={item.color_hex} />
                        </div>
                      )}

                      {/* Type boutique */}
                      {item.shop_name && (
                        <div className="flex items-center gap-1 mt-1">
                          {item.is_admin_shop ? (
                            <ShieldCheck className="h-3 w-3 text-purple-500" />
                          ) : (
                            <Users className="h-3 w-3 text-blue-500" />
                          )}
                          <span className={`text-[10px] font-medium ${item.is_admin_shop ? "text-purple-600" : "text-blue-600"}`}>
                            {item.shop_type_label ?? (item.is_admin_shop ? "Officielle" : "Vendeur")}
                          </span>
                          <span className="text-[10px] text-gray-400">&mdash; {item.shop_name}</span>
                        </div>
                      )}

                      {/* Commission */}
                      {item.commission_rate && (
                        <div className="text-[10px] text-orange-500 mt-0.5">
                          Commission: {item.commission_rate}%
                          {item.commission_amount ? ` (${fmtF(item.commission_amount)})` : ""}
                        </div>
                      )}
                    </div>

                    {/* Total ligne + flèche */}
                    <div className="shrink-0 text-right flex flex-col items-end">
                      <div className="text-sm font-bold">{fmtF(item.line_total)}</div>
                      <ChevronRight className="h-4 w-4 text-gray-300 mt-1" />
                    </div>
                  </button>
                ))}
              </div>

              {/* ─── Total ─── */}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Total articles</span>
                  <span className="text-lg font-bold">{fmtF(data.order_total)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-3 shrink-0">
          <button onClick={onClose} className="w-full h-11 bg-orange-600 text-white rounded-lg font-medium text-sm hover:bg-orange-700">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
