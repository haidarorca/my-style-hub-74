/**
 * Archivage / restauration / suppression définitive des commandes (Cockpit).
 * Règle unique : une commande est archivée si et seulement si archived_at est rempli.
 * Aucune de ces fonctions ne modifie statut, prix, paiements ou données CJ.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RETENTION = z.union([z.literal(7), z.literal(30), z.literal(60), z.literal(90), z.literal(365), z.null()]);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function ensureAdmin(userId: string) {
  const { assertAdmin } = await import("@/lib/admin-auth.core");
  await assertAdmin(userId);
}
function purgeAt(from: Date, days: number | null) {
  return days == null ? null : new Date(from.getTime() + days * 86_400_000).toISOString();
}

export const getCockpitSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    const { data } = await sb.from("cockpit_settings" as never).select("default_retention_days").eq("id", 1).maybeSingle();
    return { default_retention_days: ((data as { default_retention_days: number | null } | null)?.default_retention_days ?? 30) as number | null };
  });

export const setDefaultRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: RETENTION }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    await sb.from("cockpit_settings" as never).update({ default_retention_days: data.days, updated_at: new Date().toISOString() } as never).eq("id", 1);
    return { ok: true };
  });

export const archiveOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), days: RETENTION.optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    let days = data.days;
    if (days === undefined) {
      const { data: s } = await sb.from("cockpit_settings" as never).select("default_retention_days").eq("id", 1).maybeSingle();
      days = ((s as { default_retention_days: number | null } | null)?.default_retention_days ?? 30) as never;
    }
    const now = new Date();
    const { error, count } = await sb
      .from("orders")
      .update({ archived_at: now.toISOString(), archived_by: context.userId, retention_days: days, purge_at: purgeAt(now, days ?? null) } as never, { count: "exact" })
      .in("id", data.ids)
      .is("archived_at", null);
    if (error) throw new Error("Archivage impossible : " + error.message);
    const { logAdminAction } = await import("@/lib/admin-auth.core");
    logAdminAction({ action: "order.archive", targetType: "order", details: { ids: data.ids, retention_days: days } });
    return { archived: count ?? 0 };
  });

export const restoreOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    const { error, count } = await sb
      .from("orders")
      .update({ archived_at: null, archived_by: null, retention_days: null, purge_at: null } as never, { count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error("Restauration impossible : " + error.message);
    const { logAdminAction } = await import("@/lib/admin-auth.core");
    logAdminAction({ action: "order.restore", targetType: "order", details: { ids: data.ids } });
    return { restored: count ?? 0 };
  });

export const setOrderRetention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), days: RETENTION }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    const { data: rows } = await sb.from("orders").select("id, archived_at").in("id", data.ids).not("archived_at", "is", null);
    for (const r of (rows ?? []) as { id: string; archived_at: string }[]) {
      await sb.from("orders").update({ retention_days: data.days, purge_at: purgeAt(new Date(r.archived_at), data.days) } as never).eq("id", r.id);
    }
    return { updated: rows?.length ?? 0 };
  });

export type ArchivedOrderRow = {
  id: string; reference: string | null; customer_name: string | null; total: number | null; status: string;
  created_at: string; archived_at: string; purge_at: string | null; retention_days: number | null;
};

export const listArchivedOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ q: z.string().max(100).default("") }).parse(i ?? {}))
  .handler(async ({ data, context }): Promise<ArchivedOrderRow[]> => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    let q = sb.from("orders")
      .select("id, reference, customer_name, total, status, created_at, archived_at, purge_at, retention_days")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(1000);
    const t = data.q.trim().replace(/[,()%]/g, "");
    if (t) q = q.or(`reference.ilike.%${t}%,customer_name.ilike.%${t}%,customer_phone.ilike.%${t}%`);
    const { data: rows } = await q;
    return (rows ?? []) as unknown as ArchivedOrderRow[];
  });

export type ActiveOrderLite = { id: string; reference: string | null; customer_name: string | null; customer_phone: string | null; total: number | null; status: string; created_at: string };

/** Liste légère des commandes NON archivées (pour l'archivage groupé). */
export const listActiveOrdersLite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ q: z.string().max(100).default(""), status: z.string().max(40).default("") }).parse(i ?? {}))
  .handler(async ({ data, context }): Promise<ActiveOrderLite[]> => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    let q = sb.from("orders")
      .select("id, reference, customer_name, customer_phone, total, status, created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.status) q = q.eq("status", data.status);
    const t = data.q.trim().replace(/[,()%]/g, "");
    if (t) q = q.or(`reference.ilike.%${t}%,customer_name.ilike.%${t}%,customer_phone.ilike.%${t}%`);
    const { data: rows } = await q;
    return (rows ?? []) as ActiveOrderLite[];
  });

