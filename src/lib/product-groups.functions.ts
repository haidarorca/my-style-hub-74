import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ============================================================
   Groupes de produits (familles commerciales)

   Un groupe ne stocke que les informations COMMUNES.
   Les produits membres restent des articles réels et indépendants
   (SKU, prix, stock, poids, emballage, médias, variantes inchangés).
   ============================================================ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

export type GroupMedia = {
  id?: string;
  url: string;
  media_type: "image" | "video";
  poster_url: string | null;
  position: number;
  source_product_id?: string | null;
};

export type GroupMember = {
  id: string;
  name: string;
  code: string;
  price: number;
  status: string;
  option_label: string | null;
  position: number;
  show_individually: boolean;
  image_url: string | null;
};

export type ProductGroupDetail = {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  criterion_label: string;
  cover_url: string | null;
  show_in_catalog: boolean;
  created_at: string;
  media: GroupMedia[];
  members: GroupMember[];
};

async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (data === true) return true;
  const { data: sa } = await db.rpc("is_super_admin", { _user_id: userId });
  return sa === true;
}

/** Vérifie que l'appelant peut gérer ces produits et qu'ils appartiennent au même vendeur. */
async function assertCanManageProducts(userId: string, productIds: string[]): Promise<string> {
  if (productIds.length === 0) throw new Error("Aucun produit sélectionné.");
  const { data, error } = await db
    .from("products")
    .select("id, vendor_id")
    .in("id", productIds);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; vendor_id: string }[];
  if (rows.length !== productIds.length) throw new Error("Certains produits sont introuvables.");

  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)));
  if (vendorIds.length > 1) {
    throw new Error(
      "Un groupe ne peut contenir que des produits d'une même boutique (livraison et panier cohérents).",
    );
  }
  const vendorId = vendorIds[0]!;
  if (await isAdminUser(userId)) return vendorId;
  if (vendorId !== userId) throw new Error("Vous ne pouvez regrouper que vos propres produits.");
  return vendorId;
}

async function assertCanManageGroup(userId: string, groupId: string): Promise<string> {
  const { data, error } = await db.from("product_groups").select("id, vendor_id").eq("id", groupId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Groupe introuvable.");
  if (await isAdminUser(userId)) return data.vendor_id as string;
  if (data.vendor_id !== userId) throw new Error("Accès refusé à ce groupe.");
  return data.vendor_id as string;
}

const MediaInput = z.object({
  url: z.string().url().max(2000),
  media_type: z.enum(["image", "video"]).default("image"),
  poster_url: z.string().url().max(2000).nullable().default(null),
  position: z.number().int().min(0).default(0),
  source_product_id: z.string().uuid().nullable().default(null),
});

const MemberInput = z.object({
  product_id: z.string().uuid(),
  option_label: z.string().trim().max(120).default(""),
  position: z.number().int().min(0).default(0),
  show_individually: z.boolean().default(true),
});

const CreateInput = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(8000).nullable().default(null),
  category_id: z.string().uuid().nullable().default(null),
  criterion_label: z.string().trim().min(1).max(80).default("Modèle"),
  cover_url: z.string().url().max(2000).nullable().default(null),
  show_in_catalog: z.boolean().default(true),
  media: z.array(MediaInput).max(30).default([]),
  members: z.array(MemberInput).min(2).max(50),
});

