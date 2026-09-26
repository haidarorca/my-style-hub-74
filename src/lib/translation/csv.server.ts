// Export / import de traductions par fichier CSV (Excel, Google Sheets).
// Une colonne par langue, export paginé sans limite, import multi-langues.
// Aucun appel IA : l'administrateur traduit le fichier avec l'outil de son choix.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CSV_FIELDS, type CsvMode, type CsvRow, type CsvScope } from "./csv";
import { TRANSLATION_LANG_CODES } from "./langs";

const db = supabaseAdmin as any;
type Json = Record<string, any>;
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const LANGS = TRANSLATION_LANG_CODES as readonly string[];
const UUID = /^[0-9a-f-]{36}$/i;

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

const missingIn = (obj: Json | null | undefined, langs: readonly string[]) => langs.some((l) => !nonEmpty(obj?.[l]));

/** Une page d'export. `cursor` = dernier id (produits/catégories) ou offset (variantes). */
export async function exportPage(scope: CsvScope, langs: string[], mode: CsvMode, cursor: string | null, size: number)
  : Promise<{ rows: CsvRow[]; next: string | null }> {
  if (scope === "products") {
    let q = db.from("products")
      .select("id, code, source_lang, name, designation, description, name_i18n, designation_i18n, description_i18n, material_i18n")
      .order("id").limit(size);
    if (cursor) q = q.gt("id", cursor);
    if (mode === "missing") q = q.or(langs.map((l) => `name_i18n->>${l}.is.null`).concat(langs.map((l) => `description_i18n->>${l}.is.null`)).join(","));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const list = (data ?? []) as Json[];
    const rows = list.map((p) => {
      const r: CsvRow = {
        product_id: p.id, code: p.code ?? "", langue_source: p.source_lang ?? "",
        nom_source: p.name ?? "", designation_source: p.designation ?? "", description_source: p.description ?? "",
      };
      for (const f of CSV_FIELDS.products) for (const l of langs) r[`${f.prefix}_${l}`] = p[f.col]?.[l] ?? "";
      return r;
    });
    return { rows, next: list.length === size ? list[list.length - 1].id : null };
  }

  if (scope === "variants") {
    if (!cursor) await db.rpc("translation_seed_dictionary");
    const from = Number(cursor ?? 0);
    const { data, error } = await db.from("translation_dictionary").select("kind, src_norm, src, tr")
      .order("kind").order("src_norm").range(from, from + size - 1);
    if (error) throw new Error(error.message);
    const list = (data ?? []) as Json[];
    const rows = list
      .filter((r) => mode === "all" || missingIn(r.tr, langs))
      .map((r) => {
        const o: CsvRow = { kind: r.kind, src_norm: r.src_norm, texte_source: r.src ?? "" };
        for (const l of langs) o[`traduction_${l}`] = r.tr?.[l] ?? "";
        return o;
      });
    return { rows, next: list.length === size ? String(from + size) : null };
  }

  let q = db.from("categories").select("id, name, name_i18n").order("id").limit(size);
  if (cursor) q = q.gt("id", cursor);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Json[];
  const rows = list
    .filter((c) => nonEmpty(c.name) && (mode === "all" || missingIn(c.name_i18n, langs)))
    .map((c) => {
      const o: CsvRow = { category_id: c.id, nom_source: c.name };
      for (const l of langs) o[`nom_${l}`] = c.name_i18n?.[l] ?? "";
      return o;
    });
  return { rows, next: list.length === size ? list[list.length - 1].id : null };
}

export type ImportReport = { updated: number; empty: number; unknown: number; errors: string[] };

/** Langues présentes dans le fichier (détectées d'après les en-têtes). */
function langsIn(scope: CsvScope, rows: CsvRow[]): string[] {
  const keys = new Set(Object.keys(rows[0] ?? {}));
  return LANGS.filter((l) => CSV_FIELDS[scope].some((f) => keys.has(`${f.prefix}_${l}`)));
}

