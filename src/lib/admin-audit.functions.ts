/**
 * admin-audit.functions.ts — Server functions pour la consultation des logs d'audit
 * Accessible uniquement aux super_admin via assertSuperAdmin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSuperAdmin } from "./admin-auth.core";

const ListSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  action: z.string().max(100).default(""),
  targetType: z.string().max(50).default(""),
  q: z.string().max(200).default(""),
  dateFrom: z.string().nullable().default(null),
  dateTo: z.string().nullable().default(null),
});

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  action_label: string | null;
  target_type: string | null;
  target_id: string | null;
  old_values: any;
  new_values: any;
  details: any;
  created_at: string;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const listAdminAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? ListSchema.parse(input) : ListSchema.parse({})))
  .handler(async ({ data, context }): Promise<AuditLogPage> => {
    await assertSuperAdmin(context.userId);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin
      .from("admin_action_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.action) q = q.eq("action", data.action);
    if (data.targetType) q = q.eq("target_type", data.targetType);
    if (data.dateFrom) q = q.gte("created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("created_at", data.dateTo + "T23:59:59");

    if (data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`actor_email.ilike.${term},action.ilike.${term},target_id.ilike.${term}`);
    }

    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    // Build action labels client-side (vue SQL pas toujours disponible via RPC)
    const actionLabelMap: Record<string, string> = {
      "product.approve": "Produit approuvé",
      "product.reject": "Produit rejeté",
      "product.delete": "Produit supprimé",
      "product.archive": "Produit archivé",
      "product.edit": "Produit modifié",
      "order.status_change": "Statut commande modifié",
      "vendor.activate": "Vendeur activé",
      "vendor.suspend": "Vendeur suspendu",
      "vendor.block": "Vendeur bloqué",
      "vendor.status_change": "Statut vendeur modifié",
      "vendor.access_update": "Accès vendeur modifié",
      "report.review": "Signalement examiné",
      "report.dismiss": "Signalement rejeté",
      "settings.update": "Paramètres modifiés",
    };

    const enrichedRows: AuditLogRow[] = (rows ?? []).map((r: any) => ({
      ...r,
      action_label: actionLabelMap[r.action] ?? r.action,
      old_values: r.old_values ?? null,
      new_values: r.new_values ?? null,
      details: r.details ?? null,
    }));

    return { rows: enrichedRows, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

export const getAuditLogActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    await assertSuperAdmin(context.userId);

    const { data, error } = await supabaseAdmin
      .from("admin_action_log")
      .select("action")
      .order("action", { ascending: true });

    if (error) throw new Error(error.message);

    const uniqueActions = Array.from(new Set((data ?? []).map((r) => r.action)));
    return uniqueActions;
  });
