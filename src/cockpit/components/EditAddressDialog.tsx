import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CountrySelect } from "@/components/CountrySelect";
import { updateOrderAddress } from "@/lib/order-address.functions";

export function EditAddressDialog({
  open, onClose, orderId, address, city, phone, customerName, countryId, note,
}: {
  open: boolean; onClose: () => void; orderId: string;
  address: string | null; city: string | null; phone: string | null;
  customerName?: string | null;
  countryId?: string | null;
  note?: string | null;
}) {
  const fn = useServerFn(updateOrderAddress);
  const qc = useQueryClient();
  const [name, setName] = useState(customerName ?? "");
  const [a, setA] = useState(address ?? "");
  const [c, setC] = useState(city ?? "");
  const [p, setP] = useState(phone ?? "");
  const [country, setCountry] = useState<string | null>(countryId ?? null);
  const [n, setN] = useState(note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (a.trim().length < 3) { toast.error("Adresse trop courte"); return; }
    setSaving(true);
    try {
      await fn({
        data: {
          order_id: orderId,
          address: a,
          city: c || null,
          phone: p || null,
          customer_name: name || null,
          destination_country_id: country,
          note: n || null,
        },
      });
      toast.success("Coordonnées de livraison mises à jour");
      await qc.invalidateQueries();
      onClose();
    } catch (e: any) { toast.error(e?.message || "Erreur"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Modifier les coordonnées de livraison</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nom du destinataire</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom complet" />
          </div>
          <div>
            <Label>Pays de livraison</Label>
            <CountrySelect
              value={country}
              onChange={setCountry}
              allowNull
              nullLabel="— Pays non renseigné —"
              placeholder="Choisir le pays exact"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Le pays détermine le circuit (local ou importation) et les services de transport proposés.
            </p>
          </div>
          <div><Label>Ville</Label><Input value={c} onChange={(e) => setC(e.target.value)} placeholder="Ville / commune" /></div>
          <div><Label>Adresse détaillée</Label><Textarea rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder="Quartier, rue, repère…" /></div>
          <div><Label>Téléphone</Label><Input value={p} onChange={(e) => setP(e.target.value)} placeholder="+221…" /></div>
          <div><Label>Note de livraison</Label><Textarea rows={2} value={n} onChange={(e) => setN(e.target.value)} placeholder="Instructions pour le livreur" /></div>
          <p className="text-xs text-muted-foreground">La modification est enregistrée dans l'historique de la commande.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
