// ═══════════════════════════════════════════════════════════════
// ReturnBalanceCard — KawZone Cockpit
// Carte de balance financière d'un dossier retour
// Source : v_case_balances (vue SQL)
// ═══════════════════════════════════════════════════════════════

import { TrendingDown, TrendingUp, Wallet, Receipt, CreditCard, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CaseBalance } from "@/lib/return-management.functions";

interface ReturnBalanceCardProps {
  balance: CaseBalance | null;
  className?: string;
}

/**
 * Formate un montant en FCFA (XOF)
 */
function formatXOF(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function ReturnBalanceCard({ balance, className }: ReturnBalanceCardProps) {
  if (!balance) {
    return (
      <div className={cn("rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm", className)}>
        Aucune donnée financière disponible
      </div>
    );
  }

  const isProfitable = balance.net_position >= 0;
  const hasLoss = balance.total_lost > 0;
  const isSettled = balance.balance_status === "settled";

  return (
    <div className={cn("rounded-lg border bg-card shadow-sm", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Balance financière</h3>
        </div>
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            isSettled && "bg-green-100 text-green-700",
            balance.balance_status === "open" && "bg-amber-100 text-amber-700",
            balance.balance_status === "pending_closure" && "bg-blue-100 text-blue-700",
          )}
        >
          {isSettled ? "Réglé" : balance.balance_status === "open" ? "En cours" : "Attente clôture"}
        </span>
      </div>

      {/* Montants */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* Montant payé */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Receipt className="h-3 w-3" />
            Payé par le client
          </p>
          <p className="text-base font-bold">{formatXOF(balance.total_paid)}</p>
        </div>

        {/* Remboursé */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CreditCard className="h-3 w-3" />
            Remboursé
          </p>
          <p className="text-base font-semibold text-amber-600">{formatXOF(balance.total_refunded)}</p>
        </div>

        {/* Frais */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Frais retour</p>
          <p className="text-sm font-medium">{formatXOF(balance.total_fees)}</p>
        </div>

        {/* Reste dû */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Reste dû client</p>
          <p className={cn("text-sm font-medium", balance.total_remaining > 0 ? "text-amber-600" : "text-green-600")}>
            {formatXOF(balance.total_remaining)}
          </p>
        </div>

        {/* Crédit fournisseur */}
        {balance.total_supplier_credit > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Crédit fournisseur</p>
            <p className="text-sm font-medium text-green-600">
              {formatXOF(balance.total_supplier_credit)}
            </p>
          </div>
        )}

        {/* Pertes */}
        {hasLoss && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Pertes
            </p>
            <p className="text-sm font-medium text-red-500">{formatXOF(balance.total_lost)}</p>
          </div>
        )}
      </div>

      {/* Position nette */}
      <div className="px-4 py-3 border-t bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Position nette</span>
          <div className="flex items-center gap-1.5">
            {isProfitable ? (
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            )}
            <span
              className={cn(
                "text-sm font-bold",
                isProfitable ? "text-green-600" : "text-red-600",
              )}
            >
              {formatXOF(balance.net_position)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
