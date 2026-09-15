// ═══════════════════════════════════════════════════════════════
// Création des liens courts de partage (/s/{code}).
// Fonction publique en lecture/écriture minimale : elle n'insère
// qu'un code, un produit et la plateforme d'origine.
// ═══════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { generateShareCode } from "./codes";

const schema = z.object({
  productId: z.string().uuid(),
  platform: z.string().max(24).optional(),
});

export const createShareLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["SUPABASE_URL"];
    const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!supabaseUrl || !supabaseKey) return { code: null as string | null };

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (
            supabaseKey.startsWith("sb_") &&
            headers.get("Authorization") === `Bearer ${supabaseKey}`
          ) {
            headers.delete("Authorization");
          }
          headers.set("apikey", supabaseKey);
          return fetch(input, { ...init, headers });
        },
      },
    });

    for (let attempt = 0; attempt < 4; attempt++) {
      const code = generateShareCode(8);
      const { error } = await supabase.from("share_links").insert({
        code,
        product_id: data.productId,
        platform: data.platform ?? null,
      } as never);
      if (!error) return { code };
      // 23505 = collision de code, on retente ; toute autre erreur = abandon silencieux.
      if ((error as { code?: string }).code !== "23505") {
        console.error("[share] link creation failed", error.message);
        return { code: null as string | null };
      }
    }
    return { code: null as string | null };
  });
