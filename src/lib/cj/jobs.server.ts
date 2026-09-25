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
  // Paramètres officiels listV2 (doc CJ « Product List V2 »)
  if (c.maxStock != null) q.set("endWarehouseInventory", String(c.maxStock));
  if (c.countryCode) q.set("countryCode", c.countryCode);
  if (c.freeShipping) q.set("addMarkStatus", "1");
  if (c.newArrivals) q.set("productFlag", "1");
  if (c.hasVideo) q.set("productType", "10");
  if (c.verifiedOnly) q.set("verifiedWarehouse", "1");
  if (c.supplierId) q.set("supplierId", c.supplierId);
  if (c.listedAfter) { const t = Date.parse(c.listedAfter); if (Number.isFinite(t)) q.set("timeStart", String(t)); }
  if (c.orderBy != null) q.set("orderBy", String(c.orderBy));
  if (c.sort) q.set("sort", c.sort);
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
    // listV2 ne garantit pas ici une unité exploitable : la fiche détaillée
    // reste la seule source utilisée pour afficher/importer le poids réel.
    weightKg: null,
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

export interface ScheduleTarget {
  key: string; label: string; keyword?: string | null; categoryId?: string | null; quota: number; priority: number;
}
interface TargetState {
  q: number; page: number; exhausted: boolean; calls: number; examined: number; relevant: number;
  offTopic: number; existing: number; added: number; initial: number | null; reason?: string;
}
const MAX_CALLS_PER_TARGET = 12;
const MAX_PAGES_PER_QUERY = 5;

/**
 * Découverte multi-catégories : une page CJ par appel, catégorie par catégorie
 * (ordre de priorité), recherche élargie si besoin, passage à la suivante
 * quand la catégorie est pleine ou épuisée. Quota par catégorie OU global.
 */
