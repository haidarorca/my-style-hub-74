import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrderAddress } from "@/lib/order-address.functions";

export function EditAddressDialog({ open, onClose, orderId, address, city, phone }: {
  open: boolean; onClose: () => void; orderId: string;
  address: string | null; city: string | null; phone: string | null;
}) {
  const fn = useServerFn(updateOrderAddress);
  const qc = useQueryClient();
  const [a, setA] = useState(address ?? "");
  const [c, setC] = useState(city ?? "");
  const [p, setP] = useState(phone ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (a.trim().length < 3) { toast.error("Adresse trop courte"); return; }
    setSaving(true);
    try {
      await fn({ data: { order_id: orderId, address: a, city: c || null, phone: p || null } });
      toast.success("Adresse modifiée");
      await qc.invalidateQueries();
      onClose();
    } catch (e: any) { toast.error(e?.message || "Erreur"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Modifier l'adresse de livraison</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Adresse</Label><Input value={a} onChange={(e) => setA(e.target.value)} /></div>
          <div><Label>Ville</Label><Input value={c} onChange={(e) => setC(e.target.value)} /></div>
          <div><Label>Téléphone</Label><Input value={p} onChange={(e) => setP(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">La modification est enregistrée dans l'historique de la commande.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
