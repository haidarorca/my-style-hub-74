/**
 * Moteur de rappels Cockpit — règles, tableau « À faire », historique.
 * Lecture seule sur les commandes : rien ici ne modifie une commande.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TRIGGER_TYPES = ["status", "payment_pending", "paid_not_sent_cj", "stock_issue", "shipped_no_tracking", "no_admin_action"] as const;
export const LEVELS = ["info", "attention", "important", "critical"] as const;
export type Level = (typeof LEVELS)[number];

export type ReminderRule = {
  id: string; name: string; trigger_type: (typeof TRIGGER_TYPES)[number]; trigger_status: string | null;
  delay_minutes: number; frequency_minutes: number; max_count: number | null; level: Level;
  sound_enabled: boolean; sound: string; message_template: string | null; enabled: boolean;
  created_at: string; updated_at: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
async function ensureAdmin(userId: string) {
  const { assertAdmin } = await import("@/lib/admin-auth.core");
  await assertAdmin(userId);
}

const RuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  trigger_type: z.enum(TRIGGER_TYPES),
  trigger_status: z.string().max(40).nullable().default(null),
  delay_minutes: z.number().int().min(0).max(525600),
  frequency_minutes: z.number().int().min(5).max(525600),
  max_count: z.number().int().min(1).max(1000).nullable(),
  level: z.enum(LEVELS),
  sound_enabled: z.boolean(),
  sound: z.string().max(30),
  message_template: z.string().max(500).nullable().default(null),
  enabled: z.boolean(),
}).refine((r) => r.trigger_type !== "status" || !!r.trigger_status, { message: "Choisissez un statut" });

export const listReminderRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReminderRule[]> => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    const { data } = await sb.from("reminder_rules" as never).select("*").order("created_at");
    return (data ?? []) as ReminderRule[];
  });

export const saveReminderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RuleSchema.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    const { id, ...rest } = data;
    const payload = { ...rest, trigger_status: rest.trigger_type === "status" ? rest.trigger_status : null };
    if (id) {
      const { error } = await sb.from("reminder_rules" as never).update(payload as never).eq("id", id);
      if (error) throw new Error(error.message);
      // Maximum modifié → aligner les rappels ouverts
      await sb.from("order_reminders" as never).update({ max_count: payload.max_count } as never).eq("rule_id", id).in("state", ["pending", "active"]);
      return { id };
    }
    const { data: row, error } = await sb.from("reminder_rules" as never).insert({ ...payload, created_by: context.userId } as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const toggleReminderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    await sb.from("reminder_rules" as never).update({ enabled: data.enabled } as never).eq("id", data.id);
    if (!data.enabled) {
      await sb.from("order_reminders" as never)
        .update({ state: "resolved", resolved_at: new Date().toISOString(), resolved_reason: "Règle désactivée" } as never)
        .eq("rule_id", data.id).in("state", ["pending", "active", "exhausted"]);
    }
    return { ok: true };
  });

export const deleteReminderRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    await sb.from("reminder_rules" as never).delete().eq("id", data.id);
    return { ok: true };
  });

/** Lance immédiatement un passage du moteur (même logique que la tâche serveur). */
export const runReminderEngineNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    const { data, error } = await sb.rpc("run_reminder_engine" as never);
    if (error) throw new Error(error.message);
    return data as { fired?: number; created?: number; resolved?: number; skipped?: boolean };
  });

export type TodoTile = {
  key: string; label: string; count: number; level: Level | "neutral" | "success";
  orderIds: string[]; ruleId?: string; watch?: boolean;
};

export const getTodoBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TodoTile[]> => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);

    const [newRes, stockRes, doneRes, remRes, rulesRes] = await Promise.all([
      sb.from("orders").select("id").is("archived_at", null).eq("status", "new").limit(1000),
      sb.from("orders").select("id").is("archived_at", null).eq("cj_stock_status", "issue").is("cj_order_id", null).neq("status", "cancelled").limit(500),
      sb.from("order_status_history").select("order_id").eq("to_status", "delivered").gte("created_at", startOfDay.toISOString()).limit(1000),
      sb.from("order_reminders" as never).select("id, rule_id, order_id, state, next_at, started_at").in("state", ["pending", "active", "exhausted"]).limit(5000),
      sb.from("reminder_rules" as never).select("id, name, level, delay_minutes, enabled").eq("enabled", true),
    ]);

    const tiles: TodoTile[] = [];
    const newIds = (newRes.data ?? []).map((r) => r.id as string);
    tiles.push({ key: "new", label: newIds.length > 1 ? "nouvelles commandes" : "nouvelle commande", count: newIds.length, level: "neutral", orderIds: newIds });
    const stockIds = (stockRes.data ?? []).map((r) => r.id as string);
    tiles.push({ key: "stock", label: stockIds.length > 1 ? "problèmes de stock" : "problème de stock", count: stockIds.length, level: "neutral", orderIds: stockIds });

    const rules = (rulesRes.data ?? []) as { id: string; name: string; level: Level; delay_minutes: number }[];
    const rems = (remRes.data ?? []) as { rule_id: string; order_id: string; state: string; next_at: string; started_at: string }[];
    const now = Date.now();
    for (const rule of rules) {
      const mine = rems.filter((r) => r.rule_id === rule.id);
      const due = mine.filter((r) => r.state !== "pending");
      const windowMs = rule.delay_minutes * 60_000 * 0.2;
      const watch = mine.filter((r) => r.state === "pending" && new Date(r.next_at).getTime() - now <= windowMs);
      if (due.length) tiles.push({ key: `rule:${rule.id}`, label: rule.name, count: due.length, level: rule.level, orderIds: [...new Set(due.map((r) => r.order_id))], ruleId: rule.id });
      if (watch.length) tiles.push({ key: `watch:${rule.id}`, label: `${rule.name} — bientôt`, count: watch.length, level: "attention", orderIds: [...new Set(watch.map((r) => r.order_id))], ruleId: rule.id, watch: true });
    }

    const doneIds = [...new Set((doneRes.data ?? []).map((r) => r.order_id as string))];
    tiles.push({ key: "done", label: "terminées aujourd'hui", count: doneIds.length, level: "success", orderIds: doneIds });

    const rank: Record<string, number> = { critical: 0, important: 1, attention: 2, neutral: 3, info: 4, success: 5 };
    return tiles.sort((a, b) => (rank[a.level] - rank[b.level]) || (a.watch ? 1 : 0) - (b.watch ? 1 : 0));
  });

export type NotificationLogRow = {
  id: string; event_type: string; order_id: string | null; order_ref: string | null; level: string;
  title: string; message: string | null; created_at: string;
};

export const listNotificationLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ limit: z.number().int().min(1).max(500).default(200), orderId: z.string().uuid().nullable().default(null) }).parse(i ?? {}))
  .handler(async ({ data, context }): Promise<NotificationLogRow[]> => {
    await ensureAdmin(context.userId);
    const sb = await admin();
    let q = sb.from("notification_log" as never).select("id, event_type, order_id, order_ref, level, title, message, created_at").order("created_at", { ascending: false }).limit(data.limit);
    if (data.orderId) q = q.eq("order_id", data.orderId);
    const { data: rows } = await q;
    return (rows ?? []) as NotificationLogRow[];
  });
