// ═══════════════════════════════════════════════════════════════
// Centre de sourcing & d'import CJ — fonctions serveur (administrateurs).
// ═══════════════════════════════════════════════════════════════
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CjCallTrace } from "@/lib/cj/client.server";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Accès réservé aux administrateurs.");
}

export interface Criteria {
  keyword?: string | null;
  categoryId?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minStock?: number | null;
  maxWeightKg?: number | null;
  minVariants?: number | null;
  maxVariants?: number | null;
  requireImages?: boolean;
  requireSku?: boolean;
  requireWeight?: boolean;
  requireDimensions?: boolean;
  newOnly?: boolean;
  maxStock?: number | null;
  minWeightKg?: number | null;
  minImages?: number | null;
  maxSideCm?: number | null;
  maxCbm?: number | null;
  material?: string | null;
  countryCode?: string | null;
  freeShipping?: boolean;
  newArrivals?: boolean;
  hasVideo?: boolean;
  verifiedOnly?: boolean;
  listedAfter?: string | null;
  supplierId?: string | null;
  orderBy?: number | null;
  sort?: "asc" | "desc" | null;
  /** Affichage : tous / jamais importés / déjà importés. */
  importState?: "all" | "new" | "imported";
}

const optNum = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
function cleanCriteria(c: any): Criteria {
  return {
    keyword: c?.keyword ? String(c.keyword).slice(0, 200) : null,
    categoryId: c?.categoryId ? String(c.categoryId) : null,
    minPrice: optNum(c?.minPrice),
    maxPrice: optNum(c?.maxPrice),
    minStock: optNum(c?.minStock),
    maxWeightKg: optNum(c?.maxWeightKg),
    minVariants: optNum(c?.minVariants),
    maxVariants: optNum(c?.maxVariants),
    requireImages: !!c?.requireImages,
    requireSku: !!c?.requireSku,
    requireWeight: !!c?.requireWeight,
    requireDimensions: !!c?.requireDimensions,
    newOnly: c?.newOnly !== false,
    maxStock: optNum(c?.maxStock),
    minWeightKg: optNum(c?.minWeightKg),
    minImages: optNum(c?.minImages),
    maxSideCm: optNum(c?.maxSideCm),
    maxCbm: optNum(c?.maxCbm),
    material: c?.material ? String(c.material).slice(0, 60).trim() || null : null,
    countryCode: c?.countryCode && /^[A-Z]{2}$/.test(String(c.countryCode)) ? String(c.countryCode) : null,
    freeShipping: !!c?.freeShipping,
    newArrivals: !!c?.newArrivals,
    hasVideo: !!c?.hasVideo,
    verifiedOnly: !!c?.verifiedOnly,
    listedAfter: c?.listedAfter && /^\d{4}-\d{2}-\d{2}$/.test(String(c.listedAfter)) ? String(c.listedAfter) : null,
    supplierId: c?.supplierId ? String(c.supplierId).slice(0, 200) : null,
    orderBy: [0, 1, 2, 3, 4].includes(Number(c?.orderBy)) ? Number(c.orderBy) : null,
    sort: c?.sort === "asc" || c?.sort === "desc" ? c.sort : null,
    importState: c?.importState === "new" || c?.importState === "imported" ? c.importState : "all",
  };
}

export interface ExploreHit {
  pid: string;
  name: string | null;
  sku: string | null;
  image: string | null;
  price: number | null;
  stock: number | null;
  categoryPath: string | null;
  existingProductId: string | null;
  exists: boolean;
  variantCount: number | null;
  weightKg: number | null;
  missing: string[];
  needsSync: boolean;
  /** Renseignés après vérification de la fiche complète (filtres avancés). */
  score?: number | null;
  imageCount?: number | null;
  material?: string | null;
  maxSideCm?: number | null;
}

/** Critères qui exigent la fiche complète (CJ ne sait pas les filtrer). */
function needsDetail(c: Criteria) {
  return c.minWeightKg != null || c.maxWeightKg != null || c.minImages != null || c.maxSideCm != null
    || c.maxCbm != null || !!c.material || c.minVariants != null || c.maxVariants != null
    || !!c.requireImages || !!c.requireSku || !!c.requireWeight || !!c.requireDimensions;
}

