import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyVendorNewOrder } from "@/lib/notifications.functions";
import { getLineKind, subOrderKey, type LineKind } from "@/lib/line-kind";


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

      let firstShippingServiceId: string | null = data.shippingServiceId ?? null;
      // Buckets par sous-commande (vendor_id × line_kind) — un assessment par bucket.
      type Bucket = { vendorId: string; kind: LineKind; key: string; declaredFreightSum: number; serviceId: string | null };
      const buckets = new Map<string, Bucket>();

      const orderRows = await Promise.all(data.items.map(async (item) => {
        const product = productMap.get(item.productId) as any;
        if (!product) throw new Error("Un produit du panier est introuvable ou indisponible.");
        if (!product.is_active || product.status !== "approved") throw new Error(`Produit indisponible: ${product.name}`);
        if (!product.vendor_id) throw new Error(`Produit sans boutique associée: ${product.name}`);

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

        // ── Catégorie figée par ligne ──
        const sourceId = product.profiles?.source_country_id ?? null;
        const kind = getLineKind({
          destinationCountryId: data.destinationCountryId,
          vendorSourceCountryId: sourceId,
          productWeightKg: product.weight_kg,
        });
        const subKey = subOrderKey(product.vendor_id, kind);

        // ── Fret : UNIQUEMENT IMPORT_KNOWN_WEIGHT, figé à la ligne ──
        //   - sélecteur par ligne (item.shippingServiceId) prioritaire ;
        //   - sinon repli sur le sélecteur global (data.shippingServiceId) si présent.
        //   IMPORT_UNKNOWN_WEIGHT : NULL — calcul après pesée ; le choix de
        //   service global est néanmoins stampé sur la ligne pour l'agent.
        let lineFreight = 0;
        let lineServiceId: string | null = null;
        if (kind === "IMPORT_KNOWN_WEIGHT") {
          const svcId = item.shippingServiceId ?? data.shippingServiceId ?? null;
          const svc = await resolveService(svcId);
          const rate = svc?.price_per_kg ?? null;
          if (svc && rate != null && rate > 0) {
            const l = Number(product.length_cm ?? 0);
            const w = Number(product.width_cm ?? 0);
            const h = Number(product.height_cm ?? 0);
            const vol = l > 0 && w > 0 && h > 0 ? (l * w * h) / 5000 : 0;
            const kg = Math.max(Number(product.weight_kg ?? 0), vol) * item.quantity;
            lineFreight = Math.round(kg * rate);
            lineServiceId = svc.id;
            firstShippingServiceId = firstShippingServiceId ?? svc.id;
          }
        } else if (kind === "IMPORT_UNKNOWN_WEIGHT") {
          // Stamp préférence client (sélecteur global) pour traçabilité de l'opérateur.
          lineServiceId = item.shippingServiceId ?? data.shippingServiceId ?? null;
        }
        if (lineFreight > 0) total += lineFreight;

        // Bucket pour les sous-commandes IMPORT
        if (kind !== "LOCAL") {
          const b = buckets.get(subKey) ?? {
            vendorId: product.vendor_id,
            kind,
            key: subKey,
            declaredFreightSum: 0,
            serviceId: lineServiceId,
          };
          b.declaredFreightSum += lineFreight;
          b.serviceId = b.serviceId ?? lineServiceId;
          buckets.set(subKey, b);
        }

        // Stamp __line_kind + __sub_order_key + __freight_fee + __shipping_service_id
        const baseCust = (item.customization && typeof item.customization === "object")
          ? { ...(item.customization as Record<string, unknown>) }
          : {};
        baseCust.__line_kind = kind;
        baseCust.__sub_order_key = subKey;
        if (lineFreight > 0) baseCust.__freight_fee = lineFreight;
        if (lineServiceId) baseCust.__shipping_service_id = lineServiceId;
        const finalCust = baseCust;

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

      const freightTotal = orderRows.reduce((s, r) => s + Number((r.customization as any)?.__freight_fee ?? 0), 0);
      const hasIntl = buckets.size > 0;
      const hasUnknown = Array.from(buckets.values()).some(b => b.kind === "IMPORT_UNKNOWN_WEIGHT");

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
        shipping_estimate_note: hasIntl
          ? (hasUnknown
              ? (freightTotal > 0
                  ? `Fret partiel inclus (${freightTotal.toLocaleString("fr-FR")} FCFA pour articles à poids déclaré). Articles à poids inconnu : fret calculé après pesée.`
                  : "Articles à poids inconnu : fret calculé après pesée.")
              : `Fret inclus (${freightTotal.toLocaleString("fr-FR")} FCFA) — vérifié à la réception`)
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

      // Un assessment par sous-commande import. air_freight_fee TOUJOURS NULL
      // initialement — la "vérité" du fret figé vit sur order_items.__freight_fee,
      // et le fret pesé (UNKNOWN) sera écrit ici plus tard. Aucune valeur inventée.
      if (buckets.size > 0) {
        const rows = Array.from(buckets.values()).map((b) => ({
          order_id: orderId,
          created_by: context.userId,
          sub_order_key: b.key,
          status: b.kind === "IMPORT_KNOWN_WEIGHT" ? "fees_calculated" : "pending_arrival",
          weight_mode: b.kind === "IMPORT_KNOWN_WEIGHT" ? "declared" : "unknown",
          shipping_service_id: b.serviceId,
          air_freight_fee: null,
          admin_comment: b.kind === "IMPORT_KNOWN_WEIGHT"
            ? "Poids déclaré — fret figé sur les lignes. Vérification interne à la réception."
            : "Poids inconnu — pesée requise pour calculer le fret.",
        }));
        try {
          const { error: aErr } = await (supabaseAdmin as any).from("order_shipment_assessments").insert(rows);
          if (aErr) console.error("[checkout.server] assessments insert failed", { orderId, error: aErr });
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