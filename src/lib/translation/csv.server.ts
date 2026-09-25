// Export / import de traductions par fichier CSV (Excel, Google Sheets).
// Aucun appel IA : l'administrateur traduit le fichier avec l'outil de son choix.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CsvRow, CsvScope } from "./csv";

const db = supabaseAdmin as any;
type Json = Record<string, any>;
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export async function countPending(scope: CsvScope, lang: string): Promise<number> {
  if (scope === "products") {
    const { data } = await db.rpc("translation_preview", { _langs: [lang] });
    return Number((data as Json)?.products?.pending ?? 0);
  }
  if (scope === "variants") {
    await db.rpc("translation_seed_dictionary");
    const { data } = await db.rpc("translation_preview", { _langs: [lang] });
    return Number((data as Json)?.variants?.pending ?? 0);
  }
  const { data } = await db.from("categories").select("id, name, name_i18n");
  return ((data ?? []) as Json[]).filter((c) => nonEmpty(c.name) && !nonEmpty(c.name_i18n?.[lang])).length;
}

export async function exportRows(scope: CsvScope, lang: string, limit: number): Promise<CsvRow[]> {
  if (scope === "products") {
    const { data: ids } = await db.rpc("translation_pending_products", { _langs: [lang], _exclude: [], _limit: limit });
    const list = ((ids ?? []) as Array<string | Json>).map((x) => (typeof x === "string" ? x : x.translation_pending_products));
    if (list.length === 0) return [];
    const { data: rows } = await db.from("products")
      .select("id, code, source_lang, name, designation, description, material, name_i18n, designation_i18n, description_i18n, material_i18n")
      .in("id", list);
    return ((rows ?? []) as Json[]).map((p) => ({
      product_id: p.id,
      code: p.code ?? "",
      langue_source: p.source_lang ?? "",
      nom_source: p.name ?? "",
      designation_source: p.designation ?? "",
      description_source: p.description ?? "",
      [`nom_${lang}`]: p.name_i18n?.[lang] ?? "",
      [`designation_${lang}`]: p.designation_i18n?.[lang] ?? "",
      [`description_${lang}`]: p.description_i18n?.[lang] ?? "",
      [`matiere_${lang}`]: p.material_i18n?.[lang] ?? "",
    }));
  }

  if (scope === "variants") {
    await db.rpc("translation_seed_dictionary");
    const { data } = await db.from("translation_dictionary").select("kind, src_norm, src, tr").order("kind").order("src_norm").limit(5000);
    return ((data ?? []) as Json[])
      .filter((r) => !nonEmpty(r.tr?.[lang]))
      .slice(0, limit)
      .map((r) => ({ kind: r.kind, src_norm: r.src_norm, texte_source: r.src, [`traduction_${lang}`]: "" }));
  }

  const { data } = await db.from("categories").select("id, name, name_i18n").order("name");
  return ((data ?? []) as Json[])
    .filter((c) => nonEmpty(c.name) && !nonEmpty(c.name_i18n?.[lang]))
    .slice(0, limit)
    .map((c) => ({ category_id: c.id, nom_source: c.name, [`nom_${lang}`]: "" }));
}

export type ImportReport = { updated: number; empty: number; unknown: number; errors: string[] };

export async function importRows(scope: CsvScope, lang: string, rows: CsvRow[]): Promise<ImportReport> {
  const rep: ImportReport = { updated: 0, empty: 0, unknown: 0, errors: [] };

  if (scope === "products") {
    const clean = rows.filter((r) => /^[0-9a-f-]{36}$/i.test(r.product_id ?? ""));
    rep.unknown += rows.length - clean.length;
    const wanted = clean.filter((r) => nonEmpty(r[`nom_${lang}`]) || nonEmpty(r[`designation_${lang}`]) || nonEmpty(r[`description_${lang}`]) || nonEmpty(r[`matiere_${lang}`]));
    rep.empty += clean.length - wanted.length;
    if (wanted.length === 0) return rep;

    const ids = wanted.map((r) => r.product_id);
    const [{ data: existing }, { data: hashes }] = await Promise.all([
      db.from("products").select("id, name_i18n, designation_i18n, description_i18n, material_i18n, i18n_meta").in("id", ids),
      db.rpc("translation_product_hashes", { _ids: ids }),
    ]);
    const byId = new Map<string, Json>(((existing ?? []) as Json[]).map((p) => [p.id, p]));
    const hashOf = new Map<string, string>(((hashes ?? []) as Array<{ id: string; h: string }>).map((r) => [r.id, r.h]));

    for (const r of wanted) {
      const p = byId.get(r.product_id);
      if (!p) { rep.unknown++; continue; }
      const patch: Json = {};
      const put = (col: string, v?: string) => { if (nonEmpty(v)) patch[col] = { ...(p[col] ?? {}), [lang]: v!.trim() }; };
      put("name_i18n", r[`nom_${lang}`]);
      put("designation_i18n", r[`designation_${lang}`]);
      put("description_i18n", r[`description_${lang}`]);
      put("material_i18n", r[`matiere_${lang}`]);
      const meta: Json = { ...(p.i18n_meta ?? {}) };
      meta[lang] = { ...(meta[lang] ?? {}), hash: hashOf.get(r.product_id) ?? meta[lang]?.hash, at: new Date().toISOString(), manual: true };
      patch.i18n_meta = meta;
      const { error } = await db.from("products").update(patch).eq("id", r.product_id);
      if (error) { if (rep.errors.length < 5) rep.errors.push(error.message); } else rep.updated++;
    }
    return rep;
  }

  if (scope === "variants") {
    for (const r of rows) {
      const val = r[`traduction_${lang}`];
      if (!nonEmpty(val)) { rep.empty++; continue; }
      if (!nonEmpty(r.kind) || !nonEmpty(r.src_norm)) { rep.unknown++; continue; }
      const { data: cur } = await db.from("translation_dictionary").select("tr, manual").eq("kind", r.kind).eq("src_norm", r.src_norm).maybeSingle();
      if (!cur) { rep.unknown++; continue; }
      const { error } = await db.from("translation_dictionary").update({
        tr: { ...((cur as Json).tr ?? {}), [lang]: val.trim() },
        manual: { ...((cur as Json).manual ?? {}), [lang]: true },
        attempts: 0,
        updated_at: new Date().toISOString(),
      }).eq("kind", r.kind).eq("src_norm", r.src_norm);
      if (error) { if (rep.errors.length < 5) rep.errors.push(error.message); } else rep.updated++;
    }
    return rep;
  }

  for (const r of rows) {
    const val = r[`nom_${lang}`];
    if (!nonEmpty(val)) { rep.empty++; continue; }
    if (!/^[0-9a-f-]{36}$/i.test(r.category_id ?? "")) { rep.unknown++; continue; }
    const { data: cur } = await db.from("categories").select("name_i18n").eq("id", r.category_id).maybeSingle();
    if (!cur) { rep.unknown++; continue; }
    const { error } = await db.from("categories").update({ name_i18n: { ...((cur as Json).name_i18n ?? {}), [lang]: val.trim() } }).eq("id", r.category_id);
    if (error) { if (rep.errors.length < 5) rep.errors.push(error.message); } else rep.updated++;
  }
  return rep;
}
