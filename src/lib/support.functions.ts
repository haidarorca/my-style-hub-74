import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  ContactPolicy,
  ContactSettings,
  PublicVendorContacts,
  SupportConvStatus,
  SupportConvType,
  SupportPriority,
} from "./contact-policy";

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  return !!data && data.length > 0;
}

// ============================================================
// Contact policy
// ============================================================
export const getContactPolicy = createServerFn({ method: "POST" })
  .inputValidator((d: { vendorId: string; productId?: string | null }) =>
    z.object({ vendorId: z.string().uuid(), productId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .rpc("resolve_contact_policy", { _vendor_id: data.vendorId, _product_id: data.productId ?? undefined })
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as ContactPolicy | null;
  });

export const getPublicVendorContacts = createServerFn({ method: "POST" })
  .inputValidator((d: { vendorId: string }) => z.object({ vendorId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("public_vendor_contacts" as never)
      .select("vendor_id, shop_name, shop_logo_url, shop_whatsapp, phone, email, address, contact_mode")
      .eq("vendor_id", data.vendorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as PublicVendorContacts | null;
  });

// ============================================================
// Settings (admin)
// ============================================================
export const getContactSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("contact_settings" as never)
    .select("*")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ContactSettings | null;
});

export const updateContactSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<ContactSettings>) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Accès refusé");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...patch } = data as Partial<ContactSettings> & { id?: string };
    const { error } = await supabaseAdmin
      .from("contact_settings" as never)
      .update(patch as never)
      .eq("id", "main");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateShopContactPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    shopId: string;
    contact_mode?: string;
    show_whatsapp?: boolean;
    show_email?: boolean;
    show_phone?: boolean;
    show_address?: boolean;
    assigned_support_admin_ids?: string[];
  }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Accès refusé");
    const { shopId, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", shopId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Conversations
// ============================================================
export interface ConversationRow {
  id: string;
  subject: string;
  type: SupportConvType;
  status: SupportConvStatus;
  priority: SupportPriority;
  client_id: string | null;
  client_email: string | null;
  client_name: string | null;
  vendor_id: string | null;
  product_id: string | null;
  order_id: string | null;
  assigned_admin_id: string | null;
  is_commission_protected: boolean;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count_client: number;
  unread_count_vendor: number;
  unread_count_admin: number;
  created_at: string;
  closed_at: string | null;
}

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    subject: string;
    body: string;
    type: SupportConvType;
    vendorId?: string | null;
    productId?: string | null;
    orderId?: string | null;
  }) =>
    z.object({
      subject: z.string().trim().min(2).max(200),
      body: z.string().trim().min(1).max(5000),
      type: z.enum(["client_support", "client_vendor", "vendor_admin"]),
      vendorId: z.string().uuid().nullable().optional(),
      productId: z.string().uuid().nullable().optional(),
      orderId: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    // Resolve commission protection snapshot
    let isCommissionProtected = false;
    if (data.vendorId) {
      const { data: pol } = await supabaseAdmin
        .rpc("resolve_contact_policy", { _vendor_id: data.vendorId, _product_id: data.productId ?? undefined })
        .maybeSingle();
      const p = pol as ContactPolicy | null;
      // If vendor cannot be contacted directly, route via admin
      isCommissionProtected = !!p?.is_commission || data.type === "client_support";
    }
    const finalType: SupportConvType = isCommissionProtected && data.type === "client_vendor" ? "client_support" : data.type;

    const { data: conv, error } = await supabaseAdmin
      .from("support_conversations" as never)
      .insert({
        subject: data.subject,
        body_first: data.body,
        type: finalType,
        client_id: context.userId,
        vendor_id: finalType === "client_support" ? null : data.vendorId ?? null,
        product_id: data.productId ?? null,
        order_id: data.orderId ?? null,
        is_commission_protected: isCommissionProtected,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const convRow = conv as { id: string };

    const { error: msgErr } = await supabaseAdmin
      .from("support_messages" as never)
      .insert({
        conversation_id: convRow.id,
        sender_id: context.userId,
        sender_role: "client",
        body: data.body,
      } as never);
    if (msgErr) throw new Error(msgErr.message);

    return { id: convRow.id };
  });

export const replyConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; body: string; isInternalNote?: boolean }) =>
    z.object({
      conversationId: z.string().uuid(),
      body: z.string().trim().min(1).max(5000),
      isInternalNote: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conv, error: cErr } = await supabaseAdmin
      .from("support_conversations" as never)
      .select("id, client_id, vendor_id, is_commission_protected, type")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conv) throw new Error("Conversation introuvable");
    const c = conv as { client_id: string | null; vendor_id: string | null; is_commission_protected: boolean; type: string };

    const admin = await isAdmin(context.userId);
    let role: "client" | "vendor" | "admin";
    if (admin) role = "admin";
    else if (c.client_id === context.userId) role = "client";
    else if (
      c.vendor_id === context.userId &&
      !c.is_commission_protected &&
      c.type !== "client_support"
    )
      role = "vendor";
    else throw new Error("Accès refusé à cette conversation");

    if (data.isInternalNote && !admin) throw new Error("Notes internes réservées aux admins");

    const { error } = await supabaseAdmin
      .from("support_messages" as never)
      .insert({
        conversation_id: data.conversationId,
        sender_id: context.userId,
        sender_role: role,
        body: data.body,
        is_internal_note: !!data.isInternalNote,
      } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { scope: "client" | "vendor" | "admin"; status?: SupportConvStatus | null }) =>
    z.object({
      scope: z.enum(["client", "vendor", "admin"]),
      status: z.enum(["new", "open", "answered", "closed", "urgent"]).nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    let q = supabaseAdmin
      .from("support_conversations" as never)
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);

    if (data.scope === "admin") {
      if (!(await isAdmin(context.userId))) throw new Error("Accès refusé");
    } else if (data.scope === "client") {
      q = q.eq("client_id", context.userId);
    } else {
      q = q.eq("vendor_id", context.userId).eq("is_commission_protected", false).neq("type", "client_support");
    }
    if (data.status) q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ConversationRow[];
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string }) =>
    z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conv, error } = await supabaseAdmin
      .from("support_conversations" as never)
      .select("*")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Conversation introuvable");
    const c = conv as ConversationRow;

    const admin = await isAdmin(context.userId);
    const isClient = c.client_id === context.userId;
    const isVendor =
      c.vendor_id === context.userId && !c.is_commission_protected && c.type !== "client_support";
    if (!admin && !isClient && !isVendor) throw new Error("Accès refusé");

    let mq = supabaseAdmin
      .from("support_messages" as never)
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (!admin) mq = mq.eq("is_internal_note", false);

    const { data: msgs, error: mErr } = await mq;
    if (mErr) throw new Error(mErr.message);

    // Mark read
    const patch: Record<string, number> = {};
    if (admin) patch.unread_count_admin = 0;
    else if (isClient) patch.unread_count_client = 0;
    else if (isVendor) patch.unread_count_vendor = 0;
    if (Object.keys(patch).length) {
      await supabaseAdmin
        .from("support_conversations" as never)
        .update(patch as never)
        .eq("id", data.conversationId);
    }

    return {
      conversation: c,
      messages: (msgs ?? []) as Array<{
        id: string;
        sender_id: string | null;
        sender_role: "client" | "vendor" | "admin" | "system";
        body: string;
        is_internal_note: boolean;
        created_at: string;
      }>,
      viewerRole: admin ? "admin" : isClient ? "client" : "vendor",
    };
  });

