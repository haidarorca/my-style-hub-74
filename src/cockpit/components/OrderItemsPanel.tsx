import { useState, useEffect, useCallback } from "react";
import {
  X, Package, Store, ChevronLeft, ChevronRight, Loader2, AlertCircle,
  ShieldCheck, Users, ImageOff, Tag, Ruler, Palette, CircleDot, ArrowLeft,
} from "lucide-react";
import { getOrderItems } from "@/lib/cockpit-payments.functions";
import { fmtF } from "@/cockpit/lib/workflow";
import type { OrderItemDetail, OrderItemsResult, VendorFullInfo } from "@/lib/cockpit-payments.functions";
import { VendorDetailPanel } from "./VendorDetailPanel";

interface Props {
  orderId: string;
  onClose: () => void;
}

/* ──────────────────────────────────────────────
   Labels selon le type de boutique
   ────────────────────────────────────────────── */
function vendorLabel(isAdmin: boolean) {
  if (isAdmin) {
    return {
      title: "Boutique Officielle",
      subtitle: "Kawzone — Garantie & Qualité",
      icon: ShieldCheck,
      color: "text-purple-700",
      bg: "bg-purple-50 border-purple-200",
      badgeBg: "bg-purple-100",
    };
  }
  return {
    title: "Boutique Vendeur",
    subtitle: "Produit externe — Commission",
    icon: Users,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    badgeBg: "bg-blue-100",
  };
}

/* ──────────────────────────────────────────────
   Badge variante choisie (mini)
   ────────────────────────────────────────────── */
