// ═══════════════════════════════════════════════════════════════
// Helpers pour rendre un noeud DOM en PNG téléchargeable.
// ═══════════════════════════════════════════════════════════════

import { toBlob } from "html-to-image";

// html-to-image laisse le navigateur peindre (supporte oklch/lab, contrairement à html2canvas).
export async function nodeToBlob(node: HTMLElement, scale = 2): Promise<Blob> {
  const blob = await toBlob(node, { pixelRatio: scale, cacheBust: true });
  if (!blob) throw new Error("Blob generation failed");
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "kawzone";
}
