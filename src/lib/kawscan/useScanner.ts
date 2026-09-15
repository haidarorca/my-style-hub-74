import { useCallback, useEffect, useRef, useState } from "react";

type ScannerState = "idle" | "starting" | "running" | "denied" | "unsupported" | "error";

export type CameraDiagnostics = {
  width: number;
  height: number;
  frameRate: number | null;
  aspectRatio: number | null;
  facingMode: string | null;
  deviceLabel: string | null;
  deviceId: string | null;
  focusMode: string | null;
  focusModes: string[];
  maxWidth: number | null;
  maxHeight: number | null;
  torch: boolean;
  zoomMax: number | null;
  engine: string;
  cameraCount: number;
};

/** Mesures vivantes : ce que le <video> et le canvas d'analyse contiennent réellement. */
export type LiveDiagnostics = {
  videoWidth: number;
  videoHeight: number;
  displayWidth: number;
  displayHeight: number;
  scanWidth: number;
  scanHeight: number;
  measuredFps: number;
  devicePixelRatio: number;
};

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
 * Choisit la caméra arrière PRINCIPALE.
 * Beaucoup de téléphones exposent aussi un ultra grand-angle / macro / téléobjectif :
 * ces capteurs rendent une image molle et ruinent la lecture des codes.
 */
async function pickRearCameraId(): Promise<string | null> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    if (cams.length <= 1) return null;
    if (!cams.some((c) => c.label)) return null; // labels indisponibles avant autorisation
    const bad = /(ultra|wide|grand|macro|t[ée]l[ée]|tele|depth|profondeur|infrared|ir\b)/i;
    const rear = cams.filter((c) => /(back|rear|arri[èe]re|environment|world)/i.test(c.label));
    const pool = rear.length ? rear : cams;
    return (pool.find((c) => !bad.test(c.label)) ?? pool[0]).deviceId;
  } catch {
    return null;
  }
}

