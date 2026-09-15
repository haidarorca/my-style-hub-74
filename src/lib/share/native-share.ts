// ═══════════════════════════════════════════════════════════════
// Partage NATIF d'un fichier image (Web Share API niveau 2).
//
// Pourquoi : une Story / un Statut WhatsApp, Instagram ou Facebook
// n'affiche PAS l'aperçu d'un lien — il faut envoyer une VRAIE image.
// La seule façon d'y parvenir depuis le web est `navigator.share({ files })`,
// supporté par Chrome/Android et Safari iOS 15+.
//
// Repli automatique si indisponible : téléchargement du visuel puis
// ouverture de l'application, avec la légende déjà copiée.
// ═══════════════════════════════════════════════════════════════

import { downloadBlob, safeFilename } from "./download";

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    const probe = new File([new Blob([new Uint8Array([0])], { type: "image/png" })], "p.png", {
      type: "image/png",
    });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export interface ShareImageOptions {
  blob: Blob;
  filenameBase: string;
  caption: string;
  /** Ouverte en dernier recours quand le partage natif est indisponible. */
  fallbackUrl?: string;
}

export type ShareImageResult = "shared" | "cancelled" | "downloaded";

export async function shareImageFile({
  blob,
  filenameBase,
  caption,
  fallbackUrl,
}: ShareImageOptions): Promise<ShareImageResult> {
  const filename = `${safeFilename(filenameBase)}.png`;

  if (canShareFiles()) {
    const file = new File([blob], filename, { type: "image/png" });
    try {
      // Pas d'`url` : certaines apps ignorent le fichier si une URL est fournie.
      await (navigator as Navigator).share({ files: [file], text: caption } as ShareData);
      return "shared";
    } catch (err: unknown) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError") return "cancelled";
      // NotAllowedError / DataError → repli téléchargement
    }
  }

  try {
    await navigator.clipboard.writeText(caption);
  } catch {
    /* presse-papier indisponible : pas bloquant */
  }
  downloadBlob(blob, filename);
  if (fallbackUrl) {
    setTimeout(() => window.open(fallbackUrl, "_blank", "noopener,noreferrer"), 500);
  }
  return "downloaded";
}