/** Parcours du catalogue CJ (listV2, 50 points par page de 100 max). Résultats mis en cache 1 h. */
export const exploreCj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { criteria: any; page?: number; size?: number }) => ({
    criteria: cleanCriteria(i?.criteria),
    page: Math.max(1, Math.min(1000, Number(i?.page ?? 1) || 1)),
    size: Math.max(10, Math.min(100, Number(i?.size ?? 50) || 50)),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { cjGet } = await import("@/lib/cj/client.server");
    const { listV2Query, mapListItem, existingPidMap } = await import("@/lib/cj/jobs.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const a = supabaseAdmin as any;
    const traces: CjCallTrace[] = [];
    const path = listV2Query(data.criteria, data.page, data.size);
    const key = `lv2:${path}`;
    let r: any = null;
    let cached = false;
    const { data: c } = await a.from("cj_api_cache").select("payload, fetched_at").eq("cache_key", key).maybeSingle();
    if (c?.payload && Date.now() - new Date(c.fetched_at).getTime() < 3600_000) { r = c.payload; cached = true; }
    try {
      if (!r) {
        r = await cjGet<any>(path, traces);
        await a.from("cj_api_cache").upsert({ cache_key: key, payload: r, fetched_at: new Date().toISOString() });
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erreur CJ", hits: [] as ExploreHit[], total: 0, totalPages: 0, cached, apiCalls: traces.length, excluded: 0, deepChecked: false };
    }
    const list: any[] = (Array.isArray(r?.content) ? r.content : []).flatMap((x: any) => x?.productList ?? []);
    const items = list.map(mapListItem).filter((i) => i.pid);
    const ex = await existingPidMap(items.map((i) => i.pid));
    const { data: logs } = await a.from("cj_import_log")
      .select("cj_product_id, missing_fields, created_at")
      .in("cj_product_id", items.map((i) => i.pid))
      .order("created_at", { ascending: false });
    const latestMissing = new Map<string, string[]>();
    for (const log of logs ?? []) {
      const pid = String(log.cj_product_id);
      if (!latestMissing.has(pid)) latestMissing.set(pid, Array.isArray(log.missing_fields) ? log.missing_fields.map(String) : []);
    }
    let hits: ExploreHit[] = items.map((i) => ({
      pid: i.pid, name: i.name, sku: i.sku, image: i.image, price: i.price, stock: i.stock,
      categoryPath: i.categoryPath, exists: ex.has(i.pid), existingProductId: ex.get(i.pid) ?? null,
      variantCount: i.variantCount ?? null, weightKg: i.weightKg ?? null,
      missing: latestMissing.get(i.pid) ?? [
        ...(!i.image ? ["images"] : []), ...(!i.sku ? ["SKU"] : []),
        ...(i.price == null ? ["prix"] : []), ...(i.stock == null ? ["stock"] : []),
      ],
      needsSync: ex.has(i.pid) && (latestMissing.get(i.pid)?.length ?? 0) > 0,
    }));
    // Filtre « déjà importés / jamais importés » : côté serveur.
    if (data.criteria.importState === "new") hits = hits.filter((h) => !h.exists);
    if (data.criteria.importState === "imported") hits = hits.filter((h) => h.exists);
    // Filtres que CJ ne sait pas appliquer : vérification sur la fiche
    // complète (cache 6 h, 3 appels en parallèle), uniquement pour cette page.
    let excluded = 0;
    if (needsDetail(data.criteria) && hits.length) {
      const { fetchCjProduct, summarizeCjProduct, failsCriteria } = await import("@/lib/cj/import-core.server");
      const kept: ExploreHit[] = [];
      for (let i = 0; i < hits.length; i += 3) {
        const chunk = hits.slice(i, i + 3);
        const res = await Promise.all(chunk.map(async (h) => {
          try {
            const p = await fetchCjProduct(h.pid, traces, 6 * 3600_000);
            if (!p?.pid) return null;
            const sum = summarizeCjProduct(p);
            if (failsCriteria(sum, data.criteria).length) return null;
            return { ...h, score: sum.score, imageCount: sum.imageCount, material: sum.material, maxSideCm: sum.maxSideCm,
              variantCount: sum.variantCount, weightKg: sum.maxWeightKg } as ExploreHit;
          } catch { return null; }
        }));
        for (const r of res) if (r) kept.push(r); else excluded += 1;
      }
      hits = kept;
    }
    return {
      ok: true, error: null as string | null, hits, excluded, deepChecked: needsDetail(data.criteria),
      total: Number(r?.totalRecords ?? 0) || 0, totalPages: Number(r?.totalPages ?? 0) || 0,
      cached, apiCalls: traces.length,
    };
  });

/** Fiche détaillée CJ : variantes réelles, stock, poids, dimensions, complétude (cache 6 h). */
export const getCjDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { pid: string; fresh?: boolean }) => ({ pid: String(i?.pid ?? "").trim(), fresh: !!i?.fresh }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { fetchCjProduct, summarizeCjProduct } = await import("@/lib/cj/import-core.server");
    const { existingPidMap } = await import("@/lib/cj/jobs.server");
    const traces: CjCallTrace[] = [];
    try {
      const p = await fetchCjProduct(data.pid, traces, data.fresh ? 0 : 6 * 3600_000);
      if (!p?.pid) return { ok: false, error: "Produit introuvable chez CJ.", detail: null, existingProductId: null };
      const ex = await existingPidMap([data.pid]);
      return { ok: true, error: null as string | null, detail: summarizeCjProduct(p), existingProductId: ex.get(data.pid) ?? null, exists: ex.has(data.pid) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erreur", detail: null, existingProductId: null };
    }
  });

/** Arborescence des catégories CJ (cache 24 h), aplatie au 3e niveau. */
export const getCjCategoryTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { cjGet } = await import("@/lib/cj/client.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const a = supabaseAdmin as any;
    const key = "getCategory";
    let tree: any = null;
    const { data: c } = await a.from("cj_api_cache").select("payload, fetched_at").eq("cache_key", key).maybeSingle();
    if (c?.payload && Date.now() - new Date(c.fetched_at).getTime() < 86400_000) tree = c.payload;
    if (!tree) {
      try {
        tree = await cjGet<any>("/product/getCategory", []);
        await a.from("cj_api_cache").upsert({ cache_key: key, payload: tree, fetched_at: new Date().toISOString() });
      } catch { tree = c?.payload ?? []; }
    }
    const out: Array<{ id: string; path: string }> = [];
    for (const f of tree ?? []) for (const s of f?.categoryFirstList ?? []) for (const t of s?.categorySecondList ?? []) {
      if (t?.categoryId) out.push({ id: String(t.categoryId), path: `${f.categoryFirstName} › ${s.categorySecondName} › ${t.categoryName}` });
    }
    return { categories: out };
  });

