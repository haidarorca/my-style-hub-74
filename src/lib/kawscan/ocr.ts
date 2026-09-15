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
        const mod = (await import(/* @vite-ignore */ "https://esm.sh/tesseract.js@5")) as {
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

/** Extrait les mots utiles d'une image de la caméra (une capture ponctuelle, pas chaque frame). */
export async function readTextFromVideo(video: HTMLVideoElement): Promise<string | null> {
  if (!video.videoWidth) return null;
  const worker = await getWorker();
  if (!worker) return null;

  // On n'analyse que la bande centrale : c'est là que l'utilisateur vise le produit.
  const canvas = document.createElement("canvas");
  const sw = Math.round(video.videoWidth * 0.9);
  const sh = Math.round(video.videoHeight * 0.5);
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(
    video,
    Math.round((video.videoWidth - sw) / 2),
    Math.round((video.videoHeight - sh) / 2),
    sw,
    sh,
    0,
    0,
    sw,
    sh,
  );

  try {
    const { data } = await worker.recognize(canvas);
    const words = (data.text || "")
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((w) => w.length >= 3);
    if (!words.length) return null;
    return words.slice(0, 5).join(" ");
  } catch {
    return null;
  }
}

export async function disposeOcr() {
  const w = await workerPromise?.catch(() => null);
  if (w) await w.terminate().catch(() => {});
  workerPromise = null;
}
