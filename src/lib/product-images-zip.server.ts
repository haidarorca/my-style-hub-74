import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

export interface ZipImportReport {
  imported: number;
  skippedDuplicates: number;
  ignoredFiles: string[];
  unmatched: { file: string; code: string }[];
  errors: { file: string; message: string }[];
  productsTouched: number;
}

export interface ZipExportResult {
  base64: string;
  fileName: string;
  mime: string;
  products: number;
  images: number;
  missing: string[];
}

export async function assertShopAccess(
  userId: string,
  shopId: string,
  scope: "vendor" | "admin",
) {
  if (scope === "admin") {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin"]);
    if (!data || data.length === 0) throw new Error("Accès refusé : admin requis");
    return;
  }
  if (shopId !== userId) {
    throw new Error("Accès refusé : vous ne pouvez gérer que votre boutique");
  }
}

function extOf(name: string) {
  return (name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
}

function mimeOf(ext: string) {
  if (ext === "jpg") return "image/jpeg";
  return `image/${ext}`;
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Convention de nommage stable (export ↔ réimport) :
 *   <CODE_PRODUIT>/<CODE_PRODUIT>_01.jpg
 * Les fichiers à plat `<CODE>_01.jpg` ou `<CODE>-2.png` sont aussi acceptés.
 */
function codeFromEntry(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  const base = parts.pop() ?? "";
  const folder = parts.pop();
  if (folder && folder !== "images" && folder !== "__MACOSX") return folder.trim();
  const stem = base.replace(/\.[^.]+$/, "");
  const m = stem.match(/^(.*?)[-_]\d+$/);
  return (m?.[1] ?? stem).trim() || null;
}

export async function importImagesZip(params: {
  shopId: string;
  zipBase64: string;
}): Promise<ZipImportReport> {
  const report: ZipImportReport = {
    imported: 0,
    skippedDuplicates: 0,
    ignoredFiles: [],
    unmatched: [],
    errors: [],
    productsTouched: 0,
  };

  const zip = await JSZip.loadAsync(Buffer.from(params.zipBase64, "base64"));
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && !f.name.includes("__MACOSX") && !f.name.split("/").pop()!.startsWith("."),
  );

  const wanted = new Map<string, { name: string; file: JSZip.JSZipObject }[]>();

  for (const f of entries) {
    const ext = extOf(f.name);
    if (!IMAGE_EXT.includes(ext)) {
      report.ignoredFiles.push(f.name);
      continue;
    }
    const code = codeFromEntry(f.name);
    if (!code) {
      report.ignoredFiles.push(f.name);
      continue;
    }
    const list = wanted.get(code) ?? [];
    list.push({ name: f.name, file: f });
    wanted.set(code, list);
  }

  if (wanted.size === 0) return report;

  const codes = Array.from(wanted.keys());
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, code")
    .eq("vendor_id", params.shopId)
    .in("code", codes);

  const byCode = new Map<string, string>();
  for (const p of (products ?? []) as { id: string; code: string | null }[]) {
    if (p.code) byCode.set(p.code, p.id);
  }

  const touched = new Set<string>();

  for (const [code, files] of wanted) {
    const productId = byCode.get(code);
    if (!productId) {
      files.forEach((f) => report.unmatched.push({ file: f.name, code }));
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from("product_images")
      .select("url, position")
      .eq("product_id", productId);

    const existingUrls = new Set(((existing ?? []) as { url: string }[]).map((r) => r.url));
    let position = ((existing ?? []) as { position: number | null }[]).reduce(
      (m, r) => Math.max(m, (r.position ?? 0) + 1),
      0,
    );

    for (const { name, file } of files.sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const ext = extOf(name);
        const base = slug(name.split("/").pop()!.replace(/\.[^.]+$/, ""));
        const path = `zip-imports/${productId}/${base}.${ext}`;

        const buf = await file.async("uint8array");
        const { error: upErr } = await supabaseAdmin.storage
          .from("product-images")
          .upload(path, buf, { contentType: mimeOf(ext), upsert: true });
        if (upErr) throw new Error(upErr.message);

        const { data: pub } = supabaseAdmin.storage
          .from("product-images")
          .getPublicUrl(path);

        if (existingUrls.has(pub.publicUrl)) {
          report.skippedDuplicates++;
          continue;
        }

        const { error: insErr } = await supabaseAdmin.from("product_images").insert({
          product_id: productId,
          url: pub.publicUrl,
          position: position++,
        });
        if (insErr) throw new Error(insErr.message);

        existingUrls.add(pub.publicUrl);
        report.imported++;
        touched.add(productId);
      } catch (e) {
        report.errors.push({ file: name, message: (e as Error).message });
      }
    }
  }

  report.productsTouched = touched.size;
  return report;
}

export async function exportImagesZip(params: {
  shopId: string;
  productIds?: string[];
}): Promise<ZipExportResult> {
  let query = supabaseAdmin
    .from("products")
    .select("id, code, name, product_images(url, position)")
    .eq("vendor_id", params.shopId)
    .limit(2000);

  if (params.productIds?.length) query = query.in("id", params.productIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const zip = new JSZip();
  const missing: string[] = [];
  let images = 0;
  let products = 0;

  for (const p of (data ?? []) as any[]) {
    const code: string = p.code || slug(p.name ?? p.id);
    const list = (p.product_images ?? [])
      
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

    if (list.length === 0) continue;
    products++;
    const folder = zip.folder(code)!;

    for (let i = 0; i < list.length; i++) {
      const url: string = list[i].url;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        const ext = IMAGE_EXT.includes(extOf(url.split("?")[0]!))
          ? extOf(url.split("?")[0]!)
          : "jpg";
        folder.file(`${code}_${String(i + 1).padStart(2, "0")}.${ext}`, buf);
        images++;
      } catch {
        missing.push(url);
      }
    }
  }

  const base64 = await zip.generateAsync({ type: "base64", compression: "STORE" });

  return {
    base64,
    fileName: `images-produits-${new Date().toISOString().slice(0, 10)}.zip`,
    mime: "application/zip",
    products,
    images,
    missing,
  };
}