export async function importRows(scope: CsvScope, rows: CsvRow[]): Promise<ImportReport> {
  const rep: ImportReport = { updated: 0, empty: 0, unknown: 0, errors: [] };
  const langs = langsIn(scope, rows);
  const fields = CSV_FIELDS[scope];
  const hasAny = (r: CsvRow) => langs.some((l) => fields.some((f) => nonEmpty(r[`${f.prefix}_${l}`])));
  const err = (m: string) => { if (rep.errors.length < 5) rep.errors.push(m); };

  if (scope === "products") {
    const clean = rows.filter((r) => UUID.test(r.product_id ?? ""));
    rep.unknown += rows.length - clean.length;
    const wanted = clean.filter(hasAny);
    rep.empty += clean.length - wanted.length;
    if (wanted.length === 0) return rep;
    const ids = wanted.map((r) => r.product_id);
    const [{ data: existing }, { data: hashes }] = await Promise.all([
      db.from("products").select("id, name_i18n, designation_i18n, description_i18n, material_i18n, i18n_meta").in("id", ids),
      db.rpc("translation_product_hashes", { _ids: ids }),
    ]);
    const byId = new Map<string, Json>(((existing ?? []) as Json[]).map((p) => [p.id, p]));
    const hashOf = new Map<string, string>(((hashes ?? []) as Array<{ id: string; h: string }>).map((r) => [r.id, r.h]));
    const now = new Date().toISOString();

    await Promise.all(wanted.map(async (r) => {
      const p = byId.get(r.product_id);
      if (!p) { rep.unknown++; return; }
      const patch: Json = {};
      const meta: Json = { ...(p.i18n_meta ?? {}) };
      let changed = false;
      for (const l of langs) {
        let touched = false;
        for (const f of fields) {
          const v = r[`${f.prefix}_${l}`];
          if (!nonEmpty(v) || p[f.col]?.[l] === v.trim()) continue;
          patch[f.col] = { ...(patch[f.col] ?? p[f.col] ?? {}), [l]: v.trim() };
          touched = true;
        }
        if (touched) { meta[l] = { ...(meta[l] ?? {}), hash: hashOf.get(r.product_id) ?? meta[l]?.hash, at: now, manual: true }; changed = true; }
      }
      if (!changed) { rep.empty++; return; }
      patch.i18n_meta = meta;
      const { error } = await db.from("products").update(patch).eq("id", r.product_id);
      if (error) err(error.message); else rep.updated++;
    }));
    return rep;
  }

  if (scope === "variants") {
    const wanted = rows.filter((r) => { const ok = hasAny(r); if (!ok) rep.empty++; return ok; });
    await Promise.all(wanted.map(async (r) => {
      if (!nonEmpty(r.kind) || !nonEmpty(r.src_norm)) { rep.unknown++; return; }
      const { data: cur } = await db.from("translation_dictionary").select("tr, manual").eq("kind", r.kind).eq("src_norm", r.src_norm).maybeSingle();
      if (!cur) { rep.unknown++; return; }
      const tr = { ...((cur as Json).tr ?? {}) }, manual = { ...((cur as Json).manual ?? {}) };
      let changed = false;
      for (const l of langs) {
        const v = r[`traduction_${l}`];
        if (nonEmpty(v) && tr[l] !== v.trim()) { tr[l] = v.trim(); manual[l] = true; changed = true; }
      }
      if (!changed) { rep.empty++; return; }
      const { error } = await db.from("translation_dictionary")
        .update({ tr, manual, attempts: 0, updated_at: new Date().toISOString() })
        .eq("kind", r.kind).eq("src_norm", r.src_norm);
      if (error) err(error.message); else rep.updated++;
    }));
    return rep;
  }

  const wanted = rows.filter((r) => { const ok = hasAny(r); if (!ok) rep.empty++; return ok; });
  await Promise.all(wanted.map(async (r) => {
    if (!UUID.test(r.category_id ?? "")) { rep.unknown++; return; }
    const { data: cur } = await db.from("categories").select("name_i18n").eq("id", r.category_id).maybeSingle();
    if (!cur) { rep.unknown++; return; }
    const i18n = { ...((cur as Json).name_i18n ?? {}) };
    let changed = false;
    for (const l of langs) {
      const v = r[`nom_${l}`];
      if (nonEmpty(v) && i18n[l] !== v.trim()) { i18n[l] = v.trim(); changed = true; }
    }
    if (!changed) { rep.empty++; return; }
    const { error } = await db.from("categories").update({ name_i18n: i18n }).eq("id", r.category_id);
    if (error) err(error.message); else rep.updated++;
  }));
  return rep;
}
