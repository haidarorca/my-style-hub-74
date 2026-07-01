// ═══════════════════════════════════════════════════════════════
// Helpers pour rendre un noeud DOM en PNG téléchargeable.
// ═══════════════════════════════════════════════════════════════

import html2canvas from "html2canvas";

export async function nodeToBlob(node: HTMLElement, scale = 2): Promise<Blob> {
  const canvas = await html2canvas(node, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Blob generation failed"))),
      "image/png",
      0.95,
    );
  });
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
