// ═══════════════════════════════════════════════════════════════
// Traitement des imports CJ en arrière-plan — SERVEUR UNIQUEMENT.
//
// Un « job » = une liste d'éléments (un par PID). Le worker réserve
// quelques éléments à la fois (réservation atomique, bail de 5 min :
// un crash rend l'élément automatiquement re-traitable), les traite,
// et enregistre l'état final de CHAQUE élément immédiatement : un
// élément terminé n'est jamais retraité.
// Les jobs « par critères » découvrent eux-mêmes les produits (listV2),
// page par page, en excluant ceux déjà présents dans KawZone.
// ═══════════════════════════════════════════════════════════════
import type { CjCallTrace } from "./client.server";
import type { ImportCriteria, SyncPart } from "./import-core.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Paramètres listV2 (documentation officielle CJ) à partir des critères. */
export function listV2Query(c: ImportCriteria, page: number, size: number): string {
  const q = new URLSearchParams({ page: String(page), size: String(size), features: "enable_category" });
  if (c.keyword) q.set("keyWord", c.keyword);
  if (c.categoryId) q.set("categoryId", c.categoryId);
  if (c.minPrice != null) q.set("startSellPrice", String(c.minPrice));
  if (c.maxPrice != null) q.set("endSellPrice", String(c.maxPrice));
  if (c.minStock != null) q.set("startWarehouseInventory", String(c.minStock));
  return `/product/listV2?${q.toString()}`;
}

export function mapListItem(item: any) {
  const n = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
  return {
    pid: String(item?.id ?? item?.pid ?? ""),
    name: item?.nameEn ?? null,
    sku: item?.sku ?? null,
    image: item?.bigImage ?? null,
    price: n(item?.nowPrice) ?? n(item?.sellPrice),
    sellPrice: n(item?.sellPrice),
    stock: n(item?.warehouseInventoryNum),
    categoryId: item?.categoryId ?? null,
    categoryPath: [item?.oneCategoryName, item?.twoCategoryName, item?.threeCategoryName].filter(Boolean).join(" > ") || null,
    listedNum: n(item?.listedNum),
    variantCount: n(item?.variantNum) ?? n(item?.variantsCount),
    weightKg: n(item?.productWeight) !== null ? Number((Number(item.productWeight) / 1000).toFixed(4)) : null,
    createdAt: n(item?.createAt),
  };
}

/** PIDs déjà présents dans KawZone (cj_products OU products.external_product_id). */
export async function existingPidMap(pids: string[]): Promise<Map<string, string | null>> {
  const a = await admin();
  const out = new Map<string, string | null>();
  if (!pids.length) return out;
  const { data: cj } = await a.from("cj_products").select("cj_product_id, product_id").in("cj_product_id", pids);
  for (const r of cj ?? []) out.set(String(r.cj_product_id), r.product_id ?? null);
  const { data: pr } = await a.from("products").select("id, external_product_id").in("external_product_id", pids);
  for (const r of pr ?? []) if (!out.get(String(r.external_product_id))) out.set(String(r.external_product_id), r.id);
  return out;
}

/** Découvre une page de produits pour un job par critères. */
async function discoverPage(job: any, traces: CjCallTrace[]) {
  const a = await admin();
  const { cjGet } = await import("./client.server");
  const c: ImportCriteria = job.criteria ?? {};
  const page = job.discover_page ?? 1;
  const r = await cjGet<any>(listV2Query(c, page, 100), traces);
  const list: any[] = (Array.isArray(r?.content) ? r.content : []).flatMap((x: any) => x?.productList ?? []);
  const items = list.map(mapListItem).filter((i) => i.pid);
  const totalPages = Number(r?.totalPages ?? 0) || 0;

  const existing = await existingPidMap(items.map((i) => i.pid));
  const fresh = items.filter((i) => (c.newOnly !== false ? !existing.has(i.pid) : true));

  // Combien d'éléments « utiles » (hors ignorés/erreurs) avons-nous déjà ?
  const { count: useful } = await a.from("cj_import_job_items").select("id", { count: "exact", head: true })
    .eq("job_id", job.id).not("status", "in", "(SKIPPED,FAILED)");
  const room = Math.max(0, (job.target_count ?? 100) - (useful ?? 0));
  const toAdd = fresh.slice(0, room);
  if (toAdd.length) {
    await a.from("cj_import_job_items").upsert(
      toAdd.map((i) => ({ job_id: job.id, pid: i.pid, name: i.name, image: i.image })),
      { onConflict: "job_id,pid", ignoreDuplicates: true },
    );
  }
  const exhausted = !items.length || page >= Math.min(totalPages || page, 1000) || page >= 60;
  const full = room - toAdd.length <= 0;
  await a.from("cj_import_jobs").update({ discover_page: page + 1, discover_done: exhausted || full }).eq("id", job.id);
}

