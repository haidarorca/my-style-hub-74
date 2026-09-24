import { createJob, processJobBatch } from "@/lib/cj/jobs.server";
import { supabaseAdmin as a } from "@/integrations/supabase/client.server";
const id = process.argv[2] || await createJob({ name: "TEST 100 produits", kind: "import", criteria: { keyword: "shoes", newOnly: true } as any, targetCount: 100 });
const t = Date.now();
while (Date.now() - t < 240000) { const r = await processJobBatch(id, 45000); if (r.state === "done" || r.state === "stopped") break; }
const { data } = await (a as any).from("cj_import_jobs").select("status,total,n_pending,n_success,n_exists,n_failed,api_calls,started_at").eq("id", id).single();
console.log("JOB", id, JSON.stringify(data), ((Date.now()-t)/1000).toFixed(0)+"s");
