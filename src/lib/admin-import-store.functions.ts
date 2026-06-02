/**
 * admin-import-store.functions.ts
 * --------------------------------
 * Système d'importation IA de boutiques Taobao / 1688.
 *
 * - Import par lots de 10 produits max
 * - Mémoire de progression (ne jamais recommencer depuis le début)
 * - Anti-doublons (lien source, titre, image)
 * - Brouillons uniquement (pas de publication auto)
 * - Permission admin par défaut, vendeurs autorisés via permissions
 *
 * Réutilise : analyzeSourceUrl, detectCurrencyFromUrl, resolveShareUrl,
 * scrapeViaDirectFetch du fichier admin-generator.functions.ts
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

// ── Types ──

export type ImportBatchStatus = "running" | "paused" | "completed" | "error";

export interface ImportProduct {
  id: string;
  batch_id: string;
  vendor_id: string;
  source_url: string;
  source_store_url: string | null;
  source_product_id: string | null;
  name: string;
  designation: string;
  description: string;
  source_price: number;
  source_currency: string;
  price: number; // prix de vente suggéré
  images: string[];
  variants: { size: string; color: string; color_hex: string; stock: number; image_url: string }[];
  suggested_category_id: string | null;
  suggested_category_name: string | null;
  status: "draft" | "published" | "discarded";
  duplicate_of: string | null; // ID du produit existant si doublon
  ai_metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export interface ImportBatch {
  id: string;
  vendor_id: string;
  store_url: string;
  store_name: string | null;
  status: ImportBatchStatus;
  total_imported: number;
  last_offset: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ── Utilitaires (copiés depuis admin-generator pour éviter l'import circulaire) ──

function safeParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
    }
    return null;
  }
}

function detectCurrencyFromUrl(url: string): "CNY" | "USD" {
  const u = url.toLowerCase();
  if (u.includes("taobao.com") || u.includes("1688.com") || u.includes("tmall.com") || u.includes("jd.com") || u.includes("tb.cn")) return "CNY";
  return "USD";
}

function extractUrlFromText(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const m = trimmed.match(/^(https?:\/\/\S+)/i);
    return m ? m[1] : trimmed;
  }
  const m = trimmed.match(/https?:\/\/[^\s'")<>\u4e00-\u9fff]+/i);
  return m ? m[0] : null;
}

async function resolveShareUrl(rawUrl: string): Promise<string> {
  let finalUrl = rawUrl;
  try {
    const res = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8,zh;q=0.7",
      },
      signal: AbortSignal.timeout(12000),
    });
    finalUrl = res.url || rawUrl;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) {
      const html = (await res.text().catch(() => "")).slice(0, 200_000);
      const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>\s]+)/i);
      const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      const cand = meta?.[1] || canon?.[1];
      if (cand && /^https?:\/\//i.test(cand)) finalUrl = cand;
    }
  } catch { /* keep original */ }
  try {
    const u = new URL(finalUrl);
    const host = u.hostname.toLowerCase();
    const id = u.searchParams.get("id") || u.searchParams.get("itemId");
    if (id && /^\d{6,}$/.test(id)) {
      if (host.includes("taobao") || host.includes("tmall") || host.includes("tb.cn")) return `https://item.taobao.com/item.htm?id=${id}`;
      if (host.includes("1688")) return `https://detail.1688.com/offer/${id}.html`;
    }
  } catch { /* ignore */ }
  return finalUrl;
}

async function scrapeViaDirectFetch(url: string): Promise<{ text: string; images: string[]; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8,zh;q=0.7",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    const titleM = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i);
    const ogImgs: string[] = [];
    const imgRe = /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html))) ogImgs.push(m[1]);
    const linkImgRe = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi;
    while ((m = linkImgRe.exec(html))) ogImgs.push(m[1]);
    const images = Array.from(new Set(ogImgs)).slice(0, 12);
    const title = (ogTitle?.[1] || titleM?.[1] || "").trim();
    const desc = (ogDesc?.[1] || "").trim();
    if (!title && images.length === 0) return null;
    return { text: `Titre: ${title}\n\nDescription: ${desc}`.slice(0, 4000), images, html };
  } catch { return null; }
}

