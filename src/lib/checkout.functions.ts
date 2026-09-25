import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyVendorNewOrder } from "@/lib/notifications.functions";
import { getLineKind, subOrderKey, type LineKind } from "@/lib/line-kind";
import {
  resolveItemLogistics,
  quoteShipment,
  buildLineSnapshot,
  type FreightRule,
  type FreightQuote,
} from "@/lib/logistics/freight";


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
          .select("id, name, code, sku, price, vendor_id, status, is_active, weight_kg, length_cm, width_cm, height_cm, cost_price, cost_currency_code, product_images(url, position), profiles:vendor_id(vendor_mode, vendor_status, access_ends_at, is_admin_shop, source_country_id)")
          .order("position", { referencedTable: "product_images", ascending: true })
          .in("id", productIds),
        variantIds.length
          ? supabaseAdmin
              .from("product_variants")
              .select("id, product_id, size, color, price_override, variant_ref, supplier_sku, weight_kg, length_cm, width_cm, height_cm, cost_price, cost_currency_code, external_variant_id, supplier_stock")
              .in("id", variantIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (productsError) throw new Error(`Lecture produits: ${productsError.message}`);
      if (variantsError) throw new Error(`Lecture variantes: ${variantsError.message}`);

      const productMap = new Map((products ?? []).map((product: any) => [product.id, product]));
      const variantMap = new Map((variants ?? []).map((variant: any) => [variant.id, variant]));

      // ── Contrôle de stock CJ n°1 (temps réel, variante exacte) ──
      // Si CJ ne répond pas, on se fie au dernier stock connu : la commande
      // n'est pas bloquée et le contrôle n°2 aura lieu avant tout envoi.
      {
        const { data: cjRows } = await (supabaseAdmin as any)
          .from("cj_products").select("product_id").in("product_id", productIds);
        const cjProductIds = new Set((cjRows ?? []).map((r: any) => r.product_id));
        const cjLines = data.items
          .map((item) => ({ item, v: item.variantId ? (variantMap.get(item.variantId) as any) : null }))
          .filter(({ item, v }) => cjProductIds.has(item.productId) && v?.external_variant_id);
        if (cjLines.length) {
          const { checkCjVariantsStock } = await import("@/lib/cj/stock.server");
          const stocks = await checkCjVariantsStock(cjLines.map(({ v }) => String(v.external_variant_id)), supabaseAdmin, 6000);
          for (const { item, v } of cjLines) {
            const s = stocks.get(String(v.external_variant_id));
            const known = s?.stock ?? (v.supplier_stock != null ? Number(v.supplier_stock) : null);
            if (known !== null && known < item.quantity) {
              const p = productMap.get(item.productId) as any;
              const label = [v.color, v.size].filter(Boolean).join(" / ");
              throw new Error(known <= 0
                ? `Rupture de stock : ${p?.name ?? "produit"}${label ? ` (${label})` : ""}. Retirez cet article du panier.`
                : `Stock insuffisant : ${p?.name ?? "produit"}${label ? ` (${label})` : ""} — ${known} disponible(s).`);
            }
          }
        }
      }
      let total = 0;
      let productsTotal = 0;
      let purchaseCostTotal = 0;

      // Cache services par id — on charge TOUTES les règles tarifaires du mode.
      const serviceCache = new Map<string, FreightRule | null>();
      const resolveService = async (id: string | null | undefined): Promise<FreightRule | null> => {
        if (!id) return null;
        if (serviceCache.has(id)) return serviceCache.get(id) ?? null;
        const { data: svc } = await (supabaseAdmin as any)
          .from("shipping_services")
          .select("id, name, mode, pricing_unit, price_per_kg, price_per_cbm, min_billable_qty, volumetric_divisor, use_volumetric, fixed_fee")
          .eq("id", id)
          .maybeSingle();
        const v: FreightRule | null = svc
          ? {
              id: svc.id,
              name: svc.name,
              mode: svc.mode ?? "air",
              pricing_unit: svc.pricing_unit ?? "kg",
              price_per_kg: svc.price_per_kg != null ? Number(svc.price_per_kg) : null,
              price_per_cbm: svc.price_per_cbm != null ? Number(svc.price_per_cbm) : null,
              min_billable_qty: Number(svc.min_billable_qty ?? 0),
              volumetric_divisor: Number(svc.volumetric_divisor ?? 5000),
              use_volumetric: svc.use_volumetric !== false,
              fixed_fee: Number(svc.fixed_fee ?? 0),
            }
          : null;
        serviceCache.set(id, v);
        return v;
      };

      let firstShippingServiceId: string | null = data.shippingServiceId ?? null;
      // Buckets par sous-commande (vendor_id × line_kind) — un assessment par bucket.
      type Bucket = { vendorId: string; kind: LineKind; key: string; declaredFreightSum: number; serviceId: string | null };
      const buckets = new Map<string, Bucket>();

      // ── Transport : calcul CENTRAL par envoi (même moteur que le panier) ──
      // Lignes à poids déclaré regroupées par mode choisi : minimum facturable
      // et frais fixes appliqués UNE fois par envoi, puis répartis par ligne.
      const shipmentGroups = new Map<string, Array<{ key: string; logistics: ReturnType<typeof resolveItemLogistics>; quantity: number }>>();
      data.items.forEach((item, idx) => {
        const product = productMap.get(item.productId) as any;
        if (!product) return;
        const variant = item.variantId ? (variantMap.get(item.variantId) as any) : null;
        const logistics = resolveItemLogistics(product, variant);
        const kind = getLineKind({
          destinationCountryId: data.destinationCountryId,
          vendorSourceCountryId: product.profiles?.source_country_id ?? null,
          productWeightKg: logistics.weightKg,
        });
        const svcId = item.shippingServiceId ?? data.shippingServiceId ?? null;
        if (kind !== "IMPORT_KNOWN_WEIGHT" || !svcId) return;
        const g = shipmentGroups.get(svcId) ?? [];
        g.push({ key: String(idx), logistics, quantity: item.quantity });
        shipmentGroups.set(svcId, g);
      });
      const lineAlloc = new Map<string, { quote: FreightQuote; cost: number }>();
      for (const [svcId, lines] of shipmentGroups) {
        const svc = await resolveService(svcId);
        if (!svc) continue;
        const sq = quoteShipment(lines, svc);
        for (const l of lines) {
          const q = sq.lineQuotes.get(l.key)!;
          lineAlloc.set(l.key, { quote: q, cost: sq.ok ? sq.perLine.get(l.key) ?? 0 : 0 });
        }
      }

      const orderRows = await Promise.all(data.items.map(async (item, idx) => {
        const product = productMap.get(item.productId) as any;
        if (!product) throw new Error("Un produit du panier est introuvable ou indisponible.");
        // Message précis : on indique la donnée réellement bloquante.
        if (product.status !== "approved") {
          throw new Error(
            `Produit non publié (statut « ${product.status} ») : ${product.name}. Validez-le dans Validation produits.`,
          );
        }
        if (!product.is_active) {
          throw new Error(`Produit désactivé (non mis en vente) : ${product.name}.`);
        }
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
        productsTotal += unitPrice * item.quantity;

        // ── Logistique de la ligne : VARIANTE prioritaire et exclusive ──
        const logistics = resolveItemLogistics(product, variant);

        // ── Catégorie figée par ligne ──
        const sourceId = product.profiles?.source_country_id ?? null;
        const kind = getLineKind({
          destinationCountryId: data.destinationCountryId,
          vendorSourceCountryId: sourceId,
          productWeightKg: logistics.weightKg,
        });
        const subKey = subOrderKey(product.vendor_id, kind);

        // ── Fret : UNIQUEMENT IMPORT_KNOWN_WEIGHT, figé à la ligne ──
        //   - sélecteur par ligne (item.shippingServiceId) prioritaire ;
        //   - sinon repli sur le sélecteur global (data.shippingServiceId) si présent.
        //   IMPORT_UNKNOWN_WEIGHT : NULL — calcul après pesée ; le choix de
        //   service global est néanmoins stampé sur la ligne pour l'agent.
        let lineFreight = 0;
        let lineServiceId: string | null = null;
        let lineQuote: FreightQuote | null = null;
        if (kind === "IMPORT_KNOWN_WEIGHT") {
          const svcId = item.shippingServiceId ?? data.shippingServiceId ?? null;
          const svc = await resolveService(svcId);
          if (svc) {
            // Le moteur applique UNIQUEMENT les règles du mode choisi
            // (kg ou m³, minimum facturable, diviseur volumétrique du service).
            const alloc = lineAlloc.get(String(idx));
            lineServiceId = svc.id;
            firstShippingServiceId = firstShippingServiceId ?? svc.id;
            if (alloc) {
              // Le snapshot porte la part RÉELLE de la ligne (somme = total envoi).
              lineQuote = { ...alloc.quote, cost: alloc.cost };
              if (alloc.quote.ok) lineFreight = alloc.cost;
            }
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
        // Le client peut porter d'anciennes métadonnées logistiques dans le panier.
        // Elles ne sont jamais fiables : le checkout serveur recalcule une catégorie unique.
        delete baseCust.__line_kind;
        delete baseCust.__sub_order_key;
        delete baseCust.__freight_fee;
        delete baseCust.__shipping_service_id;
        baseCust.__line_kind = kind;
        baseCust.__sub_order_key = subKey;
        if (lineFreight > 0) baseCust.__freight_fee = lineFreight;
        if (lineServiceId) baseCust.__shipping_service_id = lineServiceId;
        const finalCust = baseCust;

        // ── Copie IMMUABLE des données de calcul (poids, dimensions, CBM,
        //    mode, tarif, coût d'achat) : une modification ultérieure de la
        //    fiche produit ne changera JAMAIS cette commande.
        const costPrice = variant?.cost_price ?? product.cost_price ?? null;
        const costCurrency = variant?.cost_currency_code ?? product.cost_currency_code ?? null;
        const snapshot = buildLineSnapshot({
          logistics,
          quantity: item.quantity,
          quote: lineQuote,
          serviceId: lineServiceId,
          unitPrice,
          costPrice,
          costCurrency,
          costRate: costCurrency && costCurrency !== "XOF" ? null : 1,
          sku: variant?.supplier_sku ?? variant?.variant_ref ?? product.sku ?? product.code ?? null,
          variantLabel: [variant?.size, variant?.color].filter(Boolean).join(" / ") || null,
        });
        purchaseCostTotal += Number(snapshot.purchase_cost_total ?? 0);

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
          ...snapshot,
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
        // Totaux séparés : produits / transport / coûts réels / marge.
        products_total: productsTotal,
        shipping_total: freightTotal,
        purchase_cost_total: purchaseCostTotal,
        logistics_cost_total: null,
        margin_total: purchaseCostTotal > 0 ? total - purchaseCostTotal : null,
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