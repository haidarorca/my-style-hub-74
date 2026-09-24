// ═══════════════════════════════════════════════════════════════
// Normalisation des produits CJ déjà importés — SERVEUR UNIQUEMENT.
// Sans appel API CJ ni doublon : on repart des données sources
// conservées (cj_products) pour corriger description, caractéristiques
// et ordre des images (image principale en premier).
// ═══════════════════════════════════════════════════════════════
import { createHash } from "crypto";
import { parseSupplierDescription } from "./description";
import { orderSupplierImages } from "./image-order";

const hashOf = (url: string) => createHash("sha256").update(url.trim()).digest("hex").slice(0, 40);

export interface NormalizeResult {
  products: number;
  descriptions: number;
  imagesReordered: number;
  errors: string[];
}

export async function normalizeCjProducts(admin: any, onlyProductId?: string): Promise<NormalizeResult> {
  const res: NormalizeResult = { products: 0, descriptions: 0, imagesReordered: 0, errors: [] };
  let q = admin.from("cj_products").select("cj_product_id, product_id, source_description, source_images, raw").not("product_id", "is", null);
  if (onlyProductId) q = q.eq("product_id", onlyProductId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  for (const r of rows ?? []) {
    res.products += 1;
    try {
      const p = r.raw?.product ?? {};
      const parsed = parseSupplierDescription(r.source_description ?? p.description ?? null);
      const upd: Record<string, unknown> = {
        description: parsed.html,
        specifications: parsed.specs.length ? parsed.specs : null,
      };
      const { error: e1 } = await admin.from("products").update(upd).eq("id", r.product_id);
      if (e1) throw new Error(e1.message);
      res.descriptions += 1;

      // Ordre de référence des sources, puis correspondance avec les fichiers hébergés.
      const set: string[] = Array.isArray(p.productImageSet) ? p.productImageSet : [];
      const main: string | null = p.productImage ?? (Array.isArray(r.source_images) ? r.source_images[0] : null) ?? null;
      const order = orderSupplierImages(main, set.length ? set : r.source_images ?? [], parsed.imageUrls);
      const { data: imgs } = await admin.from("product_images").select("id, url, position").eq("product_id", r.product_id);
      if (!imgs?.length || !order.length) continue;
      const rank = new Map<string, number>();
      order.forEach((u, i) => rank.set(hashOf(u), i));
      const rankOf = (url: string) => {
        const m = /\/([0-9a-f]{40})\.[a-z0-9]+(\?|$)/i.exec(url);
        return m && rank.has(m[1]!) ? rank.get(m[1]!)! : 10_000;
      };
      const seen = new Set<string>();
      const sorted = [...imgs].sort((a: any, b: any) => rankOf(a.url) - rankOf(b.url) || (a.position ?? 0) - (b.position ?? 0));
      const dupes: string[] = [];
      let changed = false;
      let pos = 0;
      for (const img of sorted) {
        if (seen.has(img.url)) { dupes.push(img.id); continue; }
        seen.add(img.url);
        if (img.position !== pos) {
          changed = true;
          await admin.from("product_images").update({ position: pos }).eq("id", img.id);
        }
        pos += 1;
      }
      if (dupes.length) { changed = true; await admin.from("product_images").delete().in("id", dupes); }
      if (changed) res.imagesReordered += 1;
      await admin.from("cj_products").update({ main_image: sorted[0]?.url ?? null }).eq("cj_product_id", r.cj_product_id);
    } catch (e) {
      res.errors.push(`${r.cj_product_id} : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }
  return res;
}
