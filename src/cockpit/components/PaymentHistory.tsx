import { useState } from "react";
import { Calendar, User, Pencil, Trash2, AlertTriangle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAYMENT_METHOD_LABELS, fmtF } from "@/cockpit/lib/workflow";
import type { PaymentRecord } from "@/cockpit/types";

interface Props {
  payments: PaymentRecord[];
  onEdit?: (id: string, u: { amount?: number; method?: string; reference?: string }) => void;
  onDelete?: (id: string) => void;
  /** Si true (ex: commande livrée), désactive édition et suppression. */
  locked?: boolean;
}

export function PaymentHistory({ payments, onEdit, onDelete, locked = false }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [meth, setMeth] = useState("");
  const [ref, setRef] = useState("");

  if (payments.length === 0) return <div className="text-xs text-gray-400 py-3 text-center italic">Aucun paiement</div>;

  return (
    <div className="space-y-2">
      {payments.map(p => {
        const date = new Date(p.timestamp);
        const isEditing = editingId === p.id;
        const isDeleting = deletingId === p.id;

        if (isDeleting) return (
          <div key={p.id} className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-red-700 text-sm font-medium"><AlertTriangle className="h-4 w-4" />Confirmer suppression</div>
            <div className="text-xs text-gray-600">{fmtF(p.amount)} — {PAYMENT_METHOD_LABELS[p.method] ?? p.method} — {date.toLocaleDateString("fr-FR")}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setDeletingId(null)}>Annuler</Button>
              <Button variant="destructive" size="sm" className="flex-1 h-8 text-xs" onClick={() => { onDelete?.(p.id); setDeletingId(null); }}>Supprimer</Button>
            </div>
          </div>
        );

        if (isEditing) return (
          <div key={p.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            <div className="text-sm font-medium text-blue-800">Modifier</div>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" value={amt} onChange={e => setAmt(e.target.value)} className="h-8 text-sm" placeholder="Montant" />
              <select value={meth} onChange={e => setMeth(e.target.value)} className="h-8 text-sm rounded-md border border-input bg-transparent px-2">
                <option value="wave">Wave</option><option value="orange_money">OM</option><option value="cash">Cash</option><option value="bank_transfer">Virement</option>
              </select>
            </div>
            <Input value={ref} onChange={e => setRef(e.target.value)} className="h-8 text-sm" placeholder="Référence" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setEditingId(null)}>Annuler</Button>
              <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => { onEdit?.(p.id, { amount: parseFloat(amt) || 0, method: meth, reference: ref }); setEditingId(null); }}>Enregistrer</Button>
            </div>
          </div>
        );

        return (
          <div key={p.id} className="bg-white border rounded-lg p-2.5 text-sm group relative">
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!locked && onEdit && <button onClick={() => { setEditingId(p.id); setAmt(String(p.amount)); setMeth(p.method); setRef(p.reference); }} className="p-1 rounded hover:bg-gray-100 text-blue-500" title="Modifier"><Pencil className="h-3 w-3" /></button>}
              {!locked && onDelete && <button onClick={() => setDeletingId(p.id)} className="p-1 rounded hover:bg-gray-100 text-red-500" title="Supprimer"><Trash2 className="h-3 w-3" /></button>}
            </div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1 text-xs text-gray-500"><Calendar className="h-3 w-3" />{date.toLocaleDateString("fr-FR")} {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
              <div className="font-bold text-emerald-700 pr-14">{fmtF(p.amount)}</div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
              {p.reference && <span className="text-gray-500">Ref: {p.reference}</span>}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5"><User className="h-3 w-3" />{p.adminName}</div>
            {/* Historique modifications */}
            {p.editHistory && p.editHistory.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                <div className="flex items-center gap-1 text-[10px] text-amber-600 mb-0.5"><History className="h-3 w-3" />Modifications</div>
                {p.editHistory.map((e, i) => (
                  <div key={i} className="text-[10px] text-gray-500">{fmtF(e.oldAmount)} → {fmtF(e.newAmount)} ({e.editedBy} — {new Date(e.editedAt).toLocaleDateString("fr-FR")})</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
