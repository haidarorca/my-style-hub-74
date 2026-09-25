// Contrôle du stock CJ en temps réel, au niveau de la VARIANTE exacte.
// Endpoint officiel : GET /product/stock/queryByVid?vid=... (0 point).
import { cjGet, type CjCallTrace } from "./client.server";

export type VariantStock = { vid: string; stock: number | null; error: string | null };

function sumInventory(data: any): number | null {
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : [];
  if (!list.length) return 0; // variante inconnue / sans entrepôt = rupture
  let total = 0;
  let known = false;
  for (const r of list) {
    const n = Number(r?.totalInventoryNum ?? r?.totalInventory ?? r?.storageNum ?? NaN);
    if (Number.isFinite(n)) { total += n; known = true; }
  }
  return known ? total : null;
}

/** Interroge CJ pour chaque variante ; met à jour le stock connu en base. */
export async function checkCjVariantsStock(vids: string[], admin: any, timeoutMs = 8000): Promise<Map<string, VariantStock>> {
  const out = new Map<string, VariantStock>();
  const unique = Array.from(new Set(vids.filter(Boolean)));
  const traces: CjCallTrace[] = [];
  const deadline = Date.now() + timeoutMs;
  for (const vid of unique) {
    if (Date.now() > deadline) { out.set(vid, { vid, stock: null, error: "délai dépassé" }); continue; }
    try {
      const data = await Promise.race([
        cjGet<any>(`/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`, traces),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("délai dépassé")), Math.max(500, deadline - Date.now()))),
      ]);
      const stock = sumInventory(data);
      out.set(vid, { vid, stock, error: null });
      if (stock !== null) {
        await admin.from("product_variants")
          .update({ supplier_stock: stock, supplier_available: stock > 0 })
          .eq("external_variant_id", vid);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erreur";
      // Variante supprimée chez CJ → rupture explicite.
      if (/not exist|不存在|invalid vid|not found/i.test(msg)) out.set(vid, { vid, stock: 0, error: null });
      else out.set(vid, { vid, stock: null, error: msg });
    }
  }
  return out;
}

export type StockIssue = {
  item_id: string; product_name: string; variant: string | null;
  vid: string; requested: number; stock: number | null; reason: "rupture" | "insuffisant" | "injoignable";
};

/** Contrôle d'un ensemble de lignes ; renvoie les problèmes détectés. */
export function evaluateLines(
  lines: Array<{ id: string; product_name: string; variant_label_snapshot?: string | null; cj_variant_id: string; quantity: number }>,
  stocks: Map<string, VariantStock>,
): StockIssue[] {
  const issues: StockIssue[] = [];
  for (const l of lines) {
    const s = stocks.get(l.cj_variant_id);
    const base = { item_id: l.id, product_name: l.product_name, variant: l.variant_label_snapshot ?? null, vid: l.cj_variant_id, requested: Number(l.quantity) };
    if (!s || s.stock === null) issues.push({ ...base, stock: null, reason: "injoignable" });
    else if (s.stock <= 0) issues.push({ ...base, stock: s.stock, reason: "rupture" });
    else if (s.stock < Number(l.quantity)) issues.push({ ...base, stock: s.stock, reason: "insuffisant" });
  }
  return issues;
}
