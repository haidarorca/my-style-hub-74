// ═══════════════════════════════════════════════════════════════
// EventCaptureDialog — Saisie métier (Phase B, étape 2)
//
//   Cause (Événement) → Réponse (Décision, optionnelle)
//                    → Conséquence (Mouvement financier, optionnel)
//
// Le triplet est inséré dans le bon ordre via les server fns
// recordEvent / recordDecision / recordMovement. Append-only.
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  EVENT_LABELS,
  DECISION_LABELS,
  MOVEMENT_LABELS,
  type OrderEventType,
  type OrderDecisionType,
  type FinancialMovementType,
  type MovementDirection,
  type CostAttribution,
} from "@/cockpit/lib/events";
import {
  recordEvent, recordDecision, recordMovement,
} from "@/lib/cockpit-events.functions";

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  vendorId: string;
  motherOrderIds: string[]; // pour invalider le cache
}

const EVENT_ORDER: OrderEventType[] = [
  "client_cancellation", "stock_break", "product_deleted", "shop_deleted",
  "customer_dispute", "delivery_refusal", "post_delivery_return",
  "vendor_error", "kawzone_error", "supplier_unavailable",
  "commercial_gesture", "payment_blocked", "delivery_blocked", "order_abandoned",
];

const DECISION_ORDER: OrderDecisionType[] = [
  "cancel_article", "cancel_suborder",
  "wait_restock", "wait_supplier", "wait_client",
  "replace_same", "replace_higher", "replace_lower", "partial_delivery",
  "accept_return", "refuse_return", "accept_exchange",
  "issue_refund", "issue_credit_note", "apply_penalty",
  "commercial_gesture", "override_no_action",
];

const MOVEMENT_ORDER: FinancialMovementType[] = [
  "cash_in", "cash_out",
  "credit_note_issued", "credit_note_used",
  "penalty_kept", "penalty_to_vendor", "commission_due_to_vendor",
  "loss_kawzone", "loss_vendor", "loss_shared",
  "gain_kawzone", "gain_vendor",
];

