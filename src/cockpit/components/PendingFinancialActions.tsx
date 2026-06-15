// ═══════════════════════════════════════════════════════════════
// PendingFinancialActions — Lève les pending financiers v3
// Aucun mouvement automatique : chaque action est validée par l'admin.
// ═══════════════════════════════════════════════════════════════

import { useState } from "react";
import { Wallet, RefreshCw, Repeat, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtF, PAYMENT_METHOD_LABELS } from "@/cockpit/lib/workflow";
import {
  getArticleFinancialStatus, getExpectedSettlementAmount,
} from "@/cockpit/lib/article-states";
import type { OrderArticle } from "@/cockpit/lib/article-states";

export interface SettlementInput {
  kind: "refund" | "credit" | "extra_payment";
  amount: number;
  method?: string;
  reference?: string;
  note?: string;
}

interface Props {
  articles: OrderArticle[];
  /** Reste à payer global de la commande (pour autoriser la validation du complément). */
  remainingToPay: number;
  /** Persiste un settlement sur l'article (lève le pending). */
  onSettle: (productId: string, data: SettlementInput) => void;
}

type PendingKind = "refund_pending" | "credit_pending" | "extra_payment_pending";

interface Row {
  article: OrderArticle;
  kind: PendingKind;
  amount: number;
}

const METHODS = ["wave", "orange_money", "cash", "bank_transfer", "other"] as const;

export function PendingFinancialActions({ articles, remainingToPay, onSettle }: Props) {
  const [editing, setEditing] = useState<{ productId: string; kind: PendingKind } | null>(null);

  const rows: Row[] = [];
  for (const a of articles) {
    const fs = getArticleFinancialStatus(a);
    if (fs === "refund_pending" || fs === "credit_pending" || fs === "extra_payment_pending") {
      rows.push({ article: a, kind: fs, amount: getExpectedSettlementAmount(a) });
    }
  }
  if (rows.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
      <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
        <Wallet className="h-4 w-4" />
        Actions financières en attente ({rows.length})
      </h3>
      <p className="text-[11px] text-amber-700">
        Bloque le passage à <strong>livrée</strong>. Chaque action doit être validée explicitement.
      </p>
      <div className="space-y-2">
        {rows.map((r) => {
          const isOpen = editing?.productId === r.article.product_id && editing.kind === r.kind;
          return (
            <div key={r.article.product_id + r.kind} className="bg-white rounded-lg border border-amber-200">
              <RowHeader row={r} />
              {!isOpen ? (
                <div className="px-3 pb-3">
                  <ActionButton
                    row={r}
                    remainingToPay={remainingToPay}
                    onClick={() => setEditing({ productId: r.article.product_id, kind: r.kind })}
                  />
                </div>
              ) : (
                <SettlementForm
                  row={r}
                  remainingToPay={remainingToPay}
                  onCancel={() => setEditing(null)}
                  onConfirm={(data) => { onSettle(r.article.product_id, data); setEditing(null); }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowHeader({ row }: { row: Row }) {
  const { article, kind, amount } = row;
  const Icon = kind === "refund_pending" ? Wallet : kind === "credit_pending" ? RefreshCw : Repeat;
  const label =
    kind === "refund_pending" ? "Remboursement à enregistrer"
    : kind === "credit_pending" ? "Avoir à émettre"
    : "Complément à encaisser";
  const tone =
    kind === "refund_pending" ? "text-rose-700"
    : kind === "credit_pending" ? "text-amber-700"
    : "text-indigo-700";
  return (
    <div className="px-3 pt-3 pb-2 flex items-start gap-2">
      <Icon className={`h-4 w-4 mt-0.5 ${tone}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-bold ${tone}`}>{label}</div>
        <div className="text-[11px] text-gray-700 truncate">{article.product_name}</div>
        <div className="text-[11px] text-gray-500">Montant attendu : <strong className="text-gray-800">{fmtF(amount)}</strong></div>
      </div>
    </div>
  );
}

function ActionButton({ row, remainingToPay, onClick }: { row: Row; remainingToPay: number; onClick: () => void }) {
  if (row.kind === "extra_payment_pending") {
    const covered = remainingToPay <= 0;
    return (
      <Button
        size="sm"
        disabled={!covered}
        onClick={onClick}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
      >
        <CheckCircle2 className="h-4 w-4 mr-1.5" />
        {covered ? "Valider le complément reçu" : `En attente de paiement (${fmtF(remainingToPay)} restant)`}
      </Button>
    );
  }
  if (row.kind === "refund_pending") {
    return (
      <Button size="sm" onClick={onClick} className="w-full bg-rose-600 hover:bg-rose-700">
        <CheckCircle2 className="h-4 w-4 mr-1.5" />
        Enregistrer le remboursement
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={onClick} className="w-full bg-amber-600 hover:bg-amber-700">
      <CheckCircle2 className="h-4 w-4 mr-1.5" />
      Émettre l'avoir
    </Button>
  );
}

function SettlementForm({
  row, remainingToPay, onCancel, onConfirm,
}: {
  row: Row;
  remainingToPay: number;
  onCancel: () => void;
  onConfirm: (data: SettlementInput) => void;
}) {
  const { kind, amount } = row;
  const [amt, setAmt] = useState<string>(String(amount));
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const amountNum = parseFloat(amt) || 0;
  const isExtra = kind === "extra_payment_pending";
  const isCredit = kind === "credit_pending";
  const valid = amountNum > 0 && (!isCredit || reference.trim().length > 0) && (isCredit || method.length > 0);

  const submit = () => {
    if (!valid) return;
    const sKind: SettlementInput["kind"] = isCredit ? "credit" : isExtra ? "extra_payment" : "refund";
    onConfirm({
      kind: sKind,
      amount: amountNum,
      method: isCredit ? undefined : method,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="px-3 pb-3 space-y-2 border-t border-amber-100 pt-2">
      {isExtra && remainingToPay > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded p-2 text-[11px] text-rose-800">
          Reste à payer sur la commande : <strong>{fmtF(remainingToPay)}</strong>. Enregistre d'abord le paiement, puis reviens ici pour valider.
        </div>
      )}
      <div>
        <label className="text-[11px] font-semibold text-gray-700 block mb-1">Montant (FCFA)</label>
        <input
          type="number" inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value)}
          className="w-full h-10 border rounded-lg px-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
        />
      </div>
      {!isCredit && (
        <div>
          <label className="text-[11px] font-semibold text-gray-700 block mb-1">Moyen</label>
          <select
            value={method} onChange={e => setMethod(e.target.value)}
            className="w-full h-10 border rounded-lg px-2 text-sm bg-white"
          >
            {METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] ?? m}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="text-[11px] font-semibold text-gray-700 block mb-1">
          Référence {isCredit && <span className="text-rose-600">*</span>}
        </label>
        <input
          value={reference} onChange={e => setReference(e.target.value)}
          placeholder={isCredit ? "Ex: AV-2026-0042" : "Ex: TXN-123"}
          className="w-full h-10 border rounded-lg px-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-gray-700 block mb-1">Note (optionnel)</label>
        <input
          value={note} onChange={e => setNote(e.target.value)}
          className="w-full h-10 border rounded-lg px-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">
          <X className="h-4 w-4 mr-1" />Annuler
        </Button>
        <Button size="sm" onClick={submit} disabled={!valid} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 className="h-4 w-4 mr-1" />Valider
        </Button>
      </div>
    </div>
  );
}
