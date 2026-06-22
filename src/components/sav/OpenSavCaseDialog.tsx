import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { openSavCase, type SavCaseType, type SavResolution } from "@/lib/sav-workflow.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CASE_TYPE_LABEL } from "./SavCaseBadges";

const RESOLUTION_LABEL: Record<SavResolution, string> = {
  refund: "Remboursement",
  exchange: "Échange",
  repair: "Réparation",
  credit: "Avoir",
  replacement: "Remplacement",
  partial_refund: "Remboursement partiel",
  none: "Sans préférence",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  orderItemId?: string | null;
  defaultCaseType?: SavCaseType;
  onBehalfOfUserId?: string | null; // admin only
  onCreated?: () => void;
}

export function OpenSavCaseDialog({
  open, onOpenChange, orderId, orderItemId, defaultCaseType, onBehalfOfUserId, onCreated,
}: Props) {
  const open_ = useServerFn(openSavCase);
  const [caseType, setCaseType] = useState<SavCaseType>(defaultCaseType ?? "return");
  const [resolution, setResolution] = useState<SavResolution>("refund");
  const [problem, setProblem] = useState("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) { toast.error("Titre requis"); return; }
    setBusy(true);
    try {
      await open_({ data: {
        order_id: orderId,
        order_item_id: orderItemId ?? null,
        case_type: caseType,
        requested_resolution: resolution,
        title: title.trim(),
        description: description.trim() || null,
        problem_type: problem,
        on_behalf_of_user_id: onBehalfOfUserId ?? null,
      }});
      toast.success("Dossier ouvert");
      onOpenChange(false);
      setTitle(""); setDescription("");
      onCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ouvrir un dossier SAV</DialogTitle>
          <DialogDescription>
            {onBehalfOfUserId ? "Création pour le compte du client (tracé dans l'audit)." : "Décrivez votre demande. Notre équipe traitera votre dossier."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type de demande</Label>
            <Select value={caseType} onValueChange={(v) => setCaseType(v as SavCaseType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CASE_TYPE_LABEL) as SavCaseType[]).filter(t => t !== "admin_exception").map(t => (
                  <SelectItem key={t} value={t}>{CASE_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Résolution souhaitée</Label>
            <Select value={resolution} onValueChange={(v) => setResolution(v as SavResolution)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RESOLUTION_LABEL) as SavResolution[]).map(r => (
                  <SelectItem key={r} value={r}>{RESOLUTION_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Problème</Label>
            <Select value={problem} onValueChange={setProblem}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="other">Autre</SelectItem>
                <SelectItem value="dispute">Mauvaise taille / couleur</SelectItem>
                <SelectItem value="stock_break">Produit manquant</SelectItem>
                <SelectItem value="delivery_blocked">Produit cassé / défectueux</SelectItem>
                <SelectItem value="payment_blocked">Changement d'avis</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Produit reçu cassé" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              placeholder="Détaillez la situation. Vous pourrez ajouter des photos après création." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy}>Ouvrir le dossier</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