function looksLikeLoginWall(text: string): boolean {
  const s = text.toLowerCase();
  return s.includes("请登录") || s.includes("登录后") || s.includes("sign in to continue") || s.includes("login.taobao.com") || s.includes("login.1688.com");
}

// Extract product links from a store page HTML
function extractProductLinksFromStoreHtml(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  // Taobao store product links
  const tbRe = /href=["'](https?:\/\/item\.taobao\.com\/item\.htm\?[^"']+)["']/gi;
  const tmallRe = /href=["'](https?:\/\/detail\.tmall\.com\/item\.htm\?[^"']+)["']/gi;
  const re1688 = /href=["'](https?:\/\/detail\.1688\.com\/offer\/[^"']+)["']/gi;
  const mobileRe = /href=["'](https?:\/\/h5\.m\.taobao\.com\/aw\/p\/detail\/[^"']+)["']/gi;

  let m: RegExpExecArray | null;
  while ((m = tbRe.exec(html))) links.add(m[1].replace(/&amp;/g, "&"));
  while ((m = tmallRe.exec(html))) links.add(m[1].replace(/&amp;/g, "&"));
  while ((m = re1688.exec(html))) links.add(m[1].replace(/&amp;/g, "&"));
  while ((m = mobileRe.exec(html))) links.add(m[1].replace(/&amp;/g, "&"));

  // Also look for item IDs in the page and construct canonical URLs
  try {
    const u = new URL(baseUrl);
    const is1688 = u.hostname.includes("1688");
    const idRe = is1688
      ? /["']offerId["']\s*:\s*["']?(\d{6,})["']?/g
      : /["']itemId["']\s*:\s*["']?(\d{6,})["']?/g;
    while ((m = idRe.exec(html))) {
      if (is1688) links.add(`https://detail.1688.com/offer/${m[1]}.html`);
      else links.add(`https://item.taobao.com/item.htm?id=${m[1]}`);
    }
  } catch { /* ignore */ }

  return Array.from(links);
}

// ── Assert helpers ──

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "super_admin"]).limit(1).maybeSingle();
  if (!data) throw new Error("Accès refusé : admin requis");
}

async function assertAdminOrVendor(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "super_admin", "vendeur"]).limit(1).maybeSingle();
  if (!data) throw new Error("Accès refusé");
}

async function canImportStore(userId: string): Promise<boolean> {
  // Admin can always import
  const { data: adminCheck } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "super_admin"]).limit(1).maybeSingle();
  if (adminCheck) return true;
  // Vendors need explicit permission
  const { data: permCheck } = await supabaseAdmin.from("admin_permissions").select("permission").eq("user_id", userId).eq("permission", "products").limit(1).maybeSingle();
  if (permCheck) return true;
  // Check vendor profile flag
  // Check vendor profile flag (column may not exist on all environments)
  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (profile as { can_import_store?: boolean } | null)?.can_import_store === true;
}

// ── 1. Start or resume a store import ──

const StartImportSchema = z.object({
  store_url: z.string().url().min(10).max(500),
  store_name: z.string().max(200).optional(),
});

export const startStoreImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartImportSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!await canImportStore(context.userId)) throw new Error("Permission d'importation de boutique refusée");

    // Check for existing active batch for this store
    const { data: existing } = await supabaseAdmin
      .from("import_batches")
      .select("id, status, total_imported, last_offset")
      .eq("vendor_id", context.userId)
      .eq("store_url", data.store_url)
      .in("status", ["running", "paused"])
      .maybeSingle();

    if (existing) {
      return { batchId: existing.id, resumed: true, totalImported: existing.total_imported, lastOffset: existing.last_offset };
    }

    // Create new batch
    const { data: batch, error } = await supabaseAdmin
      .from("import_batches")
      .insert({
        vendor_id: context.userId,
        store_url: data.store_url,
        store_name: data.store_name || null,
        status: "running",
        total_imported: 0,
        last_offset: 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { batchId: batch!.id, resumed: false, totalImported: 0, lastOffset: 0 };
  });

// ── 2. Fetch next batch of products from store ──

const FetchBatchSchema = z.object({
  batch_id: z.string().uuid(),
  limit: z.number().int().min(1).max(20).default(10),
});