export const createProductGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data, context }): Promise<{ group_id: string }> => {
    const productIds = data.members.map((m) => m.product_id);
    const vendorId = await assertCanManageProducts(context.userId, productIds);

    const { data: grp, error } = await db
      .from("product_groups")
      .insert({
        vendor_id: vendorId,
        name: data.name,
        description: data.description,
        category_id: data.category_id,
        criterion_label: data.criterion_label,
        cover_url: data.cover_url,
        show_in_catalog: data.show_in_catalog,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const groupId = grp.id as string;

    if (data.media.length > 0) {
      const { error: mErr } = await db
        .from("product_group_media")
        .insert(data.media.map((m, i) => ({ ...m, position: m.position ?? i, group_id: groupId })));
      if (mErr) throw new Error(mErr.message);
    }

    for (const m of data.members) {
      const { error: pErr } = await db
        .from("products")
        .update({
          group_id: groupId,
          group_option_label: m.option_label || null,
          group_position: m.position,
          show_individually: m.show_individually,
        })
        .eq("id", m.product_id);
      if (pErr) throw new Error(pErr.message);
    }

    return { group_id: groupId };
  });

const UpdateInput = z.object({
  group_id: z.string().uuid(),
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(8000).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  criterion_label: z.string().trim().min(1).max(80).optional(),
  cover_url: z.string().url().max(2000).nullable().optional(),
  show_in_catalog: z.boolean().optional(),
  media: z.array(MediaInput).max(30).optional(),
});

export const updateProductGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManageGroup(context.userId, data.group_id);
    const { group_id, media, ...patch } = data;

    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("product_groups").update(patch).eq("id", group_id);
      if (error) throw new Error(error.message);
    }

    if (media) {
      await db.from("product_group_media").delete().eq("group_id", group_id);
      if (media.length > 0) {
        const { error } = await db
          .from("product_group_media")
          .insert(media.map((m, i) => ({ ...m, position: m.position ?? i, group_id })));
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

const MembersInput = z.object({
  group_id: z.string().uuid(),
  members: z.array(MemberInput).max(50),
});

/** Remplace la liste des membres : ajoute, retire, réordonne et met à jour les libellés. */
export const setProductGroupMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MembersInput.parse(input))
  .handler(async ({ data, context }) => {
    const vendorId = await assertCanManageGroup(context.userId, data.group_id);
    const ids = data.members.map((m) => m.product_id);
    if (ids.length > 0) {
      const owner = await assertCanManageProducts(context.userId, ids);
      if (owner !== vendorId) throw new Error("Tous les produits du groupe doivent appartenir à la même boutique.");
    }

    // Détacher les produits qui ne sont plus dans la liste (sans rien supprimer d'autre)
    const { data: current } = await db.from("products").select("id").eq("group_id", data.group_id);
    const removed = ((current ?? []) as { id: string }[]).map((r) => r.id).filter((id) => !ids.includes(id));
    if (removed.length > 0) {
      const { error } = await db
        .from("products")
        .update({ group_id: null, group_option_label: null, group_position: 0 })
        .in("id", removed);
      if (error) throw new Error(error.message);
    }

    for (const m of data.members) {
      const { error } = await db
        .from("products")
        .update({
          group_id: data.group_id,
          group_option_label: m.option_label || null,
          group_position: m.position,
          show_individually: m.show_individually,
        })
        .eq("id", m.product_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Dissocie le groupe : les produits redeviennent indépendants. Rien n'est supprimé côté produits. */
export const ungroupProductGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ group_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManageGroup(context.userId, data.group_id);
    const { error } = await db
      .from("products")
      .update({ group_id: null, group_option_label: null, group_position: 0, show_individually: true })
      .eq("group_id", data.group_id);
    if (error) throw new Error(error.message);
    const { error: dErr } = await db.from("product_groups").delete().eq("id", data.group_id);
    if (dErr) throw new Error(dErr.message);
    return { ok: true };
  });

export type ProductGroupSummary = {
  id: string;
  name: string;
  criterion_label: string;
  cover_url: string | null;
  show_in_catalog: boolean;
  vendor_id: string;
  members_count: number;
  created_at: string;
};

export const listProductGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ q: z.string().trim().max(200).default(""), mine: z.boolean().default(false) })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ProductGroupSummary[]> => {
    const admin = await isAdminUser(context.userId);
    let q = db.from("product_groups").select("*").order("created_at", { ascending: false }).limit(200);
    if (!admin || data.mine) q = q.eq("vendor_id", context.userId);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: prods } = await db.from("products").select("group_id").in("group_id", ids);
      for (const p of (prods ?? []) as { group_id: string }[]) {
        counts.set(p.group_id, (counts.get(p.group_id) ?? 0) + 1);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((g) => ({
      id: g.id,
      name: g.name,
      criterion_label: g.criterion_label,
      cover_url: g.cover_url,
      show_in_catalog: g.show_in_catalog,
      vendor_id: g.vendor_id,
      created_at: g.created_at,
      members_count: counts.get(g.id) ?? 0,
    }));
  });