async function discoverTargets(job: any, traces: CjCallTrace[]) {
  const a = await admin();
  const c: any = job.criteria ?? {};
  const targets: ScheduleTarget[] = [...(c.targets ?? [])].sort((x, y) => (x.priority ?? 99) - (y.priority ?? 99));
  const mode: "per_category" | "global" = c.quotaMode === "global" ? "global" : "per_category";
  const options = job.options ?? {};
  const tstate: Record<string, TargetState> = options.tstate ?? {};
  const { data: rows } = await a.from("cj_import_job_items").select("target_key, status").eq("job_id", job.id).limit(20000);
  const usefulBy = new Map<string, number>();
  let usefulAll = 0;
  for (const r of rows ?? []) {
    if (["SKIPPED", "FAILED", "CANCELLED"].includes(r.status)) continue;
    usefulAll++;
    usefulBy.set(r.target_key ?? "", (usefulBy.get(r.target_key ?? "") ?? 0) + 1);
  }
  const globalCap = job.target_count ?? 100;
  const roomFor = (t: ScheduleTarget) => {
    const u = usefulBy.get(t.key) ?? 0;
    const tRoom = t.quota > 0 ? t.quota - u : Infinity;
    return Math.max(0, Math.min(tRoom, globalCap - usefulAll));
  };
  const target = targets.find((t) => {
    const st = tstate[t.key];
    return !st?.exhausted && roomFor(t) > 0 && (mode === "per_category" ? t.quota > 0 : true);
  });
  if (!target || usefulAll >= globalCap) {
    await a.from("cj_import_jobs").update({ discover_done: true }).eq("id", job.id);
    return;
  }
  const st: TargetState = tstate[target.key] ?? { q: 0, page: 1, exhausted: false, calls: 0, examined: 0, relevant: 0, offTopic: 0, existing: 0, added: 0, initial: null };
  const { buildQueryPlan, scoreHit } = await import("./smart-search");
  const plan = target.keyword ? buildQueryPlan(target.keyword) : null;
  const queries = plan ? plan.queries.map((q) => q.q) : [""];
  const save = async () => {
    tstate[target.key] = st;
    await a.from("cj_import_jobs").update({ options: { ...options, tstate } }).eq("id", job.id);
  };
  if (st.q >= queries.length || st.calls >= MAX_CALLS_PER_TARGET) {
    st.exhausted = true; st.reason = st.calls >= MAX_CALLS_PER_TARGET ? "limite d'appels atteinte" : "recherches épuisées";
    await save(); return;
  }
  const { listV2Cached } = await import("./smart-search.server");
  const base: ImportCriteria = { ...c, targets: undefined, keyword: queries[st.q] || null, categoryId: target.categoryId ?? null } as any;
  const r = await listV2Cached(base, st.page, 100, traces);
  if (!r.cached) st.calls++;
  if (st.q === 0 && st.page === 1) st.initial = r.total;
  const ex = await existingPidMap(r.items.map((i) => i.pid));
  const candidates: Array<{ pid: string; name: string | null; image: string | null; score: number }> = [];
  for (const i of r.items) {
    st.examined++;
    const s = plan ? scoreHit(plan, i) : { score: 50, relevant: true };
    if (!s.relevant) { st.offTopic++; continue; }
    st.relevant++;
    if (ex.has(i.pid)) { st.existing++; continue; }
    candidates.push({ pid: i.pid, name: i.name, image: i.image, score: s.score });
  }
  const { data: still } = await a.from("cj_import_jobs").select("status").eq("id", job.id).single();
  if (!ACTIVE.includes(still?.status)) return;
  candidates.sort((x, y) => y.score - x.score);
  const toAdd = candidates.slice(0, roomFor(target));
  if (toAdd.length) {
    const { data: ins } = await a.from("cj_import_job_items").upsert(
      toAdd.map((i) => ({ job_id: job.id, pid: i.pid, name: i.name, image: i.image, target_key: target.key })),
      { onConflict: "job_id,pid", ignoreDuplicates: true },
    ).select("id");
    st.added += ins?.length ?? 0;
  }
  // Page suivante seulement si utile ; sinon requête élargie suivante.
  const pageRelevant = r.items.length - (plan ? r.items.filter((i) => !scoreHit(plan, i).relevant).length : 0);
  if (!pageRelevant || st.page >= Math.min(r.totalPages || 1, MAX_PAGES_PER_QUERY)) { st.q++; st.page = 1; }
  else st.page++;
  await save();
}