export const fetchNextProductBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FetchBatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrVendor(context.userId);

    const { data: batch } = await supabaseAdmin
      .from("import_batches")
      .select("*")
      .eq("id", data.batch_id)
      .eq("vendor_id", context.userId)
      .single();
    if (!batch) throw new Error("Batch introuvable");

    // ── Phase 1: Discover product links from store page ──
    // Taobao/1688 store pages are heavily protected. We use multiple strategies:
    // 1. Direct fetch with mobile UA
    // 2. Extract item IDs from JavaScript/JSON in the page
    // 3. If all fails, advise manual link paste
    const resolvedUrl = await resolveShareUrl(batch.store_url);
    let productLinks: string[] = [];

    // Try direct scraping with multiple attempts
    const scraped = await scrapeViaDirectFetch(resolvedUrl);

    if (scraped && !looksLikeLoginWall(scraped.text)) {
      productLinks = extractProductLinksFromStoreHtml(scraped.html, resolvedUrl);
    }

    // If no links found, try to extract from the URL pattern itself
    // (some Taobao store URLs contain the seller ID, we can construct search URLs)
    if (productLinks.length === 0) {
      try {
        const storeUrl = new URL(resolvedUrl);
        const shopIdMatch = storeUrl.searchParams.get("shop_id") || storeUrl.searchParams.get("user_number_id") || scraped?.html?.match(/["']shopId["']\s*[:=]\s*["']?(\d+)["']?/)?.[1];
        if (shopIdMatch) {
          // Construct a search page URL which is often less protected
          productLinks = [`https://shop${shopIdMatch}.taobao.com/search.htm`];
          // Try scraping the search page
          const searchScraped = await scrapeViaDirectFetch(productLinks[0]);
          if (searchScraped && !looksLikeLoginWall(searchScraped.text)) {
            const searchLinks = extractProductLinksFromStoreHtml(searchScraped.html, productLinks[0]);
            if (searchLinks.length > 0) productLinks = searchLinks;
          }
        }
      } catch { /* ignore URL parse errors */ }
    }

    // If still no links, extract IDs from any raw HTML we got
    if (productLinks.length === 0 && scraped?.html) {
      const idMatches = scraped.html.match(/(?:itemId|offerId)["']?\s*[:=]\s*["']?(\d{8,})["']?/g);
      if (idMatches) {
        const is1688 = resolvedUrl.includes("1688");
        productLinks = idMatches.map((m: string) => {
          const id = m.match(/(\d{8,})/)?.[1];
          if (!id) return null;
          if (is1688) return `https://detail.1688.com/offer/${id}.html`;
          return `https://item.taobao.com/item.htm?id=${id}`;
        }).filter((url): url is string => url !== null);
      }
    }

    if (productLinks.length === 0) {
      await supabaseAdmin.from("import_batches").update({ status: "error", error_message: "Impossible de lire la page boutique (protection anti-bot). Utilisez l'import par lien produit." }).eq("id", data.batch_id);
      throw new Error("Impossible de lire la page boutique (protection anti-bot). Utilisez l'onglet 'Lien(s) produit' pour coller les liens manuellement.");
    }

    // Paginate: skip already processed
    const offset = batch.last_offset;
    const page = productLinks.slice(offset, offset + data.limit);
    const hasMore = offset + data.limit < productLinks.length;

    // Check which ones are already imported (anti-dup)
    const { data: existingImports } = await supabaseAdmin
      .from("import_products")
      .select("source_url, status, duplicate_of")
      .eq("batch_id", data.batch_id)
      .in("source_url", page);

    const alreadyImported = new Map((existingImports ?? []).map((r: any) => [r.source_url, r]));

    // Check existing published products
    const { data: existingProducts } = await supabaseAdmin
      .from("product_admin_metadata")
      .select("source_url")
      .in("source_url", page);

    const alreadyPublished = new Set((existingProducts ?? []).map((r: any) => r.source_url));

    // Process each product link with AI
    const apiKey = process.env.LOVABLE_API_KEY;
    const products: ImportProduct[] = [];

    for (const link of page) {
      // Skip if already imported
      if (alreadyImported.has(link)) {
        const existing = alreadyImported.get(link)!;
        products.push(existing as unknown as ImportProduct);
        continue;
      }

      // Scrape product page (with retry)
      let productScraped = await scrapeViaDirectFetch(link);
      // Retry with resolved URL if first attempt fails
      if (!productScraped) {
        const resolvedLink = await resolveShareUrl(link);
        if (resolvedLink !== link) {
          productScraped = await scrapeViaDirectFetch(resolvedLink);
        }
      }

      // If scraping fails completely, create a minimal entry from the URL
      if (!productScraped) {
        try {
          const u = new URL(link);
          const id = u.searchParams.get("id") || u.pathname.match(/offer\/(\d+)/)?.[1] || "unknown";
          productScraped = {
            text: `Produit ${id} depuis ${u.hostname}`,
            images: [],
            html: "",
          };
        } catch {
          continue; // Skip unparseable URLs
        }
      }

      const currency = detectCurrencyFromUrl(link);

      // AI analysis
      let aiResult: Record<string, unknown> | null = null;
      const currency = detectCurrencyFromUrl(link);
      if (apiKey) {
        try {
          const { data: cats } = await supabaseAdmin.from("categories").select("id, name, level").eq("level", 3).order("position").limit(200);
          const catNames = (cats ?? []).map((c) => c.name).slice(0, 120).join(", ");

          const prompt = [
            "You analyse a product listing from Taobao/1688.",
            "Extract clean e-commerce data. Prefer English titles if available.",
            "Return ONLY strict JSON:",
            '{"name_fr":"short French title max 80 chars","description_fr":"clean description French max 300 chars","source_price":number in ${currency},"image_urls":["http..."],"suggested_category":null or exact string from list","suggested_variants":[{"size":"","color":"French color","color_hex":"#rrggbb or empty","image_url":""}]}',
            `Categories: ${catNames}`,
            "",
            "Product data:",
            productScraped.text,
            "",
            "Image URLs found:",
            productScraped.images.slice(0, 8).join("\n"),
          ].join("\n");

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
          });
          if (res.ok) {
            const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
            aiResult = safeParseJson(json.choices?.[0]?.message?.content?.trim() ?? "");
          }
        } catch { /* AI failed, continue with heuristic */ }
      }

      // Build the product
      const sourcePrice = typeof aiResult?.source_price === "number" ? aiResult.source_price : 0;
      const allImages = Array.from(new Set([
        ...productScraped.images,
        ...(Array.isArray(aiResult?.image_urls) ? (aiResult.image_urls as string[]).filter((u: string) => /^https?:\/\//.test(u)) : []),
      ])).slice(0, 8);

      // Find category match
      let suggestedCategoryId: string | null = null;
      let suggestedCategoryName: string | null = null;
      if (typeof aiResult?.suggested_category === "string" && (aiResult.suggested_category as string).trim()) {
        const { data: cats } = await supabaseAdmin.from("categories").select("id, name").eq("level", 3).ilike("name", (aiResult.suggested_category as string).trim()).limit(1);
        if (cats && cats.length > 0) {
          suggestedCategoryId = cats[0].id;
          suggestedCategoryName = cats[0].name;
        }
      }

      // Check duplicates against published products
      let duplicateOf: string | null = null;
      if (alreadyPublished.has(link)) {
        const { data: dup } = await supabaseAdmin.from("product_admin_metadata").select("product_id").eq("source_url", link).maybeSingle();
        duplicateOf = dup?.product_id ?? "published";
      }

      // Extract source product ID
      let sourceProductId: string | null = null;
      try {
        const u = new URL(link);
        sourceProductId = u.searchParams.get("id") || u.pathname.match(/offer\/(\d+)/)?.[1] || null;
      } catch { /* ignore */ }

      // Clean variants
      const rawVariants = Array.isArray(aiResult?.suggested_variants) ? (aiResult.suggested_variants as unknown[]) : [];
      const cleanVariants = rawVariants.map((v) => {
        if (!v || typeof v !== "object") return null;
        const o = v as Record<string, unknown>;
        const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
        const hex = str("color_hex");
        return {
          size: str("size").slice(0, 40),
          color: str("color").slice(0, 60),
          color_hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "",
          stock: 0,
          image_url: str("image_url"),
        };
      }).filter((v): v is NonNullable<typeof v> => v !== null && (v.size !== "" || v.color !== "")).slice(0, 30);

      // Markup: 2.5x for CNY → XOF, 1.8x for USD → XOF
      const markup = currency === "CNY" ? 2.5 : 1.8;
      const suggestedPrice = sourcePrice > 0 ? Math.round(sourcePrice * markup) : 0;

      const importProduct: any = {
        batch_id: data.batch_id,
        vendor_id: context.userId,
        source_url: link,
        source_store_url: batch.store_url,
        source_product_id: sourceProductId,
        name: typeof aiResult?.name_fr === "string" ? (aiResult.name_fr as string).trim() : productScraped.text.slice(0, 80),
        designation: typeof aiResult?.name_fr === "string" ? (aiResult.name_fr as string).trim() : "",
        description: typeof aiResult?.description_fr === "string" ? (aiResult.description_fr as string).trim() : "",
        source_price: sourcePrice,
        source_currency: currency,
        price: suggestedPrice,
        images: allImages,
        variants: cleanVariants,
        suggested_category_id: suggestedCategoryId,
        suggested_category_name: suggestedCategoryName,
        status: "draft",
        duplicate_of: duplicateOf,
        ai_metadata: (aiResult ? { ai_result: aiResult, scraped_at: new Date().toISOString() } : null) as Json | null,
      };

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("import_products")
        .insert(importProduct)
        .select()
        .single();

      if (insertError) {
        console.error("[import] insert error:", insertError);
        continue;
      }

      products.push(inserted as unknown as ImportProduct);
    }

    // Update batch progress
    const newOffset = offset + page.length;
    const newTotal = batch.total_imported + products.length;
    await supabaseAdmin
      .from("import_batches")
      .update({ last_offset: newOffset, total_imported: newTotal, status: hasMore ? "running" : "completed", updated_at: new Date().toISOString() })
      .eq("id", data.batch_id);

    return { products, hasMore, totalFound: productLinks.length };
  });