function VariantBadge({ label, color, colorHex }: {
  label: string | null; color: string | null; colorHex: string | null;
}) {
  if (!label && !color) return null;
  const display = label ?? color ?? "";
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5 text-[10px] font-medium text-gray-700">
      {colorHex ? (
        <span className="w-2.5 h-2.5 rounded-full border border-gray-300/50" style={{ backgroundColor: colorHex }} />
      ) : (
        <Tag className="h-2.5 w-2.5 text-gray-400" />
      )}
      {display}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   ÉCRAN DÉTAIL PRODUIT — Slide-in overlay
   ═══════════════════════════════════════════════ */
function ProductDetail({
  item,
  onBack,
  onClose,
  onViewVendor,
}: {
  item: OrderItemDetail;
  onBack: () => void;
  onClose: () => void;
  onViewVendor: (v: VendorFullInfo) => void;
}) {
  const [activeImg, setActiveImg] = useState(0);
  const vLabel = vendorLabel(item.is_admin_shop);
  const VIcon = vLabel.icon;

  const images = item.all_images.length > 0 ? item.all_images : (item.product_image ? [item.product_image] : []);

  return (
    <div className="absolute inset-0 z-[60] bg-white flex flex-col animate-slide-in">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-2 px-3 py-3 border-b shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-0.5 text-sm text-orange-600 font-medium hover:bg-orange-50 rounded-lg px-2 py-1.5 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Retour</span>
        </button>
        <h3 className="flex-1 text-sm font-bold truncate text-center pr-16">{item.product_name}</h3>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      {/* ─── Scrollable content ─── */}
      <div className="overflow-y-auto flex-1 pb-6">
        {/* ─── Galerie images ─── */}
        <div className="relative bg-gray-100">
          <div className="aspect-square max-h-[50vh] flex items-center justify-center">
            {images.length > 0 ? (
              <img
                src={images[activeImg]}
                alt={item.product_name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-300">
                <ImageOff className="h-16 w-16" />
                <span className="text-sm">Aucune image</span>
              </div>
            )}
          </div>

          {/* Compteur d'images */}
          {images.length > 1 && (
            <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium rounded-full px-2.5 py-1">
              {activeImg + 1} / {images.length}
            </div>
          )}

          {/* Flèches navigation */}
          {images.length > 1 && (
            <>
              <button
                onClick={() => setActiveImg((i) => Math.max(0, i - 1))}
                className={`absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center transition-opacity ${activeImg === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
              >
                <ChevronLeft className="h-5 w-5 text-gray-700" />
              </button>
              <button
                onClick={() => setActiveImg((i) => Math.min(images.length - 1, i + 1))}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center transition-opacity ${activeImg === images.length - 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
              >
                <ChevronRight className="h-5 w-5 text-gray-700" />
              </button>
            </>
          )}
        </div>

        {/* ─── Thumbnails ─── */}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3 snap-x snap-mandatory">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImg(i)}
                className={`snap-start shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${i === activeImg ? 'border-orange-500' : 'border-transparent'}`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="px-4 space-y-4 mt-2">
          {/* ─── Nom + Désignation ─── */}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{item.product_name}</h1>
            {item.designation && (
              <p className="text-sm text-gray-500 mt-1">{item.designation}</p>
            )}
          </div>

          {/* ─── Description ─── */}
          {item.description && (
            <div className="bg-gray-50 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{item.description}</p>
            </div>
          )}

          {/* ─── Variante choisie ─── */}
          {(item.size || item.color) && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-orange-700 font-semibold text-sm">
                <CircleDot className="h-4 w-4" />
                Variante choisie par le client
              </div>
              <div className="flex flex-wrap gap-4">
                {item.size && (
                  <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm">
                    <Ruler className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Taille</span>
                    <span className="text-sm font-bold text-gray-900 ml-1">{item.size}</span>
                  </div>
                )}
                {item.color && (
                  <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm">
                    <Palette className="h-4 w-4 text-gray-400" />
                    {item.color_hex && (
                      <span className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: item.color_hex }} />
                    )}
                    <span className="text-sm text-gray-500">Couleur</span>
                    <span className="text-sm font-bold text-gray-900 ml-1">{item.color}</span>
                  </div>
                )}
              </div>
              {item.variant_label && (
                <div className="text-xs text-orange-600 font-medium">
                  Référence: {item.variant_label}
                </div>
              )}
            </div>
          )}

          {/* ─── Source / Boutique (cliquable) ─── */}
          {item.vendor ? (
            <button
              onClick={() => onViewVendor(item.vendor!)}
              className={`w-full rounded-xl border p-4 ${vLabel.bg} hover:shadow-md transition-all text-left`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${vLabel.badgeBg}`}>
                  <VIcon className={`h-5 w-5 ${vLabel.color}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-bold ${vLabel.color}`}>
                    {item.shop_type_label ?? vLabel.title}
                  </div>
                <div className="text-xs text-gray-500">{vLabel.subtitle}</div>
              </div>
            </div>
            {item.shop_name && item.shop_name !== "Source inconnue" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 bg-white/60 rounded-lg px-3 py-2">
                <Store className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{item.shop_name}</span>
                {item.owner_name && item.owner_name !== item.shop_name && (
                  <span className="text-gray-400">({item.owner_name})</span>
                )}
              </div>
            )}
            {/* Indicateur cliquable */}
            <div className="mt-2 text-xs text-orange-600 font-medium flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              Voir la fiche vendeur
            </div>
          </button>
        ) : (
          <div className={`rounded-xl border p-4 ${vLabel.bg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${vLabel.badgeBg}`}>
                <VIcon className={`h-5 w-5 ${vLabel.color}`} />
              </div>
              <div>
                <div className={`text-sm font-bold ${vLabel.color}`}>{item.shop_type_label ?? vLabel.title}</div>
                <div className="text-xs text-gray-500">{vLabel.subtitle}</div>
              </div>
            </div>
          </div>
        )}

          {/* ─── Prix & Commission ─── */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Détail financier</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Quantité commandée</span>
              <span className="text-sm font-bold">{item.quantity}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Prix unitaire</span>
              <span className="text-sm font-bold">{fmtF(item.unit_price)}</span>
            </div>
            {item.commission_rate && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-orange-600">Commission ({item.commission_rate}%)</span>
                <span className="text-sm font-bold text-orange-600">
                  {item.commission_amount ? fmtF(item.commission_amount) : `~${fmtF(item.line_total * item.commission_rate / 100)}`}
                </span>
              </div>
            )}
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-base font-bold text-gray-900">Total ligne</span>
              <span className="text-xl font-bold text-gray-900">{fmtF(item.line_total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ═══════════════════════════════════════════════ */
export function OrderItemsPanel({ orderId, onClose }: Props) {
  const [data, setData] = useState<OrderItemsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emptyMsg, setEmptyMsg] = useState("");
  const [detailItem, setDetailItem] = useState<OrderItemDetail | null>(null);
  const [viewVendor, setViewVendor] = useState<VendorFullInfo | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Aucune commande sélectionnée.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setEmptyMsg("");
    setDetailItem(null);
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

  // Fermer le détail avec Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (detailItem) setDetailItem(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [detailItem, onClose]);

  const handleItemClick = useCallback((item: OrderItemDetail) => {
    setDetailItem(item);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[85vh] flex flex-col relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ═══ Overlay Détail Produit ═══ */}
        {detailItem && (
          <ProductDetail
            item={detailItem}
            onBack={() => setDetailItem(null)}
            onClose={onClose}
            onViewVendor={(v) => { setDetailItem(null); setViewVendor(v); }}
          />
        )}

        {/* ═══ Overlay Fiche Vendeur ═══ */}
        {viewVendor && (
          <VendorDetailPanel
            vendor={viewVendor}
            onClose={() => setViewVendor(null)}
          />
        )}

        {/* ═══ Header ═══ */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-600" />
            <h3 className="text-base font-bold">Articles de la commande</h3>
            {data && data.items.length > 0 && (
              <span className="text-xs text-gray-500">({data.items.length})</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* ═══ Content ═══ */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Chargement des articles...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 text-red-600 bg-red-50 rounded-xl p-4 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Empty */}
          {emptyMsg && (
            <div className="flex flex-col items-center gap-3 text-amber-600 bg-amber-50 rounded-xl p-8 text-center">
              <Package className="h-10 w-10 text-amber-300" />
              <p className="text-sm font-medium">{emptyMsg}</p>
            </div>
          )}

          {/* Data */}
          {data && data.items.length > 0 && (
            <>
              {/* ─── Résumé par boutique ─── */}
              {data.vendor_summary.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source des articles</h4>
                  {data.vendor_summary.map((v) => {
                    const label = vendorLabel(v.is_admin);
                    const VIcon = label.icon;
                    const vFull = data.items.find(i => i.shop_id === v.vendor_id)?.vendor ?? null;
                    return (
                      <button
                        key={v.vendor_id}
                        onClick={() => vFull && setViewVendor(vFull)}
                        className={`w-full rounded-xl border p-3.5 ${label.bg} text-left ${vFull ? "hover:shadow-md cursor-pointer" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <VIcon className={`h-4 w-4 ${label.color}`} />
                            <div>
                              <div className={`text-sm font-bold ${label.color}`}>
                                {v.shop_type_label ?? label.title}
                              </div>
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                {v.shop_name} &bull; {v.item_count} article{v.item_count > 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="text-sm font-bold text-gray-900">{fmtF(v.total)}</div>
                            {vFull && <ChevronRight className="h-4 w-4 text-gray-400" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ─── Liste des articles ─── */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Détail des articles</h4>
                {data.items.map((item, idx) => (
                  <div
                    key={`${item.product_id}-${idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleItemClick(item)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleItemClick(item); }}
                    className="w-full flex items-start gap-3 bg-white border rounded-xl p-3 cursor-pointer hover:shadow-lg hover:border-orange-300 transition-all duration-200 group"
                  >
                    {/* ── Image (variante prioritaire) ── */}
                    <div className="shrink-0 w-16 h-16 bg-gray-100 rounded-xl overflow-hidden relative">
                      {item.product_image ? (
                        <img
                          src={item.product_image}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                      {/* Badge variante */}
                      {(item.variant_label || item.color) && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[8px] text-center py-1 truncate px-1 font-medium">
                          {item.variant_label ?? item.color}
                        </div>
                      )}
                    </div>

                    {/* ── Info ── */}
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="text-sm font-semibold text-gray-900 truncate group-hover:text-orange-700 transition-colors">
                        {item.product_name}
                      </div>
                      {item.designation && (
                        <div className="text-[11px] text-gray-400 truncate mt-0.5">{item.designation}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-gray-500">
                          Qty: <strong>{item.quantity}</strong>
                        </span>
                        <span className="text-[11px] text-gray-300">&middot;</span>
                        <span className="text-[11px] text-gray-500">{fmtF(item.unit_price)}</span>
                      </div>

                      {/* Variante */}
                      {(item.variant_label || item.color) && (
                        <div className="mt-1.5">
                          <VariantBadge label={item.variant_label} color={item.color} colorHex={item.color_hex} />
                        </div>
                      )}

                      {/* Boutique (cliquable -> fiche vendeur) */}
                      {item.shop_name && item.shop_name !== "Source inconnue" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.vendor) setViewVendor(item.vendor);
                          }}
                          className="flex items-center gap-1 mt-1.5 hover:bg-gray-50 rounded px-1 py-0.5 -ml-1 transition-colors"
                        >
                          {item.is_admin_shop ? (
                            <ShieldCheck className="h-3 w-3 text-purple-500" />
                          ) : (
                            <Users className="h-3 w-3 text-blue-500" />
                          )}
                          <span className={`text-[10px] font-semibold ${item.is_admin_shop ? "text-purple-600" : "text-blue-600"}`}>
                            {item.shop_type_label ?? (item.is_admin_shop ? "Officielle" : "Vendeur")}
                          </span>
                          <span className="text-[10px] text-gray-400">&middot; {item.shop_name}</span>
                          {item.vendor && <ChevronRight className="h-2.5 w-2.5 text-gray-300" />}
                        </button>
                      )}
                    </div>

                    {/* ── Prix + Flèche ── */}
                    <div className="shrink-0 text-right flex flex-col items-end justify-center py-0.5">
                      <div className="text-sm font-bold text-gray-900">{fmtF(item.line_total)}</div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-orange-500 transition-colors mt-1" />
                    </div>
                  </div>
                ))}
              </div>

              {/* ─── Total ─── */}
              <div className="border-t pt-4 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Total articles</span>
                  <span className="text-xl font-bold text-gray-900">{fmtF(data.order_total)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ═══ Footer ═══ */}
        <div className="border-t p-4 shrink-0">
          <button
            onClick={onClose}
            className="w-full h-12 bg-orange-600 text-white rounded-xl font-semibold text-sm hover:bg-orange-700 active:bg-orange-800 transition-colors shadow-sm"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}