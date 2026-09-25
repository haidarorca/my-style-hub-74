import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hardDeleteOrder } from "@/lib/order-archive.functions";

export function HardDeleteDialog({ open, onOpenChange, orderId, reference, onDeleted }: {
  open: boolean; onOpenChange: (o: boolean) => void; orderId: string; reference: string | null; onDeleted: () => void;
}) {
  const fn = useServerFn(hardDeleteOrder);
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const expected = (reference ?? orderId.slice(0, 8)).toUpperCase();

  useEffect(() => { if (!open) { setStep(1); setPassword(""); setTyped(""); } }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await fn({ data: { orderId, password, confirmReference: typed } });
      toast.success(`Commande ${expected} supprimée définitivement`);
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Supprimer définitivement
          </DialogTitle>
          <DialogDescription>
            Commande <span className="font-mono font-semibold">{expected}</span>
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-2 text-sm">
            <p>Cette action supprime la commande, ses articles, paiements, événements et rappels de la base de données.</p>
            <p className="rounded-md bg-destructive/10 p-2 font-medium text-destructive">
              Cette commande sera définitivement supprimée et ne pourra plus être récupérée.
            </p>
            <p className="text-muted-foreground">Pour une simple mise à l'écart, préférez « Archiver ».</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="hd-pw">Votre mot de passe administrateur</Label>
              <Input id="hd-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hd-ref">Tapez <span className="font-mono">{expected}</span> pour confirmer</Label>
              <Input id="hd-ref" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          {step === 1 ? (
            <Button variant="destructive" onClick={() => setStep(2)}>Je comprends, continuer</Button>
          ) : (
            <Button variant="destructive" disabled={busy || !password || typed.trim().toUpperCase() !== expected} onClick={submit}>
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