/**
 * Suppression définitive — super admin, mot de passe re-vérifié, référence saisie,
 * limite de tentatives, journal d'audit avec instantané.
 */
export const hardDeleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    orderId: z.string().uuid(),
    password: z.string().min(1).max(200),
    confirmReference: z.string().min(1).max(60),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, logAdminActionSync } = await import("@/lib/admin-auth.core");
    await assertSuperAdmin(context.userId);
    const { consumeRateLimit, clearRateLimit } = await import("@/lib/auth-rate-limit.server");
    const rl = await consumeRateLimit(`order_hard_delete:${context.userId}`, "change_pw");
    if (!rl.allowed) throw new Error(`Trop de tentatives. Réessayez dans ${rl.retryAfterSec ?? 60}s.`);

    const email = (context.claims as { email?: string } | undefined)?.email;
    if (!email) throw new Error("Session sans email — vérification du mot de passe impossible.");
    const verifier = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { error: signErr } = await verifier.auth.signInWithPassword({ email, password: data.password });
    if (signErr) throw new Error("Mot de passe incorrect.");
    await clearRateLimit(`order_hard_delete:${context.userId}`, "change_pw");

    const sb = await admin();
    const { data: order } = await sb.from("orders")
      .select("id, reference, total, status, customer_name, customer_phone, created_at, cj_order_id, archived_at")
      .eq("id", data.orderId).maybeSingle();
    if (!order) throw new Error("Commande introuvable.");
    const o = order as { id: string; reference: string | null; total: number; status: string; customer_name: string | null; customer_phone: string | null; created_at: string; cj_order_id: string | null };
    const expected = (o.reference ?? o.id.slice(0, 8)).trim().toUpperCase();
    if (data.confirmReference.trim().toUpperCase() !== expected) throw new Error("La référence saisie ne correspond pas à la commande.");
    if (o.cj_order_id) throw new Error("Cette commande existe déjà chez CJ. Annulez-la d'abord chez CJ avant de la supprimer.");
    const { count: rc } = await sb.from("return_cases").select("id", { count: "exact", head: true }).eq("order_id", o.id);
    if ((rc ?? 0) > 0) throw new Error("Un dossier retour/SAV est lié à cette commande. Clôturez-le avant la suppression.");

    await logAdminActionSync({
      action: "order.hard_delete", targetType: "order", targetId: o.id,
      details: { snapshot: o, ip: getRequest().headers.get("x-forwarded-for") ?? null, actor: context.userId },
    });
    await sb.from("order_status_history").delete().eq("order_id", o.id);
    // Décisions liées aux événements de la commande (bloquent la suppression en cascade).
    const { data: evs } = await sb.from("order_events").select("id").eq("order_id", o.id);
    const evIds = ((evs ?? []) as { id: string }[]).map((e) => e.id);
    if (evIds.length) {
      const { data: decs } = await sb.from("order_decisions").select("id").in("event_id", evIds);
      const decIds = ((decs ?? []) as { id: string }[]).map((d) => d.id);
      if (decIds.length) {
        const { count: fm } = await sb.from("financial_movements").select("id", { count: "exact", head: true }).in("decision_id" as never, decIds);
        if ((fm ?? 0) > 0) throw new Error("Des mouvements financiers sont liés à cette commande. Suppression refusée pour garder la comptabilité exacte ; archivez-la plutôt.");
        await sb.from("order_decisions").update({ superseded_by: null } as never).in("superseded_by" as never, decIds);
        const { error: dErr } = await sb.from("order_decisions").delete().in("id", decIds);
        if (dErr) throw new Error("Suppression impossible : " + dErr.message);
      }
    }
    const { error } = await sb.from("orders").delete().eq("id", o.id);
    if (error) throw new Error("Suppression impossible : " + error.message);
    return { ok: true, reference: o.reference };
  });