async function kick(jobId: string) {
  const { sendInngestEvent } = await import("@/lib/inngest/client");
  await sendInngestEvent({ name: "cj/import.run", data: { jobId } });
}

/** Crée un job d'import/synchronisation (liste de PIDs OU critères) et le lance en arrière-plan. */
export const createCjJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    name?: string; kind?: "import" | "sync"; pids?: Array<{ pid: string; name?: string | null; image?: string | null }>;
    criteria?: any; targetCount?: number; syncParts?: string[]; withStock?: boolean;
  }) => ({
    name: String(i?.name ?? "").trim(),
    kind: i?.kind === "sync" ? ("sync" as const) : ("import" as const),
    pids: Array.isArray(i?.pids) ? i.pids.slice(0, 20000).filter((p) => p && p.pid) : [],
    criteria: i?.criteria ? cleanCriteria(i.criteria) : null,
    targetCount: Math.max(1, Math.min(20000, Number(i?.targetCount ?? 100) || 100)),
    syncParts: (Array.isArray(i?.syncParts) ? i.syncParts : []).filter((s) => ["stock", "price", "images", "variants", "data"].includes(s)),
    withStock: !!i?.withStock,
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (!data.pids.length && !data.criteria) throw new Error("Sélectionnez des produits ou définissez des critères.");
    const { createJob } = await import("@/lib/cj/jobs.server");
    const jobId = await createJob({
      name: data.name || (data.kind === "sync" ? `Synchronisation (${data.pids.length})` : data.pids.length ? `Import de ${data.pids.length} produit(s)` : `Import par critères (${data.targetCount})`),
      kind: data.kind,
      pids: data.pids,
      criteria: data.criteria,
      targetCount: data.pids.length ? null : data.targetCount,
      syncParts: data.syncParts as any,
      withStock: data.withStock,
      userId: context.userId,
    });
    await kick(jobId);
    return { jobId };
  });

