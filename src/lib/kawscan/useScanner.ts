import { useCallback, useEffect, useRef, useState } from "react";

type ScannerState = "idle" | "starting" | "running" | "denied" | "unsupported" | "error";

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
] as const;

/**
 * Scanner caméra : utilise l'API native BarcodeDetector quand elle existe
 * (Android/Chrome), sinon repli ZXing (iOS/Safari).
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
    if (lastRef.current.code === clean && now - lastRef.current.at < 2500) return;
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
    let rafId = 0;

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
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        if (name === "NotAllowedError" || name === "SecurityError") setState("denied");
        else {
          setState("error");
          setError("Impossible d'accéder à la caméra de cet appareil.");
        }
        return;
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
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorchAvailable(Boolean(caps.torch));
      setState("running");

      const Detector = (window as unknown as { BarcodeDetector?: new (o: unknown) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;

      if (Detector) {
        const detector = new Detector({ formats: FORMATS });
        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length) emit(codes[0].rawValue);
          } catch {
            /* frame ignorée */
          }
          rafId = requestAnimationFrame(() => void loop());
        };
        rafId = requestAnimationFrame(() => void loop());
        stopRef.current = () => cancelAnimationFrame(rafId);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) emit(result.getText());
        });
        stopRef.current = () => controls.stop();
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
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
