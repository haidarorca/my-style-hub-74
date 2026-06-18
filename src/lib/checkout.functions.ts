import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyVendorNewOrder } from "@/lib/notifications.functions";

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
    shippingServiceId: z.string().uuid().nullable().optional(),
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
          .select("id, name, code, price, vendor_id, status, is_active, weight_kg, length_cm, width_cm, height_cm, product_images(url), profiles:vendor_id(vendor_mode, vendor_status, access_ends_at, is_admin_shop, source_country_id)")
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

      // ── Frais de transport (Circuit B "poids déclaré") ────────────
      // Si le client a choisi un service ET tous les items ont un poids
      // déclaré > 0, on calcule le fret côté serveur et on l'ajoute au
      // total payé immédiatement. Le client n'aura PAS de paiement
      // complémentaire après pesée — la vérification interne est faite
      // par l'agent logistique.
      let freightFee = 0;
      let chargeableKg = 0;
      let allHaveDeclaredWeight = false;
      let svcPricePerKg: number | null = null;
      if (data.shippingServiceId) {
        const { data: svc } = await (supabaseAdmin as any)
          .from("shipping_services")
          .select("price_per_kg")
          .eq("id", data.shippingServiceId)
          .maybeSingle();
        svcPricePerKg = svc?.price_per_kg != null ? Number(svc.price_per_kg) : null;

        const internationalItems = data.items.filter((it) => {
          const p = productMap.get(it.productId) as any;
          const sourceId = p?.profiles?.source_country_id ?? null;
          return !!sourceId && sourceId !== data.destinationCountryId;
        });
        allHaveDeclaredWeight = internationalItems.length > 0 && internationalItems.every((it) => {
          const p = productMap.get(it.productId) as any;
          return p && Number(p.weight_kg ?? 0) > 0;
        });
        if (allHaveDeclaredWeight && svcPricePerKg != null && svcPricePerKg > 0) {
          for (const it of internationalItems) {
            const p = productMap.get(it.productId) as any;
            const real = Number(p.weight_kg ?? 0);
            const l = Number(p.length_cm ?? 0);
            const w = Number(p.width_cm ?? 0);
            const h = Number(p.height_cm ?? 0);
            const vol = l > 0 && w > 0 && h > 0 ? (l * w * h) / 5000 : 0;
            chargeableKg += Math.max(real, vol) * it.quantity;
          }
          freightFee = Math.round(chargeableKg * svcPricePerKg);
          total += freightFee;
        }
      }

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
        shipping_service_id: data.shippingServiceId ?? null,
        shipping_estimate_note: data.shippingServiceId
          ? (allHaveDeclaredWeight
              ? `Fret inclus (${freightFee.toLocaleString("fr-FR")} FCFA) — vérifié à la réception`
              : "Estimé — sera recalculé après pesée")
          : null,
      } as any);
      if (orderError) throw new Error(`Création commande: ${orderError.message}`);

      // Utiliser le client authentifié (context.supabase) pour order_items
      // car supabaseAdmin n'a pas d'auth.uid() -> trigger RLS qui verifie
      // l'utilisateur bloque avec "Not allowed to update this order"
      const { error: itemsError } = await context.supabase
        .from("order_items")
        .insert(orderRows.map((row) => ({ ...row, order_id: orderId })) as any);
      if (itemsError) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error(`Création articles commande: ${itemsError.message}`);
      }

      // Circuit B — pré-créer l'évaluation avec le fret déjà calculé.
      // L'agent logistique n'aura plus qu'à vérifier le poids à la réception.
      if (allHaveDeclaredWeight && freightFee > 0 && data.shippingServiceId) {
        try {
          await (supabaseAdmin as any)
            .from("order_shipment_assessments")
            .insert({
              order_id: orderId,
              created_by: context.userId,
              status: "fees_calculated",
              shipping_service_id: data.shippingServiceId,
              price_per_kg_snapshot: svcPricePerKg,
              real_weight_kg: Math.round(chargeableKg * 1000) / 1000,
              air_freight_fee: freightFee,
              admin_comment: "Fret payé à la commande (poids déclaré). À vérifier à la réception.",
            });
        } catch (assessmentError) {
          console.error("[checkout.server] prefill assessment failed", { orderId, error: assessmentError });
        }
      }

      // NOTIFIER les vendeurs concernes par la commande
      try {
        const vendorIds = Array.from(new Set(orderRows.map((r) => r.vendor_id)));
        for (const vendorId of vendorIds) {
          const vendorItems = orderRows.filter((r) => r.vendor_id === vendorId);
          const itemCount = vendorItems.reduce((sum, r) => sum + r.quantity, 0);
          await notifyVendorNewOrder(
            orderId,
            vendorId,
            data.address.full_name,
          );
        }
      } catch (notifyError) {
        // Ne pas faire echouer la commande si la notification echoue
        console.error("[checkout.server] notification vendeur echouee", { orderId, error: notifyError });
      }

      console.info("[checkout.server] create saved", { requestId, orderId, buyerId: context.userId, total, itemCount: orderRows.length });
      return { orderId, total };
    } catch (error) {
      console.error("[checkout.server] create failed", { requestId, buyerId: context.userId, error });
      throw error;
    }
  });