/** Synchronisation de tous les produits CJ déjà importés (par parties). */
export const syncAllCjProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { syncParts: string[] }) => ({
    syncParts: (Array.isArray(i?.syncParts) ? i.syncParts : []).filter((s) => ["stock", "price", "images", "variants", "data"].includes(s)),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (!data.syncParts.length) throw new Error("Choisissez au moins une partie à synchroniser.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await (supabaseAdmin as any).from("cj_products").select("cj_product_id, name_en").not("product_id", "is", null).limit(20000);
    const { createJob } = await import("@/lib/cj/jobs.server");
    const jobId = await createJob({
      name: `Synchronisation ${data.syncParts.join(", ")} — ${(rows ?? []).length} produit(s)`,
      kind: "sync",
      pids: (rows ?? []).map((r: any) => ({ pid: r.cj_product_id, name: r.name_en })),
      syncParts: data.syncParts as any,
      userId: context.userId,
    });
    await kick(jobId);
    return { jobId };
  });

export const listCjJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const a = supabaseAdmin as any;
    const { data } = await a.from("cj_import_jobs").select("*").order("created_at", { ascending: false }).limit(50);
    const jobs = (data ?? []) as any[];
    const activeIds = jobs.filter((j) => ["pending", "running", "discovering"].includes(j.status)).map((j) => j.id);
    if (activeIds.length) {
      const { data: cur } = await a.from("cj_import_job_items").select("job_id, name, pid, step, started_at")
        .in("job_id", activeIds).eq("status", "PROCESSING").order("started_at", { ascending: true }).limit(30);
      for (const j of jobs) j.current = (cur ?? []).filter((c: any) => c.job_id === j.id).map((c: any) => ({ name: c.name ?? c.pid, step: c.step }));
    }
    return { jobs };
  });

export const getCjJobItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { jobId: string; status?: string | null; page?: number }) => ({
    jobId: String(i?.jobId ?? ""), status: i?.status ? String(i.status) : null, page: Math.max(0, Number(i?.page ?? 0) || 0),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any).from("cj_import_job_items")
      .select("id, pid, name, image, status, product_id, error, missing, attempts, finished_at", { count: "exact" })
      .eq("job_id", data.jobId).order("updated_at", { ascending: false }).range(data.page * 50, data.page * 50 + 49);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, count } = await q;
    return { items: rows ?? [], count: count ?? 0 };
  });

/** Pause / reprise / annulation / réessai des erreurs / relance. */
export const controlCjJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { jobId: string; action: "pause" | "resume" | "cancel" | "retry_failed" | "retry_item" | "kick"; itemId?: string }) => ({
    jobId: String(i?.jobId ?? ""), action: i?.action, itemId: i?.itemId ? String(i.itemId) : null,
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const a = supabaseAdmin as any;
    const { data: job } = await a.from("cj_import_jobs").select("status").eq("id", data.jobId).single();
    if (!job) throw new Error("Import introuvable.");
    switch (data.action) {
      case "pause":
        if (!["pending", "running", "discovering"].includes(job.status)) throw new Error("Cet import n'est pas en cours.");
        await a.from("cj_import_jobs").update({ status: "paused", lease_until: null }).eq("id", data.jobId);
        break;
      case "resume":
        if (job.status !== "paused") throw new Error("Cet import n'est pas en pause.");
        await a.from("cj_import_jobs").update({ status: "running", lease_until: null, finished_at: null }).eq("id", data.jobId);
        await kick(data.jobId);
        break;
      case "cancel":
        { const { cancelJob } = await import("@/lib/cj/jobs.server"); await cancelJob(data.jobId); }
        break;
      case "retry_failed":
        if (job.status === "cancelled") throw new Error("Import annulé : lancez un nouvel import pour ces produits.");
        await a.from("cj_import_job_items").update({ status: "PENDING", error: null, lease_until: null }).eq("job_id", data.jobId).eq("status", "FAILED");
        await a.rpc("cj_refresh_job_counts", { _job: data.jobId });
        await a.from("cj_import_jobs").update({ status: "running", lease_until: null, finished_at: null }).eq("id", data.jobId);
        await kick(data.jobId);
        break;
      case "retry_item":
        if (!data.itemId) throw new Error("Élément manquant.");
        if (job.status === "cancelled") throw new Error("Import annulé : lancez un nouvel import pour ce produit.");
        await a.from("cj_import_job_items").update({ status: "PENDING", error: null, lease_until: null, step: null }).eq("job_id", data.jobId).eq("id", data.itemId).in("status", ["FAILED", "SKIPPED"]);
        await a.rpc("cj_refresh_job_counts", { _job: data.jobId });
        if (job.status !== "cancelled") await a.from("cj_import_jobs").update({ status: "running", lease_until: null, finished_at: null }).eq("id", data.jobId);
        await kick(data.jobId);
        break;
      case "kick":
        await kick(data.jobId);
        break;
    }
    return { ok: true };
  });

