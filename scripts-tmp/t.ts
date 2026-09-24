import { cjGet } from "@/lib/cj/client.server";
import { listV2Query, mapListItem, existingPidMap } from "@/lib/cj/jobs.server";
import { fetchCjProduct, summarizeCjProduct, failsCriteria, runCjProductImport } from "@/lib/cj/import-core.server";
const tr: any[] = [];
const c: any = { keyword: "christmas decoration", maxPrice: 10, minStock: 100, newArrivals: false, orderBy: 3, sort: "desc", verifiedOnly: true, maxWeightKg: 1, minImages: 3 };
const path = listV2Query(c, 1, 20); console.log(path);
const r = await cjGet<any>(path, tr);
const items = (r?.content ?? []).flatMap((x: any) => x.productList ?? []).map(mapListItem);
console.log("CJ total", r?.totalRecords, "page", items.length);
const ex = await existingPidMap(items.map((i: any) => i.pid));
let kept: any[] = [];
for (const i of items.slice(0, 8)) { const p = await fetchCjProduct(i.pid, tr, 6*3600e3); const s = summarizeCjProduct(p); const f = failsCriteria(s, c);
  console.log(i.pid.slice(0,8), ex.has(i.pid) ? "EXIST" : "NEW", s.minPrice, s.maxWeightKg, s.imageCount, s.material, s.materialSource, s.score, f.join("|") || "OK"); if (!f.length && !ex.has(i.pid)) kept.push(i.pid); }
if (kept[0]) { const res = await runCjProductImport({ pid: kept[0], parts: ["data","price","stock","images","variants"] } as any); console.log("import", res.status, res.productId);
  const again = await runCjProductImport({ pid: kept[0], onlyNew: true } as any); console.log("reimport", again.status);
  const stock = await runCjProductImport({ pid: kept[0], parts: ["stock"] } as any); console.log("stock sync", stock.status, "calls", (stock as any).report?.media?.detected ?? 0);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("products").select("name,status,is_active,material,validation_mode,review_reasons,video_url").eq("id", res.productId).single(); console.log(data);
  const { data: cp } = await (supabaseAdmin as any).from("cj_products").select("quality_score,quality_missing,material_source,material_cj_class").eq("product_id", res.productId).single(); console.log(cp);
}
console.log("api calls", tr.length, tr.map((t: any) => t.endpoint.split("?")[0]).join(","));
