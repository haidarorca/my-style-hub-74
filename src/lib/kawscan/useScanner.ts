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

/** Vérifie la clé de contrôle EAN-8 / EAN-13 / UPC-A (évite les lectures partielles erronées). */
function checksumOk(code: string): boolean {
  if (!/^\d+$/.test(code)) return true; // formats non numériques : pas de clé
  if (![8, 12, 13, 14].includes(code.length)) return code.length >= 4;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // pondération 3/1 en partant de la droite
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Convertit un point cliqué à l'écran en coordonnées normalisées (0..1) dans l'image
 * de la caméra, en tenant compte du recadrage `object-cover` de la balise <video>.
 */
export function videoPointFromClient(video: HTMLVideoElement | null, clientX: number, clientY: number) {
  if (!video || !video.videoWidth) return null;
  const rect = video.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
  const dispW = video.videoWidth * scale;
  const dispH = video.videoHeight * scale;
  const offX = (dispW - rect.width) / 2;
  const offY = (dispH - rect.height) / 2;
  const x = (clientX - rect.left + offX) / dispW;
  const y = (clientY - rect.top + offY) / dispH;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    left: clientX - rect.left,
    top: clientY - rect.top,
  };
}

/**
 * Scanner caméra robuste (caméras bas de gamme incluses) :
 * - flux haute résolution (jusqu'à 2560×1440), autofocus continu, aucune réduction de qualité
 * - deux moteurs en parallèle dès le départ : BarcodeDetector natif + ZXing (WASM-free)
 * - plusieurs zones d'analyse par cycle (cadre serré, cadre large, image entière)
 * - tap-to-focus : l'analyse et l'autofocus se concentrent sur la zone touchée pendant ~6 s
 * - prétraitement niveaux de gris + renforcement du contraste
 * - anti-erreur : clé de contrôle EAN/UPC + double lecture identique avant validation
 */

