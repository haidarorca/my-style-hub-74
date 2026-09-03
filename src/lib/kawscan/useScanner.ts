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
 * Scanner caméra : utilise l'API native BarcodeDetector quand elle existe
 * (Android/Chrome), sinon repli ZXing (iOS/Safari).
 * Optimisé : haute résolution, autofocus continu, analyse recadrée sur le
 * centre de l'image (zone du cadre) pour une détection beaucoup plus rapide.
 */
export function useScanner(onResult: (code: string) => void, active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
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
    if (lastRef.current.code === clean && now - lastRef.current.at < 1500) return;
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
    let timerId: ReturnType<typeof setTimeout> | null = null;

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
        // Repli sur une contrainte minimale (certains appareils refusent l'idéal)
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
      };
      setTorchAvailable(Boolean(caps.torch));
      // Autofocus continu quand l'appareil le supporte : indispensable pour les codes-barres
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

      if (Detector && usable.length) {
        const detector = new Detector({ formats: usable });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let wide = false;

        const loop = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2 && v.videoWidth) {
            try {
              // Alterne : zone centrale (rapide, la plupart des scans) puis image entière
              let source: CanvasImageSource = v;
              if (!wide && ctx) {
                const cw = Math.round(v.videoWidth * 0.8);
                const ch = Math.round(v.videoHeight * 0.5);
                canvas.width = cw;
                canvas.height = ch;
                ctx.drawImage(
                  v,
                  Math.round((v.videoWidth - cw) / 2),
                  Math.round((v.videoHeight - ch) / 2),
                  cw,
                  ch,
                  0,
                  0,
                  cw,
                  ch,
                );
                source = canvas;
              }
              wide = !wide;
              const codes = await detector.detect(source);
              if (codes?.length) {
                emit(codes[0].rawValue);
              }
            } catch {
              /* frame ignorée */
            }
          }
          timerId = setTimeout(() => void loop(), 60);
        };
        void loop();
        stopRef.current = () => {
          if (timerId) clearTimeout(timerId);
        };
      } else {
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
        const reader = new BrowserMultiFormatReader(hints as never, { delayBetweenScanAttempts: 60 });
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) emit(result.getText());
        });
        stopRef.current = () => controls.stop();
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      stopRef.current?.();
      stopRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setState("idle");
      setTorchOn(false);
    };
  }, [active, emit]);

  return { videoRef, state, error, torchOn, torchAvailable, toggleTorch };
}
