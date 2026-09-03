import { supabase } from "@/integrations/supabase/client";
import { generateStoreSlug } from "./codes";

export type KawscanStore = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  currency_code: string;
  display_name: string | null;
  logo_url: string | null;
  show_home_button: boolean;
  show_back_button: boolean;
  show_kawzone_link: boolean;
  show_kawzone_logo: boolean;
  is_active: boolean;
  created_at: string;
};

export type KawscanSubscription = {
  id: string;
  store_id: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
};

export type KawscanProduct = {
  id: string;
  store_id: string;
  code: string;
  code_kind: string;
  is_internal_code: boolean;
  name: string | null;
  unit: string;
  price: number;
  currency_code: string | null;
  promo_price: number | null;
  promo_active: boolean;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
  show_name_on_label: boolean;
  show_price_on_label: boolean;
  is_active: boolean;
};

export type KawscanTier = { id: string; product_id: string; label: string; price: number; position: number };

/** État d'abonnement calculé côté client pour l'affichage vendeur/admin. */
export function subscriptionState(sub: KawscanSubscription | null | undefined, storeActive = true) {
  if (!storeActive) return "disabled" as const;
  if (!sub) return "suspended" as const;
  if (sub.status === "suspended") return "suspended" as const;
  if (sub.status !== "active") return "disabled" as const;
  if (sub.starts_at && new Date(sub.starts_at) > new Date()) return "not_started" as const;
  if (sub.ends_at && new Date(sub.ends_at) < new Date()) return "expired" as const;
  return "active" as const;
}

export async function listMyStores(): Promise<(KawscanStore & { subscription: KawscanSubscription | null; product_count: number })[]> {
  const { data, error } = await supabase
    .from("kawscan_stores")
    .select("*, kawscan_subscriptions(*), kawscan_products(count)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => {
    const row = s as unknown as KawscanStore & {
      kawscan_subscriptions: KawscanSubscription[] | KawscanSubscription | null;
      kawscan_products: { count: number }[];
    };
    const sub = Array.isArray(row.kawscan_subscriptions)
      ? (row.kawscan_subscriptions[0] ?? null)
      : row.kawscan_subscriptions;
    return { ...row, subscription: sub, product_count: row.kawscan_products?.[0]?.count ?? 0 };
  });
}

export async function getStore(storeId: string) {
  const { data, error } = await supabase
    .from("kawscan_stores")
    .select("*, kawscan_subscriptions(*)")
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as KawscanStore & { kawscan_subscriptions: KawscanSubscription[] | KawscanSubscription | null };
  const sub = Array.isArray(row.kawscan_subscriptions) ? (row.kawscan_subscriptions[0] ?? null) : row.kawscan_subscriptions;
  return { ...row, subscription: sub };
}

export async function createStore(input: { name: string; currency_code: string; owner_id: string }) {
  const { data, error } = await supabase
    .from("kawscan_stores")
    .insert({
      name: input.name.trim(),
      slug: generateStoreSlug(input.name),
      currency_code: input.currency_code,
      owner_id: input.owner_id,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as KawscanStore;
}

export async function listProducts(storeId: string) {
  const { data, error } = await supabase
    .from("kawscan_products")
    .select("*, kawscan_price_tiers(*)")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as (KawscanProduct & { kawscan_price_tiers: KawscanTier[] })[];
}
