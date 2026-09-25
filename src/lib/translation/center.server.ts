// Moteur du Centre de traduction : tâches persistantes traitées en arrière-plan
// par petits lots (réveil chaque minute tant qu'une tâche est active).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AiHalt, translateFree, translateLabels, translateProductAll } from "./ai.server";
import type { TranslationScope } from "./langs";

type Json = Record<string, any>;
type Bucket = { total: number; pending: number; translated: number; skipped: number; errors: number; done: boolean };
type Job = {
  id: string; status: string; langs: string[]; scopes: TranslationScope[];
  stats: Record<string, Bucket>; failed: Record<string, string[]>;
};

const db = supabaseAdmin as any;
const TICK_MS = 30_000;       // plus aucun nouveau lot après ce délai
const PRODUCT_PARALLEL = 8;
const LABEL_BATCH = 80;
const LABEL_PARALLEL = 3;

export const emptyBucket = (total = 0, pending = 0): Bucket => ({ total, pending, translated: 0, skipped: 0, errors: 0, done: false });

export async function getPreview(langs: string[]) {
  await db.rpc("translation_seed_dictionary");
  const { data, error } = await db.rpc("translation_preview", { _langs: langs });
  if (error) throw new Error(error.message);
  return data as Record<TranslationScope, { pending: number; total: number }>;
}

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const missing = (map: Json | null | undefined, langs: string[]) => langs.filter((l) => !nonEmpty(map?.[l]));
/** Valeurs qui ne se traduisent pas (tailles, nombres, codes). */
const TRIVIAL = /^(?:[\d\s.,/x×*+\-~()%#:]+(?:\s?(?:cm|mm|m|kg|g|ml|l|pcs|pc|inch|in|"))?|[2-9]?x{0,4}[sml]|xs|[a-z]{0,3}\d+[a-z]{0,2})$/i;

// ---------------- Produits ----------------
async function stepProducts(job: Job, b: Bucket): Promise<boolean> {
  const failed = job.failed.products ?? [];
  const { data: ids } = await db.rpc("translation_pending_products", { _langs: job.langs, _exclude: failed, _limit: PRODUCT_PARALLEL });
  const list = ((ids ?? []) as Array<string | { translation_pending_products: string }>).map((x) => (typeof x === "string" ? x : x.translation_pending_products));
  if (list.length === 0) return true;
  const [{ data: rows }, { data: hashes }] = await Promise.all([
    db.from("products").select("id, source, source_lang, name, designation, description, material, group_option_label, specifications, name_i18n, designation_i18n, description_i18n, material_i18n, group_option_label_i18n, specifications_i18n, i18n_meta").in("id", list),
    db.rpc("translation_product_hashes", { _ids: list }),
  ]);
  const hashOf = new Map<string, string>(((hashes ?? []) as Array<{ id: string; h: string }>).map((r) => [r.id, r.h]));

  await Promise.all(((rows ?? []) as Json[]).map(async (p) => {
    const h = hashOf.get(p.id)!;
    const meta: Json = { ...(p.i18n_meta ?? {}) };
    const targets = job.langs.filter((l) => meta[l]?.hash !== h);
    const aiLangs = targets.filter((l) => !meta[l]?.manual);
    const stamp = (l: string) => { meta[l] = { ...(meta[l] ?? {}), hash: h, at: new Date().toISOString() }; };

    if (aiLangs.length === 0) {
      targets.forEach(stamp);
      await db.from("products").update({ i18n_meta: meta }).eq("id", p.id);
      b.skipped++;
      return;
    }
    const specsSrc: Array<{ label: string; value: string; rows?: unknown }> = Array.isArray(p.specifications) ? p.specifications : [];
    const res = await translateProductAll({
      name: p.name ?? "", designation: p.designation ?? "", description: p.description ?? "",
      material: p.material ?? "", group_option_label: p.group_option_label ?? "",
      specs: specsSrc.map((s) => ({ label: String(s?.label ?? ""), value: String(s?.value ?? "") })),
    }, aiLangs);
    if (!res) { b.errors++; failed.push(p.id); return; }

    const maps: Record<string, Json> = {
      name_i18n: { ...(p.name_i18n ?? {}) }, designation_i18n: { ...(p.designation_i18n ?? {}) },
      description_i18n: { ...(p.description_i18n ?? {}) }, material_i18n: { ...(p.material_i18n ?? {}) },
      group_option_label_i18n: { ...(p.group_option_label_i18n ?? {}) },
    };
    const specsI18n: Json = { ...(p.specifications_i18n ?? {}) };
    for (const l of aiLangs) {
      const t = res.byLang[l];
      if (!t) continue;
      // Jamais traduit automatiquement → on complète seulement les vides (on garde l'existant).
      const overwrite = !!meta[l]?.hash;
      const put = (col: string, v?: string) => { if (v && (overwrite || !nonEmpty(maps[col][l]))) maps[col][l] = v; };
      put("name_i18n", t.name); put("designation_i18n", t.designation); put("description_i18n", t.description);
      put("material_i18n", t.material); put("group_option_label_i18n", t.group_option_label);
      if (t.specs && (overwrite || !Array.isArray(specsI18n[l]))) {
        specsI18n[l] = t.specs.map((s, i) => ({ ...specsSrc[i], label: s.label, value: s.value }));
      }
    }
    targets.forEach(stamp);
    const patch: Json = { ...maps, specifications_i18n: specsI18n, i18n_meta: meta };
    if (!p.source_lang) patch.source_lang = res.source_lang ?? (String(p.source ?? "").includes("cj") ? "en" : null);
    const { error } = await db.from("products").update(patch).eq("id", p.id);
    if (error) { b.errors++; failed.push(p.id); } else b.translated++;
  }));
  job.failed.products = failed;
  return false;
}

// ---------------- Dictionnaire des variantes ----------------
async function stepVariants(job: Job, b: Bucket): Promise<boolean> {
  const { data } = await db.rpc("translation_pending_dict", { _langs: job.langs, _limit: LABEL_BATCH * LABEL_PARALLEL });
  const rows = (data ?? []) as Array<{ kind: string; src_norm: string; src: string; tr: Json; attempts: number }>;
  if (rows.length === 0) return true;
  const upd = async (r: (typeof rows)[number], tr: Json, ok: boolean) => {
    await db.from("translation_dictionary").update({ tr, attempts: ok ? r.attempts : r.attempts + 1, updated_at: new Date().toISOString() })
      .eq("kind", r.kind).eq("src_norm", r.src_norm);
  };
  const trivial = rows.filter((r) => TRIVIAL.test(r.src.trim()));
  await Promise.all(trivial.map((r) => {
    const tr = { ...r.tr }; for (const l of job.langs) if (!nonEmpty(tr[l])) tr[l] = r.src;
    b.skipped++; return upd(r, tr, true);
  }));
  const rest = rows.filter((r) => !TRIVIAL.test(r.src.trim()));
  const chunks: Array<typeof rest> = [];
  for (let i = 0; i < rest.length; i += LABEL_BATCH) chunks.push(rest.slice(i, i + LABEL_BATCH));
  await Promise.all(chunks.map(async (chunk) => {
    const langsNeeded = job.langs;
    const ctx = chunk[0].kind === "opt_name" ? "product option names (e.g. Color, Size) and option values (colors, sizes, models, bundles)" : "product variant option values (colors, sizes, models, bundles like 'With Box')";
    const out = await translateLabels(chunk.map((r) => r.src), langsNeeded, ctx);
    await Promise.all(chunk.map((r, i) => {
      const tr = { ...r.tr }; let got = false;
      for (const l of langsNeeded) if (!nonEmpty(tr[l]) && out[i]?.[l]) { tr[l] = out[i][l]; got = true; }
      if (got) b.translated++; else b.errors++;
      return upd(r, tr, got);
    }));
  }));
  return false;
}

// ---------------- Catégories / Pays ----------------
async function stepNameTable(table: "categories" | "countries", job: Job, b: Bucket): Promise<boolean> {
  const failed = job.failed[table] ?? [];
  const { data } = await db.from(table).select("id, name, name_i18n, content_hash, translated_hash");
  const pending = ((data ?? []) as Json[]).filter((r) => nonEmpty(r.name) && !failed.includes(r.id)
    && (r.translated_hash !== r.content_hash || missing(r.name_i18n, job.langs).length > 0)).slice(0, LABEL_BATCH);
  if (pending.length === 0) return true;
  const out = await translateLabels(pending.map((r) => r.name), job.langs, table === "categories" ? "category names" : "country names");
  await Promise.all(pending.map(async (r, i) => {
    const stale = r.translated_hash !== r.content_hash && !!r.translated_hash;
    const map: Json = { ...(r.name_i18n ?? {}) }; let got = false;
    for (const l of job.langs) if (out[i]?.[l] && (stale || !nonEmpty(map[l]))) { map[l] = out[i][l]; got = true; }
    if (!got && missing(map, job.langs).length > 0) { b.errors++; failed.push(r.id); return; }
    const { error } = await db.from(table).update({ name_i18n: map, translated_hash: r.content_hash }).eq("id", r.id);
    if (error) { b.errors++; failed.push(r.id); } else b.translated++;
  }));
  job.failed[table] = failed;
  return false;
}

// ---------------- Champs libres (boutiques, bannières, paramètres) ----------------
type FieldTask = { table: string; id: string; idCol: string; field: string; src: string; map: Json };
async function stepFields(scope: "shops" | "banners" | "settings", job: Job, b: Bucket): Promise<boolean> {
  const failed = job.failed[scope] ?? [];
  const tasks: FieldTask[] = [];
  const collect = (table: string, rows: Json[], fields: string[]) => {
    for (const r of rows) for (const f of fields) {
      const key = `${r.id}:${f}`;
      if (nonEmpty(r[f]) && !failed.includes(key) && missing(r[`${f}_i18n`], job.langs).length > 0)
        tasks.push({ table, id: r.id, idCol: "id", field: f, src: r[f], map: r[`${f}_i18n`] ?? {} });
    }
  };
  if (scope === "shops") {
    const { data } = await db.from("profiles").select("id, shop_description, shop_description_i18n, shop_hours, shop_hours_i18n")
      .or("shop_description.not.is.null,shop_hours.not.is.null").limit(2000);
    collect("profiles", data ?? [], ["shop_description", "shop_hours"]);
  } else if (scope === "banners") {
    const { data } = await db.from("home_banners").select("id, title, subtitle, cta_label, title_i18n, subtitle_i18n, cta_label_i18n");
    collect("home_banners", data ?? [], ["title", "subtitle", "cta_label"]);
  } else {
    const { data } = await db.from("site_settings").select("id, hero_title, hero_subtitle, footer_text, promo_bar_text, hero_title_i18n, hero_subtitle_i18n, footer_text_i18n, promo_bar_text_i18n").eq("id", "main");
    collect("site_settings", data ?? [], ["hero_title", "hero_subtitle", "footer_text", "promo_bar_text"]);
  }
  const batch = tasks.slice(0, 6);
  if (batch.length === 0) return true;
  // Plusieurs champs d'une même ligne : on relit/fusionne ligne par ligne, séquentiellement par ligne.
  for (const t of batch) {
    const miss = missing(t.map, job.langs);
    const res = await translateFree(t.src, miss);
    const { data: fresh } = await db.from(t.table).select(`${t.field}_i18n`).eq(t.idCol, t.id).maybeSingle();
    const map: Json = { ...((fresh as Json | null)?.[`${t.field}_i18n`] ?? t.map) };
    let got = false;
    for (const l of miss) if (res[l] && !nonEmpty(map[l])) { map[l] = res[l]; got = true; }
    if (!got) { b.errors++; failed.push(`${t.id}:${t.field}`); continue; }
    const { error } = await db.from(t.table).update({ [`${t.field}_i18n`]: map }).eq(t.idCol, t.id);
    if (error) { b.errors++; failed.push(`${t.id}:${t.field}`); } else b.translated++;
  }
  job.failed[scope] = failed;
  return false;
}

const STEPS: Record<TranslationScope, (job: Job, b: Bucket) => Promise<boolean>> = {
  products: stepProducts,
  variants: stepVariants,
  categories: (j, b) => stepNameTable("categories", j, b),
  countries: (j, b) => stepNameTable("countries", j, b),
  shops: (j, b) => stepFields("shops", j, b),
  banners: (j, b) => stepFields("banners", j, b),
  settings: (j, b) => stepFields("settings", j, b),
};

async function save(job: Job, extra: Json = {}) {
  await db.from("translation_jobs").update({ stats: job.stats, failed: job.failed, updated_at: new Date().toISOString(), ...extra }).eq("id", job.id);
}

async function disarmIfIdle() {
  const { count } = await db.from("translation_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
  if (!count) await db.rpc("translation_disarm_worker");
}

/** Un réveil du travailleur : avance la tâche active pendant ~30 s. */
export async function runTranslationTick() {
  const start = Date.now();
  const { data } = await db.rpc("translation_try_lease", { _seconds: 90 });
  const job = ((data ?? []) as Job[])[0];
  if (!job) { await disarmIfIdle(); return { ok: true, idle: true }; }
  job.stats = job.stats ?? {}; job.failed = job.failed ?? {};

  try {
    for (const scope of job.scopes) {
      const b = (job.stats[scope] ??= emptyBucket());
      if (b.done) continue;
      await db.from("translation_jobs").update({ current_scope: scope }).eq("id", job.id);
      while (!b.done && Date.now() - start < TICK_MS) {
        const { data: cur } = await db.from("translation_jobs").select("status").eq("id", job.id).maybeSingle();
        if (cur?.status !== "running") { await save(job, { lease_until: null }); return { ok: true, stopped: cur?.status }; }
        b.done = await STEPS[scope](job, b);
        await save(job);
      }
      if (!b.done) break;
    }
    const allDone = job.scopes.every((s) => job.stats[s]?.done);
    await save(job, allDone
      ? { status: "done", finished_at: new Date().toISOString(), lease_until: null, current_scope: null, pause_reason: null }
      : { lease_until: null, pause_reason: null, last_error: null });
    if (allDone) await disarmIfIdle();
    return { ok: true, done: allDone };
  } catch (e) {
    if (e instanceof AiHalt && e.kind === "rate") {
      await save(job, { lease_until: new Date(Date.now() + 60_000).toISOString(), last_error: e.message });
      return { ok: false, retry: true };
    }
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    if (e instanceof AiHalt) {
      await save(job, { status: "paused", pause_reason: msg, lease_until: null });
      await disarmIfIdle();
    } else {
      // Erreur passagère : la tâche reprendra au prochain réveil.
      await save(job, { last_error: msg, lease_until: null });
    }
    return { ok: false, error: msg };
  }
}
