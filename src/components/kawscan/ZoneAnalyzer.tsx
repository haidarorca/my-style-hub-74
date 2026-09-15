import { useEffect, useRef, useState } from "react";
import { Loader2, ScanSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NormalizedSelection, ZoneAnalysis } from "@/lib/kawscan/zone-analysis";
import { analyzeSelectedZone } from "@/lib/kawscan/zone-analysis";

type DragMode = "move" | "nw" | "ne" | "sw" | "se";
const INITIAL: NormalizedSelection = { x: 0.12, y: 0.3, width: 0.76, height: 0.35 };
const MIN_SIZE = 0.12;

export function ZoneAnalyzer({
  source,
  onCancel,
  onResult,
}: {
  source: HTMLCanvasElement;
  onCancel: () => void;
  onResult: (result: ZoneAnalysis) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; initial: NormalizedSelection } | null>(null);
  const [selection, setSelection] = useState(INITIAL);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = source.width;
    canvas.height = source.height;
    ctx.drawImage(source, 0, 0);
  }, [source]);

  const beginDrag = (mode: DragMode, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      mode,
      startX: (event.clientX - rect.left) / rect.width,
      startY: (event.clientY - rect.top) / rect.height,
      initial: selection,
    };
  };

  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    const start = drag.initial;

    if (drag.mode === "move") {
      setSelection({ ...start, x: Math.max(0, Math.min(1 - start.width, start.x + dx)), y: Math.max(0, Math.min(1 - start.height, start.y + dy)) });
      return;
    }

    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;
    if (drag.mode.includes("w")) left = Math.max(0, Math.min(right - MIN_SIZE, start.x + dx));
    if (drag.mode.includes("e")) right = Math.min(1, Math.max(left + MIN_SIZE, right + dx));
    if (drag.mode.includes("n")) top = Math.max(0, Math.min(bottom - MIN_SIZE, start.y + dy));
    if (drag.mode.includes("s")) bottom = Math.min(1, Math.max(top + MIN_SIZE, bottom + dy));
    setSelection({ x: left, y: top, width: right - left, height: bottom - top });
  };

  const analyze = async () => {
    setBusy(true);
    try {
      onResult(await analyzeSelectedZone(source, selection));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <header className="flex items-center gap-3 px-4 pb-3" style={{ paddingTop: "calc(0.75rem + var(--safe-top, 0px))" }}>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Annuler" className="text-white hover:bg-white/15 hover:text-white">
          <X className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-base font-semibold">Analyser une zone</h2>
          <p className="text-xs text-white/65">Encadrez le texte ou le code que vous souhaitez analyser.</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-2">
        <div
          ref={stageRef}
          className="relative max-h-full max-w-full touch-none overflow-hidden rounded-lg bg-black"
          style={{ aspectRatio: `${source.width} / ${source.height}`, width: `min(100%, calc((100dvh - 12rem) * ${source.width / source.height}))` }}
          onPointerMove={moveDrag}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          <canvas ref={canvasRef} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0 bg-black/35" />
          <div
            role="region"
            aria-label="Zone sélectionnée"
            className="absolute border-2 border-white bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
            style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%` }}
            onPointerDown={(event) => beginDrag("move", event)}
          >
            {(["nw", "ne", "sw", "se"] as const).map((corner) => (
              <span
                key={corner}
                aria-hidden="true"
                className={`absolute h-8 w-8 rounded-full border-2 border-black/40 bg-white shadow-lg ${
                  corner === "nw" ? "-left-4 -top-4" : corner === "ne" ? "-right-4 -top-4" : corner === "sw" ? "-bottom-4 -left-4" : "-bottom-4 -right-4"
                }`}
                onPointerDown={(event) => beginDrag(corner, event)}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="grid grid-cols-[auto_1fr] gap-3 border-t border-white/15 bg-black/90 px-4 pt-3" style={{ paddingBottom: "calc(1rem + var(--safe-bottom, 0px))" }}>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">Annuler</Button>
        <Button type="button" onClick={() => void analyze()} disabled={busy} className="bg-white text-black hover:bg-white/90">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
          {busy ? "Analyse en cours…" : "Analyser"}
        </Button>
      </footer>
    </div>
  );
}