import { useState, useEffect } from "react";
import { X, Package, Store, ChevronRight, Loader2, AlertCircle, ShieldCheck, Users, ImageOff } from "lucide-react";
import { fmtF } from "@/cockpit/lib/workflow";

interface Props { orderId: string; onClose: () => void; }

const SUPABASE_URL = "https://qdwdfkalyqpccdhtlebr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkd2Rma2FseXFwY2NkaHRsZWJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjQzMDcsImV4cCI6MjA5NDM0MDMwN30.-1LqeU08011FXIYirAXBzQ4wfKY78sXrECGngHbIfAk";

interface ItemData {
  product_id: string;
  product_name: string;
  product_designation: string | null;
  product_description: string | null;
  product_image: string | null;
  all_images: string[];
  quantity: number;
  unit_price: number;
  line_total: number;
  shop_name: string | null;
  owner_name: string | null;
  is_admin_shop: boolean;
  commission_rate: number | null;
}

function shopBadge(isAdmin: boolean) {
  if (isAdmin) return { label: "Boutique Officielle", sub: "Kawzone", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", Icon: ShieldCheck };
  return { label: "Boutique Vendeur", sub: "Partenaire", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", Icon: Users };
}

async function fetchOrderItems(orderId: string): Promise<{ items: ItemData[]; order_total: number; vendor_summary: any[] } | null> {
  try {
    // 1. Order items
    const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/order_items?select=product_id,quantity&order_id=eq.${orderId}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const items = await itemsRes.json();
    if (!items || items.length === 0) return { items: [], order_total: 0, vendor_summary: [] };

    const productIds = items.map((i: any) => i.product_id).filter(Boolean);

    // 2. Products
    const prodsRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,designation,description,price,vendor_id,commission_rate&id=in.(${productIds.join(",")})`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const products = await prodsRes.json();
    console.log("[fetchOrderItems] products:", products?.length, products?.[0]);

    // 3. Images
    const imgsRes = await fetch(`${SUPABASE_URL}/rest/v1/product_images?select=product_id,url&product_id=in.(${productIds.join(",")})&order=position.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const images = await imgsRes.json();
    const imageMap = new Map<string, string>();
    const allImagesMap = new Map<string, string[]>();
    for (const img of images ?? []) {
      if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.url);
      if (!allImagesMap.has(img.product_id)) allImagesMap.set(img.product_id, []);
      allImagesMap.get(img.product_id)!.push(img.url);
    }

    // 4. Vendors (profiles)
    const vendorIds = Array.from(new Set((products ?? []).map((p: any) => p.vendor_id).filter(Boolean)));
    let vendorMap = new Map<string, { full_name: string; shop_name: string; is_admin_shop: boolean }>();
    if (vendorIds.length > 0) {
      const vendRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,full_name,shop_name,is_admin_shop&id=in.(${vendorIds.join(",")})`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      });
      const vendors = await vendRes.json();
      console.log("[fetchOrderItems] vendors:", vendors?.length);
      for (const v of vendors ?? []) {
        vendorMap.set(v.id, { full_name: v.full_name ?? "—", shop_name: v.shop_name ?? null, is_admin_shop: v.is_admin_shop ?? false });
      }
    }

    // 5. Assemble
    const vendorGroups = new Map<string, any>();
    const detailedItems: ItemData[] = items.map((it: any, idx: number) => {
      const prod = (products ?? []).find((p: any) => p.id === it.product_id);
      const vendor = prod?.vendor_id ? vendorMap.get(prod.vendor_id) : null;
      const qty = it.quantity ?? 1;
      const price = prod?.price ?? 0;
      const lineTotal = qty * price;

      const vId = prod?.vendor_id ?? "unknown";
      const existing = vendorGroups.get(vId);
      if (existing) { existing.item_count += qty; existing.total += lineTotal; }
      else {
        vendorGroups.set(vId, {
          vendor_id: vId, vendor_name: vendor?.full_name ?? "—",
          shop_name: vendor?.shop_name ?? "Non identifié", item_count: qty, total: lineTotal, is_admin: vendor?.is_admin_shop ?? false,
        });
      }

      return {
        product_id: it.product_id ?? "",
        product_name: prod?.name ?? `Article ${idx + 1}`,
        product_designation: prod?.designation ?? null,
        product_description: prod?.description ?? null,
        product_image: imageMap.get(it.product_id ?? "") ?? null,
        all_images: allImagesMap.get(it.product_id ?? "") ?? [],
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
        shop_name: vendor?.shop_name ?? vendor?.full_name ?? null,
        owner_name: vendor?.full_name ?? null,
        is_admin_shop: vendor?.is_admin_shop ?? false,
        commission_rate: prod?.commission_rate ?? null,
      };
    });

    const total = detailedItems.reduce((s, i) => s + i.line_total, 0);
    return {
      items: detailedItems,
      order_total: total,
      vendor_summary: Array.from(vendorGroups.values()),
    };
  } catch (e) {
    console.error("[fetchOrderItems] ERROR:", e);
    return null;
  }
}

export function OrderItemsPanel({ orderId, onClose }: Props) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailItem, setDetailItem] = useState<ItemData | null>(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    setLoading(true);
    fetchOrderItems(orderId).then((result) => {
      if (result) {
        setItems(result.items);
        setOrderTotal(result.order_total);
        setVendors(result.vendor_summary);
      }
      setLoading(false);
    });
  }, [orderId]);

  if (detailItem) {
    const badge = shopBadge(detailItem.is_admin_shop);
    const Icon = badge.Icon;
    return (
      <div className="fixed inset-0 z-[110] bg-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <button onClick={() => setDetailItem(null)} className="flex items-center gap-1 text-sm text-orange-600 font-medium"><ChevronRight className="h-4 w-4 rotate-180" />Retour</button>
          <h3 className="text-sm font-bold truncate max-w-[200px]">{detailItem.product_designation ?? detailItem.product_name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {detailItem.all_images.length > 0 ? (
            <div className="space-y-2">
              <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden"><img src={detailItem.all_images[0]} alt={detailItem.product_name} className="w-full h-full object-cover" /></div>
              {detailItem.all_images.length > 1 && <div className="flex gap-2 overflow-x-auto snap-x pb-1">{detailItem.all_images.map((img, i) => <div key={i} className="snap-start shrink-0 w-20 h-20 bg-gray-100 rounded-lg overflow-hidden"><img src={img} alt={`${i+1}`} className="w-full h-full object-cover" /></div>)}</div>}
            </div>
          ) : <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center text-gray-300"><ImageOff className="h-16 w-16" /></div>}

          {detailItem.product_designation && <h2 className="text-lg font-bold text-gray-900">{detailItem.product_designation}</h2>}
          {!detailItem.product_designation && <h2 className="text-lg font-bold text-gray-900">{detailItem.product_name}</h2>}
          {detailItem.product_description && <p className="text-sm text-gray-600 leading-relaxed">{detailItem.product_description}</p>}

          <div className={`rounded-lg border p-3 ${badge.bg}`}>
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${badge.color}`} />
              <div>
                <div className={`text-sm font-semibold ${badge.color}`}>{badge.label}</div>
                <div className="text-xs text-gray-500">{badge.sub}</div>
              </div>
            </div>
            {detailItem.shop_name && (
              <div className="mt-2 flex items-center gap-1 text-xs">
                <Store className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-medium text-gray-700">{detailItem.shop_name}</span>
                {detailItem.owner_name && detailItem.owner_name !== detailItem.shop_name && <span className="text-gray-400">— {detailItem.owner_name}</span>}
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between"><span className="text-sm text-gray-500">Quantité</span><span className="text-sm font-semibold">{detailItem.quantity}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-500">Prix unitaire</span><span className="text-sm font-semibold">{fmtF(detailItem.unit_price)}</span></div>
            {detailItem.commission_rate && <div className="flex justify-between"><span className="text-sm text-gray-500">Commission</span><span className="text-sm font-semibold text-orange-600">{detailItem.commission_rate}%</span></div>}
            <div className="border-t pt-2 flex justify-between"><span className="text-sm font-bold">Total</span><span className="text-lg font-bold">{fmtF(detailItem.line_total)}</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2"><Package className="h-5 w-5 text-orange-600" /><h3 className="text-base font-bold">Articles</h3><span className="text-xs text-gray-500">({items.length})</span></div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {loading && <div className="flex justify-center py-12 gap-2 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /><span>Chargement...</span></div>}
          {!loading && items.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium">Aucun article</p>
              <p className="text-xs text-gray-400 mt-1">Vérifiez la console (F12) pour les erreurs.</p>
            </div>
          )}
          {items.length > 0 && (
            <>
              {vendors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase">Source</h4>
                  {vendors.map((v) => {
                    const badge = shopBadge(v.is_admin);
                    const Icon = badge.Icon;
                    return (
                      <div key={v.vendor_id} className={`rounded-lg border p-3 ${badge.bg}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${badge.color}`} />
                            <div>
                              <div className={`text-sm font-semibold ${badge.color}`}>{badge.label}</div>
                              <div className="text-[10px] text-gray-500">{v.shop_name} • {v.item_count} article{v.item_count > 1 ? "s" : ""}</div>
                            </div>
                          </div>
                          <div className="text-sm font-bold">{fmtF(v.total)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase">Détail</h4>
                {items.map((item, idx) => (
                  <button key={`${item.product_id}-${idx}`} onClick={() => setDetailItem(item)} className="w-full flex items-start gap-3 bg-white border rounded-lg p-3 text-left hover:shadow-md transition-shadow">
                    <div className="shrink-0 w-14 h-14 bg-gray-100 rounded-lg overflow-hidden">
                      {item.product_image ? <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Package className="h-6 w-6" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.product_designation ?? item.product_name}</div>
                      {item.product_description && <div className="text-[10px] text-gray-400 truncate">{item.product_description}</div>}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">Qty: <b>{item.quantity}</b></span>
                        <span className="text-[10px] text-gray-400">×</span>
                        <span className="text-[10px] text-gray-500">{fmtF(item.unit_price)}</span>
                      </div>
                      {item.shop_name ? (
                        <div className="flex items-center gap-1 mt-1">
                          {item.is_admin_shop ? <ShieldCheck className="h-3 w-3 text-purple-500" /> : <Users className="h-3 w-3 text-blue-500" />}
                          <span className={`text-[10px] font-medium ${item.is_admin_shop ? "text-purple-600" : "text-blue-600"}`}>{item.is_admin_shop ? "Officielle" : "Vendeur"}</span>
                          <span className="text-[10px] text-gray-400">— {item.shop_name}</span>
                        </div>
                      ) : <div className="flex items-center gap-1 mt-1"><Store className="h-3 w-3 text-gray-400" /><span className="text-[10px] text-gray-400">Source non identifiée</span></div>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold">{fmtF(item.line_total)}</div>
                      <ChevronRight className="h-4 w-4 text-gray-300 mt-1 ml-auto" />
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="text-sm font-semibold">Total articles</span>
                <span className="text-lg font-bold">{fmtF(orderTotal)}</span>
              </div>
            </>
          )}
        </div>
        <div className="border-t p-3 shrink-0">
          <button onClick={onClose} className="w-full h-11 bg-orange-600 text-white rounded-lg font-medium text-sm hover:bg-orange-700">Fermer</button>
        </div>
      </div>
    </div>
  );
}
