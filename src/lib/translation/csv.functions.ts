import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TRANSLATION_LANG_CODES } from "./langs";
import { CSV_SCOPE_IDS } from "./csv";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = ((data ?? []) as Array<{ role: string }>).some((r) => r.role === "admin" || r.role === "super_admin");
  if (!ok) throw new Error("Accès refusé : administrateur requis");
}

const lang = z.enum(TRANSLATION_LANG_CODES as [string, ...string[]]);
const scope = z.enum(CSV_SCOPE_IDS as [string, ...string[]]);

export const csvPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lang }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { countPending } = await import("./csv.server");
    const out: Record<string, number> = {};
    for (const s of CSV_SCOPE_IDS) out[s] = await countPending(s, data.lang);
    return out;
  });

/** Export paginé : le navigateur enchaîne les pages jusqu'à la fin (aucune limite totale). */
export const csvExportPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    langs: z.array(lang).min(1), scope, mode: z.enum(["missing", "all"]),
    cursor: z.string().max(100).nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { exportPage } = await import("./csv.server");
    return await exportPage(data.scope as any, data.langs, data.mode, data.cursor, 500);
  });

export const csvImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope, rows: z.array(z.record(z.string(), z.string())).max(300) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { importRows } = await import("./csv.server");
    return await importRows(data.scope as any, data.rows);
  });