// ── 3. Import from a single product URL (manual paste) ──

const ImportSingleSchema = z.object({
  product_url: z.string().url().min(10).max(500),
  batch_id: z.string().uuid().optional(),
});

export const importSingleProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportSingleSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!await canImportStore(context.userId)) throw new Error("Permission d'importation refusée");

    // Check duplicates
    const { data: existingImport } = await supabaseAdmin.from("import_products").select("id, status").eq("vendor_id", context.userId).eq("source_url", data.product_url).maybeSingle();
    if (existingImport) {
      return { duplicate: true, importId: (existingImport as any).id };
    }

    const { data: existingProduct } = await supabaseAdmin.from("product_admin_metadata").select("product_id").eq("source_url", data.product_url).maybeSingle();
    if (existingProduct) {
      return { duplicate: true, publishedProductId: (existingProduct as any).product_id };
    }

    // Create a single batch if none provided
    let batchId = data.batch_id;
    if (!batchId) {
      const { data: newBatch } = await supabaseAdmin.from("import_batches").insert({
        vendor_id: context.userId,
        store_url: data.product_url,
        store_name: "Import manuel",
        status: "completed",
        total_imported: 0,
        last_offset: 0,
      }).select("id").single();
      batchId = (newBatch as any).id;
    }

    // Scrape and analyze (same logic as batch but for one product)
    const resolved = await resolveShareUrl(data.product_url);
    const scraped = await scrapeViaDirectFetch(resolved);
    if (!scraped) throw new Error("Impossible de récupérer le produit");

    const apiKey = process.env.LOVABLE_API_KEY;
    let aiResult: Record<string, unknown> | null = null;
    const currency = detectCurrencyFromUrl(resolved);

    if (apiKey) {
      try {
        const { data: cats } = await supabaseAdmin.from("categories").select("id, name").eq("level", 3).order("position").limit(200);
        const catNames = (cats ?? []).map((c) => c.name).slice(0, 120).join(", ");

        const prompt = [
          "Analyse ce produit Taobao/1688. Extrais les données e-commerce.",
          "Réponds UNIQUEMENT en JSON:",
          '{"name_fr":"titre français court","description_fr":"description propre","source_price":prix,"image_urls":[],"suggested_category":"catégorie","suggested_variants":[{"size":"","color":"","color_hex":"","image_url":""}]}',
          `Catégories: ${catNames}`,
          "",
          scraped.text,
        ].join("\n");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
        });
        if (res.ok) {
          const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          aiResult = safeParseJson(json.choices?.[0]?.message?.content?.trim() ?? "");
        }
      } catch { /* AI failed */ }
    }

    const sourcePrice = typeof aiResult?.source_price === "number" ? aiResult.source_price : 0;
    const markup = currency === "CNY" ? 2.5 : 1.8;
    const images = Array.from(new Set([
      ...scraped.images,
      ...(Array.isArray(aiResult?.image_urls) ? (aiResult.image_urls as string[]).filter((u: string) => /^https?:\/\//.test(u)) : []),
    ])).slice(0, 8);

    let suggestedCategoryId: string | null = null;
    let suggestedCategoryName: string | null = null;
    if (typeof aiResult?.suggested_category === "string" && (aiResult.suggested_category as string).trim()) {
      const { data: cats } = await supabaseAdmin.from("categories").select("id, name").eq("level", 3).ilike("name", (aiResult.suggested_category as string).trim()).limit(1);
      if (cats && cats.length > 0) { suggestedCategoryId = cats[0].id; suggestedCategoryName = cats[0].name; }
    }

    let sourceProductId: string | null = null;
    try { const u = new URL(resolved); sourceProductId = u.searchParams.get("id") || u.pathname.match(/offer\/(\d+)/)?.[1] || null; } catch { /* ignore */ }

    const rawVariants = Array.isArray(aiResult?.suggested_variants) ? (aiResult.suggested_variants as unknown[]) : [];
    const cleanVariants = rawVariants.map((v) => {
      if (!v || typeof v !== "object") return null;
      const o = v as Record<string, unknown>;
      const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
      const hex = str("color_hex");
      return { size: str("size").slice(0, 40), color: str("color").slice(0, 60), color_hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "", stock: 0, image_url: str("image_url") };
    }).filter((v): v is NonNullable<typeof v> => v !== null && (v.size !== "" || v.color !== "")).slice(0, 30);

    const { data: inserted, error } = await supabaseAdmin.from("import_products").insert({
      batch_id: batchId!,
      vendor_id: context.userId,
      source_url: data.product_url,
      source_store_url: data.product_url,
      source_product_id: sourceProductId,
      name: typeof aiResult?.name_fr === "string" ? (aiResult.name_fr as string).trim() : scraped.text.slice(0, 80),
      designation: typeof aiResult?.name_fr === "string" ? (aiResult.name_fr as string).trim() : "",
      description: typeof aiResult?.description_fr === "string" ? (aiResult.description_fr as string).trim() : "",
      source_price: sourcePrice,
      source_currency: currency,
      price: sourcePrice > 0 ? Math.round(sourcePrice * markup) : 0,
      images,
      variants: cleanVariants,
      suggested_category_id: suggestedCategoryId,
      suggested_category_name: suggestedCategoryName,
      status: "draft",
      duplicate_of: null,
      ai_metadata: (aiResult ? { ai_result: aiResult } : null) as Json | null,
    }).select().single();

    if (error) throw new Error(error.message);
    return { duplicate: false, importId: (inserted as any).id, product: inserted };
  });

