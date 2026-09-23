// ═══════════════════════════════════════════════════════════════
// COMMANDES CJ — fonctions serveur réservées aux administrateurs.
//
// Périmètre volontairement limité :
//   • configurer l'adresse de réception CJ (notre entrepôt en Chine) ;
//   • interroger les méthodes logistiques réellement proposées par CJ ;
//   • créer la commande chez CJ (createOrderV3, orderFlow = 1) ;
//   • relire le statut / le suivi de la commande CJ.
//
// AUCUN paiement CJ n'est déclenché ici. La documentation officielle sépare
// la création (createOrderV3) du paiement (addCart → addCartConfirm →
// saveGenerateParentOrder → payBalanceV2). Nous nous arrêtons à la création.
//
// Références officielles :
//   https://developers.cjdropshipping.com/en/api/api2/api/shopping.html
//   https://developers.cjdropshipping.com/en/api/api2/api/logistic.html
// ═══════════════════════════════════════════════════════════════
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Accès réservé aux administrateurs.");
}

export interface CjWarehouseAddress {
  id: string;
  label: string;
  contact_name: string | null;
  phone: string | null;
  country_code: string;
  country_name: string;
  province: string | null;
  city: string | null;
  county: string | null;
  address: string | null;
  address2: string | null;
  zip: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
}

const WAREHOUSE_FIELDS =
  "id, label, contact_name, phone, country_code, country_name, province, city, county, address, address2, zip, email, notes, is_active";

/** Adresse de réception CJ (notre entrepôt en Chine). */
export const getCjWarehouseAddress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CjWarehouseAddress | null> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("cj_warehouse_address")
      .select(WAREHOUSE_FIELDS)
      .eq("id", "default")
      .maybeSingle();
    return (data ?? null) as CjWarehouseAddress | null;
  });

/** Enregistrement de l'adresse de réception CJ. */
export const saveCjWarehouseAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<CjWarehouseAddress>) => input ?? {})
  .handler(async ({ context, data }): Promise<CjWarehouseAddress> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { id: "default" };
    for (const key of [
      "label", "contact_name", "phone", "country_code", "country_name",
      "province", "city", "county", "address", "address2", "zip", "email",
      "notes", "is_active",
    ] as const) {
      if (key in (data as any)) patch[key] = (data as any)[key];
    }
    const { data: row, error } = await (supabaseAdmin as any)
      .from("cj_warehouse_address")
      .upsert(patch)
      .select(WAREHOUSE_FIELDS)
      .single();
    if (error) throw new Error(error.message);
    return row as CjWarehouseAddress;
  });

// ─── Lecture d'une commande KawZone + de ses lignes CJ ───────────
async function loadOrderForCj(orderId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order, error } = await (supabaseAdmin as any)
    .from("orders")
    .select(
      "id, reference, status, total, customer_name, customer_phone, address, city, created_at, " +
        "cj_order_id, cj_order_code, cj_order_number, cj_shipment_order_id, cj_order_status, cj_payment_status, " +
        "cj_logistic_name, cj_tracking_number, cj_tracking_provider, cj_tracking_url, " +
        "cj_created_at, cj_paid_at, cj_shipped_at, cj_synced_at, cj_last_error, cj_is_sandbox",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) throw new Error("Commande introuvable.");

  const { data: items } = await (supabaseAdmin as any)
    .from("order_items")
    .select("id, product_name, quantity, unit_price, cj_product_id, cj_variant_id, cj_variant_sku, variant_label_snapshot")
    .eq("order_id", orderId);

  const cjItems = (items ?? []).filter((i: any) => !!i.cj_variant_id);
  return { order, items: items ?? [], cjItems, supabaseAdmin };
}

async function logCjOrderCall(
  supabaseAdmin: any,
  row: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from("cj_order_log").insert(row);
  } catch (e) {
    console.error("[cj-orders] log failed", e);
  }
}

export interface CjOrderOverview {
  order_id: string;
  reference: string | null;
  status: string;
  total: number;
  customer_name: string | null;
  created_at: string;
  cj_eligible_lines: number;
  total_lines: number;
  cj_order_id: string | null;
  cj_order_code: string | null;
  cj_order_number: string | null;
  cj_order_status: string | null;
  cj_payment_status: string | null;
  cj_logistic_name: string | null;
  cj_tracking_number: string | null;
  cj_tracking_provider: string | null;
  cj_tracking_url: string | null;
  cj_created_at: string | null;
  cj_paid_at: string | null;
  cj_shipped_at: string | null;
  cj_synced_at: string | null;
  cj_last_error: string | null;
  cj_is_sandbox: boolean;
  items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    cj_product_id: string | null;
    cj_variant_id: string | null;
    cj_variant_sku: string | null;
    variant_label_snapshot: string | null;
  }>;
}