/** Découvre une page de produits pour un job par critères. */
async function discoverPage(job: any, traces: CjCallTrace[]) {
  if (Array.isArray(job.criteria?.targets) && job.criteria.targets.length) return discoverTargets(job, traces);
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
  const { data: still } = await a.from("cj_import_jobs").select("status").eq("id", job.id).single();
  if (!ACTIVE.includes(still?.status)) return;
  const { count: useful } = await a.from("cj_import_job_items").select("id", { count: "exact", head: true })
    .eq("job_id", job.id).not("status", "in", "(SKIPPED,FAILED,CANCELLED)");
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

const ACTIVE = ["pending", "running", "discovering"];

/** Annulation définitive : le job et ses produits non traités passent en CANCELLED. */
export async function cancelJob(jobId: string, reason?: string) {
  const a = await admin();
  await a.from("cj_import_jobs").update({ status: "cancelled", lease_until: null, finished_at: new Date().toISOString(), ...(reason ? { last_error: reason } : {}) })
    .eq("id", jobId).in("status", [...ACTIVE, "paused"]);
  await a.from("cj_import_job_items").update({ status: "CANCELLED", lease_until: null, step: null })
    .eq("job_id", jobId).in("status", ["PENDING", "PROCESSING"]);
  await a.rpc("cj_refresh_job_counts", { _job: jobId });
}

/**
 * Tic du travailleur d'arrière-plan (appelé chaque minute par le serveur,
 * page fermée ou non) : règles programmées dues + avancement des jobs actifs.
 */
export async function runWorkerTick(budgetMs = 50_000) {
  const a = await admin();
  const started = Date.now();
  const created = await runDueSchedules().catch(() => [] as string[]);
  const { data } = await a.from("cj_import_jobs").select("id").in("status", ACTIVE).order("created_at").limit(10);
  const out: Array<{ jobId: string; state: string; processed: number }> = [];
  for (const j of data ?? []) {
    const left = budgetMs - (Date.now() - started);
    if (left < 8_000) break;
    const r = await processJobBatch(j.id, left - 5_000);
    out.push({ jobId: j.id, ...r });
    if (r.state === "rate_limited") break;
  }
  return { created: created.length, jobs: out };
}

export interface BatchResult {
  state: "continue" | "done" | "stopped" | "rate_limited" | "busy";
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
  if (!job || !ACTIVE.includes(job.status)) return { state: "stopped", processed };
  // Règle programmée désactivée entre-temps → son job est annulé, jamais poursuivi.
  if (job.schedule_id) {
    const { data: rule } = await a.from("cj_import_schedules").select("enabled").eq("id", job.schedule_id).maybeSingle();
    if (rule && rule.enabled === false) { await cancelJob(jobId, "Règle programmée désactivée"); return { state: "stopped", processed }; }
  }
  // Bail exclusif ATOMIQUE : un seul traitement par job (navigateur, cron,
  // relance…). Refusé si le job n'est plus actif (annulé/pause/terminé).
  const { data: leased } = await a.rpc("cj_try_lease_job", { _job: jobId, _seconds: Math.ceil(budgetMs / 1000) + 90 });
  if (!leased) return { state: "busy", processed };

  const { runCjProductImport } = await import("./import-core.server");
  let rateLimited = false;

  // File de travail : plusieurs produits traités EN PARALLÈLE (concurrence
  // contrôlée). Les appels CJ restent espacés par le limiteur global du
  // client ; les téléchargements d'images et écritures en base, eux, se
  // chevauchent. Sur limitation CJ, on repasse à 1 worker.
  const CONCURRENCY = Math.max(1, Math.min(6, Number(job.options?.concurrency ?? process.env["CJ_IMPORT_CONCURRENCY"] ?? 4) || 4));
  let stop = false;
  const worker = async () => {
    while (!stop && !rateLimited && Date.now() - started < budgetMs) {
      const { data: cur } = await a.from("cj_import_jobs").select("status, discover_done, discover_page, criteria, target_count, id, options").eq("id", jobId).single();
      if (cur.status === "paused" || cur.status === "cancelled") { stop = true; break; }
      const { data: claimed } = await a.rpc("cj_claim_job_items", { _job: jobId, _n: 1 });
      const item = (claimed ?? [])[0];
      if (!item) {
        if (!cur.discover_done && !discovering) {
          discovering = true;
          try { await discoverPage(cur, traces); } finally { discovering = false; }
          continue;
        }
        break;
      }
      await a.from("cj_import_job_items").update({ step: "Démarrage", started_at: new Date().toISOString() }).eq("id", item.id);
      let r: any;
      try {
        r = await runCjProductImport({
          pid: item.pid,
          mode: job.kind === "sync" ? "sync" : "import",
          syncParts: (job.sync_parts ?? []) as SyncPart[],
          withStock: !!job.options?.withStock,
          criteria: job.criteria ?? job.options?.criteria ?? null,
          userId: job.created_by,
          traces,
          onStep: (st) => a.from("cj_import_job_items").update({ step: st }).eq("id", item.id).then(() => undefined),
        });
      } catch (e) {
        r = { status: "FAILED", productId: null, error: e instanceof Error ? e.message : String(e), missing: [], report: {}, retryable: (e as any)?.retryable === true };
      }
      if (r.status === "LOCKED" || r.retryable) {
        await a.from("cj_import_job_items").update({ status: "PENDING", lease_until: null, error: r.error, step: null }).eq("id", item.id).eq("status", "PROCESSING");
        if (r.retryable) { rateLimited = true; break; }
        continue;
      }
      // Un échec n'arrête pas le job : l'élément passe en FAILED avec son erreur.
      await a.from("cj_import_job_items").update({
        status: r.status,
        product_id: r.productId,
        error: r.error,
        missing: r.missing?.length ? r.missing.slice(0, 40) : null,
        lease_until: null,
        finished_at: new Date().toISOString(),
        name: r.report?.productName ?? item.name,
        step: null,
        timings: r.report?.timings ?? null,
      }).eq("id", item.id);
      await a.from("cj_import_jobs").update({ last_item_name: (r.report?.productName ?? item.name ?? item.pid)?.slice?.(0, 200) ?? null }).eq("id", jobId);
      processed += 1;
    }
  };
  let discovering = false;
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) =>
      new Promise((res) => setTimeout(res, i * 250)).then(worker)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await a.from("cj_import_jobs").update({ last_error: msg.slice(0, 500) }).eq("id", jobId);
    if ((e as any)?.retryable) rateLimited = true;
  }

  await a.rpc("cj_refresh_job_counts", { _job: jobId });
  const { data: after } = await a.from("cj_import_jobs").select("status, n_pending, n_processing, discover_done, api_calls").eq("id", jobId).single();
  const patch: Record<string, unknown> = { api_calls: (after.api_calls ?? 0) + traces.length, lease_until: null };
  let state: BatchResult["state"] = rateLimited ? "rate_limited" : "continue";
  if (!ACTIVE.includes(after.status)) {
    state = "stopped";
    await a.from("cj_import_jobs").update(patch).eq("id", jobId);
    return { state, processed };
  }
  if (after.n_pending === 0 && after.n_processing === 0 && after.discover_done) {
    patch.status = "completed";
    patch.finished_at = new Date().toISOString();
    state = "done";
  }
  // Écriture CONDITIONNELLE : ne ré-active jamais un job annulé/en pause entre-temps.
  await a.from("cj_import_jobs").update(patch).eq("id", jobId).in("status", ACTIVE);
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
    // Fréquence (jours) : tous les jours / 2 jours / semaine…
    const everyDays = Math.max(1, Number(r.criteria?.frequencyDays ?? 1) || 1);
    if (r.last_run_at && Date.now() - new Date(r.last_run_at).getTime() < everyDays * 86400_000 - 3 * 3600_000) continue;
    // Réservation de l'exécution (évite deux jobs si le déclencheur passe deux fois).
    const { data: claimed } = await a.from("cj_import_schedules")
      .update({ last_run_at: now.toISOString() }).eq("id", r.id)
      .or(`last_run_at.is.null,last_run_at.lt.${hourStart.toISOString()}`).select("id");
    if (!claimed?.length) continue;
    const jobId = await createJob({
      name: `Programmé — ${r.name} — ${now.toISOString().slice(0, 10)}`,
      kind: "import",
      criteria: scheduleCriteria(r.criteria),
      targetCount: r.max_new,
      scheduleId: r.id,
      userId: r.created_by,
    });
    await a.from("cj_import_schedules").update({ last_job_id: jobId }).eq("id", r.id);
    created.push(jobId);
  }
  return created;
}

/** Critères d'exécution d'une règle : un ancien mot-clé seul devient une cible intelligente. */
export function scheduleCriteria(c: any): any {
  const out = { ...(c ?? {}), newOnly: true };
  if (!Array.isArray(out.targets) || !out.targets.length) {
    if (out.keyword || out.categoryId) {
      out.targets = [{ key: "t1", label: out.keyword || "Catégorie", keyword: out.keyword ?? null, categoryId: out.categoryId ?? null, quota: 0, priority: 1 }];
      out.quotaMode = "global";
    }
  }
  return out;
}