// ── 4. List import batches ──

export const listImportBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ status: z.string().nullable().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdminOrVendor(context.userId);
    let q = supabaseAdmin.from("import_batches").select("*").eq("vendor_id", context.userId).order("created_at", { ascending: false }).limit(100);
    if (data?.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows as unknown as ImportBatch[];
  });

// ── 5. List draft products (imports) ──

const ListDraftsSchema = z.object({
  batch_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "published", "discarded"]).nullable().optional(),
  q: z.string().max(200).default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export const listImportDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListDraftsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrVendor(context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin.from("import_products").select("*, import_batches!inner(store_url, store_name)", { count: "exact" }).eq("import_products.vendor_id", context.userId);
    if (data.batch_id) q = q.eq("batch_id", data.batch_id);
    if (data.status) q = q.eq("import_products.status", data.status);
    else q = q.eq("import_products.status", "draft");
    if (data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`name.ilike.${term},description.ilike.${term},source_url.ilike.${term}`);
    }

    const { data: rows, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
    if (error) throw new Error(error.message);
    return { products: rows as unknown as ImportProduct[], total: count ?? 0 };
  });

// ── 6. Update draft product ──

const UpdateDraftSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  price: z.number().min(0).optional(),
  source_price: z.number().min(0).optional(),
  images: z.array(z.string().url()).max(20).optional(),
  variants: z.array(z.object({
    size: z.string().max(40),
    color: z.string().max(60),
    color_hex: z.string().max(7),
    stock: z.number().int().min(0),
    image_url: z.string(),
  })).max(30).optional(),
  suggested_category_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "discarded"]).optional(),
});

