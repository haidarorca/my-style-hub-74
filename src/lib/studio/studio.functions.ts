// ============================================================
// Fonctions Serveur — KawZone Studio
// Phase 2 : API pour le Studio
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STUDIO_LIMITS } from "./studio.types";
import {
  ExecuteQueryParamsSchema, SaveViewParamsSchema, ViewIdSchema, ExportCsvParamsSchema,
} from "./studio-security";
import { buildQuery, buildExportQuery, mapTemplateToEntity } from "./query-builder";
import { getEntity } from "./schema-registry";
import { logStudioAction } from "./studio-audit";

// ------------------------------------------------------------------
// 1. executeQuery — Exécute une requête studio
// ------------------------------------------------------------------

export const executeQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ExecuteQueryParamsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const startTime = Date.now();
    const { query, from, to } = buildQuery(data, data.page, context.supabase);

    const { data: rows, error, count } = await query;

    const duration = Date.now() - startTime;
    if (duration > STUDIO_LIMITS.TIMEOUT_MS) {
      console.warn(`[Studio] Query timeout warning: ${duration}ms`);
    }

    if (error) {
      console.error("[Studio] Query error:", error);
      throw new Error(`Erreur requête: ${error.message}`);
    }

    // Audit
    await logStudioAction({
      actorId: context.userId,
      action: "studio_query",
      entity: data.templateKey,
      templateKey: data.templateKey,
      details: { filters: data.filters, durationMs: duration },
    });

    return {
      rows: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ------------------------------------------------------------------
// 2. getSchema — Retourne les métadonnées d'une entité
// ------------------------------------------------------------------

export const getSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ templateKey: z.enum(["articles_vendus", "sous_commandes", "produits"]) }).parse(input))
  .handler(async ({ data }) => {
    const entityId = mapTemplateToEntity(data.templateKey);
    const entity = getEntity(entityId);
    if (!entity) throw new Error(`Entité inconnue: ${entityId}`);

    return {
      entity: {
        id: entity.id,
        label: entity.label,
        table: entity.table,
        fields: entity.fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          filterable: f.filterable,
          sortable: f.sortable,
          enum: f.enum,
          format: f.format,
        })),
      },
    };
  });

// ------------------------------------------------------------------
// 3. saveView — Sauvegarde une vue
// ------------------------------------------------------------------

export const saveView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveViewParamsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase as any
      .from("studio_views" as any)
      .insert({
        name: data.name,
        description: data.description ?? null,
        template_key: data.templateKey,
        config: data.config as any,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Erreur sauvegarde: ${error.message}`);

    await logStudioAction({
      actorId: context.userId,
      action: "studio_save_view",
      templateKey: data.templateKey,
      details: { viewId: result.id, name: data.name },
    });

    return { id: result.id };
  });

// ------------------------------------------------------------------
// 4. listViews — Liste les vues sauvegardées
// ------------------------------------------------------------------

export const listViews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ templateKey: z.enum(["articles_vendus", "sous_commandes", "produits"]).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase as any
      .from("studio_views" as any)
      .select("id, name, description, template_key, config, created_by, created_at, updated_at")
      .eq("created_by", context.userId)
      .order("updated_at", { ascending: false });

    if (data.templateKey) {
      q = q.eq("template_key", data.templateKey);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(`Erreur liste: ${error.message}`);

    return { views: rows ?? [] };
  });

// ------------------------------------------------------------------
// 5. getView — Charge une vue
// ------------------------------------------------------------------

export const getView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ViewIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase as any
      .from("studio_views" as any)
      .select("*")
      .eq("id", data.viewId)
      .eq("created_by", context.userId)
      .single();

    if (error || !row) throw new Error("Vue introuvable");

    await logStudioAction({
      actorId: context.userId,
      action: "studio_load_view",
      templateKey: row.template_key,
      details: { viewId: data.viewId },
    });

    return row;
  });

// ------------------------------------------------------------------
// 6. deleteView — Supprime une vue
// ------------------------------------------------------------------

export const deleteView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ViewIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase as any
      .from("studio_views" as any)
      .delete()
      .eq("id", data.viewId)
      .eq("created_by", context.userId);

    if (error) throw new Error(`Erreur suppression: ${error.message}`);

    await logStudioAction({
      actorId: context.userId,
      action: "studio_delete_view",
      details: { viewId: data.viewId },
    });

    return { ok: true };
  });

// ------------------------------------------------------------------
// 7. exportCsv — Exporte en CSV
// ------------------------------------------------------------------

export const exportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ExportCsvParamsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const maxRows = data.maxRows ?? STUDIO_LIMITS.MAX_ROWS_EXPORT;
    const query = buildExportQuery(data, maxRows, context.supabase);

    const { data: rows, error } = await query;
    if (error) throw new Error(`Erreur export: ${error.message}`);

    // Construction CSV
    const columns = data.columns;
    const csvRows = rows ?? [];
    const lines: string[] = [];

    // Header
    lines.push(columns.join(";"));

    // Data
    for (const row of csvRows) {
      const values = columns.map((col) => {
        const val = (row as Record<string, any>)[col];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val).replace(/;/g, ",");
      });
      lines.push(values.join(";"));
    }

    const csv = lines.join("\n");

    await logStudioAction({
      actorId: context.userId,
      action: "studio_export",
      templateKey: data.templateKey,
      details: { rowCount: csvRows.length },
    });

    return { csv, filename: `studio-export-${Date.now()}.csv` };
  });