export function useScanner(onResult: (code: string) => void, active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopFns = useRef<(() => void)[]>([]);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const candidateRef = useRef<{ code: string; hits: number; at: number }>({ code: "", hits: 0, at: 0 });
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  /** Zone visée par l'utilisateur (tap sur l'écran), en coordonnées normalisées 0..1. */
  const poiRef = useRef<{ x: number; y: number; at: number } | null>(null);

  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; id: number } | null>(null);


  /** Une lecture brute : validée seulement si la clé est bonne et si elle est confirmée 2 fois. */
  const emit = useCallback((raw: string) => {
    const clean = raw.trim();
    if (!clean || clean.length < 4) return;
    if (!checksumOk(clean)) return;

    const now = Date.now();
    if (lastRef.current.code === clean && now - lastRef.current.at < 1500) return;

    const c = candidateRef.current;
    if (c.code !== clean || now - c.at > 2000) {
      candidateRef.current = { code: clean, hits: 1, at: now };
      return;
    }
    candidateRef.current = { code: clean, hits: c.hits + 1, at: now };
    if (candidateRef.current.hits < 2) return;

    candidateRef.current = { code: "", hits: 0, at: 0 };
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

  /**
   * Mise au point sur la zone touchée (comme sur les grandes applis) :
   * - demande à la caméra un autofocus/exposition sur ce point si le matériel le permet
   * - et surtout : l'analyse logicielle se concentre sur cette zone pendant ~6 s
   */
  const focusAt = useCallback((x: number, y: number) => {
    const nx = Math.min(1, Math.max(0, x));
    const ny = Math.min(1, Math.max(0, y));
    poiRef.current = { x: nx, y: ny, at: Date.now() };
    setFocusPoint({ x: nx, y: ny, id: Date.now() });
    candidateRef.current = { code: "", hits: 0, at: 0 };

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      focusMode?: string[];
      exposureMode?: string[];
      pointsOfInterest?: unknown;
    };
    const advanced: MediaTrackConstraintSet[] = [];
    if (caps.pointsOfInterest !== undefined) {
      advanced.push({ pointsOfInterest: [{ x: nx, y: ny }] } as unknown as MediaTrackConstraintSet);
    }
    if (caps.focusMode?.includes("single-shot")) advanced.push({ focusMode: "single-shot" } as MediaTrackConstraintSet);
    else if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
    if (caps.exposureMode?.includes("continuous")) advanced.push({ exposureMode: "continuous" } as MediaTrackConstraintSet);
    if (!advanced.length) return;
    void track.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => {});
  }, []);



  useEffect(() => {
    if (!active) return;
    let cancelled = false;
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
        const reader = new BrowserMultiFormatReader(hints as never, { delayBetweenScanAttempts: 40 });
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) emit(result.getText());
        });
        registerStop(() => controls.stop());
      } catch {
        /* moteur de repli indisponible */
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
            width: { ideal: 2560 },
            height: { ideal: 1440 },
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
        zoom?: { min: number; max: number; step?: number };
      };
      setTorchAvailable(Boolean(caps.torch));

      const advanced: MediaTrackConstraintSet[] = [];
      if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
      // pas de zoom matériel automatique : il dégrade l'image sur beaucoup de capteurs

      if (advanced.length) {
        try {
          await track.applyConstraints({ advanced } as MediaTrackConstraints);
        } catch {
          /* ignoré */
        }
      }
      setState("running");

      // ZXing démarre tout de suite, en parallèle du moteur natif
      void startZxing(video);

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
      if (!Detector || !usable.length) return; // ZXing seul

      const detector = new Detector({ formats: usable });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let pass = 0;
      let busy = false;
      let rafId = 0;
      let vfcId = 0;

      // zones analysées en rotation : cadre serré, cadre large, image entière
      type Zone = { w: number; h: number; scale: number } | null;
      const ZONES: Zone[] = [
        { w: 0.7, h: 0.3, scale: 3 },
        { w: 0.95, h: 0.55, scale: 2 },
        null,
      ];
      // zones prioritaires quand l'utilisateur a touché l'écran (tap-to-focus)
      const POI_ZONES: Zone[] = [
        { w: 0.45, h: 0.22, scale: 3 },
        { w: 0.7, h: 0.35, scale: 2 },
        { w: 0.28, h: 0.14, scale: 4 },
      ];
      const POI_TTL = 6000;

      /** niveaux de gris + étirement de contraste : aide sur images floues/sombres */
      const enhance = () => {
        if (!ctx) return;
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data;
        let min = 255;
        let max = 0;
        for (let i = 0; i < d.length; i += 4) {
          const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
          d[i] = g;
          if (g < min) min = g;
          if (g > max) max = g;
        }
        const range = Math.max(1, max - min);
        for (let i = 0; i < d.length; i += 4) {
          const v = ((d[i] - min) * 255) / range;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(img, 0, 0);
      };

      const analyse = async () => {
        if (cancelled || busy) return;
        const v = videoRef.current;
        if (!v || v.readyState < 2 || !v.videoWidth) return;
        busy = true;
        try {
          const poi = poiRef.current && Date.now() - poiRef.current.at < POI_TTL ? poiRef.current : null;
          const zone = poi ? POI_ZONES[pass % POI_ZONES.length] : ZONES[pass % ZONES.length];
          pass++;
          let source: CanvasImageSource = v;
          if (zone && ctx) {
            const cw = Math.round(v.videoWidth * zone.w);
            const ch = Math.round(v.videoHeight * zone.h);
            // centre de la zone : le point touché, sinon le centre de l'image
            const centerX = poi ? poi.x * v.videoWidth : v.videoWidth / 2;
            const centerY = poi ? poi.y * v.videoHeight : v.videoHeight / 2;
            const sx = Math.round(Math.min(Math.max(0, centerX - cw / 2), Math.max(0, v.videoWidth - cw)));
            const sy = Math.round(Math.min(Math.max(0, centerY - ch / 2), Math.max(0, v.videoHeight - ch)));
            canvas.width = Math.min(2400, Math.round(cw * zone.scale));
            canvas.height = Math.round((ch / cw) * canvas.width);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(v, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
            enhance();
            source = canvas;
          }
          const codes = await detector.detect(source);
          if (codes?.length) emit(codes[0].rawValue);
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
      candidateRef.current = { code: "", hits: 0, at: 0 };
      poiRef.current = null;
      setFocusPoint(null);
      setState("idle");
      setTorchOn(false);
    };
  }, [active, emit]);

  return { videoRef, state, error, torchOn, torchAvailable, toggleTorch, focusAt, focusPoint };
}

