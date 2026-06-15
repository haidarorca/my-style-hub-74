// ═══════════════════════════════════════════════════════════════
// COCKPIT VENDOR SCOPE — Détermine quelles sous-commandes
// nécessitent une intervention administrative Kawzone.
//
// Règle métier (validée par le user) :
//   Une sous-commande boutique apparaît dans le Cockpit si :
//     - la boutique est gérée directement par Kawzone (is_admin_shop),
//     OU
//     - le vendeur travaille en commission (vendor_mode = 'commission').
//
//   Une sous-commande d'un vendeur 100% autonome SANS commission
//   (vendor_mode = 'no_commission' ET is_admin_shop = false) est
//   OBSERVÉE mais ne pollue pas l'outil de travail quotidien.
//
// Cette fn renvoie un mapping vendor_id → scope. Le filtrage final
// se fait côté client dans useSubOrderRows.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VendorCockpitScope =
  | "kawzone"        // Boutique interne Kawzone (is_admin_shop)
  | "commission"     // Vendeur externe avec commission → Kawzone intervient
  | "autonomous";    // Vendeur autonome sans commission → hors Cockpit

export interface VendorScopeRow {
  vendor_id: string;
  scope: VendorCockpitScope;
  is_kawzone_managed: boolean; // true pour kawzone + commission
  shop_name: string | null;
  is_admin_shop: boolean;
  vendor_mode: "commission" | "no_commission" | null;
}

const Input = z.object({
  vendor_ids: z.array(z.string().uuid()).max(500),
});

export const getCockpitVendorScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data, context }): Promise<VendorScopeRow[]> => {
    if (data.vendor_ids.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("profiles")
      .select("id, shop_name, is_admin_shop, vendor_mode")
      .in("id", data.vendor_ids);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const isAdminShop = !!r.is_admin_shop;
      const mode = (r.vendor_mode ?? null) as "commission" | "no_commission" | null;
      const scope: VendorCockpitScope = isAdminShop
        ? "kawzone"
        : mode === "commission"
          ? "commission"
          : "autonomous";
      return {
        vendor_id: r.id as string,
        scope,
        is_kawzone_managed: scope !== "autonomous",
        shop_name: (r.shop_name ?? null) as string | null,
        is_admin_shop: isAdminShop,
        vendor_mode: mode,
      };
    });
  });
