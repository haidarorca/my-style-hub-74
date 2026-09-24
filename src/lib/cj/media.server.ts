// ═══════════════════════════════════════════════════════════════
// Rapatriement des médias fournisseur — SERVEUR UNIQUEMENT
//
// Aucune image fournisseur ne doit rester chargée depuis un domaine
// externe : chaque image est téléchargée puis servie depuis le
// stockage KawZone (bucket public « product-images »).
// ═══════════════════════════════════════════════════════════════
import { createHash } from "crypto";

export const SUPPLIER_HOST_PATTERN = /cjdropshipping|cjdropship\.com/i;
const BUCKET = "product-images";

export interface MediaStats {
  detected: number;
  uploaded: number;
  reused: number;
  failed: number;
  errors: string[];
}

export function newMediaStats(): MediaStats {
  return { detected: 0, uploaded: 0, reused: 0, failed: 0, errors: [] };
}

function extFromUrl(url: string): string {
  const clean = url.split("?")[0] ?? url;
  const m = /\.(jpe?g|png|webp|gif|avif|bmp)$/i.exec(clean);
  return (m?.[1] ?? "jpg").toLowerCase();
}

function contentTypeFor(ext: string) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  return "image/jpeg";
}

/**
 * Télécharge une image externe dans le stockage KawZone.
 * Le chemin est déterministe (empreinte de l'URL source) : une même image
 * n'est jamais téléchargée deux fois.
 */
export async function mirrorImage(
  sourceUrl: string,
  stats: MediaStats,
  cache: Map<string, string>,
): Promise<string | null> {
  const url = sourceUrl.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  stats.detected += 1;

  const cached = cache.get(url);
  if (cached) {
    stats.reused += 1;
    return cached;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const storage = (supabaseAdmin as any).storage.from(BUCKET);
  const ext = extFromUrl(url);
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 40);
  const path = `supplier/${hash.slice(0, 2)}/${hash}.${ext}`;
  const publicUrl: string = storage.getPublicUrl(path).data.publicUrl;

  // Déjà présent dans le stockage ? Vérification légère (HEAD sur l'URL
  // publique) au lieu d'un listing de dossier : aucune re-téléchargement.
  try {
    const h = await fetch(publicUrl, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
    if (h.ok) {
      cache.set(url, publicUrl);
      stats.reused += 1;
      return publicUrl;
    }
  } catch { /* on tente le téléchargement */ }

  // Deux essais : un échec ponctuel du fournisseur ne fait pas perdre l'image.
  let lastErr = "erreur";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 100) throw new Error("fichier vide");
      const { error } = await storage.upload(path, buf, { contentType: contentTypeFor(ext), upsert: true });
      if (error) throw new Error(error.message);
      cache.set(url, publicUrl);
      stats.uploaded += 1;
      return publicUrl;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "erreur";
      if (/HTTP 4\d\d/.test(lastErr)) break;
    }
  }
  stats.failed += 1;
  stats.errors.push(`${url} : ${lastErr}`);
  return null;
}

/**
 * Rapatrie plusieurs images en parallèle (concurrence limitée).
 * Les doublons d'URL ne sont traités qu'une fois. Renvoie URL source → URL KawZone (ou null).
 */
export async function mirrorMany(
  urls: string[],
  stats: MediaStats,
  cache: Map<string, string>,
  concurrency = 6,
): Promise<Map<string, string | null>> {
  const uniq = [...new Set(urls.map((u) => (u ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string | null>();
  let i = 0;
  const worker = async () => {
    while (i < uniq.length) {
      const u = uniq[i++]!;
      out.set(u, await mirrorImage(u, stats, cache));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, uniq.length) }, worker));
  return out;
}

/**
 * Nettoie une description HTML fournisseur :
 *  • chaque <img> est rapatriée dans le stockage KawZone ;
 *  • les images non rapatriables sont retirées ;
 *  • les liens et attributs pointant vers le fournisseur sont supprimés ;
 *  • le texte et la mise en forme utile sont conservés.
 */
export async function sanitizeSupplierHtml(
  html: string | null | undefined,
  stats: MediaStats,
  cache: Map<string, string>,
): Promise<string | null> {
  if (!html || typeof html !== "string") return null;
  let out = html;

  // 1. Images : rapatriement un par un.
  const imgTags = out.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    const src =
      /\bsrc\s*=\s*"([^"]+)"/i.exec(tag)?.[1] ??
      /\bsrc\s*=\s*'([^']+)'/i.exec(tag)?.[1] ??
      /\bdata-src\s*=\s*"([^"]+)"/i.exec(tag)?.[1] ??
      null;
    if (!src) {
      out = out.replace(tag, "");
      continue;
    }
    const hosted = await mirrorImage(src, stats, cache);
    if (!hosted) {
      out = out.replace(tag, "");
      continue;
    }
    out = out.replace(tag, `<img src="${hosted}" style="max-width:100%;" />`);
  }

  // 2. Liens et balises média externes restants.
  out = out.replace(/<a\b[^>]*>|<\/a>/gi, "");
  out = out.replace(/<(script|iframe|video|source|link)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  out = out.replace(/<(script|iframe|video|source|link)\b[^>]*\/?>/gi, "");

  // 3. Garde-fou : toute balise contenant encore une référence fournisseur est retirée.
  out = out.replace(/<[^>]+>/g, (tag) => (SUPPLIER_HOST_PATTERN.test(tag) ? "" : tag));
  // 4. Références fournisseur restées en texte brut.
  out = out.replace(/https?:\/\/[^\s"'<>]*cjdropshipping[^\s"'<>]*/gi, "");
  out = out.replace(/cjdropshipping(\.com)?/gi, "");

  out = out.replace(/(\s|&nbsp;){2,}/g, " ").trim();
  return out || null;
}

/** Vrai si la valeur contient encore une référence au fournisseur. */
export function containsSupplierRef(value: unknown): boolean {
  return typeof value === "string" && SUPPLIER_HOST_PATTERN.test(value);
}
