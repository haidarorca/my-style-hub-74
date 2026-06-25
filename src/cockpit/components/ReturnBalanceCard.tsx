// ============================================================
// ReturnBalanceCard — KawZone Cockpit
// Carte de balance financiere d'un dossier retour
// Affiche tous les calculs automatiques : paye, frais,
// rembourse, restant, perdu
// ============================================================

import { ArrowDownLeft, ArrowUpRight, Minus, AlertTriangle, Wallet, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export interface ReturnBalanceData {
  totalPaid: number;
  totalFees: number;
  totalRefunded: number;
  totalCreditNotes: number;
  totalRemaining: number;
  totalLost: number;
  netPosition: number;
  feesCurrency: string;
  feesBreakdown: Record<string, { amount: number; currency: string; payer: string }>;
}

interface ReturnBalanceCardProps {
  balance: ReturnBalanceData;
  loading?: boolean;
}

function formatAmount(amount: number, currency: string = "XOF"): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

function AmountRow({
  label,
  amount,
  currency,
  type = "neutral",
  icon: Icon,
}: {
  label: string;
  amount: number;
  currency: string;
  type?: "positive" | "negative" | "neutral";
  icon?: typeof Wallet;
}) {
  const colorClass =
    type === "positive" ? "text-green-600" :
    type === "negative" ? "text-red-600" :
    "text-foreground";

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>
        {formatAmount(amount, currency)}
      </span>
    </div>
  );
}

export function ReturnBalanceCard({ balance, loading }: ReturnBalanceCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Balance financière
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 bg-muted rounded animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const isPositive = balance.netPosition >= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Balance financière
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Montant paye initialement */}
        <AmountRow
          label="Montant payé (commande)"
          amount={balance.totalPaid}
          currency={balance.feesCurrency}
          icon={ArrowDownLeft}
        />

        <Separator />

        {/* Frais */}
        <AmountRow
          label="Total des frais retour"
          amount={balance.totalFees}
          currency={balance.feesCurrency}
          type="negative"
          icon={TrendingDown}
        />

        {/* Detail des frais */}
        {Object.entries(balance.feesBreakdown).length > 0 && (
          <div className="ml-5 space-y-0.5">
            {Object.entries(balance.feesBreakdown).map(([kind, fee]) => (
              <div key={kind} className="flex items-center justify-between py-0.5">
                <span className="text-[10px] text-muted-foreground capitalize">
                  {kind.replace(/_/g, " ")} ({fee.payer})
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {formatAmount(fee.amount, fee.currency)}
                </span>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Remboursements */}
        <AmountRow
          label="Remboursé au client"
          amount={balance.totalRefunded}
          currency={balance.feesCurrency}
          type="negative"
          icon={ArrowUpRight}
        />

        {balance.totalCreditNotes > 0 && (
          <AmountRow
            label="Avoirs / Credit notes"
            amount={balance.totalCreditNotes}
            currency={balance.feesCurrency}
            type="positive"
            icon={Wallet}
          />
        )}

        <Separator />

        {/* Restant */}
        <AmountRow
          label="Restant dû"
          amount={balance.totalRemaining}
          currency={balance.feesCurrency}
          type={balance.totalRemaining > 0 ? "negative" : "neutral"}
          icon={Minus}
        />

        {/* Pertes */}
        {balance.totalLost > 0 && (
          <AmountRow
            label="Pertes définitives"
            amount={balance.totalLost}
            currency={balance.feesCurrency}
            type="negative"
            icon={AlertTriangle}
          />
        )}

        <Separator />

        {/* Position nette */}
        <div className={`flex items-center justify-between py-2 rounded-lg px-2 ${isPositive ? "bg-green-50" : "bg-red-50"}`}>
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span className={`text-xs font-semibold ${isPositive ? "text-green-700" : "text-red-700"}`}>
              Position nette
            </span>
          </div>
          <span className={`text-sm font-bold tabular-nums ${isPositive ? "text-green-700" : "text-red-700"}`}>
            {formatAmount(balance.netPosition, balance.feesCurrency)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
