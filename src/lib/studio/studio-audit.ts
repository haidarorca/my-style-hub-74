// ============================================================
// Studio Audit — KawZone Studio
// Phase 2 : Logging des actions administrateur
// ============================================================

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface StudioAuditEntry {
  actorId: string;
  action: "studio_query" | "studio_export" | "studio_save_view" | "studio_delete_view" | "studio_load_view";
  entity?: string;
  templateKey?: string;
  details?: Record<string, unknown>;
}

/**
 * Enregistre une action Studio dans le journal d'audit administrateur.
 * Utilise supabaseAdmin pour bypass RLS (appel serveur).
 * Ne bloque jamais l'operation principale (fire-and-forget avec catch).
 */
export async function logStudioAction(entry: StudioAuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from("admin_action_log").insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.entity ?? "studio",
      target_id: entry.templateKey ?? "—",
      details: entry.details ?? {},
      created_at: new Date().toISOString(),
    });
  } catch {
    // Silencieux — l'audit ne doit jamais bloquer l'operation
  }
}