/**
 * Scanner caméra de qualité « terminal magasin » :
 * - sélection de la caméra arrière principale (jamais l'ultra grand-angle, source de flou)
 * - résolution réellement maximale négociée avec le capteur (capabilities), sans downscale CSS
 * - autofocus + exposition + balance des blancs continus, zoom matériel si disponible
 * - analyse cadencée (≈12 analyses/s) pour laisser le rendu vidéo fluide et net
 * - deux moteurs : BarcodeDetector natif + ZXing en repli (iOS)
 * - anti-doublon : clé de contrôle EAN/UPC + double lecture identique
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
  /** Résolution réelle du flux (diagnostic + affichage qualité). */
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);
  const [diagnostics, setDiagnostics] = useState<CameraDiagnostics | null>(null);
  const [zoom, setZoomState] = useState(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  /** Mesures rafraîchies en continu dans la boucle d'analyse (sans re-render à chaque frame). */
  const liveRef = useRef<(LiveDiagnostics & { at: number }) | null>(null);
  const [live, setLive] = useState<LiveDiagnostics | null>(null);

  useEffect(() => {
    if (!active) {
      setLive(null);
      liveRef.current = null;
      return;
    }
    const id = window.setInterval(() => {
      const l = liveRef.current;
      if (l) {
        const { at: _at, ...rest } = l;
        setLive(rest);
      }
    }, 700);
    return () => window.clearInterval(id);
  }, [active]);

  /** Une lecture brute : validée seulement si la clé est bonne et si elle est confirmée 2 fois. */
  const emit = useCallback((raw: string) => {
    const clean = raw.trim();
    if (!clean || clean.length < 4) return;
    if (!checksumOk(clean)) return;

    const now = Date.now();
    // anti-scan multiple accidentel du même produit
    if (lastRef.current.code === clean && now - lastRef.current.at < 2500) return;

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

  /** Zoom optique/numérique du capteur (bien plus net qu'un zoom CSS). */
  const setZoom = useCallback(async (value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as unknown as MediaTrackConstraintSet] } as MediaTrackConstraints);
      setZoomState(value);
    } catch {
      /* zoom non supporté */
    }
  }, []);

  /** Capture ponctuelle en mémoire à la meilleure définition livrée par le navigateur. */
  const captureFrame = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const track = streamRef.current?.getVideoTracks()[0];
    const video = videoRef.current;
    if (!track || !video || !video.videoWidth || !video.videoHeight) return null;

    let source: CanvasImageSource = video;
    let width = video.videoWidth;
    let height = video.videoHeight;
    let bitmap: ImageBitmap | null = null;
    try {
      if (typeof ImageCapture !== "undefined") {
        bitmap = await new ImageCapture(track).grabFrame();
        source = bitmap;
        width = bitmap.width;
        height = bitmap.height;
      }
    } catch {
      // Safari et certains Android utilisent directement la frame vidéo intrinsèque.
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      bitmap?.close();
      return null;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, width, height);
    bitmap?.close();
    return canvas;
  }, []);

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
        const reader = new BrowserMultiFormatReader(hints as never, { delayBetweenScanAttempts: 80 });
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

      const deviceId = await pickRearCameraId();
      if (cancelled) return;

      // Aucune limite artificielle : on demande la définition maximale du capteur
      // sans imposer de ratio ni de minimum (un ratio forcé oblige le navigateur
      // à recadrer/réduire le flux, ce qui rendait l'image molle).
      const maxVideo = (id: string | null): MediaTrackConstraints =>
        ({
          ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: "environment" } }),
          width: { ideal: 7680 },
          height: { ideal: 4320 },
          frameRate: { ideal: 30 },
          resizeMode: { ideal: "none" },
        }) as unknown as MediaTrackConstraints;

      const primary: MediaStreamConstraints = { video: maxVideo(deviceId), audio: false };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(primary);
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
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

      // Après la première autorisation, Android/iOS rendent souvent enfin les
      // libellés des objectifs disponibles. On peut alors remplacer un éventuel
      // ultra-grand-angle choisi par défaut par la caméra arrière principale.
      const selectedId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
      const preferredId = await pickRearCameraId();
      if (preferredId && preferredId !== selectedId) {
        try {
          const preferredStream = await navigator.mediaDevices.getUserMedia({
            video: maxVideo(preferredId),
            audio: false,
          });
          stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
          stream = preferredStream;
        } catch {
          // La caméra déjà ouverte reste utilisable si le changement est refusé.
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
        exposureMode?: string[];
        whiteBalanceMode?: string[];
        zoom?: { min: number; max: number; step?: number };
        width?: { max?: number };
        height?: { max?: number };
      };
      setTorchAvailable(Boolean(caps.torch));

      // Chaque réglage est appliqué séparément : un autofocus non supporté ne doit
      // jamais annuler la résolution négociée.
      // On ne plafonne plus la définition : on monte exactement au maximum que le
      // capteur déclare, et on n'applique la contrainte que si elle AUGMENTE le
      // nombre de pixels réellement livrés (jamais l'inverse).
      const settingsBefore = track?.getSettings?.() ?? {};
      const currentPixels = (settingsBefore.width ?? 0) * (settingsBefore.height ?? 0);
      const capW = caps.width?.max ?? 0;
      const capH = caps.height?.max ?? 0;
      if (capW && capH && capW * capH > currentPixels) {
        await track
          .applyConstraints({
            width: { ideal: capW },
            height: { ideal: capH },
            resizeMode: { ideal: "none" },
          } as unknown as MediaTrackConstraints)
          .catch(() => {});
        const after = track.getSettings?.() ?? {};
        // Sécurité : si le pilote a répondu par une définition plus faible, on revient.
        if ((after.width ?? 0) * (after.height ?? 0) < currentPixels && settingsBefore.width) {
          await track
            .applyConstraints({
              width: { ideal: settingsBefore.width },
              height: { ideal: settingsBefore.height },
            })
            .catch(() => {});
        }
      }
      if (caps.focusMode?.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      }
      if (caps.exposureMode?.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ exposureMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      }
      if (caps.whiteBalanceMode?.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ whiteBalanceMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      }

      if (caps.zoom && typeof caps.zoom.min === "number") {
        setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step ?? 0.1 });
        const current = (track.getSettings?.() as { zoom?: number })?.zoom;
        setZoomState(current ?? caps.zoom.min);
      }

      await new Promise<void>((resolve) => {
        if (video.readyState >= 1 && video.videoWidth) resolve();
        else video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      });
      const settings = track?.getSettings?.() ?? {};
      const actualWidth = settings.width ?? video.videoWidth;
      const actualHeight = settings.height ?? video.videoHeight;
      let cameraCount = 0;
      try {
        cameraCount = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length;
      } catch {
        cameraCount = 0;
      }
      if (actualWidth && actualHeight) {
        setResolution({ w: actualWidth, h: actualHeight });
        setDiagnostics({
          width: actualWidth,
          height: actualHeight,
          frameRate: settings.frameRate ?? null,
          aspectRatio: settings.aspectRatio ?? actualWidth / actualHeight,
          facingMode: settings.facingMode ?? null,
          deviceLabel: track.label || null,
          deviceId: settings.deviceId ?? null,
          focusMode: (settings as MediaTrackSettings & { focusMode?: string }).focusMode ?? null,
          focusModes: caps.focusMode ?? [],
          maxWidth: caps.width?.max ?? null,
          maxHeight: caps.height?.max ?? null,
          torch: Boolean(caps.torch),
          zoomMax: caps.zoom?.max ?? null,
          engine: "…",
          cameraCount,
        });
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
        // Repli local, principalement pour iPhone. On évite de faire tourner deux
        // moteurs en parallèle, ce qui faisait chuter la fluidité du preview.
        setDiagnostics((d) => (d ? { ...d, engine: "ZXing (local)" } : d));
        void startZxing(video);
        return;
      }

      setDiagnostics((d) => (d ? { ...d, engine: `BarcodeDetector (${usable.length} formats)` } : d));
      const detector = new Detector({ formats: usable });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let pass = 0;
      let busy = false;
      let rafId = 0;
      let vfcId = 0;
      let lastRun = 0;
      /** ≈12 analyses/s : assez pour un scan instantané, sans saturer le CPU ni la batterie. */
      const MIN_INTERVAL = 80;

      // zones analysées en rotation : cadre serré, cadre large, image entière
      type Zone = { w: number; h: number; scale: number } | null;
      const ZONES: Zone[] = [
        { w: 0.75, h: 0.32, scale: 2 },
        { w: 0.95, h: 0.55, scale: 1.5 },
        null,
      ];
      // zones prioritaires quand l'utilisateur a touché l'écran (tap-to-focus)
      const POI_ZONES: Zone[] = [
        { w: 0.45, h: 0.22, scale: 2.5 },
        { w: 0.7, h: 0.35, scale: 2 },
        { w: 0.28, h: 0.14, scale: 3 },
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
        const now = performance.now();
        if (now - lastRun < MIN_INTERVAL) return;
        lastRun = now;
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
            // Aucun agrandissement artificiel : les barres gardent leurs contours réels.
            canvas.width = cw;
            canvas.height = ch;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(v, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
            enhance();
            source = canvas;
          }
          // Diagnostic : taille EXACTE de l'image remise au moteur de scan.
          const sw = source === v ? v.videoWidth : canvas.width;
          const sh = source === v ? v.videoHeight : canvas.height;
          const rect = v.getBoundingClientRect();
          const prev = liveRef.current;
          const dt = now - (prev?.at ?? now - 1000);
          liveRef.current = {
            at: now,
            videoWidth: v.videoWidth,
            videoHeight: v.videoHeight,
            displayWidth: Math.round(rect.width),
            displayHeight: Math.round(rect.height),
            scanWidth: sw,
            scanHeight: sh,
            measuredFps: dt > 0 ? Math.round(1000 / dt) : 0,
            devicePixelRatio: window.devicePixelRatio,
          };
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
          const requestFrame = v.requestVideoFrameCallback;
          if (requestFrame) vfcId = requestFrame.call(v, onFrame);
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
      setResolution(null);
      setDiagnostics(null);
      setZoomRange(null);
    };
  }, [active, emit]);

  return {
    videoRef,
    state,
    error,
    torchOn,
    torchAvailable,
    toggleTorch,
    focusAt,
    focusPoint,
    resolution,
    diagnostics,
    zoom,
    zoomRange,
    setZoom,
    captureFrame,
    takePhoto,
    live,
  };
}
