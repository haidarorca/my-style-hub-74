import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";


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

export type CustomerListPage = {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: { active: number; blocked: number; revenue: number };
};

const ListInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  q: z.string().trim().max(200).default(""),
  status: z.enum(["all", "active", "blocked"]).default("all"),
  country_id: z.string().uuid().nullable().optional(),
  has_orders: z.enum(["all", "with", "without"]).default("all"),
});

export const listCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => (input ? ListInput.parse(input) : ListInput.parse({})))
  .handler(async ({ data, context }): Promise<CustomerListPage> => {
    await assertPermission(context.userId, "customers");

    // 1) acheteur ids (filter by suspended flag when status set)
    let roleQ = supabaseAdmin.from("user_roles").select("user_id, is_suspended").eq("role", "acheteur");
    if (data.status === "active") roleQ = roleQ.eq("is_suspended", false);
    if (data.status === "blocked") roleQ = roleQ.eq("is_suspended", true);
    const { data: roleRows, error: rErr } = await roleQ;
    if (rErr) throw new Error(rErr.message);
    const acheteurs = (roleRows ?? []) as { user_id: string; is_suspended: boolean }[];
    if (acheteurs.length === 0) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, totals: { active: 0, blocked: 0, revenue: 0 } };
    }

    // Exclude users who also have a vendor or admin role
    const ids = acheteurs.map((r) => r.user_id);
    const { data: otherRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids)
      .in("role", ["vendeur", "admin", "super_admin"]);
    const excluded = new Set((otherRoles ?? []).map((r) => (r as { user_id: string }).user_id));
    const eligible = acheteurs.filter((r) => !excluded.has(r.user_id));
    const eligibleIds = eligible.map((c) => c.user_id);
    if (eligibleIds.length === 0) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, totals: { active: 0, blocked: 0, revenue: 0 } };
    }

    // 2) profiles (apply text search + sort + paginate at SQL level)
    let profQ = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, phone, created_at", { count: "exact" })
      .in("id", eligibleIds)
      .order("created_at", { ascending: false });

    const q = data.q.trim();
    if (q.length > 0) {
      // Escape % and , for PostgREST or-filter
      const safe = q.replace(/[%,]/g, " ");
      profQ = profQ.or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }

    // Optional country filter requires an inner narrowing: get matching ids first.
    if (data.country_id) {
      const { data: addrIds } = await supabaseAdmin
        .from("customer_addresses")
        .select("user_id")
        .in("user_id", eligibleIds)
        .eq("destination_country_id", data.country_id);
      const filtered = new Set((addrIds ?? []).map((a) => (a as { user_id: string }).user_id));
      profQ = profQ.in("id", Array.from(filtered));
      if (filtered.size === 0) {
        return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, totals: { active: 0, blocked: 0, revenue: 0 } };
      }
    }

    const offset = (data.page - 1) * data.pageSize;
    const { data: profs, count: totalCount } = await profQ.range(offset, offset + data.pageSize - 1);
    const profRows = (profs ?? []) as Array<{ id: string; email: string | null; full_name: string | null; phone: string | null; created_at: string }>;
    const pageIds = profRows.map((p) => p.id);

    // Per-row enrichments (only for the current page slice → cheap)
    const [addrRes, ordersRes] = await Promise.all([
      pageIds.length
        ? supabaseAdmin
            .from("customer_addresses")
            .select("user_id, destination_country_id, is_default, created_at")
            .in("user_id", pageIds)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      pageIds.length
        ? supabaseAdmin.from("orders").select("buyer_id, total").in("buyer_id", pageIds)
        : Promise.resolve({ data: [] }),
    ]);
    const countryByUser = new Map<string, string | null>();
    for (const a of (addrRes.data ?? []) as Array<{ user_id: string; destination_country_id: string | null }>) {
      if (!countryByUser.has(a.user_id)) countryByUser.set(a.user_id, a.destination_country_id);
    }
    const ordersByUser = new Map<string, { count: number; total: number }>();
    for (const o of (ordersRes.data ?? []) as Array<{ buyer_id: string; total: number | null }>) {
      const cur = ordersByUser.get(o.buyer_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(o.total ?? 0);
      ordersByUser.set(o.buyer_id, cur);
    }

    // last_sign_in only for the current page slice
    const lastSignInByUser = new Map<string, string | null>();
    await Promise.all(
      pageIds.map(async (id) => {
        const res = await supabaseAdmin.auth.admin.getUserById(id);
        lastSignInByUser.set(id, res.data.user?.last_sign_in_at ?? null);
      }),
    );

    const suspendedByUser = new Map(eligible.map((c) => [c.user_id, c.is_suspended] as const));

    let rows: CustomerListRow[] = profRows.map((p) => {
      const agg = ordersByUser.get(p.id);
      return {
        user_id: p.id,
        email: p.email,
        full_name: p.full_name,
        phone: p.phone,
        created_at: p.created_at,
        last_sign_in_at: lastSignInByUser.get(p.id) ?? null,
        default_country_id: countryByUser.get(p.id) ?? null,
        status: suspendedByUser.get(p.id) ? "blocked" : "active",
        orders_count: agg?.count ?? 0,
        total_spent: Math.round((agg?.total ?? 0) * 100) / 100,
      } satisfies CustomerListRow;
    });

    if (data.has_orders === "with") rows = rows.filter((r) => r.orders_count > 0);
    if (data.has_orders === "without") rows = rows.filter((r) => r.orders_count === 0);

    // Aggregate totals across eligible set (not the page).
    const totals = {
      active: eligible.filter((c) => !c.is_suspended).length,
      blocked: eligible.filter((c) => c.is_suspended).length,
      revenue: 0, // computed on demand only — kept 0 to stay cheap
    };

    return {
      rows,
      total: totalCount ?? rows.length,
      page: data.page,
      pageSize: data.pageSize,
      totals,
    };
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
    await assertPermission(context.userId, "customers");

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
    await assertPermission(context.userId, "customers");
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
    await assertPermission(context.userId, "customers");
    const patch: { full_name?: string | null; phone?: string | null; address?: string | null } = {};
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
    await assertPermission(context.userId, "customers");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
