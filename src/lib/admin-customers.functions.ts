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

export type CustomerStatus = "active" | "blocked";

export type CustomerListRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  default_country_id: string | null;
  status: CustomerStatus;
  orders_count: number;
  total_spent: number;
};

export const listCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomerListRow[]> => {
    await assertAdmin(context.userId);

    // 1) acheteur role rows (include suspended flag)
    const { data: roleRows, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, is_suspended")
      .eq("role", "acheteur");
    if (rErr) throw new Error(rErr.message);
    const acheteurs = (roleRows ?? []) as { user_id: string; is_suspended: boolean }[];
    if (acheteurs.length === 0) return [];

    // Exclude users who also have a vendor or admin role (those have their own dashboards)
    const ids = acheteurs.map((r) => r.user_id);
    const { data: otherRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids)
      .in("role", ["vendeur", "admin", "super_admin"]);
    const excluded = new Set((otherRoles ?? []).map((r) => (r as { user_id: string }).user_id));
    const customers = acheteurs.filter((r) => !excluded.has(r.user_id));
    const customerIds = customers.map((c) => c.user_id);
    if (customerIds.length === 0) return [];

    // 2) profiles
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, phone, created_at")
      .in("id", customerIds);
    const profById = new Map<string, { email: string | null; full_name: string | null; phone: string | null; created_at: string }>();
    for (const p of profs ?? []) {
      const row = p as { id: string; email: string | null; full_name: string | null; phone: string | null; created_at: string };
      profById.set(row.id, { email: row.email, full_name: row.full_name, phone: row.phone, created_at: row.created_at });
    }

    // 3) default delivery country per customer
    const { data: addrs } = await supabaseAdmin
      .from("customer_addresses")
      .select("user_id, destination_country_id, is_default, created_at")
      .in("user_id", customerIds)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    const countryByUser = new Map<string, string | null>();
    for (const a of addrs ?? []) {
      const row = a as { user_id: string; destination_country_id: string | null };
      if (!countryByUser.has(row.user_id)) countryByUser.set(row.user_id, row.destination_country_id);
    }

    // 4) orders aggregate (count + sum)
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("buyer_id, total")
      .in("buyer_id", customerIds);
    const ordersByUser = new Map<string, { count: number; total: number }>();
    for (const o of orders ?? []) {
      const row = o as { buyer_id: string; total: number | null };
      const cur = ordersByUser.get(row.buyer_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(row.total ?? 0);
      ordersByUser.set(row.buyer_id, cur);
    }

    // 5) last_sign_in_at from auth.users (paginate up to ~5k users)
    const lastSignInByUser = new Map<string, string | null>();
    const wanted = new Set(customerIds);
    let page = 1;
    while (wanted.size > 0 && page <= 5) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      for (const u of list.users) {
        if (wanted.has(u.id)) {
          lastSignInByUser.set(u.id, u.last_sign_in_at ?? null);
          wanted.delete(u.id);
        }
      }
      if (list.users.length < 1000) break;
      page += 1;
    }

    return customers.map((c) => {
      const prof = profById.get(c.user_id);
      const agg = ordersByUser.get(c.user_id);
      return {
        user_id: c.user_id,
        email: prof?.email ?? null,
        full_name: prof?.full_name ?? null,
        phone: prof?.phone ?? null,
        created_at: prof?.created_at ?? new Date(0).toISOString(),
        last_sign_in_at: lastSignInByUser.get(c.user_id) ?? null,
        default_country_id: countryByUser.get(c.user_id) ?? null,
        status: c.is_suspended ? "blocked" : "active",
        orders_count: agg?.count ?? 0,
        total_spent: Math.round((agg?.total ?? 0) * 100) / 100,
      } satisfies CustomerListRow;
    });
  });

export type CustomerDetail = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  sex: string | null;
  address: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  status: CustomerStatus;
  default_country_id: string | null;
  addresses: Array<{
    id: string;
    label: string;
    full_name: string;
    phone: string;
    address: string;
    city: string;
    destination_country_id: string | null;
    is_default: boolean;
    created_at: string;
  }>;
  orders: Array<{
    id: string;
    status: string;
    total: number;
    created_at: string;
    items_count: number;
  }>;
  stats: { orders_count: number; total_spent: number };
};

export const getCustomerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CustomerDetail> => {
    await assertAdmin(context.userId);

    const [{ data: prof }, { data: roleRow }, { data: addrs }, { data: orders }, authRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, phone, sex, address, created_at").eq("id", data.user_id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("is_suspended").eq("user_id", data.user_id).eq("role", "acheteur").maybeSingle(),
      supabaseAdmin.from("customer_addresses").select("id, label, full_name, phone, address, city, destination_country_id, is_default, created_at").eq("user_id", data.user_id).order("is_default", { ascending: false }).order("created_at", { ascending: false }),
      supabaseAdmin.from("orders").select("id, status, total, created_at").eq("buyer_id", data.user_id).order("created_at", { ascending: false }),
      supabaseAdmin.auth.admin.getUserById(data.user_id),
    ]);

    if (!prof) throw new Error("Client introuvable");

    const orderIds = (orders ?? []).map((o) => (o as { id: string }).id);
    const itemCounts = new Map<string, number>();
    if (orderIds.length > 0) {
      const { data: items } = await supabaseAdmin.from("order_items").select("order_id").in("order_id", orderIds);
      for (const it of items ?? []) {
        const id = (it as { order_id: string }).order_id;
        itemCounts.set(id, (itemCounts.get(id) ?? 0) + 1);
      }
    }

    const ordersOut = (orders ?? []).map((o) => {
      const row = o as { id: string; status: string; total: number | null; created_at: string };
      return {
        id: row.id,
        status: row.status,
        total: Number(row.total ?? 0),
        created_at: row.created_at,
        items_count: itemCounts.get(row.id) ?? 0,
      };
    });

    const totalSpent = ordersOut.reduce((s, o) => s + o.total, 0);
    const addrList = (addrs ?? []).map((a) => a as CustomerDetail["addresses"][number]);
    const defaultCountry = addrList.find((a) => a.is_default)?.destination_country_id ?? addrList[0]?.destination_country_id ?? null;

    return {
      user_id: data.user_id,
      email: (prof as { email: string | null }).email,
      full_name: (prof as { full_name: string | null }).full_name,
      phone: (prof as { phone: string | null }).phone,
      sex: (prof as { sex: string | null }).sex,
      address: (prof as { address: string | null }).address,
      created_at: (prof as { created_at: string }).created_at,
      last_sign_in_at: authRes.data.user?.last_sign_in_at ?? null,
      status: roleRow && (roleRow as { is_suspended: boolean }).is_suspended ? "blocked" : "active",
      default_country_id: defaultCountry,
      addresses: addrList,
      orders: ordersOut,
      stats: { orders_count: ordersOut.length, total_spent: Math.round(totalSpent * 100) / 100 },
    };
  });

export const setCustomerBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid(), blocked: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ is_suspended: data.blocked })
      .eq("user_id", data.user_id)
      .eq("role", "acheteur");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCustomerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        full_name: z.string().trim().min(1).max(120).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        address: z.string().trim().max(300).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, string | null> = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.address !== undefined) patch.address = data.address;
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
