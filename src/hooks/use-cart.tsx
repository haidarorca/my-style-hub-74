import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AddToCartInput {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  customization?: Record<string, unknown> | null;
}

export function useCart() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items } = useQuery({
    queryKey: ["cart", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cart_items")
        .select(
          `id, quantity, variant_id, product_id, customization, created_at,
           products!inner(id, name, code, price, vendor_id, product_images(url), profiles:vendor_id(full_name, shop_name)),
           product_variants(id, size, color, color_hex, price_override)`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const count = (items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);

  const refresh = () => qc.invalidateQueries({ queryKey: ["cart"] });

  const addToCart = async (input: AddToCartInput) => {
    if (!user) {
      toast.error("Connectez-vous pour ajouter au panier");
      return false;
    }
    const qty = input.quantity ?? 1;
    // Look for an existing identical line
    const { data: existing } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("product_id", input.productId)
      .is("variant_id", input.variantId ?? null as never)
      .maybeSingle();

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
    toast.success("Ajouté au panier");
    refresh();
    return true;
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity <= 0) return removeItem(id);
    const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("cart_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  return { items: items ?? [], count, addToCart, updateQuantity, removeItem, refresh };
}
