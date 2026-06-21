import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/hooks/use-i18n";

export const GUEST_CART_KEY = "kawzone.guest_cart.v1";

export interface AddToCartInput {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  customization?: Record<string, unknown> | null;
  shippingServiceId?: string | null;
}

interface GuestCartLine {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  customization: Record<string, unknown> | null;
  shipping_service_id?: string | null;
  created_at: string;
}

function readGuestCart(): GuestCartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuestCart(lines: GuestCartLine[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event("guest-cart-changed"));
}

export function clearGuestCart() {
  writeGuestCart([]);
}

function stripCartInternalMetadata(c: any) {
  if (!c || typeof c !== "object") return null;
  const { __shipping_service_id, __line_kind, __sub_order_key, __freight_fee, ...rest } = c as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : null;
}

function cartLineSignature(productId: string, variantId: string | null | undefined, customization: any) {
  return `${productId}::${variantId ?? ""}::${JSON.stringify(stripCartInternalMetadata(customization))}`;
}

async function hydrateGuestLines(lines: GuestCartLine[]) {
  if (lines.length === 0) return [];
  const productIds = Array.from(new Set(lines.map((l) => l.product_id)));
  const variantIds = Array.from(
    new Set(lines.map((l) => l.variant_id).filter((v): v is string => !!v)),
  );

  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, name, name_i18n, code, price, vendor_id, weight_kg, length_cm, width_cm, height_cm, min_order_qty, warranty_days, is_fragile, product_images(url), profiles:vendor_id(full_name, shop_name, vendor_mode, is_admin_shop, source_country_id)`,
      )
      .in("id", productIds),
    variantIds.length
      ? supabase
          .from("product_variants")
          .select("id, size, color, color_hex, price_override")
          .in("id", variantIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const pMap = new Map((products ?? []).map((p: any) => [p.id, p]));
  const vMap = new Map((variants ?? []).map((v: any) => [v.id, v]));

  return lines.flatMap((l) => {
    const p = pMap.get(l.product_id);
    if (!p) return [];
    return [{
      id: l.id,
      product_id: l.product_id,
      variant_id: l.variant_id,
      quantity: l.quantity,
      customization: l.customization,
      shipping_service_id: null,
      created_at: l.created_at,
      products: p,
      product_variants: l.variant_id ? vMap.get(l.variant_id) ?? null : null,
    }];
  });
}

export function useCart() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();

  const queryKey = ["cart", user?.id ?? "guest"];

  const { data: items } = useQuery<any[]>({
    queryKey,
    queryFn: async () => {
      let raw: any[] = [];
      if (user) {
        const { data, error } = await supabase
          .from("cart_items")
          .select(
            `id, quantity, variant_id, product_id, customization, created_at,
             products!inner(id, name, name_i18n, code, price, vendor_id, weight_kg, length_cm, width_cm, height_cm, min_order_qty, warranty_days, is_fragile, product_images(url), profiles:vendor_id(full_name, shop_name, vendor_mode, is_admin_shop, source_country_id)),
             product_variants(id, size, color, color_hex, price_override)`,
          )
          .order("created_at", { ascending: false });
        if (error) throw error;
        raw = (data ?? []) as any[];
      } else {
        raw = (await hydrateGuestLines(readGuestCart())) as any[];
      }
      // Render-side dedupe : merge duplicate rows by (product_id, variant_id, clean customization).
      // Les métadonnées logistiques historiques sont ignorées dans la signature.
      const byKey = new Map<string, any>();
      for (const it of raw) {
        const sig = cartLineSignature(it.product_id, it.variant_id, it.customization);
        const existing = byKey.get(sig);
        if (existing) {
          existing.quantity = (existing.quantity ?? 0) + (it.quantity ?? 0);
          existing.__duplicate_ids = [...(existing.__duplicate_ids ?? []), it.id];
        } else {
          byKey.set(sig, { ...it, __duplicate_ids: [] });
        }
      }
      return Array.from(byKey.values());
    },
  });

  // React to guest-cart updates from other components / tabs
  useEffect(() => {
    if (user) return;
    const onChange = () => qc.invalidateQueries({ queryKey: ["cart", "guest"] });
    window.addEventListener("guest-cart-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("guest-cart-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [user, qc]);

  const count = (items ?? []).reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);

  const refresh = async () => {
    // Force a refetch so the cart selector (incl. weight_kg / source_country_id
    // used by the logistics rules) updates immediately after add/update/remove,
    // even when the cart query has no active observer yet.
    await qc.refetchQueries({ queryKey: ["cart"], type: "all" });
    // Display prices depend on cart line composition; refresh them too.
    qc.invalidateQueries({ queryKey: ["display-prices"] });
  };

  const addToCart = async (input: AddToCartInput) => {
    let qty = input.quantity ?? 1;
    // Récupère la quantité minimale exigée par le produit (publique, sans auth).
    try {
      const { data: prodInfo } = await supabase
        .from("products")
        .select("min_order_qty")
        .eq("id", input.productId)
        .maybeSingle();
      const minQ = Math.max(1, Math.round(Number((prodInfo as any)?.min_order_qty ?? 1) || 1));
      if (qty < minQ) {
        qty = minQ;
        toast.message(`Quantité ajustée au minimum requis : ${minQ} unité${minQ > 1 ? "s" : ""}.`);
      }
    } catch { /* ignore — fallback to qty as-is */ }
    // Customization client UNIQUEMENT (text/image/font/color…). __shipping_service_id
    // n'est plus stocké ici : le choix de transport est fait au panier (par section)
    // et au checkout (par ligne). Cela garantit que les ajouts identiques se mergent.
    const baseCustomization = stripCartInternalMetadata(input.customization);
    const customization = baseCustomization;


    if (!user) {
      // Guest cart
      const lines = readGuestCart();
      const targetSig = cartLineSignature(input.productId, input.variantId, baseCustomization);
      const idx = lines.findIndex(
        (l) => cartLineSignature(l.product_id, l.variant_id, l.customization) === targetSig,
      );
      if (idx >= 0) {
        lines[idx].quantity += qty;
      } else {
        lines.unshift({
          id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          product_id: input.productId,
          variant_id: input.variantId ?? null,
          quantity: qty,
          customization,
          shipping_service_id: null,
          created_at: new Date().toISOString(),
        });
      }
      writeGuestCart(lines);
      toast.success(t("product.added_to_cart"));
      refresh();
      return true;
    }

    // Look for ALL existing rows (product + variant). Multiple rows can exist
    // due to legacy data — we collapse them into a single row.
    let existingQuery = supabase
      .from("cart_items")
      .select("id, quantity, customization")
      .eq("user_id", user.id)
      .eq("product_id", input.productId);
    existingQuery = input.variantId
      ? existingQuery.eq("variant_id", input.variantId)
      : existingQuery.is("variant_id", null);
    const { data: existingRows } = await existingQuery;

    // Mergeable rows = rows whose meaningful customization matches new input.
    const targetSig = JSON.stringify(stripCartInternalMetadata(baseCustomization));
    const mergeable = (existingRows ?? []).filter(
      (r: any) => JSON.stringify(stripCartInternalMetadata(r.customization)) === targetSig,
    );

    if (mergeable.length > 0) {
      // Sum all matching rows + new qty, keep the first row, delete the rest.
      const totalQty = mergeable.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0) + qty;
      const keep = mergeable[0];
      const dropIds = mergeable.slice(1).map((r: any) => r.id);
      const { error } = await supabase
        .from("cart_items")
        .update({ quantity: totalQty, customization: customization as never })
        .eq("id", keep.id);
      if (error) { toast.error(error.message); return false; }
      if (dropIds.length > 0) {
        await supabase.from("cart_items").delete().in("id", dropIds);
      }
    } else {
      const { error } = await supabase.from("cart_items").insert({
        user_id: user.id,
        product_id: input.productId,
        variant_id: input.variantId ?? null,
        quantity: qty,
        customization: customization as never,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    toast.success(t("product.added_to_cart"));
    refresh();
    return true;
  };

  // Helper : trouve toutes les lignes DB correspondant à la "même" ligne logique
  // que `id` (même product+variant+customization client). Utilisé pour propager
  // remove/update aux doublons hérités.
  const findSiblingIds = async (id: string): Promise<string[]> => {
    if (!user) return [id];
    const { data: anchor } = await supabase
      .from("cart_items")
      .select("product_id, variant_id, customization")
      .eq("id", id)
      .maybeSingle();
    if (!anchor) return [id];
    const targetSig = JSON.stringify(stripCartInternalMetadata(anchor.customization));
    let q = supabase
      .from("cart_items")
      .select("id, customization")
      .eq("user_id", user.id)
      .eq("product_id", anchor.product_id);
    q = anchor.variant_id ? q.eq("variant_id", anchor.variant_id) : q.is("variant_id", null);
    const { data: rows } = await q;
    const ids = (rows ?? [])
      .filter((r: any) => JSON.stringify(stripCartInternalMetadata(r.customization)) === targetSig)
      .map((r: any) => r.id as string);
    return ids.length > 0 ? ids : [id];
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity <= 0) return removeItem(id);
    // Lookup min_order_qty pour ce produit (via la ligne panier en cache)
    try {
      const cached = (items ?? []).find((it: any) => it.id === id || (it.__duplicate_ids ?? []).includes(id));
      const minQ = Math.max(1, Math.round(Number(cached?.products?.min_order_qty ?? 1) || 1));
      if (quantity < minQ) {
        toast.error(`Quantité minimale de commande : ${minQ} unité${minQ > 1 ? "s" : ""}.`);
        return;
      }
    } catch { /* noop */ }

    if (!user) {
      const current = readGuestCart();
      const anchor = current.find((l) => l.id === id);
      const sig = anchor ? cartLineSignature(anchor.product_id, anchor.variant_id, anchor.customization) : null;
      const lines = sig
        ? current
            .filter((l) => l.id === id || cartLineSignature(l.product_id, l.variant_id, l.customization) !== sig)
            .map((l) => (l.id === id ? { ...l, quantity } : l))
        : current.map((l) => (l.id === id ? { ...l, quantity } : l));
      writeGuestCart(lines);
      refresh();
      return;
    }
    // Si des doublons hérités existent, on en garde un et on supprime les autres
    // pour que la quantité affichée reste cohérente.
    const ids = await findSiblingIds(id);
    const keep = ids[0];
    const drop = ids.slice(1);
    const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", keep);
    if (error) { toast.error(error.message); return; }
    if (drop.length > 0) await supabase.from("cart_items").delete().in("id", drop);
    refresh();
  };

  const removeItem = async (id: string) => {
    if (!user) {
      const current = readGuestCart();
      const anchor = current.find((l) => l.id === id);
      const sig = anchor ? cartLineSignature(anchor.product_id, anchor.variant_id, anchor.customization) : null;
      writeGuestCart(sig
        ? current.filter((l) => cartLineSignature(l.product_id, l.variant_id, l.customization) !== sig)
        : current.filter((l) => l.id !== id)
      );
      refresh();
      return;
    }
    const ids = await findSiblingIds(id);
    const { error } = await supabase.from("cart_items").delete().in("id", ids);
    if (error) toast.error(error.message);
    else refresh();
  };

  /** @deprecated Le transport n'est plus stocké sur une ligne panier. */
  const updateLineShipping = async (id: string, serviceId: string | null) => {
    if (!user) {
      const lines = readGuestCart().map((l) => {
        if (l.id !== id) return l;
        return { ...l, shipping_service_id: null, customization: stripCartInternalMetadata(l.customization) };
      });
      writeGuestCart(lines);
      refresh();
      return;
    }
    // Lire la customization existante puis fusionner
    const { data: row } = await supabase.from("cart_items").select("customization").eq("id", id).maybeSingle();
    const cust = stripCartInternalMetadata(row?.customization);
    const { error } = await supabase.from("cart_items").update({ customization: cust as never }).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  return { items: items ?? [], count, addToCart, updateQuantity, removeItem, updateLineShipping, refresh };
}
