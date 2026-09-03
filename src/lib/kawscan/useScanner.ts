import { useCallback, useEffect, useRef, useState } from "react";

type ScannerState = "idle" | "starting" | "running" | "denied" | "unsupported" | "error";

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "itf",
  "qr_code",
  "data_matrix",
] as const;

/**
 * Scanner caméra optimisé :
 * - flux vidéo haute résolution + autofocus continu
 * - détection à chaque image affichée (requestVideoFrameCallback) au lieu d'un timer
 * - analyse alternée : zone du cadre agrandie x2 (petits codes) puis image entière
 * - repli/renfort ZXing automatique si l'API native ne trouve rien au bout de 2,5 s
 */
export function useScanner(onResult: (code: string) => void, active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopFns = useRef<(() => void)[]>([]);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const emit = useCallback((code: string) => {
    const clean = code.trim();
    if (!clean) return;
    const now = Date.now();
    if (lastRef.current.code === clean && now - lastRef.current.at < 1200) return;
    lastRef.current = { code: clean, at: now };
    onResultRef.current(clean);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      } as MediaTrackConstraints);
      setTorchOn((v) => !v);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let found = false;
    let zxingStarted = false;

    const registerStop = (fn: () => void) => stopFns.current.push(fn);

    async function startZxing(video: HTMLVideoElement) {
      if (zxingStarted || cancelled) return;
      zxingStarted = true;
      try {
        const [{ BrowserMultiFormatReader }, zxing] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;
        const { DecodeHintType, BarcodeFormat } = zxing;
        const hints = new Map<number, unknown>();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ]);
        const reader = new BrowserMultiFormatReader(hints as never, { delayBetweenScanAttempts: 50 });
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) {
            found = true;
            emit(result.getText());
          }
        });
        registerStop(() => controls.stop());
      } catch {
        /* repli indisponible */
      }
    }

    async function start() {
      setState("starting");
      setError(null);
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          });
        } catch (e2) {
          const name = (e2 as DOMException)?.name;
          if (name === "NotAllowedError" || name === "SecurityError") setState("denied");
          else {
            setState("error");
            setError("Impossible d'accéder à la caméra de cet appareil.");
          }
          return;
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      try {
        await video.play();
      } catch {
        /* autoplay bloqué : le tap utilisateur relancera */
      }

      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
        torch?: boolean;
        focusMode?: string[];
        focusDistance?: { min: number; max: number };
      };
      setTorchAvailable(Boolean(caps.torch));
      if (caps.focusMode?.includes("continuous")) {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          } as MediaTrackConstraints);
        } catch {
          /* ignoré */
        }
      }
      setState("running");

      const Detector = (
        window as unknown as {
          BarcodeDetector?: {
            new (o: unknown): { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
            getSupportedFormats?: () => Promise<string[]>;
          };
        }
      ).BarcodeDetector;

      let supported: string[] = [];
      if (Detector?.getSupportedFormats) {
        try {
          supported = await Detector.getSupportedFormats();
        } catch {
          supported = [];
        }
      }
      const usable = supported.length ? FORMATS.filter((f) => supported.includes(f)) : [...FORMATS];

      if (!Detector || !usable.length) {
        await startZxing(video);
        return;
      }

      const detector = new Detector({ formats: usable });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let pass = 0;
      let busy = false;
      let rafId = 0;
      let vfcId = 0;
      const startedAt = Date.now();

      const analyse = async () => {
        if (cancelled || busy) return;
        const v = videoRef.current;
        if (!v || v.readyState < 2 || !v.videoWidth) return;
        busy = true;
        try {
          let source: CanvasImageSource = v;
          // 2 passes sur 3 : zone du cadre agrandie x2 (meilleure lecture des petits codes)
          if (pass % 3 !== 2 && ctx) {
            const cw = Math.round(v.videoWidth * 0.85);
            const ch = Math.round(v.videoHeight * 0.45);
            const scale = 2;
            canvas.width = cw * scale;
            canvas.height = ch * scale;
            ctx.drawImage(
              v,
              Math.round((v.videoWidth - cw) / 2),
              Math.round((v.videoHeight - ch) / 2),
              cw,
              ch,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            source = canvas;
          }
          pass++;
          const codes = await detector.detect(source);
          if (codes?.length) {
            found = true;
            emit(codes[0].rawValue);
          } else if (!found && !zxingStarted && Date.now() - startedAt > 2500) {
            // l'API native ne trouve rien : on ajoute ZXing en renfort
            void startZxing(v);
          }
        } catch {
          /* frame ignorée */
        } finally {
          busy = false;
        }
      };

      const v = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
        cancelVideoFrameCallback?: (id: number) => void;
      };

      if (typeof v.requestVideoFrameCallback === "function") {
        const onFrame = () => {
          if (cancelled) return;
          void analyse();
          vfcId = v.requestVideoFrameCallback!(onFrame);
        };
        vfcId = v.requestVideoFrameCallback(onFrame);
        registerStop(() => v.cancelVideoFrameCallback?.(vfcId));
      } else {
        const loop = () => {
          if (cancelled) return;
          void analyse();
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        registerStop(() => cancelAnimationFrame(rafId));
      }
    }

    void start();

    return () => {
      cancelled = true;
      stopFns.current.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignoré */
        }
      });
      stopFns.current = [];
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setState("idle");
      setTorchOn(false);
    };
  }, [active, emit]);

  return { videoRef, state, error, torchOn, torchAvailable, toggleTorch };
}
