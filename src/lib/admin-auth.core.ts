/**
 * admin-auth.core.ts — Authentification & audit administratif centralisé
 *
 * Ce module est le SEUL point d'entrée pour :
 * - Vérification des permissions backend (assertPermission)
 * - Logging d'audit admin (logAdminAction)
 *
 * Il s'appuie sur les fonctions SQL existantes en DB :
 * - has_admin_permission(user_id, perm) → boolean
 * - log_admin_action(action, target_type, target_id, details) → uuid
 * - is_super_admin(user_id) → boolean
 *
 * NE PAS créer de logique parallèle. Toute vérification admin doit passer par ici.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AdminPermission } from "@/hooks/use-auth";

/* ================================================================
   1. PERMISSIONS
   ================================================================ */

/**
 * Vérifie qu'un utilisateur a une permission admin spécifique.
 * Super admin = toujours autorisé.
 * Admin standard = doit avoir la permission dans admin_permissions.
 *
 * Utilise la fonction SQL has_admin_permission() qui vérifie aussi
 * que le compte admin n'est pas suspendu.
 */
export async function assertPermission(
  userId: string,
  permission: AdminPermission,
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    "has_admin_permission" as never,
    { _user_id: userId, _perm: permission } as never,
  );

  if (error) {
    console.error("[admin-auth] has_admin_permission RPC error:", error);
    throw new Error("Erreur de vérification des permissions");
  }

  if (!data) {
    throw new Error(
      `Permission refusée : '${permission}' requise. ` +
        `Contactez le super administrateur si vous pensez qu'il s'agit d'une erreur.`,
    );
  }
}

/**
 * Vérifie que l'utilisateur est super admin.
 * Utilisé pour les actions sensibles (créer un admin, modifier les paramètres site).
 */
export async function assertSuperAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    "is_super_admin" as never,
    { _user_id: userId } as never,
  );

  if (error) {
    console.error("[admin-auth] is_super_admin RPC error:", error);
    throw new Error("Erreur de vérification du rôle");
  }

  if (!data) {
    throw new Error("Accès refusé : super administrateur requis.");
  }
}

/**
 * [DEPRECATED — Compatibilité temporaire]
 * Vérifie seulement le rôle admin/super_admin.
 * NE PAS utiliser pour les nouvelles server functions.
 * Préférer assertPermission() qui vérifie aussi la permission granulaire.
 *
 * TODO: Migrer tous les usages vers assertPermission() puis supprimer.
 */
export async function assertAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);

  if (error) {
    console.error("[admin-auth] assertAdmin error:", error);
    throw new Error("Erreur de vérification du rôle");
  }

  if (!data || data.length === 0) {
    throw new Error("Accès refusé : administrateur requis.");
  }
}

/* ================================================================
   2. AUDIT LOG
   ================================================================ */

export interface AuditLogPayload {
  /** Action effectuée, ex: "product.approve", "order.status_change", "vendor.delete" */
  action: string;
  /** Type de cible, ex: "product", "order", "vendor" */
  targetType?: string;
  /** ID de la cible */
  targetId?: string;
  /** Anciennes valeurs (pour les modifications) */
  oldValues?: Record<string, unknown>;
  /** Nouvelles valeurs (pour les modifications) */
  newValues?: Record<string, unknown>;
  /** Détails supplémentaires */
  details?: Record<string, unknown>;
}

/**
 * Enregistre une action administrative dans le log d'audit.
 * Utilise la fonction SQL log_admin_action() qui récupère automatiquement
 * l'actor_id et actor_email depuis auth.uid().
 *
 * Cette fonction est NON-bloquante — elle log en fire-and-forget.
 * Si le log échoue, l'action principale n'est pas annulée.
 */
export function logAdminAction(payload: AuditLogPayload): void {
  const details: Record<string, unknown> = { ...(payload.details ?? {}) };

  if (payload.oldValues) {
    details._old = payload.oldValues;
  }
  if (payload.newValues) {
    details._new = payload.newValues;
  }

  void supabaseAdmin
    .rpc("log_admin_action" as never, {
      _action: payload.action,
      _target_type: payload.targetType ?? null,
      _target_id: payload.targetId ?? null,
      _details: Object.keys(details).length > 0 ? details : null,
    } as never)
    .then(({ error }) => {
      if (error) {
        console.error("[admin-auth] logAdminAction failed:", error, payload);
      }
    });
}

/**
 * Version synchrone (awaitable) du log d'audit.
 * À utiliser quand on veut être SÛR que le log est écrit
 * (ex: suppression définitive, actions financières).
 */
export async function logAdminActionSync(
  payload: AuditLogPayload,
): Promise<void> {
  const details: Record<string, unknown> = { ...(payload.details ?? {}) };

  if (payload.oldValues) {
    details._old = payload.oldValues;
  }
  if (payload.newValues) {
    details._new = payload.newValues;
  }

  const { error } = await supabaseAdmin.rpc("log_admin_action" as never, {
    _action: payload.action,
    _target_type: payload.targetType ?? null,
    _target_id: payload.targetId ?? null,
    _details: Object.keys(details).length > 0 ? details : null,
  } as never);

  if (error) {
    console.error("[admin-auth] logAdminActionSync failed:", error, payload);
  }
}

/* ================================================================
   3. HELPERS — Wrappers action + audit combinés
   ================================================================ */

/**
 * Wrapper qui vérifie la permission + logue l'action en une seule fois.
 * Utilisation : dans les handlers de server functions.
 *
 * Exemple :
 *   await requireAdminAction(context.userId, "product_validation", {
 *     action: "product.approve",
 *     targetType: "product",
 *     targetId: productId,
 *   });
 */
export async function requireAdminAction(
  userId: string,
  permission: AdminPermission,
  audit: AuditLogPayload,
): Promise<void> {
  await assertPermission(userId, permission);
  logAdminAction(audit);
}

/**
 * Wrapper pour les actions super admin.
 */
export async function requireSuperAdminAction(
  userId: string,
  audit: AuditLogPayload,
): Promise<void> {
  await assertSuperAdmin(userId);
  logAdminAction(audit);
}
