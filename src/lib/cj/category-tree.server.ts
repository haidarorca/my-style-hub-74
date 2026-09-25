// Arborescence CJ (cache 24 h) à 3 niveaux : famille, sous-famille, sous-sous-famille.
// Les familles/sous-familles ont un identifiant composé ("f:" / "s:") et
// sont résolues en liste de catégories finales (seules acceptées par listV2).
import type { CjCallTrace } from "./client.server";

export interface CjCatNode { id: string; path: string; level: 1 | 2 | 3; leafIds: string[] }

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function loadCjTree(traces: CjCallTrace[] = []): Promise<any[]> {
  const a = await admin();
  const key = "getCategory";
  const { data: c } = await a.from("cj_api_cache").select("payload, fetched_at").eq("cache_key", key).maybeSingle();
  if (c?.payload && Date.now() - new Date(c.fetched_at).getTime() < 86400_000) return c.payload;
  try {
    const { cjGet } = await import("./client.server");
    const tree = await cjGet<any>("/product/getCategory", traces);
    await a.from("cj_api_cache").upsert({ cache_key: key, payload: tree, fetched_at: new Date().toISOString() });
    return tree ?? [];
  } catch { return c?.payload ?? []; }
}

export function buildNodes(tree: any[]): CjCatNode[] {
  const out: CjCatNode[] = [];
  for (const f of tree ?? []) {
    const fName = String(f?.categoryFirstName ?? "").trim();
    if (!fName) continue;
    const fNode: CjCatNode = { id: `f:${fName}`, path: fName, level: 1, leafIds: [] };
    out.push(fNode);
    for (const s of f?.categoryFirstList ?? []) {
      const sName = String(s?.categorySecondName ?? "").trim();
      const sNode: CjCatNode = { id: `s:${fName}|${sName}`, path: `${fName} › ${sName}`, level: 2, leafIds: [] };
      out.push(sNode);
      for (const t of s?.categorySecondList ?? []) {
        if (!t?.categoryId) continue;
        const id = String(t.categoryId);
        out.push({ id, path: `${fName} › ${sName} › ${t.categoryName}`, level: 3, leafIds: [id] });
        sNode.leafIds.push(id); fNode.leafIds.push(id);
      }
    }
  }
  return out;
}

/** Identifiant (famille, sous-famille ou finale) → catégories finales. */
export async function resolveLeafIds(id: string | null | undefined): Promise<string[]> {
  if (!id) return [];
  if (!id.startsWith("f:") && !id.startsWith("s:")) return [id];
  const nodes = buildNodes(await loadCjTree());
  return nodes.find((n) => n.id === id)?.leafIds ?? [];
}

export async function nodeLabel(id: string): Promise<string | null> {
  const nodes = buildNodes(await loadCjTree());
  return nodes.find((n) => n.id === id)?.path ?? null;
}
