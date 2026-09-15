/**
 * OCR temps réel — reconnaissance du texte visible sur l'emballage.
 *
 * Choix d'architecture : 100 % local et gratuit (Tesseract.js, chargé à la demande
 * depuis un CDN ESM uniquement quand l'utilisateur active la lecture de texte).
 * Aucun appel à une API payante, aucun coût par scan, aucun poids ajouté au bundle
 * tant que la fonction n'est pas utilisée.
 */

type Worker = {
  recognize: (img: unknown) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<Worker | null> | null = null;

async function getWorker(): Promise<Worker | null> {
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        const url = "https://esm.sh/tesseract.js@5";
        const mod = (await import(/* @vite-ignore */ url)) as {
          createWorker: (lang: string) => Promise<Worker>;
        };
        return await mod.createWorker("eng");
      } catch {
        return null;
      }
    })();
  }
  return workerPromise;
}

export function ocrAvailable(): boolean {
  return typeof window !== "undefined";
}

/** Extrait les mots utiles d'une image locale ponctuelle. */
export async function readTextFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  if (!canvas.width || !canvas.height) return null;
  const worker = await getWorker();
  if (!worker) return null;

  try {
    const { data } = await worker.recognize(canvas);
    const words = (data.text || "")
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}.,-]/gu, ""))
      .filter((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length >= 2);
    if (!words.length) return null;
    return words.slice(0, 8).join(" ");
  } catch {
    return null;
  }
}

export async function disposeOcr() {
  const w = await workerPromise?.catch(() => null);
  if (w) await w.terminate().catch(() => {});
  workerPromise = null;
}
