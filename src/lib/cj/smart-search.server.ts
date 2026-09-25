// ═══════════════════════════════════════════════════════════════
// Recherche intelligente CJ — SERVEUR UNIQUEMENT.
// Parcourt le plan de requêtes (exact → traduction → synonymes → élargie),
// page par page, avec cache 1 h et arrêt dès que l'objectif est atteint.
// ═══════════════════════════════════════════════════════════════
import type { CjCallTrace } from "./client.server";
import type { ImportCriteria } from "./import-core.server";
import { buildQueryPlan, scoreHit, type QueryPlan } from "./smart-search";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Une page listV2 (cache partagé 1 h — deux recherches simultanées ne paient qu'une fois). */
export async function listV2Cached(c: ImportCriteria, page: number, size: number, traces: CjCallTrace[]) {
  const a = await admin();
  const { cjGet } = await import("./client.server");
  const { listV2Query, mapListItem } = await import("./jobs.server");
  const path = listV2Query(c, page, size);
  const key = `lv2:${path}`;
  let r: any = null;
  let cached = false;
  const { data: hit } = await a.from("cj_api_cache").select("payload, fetched_at").eq("cache_key", key).maybeSingle();
  if (hit?.payload && Date.now() - new Date(hit.fetched_at).getTime() < 3600_000) { r = hit.payload; cached = true; }
  if (!r) {
    r = await cjGet<any>(path, traces);
    await a.from("cj_api_cache").upsert({ cache_key: key, payload: r, fetched_at: new Date().toISOString() });
  }
  const list: any[] = (Array.isArray(r?.content) ? r.content : []).flatMap((x: any) => x?.productList ?? []);
  return {
    items: list.map(mapListItem).filter((i) => i.pid),
    total: Number(r?.totalRecords ?? 0) || 0,
    totalPages: Number(r?.totalPages ?? 0) || 0,
    cached,
  };
}

export interface SmartHit {
  pid: string; name: string | null; sku: string | null; image: string | null; price: number | null; stock: number | null;
  categoryPath: string | null; variantCount: number | null; relevance: number; exists: boolean; existingProductId: string | null;
  matchedQuery: string;
}

export interface SmartStats {
  initialCount: number;      // résultats CJ de la requête exacte
  broadenedCount: number;    // résultats CJ cumulés après élargissement
  examined: number;          // produits réellement examinés (uniques)
  relevant: number;
  offTopic: number;
  alreadyImported: number;
  fresh: number;
  queriesTried: Array<{ q: string; stage: string; total: number; relevant: number }>;
  apiCalls: number;
  cachedCalls: number;
  ms: number;
  corrected: string | null;
}

/**
 * Recherche multi-étapes. S'arrête dès que `want` nouveaux produits pertinents
 * sont trouvés ou quand `maxCalls` appels CJ réels sont consommés.
 */
export async function smartSearch(opts: {
  keyword: string; criteria?: ImportCriteria; want?: number; maxCalls?: number; pagesPerQuery?: number; traces?: CjCallTrace[];
}): Promise<{ plan: QueryPlan; hits: SmartHit[]; stats: SmartStats }> {
  const t0 = Date.now();
  const traces = opts.traces ?? [];
  const want = opts.want ?? 40;
  const maxCalls = opts.maxCalls ?? 6;
  const pagesPerQuery = opts.pagesPerQuery ?? 2;
  const plan = buildQueryPlan(opts.keyword);
  const { existingPidMap } = await import("./jobs.server");
  const seen = new Map<string, SmartHit>();
  const stats: SmartStats = {
    initialCount: 0, broadenedCount: 0, examined: 0, relevant: 0, offTopic: 0, alreadyImported: 0, fresh: 0,
    queriesTried: [], apiCalls: 0, cachedCalls: 0, ms: 0,
    corrected: plan.corrected && plan.corrected !== plan.original.toLowerCase() ? plan.corrected : null,
  };
  let calls = 0;
  outer: for (const [qi, q] of plan.queries.entries()) {
    const qStat = { q: q.q, stage: q.stage, total: 0, relevant: 0 };
    stats.queriesTried.push(qStat);
    for (let page = 1; page <= pagesPerQuery; page++) {
      if (calls >= maxCalls) break outer;
      const r = await listV2Cached({ ...(opts.criteria ?? {}), keyword: q.q }, page, 100, traces);
      if (r.cached) stats.cachedCalls++; else calls++;
      if (page === 1) { qStat.total = r.total; if (qi === 0) stats.initialCount = r.total; stats.broadenedCount += r.total; }
      const fresh = r.items.filter((i) => !seen.has(i.pid));
      const ex = await existingPidMap(fresh.map((i) => i.pid));
      let newRelevant = 0;
      for (const i of fresh) {
        stats.examined++;
        const s = scoreHit(plan, i);
        if (!s.relevant) { stats.offTopic++; seen.set(i.pid, null as any); continue; }
        qStat.relevant++; stats.relevant++;
        const exists = ex.has(i.pid);
        if (exists) stats.alreadyImported++; else { stats.fresh++; newRelevant++; }
        seen.set(i.pid, {
          pid: i.pid, name: i.name, sku: i.sku, image: i.image, price: i.price, stock: i.stock, categoryPath: i.categoryPath,
          variantCount: i.variantCount ?? null, relevance: s.score, exists, existingProductId: ex.get(i.pid) ?? null, matchedQuery: q.q,
        });
      }
      if (stats.fresh >= want) break outer;
      // Page suivante seulement si celle-ci apportait du nouveau pertinent.
      if (!newRelevant || page >= r.totalPages) break;
    }
  }
  const hits = [...seen.values()].filter(Boolean).sort((a, b) => b.relevance - a.relevance || (b.stock ?? 0) - (a.stock ?? 0));
  stats.apiCalls = calls;
  stats.ms = Date.now() - t0;
  return { plan, hits, stats };
}