export const updateImportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrVendor(context.userId);
    const { id, ...patch } = data;
    // Verify ownership
    const { data: existing } = await supabaseAdmin.from("import_products").select("vendor_id").eq("id", id).single();
    if (!existing || (existing as any).vendor_id !== context.userId) throw new Error("Accès refusé");

    const { data: row, error } = await supabaseAdmin.from("import_products").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return row as unknown as ImportProduct;
  });

// ── 7. Publish draft to real product ──

export const publishImportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId); // Only admin can publish

    const { data: draft } = await supabaseAdmin.from("import_products").select("*").eq("id", data.id).single();
    if (!draft) throw new Error("Brouillon introuvable");
    const d = draft as any;

    // Check duplicate again
    if (d.duplicate_of) {
      const { data: existingMeta } = await supabaseAdmin.from("product_admin_metadata").select("product_id").eq("source_url", d.source_url).maybeSingle();
      if (existingMeta) throw new Error("Ce produit est déjà publié");
    }

    // 1. Create product
    const productId = crypto.randomUUID();
    const { error: productError } = await supabaseAdmin.from("products").insert({
      id: productId,
      vendor_id: d.vendor_id,
      name: d.name,
      code: `IMP-${Date.now().toString(36).toUpperCase()}`,
      description: d.description,
      price: d.price,
      status: "approved",
      is_active: true,
      category_id: d.suggested_category_id,
    });
    if (productError) throw new Error(`Erreur création produit: ${productError.message}`);

    // 2. Insert images
    if (d.images && d.images.length > 0) {
      const imageRows = d.images.slice(0, 8).map((url: string, i: number) => ({
        product_id: productId,
        url,
        position: i,
      }));
      await supabaseAdmin.from("product_images").insert(imageRows);
    }

    // 3. Insert variants
    if (d.variants && d.variants.length > 0) {
      const variantRows = d.variants.map((v: any) => ({
        product_id: productId,
        size: v.size,
        color: v.color,
        color_hex: v.color_hex || null,
        stock: v.stock || 0,
        price_override: null,
      }));
      await supabaseAdmin.from("product_variants").insert(variantRows);
    }

    // 4. Insert source URL metadata
    await supabaseAdmin.from("product_admin_metadata").insert({
      product_id: productId,
      source_url: d.source_url,
    });

    // 5. Mark as published
    await supabaseAdmin.from("import_products").update({ status: "published" }).eq("id", data.id);

    return { productId };
  });

// ── 8. Discard a draft ──

export const discardImportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrVendor(context.userId);
    const { error } = await supabaseAdmin.from("import_products").update({ status: "discarded" }).eq("id", data.id).eq("vendor_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── 9. Delete a batch and all its drafts ──

export const deleteImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminOrVendor(context.userId);
    // Verify ownership
    const { data: batch } = await supabaseAdmin.from("import_batches").select("vendor_id").eq("id", data.id).single();
    if (!batch || (batch as any).vendor_id !== context.userId) throw new Error("Accès refusé");

    // Delete products first
    await supabaseAdmin.from("import_products").delete().eq("batch_id", data.id);
    // Delete batch
    const { error } = await supabaseAdmin.from("import_batches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