export const getProductGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ group_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ProductGroupDetail> => {
    await assertCanManageGroup(context.userId, data.group_id);

    const [{ data: g }, { data: media }, { data: members }] = await Promise.all([
      db.from("product_groups").select("*").eq("id", data.group_id).maybeSingle(),
      db.from("product_group_media").select("*").eq("group_id", data.group_id).order("position"),
      db
        .from("products")
        .select("id, name, code, price, status, group_option_label, group_position, show_individually")
        .eq("group_id", data.group_id)
        .order("group_position"),
    ]);
    if (!g) throw new Error("Groupe introuvable.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memberRows = (members ?? []) as any[];
    const imgMap = new Map<string, string>();
    if (memberRows.length > 0) {
      const { data: imgs } = await db
        .from("product_images")
        .select("product_id, url, position, media_type")
        .in("product_id", memberRows.map((m) => m.id))
        .order("position");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const im of (imgs ?? []) as any[]) {
        if ((im.media_type ?? "image") === "image" && !imgMap.has(im.product_id)) imgMap.set(im.product_id, im.url);
      }
    }

    return {
      id: g.id,
      vendor_id: g.vendor_id,
      name: g.name,
      description: g.description,
      category_id: g.category_id,
      criterion_label: g.criterion_label,
      cover_url: g.cover_url,
      show_in_catalog: g.show_in_catalog,
      created_at: g.created_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      media: ((media ?? []) as any[]).map((m) => ({
        id: m.id,
        url: m.url,
        media_type: m.media_type,
        poster_url: m.poster_url,
        position: m.position,
        source_product_id: m.source_product_id,
      })),
      members: memberRows.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        price: Number(m.price ?? 0),
        status: m.status,
        option_label: m.group_option_label,
        position: m.group_position ?? 0,
        show_individually: !!m.show_individually,
        image_url: imgMap.get(m.id) ?? null,
      })),
    };
  });

/** Données nécessaires au formulaire de regroupement, à partir des produits sélectionnés. */
export type GroupCandidate = {
  id: string;
  name: string;
  code: string;
  price: number;
  description: string | null;
  category_id: string | null;
  vendor_id: string;
  media: { url: string; media_type: "image" | "video"; poster_url: string | null }[];
};

export const getGroupCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ product_ids: z.array(z.string().uuid()).min(1).max(50) }).parse(input))
  .handler(async ({ data, context }): Promise<GroupCandidate[]> => {
    await assertCanManageProducts(context.userId, data.product_ids);

    const [{ data: prods }, { data: imgs }] = await Promise.all([
      db
        .from("products")
        .select("id, name, code, price, description, category_id, vendor_id, group_id")
        .in("id", data.product_ids),
      db
        .from("product_images")
        .select("product_id, url, media_type, poster_url, position")
        .in("product_id", data.product_ids)
        .order("position"),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mediaMap = new Map<string, any[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const im of (imgs ?? []) as any[]) {
      const arr = mediaMap.get(im.product_id) ?? [];
      arr.push({ url: im.url, media_type: im.media_type ?? "image", poster_url: im.poster_url ?? null });
      mediaMap.set(im.product_id, arr);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((prods ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      price: Number(p.price ?? 0),
      description: p.description,
      category_id: p.category_id,
      vendor_id: p.vendor_id,
      media: mediaMap.get(p.id) ?? [],
    }));
  });