export const updateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    conversationId: string;
    status?: SupportConvStatus;
    priority?: SupportPriority;
    assignedAdminId?: string | null;
  }) =>
    z.object({
      conversationId: z.string().uuid(),
      status: z.enum(["new", "open", "answered", "closed", "urgent"]).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      assignedAdminId: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Accès refusé");
    const patch: Record<string, unknown> = {};
    if (data.status) patch.status = data.status;
    if (data.status === "closed") patch.closed_at = new Date().toISOString();
    if (data.priority) patch.priority = data.priority;
    if (data.assignedAdminId !== undefined) patch.assigned_admin_id = data.assignedAdminId;
    const { error } = await supabaseAdmin
      .from("support_conversations" as never)
      .update(patch as never)
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context.userId);
    if (admin) {
      const { data } = await supabaseAdmin
        .from("support_conversations" as never)
        .select("unread_count_admin")
        .gt("unread_count_admin", 0);
      const rows = (data ?? []) as Array<{ unread_count_admin: number }>;
      return rows.reduce((s, r) => s + (r.unread_count_admin || 0), 0);
    }
    const [{ data: asClient }, { data: asVendor }] = await Promise.all([
      supabaseAdmin
        .from("support_conversations" as never)
        .select("unread_count_client")
        .eq("client_id", context.userId)
        .gt("unread_count_client", 0),
      supabaseAdmin
        .from("support_conversations" as never)
        .select("unread_count_vendor")
        .eq("vendor_id", context.userId)
        .eq("is_commission_protected", false)
        .neq("type", "client_support")
        .gt("unread_count_vendor", 0),
    ]);
    const c = (asClient ?? []) as Array<{ unread_count_client: number }>;
    const v = (asVendor ?? []) as Array<{ unread_count_vendor: number }>;
    return (
      c.reduce((s, r) => s + (r.unread_count_client || 0), 0) +
      v.reduce((s, r) => s + (r.unread_count_vendor || 0), 0)
    );
  });