/** Liste des commandes contenant au moins un article CJ. */
export const listCjOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CjOrderOverview[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: items } = await (supabaseAdmin as any)
      .from("order_items")
      .select("order_id")
      .not("cj_variant_id", "is", null)
      .limit(2000);
    const orderIds = Array.from(
      new Set((items ?? []).map((i: any) => String(i.order_id))),
    ) as string[];
    if (orderIds.length === 0) return [];
    const out: CjOrderOverview[] = [];
    for (const id of orderIds.slice(0, 100)) {
      try {
        out.push(await buildOverview(id));
      } catch {
        /* commande supprimée entre-temps */
      }
    }
    out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return out;
  });

async function buildOverview(orderId: string): Promise<CjOrderOverview> {
  const { order, items, cjItems } = await loadOrderForCj(orderId);
  return {
    order_id: order.id,
    reference: order.reference ?? null,
    status: order.status,
    total: Number(order.total ?? 0),
    customer_name: order.customer_name ?? null,
    created_at: order.created_at,
    cj_eligible_lines: cjItems.length,
    total_lines: items.length,
    cj_order_id: order.cj_order_id ?? null,
    cj_order_code: order.cj_order_code ?? null,
    cj_order_number: order.cj_order_number ?? null,
    cj_order_status: order.cj_order_status ?? null,
    cj_payment_status: order.cj_payment_status ?? null,
    cj_logistic_name: order.cj_logistic_name ?? null,
    cj_tracking_number: order.cj_tracking_number ?? null,
    cj_tracking_provider: order.cj_tracking_provider ?? null,
    cj_tracking_url: order.cj_tracking_url ?? null,
    cj_created_at: order.cj_created_at ?? null,
    cj_paid_at: order.cj_paid_at ?? null,
    cj_shipped_at: order.cj_shipped_at ?? null,
    cj_synced_at: order.cj_synced_at ?? null,
    cj_last_error: order.cj_last_error ?? null,
    cj_is_sandbox: !!order.cj_is_sandbox,
    items: items.map((i: any) => ({
      id: i.id,
      product_name: i.product_name,
      quantity: Number(i.quantity ?? 0),
      unit_price: Number(i.unit_price ?? 0),
      cj_product_id: i.cj_product_id ?? null,
      cj_variant_id: i.cj_variant_id ?? null,
      cj_variant_sku: i.cj_variant_sku ?? null,
      variant_label_snapshot: i.variant_label_snapshot ?? null,
    })),
  };
}

/** Détail CJ d'une commande. */
export const getCjOrderOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string }) => ({ order_id: String(input.order_id) }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    return buildOverview(data.order_id);
  });

/** Journal des échanges CJ d'une commande. */
export const getCjOrderLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string }) => ({ order_id: String(input.order_id) }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin as any)
      .from("cj_order_log")
      .select("id, action, endpoint, http_status, cj_code, cj_message, success, latency_ms, request_payload, response_payload, created_at")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  });

// ─── Méthodes logistiques réellement proposées par CJ ────────────
export interface CjLogisticOption {
  logisticName: string;
  logisticPrice: number | null;
  logisticPriceCn: number | null;
  logisticAging: string | null;
}

/**
 * Interroge /logistic/freightCalculate pour la destination réellement
 * configurée (notre entrepôt). Aucune méthode n'est codée en dur : seule la
 * liste renvoyée par CJ est utilisable.
 */
