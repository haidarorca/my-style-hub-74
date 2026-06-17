import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertPermission } from "./admin-auth.core";


export const setOrderArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        order_id: z.string().uuid(),
        archived: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "products");
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ archived_at: data.archived ? new Date().toISOString() : null } as any)
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOrdersArchivedBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        order_ids: z.array(z.string().uuid()).min(1).max(500),
        archived: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.userId, "products");
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ archived_at: data.archived ? new Date().toISOString() : null } as any)
      .in("id", data.order_ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.order_ids.length };
  });