export function EventCaptureDialog({ open, onClose, orderId, vendorId, motherOrderIds }: Props) {
  const qc = useQueryClient();
  const recEvent = useServerFn(recordEvent);
  const recDecision = useServerFn(recordDecision);
  const recMovement = useServerFn(recordMovement);

  const [eventType, setEventType] = useState<OrderEventType>("client_cancellation");
  const [reason, setReason] = useState("");

  const [withDecision, setWithDecision] = useState(false);
  const [decisionType, setDecisionType] = useState<OrderDecisionType>("cancel_article");
  const [rationale, setRationale] = useState("");

  const [withMovement, setWithMovement] = useState(false);
  const [movementType, setMovementType] = useState<FinancialMovementType>("cash_out");
  const [direction, setDirection] = useState<MovementDirection>("debit");
  const [amount, setAmount] = useState<string>("");
  const [attribution, setAttribution] = useState<CostAttribution>("kawzone");
  const [note, setNote] = useState("");

  const reset = () => {
    setEventType("client_cancellation"); setReason("");
    setWithDecision(false); setDecisionType("cancel_article"); setRationale("");
    setWithMovement(false); setMovementType("cash_out"); setDirection("debit");
    setAmount(""); setAttribution("kawzone"); setNote("");
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (withMovement && !withDecision) {
        throw new Error("Un mouvement financier doit être attaché à une décision.");
      }
      if (withMovement) {
        const n = Number(amount);
        if (!isFinite(n) || n < 0) throw new Error("Montant invalide.");
      }
      const ev = await recEvent({
        data: {
          order_id: orderId,
          vendor_id: vendorId,
          event_type: eventType,
          reason: reason.trim() || null,
        },
      });
      if (withDecision) {
        const dec = await recDecision({
          data: {
            event_id: ev.id,
            decision_type: decisionType,
            rationale: rationale.trim() || null,
          },
        });
        if (withMovement) {
          await recMovement({
            data: {
              decision_id: dec.id,
              movement_type: movementType,
              direction,
              amount: Number(amount),
              cost_attribution: attribution,
              note: note.trim() || null,
            },
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Événement enregistré");
      // invalide la batch utilisée par le dashboard
      qc.invalidateQueries({ queryKey: ["sub-order-histories"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message ?? "Échec de l'enregistrement"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !mut.isPending) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Enregistrer un événement métier</DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            Cause → Décision (option) → Mouvement (option). Append-only : impossible à modifier ou supprimer ensuite.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Événement */}
          <fieldset className="space-y-2 border rounded-lg p-3 bg-blue-50/40">
            <legend className="text-[11px] font-bold text-blue-900 px-1">Cause (événement)</legend>
            <Label className="text-xs">Type</Label>
            <Select value={eventType} onValueChange={(v) => setEventType(v as OrderEventType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_ORDER.map(t => (
                  <SelectItem key={t} value={t} className="text-sm">{EVENT_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="text-xs">Motif / contexte</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : Le client a appelé pour annuler 30 min après la commande."
              className="text-sm min-h-[60px]"
            />
          </fieldset>

          {/* Décision */}
          <fieldset className="space-y-2 border rounded-lg p-3 bg-purple-50/40">
            <legend className="text-[11px] font-bold text-purple-900 px-1 flex items-center gap-1">
              Réponse (décision)
              <button
                type="button"
                onClick={() => setWithDecision(v => !v)}
                className="ml-2 text-purple-700 hover:underline inline-flex items-center gap-0.5 font-normal"
              >
                {withDecision ? <><X className="h-3 w-3" />retirer</> : <><Plus className="h-3 w-3" />ajouter</>}
              </button>
            </legend>
            {withDecision ? (
              <>
                <Label className="text-xs">Type de décision</Label>
                <Select value={decisionType} onValueChange={(v) => setDecisionType(v as OrderDecisionType)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DECISION_ORDER.map(t => (
                      <SelectItem key={t} value={t} className="text-sm">{DECISION_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="text-xs">Justification (optionnel)</Label>
                <Textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  className="text-sm min-h-[50px]"
                />
              </>
            ) : (
              <p className="text-[11px] text-gray-500 italic">
                Aucune décision pour l'instant → la sous-commande passera en « action Kawzone attendue ».
              </p>
            )}
          </fieldset>

          {/* Mouvement */}
          {withDecision && (
            <fieldset className="space-y-2 border rounded-lg p-3 bg-emerald-50/40">
              <legend className="text-[11px] font-bold text-emerald-900 px-1 flex items-center gap-1">
                Conséquence (mouvement financier)
                <button
                  type="button"
                  onClick={() => setWithMovement(v => !v)}
                  className="ml-2 text-emerald-700 hover:underline inline-flex items-center gap-0.5 font-normal"
                >
                  {withMovement ? <><X className="h-3 w-3" />retirer</> : <><Plus className="h-3 w-3" />ajouter</>}
                </button>
              </legend>
              {withMovement ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={movementType} onValueChange={(v) => setMovementType(v as FinancialMovementType)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MOVEMENT_ORDER.map(t => (
                            <SelectItem key={t} value={t} className="text-sm">{MOVEMENT_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Sens</Label>
                      <Select value={direction} onValueChange={(v) => setDirection(v as MovementDirection)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debit">Sortie (débit)</SelectItem>
                          <SelectItem value="credit">Entrée (crédit)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Montant (FCFA)</Label>
                      <Input
                        type="number" min={0} inputMode="numeric"
                        value={amount} onChange={(e) => setAmount(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">À la charge de</Label>
                      <Select value={attribution} onValueChange={(v) => setAttribution(v as CostAttribution)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kawzone">Kawzone</SelectItem>
                          <SelectItem value="vendor">Vendeur</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="shared">Partagé</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Label className="text-xs">Note (méthode, référence…)</Label>
                  <Input
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex : remboursement Wave - ref TX12345"
                    className="h-9 text-sm"
                  />
                </>
              ) : (
                <p className="text-[11px] text-gray-500 italic">
                  Aucun mouvement → la décision est enregistrée mais sans impact comptable immédiat.
                </p>
              )}
            </fieldset>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
