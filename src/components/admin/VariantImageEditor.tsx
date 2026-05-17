import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Type, Square, Crop as CropIcon, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────
// Manual image editor for admin variant photos.
// - Crop (single rectangle)
// - Mask rectangles (cover Chinese text / prices)
// - Text overlays (add a small label in French)
// - Save → returns new File at the original resolution.
// - Always keeps the original File untouched: caller decides
//   whether to replace.
// ─────────────────────────────────────────────────────────────

type Rect = { id: string; x: number; y: number; w: number; h: number; color: string };
type Txt = {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  bg: string;
  size: number;
};

interface Props {
  open: boolean;
  file: File | null;
  originalFile?: File | null;
  onClose: () => void;
  onSave: (file: File) => void;
  onResetOriginal?: () => void;
}

const PALETTE = ["#ffffff", "#000000", "#e11d48", "#f59e0b", "#10b981", "#3b82f6"];
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function VariantImageEditor({ open, file, originalFile, onClose, onSave, onResetOriginal }: Props) {
  const [src, setSrc] = useState<string>("");
  const [nat, setNat] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [masks, setMasks] = useState<Rect[]>([]);
  const [texts, setTexts] = useState<Txt[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef<{ startX: number; startY: number; orig: { x: number; y: number } } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  // Load file → object URL + natural size.
  useEffect(() => {
    if (!open || !file) {
      setSrc("");
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    const img = new Image();
    img.onload = () => {
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
      setCrop(null);
      setMasks([]);
      setTexts([]);
      setSelected(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  // Measure displayed stage (image rendered with object-contain).
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = stageRef.current;
      if (!el || !nat.w) return;
      const rect = el.getBoundingClientRect();
      const scale = Math.min(rect.width / nat.w, rect.height / nat.h);
      setStageSize({ w: nat.w * scale, h: nat.h * scale });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, nat]);

  // ── Drag helpers (pointer events, mobile-friendly) ─────────
  const drag = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
  } | null>(null);

  function startDrag(
    e: React.PointerEvent,
    id: string,
    mode: "move" | "resize",
    orig: { x: number; y: number; w: number; h: number },
  ) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id, mode, startX: e.clientX, startY: e.clientY, orig };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !stageSize.w) return;
    const dx = ((e.clientX - d.startX) / stageSize.w) * 100;
    const dy = ((e.clientY - d.startY) / stageSize.h) * 100;
    const apply = (r: { x: number; y: number; w: number; h: number }) => {
      if (d.mode === "move") {
        return {
          ...r,
          x: clamp(d.orig.x + dx, 0, 100 - r.w),
          y: clamp(d.orig.y + dy, 0, 100 - r.h),
        };
      }
      return {
        ...r,
        w: clamp(d.orig.w + dx, 4, 100 - d.orig.x),
        h: clamp(d.orig.h + dy, 4, 100 - d.orig.y),
      };
    };
    if (d.id === "__crop__") {
      setCrop((c) => (c ? { ...apply(c) } : c));
    } else if (d.id.startsWith("m:")) {
      setMasks((ms) => ms.map((m) => (m.id === d.id.slice(2) ? { ...m, ...apply(m) } : m)));
    } else if (d.id.startsWith("t:")) {
      setTexts((ts) =>
        ts.map((t) => {
          if (t.id !== d.id.slice(2)) return t;
          const upd = apply({ x: t.x, y: t.y, w: 20, h: 10 });
          return { ...t, x: upd.x, y: upd.y };
        }),
      );
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  // ── Add helpers ────────────────────────────────────────────
  function addMask() {
    const id = uid();
    setMasks((ms) => [...ms, { id, x: 30, y: 70, w: 40, h: 12, color: "#000000" }]);
    setSelected(`m:${id}`);
  }
  function addText() {
    const id = uid();
    setTexts((ts) => [
      ...ts,
      { id, x: 30, y: 40, text: "Texte", color: "#ffffff", bg: "#000000", size: 18 },
    ]);
    setSelected(`t:${id}`);
  }
  function toggleCrop() {
    setCrop((c) => (c ? null : { x: 5, y: 5, w: 90, h: 90 }));
    setSelected("__crop__");
  }
  function reset() {
    setCrop(null);
    setMasks([]);
    setTexts([]);
    setSelected(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  function restoreOriginal() {
    if (!onResetOriginal) return;
    onResetOriginal();
    reset();
    toast.success("Image originale restaurée.");
    onClose();
  }
  function remove(id: string) {
    if (id === "__crop__") setCrop(null);
    if (id.startsWith("m:")) setMasks((ms) => ms.filter((m) => m.id !== id.slice(2)));
    if (id.startsWith("t:")) setTexts((ts) => ts.filter((t) => t.id !== id.slice(2)));
    setSelected(null);
  }

  // ── Save: render at natural resolution ─────────────────────
  async function save() {
    if (!file || !nat.w) return;
    setSaving(true);
    try {
      const img = new Image();
      img.src = src;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("image"));
      });
      const c = crop ?? { x: 0, y: 0, w: 100, h: 100 };
      const cx = (c.x / 100) * nat.w;
      const cy = (c.y / 100) * nat.h;
      const cw = (c.w / 100) * nat.w;
      const ch = (c.h / 100) * nat.h;
      // Cap output side to keep mobile light.
      const maxSide = 1400;
      const ratio = Math.min(1, maxSide / Math.max(cw, ch));
      const ow = Math.max(1, Math.round(cw * ratio));
      const oh = Math.max(1, Math.round(ch * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("ctx");
      ctx.drawImage(img, cx, cy, cw, ch, 0, 0, ow, oh);

      // Masks (positioned in original % → translate to crop space).
      for (const m of masks) {
        const mx = (m.x / 100) * nat.w - cx;
        const my = (m.y / 100) * nat.h - cy;
        const mw = (m.w / 100) * nat.w;
        const mh = (m.h / 100) * nat.h;
        ctx.fillStyle = m.color;
        ctx.fillRect(mx * ratio, my * ratio, mw * ratio, mh * ratio);
      }
      // Texts
      for (const t of texts) {
        const tx = (t.x / 100) * nat.w - cx;
        const ty = (t.y / 100) * nat.h - cy;
        const sz = t.size * ratio * (nat.w / Math.max(stageSize.w, 1));
        ctx.font = `${Math.max(10, sz)}px system-ui, sans-serif`;
        const m = ctx.measureText(t.text);
        const padX = sz * 0.4;
        const padY = sz * 0.25;
        const bw = m.width + padX * 2;
        const bh = sz + padY * 2;
        ctx.fillStyle = t.bg;
        ctx.fillRect(tx * ratio, ty * ratio, bw, bh);
        ctx.fillStyle = t.color;
        ctx.textBaseline = "top";
        ctx.fillText(t.text, tx * ratio + padX, ty * ratio + padY);
      }

      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.85),
      );
      if (!blob) throw new Error("encode");
      const name = file.name.replace(/\.(png|webp|gif|jpe?g)$/i, "") + "-edited.jpg";
      const out = new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
      onSave(out);
      toast.success("Image enregistrée.");
      onClose();
    } catch {
      toast.error("Impossible d'enregistrer l'image. L'originale est conservée.");
    } finally {
      setSaving(false);
    }
  }

  const selectedText = useMemo(
    () => (selected?.startsWith("t:") ? texts.find((t) => t.id === selected.slice(2)) ?? null : null),
    [selected, texts],
  );
  const selectedMask = useMemo(
    () => (selected?.startsWith("m:") ? masks.find((m) => m.id === selected.slice(2)) ?? null : null),
    [selected, masks],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifier l'image</DialogTitle>
          <DialogDescription className="text-xs">
            Recadrer, masquer un texte/prix, ajouter une étiquette. L'image originale est conservée
            tant que vous n'enregistrez pas.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" size="sm" variant={crop ? "default" : "outline"} onClick={toggleCrop}>
            <CropIcon className="mr-1 h-3.5 w-3.5" /> Recadrer
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={addMask}>
            <Square className="mr-1 h-3.5 w-3.5" /> Cacher zone
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={addText}>
            <Type className="mr-1 h-3.5 w-3.5" /> Texte
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Annuler modifs
          </Button>
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.1}
            value={zoom}
            onChange={(e) => {
              const z = Number(e.target.value);
              setZoom(z);
              if (z === 1) setPan({ x: 0, y: 0 });
            }}
            className="flex-1 accent-primary"
          />
          <span className="w-10 text-right tabular-nums">{zoom.toFixed(1)}×</span>
        </div>

        {/* Stage */}
        <div
          ref={stageRef}
          className="relative mx-auto flex h-[55vh] max-h-[440px] w-full select-none items-center justify-center overflow-hidden rounded border bg-muted/30 touch-none"
          onPointerMove={(e) => {
            if (panDrag.current) {
              const dx = e.clientX - panDrag.current.startX;
              const dy = e.clientY - panDrag.current.startY;
              setPan({ x: panDrag.current.orig.x + dx, y: panDrag.current.orig.y + dy });
              return;
            }
            onPointerMove(e);
          }}
          onPointerUp={() => {
            panDrag.current = null;
            onPointerUp();
          }}
          onPointerCancel={() => {
            panDrag.current = null;
            onPointerUp();
          }}
          onPointerDown={(e) => {
            setSelected(null);
            if (zoom > 1) {
              panDrag.current = { startX: e.clientX, startY: e.clientY, orig: { ...pan } };
            }
          }}
        >
          {src && (
            <div
              className="relative flex h-full w-full items-center justify-center"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" }}
            >
              <img
                src={src}
                alt=""
                draggable={false}
                className="pointer-events-none max-h-full max-w-full object-contain"
                onLoad={() => {
                  const el = stageRef.current;
                  if (!el || !nat.w) return;
                  const r = el.getBoundingClientRect();
                  const s = Math.min(r.width / nat.w, r.height / nat.h);
                  setStageSize({ w: nat.w * s, h: nat.h * s });
                }}
              />
              {/* Overlay layer sized to displayed image */}
              <div
                className="absolute"
                style={{ width: stageSize.w, height: stageSize.h }}
              >
                {/* Crop */}
                {crop && (
                  <div
                    className={`absolute border-2 ${selected === "__crop__" ? "border-primary" : "border-white/80"} shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]`}
                    style={{
                      left: `${crop.x}%`,
                      top: `${crop.y}%`,
                      width: `${crop.w}%`,
                      height: `${crop.h}%`,
                    }}
                    onPointerDown={(e) => {
                      setSelected("__crop__");
                      startDrag(e, "__crop__", "move", crop);
                    }}
                  >
                    <div
                      className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full bg-primary border-2 border-white"
                      onPointerDown={(e) => startDrag(e, "__crop__", "resize", crop)}
                    />
                  </div>
                )}
                {/* Masks */}
                {masks.map((m) => (
                  <div
                    key={m.id}
                    className={`absolute ${selected === `m:${m.id}` ? "ring-2 ring-primary" : ""}`}
                    style={{
                      left: `${m.x}%`,
                      top: `${m.y}%`,
                      width: `${m.w}%`,
                      height: `${m.h}%`,
                      background: m.color,
                    }}
                    onPointerDown={(e) => {
                      setSelected(`m:${m.id}`);
                      startDrag(e, `m:${m.id}`, "move", m);
                    }}
                  >
                    <div
                      className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full bg-primary border-2 border-white"
                      onPointerDown={(e) => startDrag(e, `m:${m.id}`, "resize", m)}
                    />
                  </div>
                ))}
                {/* Texts */}
                {texts.map((t) => (
                  <div
                    key={t.id}
                    className={`absolute leading-none ${selected === `t:${t.id}` ? "ring-2 ring-primary" : ""}`}
                    style={{
                      left: `${t.x}%`,
                      top: `${t.y}%`,
                      color: t.color,
                      background: t.bg,
                      fontSize: t.size,
                      padding: `${t.size * 0.25}px ${t.size * 0.4}px`,
                    }}
                    onPointerDown={(e) => {
                      setSelected(`t:${t.id}`);
                      startDrag(e, `t:${t.id}`, "move", { x: t.x, y: t.y, w: 20, h: 10 });
                    }}
                  >
                    {t.text || " "}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Inspector */}
        {selectedMask && (
          <div className="rounded-md border p-2 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Zone masquée</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(selected!)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-6 w-6 rounded border-2 ${selectedMask.color === c ? "border-primary" : "border-transparent"}`}
                  style={{ background: c }}
                  onClick={() =>
                    setMasks((ms) => ms.map((m) => (m.id === selectedMask.id ? { ...m, color: c } : m)))
                  }
                />
              ))}
            </div>
          </div>
        )}
        {selectedText && (
          <div className="rounded-md border p-2 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Texte</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(selected!)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              className="h-8"
              value={selectedText.text}
              onChange={(e) =>
                setTexts((ts) =>
                  ts.map((t) => (t.id === selectedText.id ? { ...t, text: e.target.value } : t)),
                )
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Taille</Label>
                <Input
                  type="number"
                  className="h-8"
                  min={10}
                  max={80}
                  value={selectedText.size}
                  onChange={(e) =>
                    setTexts((ts) =>
                      ts.map((t) =>
                        t.id === selectedText.id ? { ...t, size: clamp(Number(e.target.value) || 18, 10, 80) } : t,
                      ),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Texte / Fond</Label>
                <div className="flex flex-wrap gap-1">
                  {PALETTE.map((c) => (
                    <button
                      key={`fg-${c}`}
                      type="button"
                      className={`h-5 w-5 rounded border-2 ${selectedText.color === c ? "border-primary" : "border-transparent"}`}
                      style={{ background: c }}
                      onClick={() =>
                        setTexts((ts) =>
                          ts.map((t) => (t.id === selectedText.id ? { ...t, color: c } : t)),
                        )
                      }
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {PALETTE.map((c) => (
                    <button
                      key={`bg-${c}`}
                      type="button"
                      className={`h-5 w-5 rounded border-2 ${selectedText.bg === c ? "border-primary" : "border-transparent"}`}
                      style={{ background: c }}
                      onClick={() =>
                        setTexts((ts) =>
                          ts.map((t) => (t.id === selectedText.id ? { ...t, bg: c } : t)),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving || !file}>
            <Check className="mr-1 h-3.5 w-3.5" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
