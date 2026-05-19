import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CheckoutSchema = z.object({
  destinationCountryId: z.string().uuid(),
  shippingServiceId: z.string().uuid().nullable().optional(),
  address: z.object({
    full_name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(20),
    address: z.string().trim().min(3).max(300),
    city: z.string().trim().min(2).max(100),
    note: z.string().trim().max(500).nullable().optional(),
  }),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable().optional(),
    quantity: z.number().int().min(1).max(99),
    customization: z.unknown().nullable().optional(),
  })).min(1).max(100),
});

export const createCheckoutOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CheckoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    const requestId = crypto.randomUUID();
    const productIds = Array.from(new Set(data.items.map((item) => item.productId)));
    const variantIds = Array.from(new Set(data.items.map((item) => item.variantId).filter((id): id is string => !!id)));

    console.info("[checkout.server] create start", {
      requestId,
      buyerId: context.userId,
      destinationCountryId: data.destinationCountryId,
      itemCount: data.items.length,
      productIds,
      variantIds,
    });

    try {
      const [{ data: products, error: productsError }, { data: variants, error: variantsError }] = await Promise.all([
        supabaseAdmin
          .from("products")
          .select("id, name, code, price, vendor_id, status, is_active, product_images(url), profiles:vendor_id(vendor_mode, vendor_status, access_ends_at, is_admin_shop)")
          .in("id", productIds),
        variantIds.length
          ? supabaseAdmin
              .from("product_variants")
              .select("id, product_id, size, color, price_override")
              .in("id", variantIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (productsError) throw new Error(`Lecture produits: ${productsError.message}`);
      if (variantsError) throw new Error(`Lecture variantes: ${variantsError.message}`);

      const productMap = new Map((products ?? []).map((product: any) => [product.id, product]));
      const variantMap = new Map((variants ?? []).map((variant: any) => [variant.id, variant]));
      let total = 0;

      const orderRows = await Promise.all(data.items.map(async (item) => {
        const product = productMap.get(item.productId) as any;
        if (!product) throw new Error("Un produit du panier est introuvable ou indisponible.");
        if (!product.is_active || product.status !== "approved") throw new Error(`Produit indisponible: ${product.name}`);

        const variant = item.variantId ? variantMap.get(item.variantId) as any : null;
        if (item.variantId && (!variant || variant.product_id !== item.productId)) {
          throw new Error(`Variante invalide pour le produit: ${product.name}`);
        }

        const { data: priceRows, error: priceError } = await (supabaseAdmin as any).rpc("get_product_display_price", {
          _product_id: item.productId,
          _variant_id: item.variantId ?? null,
          _destination_country_id: data.destinationCountryId,
        });
        if (priceError) throw new Error(`Calcul prix: ${priceError.message}`);

        const price = Array.isArray(priceRows) ? priceRows[0] : null;
        const unitPrice = Number(price?.final_price ?? variant?.price_override ?? product.price ?? 0);
        total += unitPrice * item.quantity;

        return {
          product_id: item.productId,
          variant_id: item.variantId ?? null,
          vendor_id: product.vendor_id,
          buyer_id: context.userId,
          product_name: product.name,
          product_code: product.code,
          product_image_url: product.product_images?.[0]?.url ?? null,
          size: variant?.size ?? null,
          color: variant?.color ?? null,
          unit_price: unitPrice,
          quantity: item.quantity,
          customization: item.customization ?? null,
        };
      }));

      const orderId = crypto.randomUUID();
      const { error: orderError } = await supabaseAdmin.from("orders").insert({
        id: orderId,
        buyer_id: context.userId,
        total,
        status: "new",
        customer_name: data.address.full_name,
        customer_phone: data.address.phone,
        address: data.address.address,
        city: data.address.city,
        note: data.address.note ?? null,
        destination_country_id: data.destinationCountryId,
      });
      if (orderError) throw new Error(`Création commande: ${orderError.message}`);

      const { error: itemsError } = await supabaseAdmin
        .from("order_items")
        .insert(orderRows.map((row) => ({ ...row, order_id: orderId })) as any);
      if (itemsError) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error(`Création articles commande: ${itemsError.message}`);
      }

      console.info("[checkout.server] create saved", { requestId, orderId, buyerId: context.userId, total, itemCount: orderRows.length });
      return { orderId, total };
    } catch (error) {
      console.error("[checkout.server] create failed", { requestId, buyerId: context.userId, error });
      throw error;
    }
  });