import { useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";
import { useScanner, videoPointFromClient } from "@/lib/kawscan/useScanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Scanner caméra réutilisable pour le vendeur (création rapide de produits). */
export function ScanDialog({
  open,
  onOpenChange,
  onDetected,
  title = "Scanner le code du produit",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
}) {
  const [ring, setRing] = useState<{ left: number; top: number; id: number } | null>(null);
  const scanner = useScanner((code) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(40);
    onDetected(code);
    onOpenChange(false);
  }, open);

  const handleTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = videoPointFromClient(scanner.videoRef.current, e.clientX, e.clientY);
    if (!p) return;
    scanner.focusAt(p.x, p.y);
    setRing({ left: p.left, top: p.top, id: Date.now() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="relative aspect-[3/4] w-full bg-black" onPointerDown={handleTap}>
          <video ref={scanner.videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-60 rounded-xl border-4 border-white/80" />
          </div>
          {ring && (
            <div
              key={ring.id}
              className="pointer-events-none absolute h-20 w-20 -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in rounded-full border-2 border-primary shadow-[0_0_0_2px_rgba(0,0,0,0.25)]"
              style={{ left: ring.left, top: ring.top }}
            />
          )}


          {scanner.state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {(scanner.state === "denied" || scanner.state === "unsupported" || scanner.state === "error") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center text-white">
              <CameraOff className="h-8 w-8" />
              <p className="text-sm text-white/80">
                {scanner.state === "denied"
                  ? "Autorisez l'accès à la caméra dans votre navigateur, puis réessayez."
                  : (scanner.error ?? "Caméra indisponible. Saisissez le code à la main.")}
              </p>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Saisir le code à la main
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 pt-3">
          <p className="text-xs text-muted-foreground">Placez le code-barres dans le cadre</p>
          <div className="flex gap-2">
            {scanner.torchAvailable && (
              <Button type="button" variant="outline" size="sm" onClick={() => void scanner.toggleTorch()}>
                {scanner.torchOn ? "Flash activé" : "Flash"}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
