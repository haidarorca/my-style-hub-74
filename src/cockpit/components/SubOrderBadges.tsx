// ═══════════════════════════════════════════════════════════════
// SubOrderBadges — Cluster de badges métier (lecture seule).
//   - Boutique supprimée
//   - Produit supprimé
//   - Action attendue (awaits_*)
//   - Niveau de risque
//
// Compact (cartes pipeline) ou normal (carte liste, drawer).
// ═══════════════════════════════════════════════════════════════

import { AlertTriangle, Ban, ShieldAlert, Clock, Store } from "lucide-react";
import {
  AWAITS_LABELS,
  type AwaitsParty,
  type RiskLevel,
  type RiskAssessment,
} from "@/cockpit/lib/events";
import type { SubOrderHistory } from "@/cockpit/hooks/useSubOrderHistories";

interface Props {
  history?: SubOrderHistory;
  compact?: boolean;
}

const RISK_TONE: Record<RiskLevel, string> = {
  none: "",
  low: "bg-amber-100 text-amber-800 border-amber-200",
  medium: "bg-orange-100 text-orange-800 border-orange-200",
  high: "bg-red-100 text-red-800 border-red-300",
  critical: "bg-red-600 text-white border-red-700",
};

const RISK_LABEL: Record<RiskLevel, string> = {
  none: "OK",
  low: "Risque faible",
  medium: "Risque moyen",
  high: "Risque élevé",
  critical: "Critique",
};

const AWAITS_TONE: Partial<Record<AwaitsParty, string>> = {
  awaits_admin: "bg-blue-100 text-blue-800",
  awaits_vendor: "bg-purple-100 text-purple-800",
  awaits_supplier: "bg-indigo-100 text-indigo-800",
  awaits_client: "bg-amber-100 text-amber-800",
  awaits_carrier: "bg-cyan-100 text-cyan-800",
};

export function SubOrderBadges({ history, compact = false }: Props) {
  if (!history) return null;
  const { events, risk, awaits } = history;
  const shopDeleted = events.some((e) => e.event_type === "shop_deleted");
  const productDeleted = events.some((e) => e.event_type === "product_deleted");

  // Rien à afficher
  const interestingAwaits = [...awaits].filter((a) => a !== "awaits_nothing");
  if (!shopDeleted && !productDeleted && interestingAwaits.length === 0 && risk.level === "none") {
    return null;
  }

  const size = compact ? "text-[8px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5";
  const icon = compact ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "mt-1"}`}>
      {shopDeleted && (
        <span
          title="La boutique a été supprimée alors qu'une sous-commande était ouverte."
          className={`${size} font-bold rounded inline-flex items-center gap-0.5 bg-gray-800 text-white`}
        >
          <Store className={icon} />
          {compact ? "B.supp." : "Boutique supprimée"}
        </span>
      )}
      {productDeleted && (
        <span
          title="Au moins un produit de cette sous-commande a été supprimé."
          className={`${size} font-bold rounded inline-flex items-center gap-0.5 bg-gray-700 text-white`}
        >
          <Ban className={icon} />
          {compact ? "P.supp." : "Produit supprimé"}
        </span>
      )}
      {risk.level !== "none" && (
        <RiskBadge risk={risk} compact={compact} />
      )}
      {interestingAwaits.map((a) => (
        <span
          key={a}
          title={AWAITS_LABELS[a]}
          className={`${size} font-semibold rounded inline-flex items-center gap-0.5 ${AWAITS_TONE[a] ?? "bg-gray-100 text-gray-700"}`}
        >
          <Clock className={icon} />
          {compact ? short(a) : AWAITS_LABELS[a]}
        </span>
      ))}
    </div>
  );
}

function short(a: AwaitsParty): string {
  switch (a) {
    case "awaits_admin": return "Kawzone";
    case "awaits_vendor": return "Vendeur";
    case "awaits_supplier": return "Fourn.";
    case "awaits_client": return "Client";
    case "awaits_carrier": return "Transp.";
    default: return "";
  }
}

function RiskBadge({ risk, compact }: { risk: RiskAssessment; compact: boolean }) {
  const size = compact ? "text-[8px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5";
  const icon = compact ? "h-2.5 w-2.5" : "h-3 w-3";
  const title =
    `${RISK_LABEL[risk.level]} (score ${risk.score})` +
    (risk.reasons.length ? `\nMotifs : ${risk.reasons.join(", ")}` : "");
  return (
    <span
      title={title}
      className={`${size} font-bold rounded inline-flex items-center gap-0.5 border ${RISK_TONE[risk.level]}`}
    >
      {risk.level === "critical" || risk.level === "high" ? (
        <AlertTriangle className={icon} />
      ) : (
        <ShieldAlert className={icon} />
      )}
      {RISK_LABEL[risk.level]}
    </span>
  );
}
