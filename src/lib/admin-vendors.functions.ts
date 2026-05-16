import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (error) throw new Error(`Erreur rôle: ${error.message}`);
  if (!data || data.length === 0) throw new Error("Accès refusé : admin requis");
}

export type VendorAccountStatus =
  | "active"
  | "pending"
  | "suspended"
  | "expired"
  | "blocked";

export type AdminVendorProfile = {
  email: string | null;
  full_name: string | null;
  shop_name: string | null;
  phone: string | null;
  source_country_id: string | null;
  vendor_mode: "commission" | "no_commission";
  ships_internationally: boolean;
  allowed_destination_country_ids: string[] | null;
  is_verified: boolean | null;
  vendor_status: VendorAccountStatus;
  access_starts_at: string | null;
  access_ends_at: string | null;
  address: string | null;
  created_at: string;
};

export type AdminVendorRow = { user_id: string; profiles: AdminVendorProfile | null };

export type AdminVendorListPage = {
  rows: AdminVendorRow[];
  total: number;
  page: number;
  pageSize: number;
};

const ListInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  q: z.string().trim().max(200).default(""),
  status: z
    .enum(["all", "active", "pending", "suspended", "expired", "blocked"])
    .default("all"),
  sort: z.enum(["created_at", "shop_name", "vendor_status"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export const listAdminVendors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? ListInput.parse(input) : ListInput.parse({})))
  .handler(async ({ data, context }): Promise<AdminVendorListPage> => {
    await assertAdmin(context.userId);

    // 1) Get vendor user ids
    const { data: roleRows, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "vendeur");
    if (rErr) throw new Error(rErr.message);
    const vendorIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id as string)));
    if (vendorIds.length === 0) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
    }

    // 2) Build profiles query with filters
    const cols =
      "id, email, full_name, shop_name, phone, source_country_id, vendor_mode, ships_internationally, allowed_destination_country_ids, is_verified, vendor_status, access_starts_at, access_ends_at, address, created_at";

    let q = supabaseAdmin
      .from("profiles")
      .select(cols, { count: "exact" })
      .in("id", vendorIds);

    if (data.status !== "all") {
      q = q.eq("vendor_status", data.status);
    }

    const search = data.q.trim();
    if (search.length > 0) {
      const safe = search.replace(/[,()]/g, " ");
      const pattern = `%${safe}%`;
      q = q.or(
        `shop_name.ilike.${pattern},full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`
      );
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    q = q.order("created_at", { ascending: false }).range(from, to);

    const { data: profs, error: pErr, count } = await q;
    if (pErr) throw new Error(pErr.message);

    const rows: AdminVendorRow[] = (profs ?? []).map((p) => {
      const { id, ...rest } = p as { id: string } & AdminVendorProfile;
      return { user_id: id, profiles: rest as AdminVendorProfile };
    });

    return {
      rows,
      total: count ?? rows.length,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
