import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";


export type AdminShopRow = {
  id: string;
  shop_name: string | null;
  shop_logo_url: string | null;
  shop_banner_url: string | null;
  shop_description: string | null;
  vendor_mode: "commission" | "no_commission";
  vendor_status: string;
  source_country_id: string | null;
  ships_internationally: boolean;
  allowed_destination_country_ids: string[];
  created_at: string;
  managed_by_admin_id: string | null;
  product_count?: number;
};

export const listAdminShops = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.userId, "vendors");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, shop_name, shop_logo_url, shop_banner_url, shop_description, vendor_mode, vendor_status, source_country_id, ships_internationally, allowed_destination_country_ids, created_at, managed_by_admin_id",
      )
      .eq("is_admin_shop", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as AdminShopRow[];
    
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      const { data: counts } = await supabaseAdmin
        .from("products")
        .select("vendor_id")
        .in("vendor_id", ids);
      const map = new Map<string, number>();
      for (const c of (counts ?? []) as { vendor_id: string }[]) {
        map.set(c.vendor_id, (map.get(c.vendor_id) ?? 0) + 1);
      }
      for (const r of rows) r.product_count = map.get(r.id) ?? 0;
    }
    return { rows };
  });

const ShopInput = z.object({
  shop_name: z.string().trim().min(1).max(120),
  shop_description: z.string().trim().max(2000).optional().nullable(),
  shop_logo_url: z.string().url().max(1000).optional().nullable(),
  shop_banner_url: z.string().url().max(1000).optional().nullable(),
  shop_type: z.enum(["local", "international"]),
  source_country_id: z.string().uuid().nullable(),
  allowed_destination_country_ids: z.array(z.string().uuid()).max(300).default([]),
  vendor_mode: z.enum(["commission", "no_commission"]).default("no_commission"),
});

export const createAdminShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ShopInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "vendors");

    if (!data.source_country_id) {
      throw new Error("Le pays source est requis.");
    }

    const ships = data.shop_type === "international";
    const allowed = ships ? data.allowed_destination_country_ids : [data.source_country_id];

    const slug = data.shop_name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "shop";
    const email = `shop-${slug}-${Date.now().toString(36)}@kawzone-shops.internal`;
    const password = crypto.randomUUID() + crypto.randomUUID();

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.shop_name, is_admin_shop: true },
    });
    if (cErr || !created.user) throw new Error(`Création utilisateur: ${cErr?.message}`);
    const newId = created.user.id;

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        shop_name: data.shop_name,
        shop_description: data.shop_description ?? null,
        shop_logo_url: data.shop_logo_url ?? null,
        shop_banner_url: data.shop_banner_url ?? null,
        source_country_id: data.source_country_id,
        ships_internationally: ships,
        allowed_destination_country_ids: allowed,
        vendor_mode: data.vendor_mode,
        vendor_status: "active",
        is_verified: true,
        hide_contact_publicly: true,
        is_admin_shop: true,
        managed_by_admin_id: context.userId,
        full_name: `Boutique ${data.shop_name}`,
      })
      .eq("id", newId);
    if (pErr) throw new Error(`Profil: ${pErr.message}`);

    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: "vendeur" });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId).eq("role", "acheteur");

    return { id: newId };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  shop_name: z.string().trim().min(1).max(120).optional(),
  shop_description: z.string().trim().max(2000).nullable().optional(),
  shop_logo_url: z.string().url().max(1000).nullable().optional(),
  shop_banner_url: z.string().url().max(1000).nullable().optional(),
  shop_type: z.enum(["local", "international"]).optional(),
  source_country_id: z.string().uuid().nullable().optional(),
  allowed_destination_country_ids: z.array(z.string().uuid()).max(300).optional(),
  vendor_mode: z.enum(["commission", "no_commission"]).optional(),
  vendor_status: z.enum(["active", "suspended", "blocked"]).optional(),
});

export const updateAdminShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "vendors");

    const { data: existing, error: eErr } = await supabaseAdmin
      .from("profiles")
      .select("id, is_admin_shop, ships_internationally, source_country_id, allowed_destination_country_ids")
      .eq("id", data.id)
      .maybeSingle();
    if (eErr) throw new Error(eErr.message);
    if (!existing || !(existing as any).is_admin_shop) throw new Error("Boutique introuvable.");

    const patch: Record<string, unknown> = {};
    if (data.shop_name !== undefined) patch.shop_name = data.shop_name;
    if (data.shop_description !== undefined) patch.shop_description = data.shop_description;
    if (data.shop_logo_url !== undefined) patch.shop_logo_url = data.shop_logo_url;
    if (data.shop_banner_url !== undefined) patch.shop_banner_url = data.shop_banner_url;
    if (data.vendor_mode !== undefined) patch.vendor_mode = data.vendor_mode;
    if (data.vendor_status !== undefined) patch.vendor_status = data.vendor_status;

    if (data.shop_type !== undefined) {
      const ships = data.shop_type === "international";
      patch.ships_internationally = ships;
      const src = data.source_country_id ?? (existing as any).source_country_id;
      if (!src) throw new Error("Pays source requis.");
      patch.source_country_id = src;
      patch.allowed_destination_country_ids = ships
        ? (data.allowed_destination_country_ids ?? (existing as any).allowed_destination_country_ids ?? [])
        : [src];
    } else {
      if (data.source_country_id !== undefined) patch.source_country_id = data.source_country_id;
      if (data.allowed_destination_country_ids !== undefined)
        patch.allowed_destination_country_ids = data.allowed_destination_country_ids;
    }

    const { error: uErr } = await (supabaseAdmin as any).from("profiles").update(patch).eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const getAdminShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "vendors");
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, shop_name, shop_logo_url, shop_banner_url, shop_description, vendor_mode, vendor_status, source_country_id, ships_internationally, allowed_destination_country_ids, created_at, is_admin_shop, managed_by_admin_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || !(row as any).is_admin_shop) throw new Error("Boutique introuvable.");
    return row as AdminShopRow & { is_admin_shop: boolean };
  });

export const getAdminShopDeletionInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "vendors");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, shop_name, is_admin_shop")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || !(row as any).is_admin_shop) throw new Error("Boutique introuvable.");

    const { count: productCount } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", data.id);

    const { count: orderItemCount } = await supabaseAdmin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", data.id);

    return {
      shop_name: (row as any).shop_name as string | null,
      product_count: productCount ?? 0,
      order_item_count: orderItemCount ?? 0,
    };
  });

export const deleteAdminShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "vendors");

    // Verify password by re-authenticating the calling admin
    const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (uErr || !userRes?.user?.email) throw new Error("Impossible de vérifier l'identité admin.");
    const adminEmail = userRes.user.email;

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const verifier = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { error: signErr } = await verifier.auth.signInWithPassword({
      email: adminEmail,
      password: data.password,
    });
    if (signErr) throw new Error("Mot de passe admin incorrect.");

    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, is_admin_shop")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || !(row as any).is_admin_shop) throw new Error("Boutique introuvable.");

    const { count } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error(`Impossible : cette boutique contient ${count} produit(s). Supprimez-les d'abord.`);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