export const quoteCjLogistics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string }) => ({ order_id: String(input.order_id) }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { cjPostRaw } = await import("@/lib/cj/client.server");
    const { order, cjItems, supabaseAdmin } = await loadOrderForCj(data.order_id);

    const { data: wh } = await (supabaseAdmin as any)
      .from("cj_warehouse_address")
      .select(WAREHOUSE_FIELDS)
      .eq("id", "default")
      .maybeSingle();
    if (!wh?.address || !wh?.city) {
      throw new Error("Adresse de réception CJ incomplète. Renseignez-la avant tout envoi.");
    }
    if (cjItems.length === 0) throw new Error("Aucun article CJ dans cette commande.");

    const payload = {
      startCountryCode: "CN",
      endCountryCode: wh.country_code || "CN",
      zip: wh.zip || undefined,
      products: cjItems.map((i: any) => ({ quantity: Number(i.quantity), vid: i.cj_variant_id })),
    };

    const traces: any[] = [];
    const r = await cjPostRaw("/logistic/freightCalculate", payload, traces);
    const ok = r.body?.result === true;
    await logCjOrderCall(supabaseAdmin, {
      order_id: order.id,
      action: "freight_calculate",
      endpoint: "/logistic/freightCalculate",
      http_status: r.status,
      cj_code: typeof r.body?.code === "number" ? r.body.code : null,
      cj_message: r.body?.message ?? null,
      success: ok,
      request_payload: payload,
      response_payload: r.body ?? null,
      latency_ms: traces[traces.length - 1]?.latencyMs ?? null,
      created_by: context.userId,
    });

    const list: CjLogisticOption[] = ok && Array.isArray(r.body?.data)
      ? r.body.data.map((d: any) => ({
          logisticName: d.logisticName,
          logisticPrice: d.logisticPrice != null ? Number(d.logisticPrice) : null,
          logisticPriceCn: d.logisticPriceCn != null ? Number(d.logisticPriceCn) : null,
          logisticAging: d.logisticAging ?? null,
        }))
      : [];

    return {
      ok,
      message: r.body?.message ?? null,
      http_status: r.status,
      cj_code: r.body?.code ?? null,
      destination: `${wh.city}, ${wh.province ?? ""} (${wh.country_code})`,
      options: list,
    };
  });

// ─── Création de la commande chez CJ ─────────────────────────────
export const createCjOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string; logistic_name: string; sandbox?: boolean }) => ({
    order_id: String(input.order_id),
    logistic_name: String(input.logistic_name ?? "").trim(),
    sandbox: !!input.sandbox,
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { cjPostRaw } = await import("@/lib/cj/client.server");
    const { order, cjItems, supabaseAdmin } = await loadOrderForCj(data.order_id);

    if (order.cj_order_id) {
      throw new Error(`Commande déjà créée chez CJ (identifiant ${order.cj_order_id}).`);
    }
    if (cjItems.length === 0) throw new Error("Aucun article CJ dans cette commande.");
    if (!data.logistic_name) {
      throw new Error("Choisissez une méthode logistique parmi celles renvoyées par CJ.");
    }

    const { data: wh } = await (supabaseAdmin as any)
      .from("cj_warehouse_address")
      .select(WAREHOUSE_FIELDS)
      .eq("id", "default")
      .maybeSingle();
    for (const [field, label] of [
      ["contact_name", "destinataire"],
      ["phone", "téléphone"],
      ["province", "province"],
      ["city", "ville"],
      ["address", "adresse"],
    ] as const) {
      if (!wh?.[field]) throw new Error(`Adresse de réception CJ : ${label} manquant.`);
    }

    // orderNumber = référence KawZone stable ; remark = identification lisible.
    const reference = order.reference ?? `KW-${String(order.id).slice(0, 8)}`;
    const orderNumber = data.sandbox ? `TEST-${reference}` : reference;
    const remark = [
      "KAWZONE",
      `Order: ${orderNumber}`,
      order.customer_name ? `Client ref: ${order.customer_name}` : null,
      data.sandbox ? "TEST ORDER" : null,
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 500);

    const payload: Record<string, unknown> = {
      orderNumber,
      // orderFlow 1 = flux produit CJ : nos variantes sont de vraies variantes CJ.
      orderFlow: 1,
      // shopLogisticsType 2 (défaut) = logistique marchand : pas de storageId.
      // storageId désignerait un entrepôt CJ, jamais notre propre entrepôt.
      shopLogisticsType: 2,
      fromCountryCode: "CN",
      platform: "Api",
      logisticName: data.logistic_name,
      shippingCountryCode: wh.country_code || "CN",
      shippingCountry: wh.country_name || "China",
      shippingProvince: wh.province,
      shippingCity: wh.city,
      shippingCustomerName: wh.contact_name,
      shippingPhone: wh.phone,
      shippingAddress: wh.address,
      remark,
      products: cjItems.map((i: any) => ({
        vid: i.cj_variant_id,
        quantity: Number(i.quantity),
      })),
    };
    if (wh.county) payload["shippingCounty"] = wh.county;
    if (wh.address2) payload["shippingAddress2"] = wh.address2;
    if (wh.zip) payload["shippingZip"] = wh.zip;
    if (wh.email) payload["email"] = wh.email;
    if (data.sandbox) payload["isSandbox"] = 1;

    const traces: any[] = [];
    const r = await cjPostRaw("/shopping/order/createOrderV3", payload, traces);
    const ok = r.body?.result === true;
    const d = r.body?.data ?? null;

    await logCjOrderCall(supabaseAdmin, {
      order_id: order.id,
      action: "create_order_v3",
      endpoint: "/shopping/order/createOrderV3",
      http_status: r.status,
      cj_code: typeof r.body?.code === "number" ? r.body.code : null,
      cj_message: r.body?.message ?? null,
      success: ok,
      request_payload: payload,
      response_payload: r.body ?? null,
      latency_ms: traces[traces.length - 1]?.latencyMs ?? null,
      created_by: context.userId,
    });

    if (!ok) {
      await (supabaseAdmin as any)
        .from("orders")
        .update({ cj_last_error: r.body?.message ?? `HTTP ${r.status}`, cj_synced_at: new Date().toISOString() })
        .eq("id", order.id);
      return { ok: false, http_status: r.status, cj_code: r.body?.code ?? null, message: r.body?.message ?? null, data: d };
    }

    await (supabaseAdmin as any)
      .from("orders")
      .update({
        cj_order_id: d?.orderId ?? null,
        cj_order_code: d?.cjOrderCode ?? d?.orderId ?? null,
        cj_order_number: d?.orderNumber ?? orderNumber,
        cj_shipment_order_id: d?.shipmentOrderId ?? null,
        cj_order_status: d?.orderStatus ?? "CREATED",
        cj_payment_status: "UNPAID",
        cj_logistic_name: data.logistic_name,
        cj_order_amount: d?.orderAmount != null ? Number(d.orderAmount) : null,
        cj_is_sandbox: data.sandbox,
        cj_created_at: new Date().toISOString(),
        cj_synced_at: new Date().toISOString(),
        cj_last_error: null,
      })
      .eq("id", order.id);

    return {
      ok: true,
      http_status: r.status,
      cj_code: r.body?.code ?? null,
      message: r.body?.message ?? null,
      orderNumber,
      remark,
      data: d,
    };
  });

