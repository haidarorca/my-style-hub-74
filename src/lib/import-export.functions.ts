import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  IMPORT_COLUMNS,
  type ParsedRow,
  type PreviewError,
  type PreviewResult,
  type PreviewSummary,
  type RowAction,
  type RowType,
} from "./import-export-schema";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

async function assertCanWriteShop(userId: string, shopId: string, scope: "vendor" | "admin") {
  if (scope === "admin") {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin"]);
    if (!data || data.length === 0) throw new Error("Accès refusé : admin requis");
    return;
  }
  if (shopId !== userId) throw new Error("Accès refusé : vous ne pouvez écrire que sur votre boutique");
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function toStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

// Build an XLSX workbook from arrays-of-arrays sheets, returning base64.
// SheetJS works in the Cloudflare Workers runtime (pure JS, no native deps).
function buildXlsxBase64(sheets: { name: string; rows: (string | number)[][] }[]): string {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return out as string;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ─────────────────────────────────────────────────────────────────────────────
// Export

const ExportInput = z.object({
  scope: z.enum(["vendor", "admin"]),
  shopId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["pending", "approved", "rejected", "any"]).default("any"),
});

export const exportProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExportInput.parse(input))
  .handler(async ({ data, context }) => {
    const targetShop = data.shopId ?? data.vendorId ?? (data.scope === "vendor" ? context.userId : undefined);
    if (data.scope === "admin") {
      await assertCanWriteShop(context.userId, targetShop ?? context.userId, "admin");
    } else {
      if (!targetShop || targetShop !== context.userId) throw new Error("Accès refusé");
    }

    let query = supabaseAdmin
      .from("products")
      .select(
        "id, code, name, designation, description, price, status, category_id, vendor_id, " +
        "product_variants(id, size, color, color_hex, price_override, stock, image_url), " +
        "product_images(url, position)",
      )
      .order("created_at", { ascending: false })
      .limit(5000);

    if (targetShop) query = query.eq("vendor_id", targetShop);
    if (data.categoryId) query = query.eq("category_id", data.categoryId);
    if (data.status !== "any") query = query.eq("status", data.status);

    const { data: products, error } = await query;
    if (error) throw new Error(error.message);

    const { data: allCats } = await supabaseAdmin.from("categories").select("id, name, parent_id, level");
    const catMap = new Map<string, { id: string; name: string; parent_id: string | null; level: number }>();
    for (const c of (allCats ?? []) as any[]) catMap.set(c.id, c);

    function categoryPath(catId: string | null): [string, string, string] {
      const path: string[] = [];
      let cur = catId;
      while (cur) {
        const c = catMap.get(cur);
        if (!c) break;
        path.unshift(c.name);
        cur = c.parent_id;
      }
      return [path[0] ?? "", path[1] ?? "", path[2] ?? ""];
    }

    const imageIdMap = new Map<string, string>();
    let imgCounter = 0;
    function idForUrl(url: string): string {
      const cached = imageIdMap.get(url);
      if (cached) return cached;
      imgCounter += 1;
      const id = `IMG${String(imgCounter).padStart(4, "0")}`;
      imageIdMap.set(url, id);
      return id;
    }

    const productRows: (string | number)[][] = [[...IMPORT_COLUMNS]];

    for (const p of (products ?? []) as any[]) {
      const [c1, c2, c3] = categoryPath(p.category_id);
      const images = (p.product_images ?? [])
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((i: any) => idForUrl(i.url))
        .join(",");

      productRows.push([
        "parent", "update", p.code ?? "", "", "",
        p.designation ?? "", p.name ?? "", p.description ?? "",
        c1, c2, c3,
        p.price ?? 0, "", "",
        "", "", "", "", "", "",
        images, "", "", p.status ?? "",
      ]);

      for (const v of (p.product_variants ?? []) as any[]) {
        const variantImg = v.image_url ? idForUrl(v.image_url) : "";
        productRows.push([
          "variant", "update", p.code ?? "", v.id, "",
          "", "", "", "", "", "",
          "", v.price_override ?? "", v.stock ?? 0,
          v.color ? "Couleur" : "", v.color ?? "",
          v.size ? "Taille" : "", v.size ?? "",
          "", "", "", variantImg, "", "",
        ]);
      }
    }

    const imageRows: (string | number)[][] = [["Image ID", "URL"]];
    for (const [url, id] of imageIdMap.entries()) imageRows.push([id, url]);

    const base64 = buildXlsxBase64([
      { name: "Produits", rows: productRows },
      { name: "Images", rows: imageRows },
    ]);

    return {
      fileName: `produits-${new Date().toISOString().slice(0, 10)}.xlsx`,
      base64,
      mime: XLSX_MIME,
      count: (products ?? []).length,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Template download

export const downloadTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const rows: (string | number)[][] = [
      [...IMPORT_COLUMNS],
      [
        "parent", "create", "P001", "", "", "Housse DJI", "Housse DJI Osmo Pocket 3",
        "Description du produit", "Électronique", "Accessoires", "Caméra",
        11220, "", "", "", "", "", "", "", "", "IMG001,IMG002", "", "Sénégal", "pending",
      ],
      [
        "variant", "create", "P001", "P001-NOIR", "", "", "", "", "", "", "",
        "", 11220, 10, "Couleur", "Noir", "Taille", "M", "", "", "", "IMG003", "", "active",
      ],
      [
        "variant", "create", "P001", "P001-BLANC", "", "", "", "", "", "", "",
        "", 5440, 5, "Couleur", "Blanc", "Taille", "L", "", "", "", "IMG004", "", "active",
      ],
    ];
    const base64 = buildXlsxBase64([{ name: "Produits", rows }]);
    return {
      fileName: "modele-import-produits.xlsx",
      base64,
      mime: XLSX_MIME,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Preview

const PreviewInput = z.object({
  scope: z.enum(["vendor", "admin"]),
  shopId: z.string().uuid(),
  fileBase64: z.string().min(1),
  fileName: z.string().min(1).max(255),
  zipBase64: z.string().optional(),
});

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function parseFile(base64: string, fileName: string): Promise<string[][]> {
  if (fileName.toLowerCase().endsWith(".csv")) {
    const buf = Buffer.from(base64, "base64");
    const text = buf.toString("utf-8");
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map(parseCsvLine);
  }
  // XLSX (SheetJS) — Worker-compatible
  const wb = XLSX.read(base64, { type: "base64" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  return aoa.map((row) => (row ?? []).map((c) => (c === null || c === undefined ? "" : String(c))));
}

function parseRows(matrix: string[][]): { rows: ParsedRow[]; errors: PreviewError[] } {
  const errors: PreviewError[] = [];
  if (matrix.length < 2) return { rows: [], errors: [{ row: 0, severity: "error", message: "Fichier vide" }] };
  const header = matrix[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const cols = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, idx(c)])) as Record<string, number>;

  const rows: ParsedRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || r.every((c) => !c || !String(c).trim())) continue;
    const rowIndex = i + 1;
    const type = (toStr(r[cols["Type"]]) ?? "").toLowerCase() as RowType;
    const action = (toStr(r[cols["Action"]]) ?? "create").toLowerCase() as RowAction;
    if (type !== "parent" && type !== "variant") {
      errors.push({ row: rowIndex, field: "Type", severity: "error", message: "Type doit être 'parent' ou 'variant'" });
      continue;
    }
    if (!["create", "update", "delete", "ignore"].includes(action)) {
      errors.push({ row: rowIndex, field: "Action", severity: "error", message: "Action invalide" });
      continue;
    }
    const productCode = toStr(r[cols["Code produit"]]) ?? "";
    if (!productCode) {
      errors.push({ row: rowIndex, field: "Code produit", severity: "error", message: "Code produit requis" });
      continue;
    }
    const options: { name: string; value: string }[] = [];
    for (let k = 1; k <= 3; k++) {
      const n = toStr(r[cols[`Nom option ${k}`]]);
      const v = toStr(r[cols[`Valeur option ${k}`]]);
      if (n && v) options.push({ name: n, value: v });
    }
    const productImages = (toStr(r[cols["Images produit"]]) ?? "")
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);

    rows.push({
      rowIndex,
      type,
      action: action === "ignore" ? "ignore" : action,
      productCode,
      variantCode: toStr(r[cols["Code variante"]]),
      shop: toStr(r[cols["Boutique"]]),
      designation: toStr(r[cols["Désignation"]]),
      name: toStr(r[cols["Nom"]]),
      description: toStr(r[cols["Description"]]),
      category: toStr(r[cols["Catégorie"]]),
      subCategory: toStr(r[cols["Sous-catégorie"]]),
      subSubCategory: toStr(r[cols["Sous-sous-catégorie"]]),
      displayPrice: toNum(r[cols["Prix affiché"]]),
      variantPrice: toNum(r[cols["Prix variante"]]),
      stock: toNum(r[cols["Stock"]]),
      options,
      productImages,
      variantImage: toStr(r[cols["Image variante"]]),
      destinationCountry: toStr(r[cols["Pays livraison"]]),
      status: toStr(r[cols["Statut"]]),
    });
  }
  return { rows, errors };
}

async function buildImageMap(zipBase64?: string): Promise<Record<string, string>> {
  if (!zipBase64) return {};
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"));
  const map: Record<string, string> = {};
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const f of entries) {
    const base = f.name.split("/").pop() ?? f.name;
    const id = base.replace(/\.[^.]+$/, "");
    if (!id) continue;
    const ext = (base.match(/\.([^.]+)$/) ?? ["", "jpg"])[1].toLowerCase();
    const buf = await f.async("uint8array");
    const path = `imports/${Date.now()}-${id}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("product-images")
      .upload(path, buf, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: true });
    if (error) continue;
    const { data } = supabaseAdmin.storage.from("product-images").getPublicUrl(path);
    map[id] = data.publicUrl;
  }
  return map;
}

export const previewImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PreviewInput.parse(input))
  .handler(async ({ data, context }): Promise<PreviewResult> => {
    await assertCanWriteShop(context.userId, data.shopId, data.scope);

    const matrix = await parseFile(data.fileBase64, data.fileName);
    const { rows, errors } = parseRows(matrix);

    const { data: allCats } = await supabaseAdmin.from("categories").select("id, name, parent_id, level");
    const catByName = new Map<string, { id: string; parent_id: string | null; level: number }>();
    for (const c of (allCats ?? []) as any[]) catByName.set(c.name.toLowerCase(), c);

    const codes = Array.from(new Set(rows.map((r) => r.productCode)));
    const { data: existing } = await supabaseAdmin
      .from("products")
      .select("id, code")
      .eq("vendor_id", data.shopId)
      .in("code", codes);
    const existingCodes = new Set(((existing ?? []) as any[]).map((p) => p.code));

    const referencedIds = new Set<string>();
    for (const r of rows) {
      r.productImages.forEach((id) => referencedIds.add(id));
      if (r.variantImage) referencedIds.add(r.variantImage);
    }

    const imageMap = await buildImageMap(data.zipBase64);
    const imageIds = Array.from(referencedIds).map((id) => ({ id, resolved: !!imageMap[id] }));

    let toCreate = 0, toUpdate = 0, toDelete = 0, parents = 0, variants = 0;
    for (const r of rows) {
      if (r.type === "parent") parents++; else variants++;
      if (r.action === "ignore") continue;

      if (r.type === "parent" && r.action === "create") {
        if (existingCodes.has(r.productCode)) {
          errors.push({ row: r.rowIndex, field: "Code produit", severity: "warning", message: `Code ${r.productCode} existe déjà → sera mis à jour` });
          toUpdate++;
        } else {
          toCreate++;
        }
        if (!r.name) errors.push({ row: r.rowIndex, field: "Nom", severity: "error", message: "Nom requis pour création" });
        if (r.displayPrice === undefined || r.displayPrice < 0)
          errors.push({ row: r.rowIndex, field: "Prix affiché", severity: "error", message: "Prix invalide" });
        const cat = r.subSubCategory ?? r.subCategory ?? r.category;
if (cat && !catByName.has(cat.toLowerCase())) {
  errors.push({
    row: r.rowIndex,
    field: "Catégorie",
    severity: "warning",
    message: `Nouvelle catégorie détectée : ${cat}`,
  });
}
      } else if (r.action === "update") {
        toUpdate++;
      } else if (r.action === "delete") {
        toDelete++;
      } else if (r.type === "variant" && r.action === "create") {
        toCreate++;
        if (r.variantPrice === undefined || r.variantPrice < 0)
          errors.push({ row: r.rowIndex, field: "Prix variante", severity: "error", message: "Prix variante invalide" });
      }

      for (const id of r.productImages) {
        if (!imageMap[id]) errors.push({ row: r.rowIndex, field: "Images produit", severity: "warning", message: `Image ${id} non trouvée dans le ZIP` });
      }
      if (r.variantImage && !imageMap[r.variantImage])
        errors.push({ row: r.rowIndex, field: "Image variante", severity: "warning", message: `Image ${r.variantImage} non trouvée` });
    }

    const summary: PreviewSummary = {
      totalRows: rows.length,
      parents,
      variants,
      toCreate,
      toUpdate,
      toDelete,
      errors: errors.filter((e) => e.severity === "error").length,
      warnings: errors.filter((e) => e.severity === "warning").length,
    };

    const { data: ins, error: insErr } = await supabaseAdmin
      .from("product_imports")
      .insert({
        user_id: context.userId,
        scope: data.scope,
        shop_id: data.shopId,
        file_name: data.fileName,
        status: "preview",
        summary: summary as any,
        errors: errors as any,
        rows: rows as any,
        image_map: imageMap as any,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { importId: (ins as any).id, summary, errors, rows, imageIds };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Commit

const CommitInput = z.object({ importId: z.string().uuid() });

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CommitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: imp, error: gErr } = await supabaseAdmin
      .from("product_imports")
      .select("*")
      .eq("id", data.importId)
      .maybeSingle();
    if (gErr || !imp) throw new Error("Import introuvable");
    const row = imp as any;
    await assertCanWriteShop(context.userId, row.shop_id, row.scope);
    if (row.status !== "preview") throw new Error("Import déjà appliqué ou annulé");

    const rows = (row.rows ?? []) as ParsedRow[];
    const imageMap = (row.image_map ?? {}) as Record<string, string>;
    const isAdmin = row.scope === "admin";

    const { data: allCats } = await supabaseAdmin
      .from("categories")
      .select("id, name, parent_id, level");

    const catByName = new Map<string, any>();

    for (const c of (allCats ?? []) as any[]) {
      catByName.set(c.name.toLowerCase(), c);
    }

    function slugifyCat(s: string) {
      return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    async function getOrCreateCategory(
      name: string,
      level: number,
      parentId: string | null
    ) {
      const key = name.toLowerCase().trim();
      const existing = catByName.get(key);

      if (existing) return existing.id;

      const { data: created, error } = await supabaseAdmin
  .from("categories")
  .insert({
    name: name.trim(),
    level,
    parent_id: parentId,
  })
  .select("id, name, parent_id, level")
  .single();

      if (error) throw new Error(error.message);

      catByName.set(key, created);

      return created.id;
    }

    async function resolveCategoryId(parent?: ParsedRow) {
      if (!parent) return null;

      let level1Id: string | null = null;
      let level2Id: string | null = null;
      let level3Id: string | null = null;

      if (parent.category) {
        level1Id = await getOrCreateCategory(parent.category, 1, null);
      }

      if (parent.subCategory) {
        level2Id = await getOrCreateCategory(parent.subCategory, 2, level1Id);
      }

      if (parent.subSubCategory) {
        level3Id = await getOrCreateCategory(parent.subSubCategory, 3, level2Id);
      }

      return level3Id ?? level2Id ?? level1Id;
    }

    const groups = new Map<string, ParsedRow[]>();
    for (const r of rows) {
      if (r.action === "ignore") continue;
      const list = groups.get(r.productCode) ?? [];
      list.push(r);
      groups.set(r.productCode, list);
    }

    const log: { code: string; ok: boolean; message?: string }[] = [];

    for (const [code, group] of groups.entries()) {
      try {
        const parent = group.find((g) => g.type === "parent");
        const variants = group.filter((g) => g.type === "variant");

        const { data: existing } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("vendor_id", row.shop_id)
          .eq("code", code)
          .maybeSingle();
        let productId = (existing as any)?.id as string | undefined;

        const categoryId = await resolveCategoryId(parent);

        if (parent && parent.action === "delete" && productId) {
          await supabaseAdmin.from("products").delete().eq("id", productId);
          log.push({ code, ok: true, message: "Supprimé" });
          continue;
        }

        if (!productId && parent && parent.action !== "delete") {
          const { data: created, error: cErr } = await supabaseAdmin
            .from("products")
            .insert({
              vendor_id: row.shop_id,
              code,
              name: parent.name ?? code,
              designation: parent.designation ?? null,
              description: parent.description ?? null,
              category_id: categoryId,
              price: parent.displayPrice ?? 0,
              status: isAdmin ? (parent.status as any) ?? "approved" : "pending",
              is_active: true,
            })
            .select("id")
            .single();
          if (cErr) throw new Error(cErr.message);
          productId = (created as any).id;
        } else if (productId && parent && parent.action === "update") {
          const patch: any = {};
          if (parent.name) patch.name = parent.name;
          if (parent.designation !== undefined) patch.designation = parent.designation;
          if (parent.description !== undefined) patch.description = parent.description;
          if (categoryId) patch.category_id = categoryId;
          if (parent.displayPrice !== undefined) patch.price = parent.displayPrice;
          if (isAdmin && parent.status) patch.status = parent.status;
          if (Object.keys(patch).length) {
            await supabaseAdmin.from("products").update(patch).eq("id", productId);
          }
        }

        if (!productId) {
          log.push({ code, ok: false, message: "Produit introuvable et pas de ligne parent create" });
          continue;
        }

        if (parent && parent.productImages.length) {
          const urls = parent.productImages.map((id) => imageMap[id]).filter(Boolean);
          if (urls.length) {
            await supabaseAdmin.from("product_images").delete().eq("product_id", productId);
            await supabaseAdmin.from("product_images").insert(
              urls.map((url, idx) => ({ product_id: productId, url, position: idx })),
            );
          }
        }

        for (const v of variants) {
          if (v.action === "delete" && v.variantCode) {
            await supabaseAdmin.from("product_variants").delete().eq("id", v.variantCode).eq("product_id", productId);
            continue;
          }
          const color = v.options.find((o) => /couleur|color/i.test(o.name))?.value ?? null;
          const size = v.options.find((o) => /taille|size/i.test(o.name))?.value ?? null;
          const imageUrl = v.variantImage ? imageMap[v.variantImage] ?? null : null;
          const payload: any = {
            product_id: productId,
            color,
            size,
            price_override: v.variantPrice ?? null,
            stock: v.stock ?? 0,
            image_url: imageUrl,
          };
          if (v.action === "update" && v.variantCode && /^[0-9a-f-]{36}$/i.test(v.variantCode)) {
            await supabaseAdmin.from("product_variants").update(payload).eq("id", v.variantCode);
          } else {
            await supabaseAdmin.from("product_variants").insert(payload);
          }
        }

        log.push({ code, ok: true });
      } catch (e) {
        log.push({ code, ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }

    await supabaseAdmin
      .from("product_imports")
      .update({
        status: "committed",
        committed_at: new Date().toISOString(),
        errors: log as any,
      })
      .eq("id", data.importId);

    return { ok: true, log };
  });

// ─────────────────────────────────────────────────────────────────────────────
// History

export const listImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ shopId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = supabaseAdmin
      .from("product_imports")
      .select("id, file_name, status, summary, created_at, committed_at, shop_id, scope")
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) q = q.eq("user_id", context.userId);
    if (data.shopId) q = q.eq("shop_id", data.shopId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
