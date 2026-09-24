import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { summarizeCjProduct } from "@/lib/cj/import-core.server";
import { resolveMaterial } from "@/lib/cj/material";
import { parseSupplierDescription } from "@/lib/cj/description";
const a = supabaseAdmin as any;
let from = 0, done = 0, changed = 0, bySource: Record<string, number> = {}; const samples: any[] = [];
for (;;) {
  const { data, error } = await a.from("cj_products").select("cj_product_id, product_id, raw, source_description").not("product_id","is",null).range(from, from + 199);
  if (error) throw error; if (!data?.length) break;
  for (const r of data) {
    const p = r.raw?.product; if (!p) continue;
    const m = resolveMaterial(parseSupplierDescription(p.description ?? r.source_description).specs, p);
    const sum = summarizeCjProduct(p);
    bySource[m.source ?? "vide"] = (bySource[m.source ?? "vide"] ?? 0) + 1;
    const { data: prod } = await a.from("products").select("material").eq("id", r.product_id).single();
    if ((prod?.material ?? null) !== m.value) { changed++; if (samples.length < 8) samples.push([prod?.material, "→", m.value, m.source]);
      await a.from("products").update({ material: m.value }).eq("id", r.product_id); }
    await a.from("cj_products").update({ material: m.value, material_source: m.source, material_cj_class: m.cjClass, quality_score: sum.quality.score, quality_missing: sum.quality.missing }).eq("cj_product_id", r.cj_product_id);
    done++;
  }
  from += 200;
}
console.log({ done, changed, bySource }); console.log(samples);
