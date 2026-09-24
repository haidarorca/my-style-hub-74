import { runCjProductImport } from "@/lib/cj/import-core.server";
const tr:any[]=[];
const t=Date.now();
const r:any = await runCjProductImport({ pid: "14602024".length ? (await (await import("@/integrations/supabase/client.server")).supabaseAdmin.from("cj_products").select("cj_product_id").eq("product_id","cf4ac096-5337-4b78-b8e3-8f6669c57168").single()).data!.cj_product_id : "", mode: "sync", syncParts: ["stock"], traces: tr });
console.log(r.status, "ms", Date.now()-t, "images", r.report?.media, "calls", tr.map((x:any)=>x.endpoint.split("?")[0]));
const r2:any = await runCjProductImport({ pid: r.report.cjProductId, mode: "import" });
console.log("doublon:", r2.status);
