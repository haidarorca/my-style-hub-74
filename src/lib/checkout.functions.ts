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

      // Cache services par id (résolus à la volée)
      const serviceCache = new Map<string, { id: string; price_per_kg: number | null } | null>();
      const resolveService = async (id: string | null | undefined) => {
        if (!id) return null;
        if (serviceCache.has(id)) return serviceCache.get(id) ?? null;
        const { data: svc } = await (supabaseAdmin as any)
          .from("shipping_services").select("id, price_per_kg").eq("id", id).maybeSingle();
        const v = svc ? { id: svc.id, price_per_kg: svc.price_per_kg != null ? Number(svc.price_per_kg) : null } : null;
        serviceCache.set(id, v);
        return v;
      };

      let freightTotal = 0;
      let allIntlDeclared = true;
      let intlCount = 0;
      let firstShippingServiceId: string | null = data.shippingServiceId ?? null;

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

        // ── Fret PAR LIGNE pour les articles internationaux à poids déclaré ──
        const sourceId = product.profiles?.source_country_id ?? null;
        const isIntl = !!sourceId && sourceId !== data.destinationCountryId;
        let lineFreight = 0;
        let lineServiceId: string | null = null;
        if (isIntl) {
          intlCount += 1;
          const weight = Number(product.weight_kg ?? 0);
          if (weight > 0) {
            const svcId = (item.shippingServiceId ?? data.shippingServiceId) ?? null;
            const svc = await resolveService(svcId);
            const rate = svc?.price_per_kg ?? null;
            if (svc && rate != null && rate > 0) {
              const l = Number(product.length_cm ?? 0);
              const w = Number(product.width_cm ?? 0);
              const h = Number(product.height_cm ?? 0);
              const vol = l > 0 && w > 0 && h > 0 ? (l * w * h) / 5000 : 0;
              const kg = Math.max(weight, vol) * item.quantity;
              lineFreight = Math.round(kg * rate);
              lineServiceId = svc.id;
              firstShippingServiceId = firstShippingServiceId ?? svc.id;
            } else {
              allIntlDeclared = false; // poids OK mais pas de service applicable
            }
          } else {
            allIntlDeclared = false; // poids inconnu → circuit A
          }
        }
        if (lineFreight > 0) total += lineFreight;

        // Stamp __freight_fee + __shipping_service_id pour traçabilité
        const baseCust = (item.customization && typeof item.customization === "object")
          ? { ...(item.customization as Record<string, unknown>) }
          : {};
        if (lineFreight > 0) baseCust.__freight_fee = lineFreight;
        if (lineServiceId) baseCust.__shipping_service_id = lineServiceId;
        const finalCust = Object.keys(baseCust).length > 0 ? baseCust : null;

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
          customization: finalCust,
        };
      }));

      const weightMode: "declared" | "unknown" =
        intlCount > 0 && allIntlDeclared ? "declared" : "unknown";
      freightTotal = orderRows.reduce((s, r) => s + Number((r.customization as any)?.__freight_fee ?? 0), 0);
      const allHaveDeclaredWeight = weightMode === "declared" && freightTotal > 0;

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
        shipping_service_id: firstShippingServiceId,
        shipping_estimate_note: intlCount > 0
          ? (allHaveDeclaredWeight
              ? `Fret inclus (${freightTotal.toLocaleString("fr-FR")} FCFA) — vérifié à la réception`
              : "Estimé — sera recalculé après pesée")
          : null,
      } as any);
      if (orderError) throw new Error(`Création commande: ${orderError.message}`);

      // Utiliser le client authentifié (context.supabase) pour order_items
      const { error: itemsError } = await context.supabase
        .from("order_items")
        .insert(orderRows.map((row) => ({ ...row, order_id: orderId })) as any);
      if (itemsError) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error(`Création articles commande: ${itemsError.message}`);
      }

      // Pré-créer l'évaluation logistique avec weight_mode pour activer le circuit B/A explicitement.
      if (intlCount > 0) {
        try {
          await (supabaseAdmin as any)
            .from("order_shipment_assessments")
            .insert({
              order_id: orderId,
              created_by: context.userId,
              status: allHaveDeclaredWeight ? "fees_calculated" : "pending_arrival",
              weight_mode: weightMode,
              shipping_service_id: firstShippingServiceId,
              air_freight_fee: allHaveDeclaredWeight ? freightTotal : 0,
              admin_comment: allHaveDeclaredWeight
                ? "Fret payé à la commande (poids déclaré). À vérifier à la réception."
                : "Poids inconnu — circuit pesée requis.",
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