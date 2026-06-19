// ═══════════════════════════════════════════════════════════════
// ORDER OVERVIEW — Fonctions serveur pour la Vue Globale des Commandes
//
// Aucune logique métier nouvelle. Simple agrégation de données
// existantes pour affichage synthétique.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";
import { listLogisticsOrders } from "./admin-logistics.functions";
import type { LogisticsOrderRow } from "./admin-logistics.functions";

/* ── Schémas ── */

const OverviewInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(200).default(50),
  statusFilter: z.string().default(""),
  countryFilter: z.string().default(""),
  typeFilter: z.enum(["", "local", "import", "mixed"]).default(""),
  q: z.string().max(200).default(""),
  dateFrom: z.string().nullable().default(null),
  dateTo: z.string().nullable().default(null),
});

/* ── Types ── */

export interface SubOrderStat {
  vendor_id: string;
  vendor_name: string;
  article_count: number;
  delivered_count: number;
  is_kawzone_managed: boolean;
  // Une sous-commande est "terminée" si tous ses articles sont delivered
  is_done: boolean;
}

export interface OrderOverviewRow {
  order: LogisticsOrderRow;
  sub_orders: SubOrderStat[];
  kawzone_total: number;        // Nombre total de sous-commandes Kawzone
  kawzone_done: number;         // Nombre de sous-commandes Kawzone terminées
  last_activity: string | null; // Timestamp de la dernière activité
}

export interface OrderOverviewPage {
  rows: OrderOverviewRow[];
  total: number;
  page: number;
  pageSize: number;
  countries: { id: string; name: string; flag_emoji: string | null }[];
}

/* ═══════════════════════════════════════════════════════════════
   1. LISTE AVEC STATS DE SOUS-COMMANDES
   ═══════════════════════════════════════════════════════════════ */

export const getOrderOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? OverviewInputSchema.parse(input) : OverviewInputSchema.parse({})))
  .handler(async ({ data, context }): Promise<OrderOverviewPage> => {
    await assertPermission(context.userId, "orders");

    // ── Étape 1 : Charger les commandes via la fonction existante ──
    const ordersPage = await listLogisticsOrders({
      data: {
        page: data.page,
        pageSize: data.pageSize,
        orderStatus: data.statusFilter,
        orderType: data.typeFilter as any,
        q: data.q,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
      },
    });

    const orders = ordersPage.rows;
    const orderIds = orders.map((o: LogisticsOrderRow) => o.order_id).filter(Boolean);

    if (orderIds.length === 0) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, countries: [] };
    }

    // ── Étape 2 : Charger les articles pour calculer les sous-commandes ──
    const { data: itemsRaw } = await (supabaseAdmin as any)
      .from("order_items")
      .select(`
        order_id,
        product_id,
        vendor_id,
        status,
        quantity,
        products:product_id(vendor_id, name),
        profiles:vendor_id(full_name, is_admin_shop)
      `)
      .in("order_id", orderIds);

    const items = (itemsRaw ?? []) as any[];

    // ── Étape 3 : Grouper par (order_id, vendor_id) et calculer stats ──
    const subOrderMap = new Map<string, SubOrderStat[]>();

    for (const it of items) {
      const oid = it.order_id;
      const vid = it.vendor_id ?? "unknown";
      const key = `${oid}::${vid}`;

      if (!subOrderMap.has(key)) {
        const profile = it.profiles ?? {};
        const isAdmin = !!profile.is_admin_shop;
        subOrderMap.set(key, [{
          vendor_id: vid,
          vendor_name: profile.full_name ?? "Vendeur inconnu",
          article_count: 0,
          delivered_count: 0,
          is_kawzone_managed: isAdmin,
          is_done: false,
        }]);
      }

      const stat = subOrderMap.get(key)![0];
      stat.article_count += 1;
      if (it.status === "delivered") stat.delivered_count += 1;
    }

    // Finaliser is_done
    for (const [, stats] of subOrderMap) {
      for (const s of stats) {
        s.is_done = s.article_count > 0 && s.delivered_count === s.article_count;
      }
    }

    // ── Étape 4 : Assembler les résultats ──
    const rows: OrderOverviewRow[] = orders.map((order: LogisticsOrderRow) => {
      const oid = order.order_id;
      const subs: SubOrderStat[] = [];
      let kawzone_total = 0;
      let kawzone_done = 0;

      // Récupérer les sous-commandes de cette commande
      for (const [key, stats] of subOrderMap) {
        if (key.startsWith(`${oid}::`)) {
          for (const s of stats) {
            subs.push(s);
            if (s.is_kawzone_managed) {
              kawzone_total += 1;
              if (s.is_done) kawzone_done += 1;
            }
          }
        }
      }

      return {
        order,
        sub_orders: subs,
        kawzone_total,
        kawzone_done,
        last_activity: order.updated_at ?? order.order_created_at,
      };
    });

    // ── Étape 5 : Pays disponibles pour filtres ──
    const countryIds = Array.from(new Set(orders
      .map((o: LogisticsOrderRow) => o.destination_country_id)
      .filter(Boolean)));

    let countries: OrderOverviewPage["countries"] = [];
    if (countryIds.length > 0) {
      const { data: countriesRaw } = await (supabaseAdmin as any)
        .from("countries")
        .select("id, name, flag_emoji")
        .in("id", countryIds);
      countries = (countriesRaw ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        flag_emoji: c.flag_emoji ?? null,
      }));
    }

    return {
      rows,
      total: ordersPage.total,
      page: data.page,
      pageSize: data.pageSize,
      countries,
    };
  });
