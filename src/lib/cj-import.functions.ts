// ═══════════════════════════════════════════════════════════════
// Import CJdropshipping — UN produit à la fois (test).
//
// Règles :
//  • Le produit est créé en BROUILLON (status pending, is_active false).
//  • Aucun prix de vente inventé : prix = 0, seul le coût CJ est enregistré.
//  • Le stock CJ n'est PAS versé dans le stock local (stock local = 0).
//  • Aucune catégorie devinée : mapping CJ → KawZone laissé « en attente ».
//  • Idempotent : un même CJ Product ID ne crée jamais un second produit.
// ═══════════════════════════════════════════════════════════════
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CjCallTrace } from "@/lib/cj/client.server";
import type { MediaStats } from "@/lib/cj/media.server";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Accès réservé aux administrateurs.");
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
/** grammes → kilogrammes */
const gToKg = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.round((n / 1000) * 1e6) / 1e6;
};
/** millimètres → centimètres */
const mmToCm = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.round((n / 10) * 1e4) / 1e4;
};
/** CBM = L(m) × l(m) × h(m), à partir de millimètres */
const cbmFromMm = (l: unknown, w: unknown, h: unknown) => {
  const a = num(l), b = num(w), c = num(h);
  if (a === null || b === null || c === null) return null;
  return Math.round((a / 1000) * (b / 1000) * (c / 1000) * 1e9) / 1e9;
};

// L'orientation taille / couleur est déduite des valeurs réelles CJ
// (voir src/lib/cj/variant-options.ts) — jamais de l'ordre supposé.
import { parseVariantKey as splitVariantKey } from "@/lib/cj/variant-options";

export interface CjImportReport {
  ok: boolean;
  action: "created" | "updated" | "duplicate" | "error";
  error: string | null;
  cjProductId: string | null;
  productId: string | null;
  productName: string | null;
  cjSku: string | null;
  cjCategory: string | null;
  categoryMapping: string;
  /** Chaîne KawZone attribuée : catégorie › sous-catégorie › sous-sous-catégorie. */
  kawzoneCategoryChain: string[];
  /** Niveaux CJ sans équivalent KawZone. */
  categoryUnresolved: string[];
  variantsTotal: number;
  variantsImported: number;
  images: number;
  media: { detected: number; uploaded: number; reused: number; failed: number; errors: string[] };
  variantImages: number;
  storageUrlPrefix: string | null;
  publicCleanCheck: { clean: boolean; offenders: string[] };
  apiCalls: number;
  pointsUsed: number | null;
  pointsRemaining: number | null;
  missing: string[];
  variants: Array<{
    vid: string;
    sku: string | null;
    barcode: string | null;
    name: string | null;
    size: string | null;
    color: string | null;
    costPrice: number | null;
    currency: string;
    cjStock: number | null;
    warehouse: string | null;
    weightKg: number | null;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    cbm: number | null;
    image: string | null;
  }>;
}

/**
 * Importe (ou synchronise) UN produit CJ en brouillon.
 * Délègue au cœur partagé avec le worker d'arrière-plan.
 */
export const importCjProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pid: string; update?: boolean; withStock?: boolean; syncParts?: string[] }) => ({
    pid: String(input?.pid ?? "").trim(),
    update: !!input?.update,
    withStock: !!input?.withStock,
    syncParts: Array.isArray(input?.syncParts) ? input.syncParts.map(String) : [],
  }))
  .handler(async ({ context, data }): Promise<CjImportReport> => {
    await assertAdmin(context);
    if (!data.pid) throw new Error("Identifiant produit CJ manquant.");
    const { runCjProductImport } = await import("@/lib/cj/import-core.server");
    const traces: CjCallTrace[] = [];
    const r = await runCjProductImport({
      pid: data.pid,
      mode: data.update ? "sync" : "import",
      syncParts: data.syncParts as any,
      withStock: data.withStock,
      userId: context.userId,
      traces,
    });
    const last = [...traces].reverse().find((t) => t.pointsRemaining !== null);
    const rep = r.report;
    const action: CjImportReport["action"] =
      r.status === "SUCCESS" ? "created" : r.status === "SYNCED" ? "updated"
      : r.status === "ALREADY_EXISTS" ? "duplicate" : "error";
    return {
      ok: r.status === "SUCCESS" || r.status === "SYNCED",
      action,
      error: r.status === "ALREADY_EXISTS"
        ? "Produit CJ déjà importé — utilisez « Synchroniser » pour le mettre à jour."
        : r.error,
      cjProductId: data.pid,
      productId: r.productId,
      productName: rep.productName ?? null,
      cjSku: rep.cjSku ?? null,
      cjCategory: rep.cjCategory ?? null,
      categoryMapping: rep.categoryMapping,
      kawzoneCategoryChain: rep.kawzoneCategoryChain,
      categoryUnresolved: rep.categoryUnresolved,
      variantsTotal: rep.variantsTotal,
      variantsImported: rep.variantsImported,
      images: rep.images,
      media: rep.media,
      variantImages: rep.variantImages,
      storageUrlPrefix: null,
      publicCleanCheck: rep.publicCleanCheck,
      apiCalls: traces.length,
      pointsUsed: last?.pointsUsedToday ?? null,
      pointsRemaining: last?.pointsRemaining ?? null,
      missing: r.missing,
      variants: (rep.variants ?? []).map((v: any) => ({
        vid: v.vid, sku: v.sku, barcode: v.barcode, name: null, size: v.size, color: v.color,
        costPrice: v.costPrice, currency: "USD", cjStock: v.cjStock, warehouse: null,
        weightKg: v.weightKg, lengthCm: v.lengthCm, widthCm: v.widthCm, heightCm: v.heightCm,
        cbm: v.cbm, image: v.image,
      })),
    };
  });