/** Traite immédiatement un lot (secours si le worker d'arrière-plan tarde). */
export const pumpCjJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { jobId: string }) => ({ jobId: String(i?.jobId ?? "") }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { processJobBatch } = await import("@/lib/cj/jobs.server");
    return processJobBatch(data.jobId, 25_000);
  });

// ── Imports programmés ─────────────────────────────────────────
export const listCjSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("cj_import_schedules" as any).select("*").order("created_at");
    return { schedules: (data ?? []) as any[] };
  });

export const saveCjSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string | null; name: string; enabled?: boolean; hourUtc: number; maxNew: number; criteria: any }) => ({
    id: i?.id ? String(i.id) : null,
    name: String(i?.name ?? "").trim().slice(0, 120) || "Règle CJ",
    enabled: i?.enabled !== false,
    hourUtc: Math.max(0, Math.min(23, Math.floor(Number(i?.hourUtc ?? 2)))),
    maxNew: Math.max(1, Math.min(5000, Math.floor(Number(i?.maxNew ?? 100)))),
    criteria: cleanCriteria(i?.criteria),
  }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const row = { name: data.name, enabled: data.enabled, hour_utc: data.hourUtc, max_new: data.maxNew, criteria: data.criteria as any };
    const t = context.supabase.from("cj_import_schedules" as any);
    const { error } = data.id
      ? await t.update(row).eq("id", data.id)
      : await t.insert({ ...row, created_by: context.userId });
    if (error) throw new Error(error.message);
    // Règle désactivée → ses imports en cours sont annulés immédiatement.
    if (data.id && !data.enabled) await cancelScheduleJobs(data.id);
    return { ok: true };
  });

async function cancelScheduleJobs(scheduleId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { cancelJob } = await import("@/lib/cj/jobs.server");
  const { data: jobs } = await (supabaseAdmin as any).from("cj_import_jobs").select("id")
    .eq("schedule_id", scheduleId).in("status", ["pending", "running", "discovering", "paused"]);
  for (const j of jobs ?? []) await cancelJob(j.id, "Règle programmée désactivée");
}

export const deleteCjSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: String(i?.id ?? "") }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    await cancelScheduleJobs(data.id);
    await context.supabase.from("cj_import_schedules" as any).delete().eq("id", data.id);
    return { ok: true };
  });

export const runCjScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: String(i?.id ?? "") }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { data: r } = await context.supabase.from("cj_import_schedules" as any).select("*").eq("id", data.id).single();
    if (!r) throw new Error("Règle introuvable.");
    const rule = r as any;
    const { createJob, scheduleCriteria } = await import("@/lib/cj/jobs.server");
    const jobId = await createJob({
      name: `Manuel — ${rule.name}`, kind: "import", criteria: scheduleCriteria(rule.criteria),
      targetCount: rule.max_new, scheduleId: rule.id, userId: context.userId,
    });
    await kick(jobId);
    return { jobId };
  });
