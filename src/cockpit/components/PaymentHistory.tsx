// @ts-nocheck
/* ═══════════════════════════════════════════════════════════════
   PaymentHistory — Liste des paiements avec actions edit/delete
   ═══════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { CreditCard, Calendar, User, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PaymentRecord } from "@/cockpit/hooks/useRealOrders";
import { fmtF } from "@/cockpit/lib/workflow";

interface Props {
  payments: PaymentRecord[];
  onEdit?: (paymentId: string, updates: { amount?: number; method?: string; reference?: string }) => void;
  onDelete?: (paymentId: string) => void;
}

export function PaymentHistory({ payments, onEdit, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [editReference, setEditReference] = useState("");

  if (payments.length === 0) {
    return <div className="text-xs text-gray-400 py-2 text-center italic">Aucun paiement enregistre</div>;
  }

  const startEdit = (p: PaymentRecord) => {
    setEditingId(p.id);
    setEditAmount(String(p.amount));
    setEditMethod(p.method);
    setEditReference(p.reference);
  };

  const saveEdit = () => {
    if (!editingId || !onEdit) return;
    const amt = parseFloat(editAmount);
    if (!amt || amt <= 0) return;
    onEdit(editingId, {
      amount: amt,
      method: editMethod,
      reference: editReference,
    });
    setEditingId(null);
  };

  const confirmDelete = (paymentId: string) => {
    if (!onDelete) return;
    onDelete(paymentId);
    setDeletingId(null);
  };

  return (
    <div className="space-y-2">
      {payments.map((p) => {
        const date = new Date(p.timestamp);
        const isEditing = editingId === p.id;
        const isDeleting = deletingId === p.id;

        if (isDeleting) {
          return (
            <div key={p.id} className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-red-700 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Confirmer la suppression
              </div>
              <div className="text-xs text-gray-600 space-y-0.5">
                <div>Montant : <span className="font-bold">{fmtF(p.amount)}</span></div>
                <div>Methode : {p.method}</div>
                {p.reference && <div>Reference : {p.reference}</div>}
                <div>Date : {date.toLocaleDateString("fr-FR")} {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                <div>Par : {p.adminName}</div>
              </div>
              <div className="text-xs text-red-600 italic">Cette action sera enregistree dans l audit.</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setDeletingId(null)}>Annuler</Button>
                <Button variant="destructive" size="sm" className="flex-1 h-8 text-xs" onClick={() => confirmDelete(p.id)}>Supprimer definitivement</Button>
              </div>
            </div>
          );
        }

        if (isEditing) {
          return (
            <div key={p.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium text-blue-800">Modifier le paiement</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="Montant"
                />
                <Select value={editMethod} onValueChange={setEditMethod}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wave">Wave</SelectItem>
                    <SelectItem value="orange_money">Orange Money</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Virement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                value={editReference}
                onChange={e => setEditReference(e.target.value)}
                className="h-8 text-sm"
                placeholder="Reference (optionnel)"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setEditingId(null)}>Annuler</Button>
                <Button size="sm" className="flex-1 h-8 text-xs" onClick={saveEdit}>Enregistrer</Button>
              </div>
            </div>
          );
        }

        return (
          <div key={p.id} className="bg-white border rounded-lg p-2.5 text-sm group relative">
            {/* Actions edit/delete */}
            {(onEdit || onDelete) && (
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onEdit && (
                  <button onClick={() => startEdit(p)} className="p-1 rounded hover:bg-gray-100 text-blue-500" title="Modifier">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {onDelete && (
                  <button onClick={() => setDeletingId(p.id)} className="p-1 rounded hover:bg-gray-100 text-red-500" title="Supprimer">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Calendar className="h-3 w-3" />
                {date.toLocaleDateString("fr-FR")} - {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="font-bold text-emerald-700 pr-12">{fmtF(p.amount)}</div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">{p.method}</span>
              {p.reference && <span className="text-gray-500">Ref: {p.reference}</span>}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
              <User className="h-3 w-3" />
              {p.adminName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
