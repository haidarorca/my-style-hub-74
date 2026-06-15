/* ═══════════════════════════════════════════════════════════════
   Article States — Persistance par article (order_article_states)
   Article = source de vérité métier · Commande = agrégat calculé.
   ═══════════════════════════════════════════════════════════════ */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ── Schemas ── */

const ListSchema = z.object({ order_id: z.string().uuid() });

const UpsertSchema = z.object({
  order_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  /** Patch partiel. Seuls les champs présents sont écrits. */
  patch: z.object({
    status: z.string().optional(),
    delivered_qty: z.number().int().min(0).optional(),
    stock_break: z.any().nullable().optional(),
    settlement: z.any().nullable().optional(),
  }),
  /** Concurrence optimiste : version attendue avant écriture (omis = pas de check). */
  expected_version: z.number().int().optional(),
  /** Action métier pour l'audit (ex: "stock_break.declare", "settlement.refund"). */
  audit_action: z.string().min(1),
});

/* ── Types DTO (forme 1:1 avec la table) ── */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface ArticleStateRow {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  status: string;
  delivered_qty: number;
  stock_break: Json | null;
  settlement: Json | null;
  version: number;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export type UpsertResult =
  | { ok: true; row: ArticleStateRow }
  | { ok: false; error: "version_conflict"; row: ArticleStateRow }
  | { ok: false; error: "denied" };

/* ── List ── */

export const listArticleStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data, context }): Promise<ArticleStateRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("order_article_states" as never)
      .select("*")
      .eq("order_id" as never, data.order_id as never);
    if (error) {
      console.error("[article-states] list error", error);
      return [];
    }
    return (rows ?? []) as unknown as ArticleStateRow[];
  });

/* ── Upsert (concurrence optimiste + audit admin_action_log) ── */

export const upsertArticleState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ data, context }): Promise<UpsertResult> => {
    const { supabase, userId } = context;

    // Chercher la ligne existante (clé : order + product + variant)
    const sel = supabase
      .from("order_article_states" as never)
      .select("*")
      .eq("order_id" as never, data.order_id as never)
      .eq("product_id" as never, data.product_id as never);
    const selScoped = data.variant_id
      ? sel.eq("variant_id" as never, data.variant_id as never)
      : sel.is("variant_id" as never, null as never);
    const { data: existing, error: selErr } = await selScoped.maybeSingle();

    if (selErr && selErr.code !== "PGRST116") {
      console.error("[article-states] select error", selErr);
      return { ok: false, error: "denied" };
    }

    const ex = existing as unknown as ArticleStateRow | null;

    // Concurrence optimiste : si une version attendue est fournie, elle doit matcher
    if (ex && data.expected_version != null && ex.version !== data.expected_version) {
      return { ok: false, error: "version_conflict", row: ex };
    }

    let saved: ArticleStateRow;

    if (!ex) {
      // INSERT (premier état mutable pour cet article)
      const payload: Record<string, unknown> = {
        order_id: data.order_id,
        product_id: data.product_id,
        variant_id: data.variant_id ?? null,
        status: data.patch.status ?? "pending",
        delivered_qty: data.patch.delivered_qty ?? 0,
        stock_break: data.patch.stock_break ?? null,
        settlement: data.patch.settlement ?? null,
        updated_by: userId,
      };
      const { data: ins, error: insErr } = await supabase
        .from("order_article_states" as never)
        .insert(payload as never)
        .select("*")
        .single();
      if (insErr || !ins) {
        console.error("[article-states] insert error", insErr);
        return { ok: false, error: "denied" };
      }
      saved = ins as unknown as ArticleStateRow;
    } else {
      // UPDATE partiel : seuls les champs présents dans patch sont touchés
      const patch: Record<string, unknown> = { updated_by: userId };
      if (data.patch.status !== undefined) patch.status = data.patch.status;
      if (data.patch.delivered_qty !== undefined) patch.delivered_qty = data.patch.delivered_qty;
      if (data.patch.stock_break !== undefined) patch.stock_break = data.patch.stock_break;
      if (data.patch.settlement !== undefined) patch.settlement = data.patch.settlement;

      const { data: upd, error: updErr } = await supabase
        .from("order_article_states" as never)
        .update(patch as never)
        .eq("id" as never, ex.id as never)
        .select("*")
        .single();
      if (updErr || !upd) {
        console.error("[article-states] update error", updErr);
        return { ok: false, error: "denied" };
      }
      saved = upd as unknown as ArticleStateRow;
    }

    // Audit fire-and-forget — log_admin_action récupère actor depuis auth.uid()
    void supabase.rpc("log_admin_action" as never, {
      _action: `article_state.${data.audit_action}`,
      _target_type: "order_article_state",
      _target_id: saved.id,
      _details: {
        order_id: data.order_id,
        product_id: data.product_id,
        variant_id: data.variant_id ?? null,
        patch: data.patch,
        new_version: saved.version,
      },
    } as never);

    return { ok: true, row: saved };
  });