export interface BatchResult {
  state: "continue" | "done" | "stopped" | "rate_limited";
  processed: number;
}

/**
 * Traite le job pendant au plus `budgetMs`. Sûr à appeler plusieurs fois
 * en parallèle : la réservation des éléments est atomique.
 */
export async function processJobBatch(jobId: string, budgetMs = 20_000): Promise<BatchResult> {
  const a = await admin();
  const started = Date.now();
  const traces: CjCallTrace[] = [];
  let processed = 0;

  const { data: job } = await a.from("cj_import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job || ["paused", "cancelled", "completed", "failed"].includes(job.status)) return { state: "stopped", processed };
  await a.from("cj_import_jobs").update({
    status: job.discover_done ? "running" : "discovering",
    started_at: job.started_at ?? new Date().toISOString(),
    lease_until: new Date(Date.now() + 3 * 60_000).toISOString(),
  }).eq("id", jobId);

  const { runCjProductImport } = await import("./import-core.server");
  let rateLimited = false;

  try {
    while (Date.now() - started < budgetMs) {
      // Statut relu à chaque tour : pause / annulation prises en compte immédiatement.
      const { data: cur } = await a.from("cj_import_jobs").select("status, discover_done, discover_page, criteria, target_count, id").eq("id", jobId).single();
      if (cur.status === "paused" || cur.status === "cancelled") break;

      const { data: claimed } = await a.rpc("cj_claim_job_items", { _job: jobId, _n: 1 });
      const item = (claimed ?? [])[0];
      if (!item) {
        if (!cur.discover_done) {
          await discoverPage(cur, traces);
          continue;
        }
        break;
      }
      const r = await runCjProductImport({
        pid: item.pid,
        mode: job.kind === "sync" ? "sync" : "import",
        syncParts: (job.sync_parts ?? []) as SyncPart[],
        withStock: !!job.options?.withStock,
        criteria: job.criteria ?? job.options?.criteria ?? null,
        userId: job.created_by,
        traces,
      });
      if (r.status === "LOCKED" || (r as any).retryable) {
        // Réessayé plus tard, sans compter comme une erreur.
        await a.from("cj_import_job_items").update({ status: "PENDING", lease_until: null, error: r.error }).eq("id", item.id);
        if ((r as any).retryable) { rateLimited = true; break; }
        continue;
      }
      await a.from("cj_import_job_items").update({
        status: r.status,
        product_id: r.productId,
        error: r.error,
        missing: r.missing.length ? r.missing.slice(0, 40) : null,
        lease_until: null,
        finished_at: new Date().toISOString(),
        name: r.report?.productName ?? item.name,
      }).eq("id", item.id);
      processed += 1;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await a.from("cj_import_jobs").update({ last_error: msg.slice(0, 500) }).eq("id", jobId);
    if ((e as any)?.retryable) rateLimited = true;
  }

  await a.rpc("cj_refresh_job_counts", { _job: jobId });
  const { data: after } = await a.from("cj_import_jobs").select("status, n_pending, n_processing, discover_done, api_calls").eq("id", jobId).single();
  const patch: Record<string, unknown> = { api_calls: (after.api_calls ?? 0) + traces.length };
  let state: BatchResult["state"] = rateLimited ? "rate_limited" : "continue";
  if (["paused", "cancelled"].includes(after.status)) {
    state = "stopped";
    patch.lease_until = null;
  } else if (after.n_pending === 0 && after.n_processing === 0 && after.discover_done) {
    patch.status = "completed";
    patch.finished_at = new Date().toISOString();
    patch.lease_until = null;
    state = "done";
  }
  await a.from("cj_import_jobs").update(patch).eq("id", jobId);
  return { state, processed };
}

/** Crée un job et renvoie son identifiant (sans démarrer le traitement). */
export async function createJob(input: {
  name: string;
  kind: "import" | "sync";
  pids?: Array<{ pid: string; name?: string | null; image?: string | null }>;
  criteria?: ImportCriteria | null;
  targetCount?: number | null;
  syncParts?: SyncPart[];
  withStock?: boolean;
  scheduleId?: string | null;
  userId?: string | null;
}): Promise<string> {
  const a = await admin();
  const byCriteria = !input.pids?.length && !!input.criteria;
  const { data: job, error } = await a.from("cj_import_jobs").insert({
    name: input.name.slice(0, 200),
    kind: input.kind,
    sync_parts: input.syncParts ?? [],
    criteria: input.criteria ?? null,
    target_count: input.targetCount ?? null,
    options: { withStock: !!input.withStock },
    discover_done: !byCriteria,
    schedule_id: input.scheduleId ?? null,
    created_by: input.userId ?? null,
    status: "pending",
  }).select("id").single();
  if (error) throw new Error(error.message);
  const uniq = new Map<string, { pid: string; name?: string | null; image?: string | null }>();
  for (const p of input.pids ?? []) if (p.pid) uniq.set(String(p.pid).trim(), p);
  const rows = [...uniq.values()].map((p) => ({ job_id: job.id, pid: String(p.pid).trim(), name: p.name ?? null, image: p.image ?? null }));
  for (let i = 0; i < rows.length; i += 500) {
    await a.from("cj_import_job_items").upsert(rows.slice(i, i + 500), { onConflict: "job_id,pid", ignoreDuplicates: true });
  }
  await a.rpc("cj_refresh_job_counts", { _job: job.id });
  return job.id as string;
}

/** Jobs actifs dont le worker ne donne plus signe de vie (redémarrage, événement perdu). */
export async function staleActiveJobs(): Promise<string[]> {
  const a = await admin();
  const { data } = await a.from("cj_import_jobs").select("id, lease_until")
    .in("status", ["pending", "running", "discovering"]).limit(20);
  const now = Date.now();
  return (data ?? []).filter((j: any) => !j.lease_until || new Date(j.lease_until).getTime() < now).map((j: any) => j.id);
}

/** Règles programmées dues maintenant → création des jobs correspondants. */
export async function runDueSchedules(): Promise<string[]> {
  const a = await admin();
  const now = new Date();
  const hourStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const { data: rules } = await a.from("cj_import_schedules").select("*").eq("enabled", true).eq("hour_utc", now.getUTCHours());
  const created: string[] = [];
  for (const r of rules ?? []) {
    if (r.last_run_at && new Date(r.last_run_at) >= hourStart) continue;
    // Réservation de l'exécution (évite deux jobs si le déclencheur passe deux fois).
    const { data: claimed } = await a.from("cj_import_schedules")
      .update({ last_run_at: now.toISOString() }).eq("id", r.id)
      .or(`last_run_at.is.null,last_run_at.lt.${hourStart.toISOString()}`).select("id");
    if (!claimed?.length) continue;
    const jobId = await createJob({
      name: `Programmé — ${r.name} — ${now.toISOString().slice(0, 10)}`,
      kind: "import",
      criteria: { ...(r.criteria ?? {}), newOnly: true },
      targetCount: r.max_new,
      scheduleId: r.id,
      userId: r.created_by,
    });
    await a.from("cj_import_schedules").update({ last_job_id: jobId }).eq("id", r.id);
    created.push(jobId);
  }
  return created;
}