// ─── Synchronisation du statut / suivi CJ ────────────────────────
export const syncCjOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string }) => ({ order_id: String(input.order_id) }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { cjGet } = await import("@/lib/cj/client.server");
    const { order, supabaseAdmin } = await loadOrderForCj(data.order_id);
    if (!order.cj_order_id) throw new Error("Cette commande n'a pas encore été créée chez CJ.");

    const traces: any[] = [];
    let detail: any = null;
    let errorMessage: string | null = null;
    try {
      detail = await cjGet<any>(
        `/shopping/order/getOrderDetail?orderId=${encodeURIComponent(order.cj_order_id)}`,
        traces,
      );
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Erreur inconnue";
    }

    await logCjOrderCall(supabaseAdmin, {
      order_id: order.id,
      action: "get_order_detail",
      endpoint: "/shopping/order/getOrderDetail",
      http_status: traces[traces.length - 1]?.status ?? null,
      cj_code: traces[traces.length - 1]?.cjCode ?? null,
      cj_message: traces[traces.length - 1]?.cjMessage ?? null,
      success: !errorMessage,
      request_payload: { orderId: order.cj_order_id },
      response_payload: detail ?? null,
      latency_ms: traces[traces.length - 1]?.latencyMs ?? null,
      created_by: context.userId,
    });

    if (errorMessage) {
      await (supabaseAdmin as any)
        .from("orders")
        .update({ cj_last_error: errorMessage, cj_synced_at: new Date().toISOString() })
        .eq("id", order.id);
      return { ok: false, message: errorMessage, detail: null };
    }

    const status: string | null = detail?.orderStatus ?? null;
    const patch: Record<string, unknown> = {
      cj_order_status: status,
      cj_order_number: detail?.orderNum ?? order.cj_order_number,
      cj_order_code: detail?.cjOrderCode ?? order.cj_order_code,
      cj_logistic_name: detail?.logisticName ?? order.cj_logistic_name,
      cj_tracking_number: detail?.trackNumber ?? null,
      cj_tracking_provider: detail?.trackingProvider ?? null,
      cj_tracking_url: detail?.trackingUrl ?? null,
      cj_synced_at: new Date().toISOString(),
      cj_last_error: null,
    };
    // Statuts officiels CJ : CREATED, IN_CART, UNPAID, PENDING, PROCESSING,
    // UNSHIPPED, SHIPPED, DELIVERED, CANCELLED.
    if (status) {
      patch["cj_payment_status"] = ["CREATED", "IN_CART", "UNPAID"].includes(status) ? "UNPAID" : "PAID";
    }
    if (detail?.paymentDate) patch["cj_paid_at"] = new Date(String(detail.paymentDate).replace(" ", "T") + "Z").toISOString();
    if (status === "SHIPPED" || status === "DELIVERED") {
      patch["cj_shipped_at"] = order.cj_shipped_at ?? new Date().toISOString();
    }

    await (supabaseAdmin as any).from("orders").update(patch).eq("id", order.id);
    return { ok: true, message: null, detail, status };
  });
