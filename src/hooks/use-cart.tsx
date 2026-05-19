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
}

interface GuestCartLine {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  customization: Record<string, unknown> | null;
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
        `id, name, name_i18n, code, price, vendor_id, requires_international_shipping, product_images(url), profiles:vendor_id(full_name, shop_name, vendor_mode, is_admin_shop, source_country_id)`,
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
      if (user) {
        const { data, error } = await supabase
          .from("cart_items")
          .select(
            `id, quantity, variant_id, product_id, customization, created_at,
             products!inner(id, name, name_i18n, code, price, vendor_id, requires_international_shipping, product_images(url), profiles:vendor_id(full_name, shop_name, vendor_mode, is_admin_shop, source_country_id)),
             product_variants(id, size, color, color_hex, price_override)`,
          )
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as any[];
      }
      return (await hydrateGuestLines(readGuestCart())) as any[];
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

  const refresh = () => qc.invalidateQueries({ queryKey: ["cart"] });

  const addToCart = async (input: AddToCartInput) => {
    const qty = input.quantity ?? 1;

    if (!user) {
      // Guest cart
      const lines = readGuestCart();
      const idx = lines.findIndex(
        (l) =>
          l.product_id === input.productId &&
          (l.variant_id ?? null) === (input.variantId ?? null) &&
          !input.customization,
      );
      if (idx >= 0 && !input.customization) {
        lines[idx].quantity += qty;
      } else {
        lines.unshift({
          id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          product_id: input.productId,
          variant_id: input.variantId ?? null,
          quantity: qty,
          customization: input.customization ?? null,
          created_at: new Date().toISOString(),
        });
      }
      writeGuestCart(lines);
      toast.success(t("product.added_to_cart"));
      refresh();
      return true;
    }

    // Look for an existing identical line
    let existingQuery = supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("product_id", input.productId);
    existingQuery = input.variantId
      ? existingQuery.eq("variant_id", input.variantId)
      : existingQuery.is("variant_id", null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing && !input.customization) {
      const { error } = await supabase
        .from("cart_items")
        .update({ quantity: existing.quantity + qty })
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    } else {
      const { error } = await supabase.from("cart_items").insert({
        user_id: user.id,
        product_id: input.productId,
        variant_id: input.variantId ?? null,
        quantity: qty,
        customization: (input.customization ?? null) as never,
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

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity <= 0) return removeItem(id);
    if (!user) {
      const lines = readGuestCart().map((l) => (l.id === id ? { ...l, quantity } : l));
      writeGuestCart(lines);
      refresh();
      return;
    }
    const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const removeItem = async (id: string) => {
    if (!user) {
      writeGuestCart(readGuestCart().filter((l) => l.id !== id));
      refresh();
      return;
    }
    const { error } = await supabase.from("cart_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  return { items: items ?? [], count, addToCart, updateQuantity, removeItem, refresh };
}
